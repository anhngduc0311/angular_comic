#!/usr/bin/env python3
# -*- coding: utf-8 -*-
"""
=============================================================================
🚀 Manga Downloader (ZetTruyen & MangaDex Vietnamese Hub)
=============================================================================
Author: TruyenKomi Team
Description: Tool tải truyện siêu tốc từ ZetTruyen và MangaDex (Tiếng Việt),
             hỗ trợ tìm kiếm, duyệt danh sách, đa luồng, tự động ghép ảnh
             (Image Stitching), xuất PDF và đồng bộ Cloud Storage / Web API.
=============================================================================
"""

import sys
import os
import re
import time
import argparse
import unicodedata
from pathlib import Path
from concurrent.futures import ThreadPoolExecutor, as_completed
import urllib.parse

# Fix console encoding for Windows
if sys.platform == 'win32':
    try:
        sys.stdout.reconfigure(encoding='utf-8')
        sys.stderr.reconfigure(encoding='utf-8')
    except Exception:
        pass

import base64
import hmac
import hashlib
import requests
from datetime import datetime, timezone
import cloudscraper
from bs4 import BeautifulSoup
from PIL import Image
Image.MAX_IMAGE_PIXELS = None

try:
    from rich.console import Console
    from rich.progress import Progress, SpinnerColumn, BarColumn, TextColumn, TimeRemainingColumn
    from rich.table import Table
    from rich.panel import Panel
    console = Console()
    HAS_RICH = True
except ImportError:
    HAS_RICH = False
    console = None

# Auto-load .env configuration
def load_env_file():
    for p in [Path(__file__).resolve().parent.parent / ".env", Path.cwd() / ".env"]:
        if p.exists():
            try:
                with open(p, "r", encoding="utf-8") as f:
                    for line in f:
                        line = line.strip()
                        if line and not line.startswith("#") and "=" in line:
                            k, v = line.split("=", 1)
                            k = k.strip()
                            v = v.strip().strip('"').strip("'")
                            if k not in os.environ:
                                os.environ[k] = v
            except Exception:
                pass
            break

load_env_file()

# Default Configuration
DEFAULT_COMIC_URL = "https://www.zettruyen1.com/truyen-tranh/phuc-thu"
MAX_WORKERS = 16  # Số luồng tải ảnh song song
TIMEOUT = 25
MAX_RETRIES = 3
AUTO_STITCH_THRESHOLD = 70  # Tự động ghép khi chapter có > 70 ảnh
STITCH_GROUP_SIZE = 5      # Ghép 5 ảnh thành 1 ảnh dài (5-in-1)

# MangaDex API Constants
MANGADEX_API_BASE = "https://api.mangadex.org"
MANGADEX_UPLOADS_BASE = "https://uploads.mangadex.org"
DEFAULT_LANG = "vi"  # Tiếng Việt

# Cloud Storage & Web API Settings
DEFAULT_API_BASE_URL = os.getenv("API_BASE_URL", "http://localhost:5000/api")
GCS_ENDPOINT = os.getenv("R2_ENDPOINT", "storage.googleapis.com")
GCS_ACCESS_KEY = os.getenv("R2_ACCESS_KEY", "GOOGQHRXVRS7YCR24JBLB33S")
GCS_SECRET_KEY = os.getenv("R2_SECRET_KEY", "3Iamo8whmuUeT2B+CMtRnfW6qdIsmwXVec47tF52")
GCS_BUCKET = os.getenv("R2_BUCKET_NAME", "truyenkomi")
CDN_BASE_URL = os.getenv("R2_CDN_BASE_URL", "https://img.truyenkomi.site").rstrip("/")


def slugify(text: str) -> str:
    """Tạo slug chuẩn SEO từ chuỗi tiếng Việt hoặc quốc tế"""
    if not text:
        return "comic"
    text = text.replace('đ', 'd').replace('Đ', 'D')
    text = unicodedata.normalize('NFKD', text)
    text = re.sub(r'[\u0300-\u036f]', '', text)
    text = re.sub(r'[^\w\s-]', '', text).strip().lower()
    text = re.sub(r'[-\s]+', '-', text)
    return text.strip("-") or "comic"


def upload_file_to_cloud(local_path: Path, object_name: str, content_type: str = "image/webp") -> str:
    """Tải 1 file lên Cloud Storage (Google Cloud Storage / Cloudflare R2 S3-compatible) và trả về URL CDN"""
    object_name = object_name.lstrip("/")
    date_str = datetime.now(timezone.utc).strftime('%a, %d %b %Y %H:%M:%S GMT')
    string_to_sign = f'PUT\n\n{content_type}\n{date_str}\n/{GCS_BUCKET}/{object_name}'
    signature = hmac.new(GCS_SECRET_KEY.encode('utf-8'), string_to_sign.encode('utf-8'), hashlib.sha1).digest()
    sig_b64 = base64.b64encode(signature).decode('utf-8')
    auth_header = f'AWS {GCS_ACCESS_KEY}:{sig_b64}'

    url = f'https://{GCS_ENDPOINT}/{GCS_BUCKET}/{object_name}'
    headers = {
        'Date': date_str,
        'Content-Type': content_type,
        'Authorization': auth_header
    }

    with open(local_path, "rb") as f:
        data = f.read()

    res = requests.put(url, data=data, headers=headers, timeout=30)
    if res.status_code in (200, 201, 204):
        return f"{CDN_BASE_URL}/{object_name}"
    else:
        raise Exception(f"Upload failed HTTP {res.status_code}: {res.text[:100]}")


def parse_date_to_iso(date_val):
    """Chuyển đổi các định dạng ngày thành chuẩn ISO 8601"""
    if not date_val:
        return None
    if isinstance(date_val, datetime):
        return date_val.isoformat()
    val_str = str(date_val).strip()
    try:
        clean_str = val_str.replace("Z", "+00:00")
        return datetime.fromisoformat(clean_str).isoformat()
    except Exception:
        pass
    for fmt in ("%d/%m/%Y", "%d-%m-%Y", "%Y-%m-%d", "%d/%m/%Y %H:%M:%S", "%d/%m/%Y %H:%M"):
        try:
            return datetime.strptime(val_str, fmt).isoformat()
        except Exception:
            pass
    return val_str


def sync_chapter_to_web_api(
    api_base_url: str, 
    comic_title: str, 
    comic_slug: str, 
    cover_cdn_url: str, 
    chapter_num: float, 
    chapter_title: str, 
    image_urls: list, 
    author: str = None, 
    translator_group: str = None, 
    other_names: str = None, 
    age_limit: str = None,
    views: int = 0,
    published_at: str = None,
    created_at: str = None,
    comic_views: int = None,
    comic_created_at: str = None,
    comic_updated_at: str = None,
    categories: list = None
) -> bool:
    """Đồng bộ truyện và chapter lên TruyenKomi Web API"""
    params = {
        "comicTitle": comic_title,
        "comicSlug": comic_slug,
        "coverImage": cover_cdn_url
    }
    if author: 
        if "zettruyen" in author.lower() or "zet truyen" in author.lower():
            author = "TRUYENKOMI"
        params["author"] = author
    if translator_group: params["translatorGroup"] = translator_group
    if other_names: params["otherNames"] = other_names
    if age_limit: params["ageLimit"] = age_limit
    if comic_views is not None and comic_views > 0: params["comicViews"] = str(comic_views)
    if comic_created_at: params["comicCreatedAt"] = parse_date_to_iso(comic_created_at)
    if comic_updated_at: params["comicUpdatedAt"] = parse_date_to_iso(comic_updated_at)
    if categories:
        if isinstance(categories, (list, tuple, set)):
            params["categories"] = ",".join(str(c) for c in categories if c)
        else:
            params["categories"] = str(categories)

    query_str = urllib.parse.urlencode(params)
    url = f"{api_base_url.rstrip('/')}/comics/import-scraped?{query_str}"
    payload = {
        "comicId": 0,
        "chapterNumber": chapter_num,
        "title": chapter_title or f"Chương {chapter_num}",
        "isPublic": True,
        "views": views or 0,
        "publishedAt": published_at,
        "createdAt": created_at or published_at,
        "imageUrls": image_urls
    }
    headers = {
        "User-Agent": "Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/121.0.0.0 Safari/537.36",
        "Content-Type": "application/json"
    }
    try:
        res = requests.post(url, json=payload, headers=headers, timeout=20)
        if res.status_code not in (200, 201):
            print(f"Sync API status {res.status_code}: {res.text}")
        return res.status_code in (200, 201)
    except Exception as e:
        print(f"Sync API error: {e}")
        return False


class BaseMangaDownloader:
    """Lớp cơ sở chia sẻ logic tải ảnh đa luồng, ghép ảnh, tạo PDF và upload Cloud"""
    def __init__(self, output_dir="downloads", merge_slices=False, make_pdf=False, upload_to_web=False, api_base_url=DEFAULT_API_BASE_URL):
        self.output_dir = Path(output_dir)
        self.merge_slices = merge_slices
        self.make_pdf = make_pdf
        self.upload_to_web = upload_to_web
        self.api_base_url = api_base_url
        self.cover_cdn_url = None
        self.comic_title = ""
        self.slug = ""
        self.author = "Đang cập nhật"
        self.translator_group = "Đang cập nhật"
        self.other_names = "Đang cập nhật"
        self.age_limit = "13+"
        self.views = 0
        self.created_date_str = None
        self.updated_date_str = None
        self.genres = []
        self.http_session = requests.Session()
        self.http_session.headers.update({
            "User-Agent": "TruyenKomi-Downloader/1.0 (https://truyenkomi.site)"
        })

    def _sanitize_name(self, name: str) -> str:
        name = re.sub(r'[\\/*?:"<>|]', "", name)
        name = re.sub(r'\s+', "_", name.strip())
        return name

    def _download_single_image(self, img_url: str, save_path: Path, referer: str = None) -> bool:
        """Tải 1 ảnh với retry tự động"""
        if save_path.exists() and save_path.stat().st_size > 1000:
            return True

        headers = {}
        if referer:
            headers["Referer"] = referer

        for attempt in range(MAX_RETRIES):
            try:
                res = self.http_session.get(img_url, headers=headers, timeout=TIMEOUT)
                if res.status_code == 200 and len(res.content) > 500:
                    with open(save_path, "wb") as f:
                        f.write(res.content)
                    return True
            except Exception:
                time.sleep(1)
        return False

    def _merge_images_vertical(self, image_paths: list, output_dir: Path, group_size: int = STITCH_GROUP_SIZE):
        """Ghép các dải ảnh manhwa thành ảnh dài hoàn chỉnh xuất trực tiếp vào output_dir (5-in-1 WebP)"""
        if not image_paths:
            return []

        merged_files = []
        for group_idx, i in enumerate(range(0, len(image_paths), group_size), 1):
            group = image_paths[i:i + group_size]
            loaded_imgs = []
            try:
                for p in group:
                    p_obj = Path(p)
                    if not p_obj.exists() or p_obj.stat().st_size < 100:
                        continue
                    with Image.open(p_obj) as raw_img:
                        raw_img.load()
                        if raw_img.mode != 'RGB':
                            im = raw_img.convert('RGB')
                        else:
                            im = raw_img.copy()
                        loaded_imgs.append(im)

                if not loaded_imgs:
                    continue

                max_width = max(im.width for im in loaded_imgs)
                resized_imgs = []
                total_height = 0
                for im in loaded_imgs:
                    if im.width != max_width:
                        new_h = max(1, int(im.height * (max_width / im.width)))
                        im_resized = im.resize((max_width, new_h), Image.Resampling.LANCZOS)
                        resized_imgs.append(im_resized)
                        total_height += new_h
                    else:
                        resized_imgs.append(im)
                        total_height += im.height

                combined = Image.new('RGB', (max_width, total_height), (255, 255, 255))
                curr_y = 0
                for im in resized_imgs:
                    combined.paste(im, (0, curr_y))
                    curr_y += im.height

                chunk_file = output_dir / f"page_{group_idx:03d}.webp"
                combined.save(chunk_file, 'WEBP', quality=90, method=6)
                merged_files.append(chunk_file)

                # Dọn dẹp bộ nhớ an toàn
                for im in loaded_imgs:
                    try:
                        im.close()
                    except Exception:
                        pass
                for im in resized_imgs:
                    if im not in loaded_imgs:
                        try:
                            im.close()
                        except Exception:
                            pass
                try:
                    combined.close()
                except Exception:
                    pass
            except Exception as e:
                if HAS_RICH and console:
                    console.print(f"[yellow]  ⚠️ Lỗi khi ghép nhóm ảnh {group_idx}: {e}[/yellow]")
                else:
                    print(f"  ⚠️ Lỗi khi ghép nhóm ảnh {group_idx}: {e}")

        return merged_files

    def _export_pdf(self, image_paths: list, pdf_path: Path):
        """Xuất chapter thành file PDF"""
        valid_images = []
        for p in image_paths:
            try:
                p_obj = Path(p)
                if not p_obj.exists() or p_obj.stat().st_size < 100:
                    continue
                with Image.open(p_obj) as raw_img:
                    raw_img.load()
                    if raw_img.mode != 'RGB':
                        im = raw_img.convert('RGB')
                    else:
                        im = raw_img.copy()
                    valid_images.append(im)
            except Exception:
                pass

        if valid_images:
            try:
                first = valid_images[0]
                rest = valid_images[1:]
                first.save(pdf_path, "PDF", resolution=100.0, save_all=True, append_images=rest)
                return True
            finally:
                for im in valid_images:
                    try:
                        im.close()
                    except Exception:
                        pass
        return False

    def get_comic_info(self) -> dict:
        raise NotImplementedError

    def get_chapter_images(self, chapter_info_or_url) -> list:
        raise NotImplementedError

    def download_chapter(self, chapter: dict, comic_dir: Path = None, progress=None, task_id=None, preloaded_images=None):
        """Tải toàn bộ ảnh của 1 chapter theo chuẩn lưu trữ bucket: chapters/{slug}/chap{num}/page_{idx:03d}.webp"""
        chap_num = chapter["number"]
        chap_url = chapter.get("url", "")
        chap_num_str = f"{int(chap_num)}" if isinstance(chap_num, (int, float)) and float(chap_num).is_integer() else f"{chap_num}"
        
        # Cấu trúc lưu chuẩn: {output_dir}/chapters/{slug}/chap{chap_num_str}/
        chap_dir = self.output_dir / "chapters" / self.slug / f"chap{chap_num_str}"
        chap_dir.mkdir(parents=True, exist_ok=True)

        images = preloaded_images if preloaded_images is not None else self.get_chapter_images(chapter)
        if not images:
            return {"chapter": chap_num, "status": "no_images", "count": 0}

        num_raw = len(images)
        should_stitch = self.merge_slices or (num_raw > AUTO_STITCH_THRESHOLD)

        if should_stitch:
            temp_dir = chap_dir / "_temp_slices"
            temp_dir.mkdir(parents=True, exist_ok=True)
            download_dir = temp_dir
        else:
            download_dir = chap_dir

        downloaded_paths = []
        with ThreadPoolExecutor(max_workers=MAX_WORKERS) as executor:
            future_to_img = {}
            for idx, img_url in enumerate(images):
                ext = img_url.split(".")[-1].split("?")[0].lower()
                if ext not in ("jpg", "jpeg", "png", "webp"):
                    ext = "jpg"
                save_file = download_dir / f"page_raw_{idx+1:04d}.{ext}" if should_stitch else download_dir / f"page_{idx+1:03d}.{ext}"
                downloaded_paths.append(save_file)
                f = executor.submit(self._download_single_image, img_url, save_file, chap_url)
                future_to_img[f] = save_file

            for f in as_completed(future_to_img):
                f.result()
                if progress and task_id:
                    progress.advance(task_id, 1)

        downloaded_paths = [p for p in downloaded_paths if p.exists()]
        num_downloaded = len(downloaded_paths)

        final_paths = []
        if should_stitch:
            reason = f"Chapter có {num_downloaded} lát cắt (> {AUTO_STITCH_THRESHOLD})" if num_downloaded > AUTO_STITCH_THRESHOLD else "Đã bật tùy chọn ghép ảnh (--merge)"
            if HAS_RICH and console:
                console.print(f"[cyan]  🧩 {reason} ➜ Đang ghép trực tiếp {STITCH_GROUP_SIZE} in 1 (WebP)...[/cyan]")
            else:
                print(f"  🧩 {reason} ➜ Đang ghép trực tiếp {STITCH_GROUP_SIZE} in 1 (WebP)...")

            final_paths = self._merge_images_vertical(downloaded_paths, chap_dir, group_size=STITCH_GROUP_SIZE)
            
            for p in downloaded_paths:
                try:
                    p.unlink(missing_ok=True)
                except Exception:
                    pass
            try:
                temp_dir.rmdir()
            except Exception:
                pass

            if HAS_RICH and console:
                console.print(f"[green]  ✓ Đã xuất {len(final_paths)} trang ảnh WebP hoàn chỉnh vào chapters/{self.slug}/chap{chap_num_str}/[/green]")
            else:
                print(f"  ✓ Đã xuất {len(final_paths)} trang ảnh WebP hoàn chỉnh vào chapters/{self.slug}/chap{chap_num_str}/")
        else:
            final_paths = []
            for idx, p in enumerate(downloaded_paths, 1):
                webp_path = chap_dir / f"page_{idx:03d}.webp"
                try:
                    with Image.open(p) as raw_im:
                        raw_im.load()
                        if raw_im.mode != 'RGB':
                            im = raw_im.convert('RGB')
                        else:
                            im = raw_im
                        im.save(webp_path, 'WEBP', quality=90, method=6)
                    final_paths.append(webp_path)
                    if p != webp_path and p.exists():
                        p.unlink(missing_ok=True)
                except Exception:
                    final_paths.append(p)

        if self.make_pdf:
            pdf_file = chap_dir / f"chap{chap_num_str}.pdf"
            self._export_pdf(final_paths, pdf_file)

        if self.upload_to_web and final_paths:
            if HAS_RICH and console:
                console.print(f"[bold cyan]  ☁️ Đang tải {len(final_paths)} trang WebP lên Cloud Storage & đồng bộ Web...[/bold cyan]")
            else:
                print(f"  ☁️ Đang tải {len(final_paths)} trang WebP lên Cloud Storage & đồng bộ Web...")

            uploaded_cdn_urls = [None] * len(final_paths)
            with ThreadPoolExecutor(max_workers=MAX_WORKERS) as executor:
                future_to_idx = {}
                for idx, p in enumerate(final_paths):
                    obj_name = f"chapters/{self.slug}/chap{chap_num_str}/page_{idx+1:03d}.webp"
                    f = executor.submit(upload_file_to_cloud, p, obj_name, "image/webp")
                    future_to_idx[f] = idx

                for f in as_completed(future_to_idx):
                    idx = future_to_idx[f]
                    try:
                        uploaded_cdn_urls[idx] = f.result()
                    except Exception as e:
                        if HAS_RICH and console:
                            console.print(f"[yellow]    ⚠️ Lỗi upload trang {idx+1}: {e}[/yellow]")
                        else:
                            print(f"    ⚠️ Lỗi upload trang {idx+1}: {e}")

            valid_cdn_urls = [u for u in uploaded_cdn_urls if u]
            if valid_cdn_urls:
                synced = sync_chapter_to_web_api(
                    api_base_url=self.api_base_url,
                    comic_title=self.comic_title or self.slug.replace("-", " ").title(),
                    comic_slug=self.slug,
                    cover_cdn_url=self.cover_cdn_url or (valid_cdn_urls[0] if valid_cdn_urls else ""),
                    chapter_num=chap_num,
                    chapter_title=chapter.get("title", f"Chương {chap_num_str}"),
                    image_urls=valid_cdn_urls,
                    author=self.author,
                    translator_group=chapter.get("scanlation_group") or self.translator_group,
                    other_names=self.other_names,
                    age_limit=self.age_limit,
                    views=chapter.get("views", 0),
                    published_at=chapter.get("updated_at"),
                    created_at=chapter.get("updated_at"),
                    comic_views=self.views,
                    comic_created_at=self.created_date_str,
                    comic_updated_at=self.updated_date_str,
                    categories=getattr(self, 'genres', [])
                )
                if synced:
                    if HAS_RICH and console:
                        console.print(f"[bold green]  🌐 Đã đưa Chapter {chap_num_str} lên Website thành công! ({len(valid_cdn_urls)} trang ảnh WebP)[/bold green]")
                    else:
                        print(f"  🌐 Đã đưa Chapter {chap_num_str} lên Website thành công! ({len(valid_cdn_urls)} trang ảnh WebP)")
                else:
                    if HAS_RICH and console:
                        console.print(f"[yellow]  ⚠️ Đã upload Cloud xong ({len(valid_cdn_urls)} ảnh WebP), chưa kết nối được Web API ({self.api_base_url})[/yellow]")
                    else:
                        print(f"  ⚠️ Đã upload Cloud xong ({len(valid_cdn_urls)} ảnh WebP), chưa kết nối được Web API ({self.api_base_url})")

        return {"chapter": chap_num, "status": "success", "count": len(final_paths)}

    def run(self, start_chap=None, end_chap=None, specific_chap=None):
        """Khởi chạy quá trình tải truyện"""
        info = self.get_comic_info()
        title = info["title"]
        chapters = info["chapters"]
        self.comic_title = title

        # Cấu trúc lưu chuẩn theo bucket: covers/{slug}.webp và chapters/{slug}/chap{num}/page_{idx:03d}.webp
        covers_dir = self.output_dir / "covers"
        covers_dir.mkdir(parents=True, exist_ok=True)
        chapters_root_dir = self.output_dir / "chapters" / self.slug
        chapters_root_dir.mkdir(parents=True, exist_ok=True)

        target_chaps = chapters
        if specific_chap is not None:
            target_chaps = [c for c in chapters if c["number"] == float(specific_chap)]
        elif start_chap is not None:
            target_chaps = [c for c in chapters if c["number"] >= float(start_chap)]
            if end_chap is not None:
                target_chaps = [c for c in target_chaps if c["number"] <= float(end_chap)]

        if not target_chaps:
            if HAS_RICH and console:
                console.print(f"[bold red]❌ Không tìm thấy chapter nào phù hợp với yêu cầu![/bold red]")
            else:
                print("❌ Không tìm thấy chapter nào phù hợp với yêu cầu!")
            return

        if HAS_RICH and console:
            table = Table(title="📖 THÔNG TIN BỘ TRUYỆN", border_style="bright_blue")
            table.add_column("Thuộc tính", style="cyan", no_wrap=True)
            table.add_column("Giá trị", style="green")
            table.add_row("Tên truyện", title)
            table.add_row("Slug", self.slug)
            table.add_row("Nguồn", getattr(self, 'source_name', 'TruyenKomi'))
            table.add_row("Tác giả", self.author)
            table.add_row("Nhóm dịch", self.translator_group)
            table.add_row("Thể loại", ", ".join(self.genres[:5]) if self.genres else "Manga")
            table.add_row("Tổng số chapter", f"{len(chapters)} (Tải {len(target_chaps)} chương)")
            table.add_row("Thư mục lưu", str(chapters_root_dir.resolve()))
            table.add_row("Cấu trúc lưu", f"covers/{self.slug}.webp | chapters/{self.slug}/chap<num>/page_001.webp")
            table.add_row("Định dạng ảnh", "WebP (Chất lượng cao)")
            table.add_row("Đẩy lên Website", "BẬT (Cloud & Web Sync)" if self.upload_to_web else "TẮT (Chỉ lưu máy)")
            console.print(table)
            console.print()
        else:
            print(f"\n--- {title} ---")
            print(f"Slug: {self.slug}")
            print(f"Tổng số chapter: {len(chapters)} (Tải {len(target_chaps)} chương)")
            print(f"Thư mục lưu: {chapters_root_dir.resolve()}")
            print(f"Cấu trúc lưu: covers/{self.slug}.webp & chapters/{self.slug}/chap<num>/page_001.webp")
            print(f"Định dạng ảnh: WebP")
            print(f"Đẩy lên Website: {'BẬT' if self.upload_to_web else 'TẮT'}\n")

        # Tải và đưa ảnh bìa lên Cloud (WebP) chuẩn vị trí: covers/{slug}.webp
        if info.get("cover_url"):
            raw_cover_path = covers_dir / f"{self.slug}_raw.jpg"
            cover_path = covers_dir / f"{self.slug}.webp"
            self._download_single_image(info["cover_url"], raw_cover_path)
            if raw_cover_path.exists():
                try:
                    with Image.open(raw_cover_path) as im:
                        if im.mode != 'RGB':
                            im = im.convert('RGB')
                        im.save(cover_path, 'WEBP', quality=90, method=6)
                    raw_cover_path.unlink(missing_ok=True)
                except Exception:
                    cover_path = raw_cover_path

            if self.upload_to_web and cover_path.exists():
                try:
                    self.cover_cdn_url = upload_file_to_cloud(cover_path, f"covers/{self.slug}.webp", "image/webp")
                    if HAS_RICH and console:
                        console.print(f"[green]📸 Đã lưu & đưa Ảnh bìa lên Cloud: [underline]{self.cover_cdn_url}[/underline][/green]\n")
                    else:
                        print(f"📸 Đã lưu & đưa Ảnh bìa lên Cloud: {self.cover_cdn_url}\n")
                except Exception as e:
                    if HAS_RICH and console:
                        console.print(f"[yellow]⚠️ Lỗi upload ảnh bìa: {e}[/yellow]\n")
                    else:
                        print(f"⚠️ Lỗi upload ảnh bìa: {e}\n")

        total_downloaded = 0
        start_time = time.time()

        for idx, chap in enumerate(target_chaps, 1):
            chap_title = f"Chương {chap['number']}"
            if chap.get("title") and chap["title"] != chap_title:
                chap_title += f" - {chap['title']}"
            
            if HAS_RICH and console:
                console.print(f"[bold yellow]▶ [{idx}/{len(target_chaps)}] Đang tải {chap_title}...[/bold yellow]")
                
                images = self.get_chapter_images(chap)
                if images:
                    with Progress(
                        SpinnerColumn(),
                        TextColumn("[progress.description]{task.description}"),
                        BarColumn(),
                        TextColumn("[progress.percentage]{task.percentage:>3.0f}%"),
                        TextColumn("({task.completed}/{task.total} ảnh)"),
                        TimeRemainingColumn(),
                        console=console
                    ) as progress:
                        task = progress.add_task(f"[green]Tải ảnh Chương {chap['number']}[/green]", total=len(images))
                        res = self.download_chapter(chap, comic_dir, progress=progress, task_id=task, preloaded_images=images)
                        total_downloaded += res["count"]
                else:
                    console.print(f"[red]  ⚠️ Không lấy được ảnh cho {chap_title}[/red]")
            else:
                print(f"▶ [{idx}/{len(target_chaps)}] Đang tải {chap_title}...")
                res = self.download_chapter(chap, comic_dir)
                total_downloaded += res["count"]
                print(f"  ✓ Đã tải xong {res['count']} trang ảnh.")

        elapsed = time.time() - start_time
        web_link = f"http://localhost:4200/comic/{self.slug}"
        if HAS_RICH and console:
            console.print()
            panel_text = (
                f"[bold green]🎉 TẢI HOÀN TẤT THÀNH CÔNG![/bold green]\n\n"
                f"• Tổng số chương: [cyan]{len(target_chaps)}[/cyan]\n"
                f"• Tổng số trang ảnh: [cyan]{total_downloaded}[/cyan]\n"
                f"• Thời gian tải: [cyan]{elapsed:.1f}s[/cyan] (Trung bình {(total_downloaded/elapsed if elapsed > 0 else 0):.1f} ảnh/giây)\n"
                f"• Vị trí lưu máy: [bold underline]{comic_dir.resolve()}[/bold underline]"
            )
            if self.upload_to_web:
                panel_text += f"\n• Đọc truyện trên Web: [bold cyan underline]{web_link}[/bold cyan underline]"
            console.print(Panel(panel_text, title="✨ KẾT QUẢ", border_style="green"))
        else:
            print("\n" + "="*50)
            print(f"🎉 TẢI HOÀN TẤT! Đã tải {len(target_chaps)} chương ({total_downloaded} ảnh) trong {elapsed:.1f}s.")
            print(f"Thư mục lưu: {comic_dir.resolve()}")
            if self.upload_to_web:
                print(f"🌐 Đọc truyện trên Web: {web_link}")


class ZetMangaDownloader(BaseMangaDownloader):
    """Bộ tải truyện chuyên biệt cho ZetTruyen"""
    def __init__(self, comic_url=DEFAULT_COMIC_URL, output_dir="downloads", merge_slices=False, make_pdf=False, upload_to_web=False, api_base_url=DEFAULT_API_BASE_URL):
        super().__init__(output_dir=output_dir, merge_slices=merge_slices, make_pdf=make_pdf, upload_to_web=upload_to_web, api_base_url=api_base_url)
        self.source_name = "ZetTruyen"
        self.comic_url = comic_url.strip()
        self.scraper = cloudscraper.create_scraper(
            browser={
                'browser': 'chrome',
                'platform': 'windows',
                'desktop': True
            }
        )
        self.slug = self._extract_slug(self.comic_url)

    def _extract_slug(self, url: str) -> str:
        clean = url.split("?")[0].rstrip("/")
        parts = clean.split("/")
        return parts[-1] if parts else "phuc-thu"

    def get_comic_info(self):
        """Lấy thông tin truyện: Tên, Ảnh bìa, Tác giả, Nhóm dịch, Danh sách toàn bộ chapter từ ZetTruyen"""
        if HAS_RICH and console:
            console.print(f"[bold cyan]🔍 Đang phân tích dữ liệu truyện từ ZetTruyen:[/bold cyan] [underline]{self.comic_url}[/underline]")
        else:
            print(f"🔍 Đang phân tích dữ liệu truyện từ ZetTruyen: {self.comic_url}")

        res = self.scraper.get(self.comic_url, timeout=TIMEOUT)
        if res.status_code != 200:
            raise Exception(f"Không thể kết nối đến trang truyện ZetTruyen (HTTP {res.status_code})")

        soup = BeautifulSoup(res.text, "html.parser")

        title_elem = soup.find("h1")
        title = title_elem.get_text(strip=True) if title_elem else self.slug.replace("-", " ").title()
        title = re.sub(r'\s*\|\s*ZetTruyen.*', '', title, flags=re.IGNORECASE).strip()

        cover_url = None
        cover_match = re.search(r'https?://[^"\'\s<>]+zetimage[^"\'\s<>]+thumb[^"\'\s<>]+\.(?:jpg|webp|png|jpeg)', res.text, re.I)
        if cover_match:
            cover_url = cover_match.group(0)
        else:
            img = soup.find("img", src=re.compile(r"thumb|cover|poster", re.I))
            if img:
                cover_url = img.get("src") or img.get("data-src")

        grid = soup.find('div', class_=lambda c: c and 'grid-cols-1' in c and 'md:grid-cols-2' in c)
        if grid:
            for child in grid.find_all('div', recursive=False):
                txt = child.get_text(" ", strip=True)
                if txt.startswith("Tác giả"):
                    v = txt.replace("Tác giả", "").strip()
                    if v and v != "-": self.author = v
                elif txt.startswith("Nhóm dịch"):
                    v = txt.replace("Nhóm dịch", "").strip()
                    if v and v != "-": self.translator_group = v
                elif txt.startswith("Tên khác"):
                    v = txt.replace("Tên khác", "").strip()
                    if v and v != "-": self.other_names = v
                elif txt.startswith("Độ tuổi"):
                    v = txt.replace("Độ tuổi", "").strip()
                    if v and v != "-": self.age_limit = v

        page_text = soup.get_text(" ", strip=True)

        if self.author == "Đang cập nhật":
            m_auth = re.search(r'Tác giả\s*[:：]?\s*([^\n\r]+?)\s+(?:Lượt xem|Cập nhật|Nhóm dịch|Tổng số|Thể loại)', page_text)
            if m_auth: 
                self.author = m_auth.group(1).strip()
            elif 'sáng tác bởi' in page_text:
                m2 = re.search(r'sáng tác bởi\s+([^,.]+)', page_text)
                if m2: self.author = m2.group(1).strip()

        if self.translator_group == "Đang cập nhật":
            m_trans = re.search(r'Nhóm dịch\s*[:：]?\s*([^\n\r]+?)\s+(?:Tổng số chap|Ngày tạo|Tên khác|Độ tuổi|Loại|Trạng thái|Thể loại)', page_text)
            if m_trans:
                self.translator_group = m_trans.group(1).strip()
            elif 'chuyển ngữ bởi' in page_text:
                m2 = re.search(r'chuyển ngữ bởi\s+([^,.]+)', page_text)
                if m2: self.translator_group = m2.group(1).strip()
            elif 'Bản dịch từ' in page_text:
                m3 = re.search(r'Bản dịch từ\s+([^,.]+)', page_text)
                if m3: self.translator_group = m3.group(1).strip()

        if self.other_names == "Đang cập nhật":
            m_other = re.search(r'Tên khác\s*[:：]?\s*([^\n\r]+?)\s+(?:Độ tuổi|Loại|Trạng thái|Thể loại)', page_text)
            if m_other: self.other_names = m_other.group(1).strip()

        if self.age_limit == "13+":
            m_age = re.search(r'Độ tuổi\s*[:：]?\s*([^\n\r]+?)\s+(?:Loại|Trạng thái|Thể loại)', page_text)
            if m_age: self.age_limit = m_age.group(1).strip()

        for item in soup.find_all(["li", "p", "div", "span", "tr"]):
            text = item.get_text(" ", strip=True)
            if self.author == "Đang cập nhật" and ("Tác giả" in text or "Author" in text) and ":" in text:
                val = text.split(":", 1)[1].strip()
                if val and len(val) < 80: self.author = val
            elif self.translator_group == "Đang cập nhật" and ("Nhóm dịch" in text or "Translator" in text) and ":" in text:
                val = text.split(":", 1)[1].strip()
                if val and len(val) < 80: self.translator_group = val
            elif self.other_names == "Đang cập nhật" and ("Tên khác" in text or "Alternative" in text) and ":" in text:
                val = text.split(":", 1)[1].strip()
                if val and len(val) < 150: self.other_names = val
            elif self.age_limit == "13+" and ("Độ tuổi" in text or "Age" in text) and ":" in text:
                val = text.split(":", 1)[1].strip()
                if val and len(val) < 30: self.age_limit = val

        if self.author and ("zettruyen" in self.author.lower() or "zet truyen" in self.author.lower()):
            self.author = "TRUYENKOMI"

        m_view = re.search(r'Lượt xem\s*[:：]?\s*([\d,.]+)', page_text, re.I)
        if m_view:
            try:
                self.views = int(re.sub(r'[^\d]', '', m_view.group(1)))
            except Exception:
                pass

        created_date_str = None
        m_created = re.search(r'Ngày tạo\s*[:：]?\s*(\d{1,2}[/-]\d{1,2}[/-]\d{4})', page_text, re.I)
        if m_created:
            created_date_str = m_created.group(1)

        updated_date_str = None
        m_updated = re.search(r'Cập nhật\s*[:：]?\s*(\d{1,2}[/-]\d{1,2}[/-]\d{4})', page_text, re.I)
        if m_updated:
            updated_date_str = m_updated.group(1)

        for item in soup.find_all(["li", "p", "div", "span", "tr"]):
            text = item.get_text(" ", strip=True)
            if not created_date_str and "Ngày tạo" in text and ":" in text:
                m = re.search(r'(\d{1,2}[/-]\d{1,2}[/-]\d{4})', text)
                if m: created_date_str = m.group(1)
            elif not updated_date_str and "Cập nhật" in text and ":" in text:
                m = re.search(r'(\d{1,2}[/-]\d{1,2}[/-]\d{4})', text)
                if m: updated_date_str = m.group(1)

        if not created_date_str and updated_date_str:
            created_date_str = updated_date_str

        self.created_date_str = created_date_str
        self.updated_date_str = updated_date_str

        genres = []
        if title_elem:
            card = title_elem
            for _ in range(6):
                card = card.parent
                if not card: break
            for a in card.find_all('a', href=True):
                href = a.get('href', '')
                if '/the-loai/' in href and not href.endswith('/the-loai'):
                    txt = a.get_text(strip=True)
                    if txt and txt not in genres and not txt.lower().startswith('truyện tranh') and not txt.lower().startswith('đọc truyện'):
                        genres.append(txt)

        if not genres:
            for a in soup.find_all('a', href=True):
                href = a.get('href', '')
                if '/the-loai/' in href and not href.endswith('/the-loai'):
                    txt = a.get_text(strip=True)
                    if txt and txt not in genres and not txt.lower().startswith('truyện tranh') and not txt.lower().startswith('đọc truyện'):
                        genres.append(txt)

        self.genres = genres

        chapters = []
        api_url = f"https://www.zettruyen1.com/api/comics/{self.slug}/chapters?per_page=-1"
        try:
            api_res = self.scraper.get(api_url, headers={"Referer": self.comic_url}, timeout=TIMEOUT)
            if api_res.status_code == 200:
                data = api_res.json()
                chap_list = data.get("data", {}).get("chapters", [])
                for item in chap_list:
                    chap_num = float(item.get("chapter_num") or 0)
                    chap_name = item.get("chapter_name") or f"Chapter {chap_num}"
                    chap_slug = item.get("chapter_slug") or f"chapter-{int(chap_num)}"
                    chap_url = f"https://www.zettruyen1.com/truyen-tranh/{self.slug}/chuong-{int(chap_num) if chap_num.is_integer() else chap_num}"
                    chap_views = int(item.get("view") or 0)
                    chap_date_raw = item.get("updated_at") or item.get("created_at")
                    chap_date_iso = parse_date_to_iso(chap_date_raw)
                    chapters.append({
                        "number": chap_num,
                        "title": chap_name,
                        "slug": chap_slug,
                        "url": chap_url,
                        "views": chap_views,
                        "updated_at": chap_date_iso,
                        "updated_at_raw": chap_date_raw
                    })
        except Exception as e:
            if HAS_RICH and console:
                console.print(f"[yellow]⚠️ Lỗi gọi API chapters ({e}), fallback cào từ HTML...[/yellow]")

        if not chapters:
            seen_nums = set()
            for a in soup.find_all("a", href=True):
                href = a["href"]
                if f"/truyen-tranh/{self.slug}/" in href and ("chuong-" in href or "chapter-" in href):
                    m = re.search(r'(?:chuong|chapter)-([0-9.]+)', href)
                    if m:
                        num = float(m.group(1))
                        if num not in seen_nums:
                            seen_nums.add(num)
                            full_u = href if href.startswith("http") else f"https://www.zettruyen1.com{href}"
                            chapters.append({
                                "number": num,
                                "title": a.get_text(strip=True) or f"Chương {num}",
                                "slug": f"chuong-{num}",
                                "url": full_u,
                                "views": 0,
                                "updated_at": None,
                                "updated_at_raw": None
                            })

        chapters.sort(key=lambda x: x["number"])

        if self.views == 0 and chapters:
            self.views = sum(c.get("views", 0) for c in chapters)

        return {
            "title": title,
            "slug": self.slug,
            "cover_url": cover_url,
            "author": self.author,
            "translator_group": self.translator_group,
            "other_names": self.other_names,
            "age_limit": self.age_limit,
            "views": self.views,
            "genres": self.genres,
            "categories": self.genres,
            "created_date_str": self.created_date_str,
            "updated_date_str": self.updated_date_str,
            "created_at_iso": parse_date_to_iso(self.created_date_str),
            "updated_at_iso": parse_date_to_iso(self.updated_date_str),
            "chapters": chapters
        }

    def get_chapter_images(self, chapter_info_or_url):
        """Lấy danh sách ảnh của chapter từ ZetTruyen"""
        chapter_url = chapter_info_or_url if isinstance(chapter_info_or_url, str) else chapter_info_or_url.get("url", "")
        res = self.scraper.get(chapter_url, headers={"Referer": self.comic_url}, timeout=TIMEOUT)
        if res.status_code != 200:
            return []

        pattern = rf'https?://(?:cdn\d*\.zetimage\.com|[^"\'\s<>]+zetimage[^"\'\s<>]+)/{self.slug}/[^"\'\s<>]+\.(?:jpg|webp|png|jpeg)'
        matches = re.findall(pattern, res.text, re.IGNORECASE)

        unique_imgs = []
        seen = set()
        for u in matches:
            if u not in seen and "thumb" not in u:
                seen.add(u)
                unique_imgs.append(u)

        def get_page_index(url):
            m = re.search(r'/(\d+)\.(?:jpg|webp|png|jpeg)', url, re.I)
            return int(m.group(1)) if m else 999999

        unique_imgs.sort(key=get_page_index)
        return unique_imgs


class MangaDexDownloader(BaseMangaDownloader):
    """Bộ tải truyện chuyên biệt cho MangaDex (ưu tiên Tiếng Việt)"""
    def __init__(self, manga_id_or_url: str, output_dir="downloads", merge_slices=False, make_pdf=False, upload_to_web=False, api_base_url=DEFAULT_API_BASE_URL, lang=DEFAULT_LANG, data_saver=False):
        super().__init__(output_dir=output_dir, merge_slices=merge_slices, make_pdf=make_pdf, upload_to_web=upload_to_web, api_base_url=api_base_url)
        self.source_name = "MangaDex"
        self.raw_input = manga_id_or_url.strip()
        self.lang = lang or DEFAULT_LANG
        self.data_saver = data_saver
        self.manga_id = self._extract_manga_id(self.raw_input)

    def _extract_manga_id(self, input_str: str) -> str:
        """Trích xuất MangaDex UUID từ URL truyện, URL chapter hoặc chuỗi UUID thuần"""
        input_str = input_str.strip()
        uuid_pattern = r'[0-9a-fA-F]{8}-[0-9a-fA-F]{4}-[0-9a-fA-F]{4}-[0-9a-fA-F]{4}-[0-9a-fA-F]{12}'
        
        if "/chapter/" in input_str:
            m = re.search(rf'/chapter/({uuid_pattern})', input_str)
            if m:
                chap_id = m.group(1)
                try:
                    res = self.http_session.get(f"{MANGADEX_API_BASE}/chapter/{chap_id}?includes[]=manga", timeout=TIMEOUT)
                    if res.status_code == 200:
                        data = res.json().get("data", {})
                        for rel in data.get("relationships", []):
                            if rel.get("type") == "manga":
                                return rel.get("id")
                except Exception:
                    pass
        
        m_title = re.search(rf'/title/({uuid_pattern})', input_str)
        if m_title:
            return m_title.group(1)

        m_uuid = re.search(uuid_pattern, input_str)
        if m_uuid:
            return m_uuid.group(0)

        return input_str

    @staticmethod
    def parse_mangadex_search_url(url: str) -> dict:
        """Phân tích các tham số từ URL duyệt danh sách / tìm kiếm MangaDex"""
        parsed = urllib.parse.urlparse(url)
        qs = urllib.parse.parse_qs(parsed.query)
        
        page = int(qs.get('page', ['1'])[0]) if qs.get('page') else 1
        lang = qs.get('translatedLang', [DEFAULT_LANG])[0]
        if isinstance(lang, list):
            lang = lang[0]
        only_avail = qs.get('onlyAvailableChapters', ['true'])[0].lower() == 'true'
        query = qs.get('q', [None])[0] or qs.get('title', [None])[0]

        return {
            "page": page,
            "lang": lang,
            "only_available": only_avail,
            "query": query
        }

    @staticmethod
    def search_or_browse_manga(query: str = None, page: int = 1, limit: int = 20, lang: str = DEFAULT_LANG, only_available: bool = True, order_by: str = "latest") -> dict:
        """Tìm kiếm hoặc duyệt danh sách truyện có bản dịch Tiếng Việt trên MangaDex
        order_by: 'latest' (mới cập nhật), 'oldest' (cũ nhất -> mới nhất theo createdAt), 'newest_created' (mới tạo -> cũ nhất), 'updated_desc'
        """
        offset = (max(1, page) - 1) * limit
        params = {
            "limit": limit,
            "offset": offset,
            "availableTranslatedLanguage[]": [lang],
            "hasAvailableChapters": "true" if only_available else "false",
            "includes[]": ["cover_art", "author", "artist", "tag"],
            "contentRating[]": ["safe", "suggestive", "erotica", "pornographic"]
        }

        if order_by in ("oldest", "created_at_asc", "createdAt_asc", "asc", "oldest_first"):
            params["order[createdAt]"] = "asc"
        elif order_by in ("newest_created", "created_at_desc", "createdAt_desc"):
            params["order[createdAt]"] = "desc"
        elif order_by in ("updated_asc", "updatedAt_asc"):
            params["order[updatedAt]"] = "asc"
        elif order_by in ("updated_desc", "updatedAt_desc"):
            params["order[updatedAt]"] = "desc"
        elif order_by in ("title_asc", "title"):
            params["order[title]"] = "asc"
        else:
            params["order[latestUploadedChapter]"] = "desc"

        if query:
            params["title"] = query

        url = f"{MANGADEX_API_BASE}/manga"
        headers = {"User-Agent": "TruyenKomi-Downloader/1.0 (https://truyenkomi.site)"}
        
        for retry in range(MAX_RETRIES):
            res = requests.get(url, params=params, headers=headers, timeout=TIMEOUT)
            if res.status_code == 200:
                break
            elif res.status_code == 429:
                time.sleep(2 * (retry + 1))
            else:
                time.sleep(1)
        else:
            raise Exception(f"Không thể lấy danh sách truyện từ MangaDex (HTTP {res.status_code})")

        res_json = res.json()
        total = res_json.get("total", 0)
        items = []

        for m in res_json.get("data", []):
            m_id = m.get("id")
            attr = m.get("attributes", {})
            title_dict = attr.get("title", {})
            
            vietnamese_title = None
            for alt in attr.get("altTitles", []):
                if "vi" in alt:
                    vietnamese_title = alt["vi"]
                    break
            
            orig_title = list(title_dict.values())[0] if title_dict else "Unknown"
            display_title = vietnamese_title or title_dict.get("en") or orig_title

            authors = []
            cover_filename = None
            for rel in m.get("relationships", []):
                rel_type = rel.get("type")
                if rel_type in ("author", "artist"):
                    a_name = rel.get("attributes", {}).get("name")
                    if a_name and a_name not in authors:
                        authors.append(a_name)
                elif rel_type == "cover_art":
                    cover_filename = rel.get("attributes", {}).get("fileName")

            cover_url = f"{MANGADEX_UPLOADS_BASE}/covers/{m_id}/{cover_filename}" if cover_filename else None
            
            tags = [t.get("attributes", {}).get("name", {}).get("en") for t in attr.get("tags", []) if t.get("attributes", {}).get("name")]
            tags = [t for t in tags if t]

            items.append({
                "id": m_id,
                "title": display_title,
                "orig_title": orig_title,
                "vietnamese_title": vietnamese_title,
                "author": ", ".join(authors) if authors else "Đang cập nhật",
                "cover_url": cover_url,
                "tags": tags,
                "url": f"https://mangadex.org/title/{m_id}",
                "latest_uploaded_chapter": attr.get("latestUploadedChapter"),
                "content_rating": attr.get("contentRating", "safe")
            })

        return {
            "total": total,
            "page": page,
            "limit": limit,
            "items": items
        }

    @staticmethod
    def fetch_all_mangadex_manga_iter(lang: str = DEFAULT_LANG, order_by: str = "oldest", start_offset: int = 0, limit_per_req: int = 100, max_manga: int = None):
        """Generator trả về từng bộ truyện trên MangaDex theo thứ tự chỉ định (Mặc định: cũ nhất đến mới nhất)"""
        offset = start_offset
        fetched_count = 0
        limit = min(100, max(1, limit_per_req))

        while True:
            params = {
                "limit": limit,
                "offset": offset,
                "availableTranslatedLanguage[]": [lang],
                "hasAvailableChapters": "true",
                "includes[]": ["cover_art", "author", "artist", "tag"],
                "contentRating[]": ["safe", "suggestive", "erotica", "pornographic"]
            }
            if order_by in ("oldest", "created_at_asc", "createdAt_asc", "asc", "oldest_first"):
                params["order[createdAt]"] = "asc"
            elif order_by in ("newest_created", "created_at_desc", "createdAt_desc"):
                params["order[createdAt]"] = "desc"
            elif order_by in ("updated_asc", "updatedAt_asc"):
                params["order[updatedAt]"] = "asc"
            elif order_by in ("updated_desc", "updatedAt_desc"):
                params["order[updatedAt]"] = "desc"
            else:
                params["order[latestUploadedChapter]"] = "desc"

            url = f"{MANGADEX_API_BASE}/manga"
            headers = {"User-Agent": "TruyenKomi-Downloader/1.0 (https://truyenkomi.site)"}

            res = None
            for retry in range(MAX_RETRIES):
                try:
                    res = requests.get(url, params=params, headers=headers, timeout=TIMEOUT)
                    if res.status_code == 200:
                        break
                    elif res.status_code == 429:
                        time.sleep(2 * (retry + 1))
                except Exception:
                    time.sleep(1)

            if not res or res.status_code != 200:
                break

            data = res.json()
            manga_list = data.get("data", [])
            total = data.get("total", 0)

            if not manga_list:
                break

            for m in manga_list:
                m_id = m.get("id")
                attr = m.get("attributes", {})
                title_dict = attr.get("title", {})
                
                vietnamese_title = None
                for alt in attr.get("altTitles", []):
                    if "vi" in alt:
                        vietnamese_title = alt["vi"]
                        break
                
                orig_title = list(title_dict.values())[0] if title_dict else "Unknown"
                display_title = vietnamese_title or title_dict.get("en") or orig_title

                authors = []
                cover_filename = None
                for rel in m.get("relationships", []):
                    rel_type = rel.get("type")
                    if rel_type in ("author", "artist"):
                        a_name = rel.get("attributes", {}).get("name")
                        if a_name and a_name not in authors:
                            authors.append(a_name)
                    elif rel_type == "cover_art":
                        cover_filename = rel.get("attributes", {}).get("fileName")

                cover_url = f"{MANGADEX_UPLOADS_BASE}/covers/{m_id}/{cover_filename}" if cover_filename else None
                tags = [t.get("attributes", {}).get("name", {}).get("en") for t in attr.get("tags", []) if t.get("attributes", {}).get("name")]

                item = {
                    "id": m_id,
                    "title": display_title,
                    "orig_title": orig_title,
                    "vietnamese_title": vietnamese_title,
                    "author": ", ".join(authors) if authors else "Đang cập nhật",
                    "cover_url": cover_url,
                    "tags": tags,
                    "url": f"https://mangadex.org/title/{m_id}",
                    "total_available": total,
                    "offset_index": offset + len(items) if 'items' in locals() else offset
                }
                yield item
                fetched_count += 1
                if max_manga and fetched_count >= max_manga:
                    return

            offset += len(manga_list)
            if offset >= total:
                break
            time.sleep(0.2)  # Nhẹ nhàng với MangaDex API

    def get_comic_info(self):
        """Lấy thông tin chi tiết truyện và danh sách chapter Tiếng Việt từ MangaDex"""
        if HAS_RICH and console:
            console.print(f"[bold cyan]🔍 Đang phân tích dữ liệu truyện từ MangaDex (ID: {self.manga_id})...[/bold cyan]")
        else:
            print(f"🔍 Đang phân tích dữ liệu truyện từ MangaDex (ID: {self.manga_id})...")

        manga_url = f"{MANGADEX_API_BASE}/manga/{self.manga_id}?includes[]=cover_art&includes[]=author&includes[]=artist&includes[]=tag"
        res = self.http_session.get(manga_url, timeout=TIMEOUT)
        if res.status_code != 200:
            raise Exception(f"Không tìm thấy truyện trên MangaDex với ID '{self.manga_id}' (HTTP {res.status_code})")

        data = res.json().get("data", {})
        attr = data.get("attributes", {})
        title_dict = attr.get("title", {})

        vietnamese_title = None
        alt_names = []
        for alt in attr.get("altTitles", []):
            for k, v in alt.items():
                if v and v not in alt_names:
                    alt_names.append(v)
                if k == self.lang and not vietnamese_title:
                    vietnamese_title = v

        orig_title = list(title_dict.values())[0] if title_dict else "Unknown Manga"
        title = vietnamese_title or title_dict.get("en") or orig_title
        self.comic_title = title
        self.slug = slugify(title)
        self.other_names = ", ".join(alt_names[:5]) if alt_names else "Đang cập nhật"

        authors = []
        cover_filename = None
        for rel in data.get("relationships", []):
            rel_type = rel.get("type")
            if rel_type in ("author", "artist"):
                name = rel.get("attributes", {}).get("name")
                if name and name not in authors:
                    authors.append(name)
            elif rel_type == "cover_art":
                cover_filename = rel.get("attributes", {}).get("fileName")

        self.author = ", ".join(authors) if authors else "Đang cập nhật"
        cover_url = f"{MANGADEX_UPLOADS_BASE}/covers/{self.manga_id}/{cover_filename}" if cover_filename else None

        cr = attr.get("contentRating", "safe")
        rating_map = {"safe": "13+", "suggestive": "16+", "erotica": "18+", "pornographic": "18+ (R18)"}
        self.age_limit = rating_map.get(cr, "13+")

        genres = [t.get("attributes", {}).get("name", {}).get("en") for t in attr.get("tags", []) if t.get("attributes", {}).get("name")]
        self.genres = [g for g in genres if g]

        self.created_date_str = parse_date_to_iso(attr.get("createdAt"))
        self.updated_date_str = parse_date_to_iso(attr.get("updatedAt"))

        chapters_raw = []
        limit = 500
        offset = 0
        while True:
            feed_url = f"{MANGADEX_API_BASE}/manga/{self.manga_id}/feed"
            feed_params = {
                "translatedLanguage[]": [self.lang],
                "order[chapter]": "asc",
                "limit": limit,
                "offset": offset,
                "includes[]": ["scanlation_group", "user"],
                "contentRating[]": ["safe", "suggestive", "erotica", "pornographic"]
            }
            f_res = self.http_session.get(feed_url, params=feed_params, timeout=TIMEOUT)
            if f_res.status_code != 200:
                break
            
            f_data = f_res.json()
            ch_list = f_data.get("data", [])
            chapters_raw.extend(ch_list)

            total_ch = f_data.get("total", 0)
            offset += limit
            if offset >= total_ch or not ch_list:
                break

        grouped_by_num = {}
        for c in chapters_raw:
            c_attr = c.get("attributes", {})
            chap_str = c_attr.get("chapter")
            if not chap_str:
                chap_num = 0.0
            else:
                try:
                    chap_num = float(chap_str)
                except ValueError:
                    chap_num = 0.0

            chap_id = c.get("id")
            chap_title = c_attr.get("title") or f"Chương {int(chap_num) if chap_num.is_integer() else chap_num}"
            chap_pages = int(c_attr.get("pages") or 0)
            chap_date = parse_date_to_iso(c_attr.get("publishAt") or c_attr.get("createdAt"))
            
            groups = []
            for rel in c.get("relationships", []):
                if rel.get("type") == "scanlation_group":
                    g_name = rel.get("attributes", {}).get("name")
                    if g_name: groups.append(g_name)
            group_name = ", ".join(groups) if groups else "MangaDex Community"

            chap_obj = {
                "id": chap_id,
                "number": chap_num,
                "title": chap_title,
                "slug": f"chuong-{int(chap_num) if chap_num.is_integer() else chap_num}",
                "url": f"https://mangadex.org/chapter/{chap_id}",
                "pages": chap_pages,
                "scanlation_group": group_name,
                "views": 0,
                "updated_at": chap_date,
                "created_at": chap_date
            }

            if chap_num not in grouped_by_num:
                grouped_by_num[chap_num] = chap_obj
            else:
                existing = grouped_by_num[chap_num]
                if chap_pages > existing.get("pages", 0):
                    grouped_by_num[chap_num] = chap_obj

        chapters = list(grouped_by_num.values())
        chapters.sort(key=lambda x: x["number"])

        if chapters and (not self.translator_group or self.translator_group == "Đang cập nhật"):
            self.translator_group = chapters[0].get("scanlation_group", "MangaDex Community")

        return {
            "title": title,
            "slug": self.slug,
            "cover_url": cover_url,
            "author": self.author,
            "translator_group": self.translator_group,
            "other_names": self.other_names,
            "age_limit": self.age_limit,
            "views": len(chapters) * 100,
            "genres": self.genres,
            "categories": self.genres,
            "created_date_str": self.created_date_str,
            "updated_date_str": self.updated_date_str,
            "created_at_iso": self.created_date_str,
            "updated_at_iso": self.updated_date_str,
            "chapters": chapters
        }

    def get_chapter_images(self, chapter_info_or_url):
        """Lấy toàn bộ link ảnh chất lượng cao của một chapter qua MangaDex @Home Network"""
        chap_id = None
        if isinstance(chapter_info_or_url, dict):
            chap_id = chapter_info_or_url.get("id")
            if not chap_id and chapter_info_or_url.get("url"):
                m = re.search(r'/chapter/([0-9a-fA-F-]+)', chapter_info_or_url["url"])
                if m: chap_id = m.group(1)
        elif isinstance(chapter_info_or_url, str):
            m = re.search(r'/chapter/([0-9a-fA-F-]+)', chapter_info_or_url)
            chap_id = m.group(1) if m else chapter_info_or_url

        if not chap_id:
            return []

        server_url = f"{MANGADEX_API_BASE}/at-home/server/{chap_id}"
        for attempt in range(MAX_RETRIES):
            try:
                res = self.http_session.get(server_url, timeout=TIMEOUT)
                if res.status_code == 200:
                    json_data = res.json()
                    base_url = json_data.get("baseUrl")
                    ch = json_data.get("chapter", {})
                    ch_hash = ch.get("hash")
                    
                    if self.data_saver:
                        file_list = ch.get("dataSaver", [])
                        return [f"{base_url}/data-saver/{ch_hash}/{fn}" for fn in file_list]
                    else:
                        file_list = ch.get("data", [])
                        return [f"{base_url}/data/{ch_hash}/{fn}" for fn in file_list]
            except Exception:
                time.sleep(1)

        return []


def handle_mangadex_browse_interactive(browse_url_or_params: dict, select_arg: str = None) -> list:
    """Hiển thị danh sách truyện Tiếng Việt trên MangaDex và cho phép người dùng chọn"""
    page = browse_url_or_params.get("page", 1)
    lang = browse_url_or_params.get("lang", DEFAULT_LANG)
    query = browse_url_or_params.get("query")
    only_avail = browse_url_or_params.get("only_available", True)

    if HAS_RICH and console:
        filter_desc = f"Trang {page}" + (f", từ khóa: '{query}'" if query else "") + f", Ngôn ngữ: {lang}"
        console.print(f"[bold cyan]🔍 Đang lấy danh sách truyện MangaDex ({filter_desc})...[/bold cyan]")
    else:
        print(f"🔍 Đang lấy danh sách truyện MangaDex (Trang {page}, Ngôn ngữ: {lang})...")

    result = MangaDexDownloader.search_or_browse_manga(query=query, page=page, limit=15, lang=lang, only_available=only_avail)
    items = result.get("items", [])
    total = result.get("total", 0)

    if not items:
        if HAS_RICH and console:
            console.print("[bold red]❌ Không tìm thấy truyện Tiếng Việt nào trên MangaDex phù hợp![/bold red]")
        else:
            print("❌ Không tìm thấy truyện Tiếng Việt nào trên MangaDex phù hợp!")
        return []

    if HAS_RICH and console:
        table = Table(title=f"📚 DANH SÁCH TRUYỆN MANGADEX (TIẾNG VIỆT) - Trang {page} (Tổng: {total} bộ)", border_style="cyan")
        table.add_column("STT", style="bold yellow", justify="center", width=5)
        table.add_column("Tên Truyện", style="bold green", min_width=30)
        table.add_column("Tác Giả", style="magenta", width=18)
        table.add_column("Thể Loại", style="cyan", width=22)
        table.add_column("MangaDex ID", style="dim", width=12)

        for idx, item in enumerate(items, 1):
            short_id = item['id'][:8] + "..."
            genres_str = ", ".join(item['tags'][:3]) if item['tags'] else "-"
            table.add_row(str(idx), item['title'], item['author'], genres_str, short_id)

        console.print(table)
        console.print()
    else:
        print(f"\n--- DANH SÁCH TRUYỆN MANGADEX (TIẾNG VIỆT) - Trang {page} (Tổng {total} bộ) ---")
        for idx, item in enumerate(items, 1):
            genres_str = ", ".join(item['tags'][:3]) if item['tags'] else "-"
            print(f"[{idx}] {item['title']} | TG: {item['author']} | {genres_str} | ID: {item['id']}")
        print()

    selected_items = []
    if select_arg:
        choice = select_arg.strip().lower()
    else:
        if HAS_RICH and console:
            console.print("[bold yellow]👉 Nhập STT truyện muốn tải (VD: 1 hoặc 1,3 hoặc 1-3 hoặc 'all', 'q' để thoát):[/bold yellow] ", end="")
        else:
            print("👉 Nhập STT truyện muốn tải (VD: 1 hoặc 1,3 hoặc 1-3 hoặc 'all', 'q' để thoát): ", end="")
        choice = input().strip().lower()

    if not choice or choice == 'q' or choice == 'exit':
        return []

    if choice == 'all':
        return items

    parts = choice.replace(" ", "").split(",")
    for p in parts:
        if "-" in p:
            try:
                start_i, end_i = p.split("-", 1)
                for i in range(int(start_i), int(end_i) + 1):
                    if 1 <= i <= len(items):
                        selected_items.append(items[i - 1])
            except Exception:
                pass
        else:
            try:
                idx = int(p)
                if 1 <= idx <= len(items):
                    selected_items.append(items[idx - 1])
            except Exception:
                pass

    return selected_items


def main():
    parser = argparse.ArgumentParser(
        description="Tool tải truyện siêu tốc từ ZetTruyen & MangaDex (Tiếng Việt), hỗ trợ Cloud Sync & Web",
        formatter_class=argparse.RawDescriptionHelpFormatter,
        epilog="""
Ví dụ sử dụng:
  # 1. Tải truyện từ ZetTruyen:
  python zet_downloader.py https://www.zettruyen1.com/truyen-tranh/phuc-thu -s 1 -e 5 --upload

  # 2. Tải truyện từ MangaDex bằng URL truyện hoặc UUID:
  python zet_downloader.py https://mangadex.org/title/36300a46-485b-4c05-a570-ac3b23de3952 -s 1 -e 5

  # 3. Duyệt và chọn tải truyện Tiếng Việt từ MangaDex:
  python zet_downloader.py "https://mangadex.org/titles?page=1&translatedLang=vi&onlyAvailableChapters=true"

  # 4. Tìm kiếm truyện trên MangaDex theo từ khóa:
  python zet_downloader.py --mangadex -q "Solo Leveling" -u

  # 5. Tải nhanh không cần hỏi qua cờ --select:
  python zet_downloader.py --mangadex --page 1 --select 1 -s 1 -e 3
        """
    )
    parser.add_argument("url", nargs="?", default=None, help="URL truyện trên ZetTruyen / MangaDex hoặc URL tìm kiếm MangaDex")
    parser.add_argument("-s", "--start", type=float, default=None, help="Chương bắt đầu tải (VD: 1)")
    parser.add_argument("-e", "--end", type=float, default=None, help="Chương kết thúc tải (VD: 8)")
    parser.add_argument("-c", "--chapter", type=float, default=None, help="Tải duy nhất 1 chương cụ thể (VD: 1)")
    parser.add_argument("-o", "--output", default="downloads", help="Thư mục lưu ảnh (Mặc định: downloads)")
    parser.add_argument("-u", "--upload", action="store_true", help="Tự động upload ảnh lên Cloud Storage và đưa truyện lên Website")
    parser.add_argument("--pdf", action="store_true", help="Tự động xuất mỗi chương thành file PDF")
    parser.add_argument("--merge", action="store_true", help="Ghép 5 lát cắt ảnh làm 1 (Mặc định tự động ghép nếu chương > 70 ảnh)")
    parser.add_argument("--api", default=DEFAULT_API_BASE_URL, help=f"URL Backend API (Mặc định: {DEFAULT_API_BASE_URL})")
    
    # MangaDex Specific Arguments
    parser.add_argument("--source", "--src", choices=["auto", "zet", "mangadex"], default="auto", help="Nguồn truyện (Mặc định: auto nhận diện)")
    parser.add_argument("--mangadex", "--dex", action="store_true", help="Bật chế độ duyệt/tìm kiếm MangaDex Tiếng Việt")
    parser.add_argument("--all-mangadex", "--download-all", action="store_true", help="Tải toàn bộ truyện MangaDex (Mặc định từ cũ nhất đến mới nhất)")
    parser.add_argument("--order", choices=["oldest", "latest", "newest_created", "updated_desc"], default="oldest", help="Thứ tự tải toàn bộ (Mặc định: oldest - cũ nhất đến mới nhất)")
    parser.add_argument("--start-offset", type=int, default=0, help="Bắt đầu từ truyện thứ mấy (Mặc định: 0)")
    parser.add_argument("--max-manga", type=int, default=None, help="Số lượng truyện tối đa muốn tải (Mặc định: Tất cả)")
    parser.add_argument("-q", "--query", "--search", default=None, help="Từ khóa tìm kiếm truyện trên MangaDex")
    parser.add_argument("-p", "--page", type=int, default=1, help="Số trang duyệt trên MangaDex (Mặc định: 1)")
    parser.add_argument("--lang", default=DEFAULT_LANG, help=f"Mã ngôn ngữ bản dịch MangaDex (Mặc định: {DEFAULT_LANG} - Tiếng Việt)")
    parser.add_argument("--data-saver", action="store_true", help="Tải ảnh nén tiết kiệm dung lượng từ MangaDex")
    parser.add_argument("--select", default=None, help="Tự động chọn STT truyện khi duyệt danh sách (VD: 1 hoặc 1,2 hoặc all)")

    args = parser.parse_args()

    input_url = args.url or ""

    # 0. Xử lý tải toàn bộ MangaDex (Batch All)
    if args.all_mangadex:
        order_name = "Cũ nhất ➜ Mới nhất (order[createdAt]=asc)" if args.order == "oldest" else args.order
        if HAS_RICH and console:
            console.print(f"[bold green]🚀 BẮT ĐẦU TIẾN TRÌNH TẢI TOÀN BỘ MANGADEX ({order_name})[/bold green]")
            console.print(f"Ngôn ngữ: [cyan]{args.lang}[/cyan] | Bắt đầu từ offset: [cyan]{args.start_offset}[/cyan]")
        else:
            print(f"🚀 BẮT ĐẦU TIẾN TRÌNH TẢI TOÀN BỘ MANGADEX ({order_name})")
            print(f"Ngôn ngữ: {args.lang} | Bắt đầu từ offset: {args.start_offset}")

        manga_gen = MangaDexDownloader.fetch_all_mangadex_manga_iter(
            lang=args.lang,
            order_by=args.order,
            start_offset=args.start_offset,
            limit_per_req=100,
            max_manga=args.max_manga
        )

        total_processed = 0
        for item in manga_gen:
            total_processed += 1
            idx_num = args.start_offset + total_processed
            tot_str = f" / {item.get('total_available', '?')}" if item.get('total_available') else ""
            if HAS_RICH and console:
                console.print(f"\n[bold yellow]━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━[/bold yellow]")
                console.print(f"[bold green]▶ [{idx_num}{tot_str}] Đang xử lý bộ truyện:[/bold green] [bold cyan]{item['title']}[/bold cyan] (ID: {item['id']})")
                console.print(f"✍️ Tác giả: {item['author']}")
            else:
                print(f"\n━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━")
                print(f"▶ [{idx_num}{tot_str}] Đang xử lý bộ truyện: {item['title']} (ID: {item['id']})")
                print(f"✍️ Tác giả: {item['author']}")

            try:
                downloader = MangaDexDownloader(
                    manga_id_or_url=item['id'],
                    output_dir=args.output,
                    merge_slices=args.merge,
                    make_pdf=args.pdf,
                    upload_to_web=args.upload,
                    api_base_url=args.api,
                    lang=args.lang,
                    data_saver=args.data_saver
                )
                downloader.run(start_chap=args.start, end_chap=args.end, specific_chap=args.chapter)
            except Exception as ex:
                if HAS_RICH and console:
                    console.print(f"[bold red]❌ Lỗi khi tải bộ truyện '{item['title']}': {ex}[/bold red]")
                else:
                    print(f"❌ Lỗi khi tải bộ truyện '{item['title']}': {ex}")

        if HAS_RICH and console:
            console.print(f"\n[bold green]🎉 ĐÃ HOÀN TẤT TIẾN TRÌNH TẢI HÀNG LOẠT {total_processed} BỘ TRUYỆN MANGADEX![/bold green]")
        else:
            print(f"\n🎉 ĐÃ HOÀN TẤT TIẾN TRÌNH TẢI HÀNG LOẠT {total_processed} BỘ TRUYỆN MANGADEX!")
        return
    
    # 1. Nhận diện trường hợp tìm kiếm / duyệt danh sách MangaDex
    is_mangadex_browse_url = "mangadex.org/titles" in input_url or ("mangadex.org/manga" in input_url and "?" in input_url)
    should_browse_mangadex = args.mangadex or args.query or is_mangadex_browse_url

    if should_browse_mangadex:
        if is_mangadex_browse_url:
            browse_params = MangaDexDownloader.parse_mangadex_search_url(input_url)
            if args.query: browse_params["query"] = args.query
            if args.page != 1: browse_params["page"] = args.page
            if args.lang != DEFAULT_LANG: browse_params["lang"] = args.lang
        else:
            browse_params = {
                "page": args.page,
                "lang": args.lang,
                "only_available": True,
                "query": args.query
            }

        selected_items = handle_mangadex_browse_interactive(browse_params, select_arg=args.select)
        if not selected_items:
            return

        for item in selected_items:
            if HAS_RICH and console:
                console.print(f"\n[bold green]🚀 Bắt đầu tải bộ truyện:[/bold green] [bold cyan]{item['title']}[/bold cyan] (ID: {item['id']})")
            else:
                print(f"\n🚀 Bắt đầu tải bộ truyện: {item['title']} (ID: {item['id']})")

            downloader = MangaDexDownloader(
                manga_id_or_url=item['id'],
                output_dir=args.output,
                merge_slices=args.merge,
                make_pdf=args.pdf,
                upload_to_web=args.upload,
                api_base_url=args.api,
                lang=args.lang,
                data_saver=args.data_saver
            )
            downloader.run(start_chap=args.start, end_chap=args.end, specific_chap=args.chapter)
        return

    # 2. Xử lý tải trực tiếp 1 URL cụ thể
    target_url = input_url if input_url else DEFAULT_COMIC_URL
    is_mangadex = (
        args.source == "mangadex" or
        "mangadex.org" in target_url or
        re.match(r'^[0-9a-fA-F]{8}-[0-9a-fA-F]{4}-[0-9a-fA-F]{4}-[0-9a-fA-F]{4}-[0-9a-fA-F]{12}$', target_url.strip())
    )

    if is_mangadex:
        downloader = MangaDexDownloader(
            manga_id_or_url=target_url,
            output_dir=args.output,
            merge_slices=args.merge,
            make_pdf=args.pdf,
            upload_to_web=args.upload,
            api_base_url=args.api,
            lang=args.lang,
            data_saver=args.data_saver
        )
    else:
        downloader = ZetMangaDownloader(
            comic_url=target_url,
            output_dir=args.output,
            merge_slices=args.merge,
            make_pdf=args.pdf,
            upload_to_web=args.upload,
            api_base_url=args.api
        )

    downloader.run(start_chap=args.start, end_chap=args.end, specific_chap=args.chapter)


if __name__ == "__main__":
    main()

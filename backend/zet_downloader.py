#!/usr/bin/env python3
# -*- coding: utf-8 -*-
"""
=============================================================================
🚀 ZetTruyen Manga Downloader (Phục Thù & All ZetTruyen Comics)
=============================================================================
Author: TruyenKomi Team
Description: Tool tải truyện siêu tốc từ ZetTruyen với đa luồng (Multi-threading),
             tự động ghép ảnh (Image Stitching), xuất PDF, và hỗ trợ upload Cloud.
=============================================================================
"""

import sys
import os
import re
import time
import argparse
from pathlib import Path
from concurrent.futures import ThreadPoolExecutor, as_completed

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
TIMEOUT = 20
MAX_RETRIES = 3
AUTO_STITCH_THRESHOLD = 70  # Tự động ghép khi chapter có > 70 ảnh
STITCH_GROUP_SIZE = 5      # Ghép 5 ảnh thành 1 ảnh dài (5-in-1)

# Cloud Storage & Web API Settings
DEFAULT_API_BASE_URL = os.getenv("API_BASE_URL", "http://localhost:5000/api")
GCS_ENDPOINT = os.getenv("R2_ENDPOINT", "storage.googleapis.com")
GCS_ACCESS_KEY = os.getenv("R2_ACCESS_KEY", "GOOGQHRXVRS7YCR24JBLB33S")
GCS_SECRET_KEY = os.getenv("R2_SECRET_KEY", "3Iamo8whmuUeT2B+CMtRnfW6qdIsmwXVec47tF52")
GCS_BUCKET = os.getenv("R2_BUCKET_NAME", "truyenkomi")
CDN_BASE_URL = os.getenv("R2_CDN_BASE_URL", "https://img.truyenkomi.site").rstrip("/")


def upload_file_to_cloud(local_path: Path, object_name: str, content_type: str = "image/webp") -> str:
    """Tải 1 file lên Cloud Storage (Google Cloud Storage S3-compatible) và trả về URL CDN"""
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


def sync_chapter_to_web_api(api_base_url: str, comic_title: str, comic_slug: str, cover_cdn_url: str, chapter_num: float, chapter_title: str, image_urls: list, author: str = None, translator_group: str = None, other_names: str = None, age_limit: str = None) -> bool:
    """Đồng bộ truyện và chapter lên TruyenKomi Web API"""
    import urllib.parse
    params = {
        "comicTitle": comic_title,
        "comicSlug": comic_slug,
        "coverImage": cover_cdn_url
    }
    if author: params["author"] = author
    if translator_group: params["translatorGroup"] = translator_group
    if other_names: params["otherNames"] = other_names
    if age_limit: params["ageLimit"] = age_limit

    query_str = urllib.parse.urlencode(params)
    url = f"{api_base_url.rstrip('/')}/comics/import-scraped?{query_str}"
    payload = {
        "comicId": 0,
        "chapterNumber": chapter_num,
        "title": chapter_title or f"Chương {chapter_num}",
        "isPublic": True,
        "imageUrls": image_urls
    }
    headers = {
        "User-Agent": "Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/121.0.0.0 Safari/537.36",
        "Content-Type": "application/json"
    }
    try:
        res = requests.post(url, json=payload, headers=headers, timeout=20)
        return res.status_code in (200, 201)
    except Exception as e:
        print(f"Sync API error: {e}")
        return False


class ZetMangaDownloader:
    def __init__(self, comic_url=DEFAULT_COMIC_URL, output_dir="downloads", merge_slices=False, make_pdf=False, upload_to_web=False, api_base_url=DEFAULT_API_BASE_URL):
        self.comic_url = comic_url.strip()
        self.output_dir = Path(output_dir)
        self.merge_slices = merge_slices
        self.make_pdf = make_pdf
        self.upload_to_web = upload_to_web
        self.api_base_url = api_base_url
        self.cover_cdn_url = None
        self.comic_title = ""
        self.author = "Đang cập nhật"
        self.translator_group = "Đang cập nhật"
        self.other_names = "Đang cập nhật"
        self.age_limit = "13+"
        self.scraper = cloudscraper.create_scraper(
            browser={
                'browser': 'chrome',
                'platform': 'windows',
                'desktop': True
            }
        )
        self.slug = self._extract_slug(self.comic_url)

    def _extract_slug(self, url: str) -> str:
        # e.g., https://www.zettruyen1.com/truyen-tranh/phuc-thu -> phuc-thu
        clean = url.split("?")[0].rstrip("/")
        parts = clean.split("/")
        return parts[-1] if parts else "phuc-thu"

    def _sanitize_name(self, name: str) -> str:
        name = re.sub(r'[\\/*?:"<>|]', "", name)
        name = re.sub(r'\s+', "_", name.strip())
        return name

    def get_comic_info(self):
        """Lấy thông tin truyện: Tên, Ảnh bìa, Tác giả, Nhóm dịch, Danh sách toàn bộ chapter"""
        if HAS_RICH:
            console.print(f"[bold cyan]🔍 Đang phân tích dữ liệu truyện từ:[/bold cyan] [underline]{self.comic_url}[/underline]")
        else:
            print(f"🔍 Đang phân tích dữ liệu truyện từ: {self.comic_url}")

        res = self.scraper.get(self.comic_url, timeout=TIMEOUT)
        if res.status_code != 200:
            raise Exception(f"Không thể kết nối đến trang truyện (HTTP {res.status_code})")

        soup = BeautifulSoup(res.text, "html.parser")

        # 1. Tên truyện
        title_elem = soup.find("h1")
        title = title_elem.get_text(strip=True) if title_elem else self.slug.replace("-", " ").title()
        title = re.sub(r'\s*\|\s*ZetTruyen.*', '', title, flags=re.IGNORECASE).strip()

        # 2. Ảnh bìa (Cover)
        cover_url = None
        cover_match = re.search(r'https?://[^"\'\s<>]+zetimage[^"\'\s<>]+thumb[^"\'\s<>]+\.(?:jpg|webp|png|jpeg)', res.text, re.I)
        if cover_match:
            cover_url = cover_match.group(0)
        else:
            img = soup.find("img", src=re.compile(r"thumb|cover|poster", re.I))
            if img:
                cover_url = img.get("src") or img.get("data-src")

        # 3. Tác giả, Nhóm dịch, Tên khác, Độ tuổi (Cào tự động từ HTML)
        # 3.1 Cào từ Grid layout nếu có
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

        # 3.2 Cào từ Text regex fallback
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

        # 4. Lấy danh sách toàn bộ Chapter qua ZetTruyen API
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
                    chapters.append({
                        "number": chap_num,
                        "title": chap_name,
                        "slug": chap_slug,
                        "url": chap_url
                    })
        except Exception as e:
            if HAS_RICH:
                console.print(f"[yellow]⚠️ Lỗi gọi API chapters ({e}), fallback cào từ HTML...[/yellow]")

        # Fallback từ HTML nếu API không trả về
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
                                "url": full_u
                            })

        # Sắp xếp chương tăng dần
        chapters.sort(key=lambda x: x["number"])

        return {
            "title": title,
            "slug": self.slug,
            "cover_url": cover_url,
            "author": self.author,
            "translator_group": self.translator_group,
            "other_names": self.other_names,
            "age_limit": self.age_limit,
            "chapters": chapters
        }

    def get_chapter_images(self, chapter_url: str):
        """Lấy toàn bộ link ảnh chất lượng cao của một chapter"""
        res = self.scraper.get(chapter_url, headers={"Referer": self.comic_url}, timeout=TIMEOUT)
        if res.status_code != 200:
            return []

        # Regex tìm tất cả ảnh của chapter (cdn1.zetimage.com, etc.)
        pattern = rf'https?://(?:cdn\d*\.zetimage\.com|[^"\'\s<>]+zetimage[^"\'\s<>]+)/{self.slug}/[^"\'\s<>]+\.(?:jpg|webp|png|jpeg)'
        matches = re.findall(pattern, res.text, re.IGNORECASE)

        # Deduplicate preserving order
        unique_imgs = []
        seen = set()
        for u in matches:
            if u not in seen and "thumb" not in u:
                seen.add(u)
                unique_imgs.append(u)

        # Sắp xếp đúng thứ tự trang ảnh (0.jpg, 1.jpg, ... 349.jpg)
        def get_page_index(url):
            m = re.search(r'/(\d+)\.(?:jpg|webp|png|jpeg)', url, re.I)
            return int(m.group(1)) if m else 999999

        unique_imgs.sort(key=get_page_index)
        return unique_imgs

    def _download_single_image(self, img_url: str, save_path: Path, referer: str) -> bool:
        """Tải 1 ảnh với retry tự động"""
        if save_path.exists() and save_path.stat().st_size > 1000:
            return True  # Đã tải trước đó

        for attempt in range(MAX_RETRIES):
            try:
                res = self.scraper.get(img_url, headers={"Referer": referer}, timeout=TIMEOUT)
                if res.status_code == 200 and len(res.content) > 500:
                    with open(save_path, "wb") as f:
                        f.write(res.content)
                    return True
            except Exception:
                time.sleep(1)
        return False

    def _merge_images_vertical(self, image_paths: list, output_dir: Path, group_size: int = STITCH_GROUP_SIZE):
        """Ghép các dải ảnh manhwa thành ảnh dài hoàn chỉnh xuất trực tiếp vào output_dir (stitch group_size in 1)"""
        if not image_paths:
            return []

        merged_files = []
        for group_idx, i in enumerate(range(0, len(image_paths), group_size), 1):
            group = image_paths[i:i + group_size]
            opened_imgs = []
            try:
                for p in group:
                    img = Image.open(p)
                    if img.mode != 'RGB':
                        img = img.convert('RGB')
                    opened_imgs.append(img)

                if not opened_imgs:
                    continue

                # Tìm chiều rộng chuẩn
                max_width = max(im.width for im in opened_imgs)
                # Resize ảnh cho cùng chiều rộng nếu cần
                resized_imgs = []
                total_height = 0
                for im in opened_imgs:
                    if im.width != max_width:
                        new_h = int(im.height * (max_width / im.width))
                        im_resized = im.resize((max_width, new_h), Image.Resampling.LANCZOS)
                        resized_imgs.append(im_resized)
                        total_height += new_h
                    else:
                        resized_imgs.append(im)
                        total_height += im.height

                # Ghép ảnh dọc
                combined = Image.new('RGB', (max_width, total_height), (255, 255, 255))
                curr_y = 0
                for im in resized_imgs:
                    combined.paste(im, (0, curr_y))
                    curr_y += im.height

                chunk_file = output_dir / f"{group_idx:03d}.webp"
                combined.save(chunk_file, 'WEBP', quality=90, method=6)
                merged_files.append(chunk_file)

                # Dọn dẹp bộ nhớ
                for im in opened_imgs:
                    im.close()
                for im in resized_imgs:
                    if im not in opened_imgs:
                        im.close()
                combined.close()
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
                img = Image.open(p)
                if img.mode != 'RGB':
                    img = img.convert('RGB')
                valid_images.append(img)
            except Exception:
                pass

        if valid_images:
            first = valid_images[0]
            rest = valid_images[1:]
            first.save(pdf_path, "PDF", resolution=100.0, save_all=True, append_images=rest)
            return True
        return False

    def download_chapter(self, chapter: dict, comic_dir: Path, progress=None, task_id=None, preloaded_images=None):
        """Tải toàn bộ ảnh của 1 chapter và tự động ghép xuất ra ảnh WebP hoàn chỉnh"""
        chap_num = chapter["number"]
        chap_url = chapter["url"]
        chap_num_str = f"{int(chap_num)}" if chap_num.is_integer() else f"{chap_num}"
        chap_folder_name = f"Chapter_{chap_num_str}"
        chap_dir = comic_dir / chap_folder_name
        chap_dir.mkdir(parents=True, exist_ok=True)

        images = preloaded_images if preloaded_images is not None else self.get_chapter_images(chap_url)
        if not images:
            return {"chapter": chap_num, "status": "no_images", "count": 0}

        num_raw = len(images)
        should_stitch = self.merge_slices or (num_raw > AUTO_STITCH_THRESHOLD)

        # Thư mục lưu tạm các lát cắt nhỏ nếu cần ghép ảnh
        if should_stitch:
            temp_dir = chap_dir / "_temp_slices"
            temp_dir.mkdir(parents=True, exist_ok=True)
            download_dir = temp_dir
        else:
            download_dir = chap_dir

        # Download parallel
        downloaded_paths = []
        with ThreadPoolExecutor(max_workers=MAX_WORKERS) as executor:
            future_to_img = {}
            for idx, img_url in enumerate(images):
                ext = img_url.split(".")[-1].split("?")[0]
                save_file = download_dir / f"raw_{idx+1:04d}.{ext}" if should_stitch else download_dir / f"raw_{idx+1:03d}.{ext}"
                downloaded_paths.append(save_file)
                f = executor.submit(self._download_single_image, img_url, save_file, chap_url)
                future_to_img[f] = save_file

            for f in as_completed(future_to_img):
                f.result()
                if progress and task_id:
                    progress.advance(task_id, 1)

        # Sort downloaded files
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
            
            # Xóa các lát cắt thô tạm thời để tránh rác ổ đĩa
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
                console.print(f"[green]  ✓ Đã xuất {len(final_paths)} trang ảnh WebP hoàn chỉnh vào {chap_folder_name}/ (đã dọn {num_downloaded} lát cắt thô)[/green]")
            else:
                print(f"  ✓ Đã xuất {len(final_paths)} trang ảnh WebP hoàn chỉnh vào {chap_folder_name}/ (đã dọn {num_downloaded} lát cắt thô)")
        else:
            final_paths = []
            for idx, p in enumerate(downloaded_paths, 1):
                webp_path = chap_dir / f"{idx:03d}.webp"
                try:
                    with Image.open(p) as im:
                        if im.mode != 'RGB':
                            im = im.convert('RGB')
                        im.save(webp_path, 'WEBP', quality=90, method=6)
                    final_paths.append(webp_path)
                    if p != webp_path and p.exists():
                        p.unlink(missing_ok=True)
                except Exception:
                    final_paths.append(p)

        # Tùy chọn xuất PDF từ ảnh hoàn chỉnh
        if self.make_pdf:
            pdf_file = comic_dir / f"{chap_folder_name}.pdf"
            self._export_pdf(final_paths, pdf_file)

        # Tùy chọn Upload lên Cloud Storage & Đồng bộ Web API
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
                    translator_group=self.translator_group,
                    other_names=self.other_names,
                    age_limit=self.age_limit
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

        comic_folder_name = self._sanitize_name(title)
        comic_dir = self.output_dir / comic_folder_name
        comic_dir.mkdir(parents=True, exist_ok=True)

        # Lọc danh sách chapter cần tải
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

        # Hiển thị thông tin tổng quan
        if HAS_RICH and console:
            table = Table(title="📖 THÔNG TIN BỘ TRUYỆN", border_style="bright_blue")
            table.add_column("Thuộc tính", style="cyan", no_wrap=True)
            table.add_column("Giá trị", style="green")
            table.add_row("Tên truyện", title)
            table.add_row("Slug", self.slug)
            table.add_row("Tổng số chapter", f"{len(chapters)} (Tải {len(target_chaps)} chương)")
            table.add_row("Thư mục lưu", str(comic_dir.resolve()))
            table.add_row("Định dạng ảnh", "WebP (Chất lượng cao)")
            table.add_row("Đẩy lên Website", "BẬT (Cloud & Web Sync)" if self.upload_to_web else "TẮT (Chỉ lưu máy)")
            console.print(table)
            console.print()
        else:
            print(f"\n--- {title} ---")
            print(f"Tổng số chapter: {len(chapters)} (Tải {len(target_chaps)} chương)")
            print(f"Thư mục lưu: {comic_dir.resolve()}")
            print(f"Định dạng ảnh: WebP")
            print(f"Đẩy lên Website: {'BẬT' if self.upload_to_web else 'TẮT'}\n")

        # Tải và đưa ảnh bìa lên Cloud (WebP) nếu cần
        if info["cover_url"]:
            raw_cover_path = comic_dir / "cover_raw.jpg"
            cover_path = comic_dir / "cover.webp"
            self._download_single_image(info["cover_url"], raw_cover_path, self.comic_url)
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
                        console.print(f"[green]📸 Đã đưa Ảnh bìa (WebP) lên Cloud: [underline]{self.cover_cdn_url}[/underline][/green]\n")
                    else:
                        print(f"📸 Đã đưa Ảnh bìa (WebP) lên Cloud: {self.cover_cdn_url}\n")
                except Exception as e:
                    if HAS_RICH and console:
                        console.print(f"[yellow]⚠️ Lỗi upload ảnh bìa: {e}[/yellow]\n")
                    else:
                        print(f"⚠️ Lỗi upload ảnh bìa: {e}\n")

        # Tiến hành tải từng chương
        total_downloaded = 0
        start_time = time.time()

        for idx, chap in enumerate(target_chaps, 1):
            chap_title = f"Chương {chap['number']}"
            if HAS_RICH and console:
                console.print(f"[bold yellow]▶ [{idx}/{len(target_chaps)}] Đang tải {chap_title}...[/bold yellow]")
                
                # Fetch images first to setup progress bar
                images = self.get_chapter_images(chap["url"])
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
                        task = progress.add_task(f"[green]Tải ảnh {chap_title}[/green]", total=len(images))
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


def main():
    parser = argparse.ArgumentParser(description="Tool tải truyện siêu tốc từ ZetTruyen & đưa thẳng lên Website")
    parser.add_argument("url", nargs="?", default=DEFAULT_COMIC_URL, help="URL truyện trên ZetTruyen (Mặc định: Phục Thù)")
    parser.add_argument("-s", "--start", type=float, default=None, help="Chương bắt đầu tải (VD: 1)")
    parser.add_argument("-e", "--end", type=float, default=None, help="Chương kết thúc tải (VD: 8)")
    parser.add_argument("-c", "--chapter", type=float, default=None, help="Tải duy nhất 1 chương cụ thể (VD: 1)")
    parser.add_argument("-o", "--output", default="downloads", help="Thư mục lưu ảnh (Mặc định: downloads)")
    parser.add_argument("-u", "--upload", action="store_true", help="Tự động upload ảnh lên Cloud Storage và đưa truyện lên Website")
    parser.add_argument("--pdf", action="store_true", help="Tự động xuất mỗi chương thành file PDF")
    parser.add_argument("--merge", action="store_true", help="Ghép 5 lát cắt ảnh làm 1 (Mặc định tự động ghép nếu chương > 70 ảnh)")
    parser.add_argument("--api", default=DEFAULT_API_BASE_URL, help=f"URL Backend API (Mặc định: {DEFAULT_API_BASE_URL})")
    
    args = parser.parse_args()

    downloader = ZetMangaDownloader(
        comic_url=args.url,
        output_dir=args.output,
        merge_slices=args.merge,
        make_pdf=args.pdf,
        upload_to_web=args.upload,
        api_base_url=args.api
    )
    downloader.run(start_chap=args.start, end_chap=args.end, specific_chap=args.chapter)


if __name__ == "__main__":
    main()

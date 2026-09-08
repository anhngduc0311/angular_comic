#!/usr/bin/env python3
# -*- coding: utf-8 -*-
"""
=============================================================================
🚀 MangaDex to Google Drive Synchronizer (Ubuntu / Linux Optimized)
=============================================================================
Author: TruyenKomi Team
Target Google Drive Folder ID: 1S3biMk6c2e-u5j7uO0wocFBW6J5eB8ef (luutruyenkomi)
Settings mặc định chuẩn hóa theo GUI:
  ☑️ Tự động tải lên Cloud Storage & Đồng bộ Web API: BẬT
  ☑️ Bỏ qua chapter đã có trên máy (Tránh tải trùng / Resume): BẬT
  ⬜ MangaDex Data-Saver (Tải ảnh nén nhẹ tiết kiệm mạng): TẮT (Tải Ảnh Gốc)
  ☑️ Ghép ảnh Manhwa 5-in-1 (Tự động khi chapter > 70 ảnh): BẬT
  ⬜ Tự động xuất mỗi chapter thành file PDF: TẮT
  ⚡ Luồng tải song song: 16 luồng
=============================================================================
"""

import sys
import os
import re
import time
import json
import shutil
import argparse
import subprocess
import unicodedata
from pathlib import Path
from datetime import datetime, timezone
from concurrent.futures import ThreadPoolExecutor, as_completed
import requests

# Fix console encoding for Windows/Linux
if sys.platform == 'win32':
    try:
        sys.stdout.reconfigure(encoding='utf-8')
        sys.stderr.reconfigure(encoding='utf-8')
    except Exception:
        pass

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

# =============================================================================
# CẤU HÌNH MẶC ĐỊNH CHUẨN THEO YÊU CẦU GIAO DIỆN
# =============================================================================
DEFAULT_DRIVE_FOLDER_ID = "1S3biMk6c2e-u5j7uO0wocFBW6J5eB8ef"  # luutruyenkomi
MANGADEX_API_BASE = "https://api.mangadex.org"
MANGADEX_UPLOADS_BASE = "https://uploads.mangadex.org"
DEFAULT_API_BASE_URL = os.getenv("API_BASE_URL", "http://localhost:5000/api")
DEFAULT_LANG = "vi"

# ⚙️ CÁC THIẾT LẬP THEO HÌNH ẢNH USER CUNG CẤP:
DEFAULT_UPLOAD_TO_WEB = True          # ☑️ Tự động tải lên Cloud & Đồng bộ Web
DEFAULT_SKIP_EXISTING = True          # ☑️ Bỏ qua chapter đã có trên máy (Resume)
DEFAULT_DATA_SAVER = False            # ⬜ MangaDex Data-Saver (TẮT -> Tải ảnh gốc)
DEFAULT_MERGE_SLICES = True           # ☑️ Ghép ảnh Manhwa 5-in-1 khi > 70 ảnh
AUTO_STITCH_THRESHOLD = 70            # Tự động ghép khi chapter có > 70 ảnh
STITCH_GROUP_SIZE = 5                 # Ghép 5 lát cắt thành 1 ảnh dài (5-in-1 WebP)
DEFAULT_MAKE_PDF = False              # ⬜ Tự động xuất PDF (TẮT)
DEFAULT_WORKERS = 16                  # ⚡ 16 luồng tải song song

DEFAULT_TIMEOUT = 30
MAX_RETRIES = 4
STATE_FILE_NAME = "mangadex_sync_state.json"
TEMP_DOWNLOAD_DIR = "mangadex_temp_cache"


def log_info(msg: str):
    if HAS_RICH and console:
        console.print(f"[bold cyan]ℹ️  {msg}[/bold cyan]")
    else:
        print(f"ℹ️  {msg}")


def log_success(msg: str):
    if HAS_RICH and console:
        console.print(f"[bold green]✅ {msg}[/bold green]")
    else:
        print(f"✅ {msg}")


def log_warning(msg: str):
    if HAS_RICH and console:
        console.print(f"[bold yellow]⚠️  {msg}[/bold yellow]")
    else:
        print(f"⚠️  {msg}")


def log_error(msg: str):
    if HAS_RICH and console:
        console.print(f"[bold red]❌ {msg}[/bold red]")
    else:
        print(f"❌ {msg}")


def slugify(text: str) -> str:
    """Tạo slug chuẩn SEO từ tên truyện"""
    if not text:
        return "manga"
    text = text.replace('đ', 'd').replace('Đ', 'D')
    text = unicodedata.normalize('NFKD', text)
    text = re.sub(r'[\u0300-\u036f]', '', text)
    text = re.sub(r'[^\w\s-]', '', text).strip().lower()
    text = re.sub(r'[-\s]+', '-', text)
    return text.strip("-") or "manga"


# =============================================================================
# QUẢN LÝ TIẾN TRÌNH & CHECKPOINT (RESUME STATE)
# =============================================================================
class SyncStateManager:
    """Ghi nhận và quản lý tiến trình tải, tránh tải lại các truyện đã hoàn thành"""
    def __init__(self, state_file_path: Path):
        self.state_file_path = state_file_path
        self.data = {
            "version": 2,
            "drive_folder_id": DEFAULT_DRIVE_FOLDER_ID,
            "created_at": datetime.now(timezone.utc).isoformat(),
            "last_updated": datetime.now(timezone.utc).isoformat(),
            "completed_manga": {},  # manga_id -> {title, slug, chapters_count, synced_at}
            "failed_manga": {},     # manga_id -> {title, error, time}
            "stats": {
                "total_comics": 0,
                "total_chapters": 0,
                "total_pages": 0
            }
        }
        self.load()

    def load(self):
        if self.state_file_path.exists():
            try:
                with open(self.state_file_path, "r", encoding="utf-8") as f:
                    self.data = json.load(f)
            except Exception as e:
                log_warning(f"Không thể đọc file tiến trình {self.state_file_path}: {e}. Sẽ tạo file mới.")

    def save(self):
        self.data["last_updated"] = datetime.now(timezone.utc).isoformat()
        try:
            with open(self.state_file_path, "w", encoding="utf-8") as f:
                json.dump(self.data, f, ensure_ascii=False, indent=2)
        except Exception as e:
            log_warning(f"Lỗi khi lưu tiến trình: {e}")

    def is_completed(self, manga_id: str) -> bool:
        return manga_id in self.data.get("completed_manga", {})

    def mark_completed(self, manga_id: str, title: str, slug: str, chapters_count: int, pages_count: int):
        self.data.setdefault("completed_manga", {})[manga_id] = {
            "title": title,
            "slug": slug,
            "chapters_count": chapters_count,
            "pages_count": pages_count,
            "synced_at": datetime.now(timezone.utc).isoformat()
        }
        if manga_id in self.data.get("failed_manga", {}):
            del self.data["failed_manga"][manga_id]
        stats = self.data.setdefault("stats", {"total_comics": 0, "total_chapters": 0, "total_pages": 0})
        stats["total_comics"] = len(self.data["completed_manga"])
        stats["total_chapters"] += chapters_count
        stats["total_pages"] += pages_count
        self.save()

    def mark_failed(self, manga_id: str, title: str, error_msg: str):
        self.data.setdefault("failed_manga", {})[manga_id] = {
            "title": title,
            "error": str(error_msg),
            "time": datetime.now(timezone.utc).isoformat()
        }
        self.save()


# =============================================================================
# GHÉP ẢNH MANHWA 5-IN-1 (IMAGE STITCHING)
# =============================================================================
def merge_images_vertical(image_paths: list, output_dir: Path, group_size: int = STITCH_GROUP_SIZE) -> list:
    """Ghép các dải ảnh manhwa thành ảnh dài hoàn chỉnh xuất trực tiếp vào output_dir (5-in-1 WebP)"""
    if not image_paths:
        return []

    merged_files = []
    for group_idx, i in enumerate(range(0, len(image_paths), group_size), 1):
        group = image_paths[i:i + group_size]
        loaded_imgs = []
        resized_imgs = []
        combined = None
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

        except Exception as e:
            log_warning(f"Lỗi khi ghép nhóm ảnh {group_idx}: {e}")
        finally:
            # Giải phóng bộ nhớ an toàn: dùng dict {id(im): im}
            to_close = {id(im): im for im in (loaded_imgs + resized_imgs)}
            for im in to_close.values():
                try:
                    im.close()
                except Exception:
                    pass
            if combined:
                try:
                    combined.close()
                except Exception:
                    pass

    return merged_files


# =============================================================================
# GOOGLE DRIVE SYNC BACKEND (RCLONE / GOOGLE API / LOCAL MOUNT)
# =============================================================================
class GoogleDriveUploader:
    """Bộ chuyển dữ liệu lên Google Drive tối ưu cho Ubuntu"""
    def __init__(
        self,
        folder_id: str = DEFAULT_DRIVE_FOLDER_ID,
        rclone_remote: str = "gdrive",
        drive_path: str = None,
        service_account_path: str = None,
        delete_local: bool = True
    ):
        self.folder_id = folder_id
        self.rclone_remote = rclone_remote
        self.drive_path = Path(drive_path) if drive_path else None
        self.service_account_path = Path(service_account_path) if service_account_path else None
        self.delete_local = delete_local
        self.backend = self._detect_backend()

    def _detect_backend(self) -> str:
        if self.drive_path and self.drive_path.exists():
            log_info(f"Sử dụng Google Drive qua thư mục Mount cục bộ: {self.drive_path}")
            return "mount"

        if self.service_account_path and self.service_account_path.exists():
            log_info(f"Sử dụng Google Drive API trực tiếp qua Service Account: {self.service_account_path}")
            return "google_api"

        rclone_path = shutil.which("rclone")
        if rclone_path:
            log_info(f"Sử dụng Rclone đồng bộ trực tiếp lên Google Drive (remote: {self.rclone_remote}).")
            return "rclone"

        log_warning("Không tìm thấy Rclone hoặc Service Account. Ảnh sẽ được giữ tạm ở thư mục cục bộ.")
        return "local_fallback"

    def sync_manga_folder(self, local_comic_dir: Path, slug: str, cover_file: Path = None, info_file: Path = None) -> bool:
        """Đẩy toàn bộ ảnh chương và ảnh bìa của một bộ truyện lên Google Drive"""
        if self.backend == "rclone":
            return self._sync_via_rclone(local_comic_dir, slug, cover_file, info_file)
        elif self.backend == "mount":
            return self._sync_via_mount(local_comic_dir, slug, cover_file, info_file)
        elif self.backend == "google_api":
            return self._sync_via_google_api(local_comic_dir, slug, cover_file, info_file)
        else:
            log_warning(f"Giữ lại file cục bộ tại {local_comic_dir} (Không có Drive remote).")
            return True

    def _sync_via_rclone(self, local_comic_dir: Path, slug: str, cover_file: Path = None, info_file: Path = None) -> bool:
        action = "move" if self.delete_local else "copy"
        success = True

        # 1. Đồng bộ chapters: chapters/{slug} -> gdrive:chapters/{slug}
        if local_comic_dir.exists() and any(local_comic_dir.iterdir()):
            remote_target = f"{self.rclone_remote}:chapters/{slug}"
            cmd = [
                "rclone", action, str(local_comic_dir), remote_target,
                "--drive-root-folder-id", self.folder_id,
                "--transfers", "16",
                "--checkers", "8",
                "--retries", "3",
                "--low-level-retries", "10",
                "--stats", "5s"
            ]
            if self.delete_local:
                cmd.append("--delete-empty-src-dirs")

            try:
                res = subprocess.run(cmd, capture_output=True, text=True)
                if res.returncode != 0:
                    log_error(f"Rclone {action} chapters thất bại: {res.stderr.strip()[:200]}")
                    success = False
                else:
                    log_success(f"Đã lưu toàn bộ chapter '{slug}' lên Google Drive (rclone {action})!")
            except Exception as e:
                log_error(f"Lỗi thực thi rclone: {e}")
                success = False

        # 2. Đồng bộ cover: covers/{slug}.webp -> gdrive:covers/{slug}.webp
        if cover_file and cover_file.exists():
            remote_cover_dir = f"{self.rclone_remote}:covers"
            cmd_cover = [
                "rclone", action, str(cover_file.parent), remote_cover_dir,
                "--include", cover_file.name,
                "--drive-root-folder-id", self.folder_id,
                "--retries", "3"
            ]
            try:
                res = subprocess.run(cmd_cover, capture_output=True, text=True)
                if res.returncode != 0:
                    log_warning(f"Rclone upload ảnh bìa thất bại: {res.stderr.strip()[:100]}")
            except Exception:
                pass

        return success

    def _sync_via_mount(self, local_comic_dir: Path, slug: str, cover_file: Path = None, info_file: Path = None) -> bool:
        target_chapters = self.drive_path / "chapters" / slug
        target_covers = self.drive_path / "covers"
        target_chapters.mkdir(parents=True, exist_ok=True)
        target_covers.mkdir(parents=True, exist_ok=True)

        try:
            if cover_file and cover_file.exists():
                dest_cover = target_covers / cover_file.name
                if self.delete_local:
                    shutil.move(str(cover_file), str(dest_cover))
                else:
                    shutil.copy2(str(cover_file), str(dest_cover))

            if local_comic_dir.exists():
                for item in local_comic_dir.iterdir():
                    dest = target_chapters / item.name
                    if item.is_dir():
                        if dest.exists():
                            shutil.rmtree(dest)
                        if self.delete_local:
                            shutil.move(str(item), str(dest))
                        else:
                            shutil.copytree(str(item), str(dest))
                    else:
                        if self.delete_local:
                            shutil.move(str(item), str(dest))
                        else:
                            shutil.copy2(str(item), str(dest))
                if self.delete_local and local_comic_dir.exists():
                    shutil.rmtree(local_comic_dir, ignore_errors=True)
            log_success(f"Đã sao chép truyện '{slug}' vào Google Drive Mount!")
            return True
        except Exception as e:
            log_error(f"Lỗi khi copy vào Mount Drive: {e}")
            return False

    def _sync_via_google_api(self, local_comic_dir: Path, slug: str, cover_file: Path = None, info_file: Path = None) -> bool:
        try:
            from google.oauth2 import service_account
            from googleapiclient.discovery import build
            from googleapiclient.http import MediaFileUpload

            creds = service_account.Credentials.from_service_account_file(
                str(self.service_account_path),
                scopes=['https://www.googleapis.com/auth/drive']
            )
            service = build('drive', 'v3', credentials=creds)

            def get_or_create_subfolder(parent_id: str, folder_name: str) -> str:
                q = f"'{parent_id}' in parents and name = '{folder_name}' and mimeType = 'application/vnd.google-apps.folder' and trashed = false"
                res = service.files().list(q=q, fields="files(id, name)").execute()
                files = res.get('files', [])
                if files:
                    return files[0]['id']
                meta = {'name': folder_name, 'mimeType': 'application/vnd.google-apps.folder', 'parents': [parent_id]}
                f = service.files().create(body=meta, fields='id').execute()
                return f.get('id')

            def upload_file(parent_id: str, file_path: Path, mime: str = "image/webp"):
                media = MediaFileUpload(str(file_path), mimetype=mime, resumable=True)
                body = {'name': file_path.name, 'parents': [parent_id]}
                service.files().create(body=body, media_body=media).execute()

            covers_folder_id = get_or_create_subfolder(self.folder_id, "covers")
            if cover_file and cover_file.exists():
                upload_file(covers_folder_id, cover_file, "image/webp")
                if self.delete_local:
                    cover_file.unlink(missing_ok=True)

            chapters_folder_id = get_or_create_subfolder(self.folder_id, "chapters")
            manga_folder_id = get_or_create_subfolder(chapters_folder_id, slug)

            if local_comic_dir.exists():
                for chap_dir in sorted(local_comic_dir.iterdir()):
                    if chap_dir.is_dir():
                        chap_id = get_or_create_subfolder(manga_folder_id, chap_dir.name)
                        for img in sorted(chap_dir.glob("*.webp")):
                            upload_file(chap_id, img, "image/webp")
                            if self.delete_local:
                                img.unlink(missing_ok=True)
                        if self.delete_local:
                            shutil.rmtree(chap_dir, ignore_errors=True)
                    elif chap_dir.is_file():
                        upload_file(manga_folder_id, chap_dir, "application/json")
                        if self.delete_local:
                            chap_dir.unlink(missing_ok=True)

                if self.delete_local:
                    shutil.rmtree(local_comic_dir, ignore_errors=True)

            log_success(f"Đã upload '{slug}' lên Google Drive qua Google Drive API thành công!")
            return True
        except Exception as e:
            log_error(f"Lỗi khi upload bằng Google Drive API: {e}")
            return False


# =============================================================================
# MANGADEX API CLIENT (RATE LIMITING & ORIGINAL QUALITY / DATA-SAVER)
# =============================================================================
class MangaDexClient:
    def __init__(self, lang: str = DEFAULT_LANG):
        self.lang = lang
        self.session = requests.Session()
        self.session.headers.update({"User-Agent": "TruyenKomi-Ubuntu-Sync/2.0 (https://truyenkomi.site)"})
        self._last_request_time = 0.0
        self._min_interval = 0.22

    def _rate_limited_get(self, url: str, params: dict = None, timeout: int = DEFAULT_TIMEOUT) -> requests.Response:
        for attempt in range(MAX_RETRIES):
            now = time.time()
            elapsed = now - self._last_request_time
            if elapsed < self._min_interval:
                time.sleep(self._min_interval - elapsed)

            self._last_request_time = time.time()
            try:
                res = self.session.get(url, params=params, timeout=timeout)
                if res.status_code == 200:
                    return res
                elif res.status_code == 429:
                    wait_sec = (attempt + 1) * 2.5
                    log_warning(f"MangaDex Rate Limit (HTTP 429). Tạm dừng {wait_sec}s rồi thử lại...")
                    time.sleep(wait_sec)
                elif res.status_code in (500, 502, 503, 504):
                    time.sleep(1.5 * (attempt + 1))
                else:
                    return res
            except requests.exceptions.RequestException as e:
                time.sleep(1.5 * (attempt + 1))
                if attempt == MAX_RETRIES - 1:
                    raise e
        return res

    def extract_manga_id(self, input_val: str) -> str:
        input_val = input_val.strip()
        uuid_pattern = r'[0-9a-fA-F]{8}-[0-9a-fA-F]{4}-[0-9a-fA-F]{4}-[0-9a-fA-F]{4}-[0-9a-fA-F]{12}'
        
        if "/chapter/" in input_val:
            m = re.search(rf'/chapter/({uuid_pattern})', input_val)
            if m:
                res = self._rate_limited_get(f"{MANGADEX_API_BASE}/chapter/{m.group(1)}?includes[]=manga")
                if res.status_code == 200:
                    for rel in res.json().get("data", {}).get("relationships", []):
                        if rel.get("type") == "manga":
                            return rel.get("id")

        m_title = re.search(rf'/title/({uuid_pattern})', input_val)
        if m_title:
            return m_title.group(1)

        m_uuid = re.search(uuid_pattern, input_val)
        if m_uuid:
            return m_uuid.group(0)

        return input_val

    def get_total_vietnamese_manga_count(self) -> int:
        url = f"{MANGADEX_API_BASE}/manga"
        params = {"limit": 1, "availableTranslatedLanguage[]": [self.lang], "hasAvailableChapters": "true"}
        res = self._rate_limited_get(url, params=params)
        if res and res.status_code == 200:
            return res.json().get("total", 0)
        return 0

    def iterate_all_vietnamese_manga(self, order_by: str = "oldest", start_offset: int = 0, limit: int = None):
        offset = start_offset
        batch_limit = 100
        fetched = 0

        while True:
            params = {
                "limit": batch_limit,
                "offset": offset,
                "availableTranslatedLanguage[]": [self.lang],
                "hasAvailableChapters": "true",
                "includes[]": ["cover_art", "author", "artist", "tag"],
                "contentRating[]": ["safe", "suggestive", "erotica", "pornographic"]
            }
            if order_by in ("oldest", "created_at_asc", "asc"):
                params["order[createdAt]"] = "asc"
            elif order_by in ("newest_created", "created_at_desc"):
                params["order[createdAt]"] = "desc"
            else:
                params["order[latestUploadedChapter]"] = "desc"

            url = f"{MANGADEX_API_BASE}/manga"
            res = self._rate_limited_get(url, params=params)
            if not res or res.status_code != 200:
                break

            data = res.json()
            items = data.get("data", [])
            total = data.get("total", 0)
            if not items:
                break

            for m in items:
                m_id = m.get("id")
                attr = m.get("attributes", {})
                title_dict = attr.get("title", {})

                vi_title = None
                for alt in attr.get("altTitles", []):
                    if self.lang in alt:
                        vi_title = alt[self.lang]
                        break

                orig_title = list(title_dict.values())[0] if title_dict else "Unknown"
                title = vi_title or title_dict.get("en") or orig_title

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
                    "title": title,
                    "slug": slugify(title),
                    "author": ", ".join(authors) if authors else "Đang cập nhật",
                    "cover_url": cover_url,
                    "tags": tags,
                    "url": f"https://mangadex.org/title/{m_id}",
                    "total_available": total,
                    "offset": offset
                }
                yield item
                fetched += 1
                if limit and fetched >= limit:
                    return

            offset += len(items)
            if offset >= total:
                break

    def get_manga_details_and_chapters(self, manga_id: str) -> dict:
        url = f"{MANGADEX_API_BASE}/manga/{manga_id}?includes[]=cover_art&includes[]=author&includes[]=artist&includes[]=tag"
        res = self._rate_limited_get(url)
        if not res or res.status_code != 200:
            raise Exception(f"Không thể lấy thông tin truyện MangaDex ID {manga_id}")

        data = res.json().get("data", {})
        attr = data.get("attributes", {})
        title_dict = attr.get("title", {})

        vi_title = None
        alt_names = []
        for alt in attr.get("altTitles", []):
            for k, v in alt.items():
                if v and v not in alt_names:
                    alt_names.append(v)
                if k == self.lang and not vi_title:
                    vi_title = v

        orig_title = list(title_dict.values())[0] if title_dict else "Unknown"
        title = vi_title or title_dict.get("en") or orig_title
        slug = slugify(title)

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

        author = ", ".join(authors) if authors else "Đang cập nhật"
        cover_url = f"{MANGADEX_UPLOADS_BASE}/covers/{manga_id}/{cover_filename}" if cover_filename else None
        genres = [t.get("attributes", {}).get("name", {}).get("en") for t in attr.get("tags", []) if t.get("attributes", {}).get("name")]

        chapters_raw = []
        limit = 500
        offset = 0
        while True:
            feed_url = f"{MANGADEX_API_BASE}/manga/{manga_id}/feed"
            feed_params = {
                "translatedLanguage[]": [self.lang],
                "order[chapter]": "asc",
                "limit": limit,
                "offset": offset,
                "includes[]": ["scanlation_group"],
                "contentRating[]": ["safe", "suggestive", "erotica", "pornographic"]
            }
            f_res = self._rate_limited_get(feed_url, params=feed_params)
            if not f_res or f_res.status_code != 200:
                break
            f_data = f_res.json()
            ch_list = f_data.get("data", [])
            chapters_raw.extend(ch_list)
            total_ch = f_data.get("total", 0)
            offset += limit
            if offset >= total_ch or not ch_list:
                break

        grouped = {}
        for c in chapters_raw:
            c_attr = c.get("attributes", {})
            chap_str = c_attr.get("chapter")
            try:
                chap_num = float(chap_str) if chap_str else 0.0
            except ValueError:
                chap_num = 0.0

            chap_id = c.get("id")
            chap_title = c_attr.get("title") or f"Chương {int(chap_num) if chap_num.is_integer() else chap_num}"
            pages = int(c_attr.get("pages") or 0)

            groups = []
            for rel in c.get("relationships", []):
                if rel.get("type") == "scanlation_group":
                    g_name = rel.get("attributes", {}).get("name")
                    if g_name:
                        groups.append(g_name)
            group_name = ", ".join(groups) if groups else "MangaDex Community"

            obj = {
                "id": chap_id,
                "number": chap_num,
                "title": chap_title,
                "pages": pages,
                "group": group_name,
                "published_at": c_attr.get("publishAt") or c_attr.get("createdAt")
            }

            if chap_num not in grouped or pages > grouped[chap_num].get("pages", 0):
                grouped[chap_num] = obj

        chapters = list(grouped.values())
        chapters.sort(key=lambda x: x["number"])

        return {
            "id": manga_id,
            "title": title,
            "slug": slug,
            "author": author,
            "other_names": alt_names[:5],
            "cover_url": cover_url,
            "genres": genres,
            "chapters": chapters
        }

    def get_chapter_image_urls(self, chapter_id: str, data_saver: bool = DEFAULT_DATA_SAVER) -> list:
        """Lấy danh sách link ảnh từ MangaDex @Home (Mặc định: ẢNH GỐC nếu data_saver=False)"""
        server_url = f"{MANGADEX_API_BASE}/at-home/server/{chapter_id}"
        res = self._rate_limited_get(server_url)
        if not res or res.status_code != 200:
            return []

        json_data = res.json()
        base_url = json_data.get("baseUrl")
        ch = json_data.get("chapter", {})
        ch_hash = ch.get("hash")

        if data_saver:
            files = ch.get("dataSaver", [])
            return [f"{base_url}/data-saver/{ch_hash}/{fn}" for fn in files]
        else:
            # ẢNH GỐC (Original Quality) theo đúng setting checkbox
            files = ch.get("data", [])
            return [f"{base_url}/data/{ch_hash}/{fn}" for fn in files]


# =============================================================================
# BỘ TẢI VÀ ĐỒNG BỘ CHUYÊN SÂU (ENGINE CHÍNH)
# =============================================================================
class MangaDexDriveSynchronizer:
    def __init__(
        self,
        folder_id: str = DEFAULT_DRIVE_FOLDER_ID,
        rclone_remote: str = "gdrive",
        drive_path: str = None,
        service_account: str = None,
        temp_dir: str = TEMP_DOWNLOAD_DIR,
        workers: int = DEFAULT_WORKERS,
        upload_to_web: bool = DEFAULT_UPLOAD_TO_WEB,
        skip_existing: bool = DEFAULT_SKIP_EXISTING,
        data_saver: bool = DEFAULT_DATA_SAVER,
        merge_slices: bool = DEFAULT_MERGE_SLICES,
        make_pdf: bool = DEFAULT_MAKE_PDF,
        delete_local: bool = True,
        lang: str = DEFAULT_LANG
    ):
        self.client = MangaDexClient(lang=lang)
        self.uploader = GoogleDriveUploader(
            folder_id=folder_id,
            rclone_remote=rclone_remote,
            drive_path=drive_path,
            service_account_path=service_account,
            delete_local=delete_local
        )
        self.temp_root = Path(temp_dir).resolve()
        self.temp_root.mkdir(parents=True, exist_ok=True)
        self.state = SyncStateManager(self.temp_root / STATE_FILE_NAME)
        self.workers = workers
        self.upload_to_web = upload_to_web
        self.skip_existing = skip_existing
        self.data_saver = data_saver
        self.merge_slices = merge_slices
        self.make_pdf = make_pdf
        self.delete_local = delete_local

    def _download_single_image(self, url: str, target_path: Path) -> bool:
        target_path.parent.mkdir(parents=True, exist_ok=True)
        for attempt in range(MAX_RETRIES):
            try:
                res = requests.get(url, timeout=DEFAULT_TIMEOUT)
                if res.status_code == 200 and len(res.content) > 500:
                    with open(target_path, "wb") as f:
                        f.write(res.content)
                    return True
                elif res.status_code == 429:
                    time.sleep(2 * (attempt + 1))
            except Exception:
                time.sleep(1)
        return False

    def _convert_to_webp(self, src_file: Path, dest_webp_file: Path, quality: int = 90) -> bool:
        try:
            with Image.open(src_file) as im:
                im.load()
                if im.mode != 'RGB':
                    im = im.convert('RGB')
                im.save(dest_webp_file, 'WEBP', quality=quality, method=6)
            if src_file != dest_webp_file and src_file.exists():
                src_file.unlink(missing_ok=True)
            return True
        except Exception:
            return False

    def sync_single_manga(self, manga_id_or_url: str) -> bool:
        manga_id = self.client.extract_manga_id(manga_id_or_url)
        if self.state.is_completed(manga_id) and self.skip_existing:
            log_info(f"Bộ truyện ID {manga_id} đã được đồng bộ hoàn chỉnh trên Drive. Bỏ qua.")
            return True

        info = self.client.get_manga_details_and_chapters(manga_id)
        title = info["title"]
        slug = info["slug"]
        chapters = info["chapters"]

        log_info(f"▶ Đang xử lý: [bold]{title}[/bold] (Slug: {slug}) | {len(chapters)} chapters")

        local_comic_dir = self.temp_root / "chapters" / slug
        local_covers_dir = self.temp_root / "covers"
        local_comic_dir.mkdir(parents=True, exist_ok=True)
        local_covers_dir.mkdir(parents=True, exist_ok=True)

        # 1. Tải và xử lý ảnh bìa
        cover_path = None
        if info.get("cover_url"):
            raw_cover = local_covers_dir / f"{slug}_raw.jpg"
            target_cover = local_covers_dir / f"{slug}.webp"
            if not target_cover.exists():
                if self._download_single_image(info["cover_url"], raw_cover):
                    if self._convert_to_webp(raw_cover, target_cover):
                        cover_path = target_cover
                    else:
                        cover_path = raw_cover
            else:
                cover_path = target_cover

        # 2. Ghi metadata info.json
        info_json_file = local_comic_dir / "info.json"
        try:
            with open(info_json_file, "w", encoding="utf-8") as f:
                json.dump({
                    "id": manga_id,
                    "title": title,
                    "slug": slug,
                    "author": info["author"],
                    "other_names": info["other_names"],
                    "genres": info["genres"],
                    "total_chapters": len(chapters),
                    "mangadex_url": f"https://mangadex.org/title/{manga_id}",
                    "synced_at": datetime.now(timezone.utc).isoformat()
                }, f, ensure_ascii=False, indent=2)
        except Exception:
            pass

        # 3. Tải từng chapter (Có kiểm tra skip_existing & tự động ghép ảnh Manhwa 5-in-1 khi > 70 ảnh)
        total_pages_downloaded = 0
        skipped_chaps = 0

        for idx, chap in enumerate(chapters, 1):
            num = chap["number"]
            num_str = f"{int(num)}" if float(num).is_integer() else f"{num}"
            chap_dir = local_comic_dir / f"chap{num_str}"

            # ☑️ Bỏ qua chapter đã có trên máy / thư mục (Tránh tải trùng / Resume)
            if self.skip_existing and chap_dir.exists():
                existing_webp = list(chap_dir.glob("page_*.webp")) or list(chap_dir.glob("*.webp"))
                if len(existing_webp) >= 1:
                    skipped_chaps += 1
                    continue

            chap_dir.mkdir(parents=True, exist_ok=True)

            # Tải danh sách ảnh (data_saver=False -> ẢNH GỐC)
            img_urls = self.client.get_chapter_image_urls(chap["id"], data_saver=self.data_saver)
            if not img_urls:
                continue

            num_raw = len(img_urls)
            # ☑️ Ghép ảnh Manhwa 5-in-1 khi chapter > 70 ảnh hoặc khi bật merge_slices
            should_stitch = self.merge_slices and (num_raw > AUTO_STITCH_THRESHOLD)

            download_dir = chap_dir / "_temp_slices" if should_stitch else chap_dir
            download_dir.mkdir(parents=True, exist_ok=True)

            raw_paths = []
            with ThreadPoolExecutor(max_workers=self.workers) as pool:
                futures = {}
                for p_idx, u in enumerate(img_urls, 1):
                    p_file = download_dir / f"raw_{p_idx:04d}.jpg"
                    raw_paths.append(p_file)
                    f = pool.submit(self._download_single_image, u, p_file)
                    futures[f] = p_file
                for f in as_completed(futures):
                    pass

            downloaded_raw = sorted([p for p in raw_paths if p.exists()])

            if should_stitch:
                # Ghép 5 lát cắt manhwa thành 1 ảnh dài WebP
                final_paths = merge_images_vertical(downloaded_raw, chap_dir, group_size=STITCH_GROUP_SIZE)
                total_pages_downloaded += len(final_paths)
                shutil.rmtree(download_dir, ignore_errors=True)
            else:
                for p_idx, p_file in enumerate(downloaded_raw, 1):
                    final_webp = chap_dir / f"page_{p_idx:03d}.webp"
                    self._convert_to_webp(p_file, final_webp, quality=90)
                    total_pages_downloaded += 1

            if idx % 10 == 0 or idx == len(chapters):
                log_info(f"  ✓ Tiến độ tải: {idx}/{len(chapters)} chapters (Đã lưu: {total_pages_downloaded} trang ảnh)...")

        if skipped_chaps > 0:
            log_info(f"  ⏭️ Đã bỏ qua {skipped_chaps} chapters đã tồn tại trên máy.")

        # 4. ☑️ Tự động tải lên Cloud Storage & Đồng bộ Web API / Google Drive
        if self.upload_to_web:
            log_info(f"☁️ Đang đồng bộ bộ truyện '{title}' lên Google Drive (Folder ID: {self.uploader.folder_id})...")
            sync_ok = self.uploader.sync_manga_folder(
                local_comic_dir=local_comic_dir,
                slug=slug,
                cover_file=cover_path,
                info_file=info_json_file
            )
            if sync_ok:
                self.state.mark_completed(
                    manga_id=manga_id,
                    title=title,
                    slug=slug,
                    chapters_count=len(chapters),
                    pages_count=total_pages_downloaded
                )
                log_success(f"🎉 Hoàn tất lưu trữ bộ truyện '{title}' lên Google Drive!\n")
                return True
            else:
                self.state.mark_failed(manga_id, title, "Lỗi khi đồng bộ lên Google Drive")
                return False
        else:
            log_info(f"Đã lưu truyện '{title}' tại thư mục cục bộ (Chế độ lưu máy).\n")
            return True

    def sync_all_vietnamese_manga(self, order_by: str = "oldest", start_offset: int = 0, limit: int = None):
        total_available = self.client.get_total_vietnamese_manga_count()
        log_info(f"🚀 BẮT ĐẦU ĐỒNG BỘ TOÀN BỘ MANGADEX LÊN GOOGLE DRIVE")
        log_info(f"• Tổng số truyện Tiếng Việt trên MangaDex: {total_available} bộ")
        log_info(f"• Google Drive Folder ID: {self.uploader.folder_id}")
        log_info(f"• Phương thức lưu trữ: {self.uploader.backend.upper()}")
        log_info(f"• Đồng bộ Web & Cloud: {'BẬT (☑️)' if self.upload_to_web else 'TẮT'}")
        log_info(f"• Bỏ qua chapter đã có: {'BẬT (☑️)' if self.skip_existing else 'TẮT'}")
        log_info(f"• MangaDex Data-Saver: {'BẬT' if self.data_saver else 'TẮT (⬜ - Tải ẢNH GỐC chất lượng tối đa)'}")
        log_info(f"• Ghép ảnh Manhwa 5-in-1 (>70 ảnh): {'BẬT (☑️)' if self.merge_slices else 'TẮT'}")
        log_info(f"• Số luồng tải song song: {self.workers} luồng\n")

        manga_generator = self.client.iterate_all_vietnamese_manga(
            order_by=order_by,
            start_offset=start_offset,
            limit=limit
        )

        count = 0
        for item in manga_generator:
            count += 1
            m_id = item["id"]
            title = item["title"]

            if self.state.is_completed(m_id) and self.skip_existing:
                log_info(f"[{count}] ⏭️ Đã có trên Drive: {title} (Bỏ qua)")
                continue

            log_info(f"━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━")
            log_info(f"▶ [{count}] Đang tải: {title} (ID: {m_id})")
            log_info(f"✍️ Tác giả: {item['author']}")

            try:
                self.sync_single_manga(m_id)
            except Exception as e:
                log_error(f"Lỗi khi xử lý truyện '{title}': {e}")
                self.state.mark_failed(m_id, title, str(e))

            time.sleep(0.5)

        log_success("🎉 ĐÃ HOÀN TẤT TIẾN TRÌNH ĐỒNG BỘ TRUYỆN MANGADEX LÊN GOOGLE DRIVE!")


# =============================================================================
# HÀM MAIN & PARSER THAM SỐ
# =============================================================================
def main():
    parser = argparse.ArgumentParser(
        description="🚀 Tải truyện MangaDex (Tiếng Việt) và lưu trữ trực tiếp vào Google Drive",
        formatter_class=argparse.RawDescriptionHelpFormatter,
        epilog="""
Cấu hình mặc định chuẩn hóa theo GUI:
  - Đồng bộ Web & Cloud: BẬT
  - Bỏ qua chapter đã có (Resume): BẬT
  - MangaDex Data-Saver: TẮT (Tải ẢNH GỐC)
  - Ghép ảnh Manhwa 5-in-1 (>70 ảnh): BẬT
  - Xuất PDF: TẮT
  - Số luồng tải: 16 luồng
        """
    )
    parser.add_argument("--all", action="store_true", help="Tải toàn bộ truyện Tiếng Việt trên MangaDex")
    parser.add_argument("--url", "--manga", default=None, help="URL hoặc MangaDex UUID của bộ truyện muốn tải")
    parser.add_argument("--folder-id", default=DEFAULT_DRIVE_FOLDER_ID, help=f"Google Drive Folder ID (Mặc định: {DEFAULT_DRIVE_FOLDER_ID})")
    parser.add_argument("--remote", default="gdrive", help="Tên remote trong Rclone (Mặc định: gdrive)")
    parser.add_argument("--drive-path", default=None, help="Đường dẫn thư mục Google Drive đã mount trên máy")
    parser.add_argument("--service-account", default=None, help="Đường dẫn file service_account.json của Google API")
    parser.add_argument("--offset", type=int, default=0, help="Vị trí bắt đầu tải (Mặc định: 0)")
    parser.add_argument("--limit", type=int, default=None, help="Số lượng truyện tối đa muốn tải (Mặc định: Tất cả)")
    parser.add_argument("--order", choices=["oldest", "latest", "newest_created"], default="oldest", help="Thứ tự duyệt truyện (Mặc định: oldest)")
    parser.add_argument("--workers", type=int, default=DEFAULT_WORKERS, help=f"Số luồng tải ảnh song song (Mặc định: {DEFAULT_WORKERS})")
    parser.add_argument("--data-saver", action="store_true", default=DEFAULT_DATA_SAVER, help="Bật Data-Saver (Mặc định: TẮT - Tải ảnh gốc)")
    parser.add_argument("--no-merge", action="store_true", help="Tắt tự động ghép ảnh Manhwa 5-in-1")
    parser.add_argument("--no-skip", action="store_true", help="Tắt bỏ qua chapter đã có trên máy")
    parser.add_argument("--no-upload", action="store_true", help="Chỉ tải lưu cục bộ, không đẩy lên Cloud/Drive")
    parser.add_argument("--keep-local", action="store_true", help="Không xóa file tạm cục bộ sau khi đẩy lên Drive")
    parser.add_argument("--lang", default=DEFAULT_LANG, help=f"Mã ngôn ngữ bản dịch (Mặc định: {DEFAULT_LANG})")

    args = parser.parse_args()

    sync_engine = MangaDexDriveSynchronizer(
        folder_id=args.folder_id,
        rclone_remote=args.remote,
        drive_path=args.drive_path,
        service_account=args.service_account,
        workers=args.workers,
        upload_to_web=not args.no_upload,
        skip_existing=not args.no_skip,
        data_saver=args.data_saver,
        merge_slices=not args.no_merge,
        delete_local=not args.keep_local,
        lang=args.lang
    )

    if args.url:
        sync_engine.sync_single_manga(args.url)
    elif args.all:
        sync_engine.sync_all_vietnamese_manga(order_by=args.order, start_offset=args.offset, limit=args.limit)
    else:
        print("💡 Gợi ý: Chạy lệnh './tai_mangadex_drive.sh' hoặc thêm cờ '--all' để bắt đầu.")
        parser.print_help()


if __name__ == "__main__":
    main()

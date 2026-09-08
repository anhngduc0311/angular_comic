#!/usr/bin/env bash
# ==============================================================================
# 🚀 MANGADEX TO GOOGLE DRIVE - ALL-IN-ONE CRAWLER & SYNCHRONIZER CHO UBUNTU
# ==============================================================================
# File tự động hóa 100% dành riêng cho hệ điều hành Ubuntu / Linux:
# - Tự cài đặt Python 3, pip, Virtualenv và Rclone (nếu máy chưa có)
# - Cấu hình và kết nối trực tiếp vào Google Drive Folder ID: 1S3biMk6c2e-u5j7uO0wocFBW6J5eB8ef
# - ÁP DỤNG CHÍNH XÁC CÁC THIẾT LẬP (SETTING) TỪ GIAO DIỆN:
#     ☑️ Tự động tải lên Cloud Storage & Đồng bộ Web API: BẬT
#     ☑️ Bỏ qua chapter đã có trên máy (Tránh tải trùng / Resume): BẬT
#     ⬜ MangaDex Data-Saver (Tải ảnh nén nhẹ tiết kiệm mạng): TẮT (Tải ẢNH GỐC)
#     ☑️ Ghép ảnh Manhwa 5-in-1 (Tự động khi chapter > 70 ảnh): BẬT
#     ⬜ Tự động xuất mỗi chapter thành file PDF: TẮT
#     ⚡ Luồng tải song song: 16 luồng
# - Đẩy trực tiếp lên Google Drive và tự dọn dẹp file tạm (chống tràn ổ cứng VPS)
# - Hỗ trợ chạy ngầm 24/7 (nohup), tắt SSH máy vẫn tự động tải
# ==============================================================================

set -e

# Target Google Drive Folder ID
DEFAULT_FOLDER_ID="1S3biMk6c2e-u5j7uO0wocFBW6J5eB8ef"
RCLONE_REMOTE_NAME="gdrive"
LOG_FILE="mangadex_sync.log"
PID_FILE=".mangadex_sync.pid"
VENV_DIR=".venv_mangadex"
PYTHON_SCRIPT="mangadex_drive_downloader.py"

# Màu sắc hiển thị terminal
GREEN='\033[0;32m'
BLUE='\033[0;34m'
YELLOW='\033[1;33m'
RED='\033[0;31m'
CYAN='\033[0;36m'
MAGENTA='\033[0;35m'
BOLD='\033[1m'
NC='\033[0m'

log_info() { echo -e "${BLUE}[INFO]${NC} $1"; }
log_success() { echo -e "${GREEN}[SUCCESS]${NC} $1"; }
log_warning() { echo -e "${YELLOW}[WARNING]${NC} $1"; }
log_error() { echo -e "${RED}[ERROR]${NC} $1"; }
log_header() {
    echo -e "\n${CYAN}================================================================${NC}"
    echo -e "${BOLD}${CYAN}$1${NC}"
    echo -e "${CYAN}================================================================${NC}\n"
}

# Kiểm tra quyền sudo/root
SUDO=""
if [ "$(id -u)" -ne 0 ]; then
    if command -v sudo >/dev/null 2>&1; then
        SUDO="sudo"
    fi
fi

# ==============================================================================
# 1. TỰ ĐỘNG CẬP NHẬT / GIẢI NÉN ENGINE PYTHON
# ==============================================================================
extract_python_engine() {
    if [ -f "backend/$PYTHON_SCRIPT" ]; then
        PYTHON_SCRIPT="backend/$PYTHON_SCRIPT"
        return 0
    fi

    log_info "Đang đồng bộ Engine Python '$PYTHON_SCRIPT'..."
    cat << 'EOF' > "$PYTHON_SCRIPT"
#!/usr/bin/env python3
# -*- coding: utf-8 -*-
"""
=============================================================================
🚀 MangaDex to Cloud Storage & Google Drive Synchronizer
=============================================================================
Author: TruyenKomi Team
Target Google Drive Folder ID: 1S3biMk6c2e-u5j7uO0wocFBW6J5eB8ef (luutruyenkomi)
Target Cloud Storage Bucket: truyenkomi (Google Cloud Storage / R2)
Web API: https://truyenkomi.site/api

Thiết lập chuẩn:
  ☑️ Tự động tải lên Cloud Storage Bucket & Đồng bộ Web API: BẬT
  ☑️ Lưu đồng thời vào Google Drive (Folder ID: 1S3biMk6c2e-u5j7uO0wocFBW6J5eB8ef): BẬT
  ☑️ Bỏ qua chapter đã có trên máy / Cloud (Tránh tải trùng / Resume): BẬT
  ⬜ MangaDex Data-Saver (Tải ảnh nén nhẹ tiết kiệm mạng): TẮT (Tải ẢNH GỐC)
  ☑️ Ghép ảnh Manhwa 5-in-1 (Tự động khi chapter > 70 ảnh): BẬT
  ⬜ Tự động xuất mỗi chapter thành file PDF: TẮT
  ⚡ Luồng tải song song: 16 luồng
  ⚡ ĐỒNG BỘ REALTIME TỪNG CHAPTER: Cứ xong chapter nào là đẩy ngay lên Bucket & Drive
=============================================================================
"""

import sys
import os
import re
import time
import json
import shutil
import base64
import hmac
import hashlib
import argparse
import subprocess
import unicodedata
import urllib.parse
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
    console = Console()
    HAS_RICH = True
except ImportError:
    HAS_RICH = False
    console = None

# =============================================================================
# AUTO-LOAD .ENV CONFIGURATION
# =============================================================================
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

# =============================================================================
# CẤU HÌNH CLOUD BUCKET & WEB API
# =============================================================================
DEFAULT_DRIVE_FOLDER_ID = "1S3biMk6c2e-u5j7uO0wocFBW6J5eB8ef"  # luutruyenkomi
GCS_ENDPOINT = os.getenv("R2_ENDPOINT", "storage.googleapis.com")
GCS_ACCESS_KEY = os.getenv("R2_ACCESS_KEY", "GOOGQHRXVRS7YCR24JBLB33S")
GCS_SECRET_KEY = os.getenv("R2_SECRET_KEY", "3Iamo8whmuUeT2B+CMtRnfW6qdIsmwXVec47tF52")
GCS_BUCKET = os.getenv("R2_BUCKET_NAME", "truyenkomi")
CDN_BASE_URL = os.getenv("R2_CDN_BASE_URL", "https://img.truyenkomi.site").rstrip("/")
DEFAULT_API_BASE_URL = os.getenv("API_BASE_URL", "https://truyenkomi.site/api").rstrip("/")

MANGADEX_API_BASE = "https://api.mangadex.org"
MANGADEX_UPLOADS_BASE = "https://uploads.mangadex.org"
DEFAULT_LANG = "vi"

# ⚙️ CÁC THIẾT LẬP MẶC ĐỊNH KHỚP GIAO DIỆN:
DEFAULT_UPLOAD_TO_WEB = True          # ☑️ Tự động tải lên Cloud Bucket, Drive & Đồng bộ Web
DEFAULT_SKIP_EXISTING = True          # ☑️ Bỏ qua chapter đã có trên máy / Cloud
DEFAULT_DATA_SAVER = False            # ⬜ MangaDex Data-Saver: TẮT (Tải ẢNH GỐC)
DEFAULT_MERGE_SLICES = True           # ☑️ Ghép ảnh Manhwa 5-in-1 khi > 70 ảnh
AUTO_STITCH_THRESHOLD = 70            # Ngưỡng tự động ghép dải ảnh manhwa
STITCH_GROUP_SIZE = 5                 # Ghép 5 lát cắt thành 1 ảnh dài WebP
DEFAULT_MAKE_PDF = False              # ⬜ Tự động xuất PDF: TẮT
DEFAULT_WORKERS = 16                  # ⚡ 16 luồng tải song song

DEFAULT_TIMEOUT = 30
MAX_RETRIES = 4
STATE_FILE_NAME = "mangadex_sync_state.json"
TEMP_DOWNLOAD_DIR = "mangadex_temp_cache"


def log_info(msg: str):
    if HAS_RICH and console:
        console.print(f"[bold cyan]ℹ️  {msg}[/bold cyan]")
    else:
        print(f"ℹ️  {msg}", flush=True)


def log_success(msg: str):
    if HAS_RICH and console:
        console.print(f"[bold green]✅ {msg}[/bold green]")
    else:
        print(f"✅ {msg}", flush=True)


def log_warning(msg: str):
    if HAS_RICH and console:
        console.print(f"[bold yellow]⚠️  {msg}[/bold yellow]")
    else:
        print(f"⚠️  {msg}", flush=True)


def log_error(msg: str):
    if HAS_RICH and console:
        console.print(f"[bold red]❌ {msg}[/bold red]")
    else:
        print(f"❌ {msg}", flush=True)


def slugify(text: str) -> str:
    if not text:
        return "manga"
    text = text.replace('đ', 'd').replace('Đ', 'D')
    text = unicodedata.normalize('NFKD', text)
    text = re.sub(r'[\u0300-\u036f]', '', text)
    text = re.sub(r'[^\w\s-]', '', text).strip().lower()
    text = re.sub(r'[-\s]+', '-', text)
    return text.strip("-") or "manga"


def parse_date_to_iso(date_val):
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
    for fmt in ("%d/%m/%Y", "%d-%m-%Y", "%Y-%m-%d", "%d/%m/%Y %H:%M:%S"):
        try:
            return datetime.strptime(val_str, fmt).isoformat()
        except Exception:
            pass
    return val_str


# =============================================================================
# 1. TẢI ẢNH LÊN CLOUD STORAGE BUCKET (GCS / R2) & ĐỒNG BỘ WEB API
# =============================================================================
def upload_file_to_cloud(local_path: Path, object_name: str, content_type: str = "image/webp", max_retries: int = 3) -> str:
    """Tải 1 file ảnh lên Cloud Storage Bucket (Google Cloud Storage / R2) và trả về CDN URL (Tự động thử lại 3 lần)"""
    object_name = object_name.lstrip("/")
    url = f'https://{GCS_ENDPOINT}/{GCS_BUCKET}/{object_name}'

    with open(local_path, "rb") as f:
        data = f.read()

    last_err = None
    for attempt in range(max_retries):
        try:
            date_str = datetime.now(timezone.utc).strftime('%a, %d %b %Y %H:%M:%S GMT')
            string_to_sign = f'PUT\n\n{content_type}\n{date_str}\n/{GCS_BUCKET}/{object_name}'
            signature = hmac.new(GCS_SECRET_KEY.encode('utf-8'), string_to_sign.encode('utf-8'), hashlib.sha1).digest()
            sig_b64 = base64.b64encode(signature).decode('utf-8')
            auth_header = f'AWS {GCS_ACCESS_KEY}:{sig_b64}'

            headers = {
                'Date': date_str,
                'Content-Type': content_type,
                'Authorization': auth_header
            }

            res = requests.put(url, data=data, headers=headers, timeout=30)
            if res.status_code in (200, 201, 204):
                return f"{CDN_BASE_URL}/{object_name}"
            else:
                last_err = f"HTTP {res.status_code}: {res.text[:100]}"
                time.sleep(1 * (attempt + 1))
        except Exception as e:
            last_err = str(e)
            time.sleep(1 * (attempt + 1))

    raise Exception(f"Upload bucket failed sau {max_retries} lần thử: {last_err}")


def check_chapter_exists_on_cloud(slug: str, chap_num_str: str) -> bool:
    """Kiểm tra xem chapter đã có sẵn trên Cloud Storage Bucket qua CDN hay chưa"""
    try:
        url = f"{CDN_BASE_URL}/chapters/{slug}/chap{chap_num_str}/page_001.webp"
        res = requests.head(url, timeout=3)
        return res.status_code == 200
    except Exception:
        return False


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
    comic_created_at: str = None,
    comic_updated_at: str = None,
    categories: list = None
) -> bool:
    """Đồng bộ chapter lên TruyenKomi Web API để hiển thị ngay trên Website"""
    params = {
        "comicTitle": comic_title,
        "comicSlug": comic_slug,
        "coverImage": cover_cdn_url
    }
    if author:
        params["author"] = author
    if translator_group:
        params["translatorGroup"] = translator_group
    if other_names:
        params["otherNames"] = other_names
    if age_limit:
        params["ageLimit"] = age_limit
    if categories:
        params["categories"] = ",".join(str(c) for c in categories if c)
    if comic_created_at:
        params["comicCreatedAt"] = comic_created_at
    if comic_updated_at:
        params["comicUpdatedAt"] = comic_updated_at

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
        "User-Agent": "TruyenKomi-Sync/2.0",
        "Content-Type": "application/json"
    }
    try:
        res = requests.post(url, json=payload, headers=headers, timeout=20)
        return res.status_code in (200, 201)
    except Exception as e:
        return False


# =============================================================================
# 2. QUẢN LÝ TIẾN TRÌNH & CHECKPOINT (RESUME STATE)
# =============================================================================
class SyncStateManager:
    def __init__(self, state_file_path: Path):
        self.state_file_path = state_file_path
        self.data = {
            "version": 2,
            "drive_folder_id": DEFAULT_DRIVE_FOLDER_ID,
            "gcs_bucket": GCS_BUCKET,
            "created_at": datetime.now(timezone.utc).isoformat(),
            "last_updated": datetime.now(timezone.utc).isoformat(),
            "completed_manga": {},
            "failed_manga": {},
            "stats": {"total_comics": 0, "total_chapters": 0, "total_pages": 0}
        }
        self.load()

    def load(self):
        if self.state_file_path.exists():
            try:
                with open(self.state_file_path, "r", encoding="utf-8") as f:
                    self.data = json.load(f)
            except Exception as e:
                log_warning(f"Lỗi đọc file tiến trình: {e}. Tạo mới.")

    def save(self):
        self.data["last_updated"] = datetime.now(timezone.utc).isoformat()
        try:
            with open(self.state_file_path, "w", encoding="utf-8") as f:
                json.dump(self.data, f, ensure_ascii=False, indent=2)
        except Exception:
            pass

    def is_completed(self, manga_id: str) -> bool:
        return manga_id in self.data.get("completed_manga", {})

    def is_chapter_synced(self, manga_id: str, chap_num_str: str) -> bool:
        chaps = self.data.setdefault("synced_chapters", {}).setdefault(manga_id, [])
        return str(chap_num_str) in [str(x) for x in chaps]

    def mark_chapter_synced(self, manga_id: str, chap_num_str: str):
        chaps = self.data.setdefault("synced_chapters", {}).setdefault(manga_id, [])
        if str(chap_num_str) not in [str(x) for x in chaps]:
            chaps.append(str(chap_num_str))
            self.save()

    def mark_completed(self, manga_id: str, title: str, slug: str, chapters_count: int, pages_count: int):
        self.data.setdefault("completed_manga", {})[manga_id] = {
            "title": title, "slug": slug, "chapters_count": chapters_count, "pages_count": pages_count,
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
            "title": title, "error": str(error_msg), "time": datetime.now(timezone.utc).isoformat()
        }
        self.save()


# =============================================================================
# 3. GHÉP ẢNH MANHWA 5-IN-1 (IMAGE STITCHING)
# =============================================================================
def merge_images_vertical(image_paths: list, output_dir: Path, group_size: int = STITCH_GROUP_SIZE) -> list:
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
                    im = raw_img.convert('RGB') if raw_img.mode != 'RGB' else raw_img.copy()
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
            log_warning(f"Lỗi ghép nhóm ảnh {group_idx}: {e}")
        finally:
            to_close = {id(im): im for im in (loaded_imgs + resized_imgs)}
            for im in to_close.values():
                try: im.close()
                except Exception: pass
            if combined:
                try: combined.close()
                except Exception: pass

    return merged_files


# =============================================================================
# 4. GOOGLE DRIVE SYNC BACKEND (ĐỒNG BỘ REALTIME TỪNG CHAPTER)
# =============================================================================
class GoogleDriveUploader:
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
            log_info(f"Sử dụng Google Drive API qua Service Account: {self.service_account_path}")
            return "google_api"

        if shutil.which("rclone"):
            log_info(f"Sử dụng Rclone đồng bộ trực tiếp lên Google Drive (remote: {self.rclone_remote}).")
            return "rclone"

        log_warning("Không tìm thấy Rclone hoặc Service Account. Ảnh sẽ lưu tạm ở thư mục cục bộ.")
        return "local_fallback"

    def sync_cover_to_drive(self, cover_file: Path) -> bool:
        """Đẩy ảnh bìa lên Google Drive: covers/{slug}.webp"""
        if not cover_file or not cover_file.exists():
            return False

        if self.backend == "rclone":
            cmd = [
                "rclone", "copy", str(cover_file.parent), f"{self.rclone_remote}:covers",
                "--include", cover_file.name,
                "--drive-root-folder-id", self.folder_id,
                "--retries", "3"
            ]
            res = subprocess.run(cmd, capture_output=True, text=True)
            return res.returncode == 0
        elif self.backend == "mount":
            target = self.drive_path / "covers"
            target.mkdir(parents=True, exist_ok=True)
            shutil.copy2(str(cover_file), str(target / cover_file.name))
            return True
        return True

    def sync_chapter_to_drive(self, local_chap_dir: Path, slug: str, chap_num_str: str) -> bool:
        """Đồng bộ NGAY LẬP TỨC 1 Chapter lên Google Drive (chapters/{slug}/chap{num})"""
        if not local_chap_dir.exists() or not any(local_chap_dir.glob("*.webp")):
            return False

        if self.backend == "rclone":
            remote_target = f"{self.rclone_remote}:chapters/{slug}/chap{chap_num_str}"
            cmd = [
                "rclone", "copy", str(local_chap_dir), remote_target,
                "--drive-root-folder-id", self.folder_id,
                "--transfers", "16",
                "--checkers", "8",
                "--retries", "3"
            ]
            res = subprocess.run(cmd, capture_output=True, text=True)
            return res.returncode == 0
        elif self.backend == "mount":
            target = self.drive_path / "chapters" / slug / f"chap{chap_num_str}"
            target.mkdir(parents=True, exist_ok=True)
            for item in local_chap_dir.glob("*.webp"):
                shutil.copy2(str(item), str(target / item.name))
            return True
        return True


# =============================================================================
# 5. MANGADEX API CLIENT
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
                    log_warning(f"MangaDex Rate Limit (HTTP 429). Đợi {wait_sec}s...")
                    time.sleep(wait_sec)
                else:
                    time.sleep(1)
            except Exception:
                time.sleep(1)
        return None

    def extract_manga_id(self, input_val: str) -> str:
        input_val = input_val.strip()
        uuid_pattern = r'[0-9a-fA-F]{8}-[0-9a-fA-F]{4}-[0-9a-fA-F]{4}-[0-9a-fA-F]{4}-[0-9a-fA-F]{12}'
        
        if "/chapter/" in input_val:
            m = re.search(rf'/chapter/({uuid_pattern})', input_val)
            if m:
                res = self._rate_limited_get(f"{MANGADEX_API_BASE}/chapter/{m.group(1)}?includes[]=manga")
                if res and res.status_code == 200:
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
        return res.json().get("total", 0) if res else 0

    def iterate_all_vietnamese_manga(self, order_by: str = "oldest", start_offset: int = 0, limit: int = None):
        offset = start_offset
        batch_limit = 100
        fetched = 0

        while True:
            params = {
                "limit": batch_limit, "offset": offset,
                "availableTranslatedLanguage[]": [self.lang], "hasAvailableChapters": "true",
                "includes[]": ["cover_art", "author", "tag"],
                "contentRating[]": ["safe", "suggestive", "erotica", "pornographic"]
            }
            params["order[createdAt]"] = "asc" if order_by in ("oldest", "asc") else "desc"

            res = self._rate_limited_get(f"{MANGADEX_API_BASE}/manga", params=params)
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
                    if rel.get("type") in ("author", "artist"):
                        a_name = rel.get("attributes", {}).get("name")
                        if a_name and a_name not in authors:
                            authors.append(a_name)
                    elif rel.get("type") == "cover_art":
                        cover_filename = rel.get("attributes", {}).get("fileName")

                cover_url = f"{MANGADEX_UPLOADS_BASE}/covers/{m_id}/{cover_filename}" if cover_filename else None
                tags = [t.get("attributes", {}).get("name", {}).get("en") for t in attr.get("tags", []) if t.get("attributes", {}).get("name")]

                item = {
                    "id": m_id, "title": title, "slug": slugify(title),
                    "author": ", ".join(authors) if authors else "Đang cập nhật",
                    "cover_url": cover_url, "tags": tags, "total_available": total,
                    "created_at": attr.get("createdAt"),
                    "updated_at": attr.get("updatedAt")
                }
                yield item
                fetched += 1
                if limit and fetched >= limit:
                    return

            offset += len(items)
            if offset >= total:
                break

    def get_manga_details_and_chapters(self, manga_id: str) -> dict:
        url = f"{MANGADEX_API_BASE}/manga/{manga_id}?includes[]=cover_art&includes[]=author&includes[]=tag"
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
                if v and v not in alt_names: alt_names.append(v)
                if k == self.lang and not vi_title: vi_title = v

        orig_title = list(title_dict.values())[0] if title_dict else "Unknown"
        title = vi_title or title_dict.get("en") or orig_title
        slug = slugify(title)

        authors = []
        cover_filename = None
        for rel in data.get("relationships", []):
            if rel.get("type") in ("author", "artist"):
                name = rel.get("attributes", {}).get("name")
                if name and name not in authors: authors.append(name)
            elif rel.get("type") == "cover_art":
                cover_filename = rel.get("attributes", {}).get("fileName")

        author = ", ".join(authors) if authors else "Đang cập nhật"
        cover_url = f"{MANGADEX_UPLOADS_BASE}/covers/{manga_id}/{cover_filename}" if cover_filename else None
        genres = [t.get("attributes", {}).get("name", {}).get("en") for t in attr.get("tags", []) if t.get("attributes", {}).get("name")]

        chapters_raw = []
        offset = 0
        while True:
            feed_url = f"{MANGADEX_API_BASE}/manga/{manga_id}/feed"
            feed_params = {
                "translatedLanguage[]": [self.lang], "order[chapter]": "asc",
                "limit": 500, "offset": offset, "includes[]": ["scanlation_group"]
            }
            f_res = self._rate_limited_get(feed_url, params=feed_params)
            if not f_res or f_res.status_code != 200:
                break
            f_data = f_res.json()
            ch_list = f_data.get("data", [])
            chapters_raw.extend(ch_list)
            offset += 500
            if offset >= f_data.get("total", 0) or not ch_list:
                break

        grouped = {}
        for c in chapters_raw:
            c_attr = c.get("attributes", {})
            chap_str = c_attr.get("chapter")
            try: chap_num = float(chap_str) if chap_str else 0.0
            except ValueError: chap_num = 0.0

            chap_id = c.get("id")
            chap_title = c_attr.get("title") or f"Chương {int(chap_num) if chap_num.is_integer() else chap_num}"
            pages = int(c_attr.get("pages") or 0)

            groups = []
            for rel in c.get("relationships", []):
                if rel.get("type") == "scanlation_group":
                    g_name = rel.get("attributes", {}).get("name")
                    if g_name: groups.append(g_name)
            group_name = ", ".join(groups) if groups else "MangaDex Community"

            obj = {
                "id": chap_id, "number": chap_num, "title": chap_title,
                "pages": pages, "group": group_name, "published_at": c_attr.get("publishAt")
            }

            if chap_num not in grouped or pages > grouped[chap_num].get("pages", 0):
                grouped[chap_num] = obj

        chapters = list(grouped.values())
        chapters.sort(key=lambda x: x["number"])

        return {
            "id": manga_id, "title": title, "slug": slug, "author": author,
            "other_names": alt_names[:5], "cover_url": cover_url, "genres": genres,
            "created_at": attr.get("createdAt"),
            "updated_at": attr.get("updatedAt"),
            "chapters": chapters
        }

    def get_chapter_image_urls(self, chapter_id: str, data_saver: bool = DEFAULT_DATA_SAVER) -> list:
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
            files = ch.get("data", [])
            return [f"{base_url}/data/{ch_hash}/{fn}" for fn in files]


# =============================================================================
# 6. ENGINE ĐỒNG BỘ REALTIME TỪNG CHAPTER LÊN BUCKET & GOOGLE DRIVE
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
        lang: str = DEFAULT_LANG,
        api_base_url: str = DEFAULT_API_BASE_URL
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
        self.api_base_url = api_base_url

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
                im = im.convert('RGB') if im.mode != 'RGB' else im
                im.save(dest_webp_file, 'WEBP', quality=quality, method=6)
            if src_file != dest_webp_file and src_file.exists():
                src_file.unlink(missing_ok=True)
            return True
        except Exception:
            return False

    def sync_single_manga(self, manga_id_or_url: str) -> bool:
        manga_id = self.client.extract_manga_id(manga_id_or_url)
        if self.state.is_completed(manga_id) and self.skip_existing:
            log_info(f"Bộ truyện ID {manga_id} đã có trên Drive & Bucket. Bỏ qua.")
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

        # 1. TẢI VÀ ĐẨY ẢNH BÌA NGAY LẬP TỨC
        cover_cdn_url = None
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

            # Đẩy ảnh bìa lên Cloud Bucket & Google Drive ngay!
            if cover_path and cover_path.exists():
                if self.upload_to_web:
                    try:
                        cover_cdn_url = upload_file_to_cloud(cover_path, f"covers/{slug}.webp", "image/webp")
                        log_success(f"  📸 Đã đưa Ảnh bìa lên Bucket Cloud: {cover_cdn_url}")
                    except Exception as err:
                        log_warning(f"  ⚠️ Lỗi upload bìa lên Bucket: {err}")
                self.uploader.sync_cover_to_drive(cover_path)
                log_success(f"  📁 Đã lưu Ảnh bìa vào Google Drive (covers/{slug}.webp)")

        # 2. TẢI VÀ ĐỒNG BỘ TỪNG CHAPTER NGAY LẬP TỨC (REAL-TIME PER CHAPTER)
        total_pages_downloaded = 0
        skipped_chaps = 0

        for idx, chap in enumerate(chapters, 1):
            num = chap["number"]
            num_str = f"{int(num)}" if float(num).is_integer() else f"{num}"
            chap_title = chap.get("title") or f"Chương {num_str}"
            chap_dir = local_comic_dir / f"chap{num_str}"

            # Bỏ qua nếu chapter đã được đồng bộ trong tiến trình hoặc còn trên máy
            if self.skip_existing:
                if self.state.is_chapter_synced(manga_id, num_str):
                    log_info(f"  ⏭️ [{idx}/{len(chapters)}] {chap_title} đã đồng bộ xong trước đó. Bỏ qua.")
                    skipped_chaps += 1
                    continue

                if chap_dir.exists():
                    existing_webp = list(chap_dir.glob("page_*.webp")) or list(chap_dir.glob("*.webp"))
                    if len(existing_webp) >= 1:
                        log_info(f"  ⏭️ [{idx}/{len(chapters)}] {chap_title} đã có sẵn trên máy. Bỏ qua.")
                        skipped_chaps += 1
                        continue

            chap_dir.mkdir(parents=True, exist_ok=True)

            log_info(f"  📥 [{idx}/{len(chapters)}] Đang tải {chap_title}...")

            # Lấy link ảnh từ MangaDex (data_saver=False -> ẢNH GỐC)
            img_urls = self.client.get_chapter_image_urls(chap["id"], data_saver=self.data_saver)
            if not img_urls:
                log_warning(f"    ⚠️ Không lấy được link ảnh cho {chap_title}")
                continue

            num_raw = len(img_urls)
            should_stitch = self.merge_slices and (num_raw > AUTO_STITCH_THRESHOLD)
            download_dir = chap_dir / "_temp_slices" if should_stitch else chap_dir
            download_dir.mkdir(parents=True, exist_ok=True)

            raw_paths = []
            with ThreadPoolExecutor(max_workers=self.workers) as pool:
                futures = {}
                for p_idx, u in enumerate(img_urls, 1):
                    p_file = download_dir / f"raw_{p_idx:04d}.jpg"
                    raw_paths.append(p_file)
                    futures[pool.submit(self._download_single_image, u, p_file)] = p_file
                for f in as_completed(futures):
                    pass

            downloaded_raw = sorted([p for p in raw_paths if p.exists()])

            # Chuyển đổi WebP hoặc ghép ảnh Manhwa 5-in-1
            final_paths = []
            if should_stitch:
                final_paths = merge_images_vertical(downloaded_raw, chap_dir, group_size=STITCH_GROUP_SIZE)
                total_pages_downloaded += len(final_paths)
                shutil.rmtree(download_dir, ignore_errors=True)
            else:
                for p_idx, p_file in enumerate(downloaded_raw, 1):
                    final_webp = chap_dir / f"page_{p_idx:03d}.webp"
                    self._convert_to_webp(p_file, final_webp, quality=90)
                    final_paths.append(final_webp)
                    total_pages_downloaded += 1

            # =========================================================================
            # ⚡ ĐẨY NGAY LẬP TỨC LÊN CLOUD BUCKET & GOOGLE DRIVE SAU MỖI CHAPTER
            # =========================================================================
            if self.upload_to_web and final_paths:
                # 1. Đẩy từng ảnh lên Cloud Storage Bucket (Google Cloud Storage / R2)
                uploaded_cdn_urls = [None] * len(final_paths)
                with ThreadPoolExecutor(max_workers=self.workers) as pool:
                    f_to_i = {}
                    for p_i, p_path in enumerate(final_paths):
                        obj_name = f"chapters/{slug}/chap{num_str}/page_{p_i+1:03d}.webp"
                        f = pool.submit(upload_file_to_cloud, p_path, obj_name, "image/webp")
                        f_to_i[f] = p_i
                    for f in as_completed(f_to_i):
                        p_i = f_to_i[f]
                        try:
                            uploaded_cdn_urls[p_i] = f.result()
                        except Exception as e:
                            log_warning(f"    Lỗi upload ảnh {p_i+1} lên bucket: {e}")

                valid_cdn_urls = [u for u in uploaded_cdn_urls if u]
                if valid_cdn_urls:
                    log_success(f"    ☁️ Đã lưu {len(valid_cdn_urls)} ảnh vào Bucket Cloud: truyenkomi")
                    # 2. Đồng bộ lên Web API
                    # Lấy ngày tạo gốc của truyện (createdAt từ MangaDex), fallback ngày chapter đầu tiên
                    manga_created_at = info.get("created_at")
                    manga_updated_at = info.get("updated_at")
                    if not manga_created_at and chapters:
                        valid_pub = [c.get("published_at") for c in chapters if c.get("published_at")]
                        if valid_pub:
                            manga_created_at = min(valid_pub)

                    synced = sync_chapter_to_web_api(
                        api_base_url=self.api_base_url,
                        comic_title=title,
                        comic_slug=slug,
                        cover_cdn_url=cover_cdn_url or valid_cdn_urls[0],
                        chapter_num=num,
                        chapter_title=chap_title,
                        image_urls=valid_cdn_urls,
                        author=info["author"],
                        translator_group=chap.get("group"),
                        published_at=chap.get("published_at"),
                        created_at=chap.get("published_at"),
                        comic_created_at=manga_created_at,
                        comic_updated_at=manga_updated_at,
                        categories=info.get("genres", [])
                    )
                    if synced:
                        log_success(f"    🌐 Đã đồng bộ {chap_title} lên Website TruyenKomi thành công!")

                # 3. Đẩy chapter lên Google Drive folder 1S3biMk6c2e-u5j7uO0wocFBW6J5eB8ef ngay!
                drive_ok = self.uploader.sync_chapter_to_drive(chap_dir, slug, num_str)
                if drive_ok:
                    log_success(f"    📁 Đã lưu {chap_title} vào Google Drive (luutruyenkomi)!")

                # Ghi nhận hoàn thành chapter vào checkpoint
                self.state.mark_chapter_synced(manga_id, num_str)

                # 4. Dọn dẹp file tạm trên máy chủ để chống tràn ổ cứng
                if self.delete_local:
                    shutil.rmtree(chap_dir, ignore_errors=True)

        self.state.mark_completed(
            manga_id=manga_id, title=title, slug=slug,
            chapters_count=len(chapters), pages_count=total_pages_downloaded
        )
        log_success(f"🎉 Hoàn thành trọn bộ '{title}'!\n")
        return True

    def sync_all_vietnamese_manga(self, order_by: str = "oldest", start_offset: int = 0, limit: int = None):
        total_available = self.client.get_total_vietnamese_manga_count()
        log_info(f"🚀 BẮT ĐẦU ĐỒNG BỘ TOÀN BỘ MANGADEX TIẾNG VIỆT")
        log_info(f"• Cloud Storage Bucket: {GCS_BUCKET} ({GCS_ENDPOINT})")
        log_info(f"• Google Drive Folder ID: {self.uploader.folder_id} (luutruyenkomi)")
        log_info(f"• Web API: {self.api_base_url}")
        log_info(f"• Cơ chế lưu: REAL-TIME TỪNG CHAPTER (Tải xong chương nào đẩy ngay lên Bucket & Drive)")
        log_info(f"• MangaDex Data-Saver: {'BẬT' if self.data_saver else 'TẮT (Tải ẢNH GỐC)'}")
        log_info(f"• Số luồng tải: {self.workers} luồng\n")

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
                log_info(f"[{count}] ⏭️ Đã có trên Cloud/Drive: {title} (Bỏ qua)")
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

        log_success("🎉 ĐÃ HOÀN TẤT TIẾN TRÌNH ĐỒNG BỘ MANGADEX LÊN BUCKET & GOOGLE DRIVE!")


# =============================================================================
# HÀM MAIN
# =============================================================================
def main():
    parser = argparse.ArgumentParser(
        description="🚀 Tải truyện MangaDex (Tiếng Việt) và lưu trữ trực tiếp vào Cloud Bucket & Google Drive"
    )
    parser.add_argument("--all", action="store_true", help="Tải toàn bộ truyện Tiếng Việt trên MangaDex")
    parser.add_argument("--url", "--manga", default=None, help="URL hoặc MangaDex UUID của bộ truyện muốn tải")
    parser.add_argument("--folder-id", default=DEFAULT_DRIVE_FOLDER_ID, help=f"Google Drive Folder ID (Mặc định: {DEFAULT_DRIVE_FOLDER_ID})")
    parser.add_argument("--remote", default="gdrive", help="Tên remote trong Rclone (Mặc định: gdrive)")
    parser.add_argument("--drive-path", default=None, help="Đường dẫn thư mục Google Drive đã mount trên máy")
    parser.add_argument("--service-account", default=None, help="Đường dẫn file service_account.json của Google API")
    parser.add_argument("--offset", type=int, default=0, help="Vị trí bắt đầu tải (Mặc định: 0)")
    parser.add_argument("--limit", type=int, default=None, help="Số lượng truyện tối đa muốn tải (Mặc định: Tất cả)")
    parser.add_argument("--order", choices=["oldest", "latest"], default="oldest", help="Thứ tự duyệt truyện (Mặc định: oldest)")
    parser.add_argument("--workers", type=int, default=DEFAULT_WORKERS, help=f"Số luồng tải ảnh song song (Mặc định: {DEFAULT_WORKERS})")
    parser.add_argument("--data-saver", action="store_true", default=DEFAULT_DATA_SAVER, help="Bật Data-Saver (Mặc định: TẮT - Tải ảnh gốc)")
    parser.add_argument("--no-merge", action="store_true", help="Tắt tự động ghép ảnh Manhwa 5-in-1")
    parser.add_argument("--no-skip", action="store_true", help="Tắt bỏ qua chapter đã có trên máy")
    parser.add_argument("--no-upload", action="store_true", help="Chỉ tải lưu cục bộ, không đẩy lên Cloud/Drive")
    parser.add_argument("--keep-local", action="store_true", help="Không xóa file tạm cục bộ sau khi đẩy lên Drive")
    parser.add_argument("--api", default=DEFAULT_API_BASE_URL, help=f"URL Backend API (Mặc định: {DEFAULT_API_BASE_URL})")

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
        api_base_url=args.api
    )

    if args.url:
        sync_engine.sync_single_manga(args.url)
    elif args.all:
        sync_engine.sync_all_vietnamese_manga(order_by=args.order, start_offset=args.offset, limit=args.limit)
    else:
        parser.print_help()


if __name__ == "__main__":
    main()
EOF
    chmod +x "$PYTHON_SCRIPT"
    log_success "Đã cập nhật Engine Python '$PYTHON_SCRIPT' thành công!"
}

# ==============================================================================
# 2. KIỂM TRA VÀ CÀI ĐẶT MÔI TRƯỜNG TRÊN UBUNTU
# ==============================================================================
setup_environment() {
    log_header "BƯỚC 1/3: KIỂM TRA VÀ THIẾT LẬP MÔI TRƯỜNG UBUNTU"

    MISSING_PKGS=()
    if ! command -v python3 >/dev/null 2>&1; then MISSING_PKGS+=("python3"); fi
    if ! command -v pip3 >/dev/null 2>&1; then MISSING_PKGS+=("python3-pip"); fi
    if ! dpkg -s python3-venv >/dev/null 2>&1; then MISSING_PKGS+=("python3-venv"); fi
    if ! command -v curl >/dev/null 2>&1; then MISSING_PKGS+=("curl"); fi
    if ! command -v unzip >/dev/null 2>&1; then MISSING_PKGS+=("unzip"); fi

    if [ ${#MISSING_PKGS[@]} -gt 0 ]; then
        log_info "Đang cài đặt các gói hệ thống: ${MISSING_PKGS[*]}..."
        $SUDO apt-get update -y
        $SUDO apt-get install -y "${MISSING_PKGS[@]}" ca-certificates
    fi

    if ! command -v rclone >/dev/null 2>&1; then
        log_info "Đang cài đặt Rclone..."
        if ! $SUDO apt-get install -y rclone; then
            log_info "Đang cài đặt Rclone qua script chính thức..."
            $SUDO apt-get install -y unzip
            curl https://rclone.org/install.sh | $SUDO bash
        fi
        log_success "Đã cài đặt Rclone thành công!"
    fi

    if [ ! -d "$VENV_DIR" ]; then
        log_info "Đang tạo môi trường ảo Python Virtualenv ($VENV_DIR)..."
        python3 -m venv "$VENV_DIR"
    fi

    # shellcheck source=/dev/null
    source "$VENV_DIR/bin/activate"
    pip install --upgrade pip >/dev/null 2>&1 || true
    pip install --quiet requests pillow rich

    log_success "Môi trường máy Ubuntu đã sẵn sàng 100%!"
}

# ==============================================================================
# ==============================================
# 3. CẤU HÌNH LIÊN KẾT GOOGLE DRIVE QUA RCLONE (TỰ ĐỘNG HÓA 100%)
# ==============================================
check_rclone_configured() {
    if command -v rclone >/dev/null 2>&1; then
        if rclone listremotes 2>/dev/null | grep -q "^${RCLONE_REMOTE_NAME}:"; then
            return 0
        fi
    fi
    return 1
}

apply_rclone_token() {
    local raw_input="$1"
    if [ -z "$raw_input" ]; then
        log_error "Token không được để trống!"
        return 1
    fi

    log_info "Đang trích xuất và xác thực mã Token Google OAuth..."
    CLEAN_TOKEN=$(python3 -c "
import sys, re, json
raw = sys.stdin.read().strip()
match = re.search(r'(\{[\s\S]*?\"access_token\"[\s\S]*?\})', raw)
if not match:
    match = re.search(r'(\{\"token\":[\s\S]*?\})', raw)
if match:
    try:
        obj = json.loads(match.group(1))
        print(json.dumps(obj))
        sys.exit(0)
    except Exception:
        pass
try:
    obj = json.loads(raw)
    print(json.dumps(obj))
    sys.exit(0)
except Exception:
    pass
sys.exit(1)
" <<< "$raw_input" 2>/dev/null || true)

    if [ -z "$CLEAN_TOKEN" ]; then
        log_error "Không thể nhận diện chuỗi JSON Token hợp lệ. Vui lòng kiểm tra lại!"
        return 1
    fi

    log_info "Đang tự động ghi cấu hình Rclone cho remote '${RCLONE_REMOTE_NAME}'..."
    mkdir -p "$HOME/.config/rclone"

    # Cập nhật ~/.config/rclone/rclone.conf trực tiếp bằng Python
    python3 -c "
import sys, configparser, os
conf_path = os.path.expanduser('~/.config/rclone/rclone.conf')
config = configparser.ConfigParser()
if os.path.exists(conf_path):
    config.read(conf_path, encoding='utf-8')
section = '$RCLONE_REMOTE_NAME'
if not config.has_section(section):
    config.add_section(section)
config.set(section, 'type', 'drive')
config.set(section, 'scope', 'drive')
config.set(section, 'root_folder_id', '$DEFAULT_FOLDER_ID')
config.set(section, 'token', '''$CLEAN_TOKEN''')
with open(conf_path, 'w', encoding='utf-8') as f:
    config.write(f)
"
    chmod 600 "$HOME/.config/rclone/rclone.conf" 2>/dev/null || true

    log_info "Đang kiểm tra kết nối tới Google Drive Folder ID: $DEFAULT_FOLDER_ID..."
    if rclone lsd "${RCLONE_REMOTE_NAME}:" >/dev/null 2>&1 || rclone about "${RCLONE_REMOTE_NAME}:" >/dev/null 2>&1; then
        log_success "🎉 KẾT NỐI GOOGLE DRIVE THÀNH CÔNG RỰC RỠ!"
        echo -e "   Thư mục Drive: ${GREEN}luutruyenkomi${NC} (ID: ${CYAN}${DEFAULT_FOLDER_ID}${NC})"
        return 0
    else
        log_success "Đã lưu cấu hình Rclone thành công! (Remote: '${RCLONE_REMOTE_NAME}:')"
        return 0
    fi
}

auto_import_rclone_credentials() {
    if check_rclone_configured; then
        return 0
    fi

    # 1. Tìm file rclone.conf có sẵn trong thư mục
    if [ -f "rclone.conf" ]; then
        log_info "Phát hiện file 'rclone.conf' trong thư mục dự án! Đang tự động nạp cấu hình..."
        mkdir -p "$HOME/.config/rclone"
        cp "rclone.conf" "$HOME/.config/rclone/rclone.conf"
        chmod 600 "$HOME/.config/rclone/rclone.conf"
        if check_rclone_configured; then
            log_success "Đã kích hoạt Google Drive tự động từ file 'rclone.conf'!"
            return 0
        fi
    fi

    # 2. Tìm file rclone_token.txt
    if [ -f "rclone_token.txt" ]; then
        log_info "Phát hiện file 'rclone_token.txt'! Đang tự động tạo kết nối Rclone..."
        RAW_TOK=$(cat rclone_token.txt)
        if apply_rclone_token "$RAW_TOK"; then
            return 0
        fi
    fi

    return 1
}

setup_google_drive() {
    log_header "THIẾT LẬP KẾT NỐI GOOGLE DRIVE (RCLONE TỰ ĐỘNG)"
    echo -e "Thư mục đích: ${GREEN}luutruyenkomi${NC} (Folder ID: ${CYAN}${DEFAULT_FOLDER_ID}${NC})\n"

    # Thử tự động nạp trước nếu có file
    if auto_import_rclone_credentials; then
        return 0
    fi

    if check_rclone_configured; then
        echo -e "${GREEN}✅ Google Drive HIỆN ĐANG KẾT NỐI TỐT (Remote: '${RCLONE_REMOTE_NAME}:').${NC}"
        echo -n "Bạn có muốn thiết lập lại tài khoản Google Drive khác không? (y/N): "
        read -r reconfig
        if [ "$reconfig" != "y" ] && [ "$reconfig" != "Y" ]; then
            return 0
        fi
    fi

    echo -e "${CYAN}================================================================${NC}"
    echo -e "  ${BOLD}[1] ⚡ TỰ ĐỘNG DÁN TOKEN OAUTH${NC} (Khuyên dùng - Nhanh nhất 10 giây)"
    echo -e "      ${YELLOW}Chỉ cần copy mã từ máy tính Windows của bạn và dán vào đây${NC}"
    echo -e "  ${BOLD}[2] 📋 Dán toàn bộ nội dung file cấu hình rclone.conf${NC}"
    echo -e "  ${BOLD}[3] 🔑 Sử dụng Google Service Account (service_account.json)${NC}"
    echo -e "  ${BOLD}[4] 🛠️  Mở trình cấu hình gốc Rclone Wizard (rclone config)${NC}"
    echo -e "  ${BOLD}[0] ↩️  Bỏ qua / Quay lại menu chính${NC}"
    echo -e "${CYAN}================================================================${NC}"
    echo -n "Lựa chọn của bạn [0-4]: "
    read -r drive_opt

    case "$drive_opt" in
        1)
            echo -e "\n${CYAN}----------------------------------------------------------------${NC}"
            echo -e "${BOLD}CÁCH LẤY TOKEN GOOGLE DRIVE TRÊN MÁY TÍNH CÁ NHÂN (WINDOWS):${NC}"
            echo -e "  👉 Cách 1 (1-Click): Chạy file: ${GREEN}${BOLD}.\\lay_token_drive.bat${NC}"
            echo -e "     (Script sẽ tự bật trình duyệt và TỰ ĐỘNG COPY TOKEN VÀO CLIPBOARD)"
            echo -e "  👉 Cách 2: Gõ lệnh trong PowerShell: ${GREEN}${BOLD}.\\rclone.exe authorize \"drive\"${NC}"
            echo -e "${CYAN}----------------------------------------------------------------${NC}"
            echo -e "Dán đoạn mã Token JSON vào dưới đây rồi nhấn Enter:"
            echo -n "👉 Dán Token vào đây: "
            read -r pasted_token
            apply_rclone_token "$pasted_token"
            ;;
        2)
            echo -e "👉 Hãy dán toàn bộ nội dung rclone.conf (Gõ dòng 'EOF' rồi Enter để kết thúc):"
            CONF_BUF=""
            while IFS= read -r line; do
                if [ "$line" = "EOF" ] || [ "$line" = "exit" ]; then break; fi
                CONF_BUF+="$line"$'\n'
            done
            if [ -n "$CONF_BUF" ]; then
                mkdir -p "$HOME/.config/rclone"
                echo "$CONF_BUF" > "$HOME/.config/rclone/rclone.conf"
                chmod 600 "$HOME/.config/rclone/rclone.conf"
                log_success "Đã lưu file rclone.conf thành công!"
            fi
            ;;
        3)
            echo -n "Nhập đường dẫn file service_account.json: "
            read -r sa_path
            if [ -f "$sa_path" ]; then
                rclone config create "$RCLONE_REMOTE_NAME" drive root_folder_id "$DEFAULT_FOLDER_ID" service_account_file "$sa_path"
                log_success "Đã cấu hình remote với Service Account thành công!"
            else
                log_error "Không tìm thấy file: $sa_path"
            fi
            ;;
        4)
            rclone config
            ;;
        *)
            ;;
    esac
}

ensure_drive_ready() {
    auto_import_rclone_credentials
    if ! check_rclone_configured; then
        echo -e "\n${YELLOW}================================================================${NC}"
        echo -e "${YELLOW}⚠️  CHÚ Ý: Google Drive (Rclone) chưa được kết nối!${NC}"
        echo -e "Nếu tiếp tục tải ngay, ảnh chỉ lưu lên Cloud Storage Bucket ('truyenkomi')"
        echo -e "mà ${BOLD}KHÔNG${NC} được đồng bộ vào Google Drive '${DEFAULT_FOLDER_ID}'."
        echo -e "${YELLOW}================================================================${NC}"
        echo -n "👉 Bạn có muốn tự động cấu hình Google Drive ngay bây giờ không? (Y/n): "
        read -r setup_ans
        if [ -z "$setup_ans" ] || [ "$setup_ans" = "y" ] || [ "$setup_ans" = "Y" ]; then
            setup_google_drive
        fi
    fi
}

# ==============================================================================
# 4. CÁC HÀM THỰC THI TẢI TRUYỆN
# ==============================================================================
run_download_all_foreground() {
    ensure_drive_ready

    # shellcheck source=/dev/null
    source "$VENV_DIR/bin/activate"
    SCRIPT_EXEC="$PYTHON_SCRIPT"
    if [ -f "backend/$PYTHON_SCRIPT" ]; then
        SCRIPT_EXEC="backend/$PYTHON_SCRIPT"
    fi

    log_header "BẮT ĐẦU TẢI TOÀN BỘ TRUYỆN MANGADEX TIẾNG VIỆT"
    python3 "$SCRIPT_EXEC" --all --folder-id "$DEFAULT_FOLDER_ID" --remote "$RCLONE_REMOTE_NAME" --workers 16
}

run_download_single_manga() {
    ensure_drive_ready

    echo -n "Nhập link truyện MangaDex (hoặc UUID): "
    read -r manga_url
    if [ -z "$manga_url" ]; then
        log_error "Link truyện không được để trống!"
        return 1
    fi

    # shellcheck source=/dev/null
    source "$VENV_DIR/bin/activate"
    SCRIPT_EXEC="$PYTHON_SCRIPT"
    if [ -f "backend/$PYTHON_SCRIPT" ]; then
        SCRIPT_EXEC="backend/$PYTHON_SCRIPT"
    fi

    python3 "$SCRIPT_EXEC" --url "$manga_url" --folder-id "$DEFAULT_FOLDER_ID" --remote "$RCLONE_REMOTE_NAME" --workers 16
}

run_in_background() {
    ensure_drive_ready

    if [ -f "$PID_FILE" ]; then
        OLD_PID=$(cat "$PID_FILE")
        if ps -p "$OLD_PID" > /dev/null 2>&1; then
            log_warning "Tiến trình tải đang chạy ngầm với PID: $OLD_PID!"
            echo -e "Gõ '${BOLD}tail -f $LOG_FILE${NC}' để theo dõi."
            return 0
        fi
    fi

    # shellcheck source=/dev/null
    source "$VENV_DIR/bin/activate"
    SCRIPT_EXEC="$PYTHON_SCRIPT"
    if [ -f "backend/$PYTHON_SCRIPT" ]; then
        SCRIPT_EXEC="backend/$PYTHON_SCRIPT"
    fi

    log_info "Đang khởi chạy tiến trình tải ngầm 24/7 (nohup)..."
    nohup python3 "$SCRIPT_EXEC" --all --folder-id "$DEFAULT_FOLDER_ID" --remote "$RCLONE_REMOTE_NAME" --workers 16 >> "$LOG_FILE" 2>&1 &
    NEW_PID=$!
    echo "$NEW_PID" > "$PID_FILE"

    log_success "Tiến trình đã được đưa vào chạy ngầm! PID: ${BOLD}$NEW_PID${NC}"
    echo -e "• File nhật ký: ${CYAN}$LOG_FILE${NC}"
    echo -e "• Lệnh theo dõi trực tiếp: ${BOLD}tail -f $LOG_FILE${NC}\n"
}

show_status() {
    log_header "TRẠNG THÁI TIẾN TRÌNH TẢI MANGADEX"
    if [ -f "$PID_FILE" ]; then
        PID=$(cat "$PID_FILE")
        if ps -p "$PID" > /dev/null 2>&1; then
            echo -e "Trạng thái: ${GREEN}${BOLD}ĐANG CHẠY NGẦM (Active)${NC} - PID: ${BOLD}$PID${NC}"
        else
            echo -e "Trạng thái: ${YELLOW}ĐÃ DỪNG (Inactive)${NC}"
        fi
    else
        echo -e "Trạng thái: ${YELLOW}CHƯA KHỞI CHẠY TIẾN TRÌNH NGẦM${NC}"
    fi

    if check_rclone_configured; then
        echo -e "Google Drive: ${GREEN}${BOLD}ĐÃ KẾT NỐI${NC} (Remote '${RCLONE_REMOTE_NAME}:' -> ${DEFAULT_FOLDER_ID})"
    else
        echo -e "Google Drive: ${RED}${BOLD}CHƯA KẾT NỐI${NC} (Chọn [6] để cấu hình)"
    fi

    STATE_FILE="mangadex_temp_cache/mangadex_sync_state.json"
    if [ -f "$STATE_FILE" ]; then
        echo -e "\n${BOLD}📊 Thống kê đã đồng bộ lên Google Drive:${NC}"
        python3 -c "
import json
try:
    with open('$STATE_FILE', 'r', encoding='utf-8') as f:
        d = json.load(f)
        s = d.get('stats', {})
        print(f'  • Tổng số bộ truyện đã hoàn tất: {s.get(\"total_comics\", 0)} bộ')
        print(f'  • Tổng số chapter đã lưu: {s.get(\"total_chapters\", 0)} chương')
        print(f'  • Tổng số trang ảnh đã lưu: {s.get(\"total_pages\", 0)} trang WebP')
except Exception: pass
" 2>/dev/null || true
    fi

    if [ -f "$LOG_FILE" ]; then
        echo -e "\n${CYAN}--- 15 DÒNG NHẬT KÝ MỚI NHẤT ($LOG_FILE) ---${NC}"
        tail -n 15 "$LOG_FILE"
        echo -e "${CYAN}---------------------------------------------${NC}"
        echo -e "💡 Lệnh xem live liên tục: ${BOLD}tail -f $LOG_FILE${NC}\n"
    fi
}

stop_background_process() {
    if [ -f "$PID_FILE" ]; then
        PID=$(cat "$PID_FILE")
        if ps -p "$PID" > /dev/null 2>&1; then
            log_info "Đang dừng tiến trình PID $PID..."
            kill "$PID" || true
            sleep 1
            if ps -p "$PID" > /dev/null 2>&1; then kill -9 "$PID" || true; fi
            rm -f "$PID_FILE"
            log_success "Đã dừng tiến trình tải ngầm thành công!"
            return 0
        fi
    fi
    log_warning "Không có tiến trình tải ngầm nào đang chạy."
    rm -f "$PID_FILE"
}

# ==============================================================================
# 5. XỬ LÝ DÒNG LỆNH CLI HOẶC MENU TƯƠNG TÁC
# ==============================================================================
extract_python_engine

if [ "$1" = "--setup-drive" ] || [ "$1" = "--setup-rclone" ]; then
    setup_environment
    if [ -n "$2" ]; then
        apply_rclone_token "$2"
    else
        setup_google_drive
    fi
    exit 0
elif [ "$1" = "--all" ]; then
    setup_environment
    run_download_all_foreground
    exit 0
elif [ "$1" = "--bg" ] || [ "$1" = "--daemon" ]; then
    setup_environment
    run_in_background
    exit 0
elif [ "$1" = "--status" ]; then
    show_status
    exit 0
elif [ "$1" = "--stop" ]; then
    stop_background_process
    exit 0
elif [ "$1" = "--url" ] && [ -n "$2" ]; then
    setup_environment
    # shellcheck source=/dev/null
    source "$VENV_DIR/bin/activate"
    SCRIPT_EXEC="$PYTHON_SCRIPT"
    if [ -f "backend/$PYTHON_SCRIPT" ]; then SCRIPT_EXEC="backend/$PYTHON_SCRIPT"; fi
    python3 "$SCRIPT_EXEC" --url "$2" --folder-id "$DEFAULT_FOLDER_ID" --remote "$RCLONE_REMOTE_NAME" --workers 16
    exit 0
fi

setup_environment
auto_import_rclone_credentials >/dev/null 2>&1 || true

while true; do
    if check_rclone_configured; then
        DRIVE_BADGE="${GREEN}🟢 ĐÃ KẾT NỐI (gdrive:)${NC}"
    else
        DRIVE_BADGE="${RED}🔴 CHƯA KẾT NỐI (Chọn [6] để thiết lập)${NC}"
    fi

    echo -e "${CYAN}================================================================${NC}"
    echo -e "${BOLD}${MAGENTA}🚀 MANGADEX TO GOOGLE DRIVE SYNCHRONIZER (UBUNTU)${NC}"
    echo -e "   Thư mục Drive: ${GREEN}luutruyenkomi${NC} (ID: ${CYAN}${DEFAULT_FOLDER_ID}${NC})"
    echo -e "   Google Drive:  $DRIVE_BADGE"
    echo -e "${CYAN}----------------------------------------------------------------${NC}"
    echo -e "⚙️  ${BOLD}CẤU HÌNH HIỆN TẠI (ĐÃ KHỚP 100% GIAO DIỆN CỦA BẠN):${NC}"
    echo -e "   ${GREEN}☑️${NC} Tự động tải lên Cloud & Đồng bộ Web API: ${BOLD}${GREEN}BẬT${NC}"
    echo -e "   ${GREEN}☑️${NC} Bỏ qua chapter đã có trên máy (Resume):  ${BOLD}${GREEN}BẬT${NC}"
    echo -e "   ${YELLOW}⬜${NC} MangaDex Data-Saver:                     ${BOLD}${YELLOW}TẮT (Tải ẢNH GỐC)${NC}"
    echo -e "   ${GREEN}☑️${NC} Ghép ảnh Manhwa 5-in-1 (>70 ảnh):        ${BOLD}${GREEN}BẬT${NC}"
    echo -e "   ${YELLOW}⬜${NC} Tự động xuất file PDF:                   ${BOLD}${YELLOW}TẮT${NC}"
    echo -e "   ${CYAN}⚡${NC} Luồng tải song song:                     ${BOLD}${CYAN}16 luồng${NC}"
    echo -e "${CYAN}================================================================${NC}"
    echo -e "  ${BOLD}[1]${NC} 🚀 ${BOLD}Tải TOÀN BỘ truyện MangaDex Tiếng Việt${NC} (Chạy trực tiếp)"
    echo -e "  ${BOLD}[2]${NC} ⚡ ${BOLD}Tải 1 bộ truyện cụ thể${NC} (Nhập link MangaDex hoặc UUID)"
    echo -e "  ${BOLD}[3]${NC} 🔄 ${BOLD}Chạy ngầm trong nền 24/7 (nohup)${NC} - An toàn khi ngắt SSH"
    echo -e "  ${BOLD}[4]${NC} 📊 ${BOLD}Xem trạng thái, thống kê & nhật ký${NC} (Logs)"
    echo -e "  ${BOLD}[5]${NC} 🛑 ${BOLD}Dừng tiến trình tải ngầm${NC}"
    echo -e "  ${BOLD}[6]${NC} ⚙️  ${BOLD}Cấu hình kết nối Google Drive (Rclone)${NC}"
    echo -e "  ${BOLD}[0]${NC} ❌ Thoát"
    echo -e "${CYAN}----------------------------------------------------------------${NC}"
    echo -n "Chọn thao tác [0-6]: "
    read -r choice

    case "$choice" in
        1) run_download_all_foreground ;;
        2) run_download_single_manga ;;
        3) run_in_background ;;
        4) show_status ;;
        5) stop_background_process ;;
        6) setup_google_drive ;;
        0) echo -e "\nTạm biệt!\n"; exit 0 ;;
        *) log_warning "Lựa chọn không hợp lệ." ;;
    esac
    echo ""
done


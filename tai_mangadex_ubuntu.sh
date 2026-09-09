#!/usr/bin/env bash
# ==============================================================================
# 🚀 MANGADEX TO CLOUD STORAGE & WEB - ALL-IN-ONE CRAWLER CHO UBUNTU (TURBO SPEED)
# ==============================================================================
# File tự động hóa 100% dành riêng cho hệ điều hành Ubuntu / Linux:
# - Tự cài đặt Python 3, pip, Virtualenv (nếu máy chưa có)
# - Tự động thiết lập bộ nhớ ảo SWAP (4GB/2GB) chống tràn RAM / chống bị kill tiến trình
# - Tải truyện MangaDex (Tiếng Việt) và lưu trữ trực tiếp vào Cloud Bucket & Web API
# - CÁC TỐI ƯU HÓA TĂNG TỐC VƯỢT TRỘI (TURBO SPEED):
#     ⚡ 32 luồng tải & upload song song (Tăng gấp đôi số worker)
#     ⚡ HTTP Keep-Alive Connection Pooling (Tái sử dụng TCP/TLS, loại bỏ handshake)
#     ⚡ Nén WebP đa luồng song song trên đa nhân CPU (Tốc độ nén nhanh gấp 5 lần)
#     ⚡ Ghép ảnh Manhwa 5-in-1 đa luồng song song
# - ÁP DỤNG CÁC THIẾT LẬP (SETTING) TỪ GIAO DIỆN:
#     ☑️ Tự động tải lên Cloud Storage & Đồng bộ Web API: BẬT
#     ☑️ Bỏ qua chapter đã có trên máy (Tránh tải trùng / Resume): BẬT
#     ⬜ MangaDex Data-Saver (Tải ảnh nén nhẹ tiết kiệm mạng): TẮT (Tải ẢNH GỐC)
#     ☑️ Ghép ảnh Manhwa 5-in-1 (Tự động khi chapter > 70 ảnh): BẬT
#     ⬜ Tự động xuất mỗi chapter thành file PDF: TẮT
#     ⚡ Luồng tải song song: 32 luồng
# - Đẩy trực tiếp lên Cloud Storage Bucket (GCS / R2) và tự dọn dẹp file tạm (chống tràn ổ cứng VPS)
# - Hỗ trợ chạy ngầm 24/7 (nohup), tắt SSH máy vẫn tự động tải
# ==============================================================================

set -e

LOG_FILE="mangadex_sync.log"
PID_FILE=".mangadex_sync.pid"
VENV_DIR=".venv_mangadex"
PYTHON_SCRIPT="mangadex_drive_downloader.py"

PYTHON_BIN="/usr/bin/python3"
if [ ! -x "$PYTHON_BIN" ]; then
    PYTHON_BIN="$(command -v python3 2>/dev/null || which python3 2>/dev/null || echo "python3")"
fi

get_python_runner() {
    if [ -f "$VENV_DIR/bin/python3" ]; then
        echo "$VENV_DIR/bin/python3"
    elif [ -f "$VENV_DIR/bin/python" ]; then
        echo "$VENV_DIR/bin/python"
    elif [ -x "$PYTHON_BIN" ]; then
        echo "$PYTHON_BIN"
    else
        echo "python3"
    fi
}

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
🚀 MangaDex to Cloud Storage & Web Synchronizer
=============================================================================
Author: TruyenKomi Team
Target Cloud Storage Bucket: truyenkomi (Google Cloud Storage / R2)
Web API: https://truyenkomi.com/api

Thiết lập chuẩn:
  ☑️ Tự động tải lên Cloud Storage Bucket & Đồng bộ Web API: BẬT
  ☑️ Bỏ qua chapter đã có trên máy / Cloud (Tránh tải trùng / Resume): BẬT
  ⬜ MangaDex Data-Saver (Tải ảnh nén nhẹ tiết kiệm mạng): TẮT (Tải ẢNH GỐC)
  ☑️ Ghép ảnh Manhwa 5-in-1 (Tự động khi chapter > 70 ảnh): BẬT
  ⬜ Tự động xuất mỗi chapter thành file PDF: TẮT
  ⚡ Luồng tải song song: 16 luồng
  ⚡ ĐỒNG BỘ REALTIME TỪNG CHAPTER: Cứ xong chapter nào là đẩy ngay lên Cloud Bucket & Web
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
from requests.adapters import HTTPAdapter
from urllib3.util.retry import Retry


def create_reusable_session(pool_size: int = 64) -> requests.Session:
    """Tạo requests.Session dùng chung Connection Pool (HTTP Keep-Alive) để tăng tốc tải & upload tối đa"""
    s = requests.Session()
    adapter = HTTPAdapter(
        pool_connections=pool_size,
        pool_maxsize=pool_size,
        max_retries=Retry(
            total=3,
            backoff_factor=0.3,
            status_forcelist=[500, 502, 503, 504],
            raise_on_status=False
        )
    )
    s.mount("https://", adapter)
    s.mount("http://", adapter)
    return s

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
GCS_ENDPOINT = os.getenv("R2_ENDPOINT", "storage.googleapis.com")
GCS_ACCESS_KEY = os.getenv("R2_ACCESS_KEY", "GOOGQHRXVRS7YCR24JBLB33S")
GCS_SECRET_KEY = os.getenv("R2_SECRET_KEY", "3Iamo8whmuUeT2B+CMtRnfW6qdIsmwXVec47tF52")
GCS_BUCKET = os.getenv("R2_BUCKET_NAME", "truyenkomi")
CDN_BASE_URL = os.getenv("R2_CDN_BASE_URL", "https://img.truyenkomi.site").rstrip("/")
DEFAULT_API_BASE_URL = os.getenv("API_BASE_URL", "https://truyenkomi.com/api").rstrip("/")

MANGADEX_API_BASE = "https://api.mangadex.org"
MANGADEX_UPLOADS_BASE = "https://uploads.mangadex.org"
DEFAULT_LANG = "vi"

# ⚙️ CÁC THIẾT LẬP MẶC ĐỊNH KHỚP GIAO DIỆN:
DEFAULT_UPLOAD_TO_WEB = True          # ☑️ Tự động tải lên Cloud Bucket & Đồng bộ Web API
DEFAULT_SKIP_EXISTING = True          # ☑️ Bỏ qua chapter đã có trên máy / Cloud
DEFAULT_DATA_SAVER = False            # ⬜ MangaDex Data-Saver: TẮT (Tải ẢNH GỐC)
DEFAULT_MERGE_SLICES = True           # ☑️ Ghép ảnh Manhwa 5-in-1 khi > 70 ảnh
AUTO_STITCH_THRESHOLD = 70            # Ngưỡng tự động ghép dải ảnh manhwa
STITCH_GROUP_SIZE = 5                 # Ghép 5 lát cắt thành 1 ảnh dài WebP
DEFAULT_MAKE_PDF = False              # ⬜ Tự động xuất PDF: TẮT
DEFAULT_WORKERS = 32                  # ⚡ 32 luồng tải & upload song song (Turbo Speed)

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
def upload_file_to_cloud(local_path: Path, object_name: str, content_type: str = "image/webp", session: requests.Session = None, max_retries: int = 3) -> str:
    """Tải 1 file ảnh lên Cloud Storage Bucket (Google Cloud Storage / R2) qua persistent session tái sử dụng kết nối (Tự động thử lại 3 lần)"""
    object_name = object_name.lstrip("/")
    url = f'https://{GCS_ENDPOINT}/{GCS_BUCKET}/{object_name}'

    with open(local_path, "rb") as f:
        data = f.read()

    last_err = None
    http_client = session or requests
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

            res = http_client.put(url, data=data, headers=headers, timeout=25)
            if res.status_code in (200, 201, 204):
                return f"{CDN_BASE_URL}/{object_name}"
            else:
                last_err = f"HTTP {res.status_code}: {res.text[:100]}"
                time.sleep(0.3 * (attempt + 1))
        except Exception as e:
            last_err = str(e)
            time.sleep(0.3 * (attempt + 1))

    raise Exception(f"Upload bucket failed sau {max_retries} lần thử: {last_err}")


def normalize_chapter_key(val) -> str:
    """Chuẩn hóa số chapter về dạng chuỗi thống nhất (vd: 1 -> '1', 1.0 -> '1', 1.5 -> '1.5')"""
    if val is None:
        return ""
    try:
        f = float(val)
        return f"{int(f)}" if f.is_integer() else f"{f}"
    except (ValueError, TypeError):
        s = str(val).strip()
        if s.endswith(".0"):
            return s[:-2]
        return s


def check_chapter_exists_on_cloud(slug: str, chap_num_str: str, cdn_base_url: str = CDN_BASE_URL, session: requests.Session = None) -> bool:
    """Kiểm tra xem chapter đã có sẵn trên Cloud Storage Bucket qua CDN hay chưa"""
    try:
        norm_key = normalize_chapter_key(chap_num_str)
        url = f"{cdn_base_url.rstrip('/')}/chapters/{slug}/chap{norm_key}/page_001.webp"
        http_client = session or requests
        res = http_client.head(url, timeout=3)
        return res.status_code == 200
    except Exception:
        return False


def get_existing_chapters_from_web(api_base_url: str, slug: str, session: requests.Session = None) -> set:
    """
    Truy vấn Web API (TruyenKomi) để lấy danh sách các số chapter đã tồn tại trong database.
    Trả về set các chapter key đã chuẩn hóa (vd: {'1', '2', '2.5'}).
    """
    if not api_base_url or not slug:
        return set()
    url = f"{api_base_url.rstrip('/')}/comics/{slug}"
    http_client = session or requests
    try:
        res = http_client.get(url, timeout=6)
        if res.status_code == 200:
            data = res.json()
            chaps = data.get("chapters", [])
            existing = set()
            for c in chaps:
                c_num = c.get("chapterNumber")
                if c_num is not None:
                    existing.add(normalize_chapter_key(c_num))
            return existing
    except Exception:
        pass
    return set()


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
    categories: list = None,
    session: requests.Session = None
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
    http_client = session or requests
    try:
        res = http_client.post(url, json=payload, headers=headers, timeout=20)
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
        norm_key = normalize_chapter_key(chap_num_str)
        return norm_key in [normalize_chapter_key(x) for x in chaps]

    def mark_chapter_synced(self, manga_id: str, chap_num_str: str):
        chaps = self.data.setdefault("synced_chapters", {}).setdefault(manga_id, [])
        norm_key = normalize_chapter_key(chap_num_str)
        norm_existing = [normalize_chapter_key(x) for x in chaps]
        if norm_key not in norm_existing:
            chaps.append(norm_key)
            self.save()

    def get_completed_info(self, manga_id: str) -> dict:
        return self.data.get("completed_manga", {}).get(manga_id)

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
# 3. GHÉP ẢNH MANHWA 5-IN-1 (IMAGE STITCHING) - ĐA LUỒNG TỐC ĐỘ CAO
# =============================================================================
def merge_images_vertical(image_paths: list, output_dir: Path, group_size: int = STITCH_GROUP_SIZE) -> list:
    if not image_paths:
        return []

    groups = []
    for group_idx, i in enumerate(range(0, len(image_paths), group_size), 1):
        groups.append((group_idx, image_paths[i:i + group_size]))

    def process_group(item):
        group_idx, group = item
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
                return group_idx, None

            max_width = max(im.width for im in loaded_imgs)
            total_height = 0
            for im in loaded_imgs:
                if im.width != max_width:
                    new_h = max(1, int(im.height * (max_width / im.width)))
                    im_resized = im.resize((max_width, new_h), Image.Resampling.BILINEAR)
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
            combined.save(chunk_file, 'WEBP', quality=88, method=4)
            return group_idx, chunk_file
        except Exception as e:
            log_warning(f"Lỗi ghép nhóm ảnh {group_idx}: {e}")
            return group_idx, None
        finally:
            to_close = {id(im): im for im in (loaded_imgs + resized_imgs)}
            for im in to_close.values():
                try: im.close()
                except Exception: pass
            if combined:
                try: combined.close()
                except Exception: pass

    results = {}
    with ThreadPoolExecutor(max_workers=min(len(groups), 8)) as stitch_pool:
        futures = [stitch_pool.submit(process_group, g) for g in groups]
        for f in as_completed(futures):
            g_idx, f_path = f.result()
            if f_path:
                results[g_idx] = f_path

    return [results[k] for k in sorted(results.keys())]


# =============================================================================
# 4. MANGADEX API CLIENT
# =============================================================================
class MangaDexClient:
    def __init__(self, lang: str = DEFAULT_LANG):
        self.lang = lang
        self.session = create_reusable_session(pool_size=32)
        self.session.headers.update({"User-Agent": "TruyenKomi-Ubuntu-Sync/2.0 (https://truyenkomi.com)"})
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
            order_norm = (order_by or "oldest").lower()
            if order_norm in ("oldest", "asc"):
                params["order[createdAt]"] = "asc"
            elif order_norm in ("latest_uploaded", "chapter_desc"):
                params["order[latestUploadedChapter]"] = "desc"
            else:
                params["order[createdAt]"] = "desc"

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
                    "last_chapter": attr.get("lastChapter"),
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
# 5. ENGINE ĐỒNG BỘ REALTIME TỪNG CHAPTER LÊN CLOUD BUCKET & WEB
# =============================================================================
class MangaDexSynchronizer:
    def __init__(
        self,
        temp_dir: str = TEMP_DOWNLOAD_DIR,
        workers: int = DEFAULT_WORKERS,
        upload_to_web: bool = DEFAULT_UPLOAD_TO_WEB,
        skip_existing: bool = DEFAULT_SKIP_EXISTING,
        data_saver: bool = DEFAULT_DATA_SAVER,
        merge_slices: bool = DEFAULT_MERGE_SLICES,
        make_pdf: bool = DEFAULT_MAKE_PDF,
        delete_local: bool = True,
        lang: str = DEFAULT_LANG,
        api_base_url: str = DEFAULT_API_BASE_URL,
        **kwargs
    ):
        self.client = MangaDexClient(lang=lang)
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
        # Connection Pool siêu tốc dùng chung (Keep-Alive) cho download & upload
        self.download_session = create_reusable_session(pool_size=max(64, self.workers * 2))
        self.download_session.headers.update({
            "User-Agent": "Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/122.0.0.0 Safari/537.36",
            "Referer": "https://mangadex.org/"
        })
        self.upload_session = create_reusable_session(pool_size=max(64, self.workers * 2))
        self.api_session = create_reusable_session(pool_size=32)

    def _download_single_image(self, url: str, target_path: Path) -> bool:
        target_path.parent.mkdir(parents=True, exist_ok=True)
        for attempt in range(MAX_RETRIES):
            try:
                res = self.download_session.get(url, timeout=DEFAULT_TIMEOUT)
                if res.status_code == 200 and len(res.content) > 500:
                    with open(target_path, "wb") as f:
                        f.write(res.content)
                    return True
                elif res.status_code == 429:
                    time.sleep(1.5 * (attempt + 1))
            except Exception:
                time.sleep(0.5)
        return False

    def _convert_to_webp(self, src_file: Path, dest_webp_file: Path, quality: int = 88) -> bool:
        try:
            with Image.open(src_file) as im:
                im.load()
                im = im.convert('RGB') if im.mode != 'RGB' else im
                im.save(dest_webp_file, 'WEBP', quality=quality, method=4)
            if src_file != dest_webp_file and src_file.exists():
                src_file.unlink(missing_ok=True)
            return True
        except Exception:
            return False

    def _check_chapter_already_exists(
        self,
        manga_id: str,
        slug: str,
        chap_num,
        web_existing_chapters: set = None,
        local_chap_dir: Path = None,
        check_cloud_cdn: bool = False
    ) -> tuple:
        """
        Kiểm tra đa tầng xem chapter đã được tải / đồng bộ hay chưa:
        1. Web API (Website TruyenKomi)
        2. Checkpoint tiến trình (mangadex_sync_state.json)
        3. Ổ cứng máy chủ (Local Temp Files)
        4. Cloud Storage Bucket (CDN)
        """
        norm_key = normalize_chapter_key(chap_num)

        # 1. Kiểm tra trên Web API (Chính xác 100% với dữ liệu website)
        if web_existing_chapters and norm_key in web_existing_chapters:
            return True, "Web API TruyenKomi"

        # 2. Kiểm tra Checkpoint file tiến trình
        if self.state.is_chapter_synced(manga_id, norm_key):
            return True, "Checkpoint tiến trình"

        # 3. Kiểm tra ổ cứng máy chủ (nếu còn file tạm WebP hợp lệ)
        if local_chap_dir and local_chap_dir.exists():
            existing_webp = [p for p in local_chap_dir.glob("*.webp") if p.stat().st_size > 0]
            if existing_webp:
                return True, "Ổ đĩa máy chủ (Local)"

        # 4. Kiểm tra trực tiếp trên Cloud Storage Bucket qua CDN (nếu bật)
        if check_cloud_cdn:
            if check_chapter_exists_on_cloud(slug, norm_key, session=self.upload_session):
                return True, "Cloud Bucket (CDN)"

        return False, ""

    def sync_single_manga(self, manga_id_or_url: str) -> bool:
        manga_id = self.client.extract_manga_id(manga_id_or_url)
        info = self.client.get_manga_details_and_chapters(manga_id)
        title = info["title"]
        slug = info["slug"]
        chapters = info["chapters"]

        if not chapters:
            log_warning(f"⚠️ Bộ truyện '{title}' không có chapter Tiếng Việt nào!")
            return False

        log_info(f"▶ Đang xử lý: [bold]{title}[/bold] (Slug: {slug}) | Tổng {len(chapters)} chapters")

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

            # Đẩy ảnh bìa lên Cloud Bucket ngay!
            if cover_path and cover_path.exists():
                if self.upload_to_web:
                    try:
                        cover_cdn_url = upload_file_to_cloud(cover_path, f"covers/{slug}.webp", "image/webp", session=self.upload_session)
                        log_success(f"  📸 Đã đưa Ảnh bìa lên Bucket Cloud: {cover_cdn_url}")
                    except Exception as err:
                        log_warning(f"  ⚠️ Lỗi upload bìa lên Bucket: {err}")

        # 2. KIỂM TRA ĐA TẦNG CÁC CHAPTER ĐÃ CÓ TRƯỚC ĐÓ (WEB API / CLOUD / LOCAL / CHECKPOINT)
        web_existing = set()
        if self.upload_to_web:
            web_existing = get_existing_chapters_from_web(self.api_base_url, slug, session=self.api_session)
            if web_existing:
                log_info(f"  🌐 Đã kết nối Web API: Tìm thấy {len(web_existing)} chapters đã lưu trên Website.")
                for wk in web_existing:
                    self.state.mark_chapter_synced(manga_id, wk)

        # Phân loại chapter: đã có vs cần tải mới
        already_synced = []
        pending_download = []

        for chap in chapters:
            num = chap["number"]
            num_str = normalize_chapter_key(num)
            chap_dir = local_comic_dir / f"chap{num_str}"

            if self.skip_existing:
                exists, where = self._check_chapter_already_exists(
                    manga_id=manga_id,
                    slug=slug,
                    chap_num=num,
                    web_existing_chapters=web_existing,
                    local_chap_dir=chap_dir,
                    check_cloud_cdn=False
                )
                if exists:
                    already_synced.append((chap, where))
                    self.state.mark_chapter_synced(manga_id, num_str)
                    continue

            pending_download.append(chap)

        total_chaps = len(chapters)
        synced_count = len(already_synced)
        pending_count = len(pending_download)

        # Hiển thị thông tin kiểm tra chapter
        if synced_count > 0:
            log_info(f"  📊 Trạng thái kiểm tra: Đã có {synced_count}/{total_chaps} chapters | Cần tải mới: {pending_count} chapters")

        # NẾU TẤT CẢ CHAPTER ĐÃ TẢI XONG -> BỎ QUA TOÀN BỘ TRUYỆN NGAY LẬP TỨC
        if pending_count == 0 and self.skip_existing:
            log_success(f"  ✨ Toàn bộ {total_chaps}/{total_chaps} chapters của '{title}' đã tải/đồng bộ xong trước đó. Bỏ qua không tải lại!\n")
            self.state.mark_completed(
                manga_id=manga_id, title=title, slug=slug,
                chapters_count=total_chaps, pages_count=0
            )
            return True

        # Hiển thị danh sách các chapter được bỏ qua
        if already_synced:
            if synced_count <= 6:
                for c, where in already_synced:
                    c_num_str = normalize_chapter_key(c["number"])
                    c_name = c.get("title") or f"Chương {c_num_str}"
                    log_info(f"  ⏭️ Bỏ qua {c_name} (Đã có trên {where})")
            else:
                first_k = normalize_chapter_key(already_synced[0][0]["number"])
                last_k = normalize_chapter_key(already_synced[-1][0]["number"])
                log_info(f"  ⏭️ Đã tự động bỏ qua {synced_count} chapters cũ (Chương {first_k} ➔ Chương {last_k})")

        # 3. CHỈ TẢI CÁC CHAPTER CẦN THIẾT (PENDING DOWNLOAD)
        total_pages_downloaded = 0
        for idx, chap in enumerate(pending_download, 1):
            num = chap["number"]
            num_str = normalize_chapter_key(num)
            chap_title = chap.get("title") or f"Chương {num_str}"
            chap_dir = local_comic_dir / f"chap{num_str}"
            chap_dir.mkdir(parents=True, exist_ok=True)

            log_info(f"  📥 [{idx}/{pending_count}] Đang tải {chap_title}...")

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
                # Chuyển đổi WebP ĐA LUỒNG TỐC ĐỘ CAO (method=4)
                final_paths_dict = {}
                with ThreadPoolExecutor(max_workers=min(self.workers, 16)) as conv_pool:
                    conv_futures = {}
                    for p_idx, p_file in enumerate(downloaded_raw, 1):
                        final_webp = chap_dir / f"page_{p_idx:03d}.webp"
                        conv_futures[conv_pool.submit(self._convert_to_webp, p_file, final_webp, 88)] = (p_idx, final_webp)
                    for f in as_completed(conv_futures):
                        p_idx, final_webp = conv_futures[f]
                        if f.result() and final_webp.exists():
                            final_paths_dict[p_idx] = final_webp

                final_paths = [final_paths_dict[k] for k in sorted(final_paths_dict.keys())]
                total_pages_downloaded += len(final_paths)

            # =========================================================================
            # ⚡ ĐẨY NGAY LẬP TỨC LÊN CLOUD BUCKET & ĐỒNG BỘ WEB API SAU MỖI CHAPTER
            # =========================================================================
            if self.upload_to_web and final_paths:
                # 1. Đẩy từng ảnh lên Cloud Storage Bucket qua persistent Keep-Alive session
                uploaded_cdn_urls = [None] * len(final_paths)
                with ThreadPoolExecutor(max_workers=self.workers) as pool:
                    f_to_i = {}
                    for p_i, p_path in enumerate(final_paths):
                        obj_name = f"chapters/{slug}/chap{num_str}/page_{p_i+1:03d}.webp"
                        f = pool.submit(upload_file_to_cloud, p_path, obj_name, "image/webp", self.upload_session)
                        f_to_i[f] = p_i
                    for f in as_completed(f_to_i):
                        p_i = f_to_i[f]
                        try:
                            uploaded_cdn_urls[p_i] = f.result()
                        except Exception as e:
                            log_warning(f"    Lỗi upload ảnh {p_i+1} lên bucket: {e}")

                valid_cdn_urls = [u for u in uploaded_cdn_urls if u]
                if valid_cdn_urls:
                    log_success(f"    ☁️ Đã lưu {len(valid_cdn_urls)} ảnh vào Bucket Cloud: {GCS_BUCKET}")
                    # 2. Đồng bộ lên Web API qua persistent session
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
                        categories=info.get("genres", []),
                        session=self.api_session
                    )
                    if synced:
                        log_success(f"    🌐 Đã đồng bộ {chap_title} lên Website TruyenKomi thành công!")

            # Ghi nhận hoàn thành chapter vào checkpoint
            self.state.mark_chapter_synced(manga_id, num_str)

            # 3. Dọn dẹp file tạm trên máy chủ để chống tràn ổ cứng
            if self.delete_local:
                shutil.rmtree(chap_dir, ignore_errors=True)

        self.state.mark_completed(
            manga_id=manga_id, title=title, slug=slug,
            chapters_count=len(chapters), pages_count=total_pages_downloaded
        )
        log_success(f"🎉 Hoàn thành cập nhật trọn bộ '{title}'!\n")
        return True

    def sync_all_vietnamese_manga(self, order_by: str = "oldest", start_offset: int = 0, limit: int = None):
        total_available = self.client.get_total_vietnamese_manga_count()
        order_norm = (order_by or "oldest").lower()
        if order_norm in ("oldest", "asc"):
            order_label = "CŨ NHẤT ➔ MỚI NHẤT (Oldest first)"
        elif order_norm in ("latest_uploaded", "chapter_desc"):
            order_label = "CHAPTER MỚI NHẤT ➔ CŨ NHẤT (Latest uploaded chapter)"
        else:
            order_label = "MỚI NHẤT ➔ CŨ NHẤT (Newest first)"

        log_info(f"🚀 BẮT ĐẦU ĐỒNG BỘ TOÀN BỘ MANGADEX TIẾNG VIỆT")
        log_info(f"• Thứ tự duyệt truyện: {order_label}")
        log_info(f"• Cloud Storage Bucket: {GCS_BUCKET} ({GCS_ENDPOINT})")
        log_info(f"• Web API: {self.api_base_url}")
        log_info(f"• Cơ chế lưu: REAL-TIME TỪNG CHAPTER (Tải xong chương nào đẩy ngay lên Bucket & Web API)")
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
                last_chap_str = item.get("last_chapter")
                comp_info = self.state.get_completed_info(m_id) or {}
                prev_count = comp_info.get("chapters_count", 0)

                has_new = False
                if last_chap_str:
                    try:
                        if float(last_chap_str) > prev_count:
                            has_new = True
                    except Exception:
                        pass

                if not has_new:
                    log_info(f"[{count}] ⏭️ Đã hoàn tất ({prev_count} chaps): {title} (Bỏ qua)")
                    continue
                else:
                    log_info(f"[{count}] 🔄 Phát hiện chapter mới cho: {title} ({prev_count} ➔ {last_chap_str}). Đang cập nhật...")

            log_info(f"━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━")
            log_info(f"▶ [{count}] Đang tải: {title} (ID: {m_id})")
            log_info(f"✍️ Tác giả: {item['author']}")

            try:
                self.sync_single_manga(m_id)
            except Exception as e:
                log_error(f"Lỗi khi xử lý truyện '{title}': {e}")
                self.state.mark_failed(m_id, title, str(e))

            time.sleep(0.5)

        log_success("🎉 ĐÃ HOÀN TẤT TIẾN TRÌNH ĐỒNG BỘ MANGADEX LÊN BUCKET & WEB!")


# Backward compatibility alias
MangaDexDriveSynchronizer = MangaDexSynchronizer


# =============================================================================
# HÀM MAIN
# =============================================================================
def main():
    parser = argparse.ArgumentParser(
        description="🚀 Tải truyện MangaDex (Tiếng Việt) và lưu trữ trực tiếp vào Cloud Bucket & Web API"
    )
    parser.add_argument("--all", action="store_true", help="Tải toàn bộ truyện Tiếng Việt trên MangaDex")
    parser.add_argument("--url", "--manga", default=None, help="URL hoặc MangaDex UUID của bộ truyện muốn tải")
    parser.add_argument("--folder-id", default=None, help="[Bỏ qua] Google Drive Folder ID")
    parser.add_argument("--remote", default=None, help="[Bỏ qua] Tên remote trong Rclone")
    parser.add_argument("--drive-path", default=None, help="[Bỏ qua] Đường dẫn thư mục Google Drive")
    parser.add_argument("--service-account", default=None, help="[Bỏ qua] Đường dẫn file service_account.json")
    parser.add_argument("--offset", type=int, default=0, help="Vị trí bắt đầu tải (Mặc định: 0)")
    parser.add_argument("--limit", type=int, default=None, help="Số lượng truyện tối đa muốn tải (Mặc định: Tất cả)")
    parser.add_argument("--order", choices=["oldest", "latest", "newest", "latest_uploaded"], default="oldest", help="Thứ tự duyệt truyện: newest/latest (mới nhất đến cũ nhất), oldest (cũ nhất đến mới nhất)")
    parser.add_argument("--workers", type=int, default=DEFAULT_WORKERS, help=f"Số luồng tải ảnh song song (Mặc định: {DEFAULT_WORKERS})")
    parser.add_argument("--data-saver", action="store_true", default=DEFAULT_DATA_SAVER, help="Bật Data-Saver (Mặc định: TẮT - Tải ảnh gốc)")
    parser.add_argument("--no-merge", action="store_true", help="Tắt tự động ghép ảnh Manhwa 5-in-1")
    parser.add_argument("--no-skip", action="store_true", help="Tắt bỏ qua chapter đã có trên máy")
    parser.add_argument("--no-upload", action="store_true", help="Chỉ tải lưu cục bộ, không đẩy lên Cloud")
    parser.add_argument("--keep-local", action="store_true", help="Không xóa file tạm cục bộ sau khi đẩy lên Cloud")
    parser.add_argument("--api", default=DEFAULT_API_BASE_URL, help=f"URL Backend API (Mặc định: {DEFAULT_API_BASE_URL})")

    args = parser.parse_args()

    sync_engine = MangaDexSynchronizer(
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
# 2. KIỂM TRA VÀ THIẾT LẬP FILE MÔI TRƯỜNG .ENV (TỪ .ENV.EXAMPLE)
# ==============================================================================
setup_env_file() {
    FORCE="${1:-0}"
    if [ -f ".env" ] && [ "$FORCE" != "1" ] && [ "$FORCE" != "--force" ]; then
        return 0
    fi

    log_header "KIỂM TRA VÀ THIẾT LẬP FILE CẤU HÌNH .ENV"

    if [ -f ".env.example" ]; then
        log_info "Đang khởi tạo file .env từ .env.example..."
        cp .env.example .env
        log_success "Đã tạo thành công file .env từ .env.example!"
    elif [ -f "../.env.example" ]; then
        log_info "Đang sao chép file cấu hình từ ../.env.example sang .env..."
        cp ../.env.example .env
        log_success "Đã tạo thành công file .env từ ../.env.example!"
    else
        log_info "Không tìm thấy .env.example. Đang tự động tạo file .env chuẩn với cấu hình Cloud & Web API..."
        cat << 'EOF' > .env
# ==================================================
# 🚀 TruyenKomi Environment Configuration (.env)
# ==================================================

# 1. Primary Cloud Storage (Google Cloud Storage - S3 Interoperability)
R2_ENDPOINT="storage.googleapis.com"
R2_ACCESS_KEY="GOOGQHRXVRS7YCR24JBLB33S"
R2_SECRET_KEY="3Iamo8whmuUeT2B+CMtRnfW6qdIsmwXVec47tF52"
R2_BUCKET_NAME="truyenkomi"
R2_SECURE=true
R2_CDN_BASE_URL="https://img.truyenkomi.site"

# 2. Web App & Backend API
PUBLIC_DOMAIN="https://truyenkomi.com"
API_BASE_URL="https://truyenkomi.com/api"
EOF
        log_success "Đã tạo file .env mặc định thành công!"
    fi

    if [ -f ".env" ]; then
        echo -e "• File cấu hình: ${CYAN}$(pwd)/.env${NC}"
        echo -e "• Cloud Bucket:  ${GREEN}$(grep '^R2_BUCKET_NAME=' .env 2>/dev/null | cut -d'=' -f2 | tr -d '\"' || echo 'truyenkomi')${NC}"
        echo -e "• Web API:       ${CYAN}$(grep '^API_BASE_URL=' .env 2>/dev/null | cut -d'=' -f2 | tr -d '\"' || echo 'https://truyenkomi.com/api')${NC}\n"
    fi
}

# ==============================================================================
# 3. KIỂM TRA VÀ THIẾT LẬP BỘ NHỚ ẢO SWAP (CHỐNG TRÀN RAM / OOM KILLER)
# ==============================================================================
setup_swap_memory() {
    log_header "KIỂM TRA BỘ NHỚ ẢO SWAP (CHỐNG TRÀN RAM KHI CHẠY 32 LUỒNG)"

    SWAP_TOTAL=$(free -m 2>/dev/null | awk '/^Swap:/ {print $2}' || echo "0")
    if [ -n "$SWAP_TOTAL" ] && [ "$SWAP_TOTAL" -ge 2000 ]; then
        log_success "Máy chủ đã có sẵn ${SWAP_TOTAL}MB Swap (>= 2GB). An toàn bộ nhớ!"
        return 0
    fi

    log_warning "Máy chủ chưa có Swap hoặc Swap < 2GB (Hiện tại: ${SWAP_TOTAL:-0}MB)."

    # Kiểm tra quyền sudo/root
    if [ "$(id -u)" -ne 0 ] && [ -z "$SUDO" ]; then
        log_warning "Cần quyền sudo hoặc root để tự động tạo Swapfile. Bỏ qua bước này."
        return 0
    fi

    # Kiểm tra dung lượng ổ đĩa trống
    AVAIL_DISK=$(df -m / 2>/dev/null | awk 'NR==2 {print $4}' || echo "0")
    if [ "$AVAIL_DISK" -gt 6000 ]; then
        SWAP_SIZE="4G"
        SWAP_MB=4096
    elif [ "$AVAIL_DISK" -gt 3000 ]; then
        SWAP_SIZE="2G"
        SWAP_MB=2048
    else
        log_warning "Ổ đĩa chỉ còn ${AVAIL_DISK}MB trống, không đủ dung lượng để tạo file Swap lớn."
        return 0
    fi

    log_info "Đang tự động khởi tạo ${SWAP_SIZE} bộ nhớ ảo Swap tại /swapfile..."
    $SUDO swapoff /swapfile 2>/dev/null || true
    $SUDO rm -f /swapfile 2>/dev/null || true

    if ! $SUDO fallocate -l $SWAP_SIZE /swapfile 2>/dev/null; then
        $SUDO dd if=/dev/zero of=/swapfile bs=1M count=$SWAP_MB status=none 2>/dev/null || true
    fi

    if [ -f /swapfile ]; then
        $SUDO chmod 600 /swapfile
        $SUDO mkswap /swapfile >/dev/null 2>&1 || true
        if $SUDO swapon /swapfile 2>/dev/null; then
            if [ -f /etc/fstab ] && ! grep -q "/swapfile" /etc/fstab; then
                echo '/swapfile none swap sw 0 0' | $SUDO tee -a /etc/fstab >/dev/null 2>&1 || true
            fi
            $SUDO sysctl vm.swappiness=10 >/dev/null 2>&1 || true
            if [ -f /etc/sysctl.conf ] && ! grep -q "vm.swappiness=10" /etc/sysctl.conf; then
                echo 'vm.swappiness=10' | $SUDO tee -a /etc/sysctl.conf >/dev/null 2>&1 || true
            fi
            log_success "Đã kích hoạt thành công ${SWAP_SIZE} bộ nhớ ảo Swap tại /swapfile!"
        else
            log_warning "Không thể bật swapon (môi trường ảo hóa OpenVZ / LXC có thể chặn swapon)."
        fi
    fi
}

# ==============================================================================
# 4. KIỂM TRA VÀ CÀI ĐẶT MÔI TRƯỜNG TRÊN UBUNTU
# ==============================================================================
setup_environment() {
    log_header "BƯỚC 1/2: KIỂM TRA VÀ THIẾT LẬP MÔI TRƯỜNG UBUNTU"

    # Tự động tạo file .env từ .env.example nếu chưa có
    setup_env_file

    # Tự động kiểm tra và tạo bộ nhớ ảo Swap chống tràn RAM
    setup_swap_memory

    export DEBIAN_FRONTEND=noninteractive
    MISSING_PKGS=()
    if ! command -v python3 >/dev/null 2>&1; then MISSING_PKGS+=("python3"); fi
    if ! command -v pip3 >/dev/null 2>&1; then MISSING_PKGS+=("python3-pip"); fi
    if ! dpkg -s python3-venv >/dev/null 2>&1; then MISSING_PKGS+=("python3-venv"); fi
    if ! dpkg -s python3-virtualenv >/dev/null 2>&1 && ! command -v virtualenv >/dev/null 2>&1; then MISSING_PKGS+=("python3-virtualenv"); fi
    if ! command -v curl >/dev/null 2>&1; then MISSING_PKGS+=("curl"); fi

    if [ ${#MISSING_PKGS[@]} -gt 0 ]; then
        log_info "Đang cài đặt các gói hệ thống: ${MISSING_PKGS[*]}..."
        $SUDO apt-get update -y
        $SUDO apt-get install -y "${MISSING_PKGS[@]}" ca-certificates
    fi

    # Cập nhật đường dẫn tuyệt đối của Python interpreter
    if [ -x "/usr/bin/python3" ]; then
        PYTHON_BIN="/usr/bin/python3"
    else
        PYTHON_BIN="$(command -v python3 2>/dev/null || which python3 2>/dev/null || echo "python3")"
    fi

    # Khởi tạo môi trường ảo Virtualenv với cơ chế Fallback đa tầng (chống lỗi interpreter path gh-96861 trên Ubuntu)
    if [ ! -d "$VENV_DIR" ] || [ ! -f "$VENV_DIR/bin/activate" ]; then
        log_info "Đang tạo môi trường ảo Python Virtualenv ($VENV_DIR)..."
        rm -rf "$VENV_DIR"

        VENV_CREATED=0
        # Cách 1: Gọi qua đường dẫn tuyệt đối PYTHON_BIN (Khắc phục lỗi gh-96861 của venv)
        if "$PYTHON_BIN" -m venv "$VENV_DIR" >/dev/null 2>&1; then
            VENV_CREATED=1
        fi

        # Cách 2: Thử virtualenv nếu cách 1 gặp lỗi interpreter path
        if [ "$VENV_CREATED" -eq 0 ]; then
            log_warning "venv mặc định gặp lỗi interpreter path, đang kích hoạt virtualenv..."
            $SUDO apt-get install -y python3-virtualenv python3-venv >/dev/null 2>&1 || true
            if command -v virtualenv >/dev/null 2>&1 && virtualenv -p "$PYTHON_BIN" "$VENV_DIR" >/dev/null 2>&1; then
                VENV_CREATED=1
            elif "$PYTHON_BIN" -m virtualenv "$VENV_DIR" >/dev/null 2>&1; then
                VENV_CREATED=1
            fi
        fi

        # Cách 3: Thử cài python3-full nếu cần
        if [ "$VENV_CREATED" -eq 0 ]; then
            $SUDO apt-get install -y python3-full >/dev/null 2>&1 || true
            if "$PYTHON_BIN" -m venv "$VENV_DIR" >/dev/null 2>&1; then
                VENV_CREATED=1
            fi
        fi

        if [ "$VENV_CREATED" -eq 1 ]; then
            log_success "Đã khởi tạo môi trường ảo $VENV_DIR thành công!"
        else
            log_warning "Không thể khởi tạo thư mục venv riêng, chuyển sang dùng Python hệ thống."
        fi
    fi

    # Cài đặt / cập nhật các thư viện cần thiết
    if [ -f "$VENV_DIR/bin/activate" ]; then
        # shellcheck source=/dev/null
        source "$VENV_DIR/bin/activate"
        pip install --upgrade pip >/dev/null 2>&1 || true
        pip install --quiet requests urllib3 pillow rich
    else
        "$PYTHON_BIN" -m pip install --upgrade pip >/dev/null 2>&1 || true
        "$PYTHON_BIN" -m pip install --quiet --break-system-packages requests urllib3 pillow rich 2>/dev/null || \
        "$PYTHON_BIN" -m pip install --quiet requests urllib3 pillow rich
    fi

    log_success "Môi trường máy Ubuntu đã sẵn sàng 100%!"
}

# ==============================================================================
# 4. CÁC HÀM THỰC THI TẢI TRUYỆN (TURBO SPEED - 32 LUỒNG)
# ==============================================================================
run_download_all_foreground() {
    ORDER="${1:-}"
    if [ -z "$ORDER" ]; then
        echo -e "\n${BOLD}Chọn thứ tự tải truyện:${NC}"
        echo -e "  [1] 🆕 Từ MỚI NHẤT ➔ CŨ NHẤT (Khuyên dùng - Cập nhật truyện mới)"
        echo -e "  [2] ⏳ Từ CŨ NHẤT ➔ MỚI NHẤT (Lưu trữ toàn bộ theo lịch sử)"
        echo -n "Chọn [1-2] (Mặc định: 1): "
        read -r ord_choice
        if [ "$ord_choice" = "2" ]; then
            ORDER="oldest"
        else
            ORDER="newest"
        fi
    fi

    ORDER_VAL="newest"
    ORDER_LABEL="MỚI NHẤT ➔ CŨ NHẤT"
    if [ "$ORDER" = "oldest" ] || [ "$ORDER" = "--oldest" ]; then
        ORDER_VAL="oldest"
        ORDER_LABEL="CŨ NHẤT ➔ MỚI NHẤT"
    fi

    if [ -f "$VENV_DIR/bin/activate" ]; then
        # shellcheck source=/dev/null
        source "$VENV_DIR/bin/activate"
    fi
    PY_RUNNER="$(get_python_runner)"
    SCRIPT_EXEC="$PYTHON_SCRIPT"
    if [ -f "backend/$PYTHON_SCRIPT" ]; then
        SCRIPT_EXEC="backend/$PYTHON_SCRIPT"
    fi

    log_header "BẮT ĐẦU TẢI TOÀN BỘ TRUYỆN MANGADEX TIẾNG VIỆT (32 LUỒNG - $ORDER_LABEL)"
    "$PY_RUNNER" "$SCRIPT_EXEC" --all --order "$ORDER_VAL" --workers 32
}

run_download_single_manga() {
    echo -n "Nhập link truyện MangaDex (hoặc UUID): "
    read -r manga_url
    if [ -z "$manga_url" ]; then
        log_error "Link truyện không được để trống!"
        return 1
    fi

    if [ -f "$VENV_DIR/bin/activate" ]; then
        # shellcheck source=/dev/null
        source "$VENV_DIR/bin/activate"
    fi
    PY_RUNNER="$(get_python_runner)"
    SCRIPT_EXEC="$PYTHON_SCRIPT"
    if [ -f "backend/$PYTHON_SCRIPT" ]; then
        SCRIPT_EXEC="backend/$PYTHON_SCRIPT"
    fi

    "$PY_RUNNER" "$SCRIPT_EXEC" --url "$manga_url" --workers 32
}

run_in_background() {
    ORDER="${1:-}"
    if [ -z "$ORDER" ]; then
        echo -e "\n${BOLD}Chọn thứ tự tải ngầm:${NC}"
        echo -e "  [1] 🆕 Từ MỚI NHẤT ➔ CŨ NHẤT (Khuyên dùng - Cập nhật truyện mới)"
        echo -e "  [2] ⏳ Từ CŨ NHẤT ➔ MỚI NHẤT (Lưu trữ toàn bộ theo lịch sử)"
        echo -n "Chọn [1-2] (Mặc định: 1): "
        read -r ord_choice
        if [ "$ord_choice" = "2" ]; then
            ORDER="oldest"
        else
            ORDER="newest"
        fi
    fi

    if [ "$ORDER" = "oldest" ] || [ "$ORDER" = "--oldest" ]; then
        ORDER_VAL="oldest"
        ORDER_LABEL="CŨ NHẤT ➔ MỚI NHẤT"
    else
        ORDER_VAL="newest"
        ORDER_LABEL="MỚI NHẤT ➔ CŨ NHẤT"
    fi

    if [ -f "$PID_FILE" ]; then
        OLD_PID=$(cat "$PID_FILE")
        if ps -p "$OLD_PID" > /dev/null 2>&1; then
            log_warning "Tiến trình tải đang chạy ngầm với PID: $OLD_PID!"
            echo -e "Gõ '${BOLD}tail -f $LOG_FILE${NC}' để theo dõi."
            return 0
        fi
    fi

    if [ -f "$VENV_DIR/bin/activate" ]; then
        # shellcheck source=/dev/null
        source "$VENV_DIR/bin/activate"
    fi
    PY_RUNNER="$(get_python_runner)"
    SCRIPT_EXEC="$PYTHON_SCRIPT"
    if [ -f "backend/$PYTHON_SCRIPT" ]; then
        SCRIPT_EXEC="backend/$PYTHON_SCRIPT"
    fi

    log_info "Đang khởi chạy tiến trình tải ngầm 24/7 ($ORDER_LABEL) (nohup - 32 luồng)..."
    nohup "$PY_RUNNER" "$SCRIPT_EXEC" --all --order "$ORDER_VAL" --workers 32 >> "$LOG_FILE" 2>&1 &
    NEW_PID=$!
    echo "$NEW_PID" > "$PID_FILE"
    echo "$ORDER_VAL" > ".mangadex_order"

    log_success "Tiến trình đã được đưa vào chạy ngầm ($ORDER_LABEL)! PID: ${BOLD}$NEW_PID${NC}"
    echo -e "• Thứ tự tải:  ${MAGENTA}${BOLD}$ORDER_LABEL${NC}"
    echo -e "• File nhật ký: ${CYAN}$LOG_FILE${NC}"
    echo -e "• Lệnh theo dõi trực tiếp: ${BOLD}tail -f $LOG_FILE${NC}\n"
}

show_status() {
    log_header "TRẠNG THÁI TIẾN TRÌNH TẢI MANGADEX"
    if [ -f "$PID_FILE" ]; then
        PID=$(cat "$PID_FILE")
        if ps -p "$PID" > /dev/null 2>&1; then
            ORDER_TYPE="Chưa rõ"
            if [ -f ".mangadex_order" ]; then
                ORDER_SAVED=$(cat ".mangadex_order" 2>/dev/null)
                if [ "$ORDER_SAVED" = "oldest" ]; then
                    ORDER_TYPE="Cũ nhất ➔ Mới nhất (Oldest first)"
                else
                    ORDER_TYPE="Mới nhất ➔ Cũ nhất (Newest first)"
                fi
            elif ps -p "$PID" -o args= 2>/dev/null | grep -q "oldest"; then
                ORDER_TYPE="Cũ nhất ➔ Mới nhất (Oldest first)"
            elif ps -p "$PID" -o args= 2>/dev/null | grep -qE "newest|latest"; then
                ORDER_TYPE="Mới nhất ➔ Cũ nhất (Newest first)"
            fi

            echo -e "Trạng thái: ${GREEN}${BOLD}ĐANG CHẠY NGẦM (Active)${NC} - PID: ${BOLD}$PID${NC}"
            echo -e "Thứ tự tải: ${CYAN}${BOLD}$ORDER_TYPE${NC}"
        else
            echo -e "Trạng thái: ${YELLOW}ĐÃ DỪNG (Inactive)${NC}"
        fi
    else
        echo -e "Trạng thái: ${YELLOW}CHƯA KHỞI CHẠY TIẾN TRÌNH NGẦM${NC}"
    fi

    if [ -f ".env" ]; then
        echo -e "Cấu hình .env: ${GREEN}${BOLD}ĐÃ KÍCH HOẠT (.env)${NC}"
    else
        echo -e "Cấu hình .env: ${YELLOW}Chưa có .env (Chọn [8] để tạo từ .env.example)${NC}"
    fi

    echo -e "Lưu trữ:    ${GREEN}${BOLD}Cloud Storage Bucket & Web API${NC} (Đã tắt Google Drive)"

    SWAP_INFO=$(free -m 2>/dev/null | awk '/^Swap:/ {print $2}')
    SWAP_USED=$(free -m 2>/dev/null | awk '/^Swap:/ {print $3}')
    if [ -n "$SWAP_INFO" ] && [ "$SWAP_INFO" -gt 0 ]; then
        echo -e "Bộ nhớ ảo:  ${GREEN}${BOLD}${SWAP_INFO}MB Swap${NC} (Đang dùng: ${SWAP_USED}MB)"
    else
        echo -e "Bộ nhớ ảo:  ${YELLOW}Chưa có Swap (Khuyên dùng [7] để tạo Swap chống tràn RAM)${NC}"
    fi

    STATE_FILE="mangadex_temp_cache/mangadex_sync_state.json"
    if [ -f "$STATE_FILE" ]; then
        echo -e "\n${BOLD}📊 Thống kê đã đồng bộ lên Cloud Storage Bucket & Web:${NC}"
        PY_RUNNER="$(get_python_runner)"
        "$PY_RUNNER" -c "
import json
try:
    with open('$STATE_FILE', 'r', encoding='utf-8') as f:
        d = json.load(f)
        s = d.get('stats', {})
        print(f'  • Tổng số bộ truyện đã hoàn tất: {s.get("total_comics", 0)} bộ')
        print(f'  • Tổng số chapter đã lưu: {s.get("total_chapters", 0)} chương')
        print(f'  • Tổng số trang ảnh đã lưu: {s.get("total_pages", 0)} trang WebP')
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
            rm -f "$PID_FILE" ".mangadex_order"
            log_success "Đã dừng tiến trình tải ngầm thành công!"
            return 0
        fi
    fi
    log_warning "Không có tiến trình tải ngầm nào đang chạy."
    rm -f "$PID_FILE" ".mangadex_order"
}

# ==============================================================================
# 5. XỬ LÝ DÒNG LỆNH CLI HOẶC MENU TƯƠNG TÁC
# ==============================================================================
extract_python_engine

if [ "$1" = "--setup-env" ] || [ "$1" = "--env" ]; then
    setup_env_file 1
    exit 0
elif [ "$1" = "--setup-swap" ] || [ "$1" = "--swap" ]; then
    setup_swap_memory
    exit 0
elif [ "$1" = "--setup-drive" ] || [ "$1" = "--setup-rclone" ]; then
    log_info "Đã bỏ lưu truyện trên Google Drive. Tiến trình sẽ đẩy trực tiếp lên Cloud Storage Bucket & Web API."
    exit 0
elif [ "$1" = "--all" ]; then
    setup_environment
    ORDER="${2:-newest}"
    run_download_all_foreground "$ORDER"
    exit 0
elif [ "$1" = "--bg-newest" ] || [ "$1" = "--bg-latest" ]; then
    setup_environment
    run_in_background "newest"
    exit 0
elif [ "$1" = "--bg-oldest" ]; then
    setup_environment
    run_in_background "oldest"
    exit 0
elif [ "$1" = "--bg" ] || [ "$1" = "--daemon" ]; then
    setup_environment
    ORDER="newest"
    if [ "$2" = "oldest" ] || [ "$2" = "--oldest" ]; then
        ORDER="oldest"
    elif [ "$2" = "newest" ] || [ "$2" = "--newest" ] || [ "$2" = "latest" ] || [ "$2" = "--latest" ]; then
        ORDER="newest"
    fi
    run_in_background "$ORDER"
    exit 0
elif [ "$1" = "--status" ]; then
    show_status
    exit 0
elif [ "$1" = "--stop" ]; then
    stop_background_process
    exit 0
elif [ "$1" = "--url" ] && [ -n "$2" ]; then
    setup_environment
    if [ -f "$VENV_DIR/bin/activate" ]; then
        # shellcheck source=/dev/null
        source "$VENV_DIR/bin/activate"
    fi
    PY_RUNNER="$(get_python_runner)"
    SCRIPT_EXEC="$PYTHON_SCRIPT"
    if [ -f "backend/$PYTHON_SCRIPT" ]; then SCRIPT_EXEC="backend/$PYTHON_SCRIPT"; fi
    "$PY_RUNNER" "$SCRIPT_EXEC" --url "$2" --workers 32
    exit 0
fi

setup_environment

while true; do
    SWAP_VAL=$(free -m 2>/dev/null | awk '/^Swap:/ {print $2}')
    if [ -n "$SWAP_VAL" ] && [ "$SWAP_VAL" -gt 0 ]; then
        SWAP_BADGE="${GREEN}🟢 ${SWAP_VAL}MB (Đã kích hoạt)${NC}"
    else
        SWAP_BADGE="${YELLOW}🟡 0MB (Chọn [7] để tạo)${NC}"
    fi

    if [ -f ".env" ]; then
        ENV_BADGE="${GREEN}🟢 Đã có file .env${NC}"
    else
        ENV_BADGE="${YELLOW}🟡 Chưa có (Chọn [8] để tạo)${NC}"
    fi

    echo -e "${CYAN}================================================================${NC}"
    echo -e "${BOLD}${MAGENTA}🚀 MANGADEX TO CLOUD STORAGE & WEB SYNCHRONIZER (UBUNTU)${NC}"
    echo -e "   File cấu hình: $ENV_BADGE (Đọc từ .env / .env.example)"
    echo -e "   Cloud Bucket: ${GREEN}truyenkomi${NC} (Google Cloud Storage / R2)"
    echo -e "   Web API:      ${CYAN}https://truyenkomi.com/api${NC}"
    echo -e "   Bộ nhớ ảo:    $SWAP_BADGE (Chống tràn RAM/OOM khi chạy 32 luồng)"
    echo -e "   Google Drive: ${YELLOW}ĐÃ TẮT (Chỉ lưu Cloud Bucket & Web)${NC}"
    echo -e "${CYAN}----------------------------------------------------------------${NC}"
    echo -e "⚙️  ${BOLD}CẤU HÌNH HIỆN TẠI (TỐI ƯU TỐC ĐỘ CAO - TURBO SPEED):${NC}"
    echo -e "   ${GREEN}☑️${NC} Tự động tải lên Cloud & Đồng bộ Web API: ${BOLD}${GREEN}BẬT${NC}"
    echo -e "   ${GREEN}☑️${NC} Bỏ qua chapter đã tải (Web/Cloud/Máy):   ${BOLD}${GREEN}BẬT (Kiểm tra đa tầng)${NC}"
    echo -e "   ${YELLOW}⬜${NC} MangaDex Data-Saver:                     ${BOLD}${YELLOW}TẮT (Tải ẢNH GỐC)${NC}"
    echo -e "   ${GREEN}☑️${NC} Ghép ảnh Manhwa 5-in-1 (>70 ảnh):        ${BOLD}${GREEN}BẬT (Đa luồng)${NC}"
    echo -e "   ${YELLOW}⬜${NC} Tự động xuất file PDF:                   ${BOLD}${YELLOW}TẮT${NC}"
    echo -e "   ${CYAN}⚡${NC} Luồng tải & Upload song song:            ${BOLD}${GREEN}32 luồng (Turbo Speed)${NC}"
    echo -e "   ${CYAN}⚡${NC} Tái sử dụng kết nối mạng (Keep-Alive):   ${BOLD}${GREEN}BẬT (Connection Pooling)${NC}"
    echo -e "   ${CYAN}⚡${NC} Nén WebP đa luồng (Multi-core CPU):      ${BOLD}${GREEN}BẬT (Cực nhanh)${NC}"
    echo -e "${CYAN}================================================================${NC}"
    echo -e "  ${BOLD}[1]${NC} 🚀 ${BOLD}Tải TOÀN BỘ truyện trực tiếp trên màn hình${NC} (32 luồng)"
    echo -e "  ${BOLD}[2]${NC} ⚡ ${BOLD}Tải 1 bộ truyện cụ thể${NC} (Nhập link MangaDex hoặc UUID)"
    echo -e "  ${BOLD}[3]${NC} 🆕 ${BOLD}Tải ngầm từ MỚI NHẤT ➔ CŨ NHẤT${NC} (nohup 24/7 - Khuyên dùng)"
    echo -e "  ${BOLD}[4]${NC} ⏳ ${BOLD}Tải ngầm từ CŨ NHẤT ➔ MỚI NHẤT${NC} (nohup 24/7 - Lưu trữ lịch sử)"
    echo -e "  ${BOLD}[5]${NC} 📊 ${BOLD}Xem trạng thái, thống kê & nhật ký${NC} (Logs)"
    echo -e "  ${BOLD}[6]${NC} 🛑 ${BOLD}Dừng tiến trình tải ngầm${NC}"
    echo -e "  ${BOLD}[7]${NC} 🛡️  ${BOLD}Thiết lập / Bật bộ nhớ ảo Swap (4GB / 2GB)${NC}"
    echo -e "  ${BOLD}[8]${NC} 📝 ${BOLD}Tạo / Khôi phục file .env từ .env.example${NC}"
    echo -e "  ${BOLD}[0]${NC} ❌ Thoát"
    echo -e "${CYAN}----------------------------------------------------------------${NC}"
    echo -n "Chọn thao tác [0-8]: "
    read -r choice

    case "$choice" in
        1) run_download_all_foreground ;;
        2) run_download_single_manga ;;
        3) run_in_background "newest" ;;
        4) run_in_background "oldest" ;;
        5) show_status ;;
        6) stop_background_process ;;
        7) setup_swap_memory ;;
        8)
            if [ -f ".env" ]; then
                echo -n "File .env đã tồn tại. Bạn có muốn ghi đè từ .env.example không? [y/N]: "
                read -r ovr
                if [ "$ovr" = "y" ] || [ "$ovr" = "Y" ]; then
                    setup_env_file 1
                else
                    log_info "Giữ nguyên file .env hiện tại."
                fi
            else
                setup_env_file 1
            fi
            ;;
        0) echo -e "\nTạm biệt!\n"; exit 0 ;;
        *) log_warning "Lựa chọn không hợp lệ." ;;
    esac
    echo ""
done

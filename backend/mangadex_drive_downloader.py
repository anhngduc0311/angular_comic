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
        if not self.state_file_path.exists():
            self._try_restore_from_cloud()

        if self.state_file_path.exists():
            try:
                with open(self.state_file_path, "r", encoding="utf-8") as f:
                    self.data = json.load(f)
            except Exception as e:
                log_warning(f"Lỗi đọc file tiến trình: {e}. Tạo mới.")

    def _try_restore_from_cloud(self):
        """Tự động khôi phục checkpoint từ Cloud Bucket nếu đổi sang VPS mới"""
        try:
            url = f"{CDN_BASE_URL}/metadata/{STATE_FILE_NAME}"
            res = requests.get(url, timeout=5)
            if res.status_code == 200 and len(res.content) > 10:
                self.state_file_path.parent.mkdir(parents=True, exist_ok=True)
                with open(self.state_file_path, "wb") as f:
                    f.write(res.content)
                log_success(f"☁️ Đã tự động khôi phục lịch sử tải ({STATE_FILE_NAME}) từ Cloud Bucket!")
        except Exception:
            pass

    def backup_to_cloud(self, session: requests.Session = None):
        """Tự động sao lưu file tiến trình lên Cloud Bucket để đồng bộ xuyên suốt các VPS"""
        try:
            if self.state_file_path.exists():
                upload_file_to_cloud(
                    self.state_file_path,
                    f"metadata/{STATE_FILE_NAME}",
                    content_type="application/json",
                    session=session
                )
        except Exception:
            pass

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
        if len(self.data["completed_manga"]) % 10 == 0:
            self.backup_to_cloud()

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
            elif order_norm in ("newest_created", "created_desc"):
                params["order[createdAt]"] = "desc"
            else:
                # "latest", "newest", "latest_uploaded", "chapter_desc", "updated"
                # Mặc định khi tải mới nhất: Ưu tiên truyện có chapter mới vừa upload
                params["order[latestUploadedChapter]"] = "desc"

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
        elif order_norm in ("newest_created", "created_desc"):
            order_label = "TRUYỆN MỚI TẠO ➔ CŨ NHẤT (Newest created manga)"
        else:
            order_label = "CHAPTER MỚI NHẤT ➔ CŨ NHẤT (Latest uploaded chapters)"

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
                synced_at = comp_info.get("synced_at")
                manga_updated_at = item.get("updated_at")

                has_new = False
                if last_chap_str:
                    try:
                        if float(last_chap_str) > prev_count:
                            has_new = True
                    except Exception:
                        pass

                if not has_new and manga_updated_at and synced_at:
                    try:
                        if manga_updated_at > synced_at:
                            has_new = True
                    except Exception:
                        pass

                if not has_new:
                    log_info(f"[{count}] ⏭️ Đã hoàn tất ({prev_count} chaps): {title} (Bỏ qua)")
                    continue
                else:
                    new_hint = f"{prev_count} ➔ {last_chap_str}" if last_chap_str else f"Đã lưu: {prev_count} chaps"
                    log_info(f"[{count}] 🔄 Phát hiện cập nhật mới cho: {title} ({new_hint}). Đang kiểm tra chapter mới...")

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
    parser.add_argument("--order", choices=["oldest", "latest", "newest", "newest_created", "latest_uploaded"], default="oldest", help="Thứ tự duyệt truyện: latest/newest (ưu tiên chapter mới nhất), oldest (cũ nhất -> mới nhất), newest_created (truyện mới tạo)")
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

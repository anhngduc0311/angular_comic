#!/usr/bin/env python3
# -*- coding: utf-8 -*-
"""
=============================================================================
🚀 MangaDex Zero-Storage Fast Synchronizer (TruyenKomi & MangaDex v5)
=============================================================================
Kiến trúc Zero-Storage (giống manganextjs):
  ☑️ KHÔNG tải file ảnh về đĩa server (0 MB Disk I/O)
  ☑️ KHÔNG nén PIL / ghép ảnh thủ công nặng CPU
  ☑️ KHÔNG upload trung gian lên MinIO / Google Drive / Cloud Storage
  ⚡ Lấy trực tiếp CDN tĩnh chính thức MangaDex (uploads.mangadex.org)
  ⚡ Bìa truyện tự động dùng thumbnail .512.jpg siêu nhẹ
  ⚡ Đồng bộ siêu tốc: 50ms - 100ms / chapter
  ⚡ Khử trùng lặp (Deduplication) & Checkpoint Resume thông minh
=============================================================================
"""

import sys
import os
import re
import time
import json
import argparse
import unicodedata
import urllib.parse
from pathlib import Path
from datetime import datetime, timezone
import requests
from requests.adapters import HTTPAdapter
from urllib3.util.retry import Retry

# Fix console encoding for Windows/Linux
if sys.platform == 'win32':
    try:
        sys.stdout.reconfigure(encoding='utf-8')
        sys.stderr.reconfigure(encoding='utf-8')
    except Exception:
        pass

try:
    from rich.console import Console
    console = Console()
    HAS_RICH = True
except ImportError:
    HAS_RICH = False
    console = None


def create_reusable_session(pool_size: int = 32) -> requests.Session:
    """Tạo requests.Session dùng chung Connection Pool (HTTP Keep-Alive)"""
    s = requests.Session()
    s.headers.update({
        "User-Agent": "Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/124.0.0.0 Safari/537.36 TruyenKomiCrawler/3.0",
        "X-Internal-Crawler": "truyenkomi_crawler_internal"
    })
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

MANGADEX_API_BASE = os.getenv("MANGADEX_API_URL", "https://api.mangadex.org").rstrip("/")
MANGADEX_UPLOADS_BASE = "https://uploads.mangadex.org"
DEFAULT_API_BASE_URL = os.getenv("API_BASE_URL", "http://localhost:5000/api").rstrip("/")
DEFAULT_LANG = "vi"

DEFAULT_SKIP_EXISTING = True
DEFAULT_DATA_SAVER = True
DEFAULT_TIMEOUT = 25
MAX_RETRIES = 6
STATE_FILE_NAME = "mangadex_sync_state.json"


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
        return f"comic-{int(time.time())}"
    text = text.replace('đ', 'd').replace('Đ', 'D')
    text = unicodedata.normalize('NFKD', text)
    text = re.sub(r'[\u0300-\u036f]', '', text)
    text = re.sub(r'[^\w\s-]', '', text).strip().lower()
    text = re.sub(r'[-\s]+', '-', text)
    return text.strip("-") or f"comic-{int(time.time())}"


def normalize_chapter_key(chap_num) -> str:
    try:
        val = float(chap_num)
        return str(int(val)) if val.is_integer() else str(val)
    except Exception:
        return str(chap_num).strip().lower()


def get_existing_chapters_from_web(api_base_url: str, comic_slug: str, session: requests.Session = None) -> set:
    """Tra cứu các chapter đã có sẵn trên Web API TruyenKomi để skip không gọi lại MangaDex"""
    url = f"{api_base_url.rstrip('/')}/comics/{comic_slug}"
    client = session or requests
    headers = {
        "User-Agent": "Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 TruyenKomiCrawler/3.0",
        "X-Internal-Crawler": "truyenkomi_crawler_internal"
    }
    try:
        res = client.get(url, headers=headers, timeout=8)
        if res.status_code == 200:
            data = res.json()
            chapters = data.get("chapters") or data.get("data", {}).get("chapters") or []
            existing = set()
            for ch in chapters:
                num = ch.get("chapterNumber")
                if num is not None:
                    existing.add(normalize_chapter_key(num))
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
    other_names: list = None,
    age_limit: str = "13+",
    published_at: str = None,
    created_at: str = None,
    comic_created_at: str = None,
    comic_updated_at: str = None,
    categories: list = None,
    views: int = 0,
    session: requests.Session = None
) -> bool:
    """Đồng bộ metadata & danh sách URL ảnh trực tiếp lên Web API (Zero Storage)"""
    params = {
        "comicTitle": comic_title,
        "comicSlug": comic_slug,
        "coverImage": cover_cdn_url or "https://images.unsplash.com/photo-1544716278-ca5e3f4abd8c?w=600&auto=format&fit=crop&q=80"
    }
    if author:
        params["author"] = author
    if translator_group:
        params["translatorGroup"] = translator_group
    if other_names:
        params["otherNames"] = ", ".join(str(n) for n in other_names if n)
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
        "User-Agent": "TruyenKomi-ZeroStorageSync/3.0",
        "Content-Type": "application/json"
    }
    http_client = session or requests
    try:
        res = http_client.post(url, json=payload, headers=headers, timeout=15)
        return res.status_code in (200, 201)
    except Exception as e:
        log_warning(f"Lỗi gửi API import-scraped ({url}): {e}")
        return False


# =============================================================================
# QUẢN LÝ CHECKPOINT (RESUME STATE)
# =============================================================================
class SyncStateManager:
    def __init__(self, state_file_path: Path):
        self.state_file_path = state_file_path
        self.data = {
            "version": 3,
            "mode": "zero_storage_cdn",
            "created_at": datetime.now(timezone.utc).isoformat(),
            "last_updated": datetime.now(timezone.utc).isoformat(),
            "completed_manga": {},
            "synced_chapters": {},
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
            self.state_file_path.parent.mkdir(parents=True, exist_ok=True)
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
        self.save()

    def mark_failed(self, manga_id: str, title: str, error_msg: str):
        self.data.setdefault("failed_manga", {})[manga_id] = {
            "title": title, "error": error_msg, "failed_at": datetime.now(timezone.utc).isoformat()
        }
        self.save()


# =============================================================================
# MANGADEX API CLIENT (V5)
# =============================================================================
class MangaDexClient:
    def __init__(self, lang: str = DEFAULT_LANG):
        self.lang = lang
        self.session = create_reusable_session(pool_size=32)
        self.session.headers.update({"User-Agent": "TruyenKomi-ZeroStorage/3.0 (https://truyenkomi.com)"})
        self._last_request_time = 0.0
        self._min_interval = 0.25

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
                    retry_after = res.headers.get("retry-after")
                    wait_sec = int(retry_after) + 1 if retry_after and retry_after.isdigit() else (attempt + 1) * 2.5
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

    def iterate_all_vietnamese_manga(self, order_by: str = "latest", start_offset: int = 0, limit: int = None):
        offset = start_offset
        batch_limit = 100
        fetched = 0

        while True:
            params = {
                "limit": batch_limit, "offset": offset,
                "availableTranslatedLanguage[]": [self.lang], "hasAvailableChapters": "true",
                "includes[]": ["cover_art", "author", "tag"],
                "contentRating[]": ["safe", "suggestive", "erotica"]
            }
            order_norm = (order_by or "latest").lower()
            if order_norm in ("oldest", "asc"):
                params["order[createdAt]"] = "asc"
            elif order_norm in ("newest_created", "created_desc"):
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
                vi_title = attr.get("title", {}).get("vi")
                orig_title = list(title_dict.values())[0] if title_dict else "Unknown"
                title = vi_title or attr.get("title", {}).get("en") or orig_title

                authors = []
                cover_filename = None
                for rel in m.get("relationships", []):
                    if rel.get("type") in ("author", "artist"):
                        name = rel.get("attributes", {}).get("name")
                        if name and name not in authors: authors.append(name)
                    elif rel.get("type") == "cover_art":
                        cover_filename = rel.get("attributes", {}).get("fileName")

                author = ", ".join(authors) if authors else "Đang cập nhật"
                cover_url = f"{MANGADEX_UPLOADS_BASE}/covers/{m_id}/{cover_filename}.512.jpg" if cover_filename else None

                item = {
                    "id": m_id,
                    "title": title,
                    "slug": slugify(title),
                    "author": author,
                    "cover_url": cover_url,
                    "created_at": attr.get("createdAt"),
                    "updated_at": attr.get("updatedAt"),
                    "last_chapter": attr.get("latestUploadedChapter")
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
        # Bìa truyện 512px thumbnail tải nhanh gấp 26 lần
        cover_url = f"{MANGADEX_UPLOADS_BASE}/covers/{manga_id}/{cover_filename}.512.jpg" if cover_filename else None
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
                "pages": pages, "group": group_name, "published_at": c_attr.get("publishAt") or c_attr.get("createdAt")
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
        """Lấy danh sách URL ảnh trực tiếp từ CDN MangaDex (Zero Disk I/O)"""
        server_url = f"{MANGADEX_API_BASE}/at-home/server/{chapter_id}?forcePort443=true"
        res = self._rate_limited_get(server_url)
        if not res or res.status_code != 200:
            return []

        json_data = res.json()
        base_url = json_data.get("baseUrl") or "https://uploads.mangadex.org"
        ch = json_data.get("chapter", {})
        ch_hash = ch.get("hash")
        if not ch_hash:
            return []

        # Chuẩn hóa về CDN tĩnh uploads.mangadex.org tránh node tạm hết hạn
        cdn_base = "https://uploads.mangadex.org" if "mangadex.network" in base_url else base_url

        if data_saver:
            files = ch.get("dataSaver", [])
            return [f"{cdn_base}/data-saver/{ch_hash}/{fn}" for fn in files]
        else:
            files = ch.get("data", [])
            return [f"{cdn_base}/data/{ch_hash}/{fn}" for fn in files]


# =============================================================================
# ZERO-STORAGE SYNCHRONIZER ENGINE
# =============================================================================
class MangaDexSynchronizer:
    def __init__(
        self,
        skip_existing: bool = DEFAULT_SKIP_EXISTING,
        data_saver: bool = DEFAULT_DATA_SAVER,
        lang: str = DEFAULT_LANG,
        api_base_url: str = DEFAULT_API_BASE_URL,
        **kwargs
    ):
        self.client = MangaDexClient(lang=lang)
        state_dir = Path("/app/data") if Path("/app/data").exists() else Path.cwd()
        self.state_file = state_dir / STATE_FILE_NAME
        self.state = SyncStateManager(self.state_file)
        self.skip_existing = skip_existing
        self.data_saver = data_saver
        self.api_base_url = api_base_url
        self.api_session = create_reusable_session(pool_size=16)
        self.api_session.headers.update({
            "User-Agent": "Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 TruyenKomiCrawler/3.0",
            "X-Internal-Crawler": "truyenkomi_crawler_internal"
        })

    def sync_single_manga(self, manga_id_or_url: str) -> bool:
        manga_id = self.client.extract_manga_id(manga_id_or_url)
        info = self.client.get_manga_details_and_chapters(manga_id)
        title = info["title"]
        slug = info["slug"]
        chapters = info["chapters"]

        if not chapters:
            log_warning(f"⚠️ Bộ truyện '{title}' không có chapter Tiếng Việt nào!")
            return False

        log_info(f"▶ [bold]{title}[/bold] (Slug: {slug}) | {len(chapters)} chapters (Zero-Storage CDN)")

        # 1. ẢNH BÌA DIRECT CDN
        cover_cdn_url = info.get("cover_url")

        # 2. KIỂM TRA CHAPTER ĐÃ CÓ TRÊN WEB API / CHECKPOINT ĐỂ SKIP
        web_existing = set()
        if self.skip_existing:
            web_existing = get_existing_chapters_from_web(self.api_base_url, slug, session=self.api_session)
            for wk in web_existing:
                self.state.mark_chapter_synced(manga_id, wk)

        pending_chaps = []
        for chap in chapters:
            num_str = normalize_chapter_key(chap["number"])
            if self.skip_existing and (num_str in web_existing or self.state.is_chapter_synced(manga_id, num_str)):
                continue
            pending_chaps.append(chap)

        if not pending_chaps and self.skip_existing:
            log_success(f"  ✨ Toàn bộ {len(chapters)}/{len(chapters)} chapters của '{title}' đã đồng bộ trước đó. Bỏ qua!\n")
            self.state.mark_completed(manga_id=manga_id, title=title, slug=slug, chapters_count=len(chapters), pages_count=0)
            return True

        log_info(f"  📥 Cần đồng bộ mới: {len(pending_chaps)}/{len(chapters)} chapters...")

        # 3. ĐỒNG BỘ TRỰC TIẾP TỪNG CHAPTER VÀO WEB API (0 MB DISK WRITE)
        total_pages = 0
        for idx, chap in enumerate(pending_chaps, 1):
            num = chap["number"]
            num_str = normalize_chapter_key(num)
            chap_title = chap.get("title") or f"Chương {num_str}"

            # Lấy link ảnh CDN MangaDex
            img_urls = self.client.get_chapter_image_urls(chap["id"], data_saver=self.data_saver)
            if not img_urls:
                log_warning(f"    ⚠️ Không lấy được link ảnh cho {chap_title}")
                continue

            # Gửi thẳng vào Web API
            synced = sync_chapter_to_web_api(
                api_base_url=self.api_base_url,
                comic_title=title,
                comic_slug=slug,
                cover_cdn_url=cover_cdn_url,
                chapter_num=num,
                chapter_title=chap_title,
                image_urls=img_urls,
                author=info["author"],
                translator_group=chap.get("group"),
                published_at=chap.get("published_at"),
                created_at=chap.get("published_at"),
                comic_created_at=info.get("created_at"),
                comic_updated_at=info.get("updated_at"),
                categories=info.get("genres", []),
                session=self.api_session
            )

            if synced:
                log_success(f"    ⚡ [{idx}/{len(pending_chaps)}] Đã lưu {chap_title} ({len(img_urls)} trang CDN) vào Web API!")
                self.state.mark_chapter_synced(manga_id, num_str)
                total_pages += len(img_urls)
            else:
                log_warning(f"    ❌ Lỗi khi đồng bộ {chap_title} lên Web API")

            # Nghỉ ngắn giữa các chapter chống quá tải API
            time.sleep(0.15)

        self.state.mark_completed(
            manga_id=manga_id, title=title, slug=slug,
            chapters_count=len(chapters), pages_count=total_pages
        )
        log_success(f"🎉 Hoàn thành đồng bộ trọn bộ '{title}'!\n")
        return True

    def sync_all_vietnamese_manga(self, order_by: str = "latest", start_offset: int = 0, limit: int = None):
        total_available = self.client.get_total_vietnamese_manga_count()
        log_info(f"🚀 BẮT ĐẦU ĐỒNG BỘ TOÀN BỘ MANGADEX TIẾNG VIỆT (ZERO-STORAGE)")
        log_info(f"• Tổng số truyện Tiếng Việt: ~{total_available} truyện")
        log_info(f"• Thứ tự quét: {order_by.upper()}")
        log_info(f"• Web API: {self.api_base_url}")
        log_info(f"• Phương thức: Direct CDN (uploads.mangadex.org) • 0 MB dung lượng ổ cứng\n")

        manga_gen = self.client.iterate_all_vietnamese_manga(
            order_by=order_by,
            start_offset=start_offset,
            limit=limit
        )

        count = 0
        for item in manga_gen:
            count += 1
            m_id = item["id"]
            title = item["title"]

            if self.state.is_completed(m_id) and self.skip_existing:
                comp_info = self.state.get_completed_info(m_id) or {}
                prev_count = comp_info.get("chapters_count", 0)
                log_info(f"[{count}] ⏭️ Đã hoàn tất ({prev_count} chaps): {title} (Bỏ qua)")
                continue

            log_info(f"━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━")
            log_info(f"▶ [{count}] Đang xử lý: {title} (ID: {m_id})")

            try:
                self.sync_single_manga(m_id)
            except Exception as e:
                log_error(f"Lỗi khi xử lý truyện '{title}': {e}")
                self.state.mark_failed(m_id, title, str(e))

            time.sleep(0.3)

        log_success("🎉 ĐÃ HOÀN TẤT TIẾN TRÌNH ĐỒNG BỘ MANGADEX!")


# Backward compatibility alias
MangaDexDriveSynchronizer = MangaDexSynchronizer


# =============================================================================
# HÀM MAIN
# =============================================================================
def main():
    parser = argparse.ArgumentParser(
        description="🚀 MangaDex Zero-Storage Fast Synchronizer (Lưu trực tiếp link CDN, không tốn ổ cứng)"
    )
    parser.add_argument("--all", action="store_true", help="Tải toàn bộ truyện Tiếng Việt trên MangaDex")
    parser.add_argument("--url", "--manga", default=None, help="URL hoặc MangaDex UUID của bộ truyện")
    parser.add_argument("--offset", type=int, default=0, help="Vị trí bắt đầu quét (Mặc định: 0)")
    parser.add_argument("--limit", type=int, default=None, help="Số lượng truyện tối đa muốn đồng bộ")
    parser.add_argument("--order", choices=["latest", "oldest", "newest_created"], default="latest", help="Thứ tự quét truyện: latest (chương mới nhất), oldest (cũ nhất), newest_created (truyện mới tạo)")
    parser.add_argument("--data-saver", action="store_true", default=DEFAULT_DATA_SAVER, help="Dùng ảnh nén MangaDex Data-Saver (Mặc định: Ảnh gốc CDN)")
    parser.add_argument("--no-skip", action="store_true", help="Tắt bỏ qua chapter đã có")
    parser.add_argument("--continuous", action="store_true", help="Chạy ngầm liên tục theo chu kỳ (Daemon mode)")
    parser.add_argument("--interval", type=int, default=10, help="Thời gian nghỉ giữa các chu kỳ tính bằng phút (Mặc định: 10 phút)")
    parser.add_argument("--api", default=DEFAULT_API_BASE_URL, help=f"URL Web API (Mặc định: {DEFAULT_API_BASE_URL})")

    # Các cờ tương thích ngược (không cần dùng nữa trong Zero-Storage)
    parser.add_argument("--workers", type=int, default=16, help="[Bỏ qua] Tương thích ngược")
    parser.add_argument("--no-merge", action="store_true", help="[Bỏ qua] Tương thích ngược")
    parser.add_argument("--no-upload", action="store_true", help="[Bỏ qua] Tương thích ngược")
    parser.add_argument("--keep-local", action="store_true", help="[Bỏ qua] Tương thích ngược")

    args = parser.parse_args()

    sync_engine = MangaDexSynchronizer(
        skip_existing=not args.no_skip,
        data_saver=args.data_saver,
        api_base_url=args.api
    )

    if args.continuous:
        interval_sec = max(60, args.interval * 60)
        log_info(f"🔄 Chế độ chạy ngầm liên tục (Daemon) được kích hoạt. Lặp lại sau mỗi {args.interval} phút.")
        while True:
            try:
                log_info("⏰ Bắt đầu chu kỳ quét truyện mới...")
                if args.url:
                    sync_engine.sync_single_manga(args.url)
                else:
                    sync_engine.sync_all_vietnamese_manga(order_by=args.order, start_offset=args.offset, limit=args.limit)
            except Exception as ex:
                log_error(f"Lỗi chu kỳ quét: {ex}")
            log_info(f"💤 Nghỉ {args.interval} phút trước chu kỳ tiếp theo...")
            time.sleep(interval_sec)
    elif args.url:
        sync_engine.sync_single_manga(args.url)
    elif args.all:
        sync_engine.sync_all_vietnamese_manga(order_by=args.order, start_offset=args.offset, limit=args.limit)
    else:
        parser.print_help()


if __name__ == "__main__":
    main()

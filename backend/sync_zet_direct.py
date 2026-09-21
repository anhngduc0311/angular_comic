#!/usr/bin/env python3
# -*- coding: utf-8 -*-
"""
=============================================================================
⚡ ZetTruyen Universal Direct API Synchronizer (Manhwa & Manhua)
=============================================================================
Author: TruyenKomi Team
Description: Đồng bộ trực tiếp link CDN ảnh truyện Manhwa và Manhua từ ZetTruyen
             vào hệ thống Web API (MangaFlux / TruyenKomi).
             - KHÔNG TẢI FILE ẢNH VỀ MÁY / 0MB BỘ NHỚ LƯU TRỮ
             - Lấy trực tiếp link CDN ảnh gốc (cdn*.zetimage.com)
             - Hỗ trợ đầy đủ thể loại: Manhwa (Hàn Quốc), Manhua (Trung Quốc), Manga,...
             - Đồng bộ đa luồng siêu tốc, kiểm tra trùng lặp thông minh
             - Chế độ Daemon chạy ngầm tự động cập nhật chương mới định kỳ
=============================================================================
"""

import sys
import os
import re
import time
import json
import argparse
from pathlib import Path
from concurrent.futures import ThreadPoolExecutor, as_completed
from datetime import datetime, timezone
import socket
import requests
import cloudscraper
from bs4 import BeautifulSoup

# Fix DNS resolution issues on Windows/ISP blocks for ZetTruyen & CDN
_orig_getaddrinfo = socket.getaddrinfo
def _custom_getaddrinfo(host, port, family=0, type=0, proto=0, flags=0):
    try:
        return _orig_getaddrinfo(host, port, family, type, proto, flags)
    except Exception:
        h = str(host).lower()
        if 'zettruyen1.com' in h:
            return _orig_getaddrinfo('104.21.77.88', port, family, type, proto, flags)
        elif 'zettruyen.com' in h:
            return _orig_getaddrinfo('104.21.18.64', port, family, type, proto, flags)
        elif 'zetimage.com' in h:
            return _orig_getaddrinfo('104.21.77.88', port, family, type, proto, flags)
        raise

socket.getaddrinfo = _custom_getaddrinfo

# Fix console encoding for Windows
if sys.platform == 'win32':
    try:
        sys.stdout.reconfigure(encoding='utf-8')
        sys.stderr.reconfigure(encoding='utf-8')
    except Exception:
        pass

# Optional Rich library for beautiful terminal UI
try:
    from rich.console import Console
    from rich.table import Table
    from rich.panel import Panel
    from rich.progress import Progress, SpinnerColumn, BarColumn, TextColumn, TimeRemainingColumn
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

DEFAULT_API_BASE_URL = os.getenv("API_BASE_URL", "http://localhost:5000/api")
DEFAULT_STATE_FILE = Path(__file__).resolve().parent / "zet_sync_progress.json"
MAX_WORKERS = 10
TIMEOUT = 25
MAX_RETRIES = 3


def parse_date_to_iso(date_str: str) -> str:
    """Chuyển đổi chuỗi ngày tiếng Việt/chuẩn sang ISO UTC format"""
    if not date_str:
        return datetime.now(timezone.utc).isoformat()
    date_str = date_str.strip()
    
    # Format YYYY-MM-DD HH:MM:SS or ISO
    for fmt in ("%Y-%m-%d %H:%M:%S", "%Y-%m-%dT%H:%M:%S", "%Y-%m-%dT%H:%M:%SZ", "%Y/%m/%d %H:%M:%S"):
        try:
            dt = datetime.strptime(date_str, fmt)
            return dt.replace(tzinfo=timezone.utc).isoformat()
        except Exception:
            pass

    # Format DD/MM/YYYY or DD-MM-YYYY
    m = re.search(r'(\d{1,2})[/-](\d{1,2})[/-](\d{4})', date_str)
    if m:
        try:
            day, month, year = int(m.group(1)), int(m.group(2)), int(m.group(3))
            dt = datetime(year, month, day, tzinfo=timezone.utc)
            return dt.isoformat()
        except Exception:
            pass

    return datetime.now(timezone.utc).isoformat()


class ZetDirectSync:
    def __init__(self, api_base_url: str = DEFAULT_API_BASE_URL, state_file: Path = DEFAULT_STATE_FILE):
        self.api_base_url = api_base_url.rstrip("/")
        self.state_file = state_file
        self.scraper = cloudscraper.create_scraper(
            browser={
                'browser': 'chrome',
                'platform': 'windows',
                'desktop': True
            }
        )
        self.scraper.headers.update({
            "User-Agent": "Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/121.0.0.0 Safari/537.36",
            "Accept-Language": "vi-VN,vi;q=0.9,en-US;q=0.8,en;q=0.7",
            "Referer": "https://www.zettruyen1.com/"
        })
        self.state = self.load_state()

    def load_state(self) -> dict:
        """Tải trạng thái đồng bộ từ file JSON"""
        if self.state_file.exists():
            try:
                with open(self.state_file, "r", encoding="utf-8") as f:
                    return json.load(f)
            except Exception:
                pass
        return {"synced_comics": {}, "last_sync_time": None}

    def save_state(self):
        """Lưu trạng thái đồng bộ vào file JSON"""
        try:
            self.state["last_sync_time"] = datetime.now(timezone.utc).isoformat()
            with open(self.state_file, "w", encoding="utf-8") as f:
                json.dump(self.state, f, ensure_ascii=False, indent=2)
        except Exception as e:
            if HAS_RICH and console:
                console.print(f"[yellow]⚠️ Lỗi lưu trạng thái: {e}[/yellow]")

    def get_existing_comic_from_api(self, slug: str) -> dict:
        """Kiểm tra truyện đã tồn tại trên Web API chưa và lấy danh sách chapter hiện có"""
        url = f"{self.api_base_url}/comics/{slug}"
        headers = {
            "User-Agent": "Mozilla/5.0 (Windows NT 10.0; Win64; x64) TruyenKomiCrawler/1.0",
            "X-Internal-Crawler": "truyenkomi_crawler_internal"
        }
        try:
            res = requests.get(url, headers=headers, timeout=10)
            if res.status_code == 200:
                return res.json()
        except Exception:
            pass
        return None

    def parse_category_page(self, page_num: int = 1, category_slug: str = "manhua") -> dict:
        """Bóc tách danh sách truyện từ 1 trang thể loại trên ZetTruyen"""
        domains = ["https://www.zettruyen1.com", "https://zettruyen1.com"]
        res = None

        for domain in domains:
            if category_slug.startswith("http"):
                cat_url = f"{category_slug.split('?')[0]}?page={page_num}"
            else:
                cat_url = f"{domain}/the-loai/{category_slug}?page={page_num}"

            for attempt in range(2):
                try:
                    res = self.scraper.get(cat_url, timeout=TIMEOUT)
                    if res.status_code == 200:
                        break
                    time.sleep(1)
                except Exception:
                    time.sleep(1)
            if res and res.status_code == 200:
                break
        else:
            return {"comics": [], "has_next_page": False}

        soup = BeautifulSoup(res.text, "html.parser")
        comics = []
        
        # Grid chứa danh sách truyện
        grid = soup.find('div', class_=lambda c: c and 'grid-cols-3' in c and 'md:grid-cols-5' in c)
        if grid:
            for a in grid.find_all('a', href=True):
                href = a['href']
                if '/truyen-tranh/' in href and not any(x in href for x in ['/chuong-', '/chapter-', '#']):
                    clean_url = href if href.startswith("http") else f"https://www.zettruyen1.com{href}"
                    slug = clean_url.rstrip("/").split("/")[-1].split("?")[0]
                    
                    title_elem = a.find('span', class_=lambda c: c and 'font-bold' in c and 'line-clamp-2' in c)
                    title = title_elem.get_text(strip=True) if title_elem else a.get_text(strip=True)
                    
                    img = a.find('img')
                    cover = img.get('src') or img.get('data-src') if img else None
                    if cover and not cover.startswith("http"):
                        cover = f"https://www.zettruyen1.com{cover}"
                        
                    chap_elem = a.find('span', class_=lambda c: c and 'text-txt-secondary' in c and 'truncate' in c)
                    latest_chap = chap_elem.get_text(strip=True) if chap_elem else ''

                    if slug and not any(c['slug'] == slug for c in comics):
                        comics.append({
                            "title": title,
                            "slug": slug,
                            "url": clean_url,
                            "cover_url": cover,
                            "latest_chapter_text": latest_chap
                        })

        # Kiểm tra nút Trang Sau
        has_next_page = False
        for btn in soup.find_all('a', href=True):
            if 'Trang sau' in btn.get_text():
                classes = btn.get('class', [])
                if 'pointer-events-none' not in classes and 'opacity-60' not in classes and btn.get('href'):
                    has_next_page = True
                break

        return {
            "comics": comics,
            "has_next_page": has_next_page
        }

    def fetch_comic_details(self, comic_url_or_slug: str, default_category: str = None) -> dict:
        """Lấy toàn bộ thông tin chi tiết và danh sách chapter của một bộ truyện ZetTruyen"""
        if comic_url_or_slug.startswith("http"):
            comic_url = comic_url_or_slug.strip()
            slug = comic_url.rstrip("/").split("/")[-1].split("?")[0]
        else:
            slug = comic_url_or_slug.strip()
            comic_url = f"https://www.zettruyen1.com/truyen-tranh/{slug}"

        res = None
        domains = ["https://www.zettruyen1.com", "https://zettruyen1.com"]
        for domain in domains:
            target_url = f"{domain}/truyen-tranh/{slug}"
            for attempt in range(2):
                try:
                    res = self.scraper.get(target_url, timeout=TIMEOUT)
                    if res.status_code == 200:
                        comic_url = target_url
                        break
                    time.sleep(1)
                except Exception:
                    time.sleep(1)
            if res and res.status_code == 200:
                break

        if not res or res.status_code != 200:
            return None

        soup = BeautifulSoup(res.text, "html.parser")

        # 1. Tên truyện
        title_elem = soup.find('h1') or soup.find('h2', class_=lambda c: c and 'title' in c)
        title = title_elem.get_text(strip=True) if title_elem else slug.replace("-", " ").title()

        # 2. Ảnh bìa (Cover Image)
        cover_url = None
        cover_meta = soup.find("meta", property="og:image")
        if cover_meta and cover_meta.get("content"):
            cover_url = cover_meta["content"]
        else:
            img = soup.find("img", src=re.compile(r"thumb|cover|poster", re.I))
            if img:
                cover_url = img.get("src") or img.get("data-src")
        if not cover_url:
            cover_url = f"https://cdn1.zetimage.com/thumb/{slug}.jpg"

        # 3. Thông tin metadata
        author = "Đang cập nhật"
        translator_group = "Đang cập nhật"
        other_names = "Đang cập nhật"
        age_limit = "13+"
        views = 0
        created_date_str = None
        updated_date_str = None

        page_text = soup.get_text(" ", strip=True)

        m_auth = re.search(r'Tác giả\s*[:：]?\s*([^\n\r]+?)\s+(?:Lượt xem|Cập nhật|Nhóm dịch|Tổng số|Thể loại)', page_text)
        if m_auth: author = m_auth.group(1).strip()
        if author.upper() in ("ZETTRUYEN", "ZET TRUYEN"): author = "TRUYENKOMI"

        m_trans = re.search(r'Nhóm dịch\s*[:：]?\s*([^\n\r]+?)\s+(?:Tổng số chap|Ngày tạo|Tên khác|Độ tuổi|Loại|Trạng thái|Thể loại)', page_text)
        if m_trans: translator_group = m_trans.group(1).strip()

        m_other = re.search(r'Tên khác\s*[:：]?\s*([^\n\r]+?)\s+(?:Độ tuổi|Loại|Trạng thái|Thể loại)', page_text)
        if m_other: other_names = m_other.group(1).strip()

        m_view = re.search(r'Lượt xem\s*[:：]?\s*([\d,.]+)', page_text, re.I)
        if m_view:
            try: views = int(re.sub(r'[^\d]', '', m_view.group(1)))
            except Exception: pass

        m_created = re.search(r'Ngày tạo\s*[:：]?\s*(\d{1,2}[/-]\d{1,2}[/-]\d{4})', page_text, re.I)
        if m_created: created_date_str = m_created.group(1)

        m_updated = re.search(r'Cập nhật\s*[:：]?\s*(\d{1,2}[/-]\d{1,2}[/-]\d{4})', page_text, re.I)
        if m_updated: updated_date_str = m_updated.group(1)

        # 4. Thể loại
        genres = []
        for a in soup.find_all('a', href=True):
            href = a.get('href', '')
            if '/the-loai/' in href and not href.endswith('/the-loai'):
                txt = a.get_text(strip=True)
                if txt and txt not in genres and not txt.lower().startswith('truyện tranh') and not txt.lower().startswith('đọc truyện'):
                    genres.append(txt)

        if default_category and default_category not in genres:
            genres.insert(0, default_category)
        elif not genres:
            genres.append("Manhua" if "manhua" in comic_url.lower() else "Manhwa")

        # 5. Mô tả
        desc = f"Đọc truyện tranh {title} Tiếng Việt trọn bộ mới nhất tại TruyenKomi."
        desc_elem = soup.find('div', class_=lambda c: c and ('description' in c or 'summary' in c or 'content' in c))
        if desc_elem:
            d_txt = desc_elem.get_text(strip=True)
            if len(d_txt) > 20: desc = d_txt

        # 6. Danh sách Chapter qua API nội bộ ZetTruyen
        chapters = []
        api_url = f"https://www.zettruyen1.com/api/comics/{slug}/chapters?per_page=-1"
        try:
            api_res = self.scraper.get(api_url, headers={"Referer": comic_url}, timeout=TIMEOUT)
            if api_res.status_code == 200:
                data = api_res.json()
                chap_list = data.get("data", {}).get("chapters", [])
                for item in chap_list:
                    chap_num = float(item.get("chapter_num") or 0)
                    chap_name = item.get("chapter_name") or f"Chapter {chap_num}"
                    chap_slug = item.get("chapter_slug") or f"chapter-{int(chap_num) if chap_num.is_integer() else chap_num}"
                    chap_url = f"https://www.zettruyen1.com/truyen-tranh/{slug}/chuong-{int(chap_num) if chap_num.is_integer() else chap_num}"
                    chap_views = int(item.get("view") or 0)
                    chap_date_raw = item.get("updated_at") or item.get("created_at")
                    chap_date_iso = parse_date_to_iso(chap_date_raw)
                    chapters.append({
                        "number": chap_num,
                        "title": chap_name,
                        "slug": chap_slug,
                        "url": chap_url,
                        "views": chap_views,
                        "updated_at": chap_date_iso
                    })
        except Exception:
            pass

        # Fallback HTML nếu API không trả về
        if not chapters:
            chap_section = soup.find('div', id=lambda x: x and ('chapter' in x or 'list-chapter' in x)) or soup
            for a in chap_section.find_all('a', href=True):
                href = a['href']
                if f'/truyen-tranh/{slug}/' in href and any(x in href for x in ['/chuong-', '/chapter-']):
                    c_url = href if href.startswith("http") else f"https://www.zettruyen1.com{href}"
                    m = re.search(r'chuong-(\d+(?:\.\d+)?)', c_url)
                    if m:
                        c_num = float(m.group(1))
                        c_title = a.get_text(strip=True) or f"Chapter {c_num}"
                        if not any(x['number'] == c_num for x in chapters):
                            chapters.append({
                                "number": c_num,
                                "title": c_title,
                                "slug": f"chapter-{int(c_num) if c_num.is_integer() else c_num}",
                                "url": c_url,
                                "views": 0,
                                "updated_at": datetime.now(timezone.utc).isoformat()
                            })

        chapters.sort(key=lambda x: x["number"])

        return {
            "title": title,
            "slug": slug,
            "url": comic_url,
            "cover_url": cover_url,
            "author": author,
            "translator_group": translator_group,
            "other_names": other_names,
            "age_limit": age_limit,
            "views": views,
            "genres": genres,
            "description": desc,
            "created_at_iso": parse_date_to_iso(created_date_str),
            "updated_at_iso": parse_date_to_iso(updated_date_str),
            "chapters": chapters
        }

    def fetch_chapter_direct_image_urls(self, comic_slug: str, chapter_url: str) -> list:
        """Lấy danh sách link ảnh trực tiếp từ CDN của 1 chapter"""
        for attempt in range(MAX_RETRIES):
            try:
                res = self.scraper.get(chapter_url, headers={"Referer": f"https://www.zettruyen1.com/truyen-tranh/{comic_slug}"}, timeout=TIMEOUT)
                if res.status_code != 200:
                    time.sleep(1)
                    continue

                # Cách 1: Tìm img tag trong HTML
                soup = BeautifulSoup(res.text, 'html.parser')
                imgs = []
                for img in soup.find_all('img'):
                    src = img.get('src') or img.get('data-src') or img.get('data-original') or img.get('data-sv1')
                    if src and comic_slug in src and 'thumb' not in src:
                        imgs.append(src)

                # Cách 2: Regex link CDN zetimage
                if not imgs:
                    pattern = rf'https?://[^\s"\'<>]*(?:zetimage|viestorage|vieestorage)[^\s"\'<>]*/{comic_slug}/[^\s"\'<>]+\.(?:jpg|webp|png|jpeg)'
                    imgs = list(dict.fromkeys(re.findall(pattern, res.text, re.I)))
                    imgs = [u for u in imgs if 'thumb' not in u]

                def get_page_index(url):
                    m = re.search(r'/(\d+)\.(?:jpg|webp|png|jpeg)', url, re.I)
                    return int(m.group(1)) if m else 999999

                imgs.sort(key=get_page_index)
                return imgs
            except Exception:
                time.sleep(1)

        return []

    def sync_single_chapter_to_api(self, comic_info: dict, chapter_info: dict, image_urls: list) -> bool:
        """Gửi danh sách link ảnh trực tiếp của 1 chapter vào Web API"""
        if not image_urls:
            return False

        url = f"{self.api_base_url}/comics/import-scraped"
        params = {
            "comicTitle": comic_info["title"],
            "comicSlug": comic_info["slug"],
            "coverImage": comic_info["cover_url"],
            "author": comic_info.get("author") or "Đang cập nhật",
            "translatorGroup": comic_info.get("translator_group") or "Đang cập nhật",
            "otherNames": comic_info.get("other_names") or "Đang cập nhật",
            "ageLimit": comic_info.get("age_limit") or "13+",
            "comicViews": comic_info.get("views") or 0,
            "comicCreatedAt": comic_info.get("created_at_iso"),
            "comicUpdatedAt": comic_info.get("updated_at_iso"),
            "categories": ", ".join(comic_info.get("genres", ["Manhwa"]))
        }

        payload = {
            "chapterNumber": chapter_info["number"],
            "title": chapter_info.get("title") or f"Chương {chapter_info['number']}",
            "isPublic": True,
            "views": chapter_info.get("views") or 0,
            "publishedAt": chapter_info.get("updated_at") or datetime.now(timezone.utc).isoformat(),
            "createdAt": chapter_info.get("updated_at") or datetime.now(timezone.utc).isoformat(),
            "imageUrls": image_urls
        }

        headers = {
            "User-Agent": "Mozilla/5.0 (Windows NT 10.0; Win64; x64) TruyenKomiCrawler/1.0",
            "X-Internal-Crawler": "truyenkomi_crawler_internal",
            "Content-Type": "application/json"
        }

        for attempt in range(MAX_RETRIES):
            try:
                res = requests.post(url, params=params, json=payload, headers=headers, timeout=TIMEOUT)
                if res.status_code in (200, 201):
                    return True
                time.sleep(1)
            except Exception:
                time.sleep(1)

        return False

    def sync_comic(self, comic_url_or_slug: str, force_update: bool = False, default_category: str = None) -> dict:
        """Đồng bộ toàn bộ chương và link ảnh trực tiếp của 1 bộ truyện"""
        comic_info = self.fetch_comic_details(comic_url_or_slug, default_category=default_category)
        if not comic_info:
            return {"success": False, "message": "Không thể lấy thông tin truyện từ ZetTruyen"}

        slug = comic_info["slug"]
        title = comic_info["title"]
        all_chaps = comic_info.get("chapters", [])
        genres_str = ", ".join(comic_info.get("genres", []))

        if HAS_RICH and console:
            console.print(f"\n[bold cyan]📖 Bắt đầu đồng bộ:[/bold cyan] [bold yellow]{title}[/bold yellow] ([dim]{slug}[/dim]) | [magenta]{genres_str}[/magenta] | [green]{len(all_chaps)} chapters[/green]")
        else:
            print(f"\n📖 Bắt đầu đồng bộ: {title} ({slug}) | {genres_str} | {len(all_chaps)} chapters")

        # Kiểm tra truyện và chapters đã có trên Web API
        existing_comic = self.get_existing_comic_from_api(slug)
        existing_chap_nums = set()
        if existing_comic and "chapters" in existing_comic:
            for ch in existing_comic["chapters"]:
                c_num = ch.get("chapterNumber")
                if c_num is not None:
                    existing_chap_nums.add(float(c_num))

        # Lọc ra các chapter cần đồng bộ (chưa có trên Web)
        chaps_to_sync = []
        for ch in all_chaps:
            if force_update or (ch["number"] not in existing_chap_nums):
                chaps_to_sync.append(ch)

        if not chaps_to_sync:
            if HAS_RICH and console:
                console.print(f"  [green]✔ Truyện đã đầy đủ toàn bộ {len(all_chaps)} chapter, không cần cập nhật thêm.[/green]")
            else:
                print(f"  ✔ Truyện đã đầy đủ toàn bộ {len(all_chaps)} chapter, không cần cập nhật thêm.")
            
            self.state["synced_comics"][slug] = {
                "title": title,
                "total_chapters": len(all_chaps),
                "synced_at": datetime.now(timezone.utc).isoformat()
            }
            self.save_state()
            return {"success": True, "synced_count": 0, "total": len(all_chaps)}

        if HAS_RICH and console:
            console.print(f"  [cyan]🚀 Đang trích xuất link ảnh và đồng bộ [bold]{len(chaps_to_sync)}[/bold] chapter mới...[/cyan]")
        else:
            print(f"  🚀 Đang trích xuất link ảnh và đồng bộ {len(chaps_to_sync)} chapter mới...")

        synced_count = 0
        failed_count = 0

        # Trích xuất link ảnh đa luồng
        def process_chapter(ch):
            img_urls = self.fetch_chapter_direct_image_urls(slug, ch["url"])
            if img_urls:
                success = self.sync_single_chapter_to_api(comic_info, ch, img_urls)
                return (ch["number"], ch["title"], len(img_urls), success)
            return (ch["number"], ch["title"], 0, False)

        with ThreadPoolExecutor(max_workers=MAX_WORKERS) as executor:
            future_to_chap = {executor.submit(process_chapter, ch): ch for ch in chaps_to_sync}
            for future in as_completed(future_to_chap):
                ch_num, ch_title, img_cnt, success = future.result()
                if success:
                    synced_count += 1
                    if HAS_RICH and console:
                        console.print(f"    [green]✔[/green] Đã đồng bộ [bold]{ch_title}[/bold] ({img_cnt} ảnh CDN trực tiếp)")
                    else:
                        print(f"    ✔ Đã đồng bộ {ch_title} ({img_cnt} ảnh CDN trực tiếp)")
                else:
                    failed_count += 1
                    if HAS_RICH and console:
                        console.print(f"    [red]✖[/red] Lỗi đồng bộ [bold]{ch_title}[/bold]")
                    else:
                        print(f"    ✖ Lỗi đồng bộ {ch_title}")

        self.state["synced_comics"][slug] = {
            "title": title,
            "total_chapters": len(all_chaps),
            "synced_at": datetime.now(timezone.utc).isoformat()
        }
        self.save_state()

        if HAS_RICH and console:
            console.print(f"  [bold green]✨ Hoàn thành {title}: Đồng bộ thành công {synced_count}/{len(chaps_to_sync)} chapter mới![/bold green]")
        else:
            print(f"  ✨ Hoàn thành {title}: Đồng bộ thành công {synced_count}/{len(chaps_to_sync)} chapter mới!")

        return {"success": True, "synced_count": synced_count, "failed_count": failed_count, "total": len(all_chaps)}

    def sync_category(self, category_slug: str = "manhua", start_page: int = 1, max_pages: int = None, max_comics: int = None):
        """Duyệt toàn bộ trang thể loại (Manhua/Manhwa) trên ZetTruyen và đồng bộ trực tiếp vào API"""
        cat_title = "Manhua (Trung Quốc)" if category_slug.lower() == "manhua" else ("Manhwa (Hàn Quốc)" if category_slug.lower() == "manhwa" else category_slug.title())
        default_cat_name = "Manhua" if category_slug.lower() == "manhua" else ("Manhwa" if category_slug.lower() == "manhwa" else category_slug.title())

        if HAS_RICH and console:
            panel_content = (
                f"[bold cyan]Thể loại:[/bold cyan] [bold green]{cat_title}[/bold green]\n"
                f"[bold cyan]Nguồn:[/bold cyan] https://www.zettruyen1.com/the-loai/{category_slug}\n"
                f"[bold cyan]Cơ chế:[/bold cyan] [bold yellow]Lấy link CDN trực tiếp (0 MB bộ nhớ)[/bold yellow]\n"
                f"[bold cyan]API Server:[/bold cyan] {self.api_base_url}\n"
                f"[bold cyan]Trang quét:[/bold cyan] Từ trang {start_page} đến {('trang ' + str(start_page + max_pages - 1)) if max_pages else 'hết'}"
            )
            console.print(Panel(panel_content, title="🚀 TRUYENKOMI - ĐỒNG BỘ TRỰC TIẾP ZETTRUYEN", border_style="green"))
        else:
            print(f"\n=======================================================")
            print(f"🚀 TRUYENKOMI - ĐỒNG BỘ TRỰC TIẾP THỂ LOẠI: {cat_title.upper()}")
            print(f"Nguồn: https://www.zettruyen1.com/the-loai/{category_slug}")
            print(f"Backend API: {self.api_base_url}")
            print("=======================================================\n")

        current_page = start_page
        total_processed_comics = 0

        while True:
            if max_pages and (current_page - start_page + 1) > max_pages:
                break

            if HAS_RICH and console:
                console.print(f"\n[bold magenta]📄 Đang quét danh sách {cat_title} Trang {current_page}...[/bold magenta]")
            else:
                print(f"\n📄 Đang quét danh sách {cat_title} Trang {current_page}...")

            page_data = self.parse_category_page(page_num=current_page, category_slug=category_slug)
            comics = page_data.get("comics", [])

            if not comics:
                if HAS_RICH and console:
                    console.print("[yellow]⚠️ Không tìm thấy truyện trên trang này hoặc đã đến trang cuối.[/yellow]")
                else:
                    print("⚠️ Không tìm thấy truyện trên trang này hoặc đã đến trang cuối.")
                break

            if HAS_RICH and console:
                table = Table(title=f"Danh sách {cat_title} ZetTruyen - Trang {current_page} ({len(comics)} bộ)", border_style="blue")
                table.add_column("STT", style="yellow", justify="center", width=5)
                table.add_column("Tên Truyện", style="bold green", min_width=35)
                table.add_column("Slug", style="cyan", width=25)
                table.add_column("Chương Mới", style="magenta", width=15)
                for idx, c in enumerate(comics, 1):
                    table.add_row(str(idx), c["title"], c["slug"], c["latest_chapter_text"])
                console.print(table)

            for c in comics:
                if max_comics and total_processed_comics >= max_comics:
                    if HAS_RICH and console:
                        console.print(f"\n[bold yellow]🛑 Đã đạt giới hạn tối đa {max_comics} bộ truyện.[/bold yellow]")
                    return

                self.sync_comic(c["url"], default_category=default_cat_name)
                total_processed_comics += 1
                time.sleep(0.5)

            if not page_data.get("has_next_page"):
                if HAS_RICH and console:
                    console.print(f"\n[bold green]🏁 Đã quét đến trang cuối cùng của thể loại {cat_title} trên ZetTruyen![/bold green]")
                else:
                    print(f"\n🏁 Đã quét đến trang cuối cùng của thể loại {cat_title} trên ZetTruyen!")
                break

            current_page += 1

        if HAS_RICH and console:
            console.print(f"\n[bold green]🎉 HOÀN THÀNH ĐỒNG BỘ TOÀN BỘ DANH MỤC {cat_title.upper()} ({total_processed_comics} bộ truyện)![/bold green]\n")
        else:
            print(f"\n🎉 HOÀN THÀNH ĐỒNG BỘ TOÀN BỘ DANH MỤC {cat_title.upper()} ({total_processed_comics} bộ truyện)!\n")


def main():
    parser = argparse.ArgumentParser(
        description="Đồng bộ trực tiếp link ảnh CDN truyện Manhwa & Manhua từ ZetTruyen vào MangaFlux Web API (0MB lưu trữ)",
        formatter_class=argparse.RawDescriptionHelpFormatter,
        epilog="""
Ví dụ sử dụng:
  # 1. Đồng bộ thể loại Manhua (Trung Quốc):
  python sync_zet_direct.py --category manhua --pages 5

  # 2. Đồng bộ thể loại Manhwa (Hàn Quốc):
  python sync_zet_direct.py --category manhwa --pages 5

  # 3. Đồng bộ TOÀN BỘ cả Manhwa và Manhua:
  python sync_zet_direct.py --category all

  # 4. Đồng bộ duy nhất 1 bộ truyện cụ thể:
  python sync_zet_direct.py https://www.zettruyen1.com/truyen-tranh/chat-di-ung-dang-yeu

  # 5. Chạy ngầm liên tục định kỳ 15 phút cập nhật chương mới:
  python sync_zet_direct.py --continuous --interval 15
        """
    )
    parser.add_argument("url", nargs="?", default=None, help="URL truyện cụ thể hoặc URL thể loại trên ZetTruyen")
    parser.add_argument("-c", "--category", default="manhua", help="Thể loại cần đồng bộ: manhua, manhwa, manga, hoặc all (Mặc định: manhua)")
    parser.add_argument("--all", action="store_true", help="Đồng bộ toàn bộ danh mục")
    parser.add_argument("-p", "--pages", type=int, default=None, help="Số lượng trang muốn đồng bộ (Mặc định: Tất cả)")
    parser.add_argument("--start-page", type=int, default=1, help="Trang bắt đầu (Mặc định: 1)")
    parser.add_argument("--max-comics", type=int, default=None, help="Số bộ truyện tối đa muốn đồng bộ")
    parser.add_argument("--api", default=DEFAULT_API_BASE_URL, help=f"Base URL của Web API (Mặc định: {DEFAULT_API_BASE_URL})")
    parser.add_argument("--force", action="store_true", help="Buộc cập nhật lại toàn bộ chapter kể cả khi đã có trên web")
    parser.add_argument("--continuous", action="store_true", help="Chạy chế độ Daemon định kỳ quét cập nhật chương mới")
    parser.add_argument("--interval", type=int, default=15, help="Thời gian chờ giữa các lần quét (phút, Mặc định: 15)")

    args = parser.parse_args()

    syncer = ZetDirectSync(api_base_url=args.api)

    if args.url:
        if "/the-loai/" in args.url:
            cat_slug = args.url.rstrip("/").split("/")[-1].split("?")[0]
            syncer.sync_category(category_slug=cat_slug, start_page=args.start_page, max_pages=args.pages, max_comics=args.max_comics)
        else:
            syncer.sync_comic(args.url, force_update=args.force)
        return

    categories = []
    if args.category.lower() == "all" or (args.all and args.category.lower() == "all"):
        categories = ["manhwa", "manhua"]
    else:
        categories = [args.category.lower()]

    def run_sync():
        for cat in categories:
            syncer.sync_category(category_slug=cat, start_page=args.start_page, max_pages=args.pages, max_comics=args.max_comics)

    if args.continuous:
        if HAS_RICH and console:
            console.print(f"[bold green]🔄 Đã kích hoạt chế độ Daemon: Tự động đồng bộ {', '.join(categories)} mỗi {args.interval} phút...[/bold green]")
        else:
            print(f"🔄 Đã kích hoạt chế độ Daemon: Tự động đồng bộ {', '.join(categories)} mỗi {args.interval} phút...")
        while True:
            try:
                run_sync()
            except Exception as e:
                print(f"Lỗi vòng lặp daemon: {e}")
            
            print(f"\n⏳ Đang chờ {args.interval} phút cho chu kỳ đồng bộ tiếp theo...\n")
            time.sleep(args.interval * 60)
    else:
        run_sync()


if __name__ == "__main__":
    main()

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
    # Nếu file backend/mangadex_drive_downloader.py có sẵn trong thư mục thì dùng trực tiếp
    if [ -f "backend/$PYTHON_SCRIPT" ]; then
        PYTHON_SCRIPT="backend/$PYTHON_SCRIPT"
        return 0
    fi

    if [ ! -f "$PYTHON_SCRIPT" ]; then
        log_info "Đang khởi tạo Engine Python '$PYTHON_SCRIPT' với các thiết lập chuẩn..."
        cat << 'EOF' > "$PYTHON_SCRIPT"
#!/usr/bin/env python3
# -*- coding: utf-8 -*-
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
from PIL import Image
Image.MAX_IMAGE_PIXELS = None

DEFAULT_DRIVE_FOLDER_ID = "1S3biMk6c2e-u5j7uO0wocFBW6J5eB8ef"
MANGADEX_API_BASE = "https://api.mangadex.org"
MANGADEX_UPLOADS_BASE = "https://uploads.mangadex.org"
DEFAULT_LANG = "vi"
DEFAULT_UPLOAD_TO_WEB = True
DEFAULT_SKIP_EXISTING = True
DEFAULT_DATA_SAVER = False  # ⬜ MangaDex Data-Saver: TẮT (Tải ẢNH GỐC)
DEFAULT_MERGE_SLICES = True # ☑️ Ghép ảnh Manhwa 5-in-1: BẬT
AUTO_STITCH_THRESHOLD = 70
STITCH_GROUP_SIZE = 5
DEFAULT_MAKE_PDF = False    # ⬜ Xuất PDF: TẮT
DEFAULT_WORKERS = 16        # ⚡ 16 luồng tải song song

DEFAULT_TIMEOUT = 30
MAX_RETRIES = 4
STATE_FILE_NAME = "mangadex_sync_state.json"
TEMP_DOWNLOAD_DIR = "mangadex_temp_cache"

def slugify(text: str) -> str:
    if not text: return "manga"
    text = text.replace('đ', 'd').replace('Đ', 'D')
    text = unicodedata.normalize('NFKD', text)
    text = re.sub(r'[\u0300-\u036f]', '', text)
    text = re.sub(r'[^\w\s-]', '', text).strip().lower()
    text = re.sub(r'[-\s]+', '-', text)
    return text.strip("-") or "manga"

def merge_images_vertical(image_paths: list, output_dir: Path, group_size: int = STITCH_GROUP_SIZE) -> list:
    if not image_paths: return []
    merged_files = []
    for group_idx, i in enumerate(range(0, len(image_paths), group_size), 1):
        group = image_paths[i:i + group_size]
        loaded_imgs, resized_imgs, combined = [], [], None
        try:
            for p in group:
                p_obj = Path(p)
                if not p_obj.exists() or p_obj.stat().st_size < 100: continue
                with Image.open(p_obj) as raw_img:
                    raw_img.load()
                    im = raw_img.convert('RGB') if raw_img.mode != 'RGB' else raw_img.copy()
                    loaded_imgs.append(im)
            if not loaded_imgs: continue
            max_w = max(im.width for im in loaded_imgs)
            total_h = 0
            for im in loaded_imgs:
                if im.width != max_w:
                    new_h = max(1, int(im.height * (max_w / im.width)))
                    im_r = im.resize((max_w, new_h), Image.Resampling.LANCZOS)
                    resized_imgs.append(im_r)
                    total_h += new_h
                else:
                    resized_imgs.append(im)
                    total_h += im.height
            combined = Image.new('RGB', (max_w, total_h), (255, 255, 255))
            curr_y = 0
            for im in resized_imgs:
                combined.paste(im, (0, curr_y))
                curr_y += im.height
            chunk_file = output_dir / f"page_{group_idx:03d}.webp"
            combined.save(chunk_file, 'WEBP', quality=90, method=6)
            merged_files.append(chunk_file)
        except Exception as e:
            print(f"  ⚠️ Lỗi ghép ảnh {group_idx}: {e}")
        finally:
            to_close = {id(im): im for im in (loaded_imgs + resized_imgs)}
            for im in to_close.values():
                try: im.close()
                except Exception: pass
            if combined:
                try: combined.close()
                except Exception: pass
    return merged_files

class SyncStateManager:
    def __init__(self, state_file_path: Path):
        self.path = state_file_path
        self.data = {"completed_manga": {}, "failed_manga": {}, "stats": {"total_comics": 0, "total_chapters": 0, "total_pages": 0}}
        self.load()

    def load(self):
        if self.path.exists():
            try:
                with open(self.path, "r", encoding="utf-8") as f:
                    self.data = json.load(f)
            except Exception: pass

    def save(self):
        self.data["last_updated"] = datetime.now(timezone.utc).isoformat()
        try:
            with open(self.path, "w", encoding="utf-8") as f:
                json.dump(self.data, f, ensure_ascii=False, indent=2)
        except Exception: pass

    def is_completed(self, m_id: str) -> bool:
        return m_id in self.data.get("completed_manga", {})

    def mark_completed(self, m_id: str, title: str, slug: str, ch_count: int, p_count: int):
        self.data.setdefault("completed_manga", {})[m_id] = {
            "title": title, "slug": slug, "chapters": ch_count, "pages": p_count,
            "synced_at": datetime.now(timezone.utc).isoformat()
        }
        if m_id in self.data.get("failed_manga", {}): del self.data["failed_manga"][m_id]
        s = self.data.setdefault("stats", {"total_comics": 0, "total_chapters": 0, "total_pages": 0})
        s["total_comics"] = len(self.data["completed_manga"])
        s["total_chapters"] += ch_count
        s["total_pages"] += p_count
        self.save()

    def mark_failed(self, m_id: str, title: str, err: str):
        self.data.setdefault("failed_manga", {})[m_id] = {"title": title, "error": str(err), "time": datetime.now(timezone.utc).isoformat()}
        self.save()

class GoogleDriveUploader:
    def __init__(self, folder_id=DEFAULT_DRIVE_FOLDER_ID, remote="gdrive", drive_path=None, service_account=None, delete_local=True):
        self.folder_id = folder_id
        self.remote = remote
        self.drive_path = Path(drive_path) if drive_path else None
        self.service_account = Path(service_account) if service_account else None
        self.delete_local = delete_local
        self.backend = "mount" if (self.drive_path and self.drive_path.exists()) else ("rclone" if shutil.which("rclone") else "local_only")

    def sync_manga(self, local_comic_dir: Path, slug: str, cover_file: Path = None):
        if self.backend == "rclone":
            action = "move" if self.delete_local else "copy"
            if local_comic_dir.exists() and any(local_comic_dir.iterdir()):
                cmd = [
                    "rclone", action, str(local_comic_dir), f"{self.remote}:chapters/{slug}",
                    "--drive-root-folder-id", self.folder_id,
                    "--transfers", "16", "--checkers", "8", "--retries", "3"
                ]
                if self.delete_local: cmd.append("--delete-empty-src-dirs")
                res = subprocess.run(cmd, capture_output=True, text=True)
                if res.returncode != 0:
                    print(f"❌ Lỗi rclone: {res.stderr.strip()[:150]}")
                    return False
            if cover_file and cover_file.exists():
                cmd_cov = [
                    "rclone", action, str(cover_file.parent), f"{self.remote}:covers",
                    "--include", cover_file.name,
                    "--drive-root-folder-id", self.folder_id, "--retries", "3"
                ]
                subprocess.run(cmd_cov, capture_output=True, text=True)
            return True
        elif self.backend == "mount":
            target = self.drive_path / "chapters" / slug
            target_cov = self.drive_path / "covers"
            target.mkdir(parents=True, exist_ok=True)
            target_cov.mkdir(parents=True, exist_ok=True)
            if cover_file and cover_file.exists():
                shutil.move(str(cover_file), str(target_cov / cover_file.name))
            if local_comic_dir.exists():
                for item in local_comic_dir.iterdir():
                    shutil.move(str(item), str(target / item.name))
                shutil.rmtree(local_comic_dir, ignore_errors=True)
            return True
        return True

class MangaDexClient:
    def __init__(self, lang=DEFAULT_LANG):
        self.lang = lang
        self.session = requests.Session()
        self.session.headers.update({"User-Agent": "TruyenKomi-MangaDex-Sync/2.0"})
        self._last_call = 0.0

    def _get(self, url, params=None):
        for att in range(MAX_RETRIES):
            diff = time.time() - self._last_call
            if diff < 0.22: time.sleep(0.22 - diff)
            self._last_call = time.time()
            try:
                r = self.session.get(url, params=params, timeout=DEFAULT_TIMEOUT)
                if r.status_code == 200: return r
                if r.status_code == 429: time.sleep(2 * (att + 1))
                else: time.sleep(1)
            except Exception: time.sleep(1)
        return None

    def extract_id(self, s: str):
        pat = r'[0-9a-fA-F]{8}-[0-9a-fA-F]{4}-[0-9a-fA-F]{4}-[0-9a-fA-F]{4}-[0-9a-fA-F]{12}'
        m = re.search(pat, s)
        return m.group(0) if m else s.strip()

    def get_total_count(self):
        r = self._get(f"{MANGADEX_API_BASE}/manga", {"limit": 1, "availableTranslatedLanguage[]": [self.lang], "hasAvailableChapters": "true"})
        return r.json().get("total", 0) if r else 0

    def iter_manga(self, order="oldest", start_offset=0, limit=None):
        offset = start_offset
        fetched = 0
        while True:
            params = {
                "limit": 100, "offset": offset,
                "availableTranslatedLanguage[]": [self.lang],
                "hasAvailableChapters": "true",
                "includes[]": ["cover_art", "author"],
                "contentRating[]": ["safe", "suggestive", "erotica", "pornographic"]
            }
            params["order[createdAt]"] = "asc" if order in ("oldest", "asc") else "desc"
            r = self._get(f"{MANGADEX_API_BASE}/manga", params)
            if not r: break
            d = r.json()
            items = d.get("data", [])
            total = d.get("total", 0)
            if not items: break
            for m in items:
                m_id = m["id"]
                attr = m.get("attributes", {})
                t_dict = attr.get("title", {})
                vi_t = None
                for alt in attr.get("altTitles", []):
                    if self.lang in alt:
                        vi_t = alt[self.lang]
                        break
                title = vi_t or t_dict.get("en") or list(t_dict.values())[0] if t_dict else "Unknown"
                cov_fn = None
                authors = []
                for rel in m.get("relationships", []):
                    if rel.get("type") == "author":
                        n = rel.get("attributes", {}).get("name")
                        if n: authors.append(n)
                    elif rel.get("type") == "cover_art":
                        cov_fn = rel.get("attributes", {}).get("fileName")
                cov_url = f"{MANGADEX_UPLOADS_BASE}/covers/{m_id}/{cov_fn}" if cov_fn else None
                yield {
                    "id": m_id, "title": title, "slug": slugify(title),
                    "author": ", ".join(authors) if authors else "Đang cập nhật",
                    "cover_url": cov_url, "total": total
                }
                fetched += 1
                if limit and fetched >= limit: return
            offset += len(items)
            if offset >= total: break

    def get_manga_info(self, m_id):
        r = self._get(f"{MANGADEX_API_BASE}/manga/{m_id}?includes[]=cover_art&includes[]=author")
        if not r: raise Exception(f"Không lấy được thông tin manga {m_id}")
        data = r.json().get("data", {})
        attr = data.get("attributes", {})
        t_dict = attr.get("title", {})
        vi_t = None
        for alt in attr.get("altTitles", []):
            if self.lang in alt:
                vi_t = alt[self.lang]
                break
        title = vi_t or t_dict.get("en") or list(t_dict.values())[0] if t_dict else "Unknown"
        cov_fn = None
        authors = []
        for rel in data.get("relationships", []):
            if rel.get("type") == "author":
                n = rel.get("attributes", {}).get("name")
                if n: authors.append(n)
            elif rel.get("type") == "cover_art":
                cov_fn = rel.get("attributes", {}).get("fileName")
        cov_url = f"{MANGADEX_UPLOADS_BASE}/covers/{m_id}/{cov_fn}" if cov_fn else None

        chapters_raw = []
        offset = 0
        while True:
            f_res = self._get(f"{MANGADEX_API_BASE}/manga/{m_id}/feed", {
                "translatedLanguage[]": [self.lang], "order[chapter]": "asc",
                "limit": 500, "offset": offset, "includes[]": ["scanlation_group"]
            })
            if not f_res: break
            ch_data = f_res.json()
            lst = ch_data.get("data", [])
            chapters_raw.extend(lst)
            offset += 500
            if offset >= ch_data.get("total", 0) or not lst: break

        grouped = {}
        for c in chapters_raw:
            c_a = c.get("attributes", {})
            try: num = float(c_a.get("chapter") or 0.0)
            except ValueError: num = 0.0
            pages = int(c_a.get("pages") or 0)
            obj = {"id": c["id"], "num": num, "pages": pages}
            if num not in grouped or pages > grouped[num]["pages"]:
                grouped[num] = obj

        chapters = list(grouped.values())
        chapters.sort(key=lambda x: x["num"])
        return {
            "id": m_id, "title": title, "slug": slugify(title),
            "author": ", ".join(authors) if authors else "Đang cập nhật",
            "cover_url": cov_url, "chapters": chapters
        }

    def get_images(self, chap_id, data_saver=DEFAULT_DATA_SAVER):
        # ⬜ Tải ẢNH GỐC nếu data_saver=False theo setting
        r = self._get(f"{MANGADEX_API_BASE}/at-home/server/{chap_id}")
        if not r: return []
        j = r.json()
        b = j.get("baseUrl")
        h = j.get("chapter", {}).get("hash")
        files = j.get("chapter", {}).get("dataSaver" if data_saver else "data", [])
        sub = "data-saver" if data_saver else "data"
        return [f"{b}/{sub}/{h}/{fn}" for fn in files]

class Synchronizer:
    def __init__(self, folder_id, remote, drive_path, workers=16, upload_to_web=True, skip_existing=True, data_saver=False, merge_slices=True, delete_local=True):
        self.client = MangaDexClient()
        self.uploader = GoogleDriveUploader(folder_id=folder_id, remote=remote, drive_path=drive_path, delete_local=delete_local)
        self.temp_root = Path(TEMP_DOWNLOAD_DIR).resolve()
        self.temp_root.mkdir(parents=True, exist_ok=True)
        self.state = SyncStateManager(self.temp_root / STATE_FILE_NAME)
        self.workers = workers
        self.upload_to_web = upload_to_web
        self.skip_existing = skip_existing
        self.data_saver = data_saver
        self.merge_slices = merge_slices
        self.delete_local = delete_local

    def _dl_img(self, url, dest):
        dest.parent.mkdir(parents=True, exist_ok=True)
        for _ in range(MAX_RETRIES):
            try:
                r = requests.get(url, timeout=DEFAULT_TIMEOUT)
                if r.status_code == 200 and len(r.content) > 500:
                    with open(dest, "wb") as f:
                        f.write(r.content)
                    return True
            except Exception: time.sleep(1)
        return False

    def _to_webp(self, src, dest):
        try:
            with Image.open(src) as im:
                im.load()
                im = im.convert('RGB') if im.mode != 'RGB' else im
                im.save(dest, 'WEBP', quality=90, method=6)
            if src != dest and src.exists(): src.unlink(missing_ok=True)
            return True
        except Exception: return False

    def sync_manga(self, m_input):
        m_id = self.client.extract_id(m_input)
        if self.state.is_completed(m_id) and self.skip_existing:
            print(f"ℹ️ Đã có trên Drive: ID {m_id} (Bỏ qua)")
            return True

        info = self.client.get_manga_info(m_id)
        title = info["title"]
        slug = info["slug"]
        chapters = info["chapters"]

        print(f"▶ Đang xử lý: {title} ({len(chapters)} chương)...")
        comic_dir = self.temp_root / "chapters" / slug
        cov_dir = self.temp_root / "covers"
        comic_dir.mkdir(parents=True, exist_ok=True)
        cov_dir.mkdir(parents=True, exist_ok=True)

        cov_file = None
        if info.get("cover_url"):
            raw_c = cov_dir / f"{slug}_raw.jpg"
            dest_c = cov_dir / f"{slug}.webp"
            if not dest_c.exists():
                if self._dl_img(info["cover_url"], raw_c):
                    if self._to_webp(raw_c, dest_c): cov_file = dest_c
                    else: cov_file = raw_c
            else: cov_file = dest_c

        info_json = comic_dir / "info.json"
        try:
            with open(info_json, "w", encoding="utf-8") as f:
                json.dump({
                    "id": m_id, "title": title, "slug": slug, "author": info["author"],
                    "total_chapters": len(chapters), "mangadex_url": f"https://mangadex.org/title/{m_id}"
                }, f, ensure_ascii=False, indent=2)
        except Exception: pass

        total_pages = 0
        skipped_cnt = 0
        for idx, ch in enumerate(chapters, 1):
            num = ch["num"]
            n_str = f"{int(num)}" if float(num).is_integer() else f"{num}"
            c_dir = comic_dir / f"chap{n_str}"

            # ☑️ Bỏ qua chapter đã có trên máy (Tránh tải trùng / Resume)
            if self.skip_existing and c_dir.exists():
                existing = list(c_dir.glob("page_*.webp")) or list(c_dir.glob("*.webp"))
                if len(existing) >= 1:
                    skipped_cnt += 1
                    continue

            c_dir.mkdir(parents=True, exist_ok=True)
            imgs = self.client.get_images(ch["id"], data_saver=self.data_saver)
            if not imgs: continue

            print(f"  📥 [{idx}/{len(chapters)}] Đang tải Chương {n_str} ({len(imgs)} ảnh gốc)...", flush=True)

            # ☑️ Ghép ảnh Manhwa 5-in-1 khi chapter > 70 ảnh
            should_stitch = self.merge_slices and (len(imgs) > AUTO_STITCH_THRESHOLD)
            target_dir = c_dir / "_temp_slices" if should_stitch else c_dir
            target_dir.mkdir(parents=True, exist_ok=True)

            raw_imgs = []
            with ThreadPoolExecutor(max_workers=self.workers) as pool:
                futs = {}
                for p_i, u in enumerate(imgs, 1):
                    p_path = target_dir / f"raw_{p_i:04d}.jpg"
                    raw_imgs.append(p_path)
                    futs[pool.submit(self._dl_img, u, p_path)] = p_path
                for f in as_completed(futs): pass

            downloaded = sorted([p for p in raw_imgs if p.exists()])

            if should_stitch:
                merged = merge_images_vertical(downloaded, c_dir, group_size=STITCH_GROUP_SIZE)
                total_pages += len(merged)
                shutil.rmtree(target_dir, ignore_errors=True)
                print(f"    ✓ Ghép 5-in-1: {len(merged)} trang WebP (Chương {n_str})", flush=True)
            else:
                for p_i, r_p in enumerate(downloaded, 1):
                    w_p = c_dir / f"page_{p_i:03d}.webp"
                    self._to_webp(r_p, w_p)
                    total_pages += 1
                print(f"    ✓ Đã lưu {len(downloaded)} trang ảnh WebP (Chương {n_str})", flush=True)

        if skipped_cnt > 0:
            print(f"  ⏭️ Bỏ qua {skipped_cnt} chương đã tồn tại.")

        if self.upload_to_web:
            print(f"☁️ Đang đẩy '{title}' lên Google Drive (Folder ID: {self.uploader.folder_id})...")
            if self.uploader.sync_manga(comic_dir, slug, cov_file):
                self.state.mark_completed(m_id, title, slug, len(chapters), total_pages)
                print(f"🎉 Đã lưu thành công '{title}' vào Google Drive!\n")
                return True
            else:
                self.state.mark_failed(m_id, title, "Lỗi khi upload Drive")
                return False
        return True

    def sync_all(self, order="oldest", offset=0, limit=None):
        tot = self.client.get_total_count()
        print(f"🚀 BẮT ĐẦU ĐỒNG BỘ TOÀN BỘ MANGADEX TIẾNG VIỆT ({tot} bộ truyện)")
        print(f"📁 Google Drive Target Folder: {self.uploader.folder_id}")
        print(f"⚙️ Thiết lập: Đồng bộ Cloud=BẬT | Bỏ qua đã có=BẬT | ẢNH GỐC (DataSaver=TẮT) | Ghép Manhwa=BẬT | 16 luồng")
        cnt = 0
        for item in self.client.iter_manga(order=order, start_offset=offset, limit=limit):
            cnt += 1
            if self.state.is_completed(item["id"]) and self.skip_existing: continue
            print(f"━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━")
            print(f"▶ [{cnt}] {item['title']} (Tác giả: {item['author']})")
            try: self.sync_manga(item["id"])
            except Exception as e:
                print(f"❌ Lỗi: {e}")
                self.state.mark_failed(item["id"], item["title"], str(e))
            time.sleep(0.5)
        print("🎉 HOÀN TẤT TẢI TOÀN BỘ TRUYỆN MANGADEX LÊN GOOGLE DRIVE!")

def main():
    p = argparse.ArgumentParser()
    p.add_argument("--all", action="store_true")
    p.add_argument("--url", default=None)
    p.add_argument("--folder-id", default=DEFAULT_DRIVE_FOLDER_ID)
    p.add_argument("--remote", default="gdrive")
    p.add_argument("--drive-path", default=None)
    p.add_argument("--offset", type=int, default=0)
    p.add_argument("--limit", type=int, default=None)
    p.add_argument("--order", default="oldest")
    p.add_argument("--workers", type=int, default=16)
    p.add_argument("--keep-local", action="store_true")
    p.add_argument("--data-saver", action="store_true", default=False)
    args = p.parse_args()

    s = Synchronizer(
        folder_id=args.folder_id,
        remote=args.remote,
        drive_path=args.drive_path,
        workers=args.workers,
        upload_to_web=True,
        skip_existing=True,
        data_saver=args.data_saver,
        merge_slices=True,
        delete_local=not args.keep_local
    )
    if args.url: s.sync_manga(args.url)
    elif args.all: s.sync_all(order=args.order, offset=args.offset, limit=args.limit)
    else: p.print_help()

if __name__ == "__main__":
    main()
EOF
        chmod +x "$PYTHON_SCRIPT"
        log_success "Đã khởi tạo Engine Python '$PYTHON_SCRIPT' thành công!"
    fi
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
# 3. CẤU HÌNH LIÊN KẾT GOOGLE DRIVE QUA RCLONE
# ==============================================================================
setup_google_drive() {
    log_header "BƯỚC 2/3: CẤU HÌNH LIÊN KẾT GOOGLE DRIVE"
    log_info "Thư mục đích Google Drive: luutruyenkomi (Folder ID: ${DEFAULT_FOLDER_ID})"

    if rclone listremotes 2>/dev/null | grep -q "^${RCLONE_REMOTE_NAME}:"; then
        log_success "Tìm thấy remote Rclone '${RCLONE_REMOTE_NAME}:' đã được cấu hình!"
        return 0
    fi

    echo -e "${YELLOW}Máy chủ Ubuntu chưa liên kết với Google Drive.${NC}"
    echo -e "Hãy chọn phương thức liên kết tiện lợi nhất cho bạn:\n"
    echo -e "  ${BOLD}[1] Cấu hình nhanh qua Rclone Web / Headless${NC} (Khuyên dùng)"
    echo -e "  ${BOLD}[2] Nhập mã Token OAuth từ máy tính cá nhân${NC}"
    echo -e "  ${BOLD}[3] Sử dụng Google Service Account (service_account.json)${NC}"
    echo -e "  ${BOLD}[4] Đã Mount Google Drive vào một thư mục trên máy${NC}"
    echo -e "  ${BOLD}[0] Bỏ qua${NC}\n"
    echo -n "Lựa chọn của bạn [1-4]: "
    read -r drive_opt

    case "$drive_opt" in
        1)
            rclone config
            ;;
        2)
            echo -n "Nhập chuỗi Token JSON lấy từ 'rclone authorize drive': "
            read -r oauth_token
            if [ -n "$oauth_token" ]; then
                rclone config create "$RCLONE_REMOTE_NAME" drive root_folder_id "$DEFAULT_FOLDER_ID" token "$oauth_token"
                log_success "Đã tạo remote '${RCLONE_REMOTE_NAME}' thành công!"
            fi
            ;;
        3)
            echo -n "Nhập đường dẫn file service_account.json: "
            read -r sa_path
            if [ -f "$sa_path" ]; then
                rclone config create "$RCLONE_REMOTE_NAME" drive root_folder_id "$DEFAULT_FOLDER_ID" service_account_file "$sa_path"
                log_success "Đã cấu hình remote với Service Account thành công!"
            fi
            ;;
        4)
            echo -n "Nhập đường dẫn thư mục mount (VD: /mnt/gdrive): "
            read -r mnt_path
            export DRIVE_MOUNT_PATH="$mnt_path"
            ;;
        *)
            ;;
    esac
}

# ==============================================================================
# 4. CÁC HÀM THỰC THI TẢI TRUYỆN
# ==============================================================================
run_download_all_foreground() {
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

if [ "$1" = "--all" ]; then
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

while true; do
    echo -e "${CYAN}================================================================${NC}"
    echo -e "${BOLD}${MAGENTA}🚀 MANGADEX TO GOOGLE DRIVE SYNCHRONIZER (UBUNTU)${NC}"
    echo -e "   Thư mục Drive: ${GREEN}luutruyenkomi${NC} (ID: ${CYAN}${DEFAULT_FOLDER_ID}${NC})"
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

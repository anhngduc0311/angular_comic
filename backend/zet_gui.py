#!/usr/bin/env python3
# -*- coding: utf-8 -*-
"""
=============================================================================
🎨 ZetTruyen Manga Downloader - Modern GUI Application (CustomTkinter)
=============================================================================
Author: TruyenKomi Team
Description: Giao diện đồ họa hiện đại, trực quan, hỗ trợ tải truyện đa luồng,
             xem trước ảnh bìa, chọn chương linh hoạt và xuất PDF/Ghép ảnh.
=============================================================================
"""

import sys
import os
import re
import time
import threading
from pathlib import Path
from concurrent.futures import ThreadPoolExecutor, as_completed
from io import BytesIO

# Fix console encoding
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
import urllib.parse
from datetime import datetime, timezone

import cloudscraper
from bs4 import BeautifulSoup
from PIL import Image, ImageTk
Image.MAX_IMAGE_PIXELS = None

import customtkinter as ctk
from tkinter import filedialog, messagebox

# Set CustomTkinter Theme
ctk.set_appearance_mode("Dark")
ctk.set_default_color_theme("blue")

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

DEFAULT_COMIC_URL = "https://www.zettruyen1.com/truyen-tranh/phuc-thu"
AUTO_STITCH_THRESHOLD = 70  # Tự động ghép khi chapter có > 70 ảnh
STITCH_GROUP_SIZE = 5      # Ghép 5 ảnh thành 1 (5-in-1)

# Cloud Storage & Web API Settings
DEFAULT_API_BASE_URL = os.getenv("API_BASE_URL", "http://localhost:5000/api")
GCS_ENDPOINT = os.getenv("R2_ENDPOINT", "storage.googleapis.com")
GCS_ACCESS_KEY = os.getenv("R2_ACCESS_KEY", "GOOGQHRXVRS7YCR24JBLB33S")
GCS_SECRET_KEY = os.getenv("R2_SECRET_KEY", "3Iamo8whmuUeT2B+CMtRnfW6qdIsmwXVec47tF52")
GCS_BUCKET = os.getenv("R2_BUCKET_NAME", "truyenkomi")
CDN_BASE_URL = os.getenv("R2_CDN_BASE_URL", "https://img.truyenkomi.site").rstrip("/")


def upload_file_to_cloud(local_path: Path, object_name: str, content_type: str = "image/jpeg") -> str:
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


class MangaDownloaderGUI(ctk.CTk):
    def __init__(self):
        super().__init__()

        self.title("⚡ ZetTruyen Manga Downloader Pro")
        self.geometry("980x750")
        self.minsize(850, 650)

        # App state
        self.scraper = cloudscraper.create_scraper(
            browser={'browser': 'chrome', 'platform': 'windows', 'desktop': True}
        )
        self.comic_info = None
        self.is_downloading = False
        self.cancel_requested = False

        self._setup_ui()

    def _setup_ui(self):
        # Grid layout
        self.grid_columnconfigure(0, weight=1)
        self.grid_rowconfigure(2, weight=1)

        # ---------------- 1. HEADER ----------------
        header_frame = ctk.CTkFrame(self, corner_radius=10, fg_color="#1a1c23")
        header_frame.grid(row=0, column=0, padx=15, pady=(15, 10), sticky="ew")

        title_lbl = ctk.CTkLabel(
            header_frame,
            text="🚀 ZetTruyen Manga Downloader Pro",
            font=ctk.CTkFont(size=22, weight="bold"),
            text_color="#38bdf8"
        )
        title_lbl.pack(anchor="w", padx=20, pady=(12, 2))

        sub_lbl = ctk.CTkLabel(
            header_frame,
            text="Tải truyện tranh siêu tốc, đa luồng, chống chặn Cloudflare, xuất PDF & ghép ảnh manhwa.",
            font=ctk.CTkFont(size=12),
            text_color="#94a3b8"
        )
        sub_lbl.pack(anchor="w", padx=20, pady=(0, 12))

        # ---------------- 2. INPUT & CONTROLS FRAME ----------------
        input_card = ctk.CTkFrame(self, corner_radius=10)
        input_card.grid(row=1, column=0, padx=15, pady=5, sticky="ew")
        input_card.grid_columnconfigure(1, weight=1)

        # Row 0: URL Input
        ctk.CTkLabel(input_card, text="🔗 URL Truyện:", font=ctk.CTkFont(weight="bold")).grid(row=0, column=0, padx=15, pady=10, sticky="w")
        
        self.url_entry = ctk.CTkEntry(input_card, placeholder_text="Nhập link truyện (VD: https://www.zettruyen1.com/truyen-tranh/phuc-thu)")
        self.url_entry.insert(0, DEFAULT_COMIC_URL)
        self.url_entry.grid(row=0, column=1, padx=(0, 10), pady=10, sticky="ew")

        self.btn_fetch = ctk.CTkButton(
            input_card,
            text="🔍 Lấy Thông Tin",
            command=self.fetch_comic_info_thread,
            fg_color="#0284c7",
            hover_color="#0369a1",
            width=130
        )
        self.btn_fetch.grid(row=0, column=2, padx=(0, 15), pady=10)

        # Row 1: Save Directory
        ctk.CTkLabel(input_card, text="📂 Lưu vào:", font=ctk.CTkFont(weight="bold")).grid(row=1, column=0, padx=15, pady=5, sticky="w")
        
        default_save_path = str((Path.cwd() / "downloads").resolve())
        self.save_entry = ctk.CTkEntry(input_card)
        self.save_entry.insert(0, default_save_path)
        self.save_entry.grid(row=1, column=1, padx=(0, 10), pady=5, sticky="ew")

        self.btn_browse = ctk.CTkButton(
            input_card,
            text="📁 Chọn Thư Mục",
            command=self.browse_folder,
            fg_color="#334155",
            hover_color="#475569",
            width=130
        )
        self.btn_browse.grid(row=1, column=2, padx=(0, 15), pady=5)

        # ---------------- 3. MAIN CONTENT (INFO CARD + LOGS) ----------------
        main_content = ctk.CTkFrame(self, corner_radius=10, fg_color="transparent")
        main_content.grid(row=2, column=0, padx=15, pady=10, sticky="nsew")
        main_content.grid_columnconfigure(0, weight=4)  # Left info & options
        main_content.grid_columnconfigure(1, weight=5)  # Right logs & preview
        main_content.grid_rowconfigure(0, weight=1)

        # --- LEFT PANEL: Options & Info ---
        left_card = ctk.CTkFrame(main_content, corner_radius=10)
        left_card.grid(row=0, column=0, padx=(0, 10), pady=0, sticky="nsew")
        left_card.grid_columnconfigure(1, weight=1)

        # Comic details preview
        self.lbl_comic_title = ctk.CTkLabel(left_card, text="📖 Tên truyện: (Chưa tải dữ liệu)", font=ctk.CTkFont(size=14, weight="bold"), text_color="#38bdf8")
        self.lbl_comic_title.grid(row=0, column=0, columnspan=2, padx=15, pady=(15, 5), sticky="w")

        self.lbl_comic_stats = ctk.CTkLabel(left_card, text="📚 Tổng số chương: 0 chương", font=ctk.CTkFont(size=12), text_color="#cbd5e1")
        self.lbl_comic_stats.grid(row=1, column=0, columnspan=2, padx=15, pady=(0, 10), sticky="w")

        # Range Options
        ctk.CTkLabel(left_card, text="🎯 Chế độ tải:", font=ctk.CTkFont(weight="bold")).grid(row=2, column=0, padx=15, pady=5, sticky="w")
        
        self.mode_var = ctk.StringVar(value="all")
        self.radio_all = ctk.CTkRadioButton(left_card, text="Tất cả các chương", variable=self.mode_var, value="all", command=self._toggle_mode)
        self.radio_all.grid(row=2, column=1, padx=10, pady=5, sticky="w")

        self.radio_range = ctk.CTkRadioButton(left_card, text="Theo khoảng chương", variable=self.mode_var, value="range", command=self._toggle_mode)
        self.radio_range.grid(row=3, column=1, padx=10, pady=5, sticky="w")

        # Range inputs
        range_frame = ctk.CTkFrame(left_card, fg_color="transparent")
        range_frame.grid(row=4, column=0, columnspan=2, padx=15, pady=5, sticky="w")

        ctk.CTkLabel(range_frame, text="Từ chương:").pack(side="left", padx=(0, 5))
        self.start_chap_entry = ctk.CTkEntry(range_frame, width=70, placeholder_text="1")
        self.start_chap_entry.pack(side="left", padx=5)

        ctk.CTkLabel(range_frame, text="Đến chương:").pack(side="left", padx=(10, 5))
        self.end_chap_entry = ctk.CTkEntry(range_frame, width=70, placeholder_text="8")
        self.end_chap_entry.pack(side="left", padx=5)

        # Advanced Checkboxes
        ctk.CTkLabel(left_card, text="⚙️ Tùy chọn nâng cao:", font=ctk.CTkFont(weight="bold")).grid(row=5, column=0, columnspan=2, padx=15, pady=(15, 5), sticky="w")

        self.cb_pdf = ctk.CTkCheckBox(left_card, text="📄 Tự động xuất mỗi chương thành file PDF", fg_color="#0284c7")
        self.cb_pdf.grid(row=6, column=0, columnspan=2, padx=15, pady=5, sticky="w")

        self.cb_merge = ctk.CTkCheckBox(left_card, text="🧩 Ghép ảnh manhwa (5-in-1, tự động khi > 70 ảnh)", fg_color="#0284c7")
        self.cb_merge.grid(row=7, column=0, columnspan=2, padx=15, pady=5, sticky="w")

        self.cb_upload_web = ctk.CTkCheckBox(left_card, text="🌐 Tự động đưa lên Website (Cloud & Web Sync)", fg_color="#0284c7")
        self.cb_upload_web.select()  # Mặc định bật
        self.cb_upload_web.grid(row=8, column=0, columnspan=2, padx=15, pady=5, sticky="w")

        # Threads slider
        thread_frame = ctk.CTkFrame(left_card, fg_color="transparent")
        thread_frame.grid(row=9, column=0, columnspan=2, padx=15, pady=10, sticky="ew")
        
        self.lbl_threads = ctk.CTkLabel(thread_frame, text="⚡ Luồng tải song song: 16 luồng")
        self.lbl_threads.pack(anchor="w")

        self.slider_threads = ctk.CTkSlider(thread_frame, from_=4, to=32, number_of_steps=7, command=self._update_threads_label)
        self.slider_threads.set(16)
        self.slider_threads.pack(fill="x", pady=5)

        # Cover Preview Frame
        self.cover_label = ctk.CTkLabel(left_card, text="[ Chưa có ảnh bìa ]", width=120, height=160, fg_color="#0f172a", corner_radius=6)
        self.cover_label.grid(row=10, column=0, columnspan=2, padx=15, pady=(5, 10))

        # --- RIGHT PANEL: Logs & Terminal ---
        right_card = ctk.CTkFrame(main_content, corner_radius=10)
        right_card.grid(row=0, column=1, padx=(0, 0), pady=0, sticky="nsew")
        right_card.grid_rowconfigure(1, weight=1)
        right_card.grid_columnconfigure(0, weight=1)

        ctk.CTkLabel(right_card, text="📋 Nhật Ký Tải Truyện (Logs):", font=ctk.CTkFont(weight="bold")).grid(row=0, column=0, padx=15, pady=(10, 5), sticky="w")

        self.log_box = ctk.CTkTextbox(right_card, font=ctk.CTkFont(family="Consolas", size=12), fg_color="#090d16", text_color="#38bdf8")
        self.log_box.grid(row=1, column=0, padx=15, pady=5, sticky="nsew")

        # ---------------- 4. BOTTOM ACTION & PROGRESS BAR ----------------
        bottom_frame = ctk.CTkFrame(self, corner_radius=10)
        bottom_frame.grid(row=3, column=0, padx=15, pady=(5, 15), sticky="ew")
        bottom_frame.grid_columnconfigure(0, weight=1)

        # Progress bar
        self.progress_bar = ctk.CTkProgressBar(bottom_frame, height=14, fg_color="#1e293b", progress_color="#38bdf8")
        self.progress_bar.set(0)
        self.progress_bar.grid(row=0, column=0, columnspan=3, padx=20, pady=(15, 5), sticky="ew")

        # Status text
        self.lbl_status = ctk.CTkLabel(bottom_frame, text="Sẵn sàng...", font=ctk.CTkFont(size=12), text_color="#94a3b8")
        self.lbl_status.grid(row=1, column=0, padx=20, pady=(0, 10), sticky="w")

        # Action Buttons
        btn_frame = ctk.CTkFrame(bottom_frame, fg_color="transparent")
        btn_frame.grid(row=1, column=2, padx=20, pady=(0, 10), sticky="e")

        self.btn_open_folder = ctk.CTkButton(
            btn_frame,
            text="📂 Mở Thư Mục",
            command=self.open_output_folder,
            fg_color="#334155",
            hover_color="#475569",
            width=120
        )
        self.btn_open_folder.pack(side="left", padx=5)

        self.btn_start = ctk.CTkButton(
            btn_frame,
            text="🚀 Bắt Đầu Tải",
            command=self.start_download_thread,
            fg_color="#10b981",
            hover_color="#059669",
            font=ctk.CTkFont(size=13, weight="bold"),
            width=140
        )
        self.btn_start.pack(side="left", padx=5)

        self.btn_cancel = ctk.CTkButton(
            btn_frame,
            text="⛔ Dừng Lại",
            command=self.cancel_download,
            fg_color="#ef4444",
            hover_color="#dc2626",
            width=100,
            state="disabled"
        )
        self.btn_cancel.pack(side="left", padx=5)

        # Initial UI mode state
        self._toggle_mode()
        self.log("Chào mừng bạn đến với ZetTruyen Manga Downloader Pro!\nNhập URL truyện và bấm 'Lấy Thông Tin' để bắt đầu.")

    def _update_threads_label(self, val):
        self.lbl_threads.configure(text=f"⚡ Luồng tải song song: {int(val)} luồng")

    def _toggle_mode(self):
        is_range = (self.mode_var.get() == "range")
        if is_range:
            self.start_chap_entry.configure(state="normal")
            self.end_chap_entry.configure(state="normal")
        else:
            self.start_chap_entry.configure(state="disabled")
            self.end_chap_entry.configure(state="disabled")

    def browse_folder(self):
        folder = filedialog.askdirectory(initialdir=self.save_entry.get())
        if folder:
            self.save_entry.delete(0, "end")
            self.save_entry.insert(0, folder)

    def open_output_folder(self):
        folder = self.save_entry.get()
        if os.path.exists(folder):
            if sys.platform == 'win32':
                os.startfile(folder)
            elif sys.platform == 'darwin':
                os.system(f'open "{folder}"')
            else:
                os.system(f'xdg-open "{folder}"')
        else:
            messagebox.showwarning("Thông báo", "Thư mục lưu chưa tồn tại!")

    def log(self, text: str):
        self.log_box.insert("end", text + "\n")
        self.log_box.see("end")

    # ---------------- THREAD: FETCH COMIC INFO ----------------
    def fetch_comic_info_thread(self):
        url = self.url_entry.get().strip()
        if not url:
            messagebox.showerror("Lỗi", "Vui lòng nhập đường dẫn truyện!")
            return

        self.btn_fetch.configure(state="disabled", text="Đang lấy...")
        self.lbl_status.configure(text="Đang kết nối tới ZetTruyen...")

        threading.Thread(target=self._fetch_comic_info_worker, args=(url,), daemon=True).start()

    def _fetch_comic_info_worker(self, url):
        try:
            self.log(f"🔍 Đang phân tích dữ liệu: {url} ...")
            slug = url.split("?")[0].rstrip("/").split("/")[-1]

            res = self.scraper.get(url, timeout=15)
            if res.status_code != 200:
                raise Exception(f"HTTP {res.status_code}")

            soup = BeautifulSoup(res.text, "html.parser")
            title_elem = soup.find("h1")
            title = title_elem.get_text(strip=True) if title_elem else slug.replace("-", " ").title()
            title = re.sub(r'\s*\|\s*ZetTruyen.*', '', title, flags=re.IGNORECASE).strip()

            # Cover
            cover_url = None
            cover_match = re.search(r'https?://[^"\'\s<>]+zetimage[^"\'\s<>]+thumb[^"\'\s<>]+\.(?:jpg|webp|png|jpeg)', res.text, re.I)
            if cover_match:
                cover_url = cover_match.group(0)

            # 3. Tác giả, Nhóm dịch, Tên khác, Độ tuổi (Cào tự động)
            author = "Đang cập nhật"
            translator_group = "Đang cập nhật"
            other_names = "Đang cập nhật"
            age_limit = "13+"

            # 3.1 Cào từ Grid layout nếu có
            grid = soup.find('div', class_=lambda c: c and 'grid-cols-1' in c and 'md:grid-cols-2' in c)
            if grid:
                for child in grid.find_all('div', recursive=False):
                    txt = child.get_text(" ", strip=True)
                    if txt.startswith("Tác giả"):
                        v = txt.replace("Tác giả", "").strip()
                        if v and v != "-": author = v
                    elif txt.startswith("Nhóm dịch"):
                        v = txt.replace("Nhóm dịch", "").strip()
                        if v and v != "-": translator_group = v
                    elif txt.startswith("Tên khác"):
                        v = txt.replace("Tên khác", "").strip()
                        if v and v != "-": other_names = v
                    elif txt.startswith("Độ tuổi"):
                        v = txt.replace("Độ tuổi", "").strip()
                        if v and v != "-": age_limit = v

            # 3.2 Cào từ Text regex fallback
            page_text = soup.get_text(" ", strip=True)

            if author == "Đang cập nhật":
                m_auth = re.search(r'Tác giả\s*[:：]?\s*([^\n\r]+?)\s+(?:Lượt xem|Cập nhật|Nhóm dịch|Tổng số|Thể loại)', page_text)
                if m_auth: 
                    author = m_auth.group(1).strip()
                elif 'sáng tác bởi' in page_text:
                    m2 = re.search(r'sáng tác bởi\s+([^,.]+)', page_text)
                    if m2: author = m2.group(1).strip()

            if translator_group == "Đang cập nhật":
                m_trans = re.search(r'Nhóm dịch\s*[:：]?\s*([^\n\r]+?)\s+(?:Tổng số chap|Ngày tạo|Tên khác|Độ tuổi|Loại|Trạng thái|Thể loại)', page_text)
                if m_trans:
                    translator_group = m_trans.group(1).strip()
                elif 'chuyển ngữ bởi' in page_text:
                    m2 = re.search(r'chuyển ngữ bởi\s+([^,.]+)', page_text)
                    if m2: translator_group = m2.group(1).strip()
                elif 'Bản dịch từ' in page_text:
                    m3 = re.search(r'Bản dịch từ\s+([^,.]+)', page_text)
                    if m3: translator_group = m3.group(1).strip()

            if other_names == "Đang cập nhật":
                m_other = re.search(r'Tên khác\s*[:：]?\s*([^\n\r]+?)\s+(?:Độ tuổi|Loại|Trạng thái|Thể loại)', page_text)
                if m_other: other_names = m_other.group(1).strip()

            if age_limit == "13+":
                m_age = re.search(r'Độ tuổi\s*[:：]?\s*([^\n\r]+?)\s+(?:Loại|Trạng thái|Thể loại)', page_text)
                if m_age: age_limit = m_age.group(1).strip()

            for item in soup.find_all(["li", "p", "div", "span", "tr"]):
                text = item.get_text(" ", strip=True)
                if author == "Đang cập nhật" and ("Tác giả" in text or "Author" in text) and ":" in text:
                    val = text.split(":", 1)[1].strip()
                    if val and len(val) < 80: author = val
                elif translator_group == "Đang cập nhật" and ("Nhóm dịch" in text or "Translator" in text) and ":" in text:
                    val = text.split(":", 1)[1].strip()
                    if val and len(val) < 80: translator_group = val
                elif other_names == "Đang cập nhật" and ("Tên khác" in text or "Alternative" in text) and ":" in text:
                    val = text.split(":", 1)[1].strip()
                    if val and len(val) < 150: other_names = val
                elif age_limit == "13+" and ("Độ tuổi" in text or "Age" in text) and ":" in text:
                    val = text.split(":", 1)[1].strip()
                    if val and len(val) < 30: age_limit = val

            # Chapters from API
            chapters = []
            api_url = f"https://www.zettruyen1.com/api/comics/{slug}/chapters?per_page=-1"
            try:
                api_res = self.scraper.get(api_url, headers={"Referer": url}, timeout=15)
                if api_res.status_code == 200:
                    for item in api_res.json().get("data", {}).get("chapters", []):
                        num = float(item.get("chapter_num") or 0)
                        chapters.append({
                            "number": num,
                            "title": item.get("chapter_name") or f"Chapter {num}",
                            "url": f"https://www.zettruyen1.com/truyen-tranh/{slug}/chuong-{int(num) if num.is_integer() else num}"
                        })
            except Exception:
                pass

            chapters.sort(key=lambda x: x["number"])

            self.comic_info = {
                "title": title,
                "slug": slug,
                "cover_url": cover_url,
                "author": author,
                "translator_group": translator_group,
                "other_names": other_names,
                "age_limit": age_limit,
                "chapters": chapters
            }

            # Update UI on main thread
            self.after(0, self._on_fetch_success)

        except Exception as e:
            self.after(0, lambda: self._on_fetch_error(str(e)))

    def _on_fetch_success(self):
        info = self.comic_info
        self.btn_fetch.configure(state="normal", text="🔍 Lấy Thông Tin")
        self.lbl_comic_title.configure(text=f"📖 {info['title']}")
        self.lbl_comic_stats.configure(
            text=f"📚 {len(info['chapters'])} chương | ✍️ Tác giả: {info.get('author', 'Đang cập nhật')} | 👥 Nhóm dịch: {info.get('translator_group', 'Đang cập nhật')}"
        )
        
        if info['chapters']:
            self.start_chap_entry.delete(0, "end")
            self.start_chap_entry.insert(0, str(int(info['chapters'][0]['number'])))
            self.end_chap_entry.delete(0, "end")
            self.end_chap_entry.insert(0, str(int(info['chapters'][-1]['number'])))

        self.lbl_status.configure(text=f"Đã lấy thông tin bộ truyện: {info['title']} ({len(info['chapters'])} chương)")
        self.log(f"✓ Đã tìm thấy {len(info['chapters'])} chương của bộ truyện '{info['title']}'.")

        # Load cover image preview
        if info["cover_url"]:
            threading.Thread(target=self._load_cover_thumbnail, args=(info["cover_url"],), daemon=True).start()

    def _load_cover_thumbnail(self, cover_url):
        try:
            r = self.scraper.get(cover_url, timeout=10)
            if r.status_code == 200:
                img_data = BytesIO(r.content)
                pil_img = Image.open(img_data)
                pil_img.thumbnail((120, 160))
                ctk_img = ctk.CTkImage(light_image=pil_img, dark_image=pil_img, size=pil_img.size)
                self.after(0, lambda: self.cover_label.configure(image=ctk_img, text=""))
        except Exception:
            pass

    def _on_fetch_error(self, err_msg):
        self.btn_fetch.configure(state="normal", text="🔍 Lấy Thông Tin")
        self.lbl_status.configure(text="Lỗi lấy dữ liệu!")
        self.log(f"❌ Lỗi: {err_msg}")
        messagebox.showerror("Lỗi", f"Không thể lấy thông tin truyện: {err_msg}")

    # ---------------- THREAD: DOWNLOAD ENGINE ----------------
    def start_download_thread(self):
        if not self.comic_info or not self.comic_info.get("chapters"):
            messagebox.showwarning("Cảnh báo", "Vui lòng bấm 'Lấy Thông Tin' trước khi tải!")
            return

        self.is_downloading = True
        self.cancel_requested = False
        self.btn_start.configure(state="disabled")
        self.btn_fetch.configure(state="disabled")
        self.btn_cancel.configure(state="normal")
        self.progress_bar.set(0)

        threading.Thread(target=self._download_worker, daemon=True).start()

    def cancel_download(self):
        if self.is_downloading:
            self.cancel_requested = True
            self.lbl_status.configure(text="Đang hủy tiến trình...")
            self.log("⚠️ Người dùng yêu cầu dừng tải...")

    def _get_chapter_images(self, chap_url, slug):
        try:
            res = self.scraper.get(chap_url, timeout=15)
            if res.status_code != 200:
                return []
            pattern = rf'https?://(?:cdn\d*\.zetimage\.com|[^"\'\s<>]+zetimage[^"\'\s<>]+)/{slug}/[^"\'\s<>]+\.(?:jpg|webp|png|jpeg)'
            matches = re.findall(pattern, res.text, re.I)
            unique = []
            seen = set()
            for u in matches:
                if u not in seen and "thumb" not in u:
                    seen.add(u)
                    unique.append(u)
            def get_idx(u):
                m = re.search(r'/(\d+)\.(?:jpg|webp|png|jpeg)', u, re.I)
                return int(m.group(1)) if m else 999999
            unique.sort(key=get_idx)
            return unique
        except Exception:
            return []

    def _download_img(self, url, path, referer):
        if self.cancel_requested:
            return False
        if path.exists() and path.stat().st_size > 1000:
            return True
        for _ in range(3):
            try:
                r = self.scraper.get(url, headers={"Referer": referer}, timeout=15)
                if r.status_code == 200 and len(r.content) > 500:
                    with open(path, "wb") as f:
                        f.write(r.content)
                    return True
            except Exception:
                time.sleep(0.5)
        return False

    def _export_pdf(self, image_paths, pdf_path):
        valid = []
        for p in image_paths:
            try:
                im = Image.open(p)
                if im.mode != 'RGB':
                    im = im.convert('RGB')
                valid.append(im)
            except Exception:
                pass
        if valid:
            valid[0].save(pdf_path, "PDF", resolution=100.0, save_all=True, append_images=valid[1:])

    def _merge_images(self, image_paths, output_dir, group_size=STITCH_GROUP_SIZE):
        """Ghép nhóm các ảnh manhwa thành 1 ảnh dài xuất thẳng vào output_dir (stitch group_size in 1)"""
        merged_files = []
        for group_idx, i in enumerate(range(0, len(image_paths), group_size), 1):
            group = image_paths[i:i + group_size]
            imgs = []
            try:
                for p in group:
                    im = Image.open(p)
                    if im.mode != 'RGB':
                        im = im.convert('RGB')
                    imgs.append(im)
                if not imgs:
                    continue
                max_w = max(im.width for im in imgs)
                resized = []
                total_h = 0
                for im in imgs:
                    if im.width != max_w:
                        new_h = int(im.height * (max_w / im.width))
                        im_res = im.resize((max_w, new_h), Image.Resampling.LANCZOS)
                        resized.append(im_res)
                        total_h += new_h
                    else:
                        resized.append(im)
                        total_h += im.height
                combined = Image.new('RGB', (max_w, total_h), (255, 255, 255))
                curr_y = 0
                for im in resized:
                    combined.paste(im, (0, curr_y))
                    curr_y += im.height
                chunk_file = output_dir / f"{group_idx:03d}.webp"
                combined.save(chunk_file, 'WEBP', quality=90, method=6)
                merged_files.append(chunk_file)

                # Dọn dẹp tài nguyên bộ nhớ
                for im in imgs:
                    im.close()
                for im in resized:
                    if im not in imgs:
                        im.close()
                combined.close()
            except Exception:
                pass
        return merged_files

    def _download_worker(self):
        info = self.comic_info
        title = info["title"]
        slug = info["slug"]
        all_chaps = info["chapters"]
        out_root = Path(self.save_entry.get())

        safe_title = re.sub(r'[\\/*?:"<>|]', "", title).replace(" ", "_")
        comic_dir = out_root / safe_title
        comic_dir.mkdir(parents=True, exist_ok=True)

        # Filter chapters
        if self.mode_var.get() == "range":
            try:
                start_c = float(self.start_chap_entry.get() or 1)
                end_c = float(self.end_chap_entry.get() or 9999)
                target_chaps = [c for c in all_chaps if start_c <= c["number"] <= end_c]
            except Exception:
                target_chaps = all_chaps
        else:
            target_chaps = all_chaps

        if not target_chaps:
            self.after(0, lambda: self.log("❌ Không có chapter nào được chọn!"))
            self.after(0, self._on_download_finished)
            return

        workers = int(self.slider_threads.get())
        make_pdf = self.cb_pdf.get() == 1
        merge_slices = self.cb_merge.get() == 1
        upload_to_web = self.cb_upload_web.get() == 1

        self.after(0, lambda: self.log(f"=========================================="))
        self.after(0, lambda: self.log(f"🚀 Bắt đầu tải {len(target_chaps)} chương ({workers} luồng)..."))
        self.after(0, lambda: self.log(f"📂 Thư mục máy: {comic_dir}"))
        self.after(0, lambda: self.log(f"🖼 Định dạng ảnh: WebP (Chất lượng 90)"))
        if upload_to_web:
            self.after(0, lambda: self.log(f"🌐 Chế độ: Tự động đưa lên Website sau khi tải"))

        # Tải & đưa ảnh bìa lên Cloud nếu cần
        cover_cdn_url = None
        if info.get("cover_url"):
            raw_cover_path = comic_dir / "cover_raw.jpg"
            cover_path = comic_dir / "cover.webp"
            self._download_img(info["cover_url"], raw_cover_path, self.url_entry.get())
            if raw_cover_path.exists():
                try:
                    with Image.open(raw_cover_path) as im:
                        if im.mode != 'RGB':
                            im = im.convert('RGB')
                        im.save(cover_path, 'WEBP', quality=90, method=6)
                    raw_cover_path.unlink(missing_ok=True)
                except Exception:
                    cover_path = raw_cover_path

            if upload_to_web and cover_path.exists():
                try:
                    cover_cdn_url = upload_file_to_cloud(cover_path, f"covers/{slug}.webp", "image/webp")
                    self.after(0, lambda u=cover_cdn_url: self.log(f"📸 Đã đưa Ảnh bìa (WebP) lên Cloud: {u}"))
                except Exception as e:
                    self.after(0, lambda err=e: self.log(f"⚠️ Lỗi upload ảnh bìa: {err}"))

        total_images_all = 0
        start_time = time.time()

        for idx, chap in enumerate(target_chaps, 1):
            if self.cancel_requested:
                self.after(0, lambda: self.log("⛔ Đã hủy quá trình tải!"))
                break

            num = chap["number"]
            num_str = f"{int(num)}" if num.is_integer() else f"{num}"
            chap_title = f"Chương {num_str}"
            chap_dir = comic_dir / f"Chapter_{num_str}"
            chap_dir.mkdir(parents=True, exist_ok=True)

            self.after(0, lambda t=chap_title, i=idx, tot=len(target_chaps): self.lbl_status.configure(
                text=f"Đang xử lý [{i}/{tot}] {t}..."
            ))
            self.after(0, lambda t=chap_title: self.log(f"\n▶ Đang tải {t}..."))

            images = self._get_chapter_images(chap["url"], slug)
            if not images:
                self.after(0, lambda t=chap_title: self.log(f"  ⚠️ Không tìm thấy ảnh cho {t}"))
                continue

            num_raw = len(images)
            should_merge = merge_slices or (num_raw > AUTO_STITCH_THRESHOLD)

            # Thư mục lưu tạm lát cắt nếu cần ghép ảnh
            if should_merge:
                temp_dir = chap_dir / "_temp_slices"
                temp_dir.mkdir(parents=True, exist_ok=True)
                download_dir = temp_dir
            else:
                download_dir = chap_dir

            downloaded = []
            with ThreadPoolExecutor(max_workers=workers) as executor:
                futures = {}
                for i, img_url in enumerate(images):
                    if self.cancel_requested:
                        break
                    ext = img_url.split(".")[-1].split("?")[0]
                    save_p = download_dir / f"raw_{i+1:04d}.{ext}" if should_merge else download_dir / f"raw_{i+1:03d}.{ext}"
                    downloaded.append(save_p)
                    f = executor.submit(self._download_img, img_url, save_p, chap["url"])
                    futures[f] = save_p

                done_count = 0
                for f in as_completed(futures):
                    if self.cancel_requested:
                        break
                    f.result()
                    done_count += 1
                    prog = (idx - 1 + (done_count / len(images))) / len(target_chaps)
                    self.after(0, lambda p=prog, dc=done_count, tc=len(images), ct=chap_title: (
                        self.progress_bar.set(p),
                        self.lbl_status.configure(text=f"{ct}: {dc}/{tc} ảnh ({int(p*100)}%)")
                    ))

            valid_paths = [p for p in downloaded if p.exists()]
            num_downloaded = len(valid_paths)

            final_paths = []
            if should_merge:
                reason = f"Chapter có {num_downloaded} lát cắt (> {AUTO_STITCH_THRESHOLD})" if num_downloaded > AUTO_STITCH_THRESHOLD else "Tùy chọn ghép ảnh được bật"
                self.after(0, lambda r=reason: self.log(f"  🧩 {r} ➜ Đang ghép trực tiếp {STITCH_GROUP_SIZE} in 1 (WebP)..."))
                
                final_paths = self._merge_images(valid_paths, chap_dir, STITCH_GROUP_SIZE)
                
                # Xóa các lát cắt thô tạm thời để tránh làm rác thư mục
                for p in valid_paths:
                    try:
                        p.unlink(missing_ok=True)
                    except Exception:
                        pass
                try:
                    temp_dir.rmdir()
                except Exception:
                    pass

                self.after(0, lambda cnt=len(final_paths), n=num_downloaded, cname=f"Chapter_{num_str}": self.log(
                    f"  ✓ Đã xuất {cnt} trang ảnh WebP hoàn chỉnh vào {cname}/ (đã dọn {n} lát cắt thô)"
                ))
            else:
                final_paths = []
                for idx_p, p in enumerate(valid_paths, 1):
                    webp_path = chap_dir / f"{idx_p:03d}.webp"
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
                self.after(0, lambda t=chap_title, c=len(final_paths): self.log(f"  ✓ Đã tải {c} trang ảnh WebP."))

            total_images_all += len(final_paths)

            if make_pdf:
                self.after(0, lambda: self.log("  📄 Đang tạo file PDF..."))
                pdf_f = comic_dir / f"Chapter_{num_str}.pdf"
                self._export_pdf(final_paths, pdf_f)

            # Tùy chọn Upload lên Cloud Storage & Đồng bộ Web API
            if upload_to_web and final_paths:
                self.after(0, lambda t=chap_title: self.log(f"  ☁️ Đang đưa {t} (WebP) lên Cloud Storage & Website..."))
                uploaded_cdn_urls = [None] * len(final_paths)
                with ThreadPoolExecutor(max_workers=workers) as executor:
                    fut_map = {}
                    for p_idx, p in enumerate(final_paths):
                        obj_name = f"chapters/{slug}/chap{num_str}/page_{p_idx+1:03d}.webp"
                        fut = executor.submit(upload_file_to_cloud, p, obj_name, "image/webp")
                        fut_map[fut] = p_idx
                    for fut in as_completed(fut_map):
                        p_idx = fut_map[fut]
                        try:
                            uploaded_cdn_urls[p_idx] = fut.result()
                        except Exception:
                            pass

                valid_cdn_urls = [u for u in uploaded_cdn_urls if u]
                if valid_cdn_urls:
                    synced = sync_chapter_to_web_api(
                        api_base_url=DEFAULT_API_BASE_URL,
                        comic_title=title,
                        comic_slug=slug,
                        cover_cdn_url=cover_cdn_url or valid_cdn_urls[0],
                        chapter_num=num,
                        chapter_title=chap.get("title", f"Chương {num_str}"),
                        image_urls=valid_cdn_urls,
                        author=info.get("author"),
                        translator_group=info.get("translator_group"),
                        other_names=info.get("other_names"),
                        age_limit=info.get("age_limit")
                    )
                    if synced:
                        self.after(0, lambda t=chap_title, cnt=len(valid_cdn_urls): self.log(
                            f"  🌐 Đã đưa {t} lên Website thành công ({cnt} trang ảnh)!"
                        ))
                    else:
                        self.after(0, lambda t=chap_title, cnt=len(valid_cdn_urls): self.log(
                            f"  ⚠️ Đã upload Cloud {t} ({cnt} ảnh) - Chưa kết nối được Web API ({DEFAULT_API_BASE_URL})"
                        ))

        elapsed = time.time() - start_time
        web_link = f"http://localhost:4200/comic/{slug}"
        self.after(0, lambda: self.progress_bar.set(1.0))
        self.after(0, lambda: self.log(f"\n=========================================="))
        self.after(0, lambda: self.log(f"🎉 HOÀN TẤT! Tải {total_images_all} ảnh trong {elapsed:.1f}s."))
        if upload_to_web:
            self.after(0, lambda: self.log(f"🌐 Link đọc truyện trên Web: {web_link}"))
        self.after(0, lambda: self.lbl_status.configure(text=f"Hoàn tất! {total_images_all} ảnh ({elapsed:.1f}s)"))

        self.after(0, self._on_download_finished)

    def _on_download_finished(self):
        self.is_downloading = False
        self.btn_start.configure(state="normal")
        self.btn_fetch.configure(state="normal")
        self.btn_cancel.configure(state="disabled")


def main():
    app = MangaDownloaderGUI()
    app.mainloop()


if __name__ == "__main__":
    main()

#!/usr/bin/env python3
# -*- coding: utf-8 -*-
"""
=============================================================================
🎨 TruyenKomi Manga Downloader Pro - Modern GUI Application (CustomTkinter)
=============================================================================
Author: TruyenKomi Team
Description: Giao diện đồ họa hiện đại hỗ trợ tải truyện từ ZetTruyen và
             MangaDex (Tiếng Việt), duyệt danh sách MangaDex trực quan,
             tải đa luồng, xuất PDF, ghép ảnh manhwa và đồng bộ Cloud/Web API.
=============================================================================
"""

import sys
import os
import re
import time
import threading
import webbrowser
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

# Import shared modules from zet_downloader
try:
    from zet_downloader import (
        MangaDexDownloader,
        ZetMangaDownloader,
        slugify,
        upload_file_to_cloud,
        sync_chapter_to_web_api,
        parse_date_to_iso,
        DEFAULT_COMIC_URL,
        DEFAULT_API_BASE_URL,
        MANGADEX_API_BASE,
        MANGADEX_UPLOADS_BASE,
        DEFAULT_LANG,
        AUTO_STITCH_THRESHOLD,
        STITCH_GROUP_SIZE,
    )
except ImportError:
    DEFAULT_COMIC_URL = "https://www.zettruyen1.com/truyen-tranh/phuc-thu"
    DEFAULT_API_BASE_URL = os.getenv("API_BASE_URL", "http://localhost:5000/api")
    MANGADEX_API_BASE = "https://api.mangadex.org"
    MANGADEX_UPLOADS_BASE = "https://uploads.mangadex.org"
    DEFAULT_LANG = "vi"
    AUTO_STITCH_THRESHOLD = 70
    STITCH_GROUP_SIZE = 5

# Set CustomTkinter Theme
ctk.set_appearance_mode("Dark")
ctk.set_default_color_theme("blue")


class MangaDexBatchConfigDialog(ctk.CTkToplevel):
    """Cửa sổ cấu hình tải hàng loạt toàn bộ truyện MangaDex từ cũ nhất đến mới nhất"""
    def __init__(self, parent, default_save_dir: str, default_api_url: str, on_start_callback):
        super().__init__(parent)
        self.title("⚡ Tải Toàn Bộ Truyện MangaDex (Cũ Nhất ➜ Mới Nhất)")
        self.geometry("650x720")
        self.minsize(580, 640)
        self.resizable(False, False)
        self.default_save_dir = default_save_dir
        self.default_api_url = default_api_url
        self.on_start_callback = on_start_callback

        self.transient(parent)
        self.grab_set()

        self._setup_dialog_ui()

    def _setup_dialog_ui(self):
        self.grid_columnconfigure(0, weight=1)
        self.grid_rowconfigure(1, weight=1)

        # Header Frame
        hdr = ctk.CTkFrame(self, fg_color="#131722", corner_radius=0)
        hdr.grid(row=0, column=0, sticky="ew", padx=0, pady=0)
        
        t_lbl = ctk.CTkLabel(
            hdr, 
            text="📥 Tải Hàng Loạt Toàn Bộ MangaDex", 
            font=ctk.CTkFont(size=20, weight="bold"),
            text_color="#f59e0b"
        )
        t_lbl.pack(anchor="w", padx=20, pady=(15, 2))

        sub_lbl = ctk.CTkLabel(
            hdr,
            text="Tự động tải toàn bộ ~6.600+ truyện Tiếng Việt từ MangaDex theo thứ tự từ Cũ Nhất đến Mới Nhất.\nHỗ trợ đa luồng, chuyển đổi WebP, ghép ảnh manhwa, tạo PDF và tự động đồng bộ Web.",
            font=ctk.CTkFont(size=12),
            text_color="#94a3b8",
            justify="left"
        )
        sub_lbl.pack(anchor="w", padx=20, pady=(0, 15))

        # Body Scrollable Frame
        body = ctk.CTkScrollableFrame(self, fg_color="#18202f", corner_radius=10)
        body.grid(row=1, column=0, sticky="nsew", padx=15, pady=10)
        body.grid_columnconfigure(1, weight=1)

        # 1. Thứ tự tải (Order)
        ctk.CTkLabel(body, text="🎯 Thứ tự tải:", font=ctk.CTkFont(weight="bold"), text_color="#38bdf8").grid(row=0, column=0, padx=10, pady=(10, 4), sticky="w")
        self.order_var = ctk.StringVar(value="oldest")
        
        order_box = ctk.CTkFrame(body, fg_color="transparent")
        order_box.grid(row=0, column=1, padx=10, pady=(10, 4), sticky="w")
        
        ctk.CTkRadioButton(order_box, text="⏳ Cũ nhất ➜ Mới nhất (order[createdAt]=asc) [Khuyên dùng]", variable=self.order_var, value="oldest").pack(anchor="w", pady=2)
        ctk.CTkRadioButton(order_box, text="🔄 Mới cập nhật nhất (order[latestUploadedChapter]=desc)", variable=self.order_var, value="latest").pack(anchor="w", pady=2)

        # 2. Vị trí bắt đầu & Giới hạn
        ctk.CTkLabel(body, text="🔢 Bắt đầu từ truyện #:", font=ctk.CTkFont(weight="bold")).grid(row=1, column=0, padx=10, pady=6, sticky="w")
        self.start_idx_entry = ctk.CTkEntry(body, width=120, placeholder_text="1")
        self.start_idx_entry.insert(0, "1")
        self.start_idx_entry.grid(row=1, column=1, padx=10, pady=6, sticky="w")

        ctk.CTkLabel(body, text="📊 Giới hạn số truyện:", font=ctk.CTkFont(weight="bold")).grid(row=2, column=0, padx=10, pady=6, sticky="w")
        max_box = ctk.CTkFrame(body, fg_color="transparent")
        max_box.grid(row=2, column=1, padx=10, pady=6, sticky="w")
        self.max_manga_entry = ctk.CTkEntry(max_box, width=100, placeholder_text="0 (Tất cả)")
        self.max_manga_entry.insert(0, "0")
        self.max_manga_entry.pack(side="left", padx=(0, 10))
        ctk.CTkLabel(max_box, text="(0 = Tải TẤT CẢ ~6.600 bộ)", font=ctk.CTkFont(size=11), text_color="#94a3b8").pack(side="left")

        # 3. Thư mục lưu
        ctk.CTkLabel(body, text="📂 Thư mục lưu máy:", font=ctk.CTkFont(weight="bold")).grid(row=3, column=0, padx=10, pady=6, sticky="w")
        save_box = ctk.CTkFrame(body, fg_color="transparent")
        save_box.grid(row=3, column=1, padx=10, pady=6, sticky="ew")
        save_box.grid_columnconfigure(0, weight=1)

        self.save_dir_entry = ctk.CTkEntry(save_box)
        self.save_dir_entry.insert(0, self.default_save_dir)
        self.save_dir_entry.grid(row=0, column=0, padx=(0, 5), sticky="ew")

        ctk.CTkButton(save_box, text="Chọn", width=60, command=self._browse_save_folder, fg_color="#334155").grid(row=0, column=1)

        # 4. Tùy chọn xử lý & Tải lên
        ctk.CTkLabel(body, text="⚙️ Tùy chọn xử lý:", font=ctk.CTkFont(weight="bold"), text_color="#38bdf8").grid(row=4, column=0, padx=10, pady=(12, 4), sticky="w")

        opts_frame = ctk.CTkFrame(body, fg_color="#0f172a", corner_radius=6)
        opts_frame.grid(row=5, column=0, columnspan=2, padx=10, pady=4, sticky="ew")

        self.cb_upload_web = ctk.CTkCheckBox(opts_frame, text="🌐 Tự động tải lên Cloud Storage & Đồng bộ Web API", fg_color="#0284c7")
        self.cb_upload_web.select()
        self.cb_upload_web.pack(anchor="w", padx=12, pady=(10, 4))

        self.cb_skip_existing = ctk.CTkCheckBox(opts_frame, text="⏭️ Bỏ qua chapter đã có trên máy (Tránh tải trùng / Resume)", fg_color="#0284c7")
        self.cb_skip_existing.select()
        self.cb_skip_existing.pack(anchor="w", padx=12, pady=4)

        self.cb_data_saver = ctk.CTkCheckBox(opts_frame, text="⚡ MangaDex Data-Saver (Tải ảnh nén nhẹ tiết kiệm mạng)", fg_color="#0284c7")
        self.cb_data_saver.pack(anchor="w", padx=12, pady=4)

        self.cb_merge = ctk.CTkCheckBox(opts_frame, text="🧩 Ghép ảnh Manhwa 5-in-1 (Tự động khi chapter > 70 ảnh)", fg_color="#0284c7")
        self.cb_merge.pack(anchor="w", padx=12, pady=4)

        self.cb_pdf = ctk.CTkCheckBox(opts_frame, text="📄 Tự động xuất mỗi chapter thành file PDF", fg_color="#0284c7")
        self.cb_pdf.pack(anchor="w", padx=12, pady=(4, 10))

        # 5. Luồng tải
        ctk.CTkLabel(body, text="⚡ Luồng tải song song:", font=ctk.CTkFont(weight="bold")).grid(row=6, column=0, padx=10, pady=(10, 4), sticky="w")
        thread_box = ctk.CTkFrame(body, fg_color="transparent")
        thread_box.grid(row=6, column=1, padx=10, pady=(10, 4), sticky="ew")
        thread_box.grid_columnconfigure(0, weight=1)

        self.lbl_threads_dialog = ctk.CTkLabel(thread_box, text="16 luồng")
        self.slider_threads_dialog = ctk.CTkSlider(
            thread_box, from_=4, to=32, number_of_steps=7,
            command=lambda v: self.lbl_threads_dialog.configure(text=f"{int(v)} luồng")
        )
        self.slider_threads_dialog.set(16)
        self.slider_threads_dialog.grid(row=0, column=0, sticky="ew", padx=(0, 10))
        self.lbl_threads_dialog.grid(row=0, column=1)

        # Bottom Buttons
        btn_bar = ctk.CTkFrame(self, fg_color="#131722", corner_radius=0)
        btn_bar.grid(row=2, column=0, sticky="ew", padx=0, pady=0)

        ctk.CTkButton(
            btn_bar,
            text="❌ Hủy / Đóng",
            command=self.destroy,
            fg_color="#334155",
            hover_color="#475569",
            width=120,
            height=36
        ).pack(side="right", padx=(5, 20), pady=12)

        ctk.CTkButton(
            btn_bar,
            text="🚀 Bắt Đầu Tải Hàng Loạt",
            command=self._on_start_clicked,
            fg_color="#10b981",
            hover_color="#059669",
            font=ctk.CTkFont(size=13, weight="bold"),
            width=220,
            height=36
        ).pack(side="right", padx=5, pady=12)

    def _browse_save_folder(self):
        f = filedialog.askdirectory(initialdir=self.save_dir_entry.get())
        if f:
            self.save_dir_entry.delete(0, "end")
            self.save_dir_entry.insert(0, f)

    def _on_start_clicked(self):
        try:
            start_idx = max(1, int(self.start_idx_entry.get() or 1))
        except ValueError:
            start_idx = 1

        try:
            max_manga = int(self.max_manga_entry.get() or 0)
            if max_manga <= 0:
                max_manga = None
        except ValueError:
            max_manga = None

        config = {
            "order": self.order_var.get(),
            "start_offset": start_idx - 1,
            "max_manga": max_manga,
            "save_dir": self.save_dir_entry.get().strip(),
            "upload_to_web": self.cb_upload_web.get() == 1,
            "skip_existing": self.cb_skip_existing.get() == 1,
            "data_saver": self.cb_data_saver.get() == 1,
            "merge_slices": self.cb_merge.get() == 1,
            "make_pdf": self.cb_pdf.get() == 1,
            "workers": int(self.slider_threads_dialog.get())
        }
        self.destroy()
        self.on_start_callback(config)


class MangaDownloaderGUI(ctk.CTk):
    def __init__(self):
        super().__init__()

        self.title("⚡ TruyenKomi Manga Downloader Pro (ZetTruyen & MangaDex)")
        self.geometry("1100x840")
        self.minsize(950, 700)

        # App state
        self.downloader_instance = None
        self.comic_info = None
        self.is_downloading = False
        self.cancel_requested = False
        self.current_mangadex_page = 1
        self.total_mangadex_pages = 1
        self.mangadex_search_query = None
        self.mangadex_sort_order = "latest"
        self.is_fetching_mangadex_list = False

        self._setup_ui()

    def _setup_ui(self):
        self.grid_columnconfigure(0, weight=1)
        self.grid_rowconfigure(1, weight=1)

        # ---------------- 1. TOP HEADER ----------------
        header_frame = ctk.CTkFrame(self, corner_radius=10, fg_color="#131722")
        header_frame.grid(row=0, column=0, padx=15, pady=(12, 6), sticky="ew")
        header_frame.grid_columnconfigure(0, weight=1)

        title_box = ctk.CTkFrame(header_frame, fg_color="transparent")
        title_box.pack(side="left", padx=20, pady=10)

        title_lbl = ctk.CTkLabel(
            title_box,
            text="🚀 TruyenKomi Manga Downloader Pro",
            font=ctk.CTkFont(size=22, weight="bold"),
            text_color="#38bdf8"
        )
        title_lbl.pack(anchor="w", pady=(0, 2))

        sub_lbl = ctk.CTkLabel(
            title_box,
            text="Tải truyện siêu tốc từ ZetTruyen & MangaDex (Tiếng Việt) • Đa luồng • Xuất PDF • Ghép ảnh Manhwa • Đồng bộ Cloud & Website",
            font=ctk.CTkFont(size=12),
            text_color="#94a3b8"
        )
        sub_lbl.pack(anchor="w")

        # Quick Batch Download Button in Header
        self.btn_header_batch = ctk.CTkButton(
            header_frame,
            text="⚡ Tải Toàn Bộ MangaDex (Cũ ➜ Mới)",
            command=self.open_mangadex_batch_dialog,
            fg_color="#d97706",
            hover_color="#b45309",
            font=ctk.CTkFont(size=13, weight="bold"),
            height=36,
            width=270
        )
        self.btn_header_batch.pack(side="right", padx=20, pady=10)

        # ---------------- 2. TAB VIEW (DOWNLOADER / MANGADEX BROWSER) ----------------
        self.tabview = ctk.CTkTabview(self, corner_radius=10)
        self.tabview.grid(row=1, column=0, padx=15, pady=(0, 10), sticky="nsew")

        self.tab_download = self.tabview.add("⚡ Tải Theo Link / ID")
        self.tab_mangadex = self.tabview.add("📚 Duyệt & Tìm Kiếm MangaDex (Tiếng Việt)")

        self._setup_tab_download()
        self._setup_tab_mangadex()

    # =========================================================================
    # TAB 1: DOWNLOAD BY DIRECT LINK / ID
    # =========================================================================
    def _setup_tab_download(self):
        tab = self.tab_download
        tab.grid_columnconfigure(0, weight=1)
        tab.grid_rowconfigure(1, weight=1)

        # Top Controls: URL & Directory
        input_card = ctk.CTkFrame(tab, corner_radius=8, fg_color="#18202f")
        input_card.grid(row=0, column=0, padx=5, pady=(5, 8), sticky="ew")
        input_card.grid_columnconfigure(1, weight=1)

        # Row 0: URL
        ctk.CTkLabel(input_card, text="🔗 URL / ID Truyện:", font=ctk.CTkFont(weight="bold")).grid(row=0, column=0, padx=12, pady=(10, 4), sticky="w")
        
        self.url_entry = ctk.CTkEntry(
            input_card, 
            placeholder_text="Nhập URL truyện (ZetTruyen, MangaDex, hoặc MangaDex UUID)"
        )
        self.url_entry.insert(0, DEFAULT_COMIC_URL)
        self.url_entry.grid(row=0, column=1, padx=(0, 8), pady=(10, 4), sticky="ew")
        self.url_entry.bind("<KeyRelease>", self._on_url_changed)

        self.btn_fetch = ctk.CTkButton(
            input_card,
            text="🔍 Lấy Thông Tin",
            command=self.fetch_comic_info_thread,
            fg_color="#0284c7",
            hover_color="#0369a1",
            width=130,
            font=ctk.CTkFont(weight="bold")
        )
        self.btn_fetch.grid(row=0, column=2, padx=(0, 12), pady=(10, 4))

        # Row 1: Source detection & Save path
        ctk.CTkLabel(input_card, text="📂 Lưu vào:", font=ctk.CTkFont(weight="bold")).grid(row=1, column=0, padx=12, pady=4, sticky="w")
        
        default_save_path = str((Path.cwd() / "downloads").resolve())
        self.save_entry = ctk.CTkEntry(input_card)
        self.save_entry.insert(0, default_save_path)
        self.save_entry.grid(row=1, column=1, padx=(0, 8), pady=4, sticky="ew")

        self.btn_browse = ctk.CTkButton(
            input_card,
            text="📁 Chọn Thư Mục",
            command=self.browse_folder,
            fg_color="#334155",
            hover_color="#475569",
            width=130
        )
        self.btn_browse.grid(row=1, column=2, padx=(0, 12), pady=4)

        # Row 2: Options bar (Source tag, Language, Data Saver)
        opt_bar = ctk.CTkFrame(input_card, fg_color="transparent")
        opt_bar.grid(row=2, column=0, columnspan=3, padx=12, pady=(4, 10), sticky="ew")

        self.lbl_source_detected = ctk.CTkLabel(
            opt_bar, 
            text="🏷️ Nguồn: Tự động nhận diện (ZetTruyen)", 
            font=ctk.CTkFont(size=12, weight="bold"),
            text_color="#38bdf8"
        )
        self.lbl_source_detected.pack(side="left", padx=(0, 15))

        ctk.CTkLabel(opt_bar, text="Ngôn ngữ dịch:").pack(side="left", padx=(0, 4))
        self.lang_menu = ctk.CTkOptionMenu(
            opt_bar, 
            values=["vi (Tiếng Việt)", "en (English)", "ja (Japanese)", "all (Tất cả)"],
            width=130,
            fg_color="#1e293b"
        )
        self.lang_menu.set("vi (Tiếng Việt)")
        self.lang_menu.pack(side="left", padx=(0, 15))

        self.cb_data_saver = ctk.CTkCheckBox(opt_bar, text="⚡ MangaDex Data-Saver (Ảnh nén nhẹ)", fg_color="#0284c7")
        self.cb_data_saver.pack(side="left", padx=5)

        # Main Layout: Left panel (Options) + Right panel (Logs)
        main_split = ctk.CTkFrame(tab, fg_color="transparent")
        main_split.grid(row=1, column=0, padx=0, pady=0, sticky="nsew")
        main_split.grid_columnconfigure(0, weight=4)
        main_split.grid_columnconfigure(1, weight=5)
        main_split.grid_rowconfigure(0, weight=1)

        # --- LEFT PANEL: Comic details & Options ---
        left_card = ctk.CTkScrollableFrame(main_split, corner_radius=8, fg_color="#18202f")
        left_card.grid(row=0, column=0, padx=(0, 6), pady=0, sticky="nsew")
        left_card.grid_columnconfigure(1, weight=1)

        # Comic Metadata Preview
        self.lbl_comic_title = ctk.CTkLabel(left_card, text="📖 Tên truyện: (Chưa tải dữ liệu)", font=ctk.CTkFont(size=14, weight="bold"), text_color="#38bdf8", wraplength=340, justify="left")
        self.lbl_comic_title.grid(row=0, column=0, columnspan=2, padx=12, pady=(10, 3), sticky="w")

        self.lbl_comic_stats = ctk.CTkLabel(left_card, text="📚 Tổng số chương: 0 chương", font=ctk.CTkFont(size=12), text_color="#cbd5e1", wraplength=340, justify="left")
        self.lbl_comic_stats.grid(row=1, column=0, columnspan=2, padx=12, pady=(0, 8), sticky="w")

        # Range Options
        ctk.CTkLabel(left_card, text="🎯 Chế độ tải:", font=ctk.CTkFont(weight="bold")).grid(row=2, column=0, padx=12, pady=4, sticky="w")
        
        self.mode_var = ctk.StringVar(value="all")
        self.radio_all = ctk.CTkRadioButton(left_card, text="Tất cả các chương", variable=self.mode_var, value="all", command=self._toggle_mode)
        self.radio_all.grid(row=2, column=1, padx=8, pady=4, sticky="w")

        self.radio_range = ctk.CTkRadioButton(left_card, text="Theo khoảng chương", variable=self.mode_var, value="range", command=self._toggle_mode)
        self.radio_range.grid(row=3, column=1, padx=8, pady=4, sticky="w")

        # Range inputs
        range_frame = ctk.CTkFrame(left_card, fg_color="transparent")
        range_frame.grid(row=4, column=0, columnspan=2, padx=12, pady=4, sticky="w")

        ctk.CTkLabel(range_frame, text="Từ chương:").pack(side="left", padx=(0, 4))
        self.start_chap_entry = ctk.CTkEntry(range_frame, width=65, placeholder_text="1")
        self.start_chap_entry.pack(side="left", padx=4)

        ctk.CTkLabel(range_frame, text="Đến chương:").pack(side="left", padx=(8, 4))
        self.end_chap_entry = ctk.CTkEntry(range_frame, width=65, placeholder_text="10")
        self.end_chap_entry.pack(side="left", padx=4)

        # Advanced Checkboxes
        ctk.CTkLabel(left_card, text="⚙️ Tùy chọn nâng cao:", font=ctk.CTkFont(weight="bold")).grid(row=5, column=0, columnspan=2, padx=12, pady=(10, 4), sticky="w")

        self.cb_pdf = ctk.CTkCheckBox(left_card, text="📄 Tự động xuất mỗi chương thành file PDF", fg_color="#0284c7")
        self.cb_pdf.grid(row=6, column=0, columnspan=2, padx=12, pady=3, sticky="w")

        self.cb_merge = ctk.CTkCheckBox(left_card, text="🧩 Ghép ảnh Manhwa (5-in-1, tự động khi > 70 ảnh)", fg_color="#0284c7")
        self.cb_merge.grid(row=7, column=0, columnspan=2, padx=12, pady=3, sticky="w")

        self.cb_upload_web = ctk.CTkCheckBox(left_card, text="🌐 Tự động đồng bộ lên Website & Cloud Storage", fg_color="#0284c7")
        self.cb_upload_web.select()
        self.cb_upload_web.grid(row=8, column=0, columnspan=2, padx=12, pady=3, sticky="w")

        # Threads slider
        thread_frame = ctk.CTkFrame(left_card, fg_color="transparent")
        thread_frame.grid(row=9, column=0, columnspan=2, padx=12, pady=8, sticky="ew")
        
        self.lbl_threads = ctk.CTkLabel(thread_frame, text="⚡ Luồng tải song song: 16 luồng")
        self.lbl_threads.pack(anchor="w")

        self.slider_threads = ctk.CTkSlider(thread_frame, from_=4, to=32, number_of_steps=7, command=self._update_threads_label)
        self.slider_threads.set(16)
        self.slider_threads.pack(fill="x", pady=4)

        # Cover Preview Frame
        self.cover_label = ctk.CTkLabel(left_card, text="[ Chưa có ảnh bìa ]", width=120, height=160, fg_color="#0f172a", corner_radius=6)
        self.cover_label.grid(row=10, column=0, columnspan=2, padx=12, pady=(5, 10))

        # --- RIGHT PANEL: Logs ---
        right_card = ctk.CTkFrame(main_split, corner_radius=8, fg_color="#18202f")
        right_card.grid(row=0, column=1, padx=(6, 0), pady=0, sticky="nsew")
        right_card.grid_rowconfigure(1, weight=1)
        right_card.grid_columnconfigure(0, weight=1)

        ctk.CTkLabel(right_card, text="📋 Nhật Ký Tải Truyện (Live Logs):", font=ctk.CTkFont(weight="bold")).grid(row=0, column=0, padx=12, pady=(8, 4), sticky="w")

        self.log_box = ctk.CTkTextbox(right_card, font=ctk.CTkFont(family="Consolas", size=12), fg_color="#090d16", text_color="#38bdf8")
        self.log_box.grid(row=1, column=0, padx=12, pady=(0, 10), sticky="nsew")

        # Bottom Progress & Action Bar
        bottom_frame = ctk.CTkFrame(tab, corner_radius=8, fg_color="#18202f")
        bottom_frame.grid(row=2, column=0, padx=5, pady=(8, 5), sticky="ew")
        bottom_frame.grid_columnconfigure(0, weight=1)

        self.progress_bar = ctk.CTkProgressBar(bottom_frame, height=12, fg_color="#0f172a", progress_color="#38bdf8")
        self.progress_bar.set(0)
        self.progress_bar.grid(row=0, column=0, columnspan=3, padx=15, pady=(10, 4), sticky="ew")

        self.lbl_status = ctk.CTkLabel(bottom_frame, text="Sẵn sàng...", font=ctk.CTkFont(size=12), text_color="#94a3b8")
        self.lbl_status.grid(row=1, column=0, padx=15, pady=(0, 8), sticky="w")

        btn_frame = ctk.CTkFrame(bottom_frame, fg_color="transparent")
        btn_frame.grid(row=1, column=2, padx=15, pady=(0, 8), sticky="e")

        self.btn_open_folder = ctk.CTkButton(
            btn_frame,
            text="📂 Mở Thư Mục",
            command=self.open_output_folder,
            fg_color="#334155",
            hover_color="#475569",
            width=115
        )
        self.btn_open_folder.pack(side="left", padx=4)

        self.btn_start = ctk.CTkButton(
            btn_frame,
            text="🚀 Bắt Đầu Tải",
            command=self.start_download_thread,
            fg_color="#10b981",
            hover_color="#059669",
            font=ctk.CTkFont(size=13, weight="bold"),
            width=135
        )
        self.btn_start.pack(side="left", padx=4)

        self.btn_cancel = ctk.CTkButton(
            btn_frame,
            text="⛔ Dừng Lại",
            command=self.cancel_download,
            fg_color="#ef4444",
            hover_color="#dc2626",
            width=90,
            state="disabled"
        )
        self.btn_cancel.pack(side="left", padx=4)

        self._toggle_mode()
        self.log("🚀 TruyenKomi Manga Downloader sẵn sàng!\nHỗ trợ tải từ ZetTruyen và MangaDex (Tiếng Việt).")

    # =========================================================================
    # TAB 2: MANGADEX BROWSER & SEARCH
    # =========================================================================
    def _setup_tab_mangadex(self):
        tab = self.tab_mangadex
        tab.grid_columnconfigure(0, weight=1)
        tab.grid_rowconfigure(1, weight=1)

        # Search Bar
        search_card = ctk.CTkFrame(tab, corner_radius=8, fg_color="#18202f")
        search_card.grid(row=0, column=0, padx=5, pady=(5, 8), sticky="ew")
        search_card.grid_columnconfigure(0, weight=1)

        top_search_row = ctk.CTkFrame(search_card, fg_color="transparent")
        top_search_row.pack(fill="x", padx=10, pady=(8, 4))
        top_search_row.grid_columnconfigure(0, weight=1)

        self.dex_search_entry = ctk.CTkEntry(
            top_search_row, 
            placeholder_text="Nhập từ khóa tìm truyện Tiếng Việt trên MangaDex (VD: Solo Leveling, Akuyaku...)"
        )
        self.dex_search_entry.grid(row=0, column=0, padx=(0, 8), sticky="ew")
        self.dex_search_entry.bind("<Return>", lambda e: self.search_mangadex_action())

        self.btn_dex_search = ctk.CTkButton(
            top_search_row,
            text="🔍 Tìm Kiếm",
            command=self.search_mangadex_action,
            fg_color="#0284c7",
            hover_color="#0369a1",
            width=100
        )
        self.btn_dex_search.grid(row=0, column=1, padx=(0, 6))

        self.dex_sort_menu = ctk.CTkOptionMenu(
            top_search_row,
            values=["🔄 Mới cập nhật", "⏳ Cũ nhất ➜ Mới nhất", "🆕 Mới tạo gần đây"],
            command=self._on_mangadex_sort_changed,
            width=165,
            fg_color="#1e293b"
        )
        self.dex_sort_menu.set("🔄 Mới cập nhật")
        self.dex_sort_menu.grid(row=0, column=2, padx=(0, 6))

        self.btn_dex_refresh = ctk.CTkButton(
            top_search_row,
            text="🔄 Làm Mới",
            command=self.refresh_mangadex_latest,
            fg_color="#334155",
            hover_color="#475569",
            width=90
        )
        self.btn_dex_refresh.grid(row=0, column=3, padx=(0, 6))

        self.btn_dex_download_all = ctk.CTkButton(
            top_search_row,
            text="⚡ Tải Toàn Bộ (Cũ ➜ Mới)",
            command=self.open_mangadex_batch_dialog,
            fg_color="#d97706",
            hover_color="#b45309",
            font=ctk.CTkFont(weight="bold"),
            width=190
        )
        self.btn_dex_download_all.grid(row=0, column=4)

        # Nav & Page Bar
        nav_row = ctk.CTkFrame(search_card, fg_color="transparent")
        nav_row.pack(fill="x", padx=10, pady=(0, 8))

        self.lbl_dex_status = ctk.CTkLabel(
            nav_row,
            text="Danh sách truyện Tiếng Việt mới cập nhật trên MangaDex",
            font=ctk.CTkFont(size=12),
            text_color="#94a3b8"
        )
        self.lbl_dex_status.pack(side="left", padx=5)

        page_btn_frame = ctk.CTkFrame(nav_row, fg_color="transparent")
        page_btn_frame.pack(side="right")

        self.btn_prev_page = ctk.CTkButton(
            page_btn_frame,
            text="◀ Trang Trước",
            command=self.prev_mangadex_page,
            width=90,
            fg_color="#1e293b"
        )
        self.btn_prev_page.pack(side="left", padx=3)

        ctk.CTkLabel(page_btn_frame, text="Trang", font=ctk.CTkFont(size=12, weight="bold")).pack(side="left", padx=(6, 3))

        self.dex_page_entry = ctk.CTkEntry(
            page_btn_frame,
            width=48,
            height=28,
            justify="center",
            font=ctk.CTkFont(size=12, weight="bold")
        )
        self.dex_page_entry.insert(0, "1")
        self.dex_page_entry.pack(side="left", padx=2)
        self.dex_page_entry.bind("<Return>", self.goto_mangadex_page)

        self.lbl_dex_total_pages = ctk.CTkLabel(
            page_btn_frame,
            text="/ 1",
            font=ctk.CTkFont(size=12, weight="bold"),
            text_color="#94a3b8"
        )
        self.lbl_dex_total_pages.pack(side="left", padx=(2, 4))

        self.btn_goto_page = ctk.CTkButton(
            page_btn_frame,
            text="Đi ↵",
            command=self.goto_mangadex_page,
            width=42,
            height=28,
            fg_color="#0284c7",
            hover_color="#0369a1",
            font=ctk.CTkFont(size=11, weight="bold")
        )
        self.btn_goto_page.pack(side="left", padx=(0, 4))

        self.btn_next_page = ctk.CTkButton(
            page_btn_frame,
            text="Trang Sau ▶",
            command=self.next_mangadex_page,
            width=90,
            fg_color="#1e293b"
        )
        self.btn_next_page.pack(side="left", padx=3)

        # Scrollable Comic Cards Container
        self.dex_scroll_frame = ctk.CTkScrollableFrame(tab, corner_radius=8, fg_color="#131722")
        self.dex_scroll_frame.grid(row=1, column=0, padx=5, pady=0, sticky="nsew")
        self.dex_scroll_frame.grid_columnconfigure(0, weight=1)

        # Trigger first MangaDex load
        self.after(500, self.refresh_mangadex_latest)

    # =========================================================================
    # EVENT HANDLERS & HELPERS
    # =========================================================================
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

    def _on_url_changed(self, event=None):
        url = self.url_entry.get().strip()
        is_mangadex = "mangadex.org" in url or re.match(r'^[0-9a-fA-F-]{36}$', url)
        if is_mangadex:
            self.lbl_source_detected.configure(text="🏷️ Nguồn: MangaDex (Tiếng Việt)", text_color="#10b981")
        elif "zettruyen" in url:
            self.lbl_source_detected.configure(text="🏷️ Nguồn: ZetTruyen", text_color="#38bdf8")
        else:
            self.lbl_source_detected.configure(text="🏷️ Nguồn: Tự động nhận diện", text_color="#94a3b8")

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

    # =========================================================================
    # MANGADEX BROWSER LOGIC
    # =========================================================================
    def _on_mangadex_sort_changed(self, choice):
        if "Cũ nhất" in choice:
            self.mangadex_sort_order = "oldest"
        elif "Mới tạo" in choice:
            self.mangadex_sort_order = "newest_created"
        else:
            self.mangadex_sort_order = "latest"
        self.current_mangadex_page = 1
        self.fetch_mangadex_list_thread()

    def search_mangadex_action(self):
        query = self.dex_search_entry.get().strip()
        self.mangadex_search_query = query if query else None
        self.current_mangadex_page = 1
        self.fetch_mangadex_list_thread()

    def refresh_mangadex_latest(self):
        self.dex_search_entry.delete(0, "end")
        self.mangadex_search_query = None
        self.current_mangadex_page = 1
        self.fetch_mangadex_list_thread()

    def goto_mangadex_page(self, event=None):
        try:
            val = self.dex_page_entry.get().strip()
            page = int(val)
            if page < 1:
                page = 1
            if self.total_mangadex_pages and page > self.total_mangadex_pages:
                page = self.total_mangadex_pages
            self.current_mangadex_page = page
            self.fetch_mangadex_list_thread()
        except ValueError:
            self.dex_page_entry.delete(0, "end")
            self.dex_page_entry.insert(0, str(self.current_mangadex_page))

    def prev_mangadex_page(self):
        if self.current_mangadex_page > 1:
            self.current_mangadex_page -= 1
            self.fetch_mangadex_list_thread()

    def next_mangadex_page(self):
        if self.current_mangadex_page < self.total_mangadex_pages:
            self.current_mangadex_page += 1
            self.fetch_mangadex_list_thread()

    def fetch_mangadex_list_thread(self):
        if self.is_fetching_mangadex_list:
            return
        self.is_fetching_mangadex_list = True
        self.btn_dex_search.configure(state="disabled")
        self.btn_dex_refresh.configure(state="disabled")
        self.btn_prev_page.configure(state="disabled")
        self.btn_next_page.configure(state="disabled")
        self.btn_goto_page.configure(state="disabled")
        self.dex_page_entry.delete(0, "end")
        self.dex_page_entry.insert(0, str(self.current_mangadex_page))
        self.lbl_dex_status.configure(text="Đang tải danh sách truyện từ MangaDex...")

        # Clear existing cards
        for widget in self.dex_scroll_frame.winfo_children():
            widget.destroy()

        loading_lbl = ctk.CTkLabel(
            self.dex_scroll_frame, 
            text="⏳ Đang kết nối tới MangaDex API...", 
            font=ctk.CTkFont(size=14)
        )
        loading_lbl.pack(pady=30)

        threading.Thread(target=self._fetch_mangadex_worker, daemon=True).start()

    def _fetch_mangadex_worker(self):
        try:
            res = MangaDexDownloader.search_or_browse_manga(
                query=self.mangadex_search_query,
                page=self.current_mangadex_page,
                limit=12,
                lang="vi",
                only_available=True,
                order_by=getattr(self, 'mangadex_sort_order', 'latest')
            )
            items = res.get("items", [])
            total = res.get("total", 0)
            self.after(0, lambda: self._render_mangadex_results(items, total))
        except Exception as e:
            self.after(0, lambda: self._render_mangadex_error(str(e)))
        finally:
            self.is_fetching_mangadex_list = False
            self.after(0, lambda: (
                self.btn_dex_search.configure(state="normal"),
                self.btn_dex_refresh.configure(state="normal"),
                self.btn_goto_page.configure(state="normal"),
                self.btn_prev_page.configure(state="normal" if self.current_mangadex_page > 1 else "disabled"),
                self.btn_next_page.configure(state="normal" if self.current_mangadex_page < self.total_mangadex_pages else "disabled")
            ))

    def _render_mangadex_results(self, items, total):
        for widget in self.dex_scroll_frame.winfo_children():
            widget.destroy()

        self.total_mangadex_pages = max(1, (total + 11) // 12) if total > 0 else 1
        self.lbl_dex_total_pages.configure(text=f"/ {self.total_mangadex_pages}")
        self.btn_prev_page.configure(state="normal" if self.current_mangadex_page > 1 else "disabled")
        self.btn_next_page.configure(state="normal" if self.current_mangadex_page < self.total_mangadex_pages else "disabled")
        self.btn_goto_page.configure(state="normal")
        self.dex_page_entry.delete(0, "end")
        self.dex_page_entry.insert(0, str(self.current_mangadex_page))

        query_str = f" với từ khóa '{self.mangadex_search_query}'" if self.mangadex_search_query else ""
        self.lbl_dex_status.configure(
            text=f"Tìm thấy {total} bộ truyện Tiếng Việt{query_str} (Trang {self.current_mangadex_page}/{self.total_mangadex_pages})"
        )

        if not items:
            empty_lbl = ctk.CTkLabel(
                self.dex_scroll_frame, 
                text="❌ Không tìm thấy bộ truyện nào phù hợp!",
                font=ctk.CTkFont(size=14, weight="bold"),
                text_color="#ef4444"
            )
            empty_lbl.pack(pady=40)
            return

        for item in items:
            card = ctk.CTkFrame(self.dex_scroll_frame, corner_radius=8, fg_color="#18202f")
            card.pack(fill="x", padx=5, pady=5)
            card.grid_columnconfigure(1, weight=1)

            # Cover Label Placeholder
            cover_lbl = ctk.CTkLabel(card, text="[Ảnh bìa]", width=65, height=90, fg_color="#0f172a", corner_radius=4)
            cover_lbl.grid(row=0, column=0, rowspan=3, padx=10, pady=10)

            # Details
            title_txt = item["title"]
            t_lbl = ctk.CTkLabel(
                card, 
                text=title_txt, 
                font=ctk.CTkFont(size=14, weight="bold"), 
                text_color="#38bdf8",
                anchor="w",
                justify="left",
                wraplength=550
            )
            t_lbl.grid(row=0, column=1, padx=5, pady=(8, 2), sticky="w")

            genres_txt = ", ".join(item["tags"][:4]) if item["tags"] else "Manga"
            meta_txt = f"✍️ Tác giả: {item['author']}  •  🏷️ Thể loại: {genres_txt}"
            m_lbl = ctk.CTkLabel(
                card, 
                text=meta_txt, 
                font=ctk.CTkFont(size=11), 
                text_color="#94a3b8",
                anchor="w",
                justify="left"
            )
            m_lbl.grid(row=1, column=1, padx=5, pady=0, sticky="w")

            id_lbl = ctk.CTkLabel(
                card, 
                text=f"MangaDex ID: {item['id']}", 
                font=ctk.CTkFont(family="Consolas", size=10), 
                text_color="#64748b"
            )
            id_lbl.grid(row=2, column=1, padx=5, pady=(0, 6), sticky="w")

            # Buttons
            btn_box = ctk.CTkFrame(card, fg_color="transparent")
            btn_box.grid(row=0, column=2, rowspan=3, padx=10, pady=10)

            btn_select = ctk.CTkButton(
                btn_box,
                text="📥 Chọn Tải Truyện",
                fg_color="#10b981",
                hover_color="#059669",
                width=130,
                font=ctk.CTkFont(weight="bold"),
                command=lambda m_id=item['id'], m_title=item['title']: self.select_mangadex_comic(m_id, m_title)
            )
            btn_select.pack(pady=3)

            btn_open_web = ctk.CTkButton(
                btn_box,
                text="🌐 Mở MangaDex",
                fg_color="#334155",
                hover_color="#475569",
                width=130,
                command=lambda u=item['url']: webbrowser.open(u)
            )
            btn_open_web.pack(pady=3)

            # Load thumbnail async
            if item.get("cover_url"):
                threading.Thread(
                    target=self._load_async_thumb, 
                    args=(item["cover_url"] + ".256.jpg", cover_lbl), 
                    daemon=True
                ).start()

    def _load_async_thumb(self, img_url, label_widget):
        try:
            r = requests.get(img_url, headers={"User-Agent": "TruyenKomi-Downloader/1.0"}, timeout=10)
            if r.status_code == 200:
                pil_im = Image.open(BytesIO(r.content))
                pil_im.thumbnail((65, 90))
                ctk_im = ctk.CTkImage(light_image=pil_im, dark_image=pil_im, size=pil_im.size)
                self.after(0, lambda: label_widget.configure(image=ctk_im, text=""))
        except Exception:
            pass

    def _render_mangadex_error(self, err_msg):
        for widget in self.dex_scroll_frame.winfo_children():
            widget.destroy()
        err_lbl = ctk.CTkLabel(
            self.dex_scroll_frame,
            text=f"❌ Lỗi kết nối MangaDex API:\n{err_msg}",
            font=ctk.CTkFont(size=13, weight="bold"),
            text_color="#ef4444"
        )
        err_lbl.pack(pady=30)

    def select_mangadex_comic(self, manga_id, manga_title):
        self.url_entry.delete(0, "end")
        self.url_entry.insert(0, f"https://mangadex.org/title/{manga_id}")
        self._on_url_changed()
        self.tabview.set("⚡ Tải Theo Link / ID")
        self.fetch_comic_info_thread()

    # =========================================================================
    # METADATA FETCH ENGINE (ZETTRUYEN & MANGADEX)
    # =========================================================================
    def fetch_comic_info_thread(self):
        url = self.url_entry.get().strip()
        if not url:
            messagebox.showerror("Lỗi", "Vui lòng nhập đường dẫn hoặc ID truyện!")
            return

        self.btn_fetch.configure(state="disabled", text="Đang lấy...")
        self.lbl_status.configure(text="Đang phân tích dữ liệu truyện...")

        threading.Thread(target=self._fetch_comic_info_worker, args=(url,), daemon=True).start()

    def _fetch_comic_info_worker(self, url):
        try:
            self.log(f"\n🔍 Đang phân tích thông tin từ: {url}")
            is_mangadex = "mangadex.org" in url or re.match(r'^[0-9a-fA-F-]{36}$', url)

            # Get selected lang
            lang_choice = self.lang_menu.get().split(" ")[0].strip()
            data_saver = self.cb_data_saver.get() == 1

            if is_mangadex:
                downloader = MangaDexDownloader(
                    manga_id_or_url=url,
                    output_dir=self.save_entry.get(),
                    merge_slices=self.cb_merge.get() == 1,
                    make_pdf=self.cb_pdf.get() == 1,
                    upload_to_web=self.cb_upload_web.get() == 1,
                    api_base_url=DEFAULT_API_BASE_URL,
                    lang=lang_choice if lang_choice != "all" else DEFAULT_LANG,
                    data_saver=data_saver
                )
            else:
                downloader = ZetMangaDownloader(
                    comic_url=url,
                    output_dir=self.save_entry.get(),
                    merge_slices=self.cb_merge.get() == 1,
                    make_pdf=self.cb_pdf.get() == 1,
                    upload_to_web=self.cb_upload_web.get() == 1,
                    api_base_url=DEFAULT_API_BASE_URL
                )

            info = downloader.get_comic_info()
            self.downloader_instance = downloader
            self.comic_info = info

            self.after(0, self._on_fetch_success)

        except Exception as e:
            self.after(0, lambda err=str(e): self._on_fetch_error(err))

    def _on_fetch_success(self):
        info = self.comic_info
        self.btn_fetch.configure(state="normal", text="🔍 Lấy Thông Tin")
        self.lbl_comic_title.configure(text=f"📖 {info['title']}")
        
        src_name = getattr(self.downloader_instance, 'source_name', 'TruyenKomi')
        chapters_count = len(info.get('chapters', []))
        views_txt = f"{info.get('views', 0):,} lượt xem" if info.get('views') else "0 lượt xem"
        genres_txt = ", ".join(info.get('genres', [])[:4]) if info.get('genres') else "Manga"

        self.lbl_comic_stats.configure(
            text=f"🏷️ Nguồn: {src_name}  •  📚 {chapters_count} chương\n✍️ Tác giả: {info.get('author', 'Đang cập nhật')}  •  Nhóm dịch: {info.get('translator_group', 'Đang cập nhật')}\n🏷️ Thể loại: {genres_txt}"
        )
        
        if info.get('chapters'):
            self.start_chap_entry.delete(0, "end")
            first_num = info['chapters'][0]['number']
            self.start_chap_entry.insert(0, str(int(first_num) if isinstance(first_num, float) and first_num.is_integer() else first_num))
            
            self.end_chap_entry.delete(0, "end")
            last_num = info['chapters'][-1]['number']
            self.end_chap_entry.insert(0, str(int(last_num) if isinstance(last_num, float) and last_num.is_integer() else last_num))

        self.lbl_status.configure(text=f"Đã lấy thông tin: {info['title']} ({chapters_count} chương)")
        self.log(f"✓ Đã tìm thấy {chapters_count} chương của '{info['title']}' từ {src_name}.")

        # Load cover preview
        if info.get("cover_url"):
            threading.Thread(target=self._load_cover_thumbnail, args=(info["cover_url"],), daemon=True).start()

    def _load_cover_thumbnail(self, cover_url):
        try:
            r = requests.get(cover_url, headers={"User-Agent": "TruyenKomi-Downloader/1.0"}, timeout=10)
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
        messagebox.showerror("Lỗi", f"Không thể lấy thông tin truyện:\n{err_msg}")

    # =========================================================================
    # DOWNLOAD EXECUTION WORKER
    # =========================================================================
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

    def _download_worker(self):
        info = self.comic_info
        title = info["title"]
        slug = info["slug"]
        all_chaps = info["chapters"]
        out_root = Path(self.save_entry.get())

        # Cấu trúc lưu chuẩn theo bucket: covers/{slug}.webp & chapters/{slug}/chap{num}/page_{idx:03d}.webp
        covers_dir = out_root / "covers"
        covers_dir.mkdir(parents=True, exist_ok=True)
        chapters_root_dir = out_root / "chapters" / slug
        chapters_root_dir.mkdir(parents=True, exist_ok=True)

        # Filter target chapters
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
        downloader = self.downloader_instance

        self.after(0, lambda: self.log(f"\n=========================================="))
        self.after(0, lambda: self.log(f"🚀 Bắt đầu tải {len(target_chaps)} chương ({workers} luồng song song)..."))
        self.after(0, lambda: self.log(f"📂 Thư mục máy: {chapters_root_dir}"))
        self.after(0, lambda: self.log(f"📁 Cấu trúc lưu chuẩn: covers/{slug}.webp & chapters/{slug}/chap<num>/page_001.webp"))
        self.after(0, lambda: self.log(f"🖼 Định dạng ảnh: WebP (Chất lượng 90)"))
        if upload_to_web:
            self.after(0, lambda: self.log(f"🌐 Chế độ: Tự động đưa lên Website & Cloud Storage sau khi tải"))

        # Download and upload cover (covers/{slug}.webp)
        cover_cdn_url = None
        if info.get("cover_url"):
            raw_cover_path = covers_dir / f"{slug}_raw.jpg"
            cover_path = covers_dir / f"{slug}.webp"
            downloader._download_single_image(info["cover_url"], raw_cover_path)
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
                    self.after(0, lambda u=cover_cdn_url: self.log(f"📸 Đã lưu & đưa Ảnh bìa lên Cloud: {u}"))
                except Exception as e:
                    self.after(0, lambda err=e: self.log(f"⚠️ Lỗi upload ảnh bìa: {err}"))

        total_images_all = 0
        start_time = time.time()

        for idx, chap in enumerate(target_chaps, 1):
            if self.cancel_requested:
                self.after(0, lambda: self.log("⛔ Đã hủy quá trình tải!"))
                break

            num = chap["number"]
            num_str = f"{int(num)}" if isinstance(num, (int, float)) and float(num).is_integer() else f"{num}"
            chap_title = f"Chương {num_str}"
            if chap.get("title") and chap["title"] != chap_title:
                chap_title += f" - {chap['title']}"

            chap_dir = chapters_root_dir / f"chap{num_str}"
            chap_dir.mkdir(parents=True, exist_ok=True)

            self.after(0, lambda t=chap_title, i=idx, tot=len(target_chaps): (
                self.lbl_status.configure(text=f"Đang xử lý [{i}/{tot}] {t}..."),
                self.log(f"\n▶ [{i}/{tot}] Đang tải {t}...")
            ))

            images = downloader.get_chapter_images(chap)
            if not images:
                self.after(0, lambda t=chap_title: self.log(f"  ⚠️ Không tìm thấy ảnh cho {t}"))
                continue

            num_raw = len(images)
            should_merge = merge_slices or (num_raw > AUTO_STITCH_THRESHOLD)

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
                    ext = img_url.split(".")[-1].split("?")[0].lower()
                    if ext not in ("jpg", "jpeg", "png", "webp"):
                        ext = "jpg"
                    save_p = download_dir / f"page_raw_{i+1:04d}.{ext}" if should_merge else download_dir / f"page_{i+1:03d}.{ext}"
                    downloaded.append(save_p)
                    f = executor.submit(downloader._download_single_image, img_url, save_p, chap.get("url"))
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
                
                final_paths = downloader._merge_images_vertical(valid_paths, chap_dir, STITCH_GROUP_SIZE)
                
                for p in valid_paths:
                    try:
                        p.unlink(missing_ok=True)
                    except Exception:
                        pass
                try:
                    temp_dir.rmdir()
                except Exception:
                    pass

                self.after(0, lambda cnt=len(final_paths), n=num_downloaded, cname=f"chap{num_str}": self.log(
                    f"  ✓ Đã xuất {cnt} trang ảnh WebP hoàn chỉnh vào chapters/{slug}/{cname}/ (đã dọn {n} lát cắt thô)"
                ))
            else:
                final_paths = []
                for idx_p, p in enumerate(valid_paths, 1):
                    webp_path = chap_dir / f"page_{idx_p:03d}.webp"
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
                self.after(0, lambda t=chap_title, c=len(final_paths): self.log(f"  ✓ Đã tải xong {c} trang ảnh WebP."))

            total_images_all += len(final_paths)

            if make_pdf:
                self.after(0, lambda: self.log("  📄 Đang tạo file PDF..."))
                pdf_f = chap_dir / f"chap{num_str}.pdf"
                downloader._export_pdf(final_paths, pdf_f)

            # Upload to Cloud Storage & Web API
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
                        translator_group=chap.get("scanlation_group") or info.get("translator_group"),
                        other_names=info.get("other_names"),
                        age_limit=info.get("age_limit"),
                        views=chap.get("views", 0),
                        published_at=chap.get("updated_at"),
                        created_at=chap.get("updated_at"),
                        comic_views=info.get("views", 0),
                        comic_created_at=info.get("created_at_iso") or info.get("created_date_str"),
                        comic_updated_at=info.get("updated_at_iso") or info.get("updated_date_str"),
                        categories=info.get("genres", [])
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
        public_domain = os.getenv("PUBLIC_DOMAIN", "https://truyenkomi.com").rstrip("/")
        web_link = f"{public_domain}/comic/{slug}"
        self.after(0, lambda: self.progress_bar.set(1.0))
        self.after(0, lambda: self.log(f"\n=========================================="))
        self.after(0, lambda: self.log(f"🎉 HOÀN TẤT! Đã tải {total_images_all} ảnh trong {elapsed:.1f}s."))
        if upload_to_web:
            self.after(0, lambda: self.log(f"🌐 Link đọc truyện trên Web: {web_link}"))
        self.after(0, lambda: self.lbl_status.configure(text=f"Hoàn tất! {total_images_all} ảnh ({elapsed:.1f}s)"))

        self.after(0, self._on_download_finished)

    # =========================================================================
    # MANGADEX BATCH DOWNLOAD (ALL MANGA FROM OLDEST TO NEWEST)
    # =========================================================================
    def open_mangadex_batch_dialog(self):
        if self.is_downloading:
            messagebox.showwarning("Cảnh báo", "Đang có tiến trình tải hoạt động! Vui lòng dừng lại trước khi bắt đầu tải hàng loạt.")
            return
        MangaDexBatchConfigDialog(
            self,
            default_save_dir=self.save_entry.get(),
            default_api_url=DEFAULT_API_BASE_URL,
            on_start_callback=self.start_batch_mangadex_download
        )

    def start_batch_mangadex_download(self, config: dict):
        if self.is_downloading:
            return
        self.is_downloading = True
        self.cancel_requested = False
        self.btn_start.configure(state="disabled")
        self.btn_fetch.configure(state="disabled")
        self.btn_cancel.configure(state="normal")
        if hasattr(self, 'btn_header_batch'):
            self.btn_header_batch.configure(state="disabled")
        if hasattr(self, 'btn_dex_download_all'):
            self.btn_dex_download_all.configure(state="disabled")

        # Switch to download tab to see live progress and logs
        self.tabview.set("⚡ Tải Theo Link / ID")
        self.progress_bar.set(0)

        threading.Thread(target=self._batch_download_mangadex_worker, args=(config,), daemon=True).start()

    def _batch_download_mangadex_worker(self, config: dict):
        order_key = config.get("order", "oldest")
        order_desc = "Cũ Nhất ➜ Mới Nhất (order[createdAt]=asc)" if order_key == "oldest" else "Mới Cập Nhật Nhất (order[latestUploadedChapter]=desc)"
        start_offset = config.get("start_offset", 0)
        max_manga = config.get("max_manga")
        out_root = Path(config.get("save_dir", self.save_entry.get()))
        upload_to_web = config.get("upload_to_web", True)
        skip_existing = config.get("skip_existing", True)
        data_saver = config.get("data_saver", False)
        merge_slices = config.get("merge_slices", False)
        make_pdf = config.get("make_pdf", False)
        workers = config.get("workers", 16)

        self.after(0, lambda: self.log("\n" + "=" * 70))
        self.after(0, lambda: self.log("🚀 BẮT ĐẦU TIẾN TRÌNH TẢI TOÀN BỘ MANGADEX HÀNG LOẠT"))
        self.after(0, lambda: self.log(f"📋 Thứ tự tải: {order_desc}"))
        self.after(0, lambda: self.log(f"🌐 Ngôn ngữ: Tiếng Việt (vi) | Bắt đầu từ truyện #{start_offset + 1}"))
        self.after(0, lambda: self.log(f"📂 Thư mục lưu: {out_root.resolve()}"))
        self.after(0, lambda: self.log(f"⚡ Luồng tải song song: {workers} luồng"))
        self.after(0, lambda: self.log(f"🌐 Đồng bộ Web & Cloud: {'BẬT' if upload_to_web else 'TẮT'} | ⏭️ Bỏ qua chapter đã có: {'BẬT' if skip_existing else 'TẮT'}"))
        self.after(0, lambda: self.log("=" * 70 + "\n"))

        self.after(0, lambda: self.lbl_status.configure(text="Đang kết nối MangaDex API lấy danh sách truyện..."))

        try:
            manga_gen = MangaDexDownloader.fetch_all_mangadex_manga_iter(
                lang="vi",
                order_by=order_key,
                start_offset=start_offset,
                limit_per_req=100,
                max_manga=max_manga
            )
        except Exception as e:
            self.after(0, lambda err=str(e): self.log(f"❌ Lỗi kết nối lấy danh sách MangaDex: {err}"))
            self.after(0, self._on_download_finished)
            return

        total_processed_comics = 0
        total_downloaded_images = 0
        total_chapters_all = 0
        start_time = time.time()

        for manga_item in manga_gen:
            if self.cancel_requested:
                self.after(0, lambda: self.log("\n⛔ Đã hủy tiến trình tải hàng loạt theo yêu cầu của người dùng!"))
                break

            comic_num = start_offset + total_processed_comics + 1
            tot_str = f" / {manga_item.get('total_available', '?')}" if manga_item.get('total_available') else ""
            m_title = manga_item['title']
            m_id = manga_item['id']

            self.after(0, lambda n=comic_num, tot=tot_str, t=m_title, mid=m_id, a=manga_item.get('author', 'Đang cập nhật'): (
                self.lbl_status.configure(text=f"[{n}{tot}] Đang xử lý: {t}..."),
                self.log(f"\n━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━"),
                self.log(f"▶ [{n}{tot}] 📖 {t}"),
                self.log(f"   MangaDex ID: {mid} | ✍️ Tác giả: {a}")
            ))

            try:
                downloader = MangaDexDownloader(
                    manga_id_or_url=m_id,
                    output_dir=str(out_root),
                    merge_slices=merge_slices,
                    make_pdf=make_pdf,
                    upload_to_web=upload_to_web,
                    api_base_url=DEFAULT_API_BASE_URL,
                    lang="vi",
                    data_saver=data_saver
                )

                info = downloader.get_comic_info()
                chapters = info.get("chapters", [])
                if not chapters:
                    self.after(0, lambda: self.log("   ⚠️ Truyện không có chapter Tiếng Việt hợp lệ -> Bỏ qua."))
                    total_processed_comics += 1
                    continue

                slug = info["slug"]
                covers_dir = out_root / "covers"
                covers_dir.mkdir(parents=True, exist_ok=True)
                chapters_root_dir = out_root / "chapters" / slug
                chapters_root_dir.mkdir(parents=True, exist_ok=True)

                # Cover handling: covers/{slug}.webp
                cover_cdn_url = None
                if info.get("cover_url"):
                    raw_cover_path = covers_dir / f"{slug}_raw.jpg"
                    cover_path = covers_dir / f"{slug}.webp"
                    if not cover_path.exists():
                        downloader._download_single_image(info["cover_url"], raw_cover_path)
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
                            self.after(0, lambda u=cover_cdn_url: self.log(f"   📸 Đã đưa Ảnh bìa (WebP) lên Cloud: {u}"))
                        except Exception as err:
                            self.after(0, lambda e=err: self.log(f"   ⚠️ Lỗi upload ảnh bìa: {e}"))

                self.after(0, lambda cnt=len(chapters): self.log(f"   📚 Có {cnt} chương Tiếng Việt. Bắt đầu tải..."))

                # Download chapters: chapters/{slug}/chap{num}/page_{idx:03d}.webp
                comic_img_count = 0
                for c_idx, chap in enumerate(chapters, 1):
                    if self.cancel_requested:
                        break

                    num = chap["number"]
                    num_str = f"{int(num)}" if isinstance(num, (int, float)) and float(num).is_integer() else f"{num}"
                    chap_title = f"Chương {num_str}"
                    if chap.get("title") and chap["title"] != chap_title:
                        chap_title += f" - {chap['title']}"

                    chap_dir = chapters_root_dir / f"chap{num_str}"

                    # Skip if existing
                    if skip_existing and chap_dir.exists():
                        existing_webp = list(chap_dir.glob("page_*.webp")) or list(chap_dir.glob("*.webp"))
                        if len(existing_webp) >= 1:
                            self.after(0, lambda t=chap_title, c=len(existing_webp): self.log(f"   ⏭️ {t} đã có trên máy ({c} ảnh WebP) ➜ Bỏ qua."))
                            continue

                    chap_dir.mkdir(parents=True, exist_ok=True)
                    self.after(0, lambda t=chap_title, ci=c_idx, ct=len(chapters), cn=comic_num, tot=tot_str: (
                        self.lbl_status.configure(text=f"[{cn}{tot}] [{ci}/{ct}] Đang tải {t}..."),
                        self.log(f"   ▶ [{ci}/{ct}] Đang tải {t}...")
                    ))

                    images = downloader.get_chapter_images(chap)
                    if not images:
                        self.after(0, lambda t=chap_title: self.log(f"     ⚠️ Không tìm thấy ảnh cho {t}"))
                        continue

                    num_raw = len(images)
                    should_merge = merge_slices or (num_raw > AUTO_STITCH_THRESHOLD)

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
                            ext = img_url.split(".")[-1].split("?")[0].lower()
                            if ext not in ("jpg", "jpeg", "png", "webp"):
                                ext = "jpg"
                            save_p = download_dir / f"page_raw_{i+1:04d}.{ext}" if should_merge else download_dir / f"page_{i+1:03d}.{ext}"
                            downloaded.append(save_p)
                            f = executor.submit(downloader._download_single_image, img_url, save_p, chap.get("url"))
                            futures[f] = save_p

                        done_count = 0
                        for f in as_completed(futures):
                            if self.cancel_requested:
                                break
                            f.result()
                            done_count += 1
                            prog = (c_idx - 1 + (done_count / len(images))) / len(chapters)
                            self.after(0, lambda p=prog, dc=done_count, tc=len(images), ct=chap_title: (
                                self.progress_bar.set(p),
                                self.lbl_status.configure(text=f"{ct}: {dc}/{tc} ảnh ({int(p*100)}%)")
                            ))

                    valid_paths = [p for p in downloaded if p.exists()]
                    num_downloaded = len(valid_paths)

                    final_paths = []
                    if should_merge:
                        final_paths = downloader._merge_images_vertical(valid_paths, chap_dir, STITCH_GROUP_SIZE)
                        for p in valid_paths:
                            try: p.unlink(missing_ok=True)
                            except Exception: pass
                        try: temp_dir.rmdir()
                        except Exception: pass
                        self.after(0, lambda cnt=len(final_paths): self.log(f"     🧩 Đã ghép {cnt} ảnh WebP hoàn chỉnh (5-in-1)"))
                    else:
                        for idx_p, p in enumerate(valid_paths, 1):
                            webp_path = chap_dir / f"page_{idx_p:03d}.webp"
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
                        self.after(0, lambda cnt=len(final_paths): self.log(f"     ✓ Đã tải {cnt} trang ảnh WebP."))

                    comic_img_count += len(final_paths)
                    total_downloaded_images += len(final_paths)
                    total_chapters_all += 1

                    if make_pdf:
                        pdf_f = chap_dir / f"chap{num_str}.pdf"
                        downloader._export_pdf(final_paths, pdf_f)

                    # Upload to Cloud Storage & Web API
                    if upload_to_web and final_paths:
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
                                comic_title=info["title"],
                                comic_slug=slug,
                                cover_cdn_url=cover_cdn_url or valid_cdn_urls[0],
                                chapter_num=num,
                                chapter_title=chap.get("title", f"Chương {num_str}"),
                                image_urls=valid_cdn_urls,
                                author=info.get("author"),
                                translator_group=chap.get("scanlation_group") or info.get("translator_group"),
                                other_names=info.get("other_names"),
                                age_limit=info.get("age_limit"),
                                views=chap.get("views", 0),
                                published_at=chap.get("updated_at"),
                                created_at=chap.get("updated_at"),
                                comic_views=info.get("views", 0),
                                comic_created_at=info.get("created_at_iso") or info.get("created_date_str"),
                                comic_updated_at=info.get("updated_at_iso") or info.get("updated_date_str"),
                                categories=info.get("genres", [])
                            )
                            if synced:
                                self.after(0, lambda t=chap_title: self.log(f"     🌐 Đã đồng bộ {t} lên Website!"))
                            else:
                                self.after(0, lambda t=chap_title: self.log(f"     ⚠️ Đã upload Cloud {t} - Chưa đồng bộ Web API"))

                self.after(0, lambda t=m_title, img_c=comic_img_count, n=comic_num: self.log(f"   🎉 [{n}] Hoàn tất bộ '{t}' ({img_c} ảnh)!"))
                total_processed_comics += 1

            except Exception as ex:
                self.after(0, lambda t=m_title, err=str(ex): self.log(f"   ❌ Lỗi khi xử lý bộ truyện '{t}': {err}"))
                total_processed_comics += 1
                continue

        elapsed = time.time() - start_time
        self.after(0, lambda: self.progress_bar.set(1.0))
        self.after(0, lambda: self.log("\n" + "=" * 70))
        self.after(0, lambda: self.log(f"🎉 HOÀN TẤT TIẾN TRÌNH TẢI HÀNG LOẠT!"))
        self.after(0, lambda: self.log(f"• Tổng số bộ truyện đã xử lý: {total_processed_comics} bộ"))
        self.after(0, lambda: self.log(f"• Tổng số chapter đã tải: {total_chapters_all} chapter"))
        self.after(0, lambda: self.log(f"• Tổng số trang ảnh đã tải: {total_downloaded_images} ảnh"))
        self.after(0, lambda: self.log(f"• Thời gian chạy: {elapsed:.1f}s ({elapsed/60:.1f} phút)"))
        self.after(0, lambda: self.log("=" * 70 + "\n"))
        self.after(0, lambda: self.lbl_status.configure(text=f"Hoàn tất tải hàng loạt: {total_processed_comics} bộ ({total_downloaded_images} ảnh)"))

        self.after(0, self._on_download_finished)

    def _on_download_finished(self):
        self.is_downloading = False
        self.btn_start.configure(state="normal")
        self.btn_fetch.configure(state="normal")
        self.btn_cancel.configure(state="disabled")
        if hasattr(self, 'btn_header_batch'):
            self.btn_header_batch.configure(state="normal")
        if hasattr(self, 'btn_dex_download_all'):
            self.btn_dex_download_all.configure(state="normal")


def main():
    app = MangaDownloaderGUI()
    app.mainloop()


if __name__ == "__main__":
    main()

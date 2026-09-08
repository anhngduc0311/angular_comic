#!/usr/bin/env python3
# -*- coding: utf-8 -*-
"""
=============================================================================
🛠️ TRUYENKOMI - CÔNG CỤ CẬP NHẬT LẠI NGÀY TẠO & NGÀY CẬP NHẬT CHO TRUYỆN
=============================================================================
Tự động quét các bộ truyện trong database hoặc qua Web API:
1. Gọi API /api/comics/fix-dates để tự động sửa ngày tạo/ngày cập nhật dựa trên các chapter đã tải.
2. Hoặc bóc tách chính xác ngày tạo gốc (createdAt) từ MangaDex API cho từng bộ truyện theo UUID/Title.
=============================================================================
"""

import sys
import time
import requests

if sys.platform == 'win32':
    try:
        sys.stdout.reconfigure(encoding='utf-8')
        sys.stderr.reconfigure(encoding='utf-8')
    except Exception:
        pass

DEFAULT_API_URL = "https://truyenkomi.com/api"
MANGADEX_API_BASE = "https://api.mangadex.org"
SYNC_HEADERS = {
    "User-Agent": "TruyenKomi-Sync/2.0",
    "Content-Type": "application/json"
}

def fix_dates_via_api(api_url: str = DEFAULT_API_URL):
    endpoint = f"{api_url.rstrip('/')}/comics/fix-dates"
    print(f"🔄 Đang gửi yêu cầu chuẩn hóa ngày tạo tới: {endpoint}")
    try:
        res = requests.post(endpoint, headers=SYNC_HEADERS, timeout=30)
        if res.status_code == 200:
            data = res.json()
            print(f"✅ Thành công! Đã chuẩn hóa ngày cho {data.get('updatedComics', 0)} bộ truyện.")
            return True
        else:
            print(f"⚠️ API trả về mã lỗi: {res.status_code} - {res.text}")
    except Exception as e:
        print(f"❌ Không thể kết nối tới API: {e}")
    return False

def sync_manga_mangadex_date(slug: str, mangadex_id: str, api_url: str = DEFAULT_API_URL):
    print(f"🔍 Đang truy vấn thông tin gốc từ MangaDex (ID: {mangadex_id})...")
    md_url = f"{MANGADEX_API_BASE}/manga/{mangadex_id}"
    try:
        res = requests.get(md_url, headers={"User-Agent": "TruyenKomi-Sync/2.0"}, timeout=20)
        if res.status_code != 200:
            print(f"⚠️ Không tìm thấy truyện trên MangaDex: {res.status_code}")
            return False
        
        attr = res.json().get("data", {}).get("attributes", {})
        created_at = attr.get("createdAt")
        updated_at = attr.get("updatedAt")
        print(f"📌 Ngày tạo gốc trên MangaDex: {created_at}")
        print(f"📌 Ngày cập nhật MangaDex:    {updated_at}")

        if not created_at:
            print("⚠️ Không có trường createdAt.")
            return False

        sync_url = f"{api_url.rstrip('/')}/comics/{slug}/sync-metadata"
        params = {
            "comicCreatedAt": created_at,
            "comicUpdatedAt": updated_at
        }
        sync_res = requests.post(sync_url, params=params, headers=SYNC_HEADERS, timeout=20)
        if sync_res.status_code == 200:
            print(f"🎉 Đã cập nhật thành công cho bộ truyện '{slug}' trên Web API!")
            return True
        else:
            print(f"⚠️ Lỗi cập nhật Web API: {sync_res.status_code} - {sync_res.text}")
    except Exception as e:
        print(f"❌ Lỗi: {e}")
    return False

if __name__ == "__main__":
    print("=" * 60)
    print("🚀 TRUYENKOMI - CẬP NHẬT NGÀY TẠO TRUYỆN")
    print("=" * 60)
    
    api_target = DEFAULT_API_URL
    if len(sys.argv) > 1 and sys.argv[1].startswith("http"):
        api_target = sys.argv[1]

    # 1. Chạy fix-dates tự động qua chapter
    fix_dates_via_api(api_target)

    # 2. Hỗ trợ sync riêng 1 bộ nếu người dùng truyền slug và mangadex_id
    # Ví dụ: python cap_nhat_ngay_truyen.py thi-tran-tinh-yeu 8f6c0971-2add-4a63-b238-74c033064502
    if len(sys.argv) >= 3:
        slug = sys.argv[1]
        md_id = sys.argv[2]
        sync_manga_mangadex_date(slug, md_id, api_target)

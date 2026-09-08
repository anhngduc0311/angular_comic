#!/usr/bin/env python3
# -*- coding: utf-8 -*-
"""
=============================================================================
🔑 CÔNG CỤ TỰ ĐỘNG LẤY TOKEN GOOGLE DRIVE CHO MÁY CHỦ UBUNTU
=============================================================================
Chạy trên máy tính Windows cá nhân:
1. Tự gọi rclone.exe authorize "drive"
2. Trình duyệt tự mở trang đăng nhập Google
3. Lấy token JSON và TỰ ĐỘNG COPY VÀO BỘ NHỚ TẠM (CLIPBOARD)
4. Sinh sẵn lệnh 1 chạm để bạn dán sang máy chủ Ubuntu!
=============================================================================
"""

import os
import sys
import re
import json
import shutil
import subprocess
from pathlib import Path

# Fix console encoding
if sys.platform == 'win32':
    try:
        sys.stdout.reconfigure(encoding='utf-8')
        sys.stderr.reconfigure(encoding='utf-8')
    except Exception:
        pass

DEFAULT_FOLDER_ID = "1S3biMk6c2e-u5j7uO0wocFBW6J5eB8ef"
WORKSPACE_DIR = Path(__file__).resolve().parent.parent

def copy_to_clipboard(text: str) -> bool:
    """Copy text vào Clipboard trên Windows (sử dụng clip.exe)"""
    try:
        if sys.platform == 'win32':
            proc = subprocess.Popen(['clip'], stdin=subprocess.PIPE, shell=True)
            proc.communicate(input=text.encode('utf-8'))
            return proc.returncode == 0
    except Exception:
        pass
    return False

def find_rclone_exe() -> str:
    # 1. Check workspace
    local_exe = WORKSPACE_DIR / "rclone.exe"
    if local_exe.exists():
        return str(local_exe)
    # 2. Check PATH
    which_exe = shutil.which("rclone")
    if which_exe:
        return which_exe
    return None

def main():
    print("=" * 66)
    print("🚀 TRÌNH TỰ ĐỘNG LẤY TOKEN GOOGLE DRIVE (CHO MÁY CHỦ UBUNTU)")
    print(f"   Thư mục Drive: luutruyenkomi (Folder ID: {DEFAULT_FOLDER_ID})")
    print("=" * 66)

    rclone_bin = find_rclone_exe()
    if not rclone_bin:
        print("[LỖI] Không tìm thấy file rclone.exe!")
        print("Vui lòng đảm bảo rclone.exe nằm cùng thư mục dự án.")
        input("\nNhấn Enter để thoát...")
        sys.exit(1)

    print(f"[INFO] Sử dụng Rclone: {rclone_bin}")
    print("\n👉 Đang khởi động trình xác thực Google OAuth...")
    print("👉 Trình duyệt web của bạn sẽ TỰ ĐỘNG MỞ trong 3 giây tới.")
    print("👉 Hãy đăng nhập Google và bấm 'Cho phép' (Allow) để cấp quyền truy cập Drive.\n")

    cmd = [rclone_bin, "authorize", "drive"]
    try:
        proc = subprocess.Popen(
            cmd,
            stdout=subprocess.PIPE,
            stderr=subprocess.PIPE,
            text=True,
            encoding='utf-8',
            errors='replace'
        )

        stdout, stderr = proc.communicate()
    except Exception as e:
        print(f"[LỖI] Không thể chạy rclone authorize: {e}")
        input("\nNhấn Enter để thoát...")
        sys.exit(1)

    combined_output = (stdout or "") + "\n" + (stderr or "")

    # Trích xuất JSON token
    match = re.search(r'(\{[\s\S]*?"access_token"[\s\S]*?\})', combined_output)
    if not match:
        # Thử tìm token nếu rclone trả về dạng khác
        match = re.search(r'(\{"token":[\s\S]*?\})', combined_output)

    if not match:
        print("\n[LỖI] Không nhận được Token từ Google OAuth.")
        print("Chi tiết phản hồi từ rclone:")
        print(combined_output)
        input("\nNhấn Enter để thoát...")
        sys.exit(1)

    raw_token_json = match.group(1).strip()
    try:
        # Validate JSON
        parsed_json = json.loads(raw_token_json)
        clean_token = json.dumps(parsed_json, separators=(',', ':'))
    except Exception:
        clean_token = raw_token_json

    # 1. Tự copy vào Clipboard
    copied = copy_to_clipboard(clean_token)

    # 2. Lưu vào file rclone_token.txt
    token_file = WORKSPACE_DIR / "rclone_token.txt"
    try:
        with open(token_file, "w", encoding="utf-8") as f:
            f.write(clean_token)
    except Exception:
        pass

    # 3. Tạo sẵn file rclone.conf tiện ích
    conf_content = f"""[gdrive]
type = drive
scope = drive
root_folder_id = {DEFAULT_FOLDER_ID}
token = {clean_token}
"""
    conf_file = WORKSPACE_DIR / "rclone.conf"
    try:
        with open(conf_file, "w", encoding="utf-8") as f:
            f.write(conf_content)
    except Exception:
        pass

    print("=" * 66)
    print("🎉 CHÚC MỪNG! BẠN ĐÃ LẤY TOKEN GOOGLE DRIVE THÀNH CÔNG!")
    if copied:
        print("📋 [ĐÃ TỰ ĐỘNG COPY TOKEN VÀO CLIPBOARD (BỘ NHỚ TẠM)!]")
    print(f"📁 Đã lưu dự phòng ra file: rclone_token.txt và rclone.conf")
    print("=" * 66)

    print("\n👉 BÂY GIỜ HÃY SANG CỬA SỔ UBUNTU SSH VÀ CHỌN 1 TRONG 2 CÁCH DƯỚI ĐÂY:\n")

    print("--- CÁCH 1: CHẠY LỆNH 1 CHẠM TRÊN UBUNTU (CỰC NHANH 1 GIÂY) ---")
    setup_cmd = f"rclone config create gdrive drive scope drive root_folder_id {DEFAULT_FOLDER_ID} token '{clean_token}'"
    print(f"\n{setup_cmd}\n")

    print("--- CÁCH 2: MỞ SCRIPT './tai_mangadex_drive.sh' TRÊN UBUNTU ---")
    print("  1. Chọn mục [6] (Cấu hình Google Drive)")
    print("  2. Chọn mục [1] (Dán mã Token)")
    print("  3. Nhấn chuột phải (hoặc Ctrl+Shift+V) để dán Token rồi nhấn Enter!\n")
    print("=" * 66)

    input("\nNhấn Enter để kết thúc...")

if __name__ == "__main__":
    main()

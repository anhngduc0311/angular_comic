@echo off
chcp 65001 >nul
title TruyenKomi - Đồng Bộ Trực Tiếp Manhwa Từ ZetTruyen (0MB Tải Về)
color 0A

echo ===============================================================================
echo        🚀 TRUYENKOMI - ĐỒNG BỘ TRỰC TIẾP TOÀN BỘ TRUYỆN MANHWA
echo ===============================================================================
echo  - Nguồn: ZetTruyen Manhwa (https://www.zettruyen1.com/the-loai/manhwa)
echo  - Phương thức: Lấy trực tiếp link CDN ảnh (KHÔNG TẢI FILE VỀ MÁY / 0MB BỘ NHỚ)
echo  - Tự động đồng bộ tên truyện, ảnh bìa, tác giả, thể loại và toàn bộ chapter
echo ===============================================================================
echo.

cd /d "%~dp0backend"

echo [1] Đồng bộ toàn bộ truyện Manhwa (Tất cả các trang)
echo [2] Đồng bộ nhanh 5 trang đầu tiên (Khoảng 150 bộ mới nhất)
echo [3] Chạy ngầm tự động cập nhật chương mới định kỳ (Daemon 15 phút/lần)
echo [4] Nhập URL 1 bộ truyện cụ thể để đồng bộ
echo.
set /p opt="👉 Vui lòng chọn chế độ (1/2/3/4) [Mặc định: 1]: "

if "%opt%"=="2" (
    echo.
    echo ⏳ Đang đồng bộ 5 trang Manhwa mới nhất...
    python sync_manhwa_direct.py --pages 5
) else if "%opt%"=="3" (
    echo.
    echo 🔄 Đang khởi chạy chế độ Daemon tự động cập nhật mỗi 15 phút...
    python sync_manhwa_direct.py --continuous --interval 15
) else if "%opt%"=="4" (
    echo.
    set /p comic_url="👉 Nhập link truyện ZetTruyen: "
    python sync_manhwa_direct.py "%comic_url%"
) else (
    echo.
    echo ⏳ Đang đồng bộ toàn bộ kho truyện Manhwa...
    python sync_manhwa_direct.py --all
)

echo.
echo ===============================================================================
echo  ✔ Hoàn thành tác vụ!
echo ===============================================================================
pause

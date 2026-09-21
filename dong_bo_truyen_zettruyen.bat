@echo off
chcp 65001 >nul
title TruyenKomi - Đồng Bộ Trực Tiếp Manhwa ^& Manhua Từ ZetTruyen (0MB Tải Về)
color 0A

echo ===============================================================================
echo        🚀 TRUYENKOMI - ĐỒNG BỘ TRỰC TIẾP MANHWA ^& MANHUA TỪ ZETTRUYEN
echo ===============================================================================
echo  - Thể loại hỗ trợ: Manhwa (Hàn Quốc), Manhua (Trung Quốc), Toàn bộ danh mục
echo  - Phương thức: Lấy trực tiếp link CDN ảnh (KHÔNG TẢI FILE VỀ MÁY / 0MB BỘ NHỚ)
echo  - Tự động đồng bộ tên truyện, ảnh bìa, tác giả, thể loại và toàn bộ chapter
echo ===============================================================================
echo.

cd /d "%~dp0backend"

echo [1] Đồng bộ thể loại MANHUA - Truyện Trung Quốc (Mặc định 5 trang mới nhất)
echo [2] Đồng bộ thể loại MANHWA - Truyện Hàn Quốc (Mặc định 5 trang mới nhất)
echo [3] Đồng bộ TOÀN BỘ cả Manhwa và Manhua (Tất cả các trang)
echo [4] Đồng bộ TOÀN BỘ Manhua (Tất cả các trang)
echo [5] Đồng bộ TOÀN BỘ Manhwa (Tất cả các trang)
echo [6] Chạy ngầm tự động cập nhật chương mới định kỳ (Daemon 15 phút/lần)
echo [7] Nhập link 1 bộ truyện cụ thể trên ZetTruyen
echo.
set /p opt="👉 Vui lòng chọn chế độ (1-7) [Mặc định: 1]: "

if "%opt%"=="2" (
    echo.
    echo ⏳ Đang đồng bộ 5 trang MANHWA mới nhất...
    python sync_zet_direct.py --category manhwa --pages 5
) else if "%opt%"=="3" (
    echo.
    echo ⏳ Đang đồng bộ TOÀN BỘ kho truyện Manhwa ^& Manhua...
    python sync_zet_direct.py --category all --all
) else if "%opt%"=="4" (
    echo.
    echo ⏳ Đang đồng bộ TOÀN BỘ kho truyện MANHUA...
    python sync_zet_direct.py --category manhua --all
) else if "%opt%"=="5" (
    echo.
    echo ⏳ Đang đồng bộ TOÀN BỘ kho truyện MANHWA...
    python sync_zet_direct.py --category manhwa --all
) else if "%opt%"=="6" (
    echo.
    echo 🔄 Đang khởi chạy chế độ Daemon tự động cập nhật mỗi 15 phút...
    python sync_zet_direct.py --category all --continuous --interval 15
) else if "%opt%"=="7" (
    echo.
    set /p comic_url="👉 Nhập link truyện ZetTruyen: "
    python sync_zet_direct.py "%comic_url%"
) else (
    echo.
    echo ⏳ Đang đồng bộ 5 trang MANHUA mới nhất...
    python sync_zet_direct.py --category manhua --pages 5
)

echo.
echo ===============================================================================
echo  ✔ Hoàn thành tác vụ!
echo ===============================================================================
pause

@echo off
chcp 65001 >nul
title Lấy Token Google Drive Cho Ubuntu
cd /d "%~dp0"

echo ================================================================
echo 🚀 ĐANG CHẠY TRÌNH LẤY TOKEN GOOGLE DRIVE CHO UBUNTU...
echo ================================================================

if exist "backend\lay_token_drive.py" (
    python "backend\lay_token_drive.py"
) else (
    echo Đang gọi rclone authorize...
    .\rclone.exe authorize "drive"
    pause
)

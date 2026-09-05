@echo off
title ZetTruyen Manga Downloader GUI
echo ======================================================
echo Dang khoi chay Giao dien Tai Truyen ZetTruyen...
echo ======================================================
cd /d "%~dp0"
python backend\zet_gui.py
if errorlevel 1 (
    echo.
    echo [!] Co loi xay ra khi chay python. Nhan phim bat ky de thoat.
    pause >nul
)

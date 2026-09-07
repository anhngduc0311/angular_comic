@echo off
chcp 65001 >nul
title TruyenKomi Launcher
setlocal

:MENU
cls
echo ===============================================================================
echo                  TRUYENKOMI COMIC PLATFORM - CONTROL PANEL
echo ===============================================================================
echo.
echo   [1] Khoi chay TOAN BO (Docker + Backend .NET + Frontend Angular)
echo   [2] Khoi chay Backend .NET API (Port 5000)
echo   [3] Khoi chay Frontend Angular (Port 4200)
echo   [4] Khoi chay Tool Tai Truyen ZetTruyen (Giao dien GUI)
echo   [5] Khoi dong Docker Containers (PostgreSQL, Redis, Meilisearch)
echo   [6] Tat Docker Containers
echo   [0] Thoat
echo.
echo ===============================================================================
set "user_choice="
set /p "user_choice=Nhap lua chon cua ban [0-6]: "

if "%user_choice%"=="1" goto START_ALL
if "%user_choice%"=="2" goto START_BACKEND
if "%user_choice%"=="3" goto START_FRONTEND
if "%user_choice%"=="4" goto START_GUI
if "%user_choice%"=="5" goto START_DOCKER
if "%user_choice%"=="6" goto STOP_ALL
if "%user_choice%"=="0" goto EXIT
goto INVALID

:START_ALL
cls
echo ===============================================================================
echo DANG KHOI CHAY HE THONG TRUYENKOMI...
echo ===============================================================================
echo.
echo [1/3] Khoi dong Docker Containers...
docker-compose up -d >nul 2>&1

echo [2/3] Mo Backend .NET API tren cua so rieng (Port 5000)...
start "TruyenKomi - Backend API" cmd /k "cd /d ""%~dp0backend\TruyenKomi.API"" && dotnet run --environment Production"

timeout /t 3 >nul

echo [3/3] Mo Frontend Angular tren cua so rieng (Port 4200)...
start "TruyenKomi - Frontend Angular" cmd /k "cd /d ""%~dp0angular"" && npm run start:prod"

echo.
echo ===============================================================================
echo DA KHOI CHAY XONG!
echo  - Frontend Web : http://localhost:4200 (hoac https://truyenkomi.site)
echo  - Backend API  : http://localhost:5000 (Swagger: http://localhost:5000/swagger)
echo ===============================================================================
echo.
pause
goto MENU

:START_BACKEND
cls
echo Dang khoi chay Backend .NET Web API...
start "TruyenKomi - Backend API" cmd /k "cd /d ""%~dp0backend\TruyenKomi.API"" && dotnet run --environment Production"
goto MENU

:START_FRONTEND
cls
echo Dang khoi chay Frontend Angular...
start "TruyenKomi - Frontend Angular" cmd /k "cd /d ""%~dp0angular"" && npm run start:prod"
goto MENU

:START_GUI
cls
echo Dang khoi chay Giao dien Tai Truyen ZetTruyen (GUI)...
start "ZetTruyen Downloader GUI" python "%~dp0backend\zet_gui.py"
goto MENU

:START_DOCKER
cls
echo Dang khoi dong Docker Compose...
docker-compose up -d
echo.
docker-compose ps
echo.
pause
goto MENU

:STOP_ALL
cls
echo Dang tat Docker Containers...
docker-compose down
echo.
echo Da tat Docker Containers!
echo.
pause
goto MENU

:INVALID
echo.
echo [!] Lua chon khong hop le. Vui long nhap tu 0 den 6.
timeout /t 2 >nul
goto MENU

:EXIT
echo Tam biet!
exit /b

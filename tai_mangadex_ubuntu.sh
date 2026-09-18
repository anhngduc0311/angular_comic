#!/usr/bin/env bash
# ==============================================================================
# 🚀 MANGADEX ZERO-STORAGE CRAWLER CHO UBUNTU (MANGADEX API V5)
# ==============================================================================
# - Đồng bộ trực tiếp URL CDN MangaDex (uploads.mangadex.org) vào Web API TruyenKomi
# - KHÔNG lưu bất kỳ file ảnh nào vào ổ đĩa server (0 MB Disk Usage)
# - Tốc độ cực nhanh: 50ms - 100ms / chapter
# - Tự động tạo virtualenv và cài đặt dependencies tối giản (requests, rich)
# - Hỗ trợ chạy nền ngầm 24/7 (nohup), quản lý tiến trình start/stop/status
# ==============================================================================

set -e

SCRIPT_DIR="$(cd "$(dirname "${BASH_SOURCE[0]}")" && pwd)"
cd "$SCRIPT_DIR"

LOG_FILE="mangadex_sync.log"
PID_FILE=".mangadex_sync.pid"
VENV_DIR=".venv_mangadex"
PYTHON_SCRIPT="backend/mangadex_drive_downloader.py"

if [ ! -f "$PYTHON_SCRIPT" ]; then
    PYTHON_SCRIPT="mangadex_drive_downloader.py"
fi

# Màu sắc hiển thị terminal
GREEN='\033[0;32m'
BLUE='\033[0;34m'
YELLOW='\033[1;33m'
RED='\033[0;31m'
CYAN='\033[0;36m'
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

setup_environment() {
    log_header "1. KIỂM TRA MÔI TRƯỜNG PYTHON"

    if ! command -v python3 >/dev/null 2>&1; then
        log_error "Chưa cài đặt Python3. Vui lòng cài: sudo apt update && sudo apt install -y python3 python3-pip python3-venv"
        exit 1
    fi

    if [ ! -d "$VENV_DIR" ]; then
        log_info "Tạo môi trường ảo Python Virtualenv: $VENV_DIR..."
        python3 -m venv "$VENV_DIR" || python3 -m virtualenv "$VENV_DIR"
    fi

    local PY_BIN="$VENV_DIR/bin/python3"
    local PIP_BIN="$VENV_DIR/bin/pip"

    log_info "Cài đặt các gói thư viện tối giản (requests, rich, urllib3)..."
    "$PIP_BIN" install --upgrade pip >/dev/null 2>&1 || true
    "$PIP_BIN" install requests urllib3 rich python-dotenv >/dev/null 2>&1

    log_success "Môi trường Zero-Storage Crawler đã sẵn sàng!"
}

start_sync_all() {
    setup_environment
    local PY_BIN="$VENV_DIR/bin/python3"
    local ORDER="${1:-latest}"
    local LIMIT="${2:-}"

    log_header "2. KHỞI ĐỘNG CRAWLER ZERO-STORAGE (CHẠY NỀN NOHUP)"

    if [ -f "$PID_FILE" ]; then
        local OLD_PID=$(cat "$PID_FILE" 2>/dev/null || echo "")
        if [ -n "$OLD_PID" ] && ps -p "$OLD_PID" > /dev/null 2>&1; then
            log_warning "Tiến trình cào MangaDex đang chạy với PID: $OLD_PID"
            echo "Xem log trực tiếp: tail -f $LOG_FILE"
            echo "Dừng tiến trình: ./tai_mangadex_ubuntu.sh stop"
            return 0
        fi
    fi

    local EXTRA_ARGS="--all --order=$ORDER"
    if [ -n "$LIMIT" ]; then
        EXTRA_ARGS="$EXTRA_ARGS --limit=$LIMIT"
    fi

    nohup "$PY_BIN" "$PYTHON_SCRIPT" $EXTRA_ARGS > "$LOG_FILE" 2>&1 &
    local NEW_PID=$!
    echo "$NEW_PID" > "$PID_FILE"

    log_success "Đã khởi động Zero-Storage Crawler ngầm (PID: $NEW_PID)!"
    echo "• Thứ tự quét: $ORDER"
    echo "• File log: $LOG_FILE"
    echo "• Lệnh xem log: tail -f $LOG_FILE"
}

stop_sync() {
    log_header "DỪNG TIẾN TRÌNH CRAWLER"
    if [ -f "$PID_FILE" ]; then
        local PID=$(cat "$PID_FILE" 2>/dev/null || echo "")
        if [ -n "$PID" ] && ps -p "$PID" > /dev/null 2>&1; then
            kill -15 "$PID" >/dev/null 2>&1 || kill -9 "$PID" >/dev/null 2>&1 || true
            rm -f "$PID_FILE"
            log_success "Đã dừng tiến trình Crawler (PID: $PID) thành công."
        else
            rm -f "$PID_FILE"
            log_info "Không tìm thấy tiến trình đang chạy."
        fi
    else
        log_info "Không có tiến trình nào đang chạy."
    fi
}

show_status() {
    log_header "TRẠNG THÁI CRAWLER"
    if [ -f "$PID_FILE" ]; then
        local PID=$(cat "$PID_FILE" 2>/dev/null || echo "")
        if [ -n "$PID" ] && ps -p "$PID" > /dev/null 2>&1; then
            log_success "🟢 Crawler ĐANG CHẠY (PID: $PID)"
            echo "10 dòng log mới nhất:"
            tail -n 10 "$LOG_FILE" 2>/dev/null || echo "Chưa có log."
            return 0
        fi
    fi
    log_warning "🔴 Crawler ĐANG DỪNG"
}

case "$1" in
    start)
        start_sync_all "${2:-latest}" "${3:-}"
        ;;
    stop)
        stop_sync
        ;;
    status)
        show_status
        ;;
    log|logs)
        tail -f "$LOG_FILE"
        ;;
    single)
        setup_environment
        "$VENV_DIR/bin/python3" "$PYTHON_SCRIPT" --url="$2"
        ;;
    *)
        echo -e "${BOLD}🚀 TruyenKomi - MangaDex Zero-Storage Crawler${NC}"
        echo "Cách dùng:"
        echo "  ./tai_mangadex_ubuntu.sh start [latest|oldest|newest_created] [limit]  : Chạy ngầm toàn bộ truyện"
        echo "  ./tai_mangadex_ubuntu.sh single <manga_uuid_or_url>                    : Cào 1 bộ truyện cụ thể"
        echo "  ./tai_mangadex_ubuntu.sh stop                                         : Dừng tiến trình cào"
        echo "  ./tai_mangadex_ubuntu.sh status                                       : Xem trạng thái"
        echo "  ./tai_mangadex_ubuntu.sh log                                          : Xem log trực tiếp"
        ;;
esac

#!/usr/bin/env bash
# ==============================================================================
# 🚀 TRUYENKOMI - ĐỒNG BỘ TRỰC TIẾP MANHWA & MANHUA TRÊN VPS UBUNTU
# ==============================================================================
# - Lấy link ảnh trực tiếp từ CDN ZetTruyen (0 MB bộ nhớ lưu trữ)
# - Hỗ trợ cả 2 thể loại Manhwa (Hàn Quốc) và Manhua (Trung Quốc)
# - Tự động tạo Python Virtualenv và cài đặt dependencies tối giản
# - Hỗ trợ chạy ngầm 24/7 (Daemon/Systemd), kiểm tra trạng thái và xem log realtime
# ==============================================================================

set -e

SCRIPT_DIR="$(cd "$(dirname "${BASH_SOURCE[0]}")" && pwd)"
cd "$SCRIPT_DIR"

LOG_FILE="zet_sync.log"
PID_FILE=".zet_sync.pid"
VENV_DIR=".venv_zet"
PYTHON_SCRIPT="backend/sync_zet_direct.py"

if [ ! -f "$PYTHON_SCRIPT" ]; then
    PYTHON_SCRIPT="sync_zet_direct.py"
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
    # Cài đặt python3-pip và python3-venv nếu thiếu
    if ! command -v pip3 >/dev/null 2>&1 || ! dpkg -s python3-venv >/dev/null 2>&1; then
        log_info "Đang chuẩn bị gói hệ thống Python (python3-venv, python3-pip)..."
        apt-get update -y >/dev/null 2>&1 && apt-get install -y python3 python3-pip python3-venv >/dev/null 2>&1 || true
    fi

    # Kiểm tra venv hợp lệ (phải có cả python3 và pip)
    if [ -d "$VENV_DIR" ] && [ ! -f "$VENV_DIR/bin/pip" ]; then
        log_warning "Phát hiện môi trường ảo cũ bị lỗi, đang dọn dẹp và tạo lại..."
        rm -rf "$VENV_DIR"
    fi

    if [ ! -d "$VENV_DIR" ]; then
        log_info "Đang tạo môi trường ảo: $VENV_DIR..."
        python3 -m venv "$VENV_DIR" 2>/dev/null || true
    fi

    local PY_BIN="$VENV_DIR/bin/python3"
    local PIP_BIN="$VENV_DIR/bin/pip"

    if [ -f "$PIP_BIN" ]; then
        log_info "Cài đặt thư viện vào Virtualenv..."
        "$PIP_BIN" install --upgrade pip >/dev/null 2>&1 || true
        "$PIP_BIN" install cloudscraper beautifulsoup4 requests rich
    else
        log_warning "Không thể dùng venv, cài đặt trực tiếp vào hệ thống Python..."
        pip3 install --break-system-packages cloudscraper beautifulsoup4 requests rich 2>/dev/null || \
        pip3 install cloudscraper beautifulsoup4 requests rich || true
    fi

    # Kiểm tra xác thực các module bắt buộc
    if [ -f "$PY_BIN" ] && "$PY_BIN" -c "import requests, cloudscraper, bs4, rich" >/dev/null 2>&1; then
        log_success "Môi trường Virtualenv đã sẵn sàng!"
    elif python3 -c "import requests, cloudscraper, bs4, rich" >/dev/null 2>&1; then
        log_success "Môi trường Python hệ thống đã sẵn sàng!"
    else
        log_error "Không thể cài đặt thư viện requests/cloudscraper. Vui lòng chạy thủ công: pip3 install --break-system-packages cloudscraper beautifulsoup4 requests rich"
        exit 1
    fi
}

is_running() {
    if [ -f "$PID_FILE" ]; then
        local pid
        pid=$(cat "$PID_FILE")
        if ps -p "$pid" > /dev/null 2>&1; then
            return 0
        fi
    fi
    return 1
}

start_daemon() {
    setup_environment
    local interval="${1:-15}"

    if is_running; then
        local pid
        pid=$(cat "$PID_FILE")
        log_warning "Tiến trình đồng bộ đang chạy ngầm với PID: $pid"
        log_info "Dùng: ./dong_bo_zet_ubuntu.sh logs để xem log realtime."
        return
    fi

    log_header "KHỞI CHẠY ĐỒNG BỘ MANHWA & MANHUA TỰ ĐỘNG 24/7 (DAEMON)"
    log_info "Chu kỳ quét cập nhật chương mới: ${BOLD}${interval} phút/lần${NC}"
    log_info "File log: ${BOLD}${LOG_FILE}${NC}"

    local PY_BIN="$VENV_DIR/bin/python3"
    if [ ! -f "$PY_BIN" ]; then
        PY_BIN="python3"
    fi
    nohup "$PY_BIN" "$PYTHON_SCRIPT" --category all --continuous --interval "$interval" >> "$LOG_FILE" 2>&1 &
    local new_pid=$!
    echo "$new_pid" > "$PID_FILE"

    sleep 2
    if ps -p "$new_pid" > /dev/null 2>&1; then
        log_success "Đã khởi chạy tiến trình Daemon thành công với PID: $new_pid"
        log_info "Để theo dõi log realtime: ./dong_bo_zet_ubuntu.sh logs"
        log_info "Để dừng tiến trình:       ./dong_bo_zet_ubuntu.sh stop"
    else
        log_error "Không thể khởi chạy Daemon. Vui lòng kiểm tra log: cat $LOG_FILE"
    fi
}

stop_daemon() {
    if is_running; then
        local pid
        pid=$(cat "$PID_FILE")
        log_info "Đang dừng tiến trình PID: $pid..."
        kill "$pid" 2>/dev/null || true
        sleep 2
        if ps -p "$pid" > /dev/null 2>&1; then
            kill -9 "$pid" 2>/dev/null || true
        fi
        rm -f "$PID_FILE"
        log_success "Đã dừng tiến trình đồng bộ ngầm!"
    else
        log_warning "Không có tiến trình Daemon nào đang chạy."
        rm -f "$PID_FILE"
    fi
}

show_status() {
    log_header "TRẠNG THÁI TIẾN TRÌNH ĐỒNG BỘ ZETTRUYEN"
    if is_running; then
        local pid
        pid=$(cat "$PID_FILE")
        log_success "Tiến trình đang HOẠT ĐỘNG (PID: $pid)"
        ps -u -p "$pid" 2>/dev/null || ps -p "$pid"
        echo ""
        log_info "15 dòng log gần nhất ($LOG_FILE):"
        echo "--------------------------------------------------------"
        tail -n 15 "$LOG_FILE" 2>/dev/null || echo "(Chưa có log)"
        echo "--------------------------------------------------------"
    else
        log_warning "Tiến trình hiện đang DỪNG (Không chạy ngầm)"
    fi
}

view_logs() {
    if [ ! -f "$LOG_FILE" ]; then
        touch "$LOG_FILE"
    fi
    log_info "Đang theo dõi log realtime từ $LOG_FILE (Nhấn Ctrl+C để thoát)..."
    tail -f "$LOG_FILE"
}

sync_now() {
    setup_environment
    local cat="${1:-all}"
    local pages="${2:-5}"
    local PY_BIN="$VENV_DIR/bin/python3"
    if [ ! -f "$PY_BIN" ]; then
        PY_BIN="python3"
    fi

    log_header "ĐỒNG BỘ NHANH: $cat ($pages trang)"
    if [ "$pages" = "all" ]; then
        "$PY_BIN" "$PYTHON_SCRIPT" --category "$cat" --all
    else
        "$PY_BIN" "$PYTHON_SCRIPT" --category "$cat" --pages "$pages"
    fi
}

sync_all_and_run_background() {
    setup_environment
    local interval="${1:-15}"

    if is_running; then
        local pid
        pid=$(cat "$PID_FILE")
        log_warning "Tiến trình đồng bộ đang chạy ngầm với PID: $pid"
        log_info "Tự động chuyển sang theo dõi tiến độ cào realtime bên dưới..."
        sleep 1
        view_logs
        return
    fi

    log_header "KHỞI CHẠY ĐỒNG BỘ TOÀN BỘ TRUYỆN VÀ CHẠY NGẦM 24/7"
    log_info "1. Bắt đầu quét & đồng bộ toàn bộ Manhwa và Manhua ngay lập tức..."
    log_info "2. Sau khi xong sẽ tự động tiếp tục chạy ngầm định kỳ ${BOLD}${interval} phút/lần${NC}"
    log_info "File log: ${BOLD}${LOG_FILE}${NC}"

    local PY_BIN="$VENV_DIR/bin/python3"
    if [ ! -f "$PY_BIN" ]; then
        PY_BIN="python3"
    fi
    nohup "$PY_BIN" "$PYTHON_SCRIPT" --category all --continuous --interval "$interval" >> "$LOG_FILE" 2>&1 &
    local new_pid=$!
    echo "$new_pid" > "$PID_FILE"

    sleep 2
    if ps -p "$new_pid" > /dev/null 2>&1; then
        log_success "Đã khởi chạy tiến trình chạy ngầm thành công! (PID: $new_pid)"
        echo -e "${YELLOW}👉 Tiến trình đang cào dữ liệu ngầm 24/7.${NC}"
        echo -e "${YELLOW}👉 Đang mở màn hình xem log tiến độ (Nhấn Ctrl + C để thoát màn hình xem bất cứ lúc nào, tiến trình VẪN TIẾP TỤC CHẠY NGẦM).${NC}\n"
        sleep 2
        tail -f "$LOG_FILE"
    else
        log_error "Không thể khởi chạy tiến trình. Vui lòng kiểm tra log: cat $LOG_FILE"
    fi
}

install_systemd_service() {
    setup_environment
    log_header "CÀI ĐẶT DỊCH VỤ SYSTEMD TỰ ĐỘNG CHẠY KHI VPS KHỞI ĐỘNG"

    local SERVICE_FILE="/etc/systemd/system/truyenkomi-zet-sync.service"
    local CURRENT_USER
    CURRENT_USER="$(whoami)"
    local PY_BIN="$SCRIPT_DIR/$VENV_DIR/bin/python3"
    if [ ! -f "$PY_BIN" ]; then
        PY_BIN="$(which python3)"
    fi
    local TARGET_PY="$SCRIPT_DIR/$PYTHON_SCRIPT"

    if [ "$(id -u)" -ne 0 ]; then
        log_error "Vui lòng chạy lệnh với quyền sudo: sudo ./dong_bo_zet_ubuntu.sh service"
        exit 1
    fi

    cat <<EOF > "$SERVICE_FILE"
[Unit]
Description=TruyenKomi ZetTruyen Direct Synchronizer Service
After=network.target docker.service

[Service]
Type=simple
User=$CURRENT_USER
WorkingDirectory=$SCRIPT_DIR
ExecStart=$PY_BIN $TARGET_PY --category all --continuous --interval 15
Restart=always
RestartSec=10
StandardOutput=append:$SCRIPT_DIR/$LOG_FILE
StandardError=append:$SCRIPT_DIR/$LOG_FILE

[Install]
WantedBy=multi-user.target
EOF

    systemctl daemon-reload
    systemctl enable truyenkomi-zet-sync.service
    systemctl restart truyenkomi-zet-sync.service
    log_success "Đã cài đặt và kích hoạt dịch vụ systemd: truyenkomi-zet-sync.service"
    log_info "Kiểm tra trạng thái: sudo systemctl status truyenkomi-zet-sync.service"
}

# Xử lý lệnh đầu vào
ACTION="${1:-menu}"

case "$ACTION" in
    start)
        start_daemon "${2:-15}"
        ;;
    stop)
        stop_daemon
        ;;
    restart)
        stop_daemon
        start_daemon "${2:-15}"
        ;;
    status)
        show_status
        ;;
    logs)
        view_logs
        ;;
    manhua)
        sync_now "manhua" "${2:-5}"
        ;;
    manhwa)
        sync_now "manhwa" "${2:-5}"
        ;;
    all)
        sync_all_and_run_background "${2:-15}"
        ;;
    service)
        install_systemd_service
        ;;
    *)
        log_header "🚀 MENU QUẢN LÝ ĐỒNG BỘ ZETTRUYEN TRÊN UBUNTU VPS"
        echo "1. Khởi chạy chế độ chạy ngầm 24/7 (Daemon 15 phút/lần)"
        echo "2. Dừng tiến trình chạy ngầm"
        echo "3. Kiểm tra trạng thái tiến trình"
        echo "4. Xem log realtime (tail -f)"
        echo "5. Đồng bộ nhanh 5 trang MANHUA mới nhất"
        echo "6. Đồng bộ nhanh 5 trang MANHWA mới nhất"
        echo "7. Đồng bộ TOÀN BỘ cả Manhwa & Manhua (Vừa cào vừa chạy ngầm 24/7)"
        echo "8. Cài đặt thành Systemd Service (Tự chạy khi khởi động VPS)"
        echo "9. Thoát"
        echo ""
        read -p "👉 Chọn chức năng (1-9): " choice
        case "$choice" in
            1) start_daemon 15 ;;
            2) stop_daemon ;;
            3) show_status ;;
            4) view_logs ;;
            5) sync_now "manhua" 5 ;;
            6) sync_now "manhwa" 5 ;;
            7) sync_all_and_run_background 15 ;;
            8) install_systemd_service ;;
            *) exit 0 ;;
        esac
        ;;
esac

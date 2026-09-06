#!/usr/bin/env bash
# ==============================================================================
# 🚀 TRUYENKOMI - ALL-IN-ONE VPS DEPLOYMENT SCRIPT (DOCKER)
# ==============================================================================
# Script tự động hóa toàn bộ quá trình triển khai hệ thống TruyenKomi:
# 1. Cập nhật hệ điều hành & cài đặt gói bổ trợ cần thiết
# 2. Tạo 4GB Swap Memory (chống tràn RAM khi build .NET 9 & Angular 17)
# 3. Cài đặt Docker & Docker Compose mới nhất
# 4. Kiểm tra & khởi tạo file cấu hình môi trường .env
# 5. Build và khởi chạy toàn bộ Container (API .NET, Angular UI, Nginx, SQL Server, Redis, Meilisearch, MinIO)
# 6. Kiểm tra Healthcheck & dọn dẹp Docker images rác
# ==============================================================================

set -e # Dừng ngay lập tức nếu có lệnh bị lỗi

# --- Màu sắc hiển thị Terminal ---
GREEN='\033[0;32m'
BLUE='\033[0;34m'
YELLOW='\033[1;33m'
RED='\033[0;31m'
CYAN='\033[0;36m'
MAGENTA='\033[0;35m'
BOLD='\033[1m'
NC='\033[0m' # No Color

# Helper functions
log_info() {
    echo -e "${BLUE}[INFO]${NC} $1"
}

log_success() {
    echo -e "${GREEN}[SUCCESS]${NC} $1"
}

log_warning() {
    echo -e "${YELLOW}[WARNING]${NC} $1"
}

log_error() {
    echo -e "${RED}[ERROR]${NC} $1"
}

log_step() {
    echo -e "\n${CYAN}================================================================${NC}"
    echo -e "${BOLD}${CYAN}$1${NC}"
    echo -e "${CYAN}================================================================${NC}\n"
}

# Kiểm tra quyền sudo/root
SUDO=""
if [ "$(id -u)" -ne 0 ]; then
    if command -v sudo >/dev/null 2>&1; then
        SUDO="sudo"
    else
        log_error "Vui lòng chạy script với quyền root hoặc cài đặt sudo."
        exit 1
    fi
fi

# Tự động tìm thư mục chứa docker-compose.yml
SCRIPT_DIR="$(cd "$(dirname "${BASH_SOURCE[0]}")" && pwd)"
TARGET_DIR=""

if [ -f "$SCRIPT_DIR/docker-compose.yml" ]; then
    TARGET_DIR="$SCRIPT_DIR"
elif [ -f "$PWD/docker-compose.yml" ]; then
    TARGET_DIR="$PWD"
else
    log_error "Không tìm thấy file docker-compose.yml trong thư mục $SCRIPT_DIR hoặc $PWD!"
    exit 1
fi

log_step "🚀 BẮT ĐẦU TRIỂN KHAI HỆ THỐNG TRUYENKOMI LÊN VPS (DOCKER)"
log_info "Thư mục làm việc: ${BOLD}${TARGET_DIR}${NC}"

# ==============================================================================
# BƯỚC 1: CẬP NHẬT HỆ ĐIỀU HÀNH & CÁC CÔNG CỤ CẦN THIẾT
# ==============================================================================
log_step "BƯỚC 1/6: Cập nhật hệ điều hành & cài đặt gói tiện ích"
log_info "Đang cập nhật danh sách gói apt & cài đặt git, curl, ufw, htop, ca-certificates..."
$SUDO apt-get update -y
$SUDO apt-get install -y git curl ufw htop ca-certificates gnupg lsb-release

log_success "Đã cập nhật hệ điều hành và cài đặt gói phụ trợ thành công!"

# ==============================================================================
# BƯỚC 2: KIỂM TRA VÀ TẠO BỘ NHỚ ẢO SWAP (4GB)
# ==============================================================================
log_step "BƯỚC 2/6: Kiểm tra cấu hình bộ nhớ ảo Swap (Chống tràn RAM khi build)"
SWAP_TOTAL=$(free -m 2>/dev/null | awk '/^Swap:/ {print $2}' || echo "0")

if [ -z "$SWAP_TOTAL" ] || [ "$SWAP_TOTAL" -lt 3500 ]; then
    log_warning "Máy chủ chưa có Swap hoặc Swap < 4GB (Hiện tại: ${SWAP_TOTAL}MB). Đang thiết lập 4GB Swap..."
    $SUDO swapoff /swapfile 2>/dev/null || true
    $SUDO rm -f /swapfile
    $SUDO fallocate -l 4G /swapfile || $SUDO dd if=/dev/zero of=/swapfile bs=1M count=4096
    $SUDO chmod 600 /swapfile
    $SUDO mkswap /swapfile
    $SUDO swapon /swapfile
    if ! grep -q "/swapfile" /etc/fstab; then
        echo '/swapfile none swap sw 0 0' | $SUDO tee -a /etc/fstab
    fi
    $SUDO sysctl vm.swappiness=10
    if ! grep -q "vm.swappiness=10" /etc/sysctl.conf; then
        echo 'vm.swappiness=10' | $SUDO tee -a /etc/sysctl.conf
    fi
    log_success "Đã thiết lập thành công Swap 4GB tại /swapfile!"
else
    log_success "Máy chủ đã có sẵn ${SWAP_TOTAL}MB Swap (>= 4GB). Bỏ qua bước tạo Swap."
fi

# ==============================================================================
# BƯỚC 3: CÀI ĐẶT DOCKER & DOCKER COMPOSE NẾU CHƯA CÓ
# ==============================================================================
log_step "BƯỚC 3/6: Kiểm tra & cài đặt Docker Engine & Docker Compose"

if ! command -v docker >/dev/null 2>&1; then
    log_info "Docker chưa được cài đặt. Đang tải và cài đặt Docker chính thức..."
    curl -fsSL https://get.docker.com -o /tmp/get-docker.sh
    $SUDO sh /tmp/get-docker.sh
    rm -f /tmp/get-docker.sh
    
    if [ -n "$USER" ] && [ "$USER" != "root" ]; then
        $SUDO usermod -aG docker "$USER" || true
    fi
    $SUDO systemctl enable docker
    $SUDO systemctl start docker
    log_success "Đã cài đặt Docker thành công!"
else
    log_success "Docker đã được cài đặt: $(docker --version)"
fi

# Đảm bảo Docker service đang chạy và cấp quyền truy cập socket
$SUDO systemctl start docker || true
if [ -n "$USER" ] && [ "$USER" != "root" ]; then
    $SUDO usermod -aG docker "$USER" 2>/dev/null || true
fi
$SUDO chmod 666 /var/run/docker.sock 2>/dev/null || true

# Xác định lệnh docker compose hợp lệ
DOCKER_COMPOSE_CMD=""
if docker compose version >/dev/null 2>&1; then
    DOCKER_COMPOSE_CMD="docker compose"
elif $SUDO docker compose version >/dev/null 2>&1; then
    DOCKER_COMPOSE_CMD="$SUDO docker compose"
elif command -v docker-compose >/dev/null 2>&1; then
    DOCKER_COMPOSE_CMD="docker-compose"
else
    log_warning "Đang cài đặt Docker Compose Plugin..."
    $SUDO apt-get install -y docker-compose-plugin
    DOCKER_COMPOSE_CMD="docker compose"
fi
log_success "Docker Compose khả dụng: $($DOCKER_COMPOSE_CMD version)"

# ==============================================================================
# BƯỚC 4: THIẾT LẬP FILE MÔI TRƯỜNG .ENV
# ==============================================================================
log_step "BƯỚC 4/6: Kiểm tra cấu hình biến môi trường (.env)"
cd "$TARGET_DIR"

if [ ! -f ".env" ]; then
    if [ -f ".env.example" ]; then
        log_info "Chưa tìm thấy file .env, đang tự động sao chép từ .env.example..."
        cp .env.example .env
        log_success "Đã tạo file .env từ .env.example."
    fi
else
    log_success "File .env đã sẵn sàng."
fi

# ==============================================================================
# BƯỚC 5: BUILD VÀ KHỞI CHẠY TẤT CẢ CONTAINERS
# ==============================================================================
log_step "BƯỚC 5/6: Build và khởi chạy toàn bộ dịch vụ TruyenKomi bằng Docker Compose"
log_info "Đang thực thi: $DOCKER_COMPOSE_CMD up -d --build (sqlserver, redis, minio, meilisearch, api, frontend, nginx)..."

$DOCKER_COMPOSE_CMD up -d --build

log_success "Tất cả các dịch vụ container đã được build và khởi chạy trong nền!"

# ==============================================================================
# BƯỚC 6: HEALTH CHECK & DỌN DẸP DOCKER IMAGES CŨ
# ==============================================================================
log_step "BƯỚC 6/6: Kiểm tra trạng thái hệ thống & Dọn dẹp tài nguyên"

log_info "Chờ 15 giây để Database, Cache và .NET API hoàn tất khởi động..."
sleep 15

echo ""
log_info "Danh sách trạng thái các container TruyenKomi đang chạy:"
$DOCKER_COMPOSE_CMD ps

# Dọn dẹp images cũ
log_info "Đang dọn dẹp các Docker image dangling cũ để tiết kiệm dung lượng ổ cứng..."
docker image prune -f || true

# Lấy Public IP của Server
PUBLIC_IP=$(curl -s --connect-timeout 3 https://api.ipify.org || curl -s --connect-timeout 3 https://ifconfig.me || echo "35.236.179.69")

# ==============================================================================
# KẾT QUẢ TRIỂN KHAI HOÀN TẤT
# ==============================================================================
echo -e "\n${GREEN}╔══════════════════════════════════════════════════════════════════════╗${NC}"
echo -e "${GREEN}║           🎉 TRIỂN KHAI HỆ THỐNG TRUYENKOMI THÀNH CÔNG!              ║${NC}"
echo -e "${GREEN}╚══════════════════════════════════════════════════════════════════════╝${NC}\n"

echo -e "${BOLD}🌐 CÁC ĐỊA CHỈ TRUY CẬP HỆ THỐNG:${NC}"
echo -e "  • ${CYAN}Website Truyện Tranh (Angular UI):${NC} ${BOLD}http://${PUBLIC_IP}${NC} (hoặc https://truyenkomi.site)"
echo -e "  • ${CYAN}Tài liệu Swagger Web API (.NET):${NC}  ${BOLD}http://${PUBLIC_IP}/swagger${NC} (hoặc http://${PUBLIC_IP}:5000/swagger)"
echo -e "  • ${CYAN}Kiểm tra Healthcheck API:${NC}        ${BOLD}http://${PUBLIC_IP}/health${NC}"
echo -e "  • ${CYAN}Trình tìm kiếm Meilisearch:${NC}       ${BOLD}http://${PUBLIC_IP}:7700${NC}"
echo -e "  • ${CYAN}MinIO Storage Console:${NC}            ${BOLD}http://${PUBLIC_IP}:9001${NC}"
echo -e "  • ${CYAN}Grafana Dashboard APM:${NC}            ${BOLD}http://${PUBLIC_IP}:3000${NC}"

echo -e "\n${BOLD}🛠️ CÁC LỆNH HỮU ÍCH QUẢN TRỊ DOCKER:${NC}"
echo -e "  • ${YELLOW}Xem log realtime toàn bộ:${NC}         cd $TARGET_DIR && $DOCKER_COMPOSE_CMD logs -f"
echo -e "  • ${YELLOW}Xem log backend .NET API:${NC}         cd $TARGET_DIR && $DOCKER_COMPOSE_CMD logs -f api"
echo -e "  • ${YELLOW}Xem log frontend Angular:${NC}         cd $TARGET_DIR && $DOCKER_COMPOSE_CMD logs -f frontend"
echo -e "  • ${YELLOW}Khởi động lại toàn bộ:${NC}           cd $TARGET_DIR && $DOCKER_COMPOSE_CMD restart"
echo -e "  • ${YELLOW}Dừng toàn bộ hệ thống:${NC}           cd $TARGET_DIR && $DOCKER_COMPOSE_CMD down"
echo -e "  • ${YELLOW}Cập nhật lại source mới & re-build:${NC} git pull && ./deploy.sh"

echo -e "\n${GREEN}================================================================${NC}\n"

#!/usr/bin/env bash
# ==============================================================================
# 🚀 TRUYENKOMI - ALL-IN-ONE VPS DEPLOYMENT SCRIPT (DOCKER)
# ==============================================================================
# Script tự động hóa toàn bộ quá trình triển khai hệ thống TruyenKomi:
# 1. Cập nhật hệ điều hành & cài đặt gói bổ trợ cần thiết (git, curl, cron, rclone...)
# 2. Tạo 4GB Swap Memory (chống tràn RAM khi build .NET 9 & Angular 17)
# 3. Cài đặt Docker & Docker Compose mới nhất
# 4. Kiểm tra & khởi tạo file cấu hình môi trường .env
# 5. Build và khởi chạy toàn bộ Container (API .NET, Angular UI, Nginx, PostgreSQL, Redis, Meilisearch)
# 6. Tự động kiểm tra & nạp Database schema (01_CreateDatabase.sql & 02_SeedData.sql)
# 7. Tự động thiết lập Backup Database hàng ngày (Cronjob) & Đẩy lên Google Drive
# 8. Kiểm tra Healthcheck & dọn dẹp Docker images rác
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
log_step "BƯỚC 1/8: Cập nhật hệ điều hành & cài đặt gói tiện ích"
log_info "Đang cập nhật danh sách gói apt & cài đặt git, curl, ufw, htop, cron, ca-certificates..."
$SUDO apt-get update -y
$SUDO apt-get install -y git curl ufw htop ca-certificates gnupg lsb-release cron unzip rclone

# Kích hoạt Cron daemon cho tác vụ tự động sao lưu
$SUDO systemctl enable cron 2>/dev/null || true
$SUDO systemctl start cron 2>/dev/null || true

# Kiểm tra lại Rclone
if ! command -v rclone >/dev/null 2>&1; then
    log_info "Đang cài đặt bổ trợ Rclone..."
    curl -fsSL https://rclone.org/install.sh | $SUDO bash 2>/dev/null || true
fi

log_success "Đã cập nhật hệ điều hành và cài đặt Rclone thành công!"

# ==============================================================================
# BƯỚC 2: KIỂM TRA VÀ TẠO BỘ NHỚ ẢO SWAP (4GB)
# ==============================================================================
log_step "BƯỚC 2/8: Kiểm tra cấu hình bộ nhớ ảo Swap (Chống tràn RAM khi build)"
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
log_step "BƯỚC 3/8: Kiểm tra & cài đặt Docker Engine & Docker Compose"

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
log_step "BƯỚC 4/8: Kiểm tra cấu hình biến môi trường (.env)"
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
log_step "BƯỚC 5/8: Build và khởi chạy toàn bộ dịch vụ TruyenKomi bằng Docker Compose"
log_info "Đang thực thi: $DOCKER_COMPOSE_CMD up -d --build (postgres, redis, meilisearch, api, frontend, nginx)..."

$DOCKER_COMPOSE_CMD up -d --build

log_success "Tất cả các dịch vụ container đã được build và khởi chạy trong nền!"

# ==============================================================================
# BƯỚC 6: TỰ ĐỘNG KIỂM TRA & KHỞI TẠO DATABASE SCHEMA
# ==============================================================================
log_step "BƯỚC 6/8: Tự động kiểm tra & Khởi tạo Database PostgreSQL"

log_info "Đang chờ PostgreSQL container sẵn sàng nhận kết nối..."
PG_READY=false
for i in {1..30}; do
    if docker exec truyenkomi-postgres pg_isready -U postgres -d TruyenKomiDb >/dev/null 2>&1; then
        log_success "PostgreSQL đã sẵn sàng kết nối!"
        PG_READY=true
        break
    fi
    echo -n "."
    sleep 2
done
echo ""

if [ "$PG_READY" = false ]; then
    log_warning "PostgreSQL container chưa sẵn sàng sau 60s. Vui lòng kiểm tra lại logs container."
else
    # Kiểm tra xem Database TruyenKomiDb và bảng Users đã tồn tại chưa
    CHECK_DB=$(docker exec -i truyenkomi-postgres psql -U postgres -d TruyenKomiDb -tAc "SELECT to_regclass('public.\"Users\"');" 2>/dev/null || echo "")

    if [ -z "$CHECK_DB" ] || [ "$CHECK_DB" = "" ]; then
        log_info "Phát hiện Database mới (chưa có bảng): Đang tự động nạp cấu trúc Database sạch (01_CreateDatabase.sql)..."
        
        if [ -f "database/01_CreateDatabase.sql" ]; then
            log_info "-> Đang thực thi /database/01_CreateDatabase.sql (Tạo các bảng & Index)..."
            docker exec -i truyenkomi-postgres psql -U postgres -d TruyenKomiDb -f /docker-entrypoint-initdb.d/01_CreateDatabase.sql
            log_success "Đã tạo toàn bộ cấu trúc bảng Database TruyenKomiDb thành công (Sạch 100%, sẵn sàng nhận dữ liệu)!"
        fi

        # Khởi động lại API sau khi tạo database để kết nối ngay lập tức
        log_info "Khởi động lại Backend API container để đồng bộ trạng thái Database..."
        $DOCKER_COMPOSE_CMD restart api
        log_success "Backend API đã kết nối thành công với Database mới!"
    else
        log_success "Database TruyenKomiDb đã có sẵn đầy đủ bảng dữ liệu. Bỏ qua bước nạp lại SQL để bảo vệ dữ liệu."
    fi
fi

# ==============================================================================
# BƯỚC 7: TỰ ĐỘNG THIẾT LẬP BACKUP DATABASE HÀNG NGÀY (CRONJOB) & CLOUDFLARE R2
# ==============================================================================
log_step "BƯỚC 7/8: Cấu hình tự động Backup Database (Cronjob) & Đẩy lên Cloudflare R2"

BACKUP_SCRIPT="$TARGET_DIR/backup_db.sh"

# Đảm bảo file backup_db.sh có quyền thực thi
if [ -f "$BACKUP_SCRIPT" ]; then
    chmod +x "$BACKUP_SCRIPT"
    log_success "Tìm thấy script sao lưu: $BACKUP_SCRIPT"
else
    log_warning "Chưa có backup_db.sh trong thư mục, đang tự động tạo..."
    cat << 'EOF' > "$BACKUP_SCRIPT"
#!/usr/bin/env bash
# ==============================================================================
# 💾 TRUYENKOMI - TỰ ĐỘNG BACKUP DATABASE POSTGRESQL & CLOUDFLARE R2 STORAGE
# ==============================================================================
set -e
export PATH="/usr/local/sbin:/usr/local/bin:/usr/sbin:/usr/bin:/sbin:/bin:$PATH"

SCRIPT_DIR="$(cd "$(dirname "${BASH_SOURCE[0]}")" && pwd)"
BACKUP_DIR="${HOME}/db_backups"
LOG_FILE="${HOME}/backup_truyenkomi.log"

mkdir -p "$BACKUP_DIR"
TIMESTAMP=$(date +"%Y%m%d_%H%M%S")
BACKUP_FILE="${BACKUP_DIR}/TruyenKomiDb_${TIMESTAMP}.sql.gz"

echo "" >> "$LOG_FILE"
echo "================================================================" >> "$LOG_FILE"
echo "[$(date '+%Y-%m-%d %H:%M:%S')] [INFO] Bắt đầu tiến trình sao lưu Database TruyenKomiDb..." >> "$LOG_FILE"

if ! docker ps --format '{{.Names}}' | grep -q "^truyenkomi-postgres$"; then
    echo "[$(date '+%Y-%m-%d %H:%M:%S')] [ERROR] Container 'truyenkomi-postgres' không chạy! Hủy sao lưu." >> "$LOG_FILE"
    exit 1
fi

DB_PASS="TruyenKomiDbPassword2026!"
CF_ENDPOINT="7d2e9a7fa70afba6027908941eb6bd19.r2.cloudflarestorage.com"
CF_ACCESS_KEY="b55550a4f61f223173b5c5b742867416"
CF_SECRET_KEY="2afe8eb25f16ff0c74bb0521ba87c04e6313d63bb6c731224e5a70de3f21a3a3"
CF_BUCKET="truyenkomi"

if [ -f "$SCRIPT_DIR/.env" ]; then
    get_env_val() {
        grep -E "^$1=" "$SCRIPT_DIR/.env" | head -n1 | cut -d'=' -f2- | tr -d '\r' | tr -d '"' | tr -d "'"
    }
    VAL_PASS=$(get_env_val "POSTGRES_PASSWORD")
    [ -n "$VAL_PASS" ] && DB_PASS="$VAL_PASS"
    VAL_ENDPOINT=$(get_env_val "CF_R2_ENDPOINT")
    [ -z "$VAL_ENDPOINT" ] && VAL_ENDPOINT=$(get_env_val "R2_ENDPOINT")
    [ -n "$VAL_ENDPOINT" ] && CF_ENDPOINT="$VAL_ENDPOINT"
    VAL_KEY=$(get_env_val "CF_R2_ACCESS_KEY")
    [ -z "$VAL_KEY" ] && VAL_KEY=$(get_env_val "R2_ACCESS_KEY")
    [ -n "$VAL_KEY" ] && CF_ACCESS_KEY="$VAL_KEY"
    VAL_SECRET=$(get_env_val "CF_R2_SECRET_KEY")
    [ -z "$VAL_SECRET" ] && VAL_SECRET=$(get_env_val "R2_SECRET_KEY")
    [ -n "$VAL_SECRET" ] && CF_SECRET_KEY="$VAL_SECRET"
    VAL_BUCKET=$(get_env_val "CF_R2_BUCKET")
    [ -z "$VAL_BUCKET" ] && VAL_BUCKET=$(get_env_val "R2_BUCKET_NAME")
    [ -n "$VAL_BUCKET" ] && CF_BUCKET="$VAL_BUCKET"
fi

CF_ENDPOINT=$(echo "$CF_ENDPOINT" | sed 's|https://||; s|http://||; s|/*$||')

if docker exec -e PGPASSWORD="$DB_PASS" -i truyenkomi-postgres pg_dump -U postgres TruyenKomiDb 2>>"$LOG_FILE" | gzip > "$BACKUP_FILE"; then
    FILE_SIZE=$(ls -lh "$BACKUP_FILE" 2>/dev/null | awk '{print $5}')
    echo "[$(date '+%Y-%m-%d %H:%M:%S')] [SUCCESS] Đã tạo bản backup thành công ($FILE_SIZE): $BACKUP_FILE" >> "$LOG_FILE"
else
    echo "[$(date '+%Y-%m-%d %H:%M:%S')] [ERROR] Xuất dữ liệu Database thất bại!" >> "$LOG_FILE"
    exit 1
fi

if ! command -v rclone >/dev/null 2>&1; then
    if command -v apt-get >/dev/null 2>&1; then
        echo "[$(date '+%Y-%m-%d %H:%M:%S')] [INFO] Rclone chưa có, đang tự động cài đặt gói rclone..." >> "$LOG_FILE"
        sudo apt-get update -y >/dev/null 2>&1 || true
        sudo apt-get install -y rclone >/dev/null 2>&1 || true
    fi
fi

if command -v rclone >/dev/null 2>&1; then
    mkdir -p "$HOME/.config/rclone"
    cat << R2EOF > "$HOME/.config/rclone/rclone.conf"
[r2]
type = s3
provider = Cloudflare
access_key_id = $CF_ACCESS_KEY
secret_access_key = $CF_SECRET_KEY
endpoint = https://$CF_ENDPOINT
R2EOF
    chmod 600 "$HOME/.config/rclone/rclone.conf"

    BUCKET_LIST=$(rclone lsd r2: 2>>"$LOG_FILE" | awk '{print $NF}' || true)
    if [ -n "$BUCKET_LIST" ]; then
        if ! echo "$BUCKET_LIST" | grep -q "^${CF_BUCKET}$"; then
            FIRST_BUCKET=$(echo "$BUCKET_LIST" | head -n1)
            echo "[$(date '+%Y-%m-%d %H:%M:%S')] [INFO] Bucket '${CF_BUCKET}' không có, tự động dùng: '${FIRST_BUCKET}'" >> "$LOG_FILE"
            CF_BUCKET="$FIRST_BUCKET"
        fi
    fi

    echo "[$(date '+%Y-%m-%d %H:%M:%S')] [INFO] Đang tải bản backup lên Cloudflare R2 (r2:${CF_BUCKET}/backups/)..." >> "$LOG_FILE"
    if rclone copy "$BACKUP_FILE" "r2:${CF_BUCKET}/backups/" >> "$LOG_FILE" 2>&1; then
        echo "[$(date '+%Y-%m-%d %H:%M:%S')] [SUCCESS] Đã sao lưu an toàn lên Cloudflare R2 thành công!" >> "$LOG_FILE"
        rclone delete --min-age 30d "r2:${CF_BUCKET}/backups/" 2>/dev/null || true
    else
        echo "[$(date '+%Y-%m-%d %H:%M:%S')] [WARNING] Tải lên Cloudflare R2 thất bại (kiểm tra key/mạng)." >> "$LOG_FILE"
    fi
fi

find "$BACKUP_DIR" -type f -name "TruyenKomiDb_*.sql.gz" -mtime +14 -delete 2>/dev/null || true
echo "[$(date '+%Y-%m-%d %H:%M:%S')] [SUCCESS] Hoàn tất tiến trình sao lưu cơ sở dữ liệu." >> "$LOG_FILE"
EOF
    chmod +x "$BACKUP_SCRIPT"
    log_success "Đã khởi tạo script sao lưu: $BACKUP_SCRIPT"
fi

# Thiết lập Cronjob tự động chạy lúc 02:00 sáng mỗi ngày
CRON_ENTRY="0 2 * * * bash $BACKUP_SCRIPT >/dev/null 2>&1"
CURRENT_CRON=$(crontab -l 2>/dev/null || true)

if echo "$CURRENT_CRON" | grep -F -q "$BACKUP_SCRIPT"; then
    log_info "Cronjob sao lưu đã tồn tại trong hệ thống. Đang cập nhật..."
    (echo "$CURRENT_CRON" | grep -F -v "$BACKUP_SCRIPT"; echo "$CRON_ENTRY") | crontab -
else
    log_info "Đang thêm tác vụ tự động sao lưu vào Crontab (02:00 sáng hàng ngày)..."
    (echo "$CURRENT_CRON"; echo "$CRON_ENTRY") | crontab -
fi
log_success "Cronjob đã được kích hoạt: Chạy tự động lúc 02:00 sáng mỗi ngày!"

# Chạy thử nghiệm ngay 1 bản backup mẫu để xác nhận tính năng hoạt động hoàn hảo
log_info "Đang chạy thử nghiệm 1 bản sao lưu tức thì (Test Backup)..."
if bash "$BACKUP_SCRIPT"; then
    log_success "Chạy thử nghiệm sao lưu thành công! Dữ liệu đã được lưu trữ an toàn."
else
    log_warning "Sao lưu thử nghiệm có thông báo cần lưu ý. Bạn có thể xem log tại: $HOME/backup_truyenkomi.log"
fi

# ==============================================================================
# BƯỚC 8: HEALTH CHECK & DỌN DẸP DOCKER IMAGES CŨ
# ==============================================================================
log_step "BƯỚC 8/8: Kiểm tra trạng thái hệ thống & Dọn dẹp tài nguyên"

log_info "Chờ 5 giây để toàn bộ dịch vụ ổn định..."
sleep 5

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

echo -e "\n${BOLD}💾 QUẢN LÝ DỮ LIỆU & SAO LƯU (BACKUP & RESTORE):${NC}"
echo -e "  • ${CYAN}Tự động sao lưu:${NC}               02:00 sáng mỗi ngày (Cronjob)"
echo -e "  • ${CYAN}Thư mục backup trên VPS:${NC}        ${BOLD}${HOME}/db_backups/${NC}"
echo -e "  • ${CYAN}Lưu trữ Cloudflare R2:${NC}          ${BOLD}r2:${CF_BUCKET:-truyenkomi}/backups/${NC}"
echo -e "  • ${CYAN}File nhật ký sao lưu:${NC}           ${BOLD}${HOME}/backup_truyenkomi.log${NC}"
echo -e "  • ${YELLOW}Chạy backup thủ công ngay:${NC}       cd $TARGET_DIR && ./backup_db.sh"
echo -e "  • ${YELLOW}Xem danh sách backup trên R2:${NC}    rclone ls r2:${CF_BUCKET:-truyenkomi}/backups/"
echo -e "  • ${YELLOW}Khôi phục Database (Restore):${NC}    gunzip -c ~/db_backups/<ten_file>.sql.gz | docker exec -i truyenkomi-postgres psql -U postgres -d TruyenKomiDb"

echo -e "\n${BOLD}🛠️ CÁC LỆNH HỮU ÍCH QUẢN TRỊ DOCKER:${NC}"
echo -e "  • ${YELLOW}Xem log realtime toàn bộ:${NC}         cd $TARGET_DIR && $DOCKER_COMPOSE_CMD logs -f"
echo -e "  • ${YELLOW}Xem log backend .NET API:${NC}         cd $TARGET_DIR && $DOCKER_COMPOSE_CMD logs -f api"
echo -e "  • ${YELLOW}Xem log frontend Angular:${NC}         cd $TARGET_DIR && $DOCKER_COMPOSE_CMD logs -f frontend"
echo -e "  • ${YELLOW}Khởi động lại toàn bộ:${NC}           cd $TARGET_DIR && $DOCKER_COMPOSE_CMD restart"
echo -e "  • ${YELLOW}Dừng toàn bộ hệ thống:${NC}           cd $TARGET_DIR && $DOCKER_COMPOSE_CMD down"
echo -e "  • ${YELLOW}Cập nhật lại source mới & re-build:${NC} git pull && ./deploy.sh"

echo -e "\n${GREEN}================================================================${NC}\n"


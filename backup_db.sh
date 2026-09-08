#!/usr/bin/env bash
# ==============================================================================
# 💾 TRUYENKOMI - TỰ ĐỘNG BACKUP DATABASE POSTGRESQL & CLOUDFLARE R2 STORAGE
# ==============================================================================
set -e

# Đảm bảo đầy đủ PATH cho môi trường Cronjob
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

# 1. Kiểm tra container PostgreSQL có đang hoạt động hay không
if ! docker ps --format '{{.Names}}' | grep -q "^truyenkomi-postgres$"; then
    echo "[$(date '+%Y-%m-%d %H:%M:%S')] [ERROR] Container 'truyenkomi-postgres' không chạy! Hủy sao lưu." >> "$LOG_FILE"
    echo "[LỖI] Container truyenkomi-postgres không hoạt động. Vui lòng chạy 'docker compose up -d postgres'."
    exit 1
fi

# 2. Cấu hình Cloudflare R2 Storage (Mặc định dùng R2 từ cloudflare.md)
DB_PASS="TruyenKomiDbPassword2026!"
CF_ENDPOINT="7d2e9a7fa70afba6027908941eb6bd19.r2.cloudflarestorage.com"
CF_ACCESS_KEY="b55550a4f61f223173b5c5b742867416"
CF_SECRET_KEY="2afe8eb25f16ff0c74bb0521ba87c04e6313d63bb6c731224e5a70de3f21a3a3"
CF_BUCKET="comics"

if [ -f "$SCRIPT_DIR/.env" ]; then
    get_env_val() {
        grep -E "^$1=" "$SCRIPT_DIR/.env" | head -n1 | cut -d'=' -f2- | tr -d '\r' | tr -d '"' | tr -d "'"
    }
    
    VAL_PASS=$(get_env_val "POSTGRES_PASSWORD")
    [ -n "$VAL_PASS" ] && DB_PASS="$VAL_PASS"

    # Chỉ ghi đè nếu trong .env có khai báo rõ ràng CF_R2_*
    VAL_ENDPOINT=$(get_env_val "CF_R2_ENDPOINT")
    [ -n "$VAL_ENDPOINT" ] && CF_ENDPOINT="$VAL_ENDPOINT"

    VAL_KEY=$(get_env_val "CF_R2_ACCESS_KEY")
    [ -n "$VAL_KEY" ] && CF_ACCESS_KEY="$VAL_KEY"

    VAL_SECRET=$(get_env_val "CF_R2_SECRET_KEY")
    [ -n "$VAL_SECRET" ] && CF_SECRET_KEY="$VAL_SECRET"

    VAL_BUCKET=$(get_env_val "CF_R2_BUCKET")
    [ -n "$VAL_BUCKET" ] && CF_BUCKET="$VAL_BUCKET"
fi

# Chuẩn hóa Endpoint (loại bỏ https:// nếu có)
CF_ENDPOINT=$(echo "$CF_ENDPOINT" | sed 's|https://||; s|http://||; s|/*$||')

# Tự động xác định Provider tương ứng với Endpoint
S3_PROVIDER="Cloudflare"
if [[ "$CF_ENDPOINT" == *"storage.googleapis.com"* ]]; then
    S3_PROVIDER="GCS"
elif [[ "$CF_ENDPOINT" == *"backblazeb2.com"* ]]; then
    S3_PROVIDER="Backblaze"
fi

# 3. Xuất database PostgreSQL ra file nén gzip
echo "[$(date '+%Y-%m-%d %H:%M:%S')] [INFO] Đang trích xuất dữ liệu từ PostgreSQL..." >> "$LOG_FILE"
if docker exec -e PGPASSWORD="$DB_PASS" -i truyenkomi-postgres pg_dump -U postgres TruyenKomiDb 2>>"$LOG_FILE" | gzip > "$BACKUP_FILE"; then
    FILE_SIZE=$(ls -lh "$BACKUP_FILE" 2>/dev/null | awk '{print $5}')
    echo "[$(date '+%Y-%m-%d %H:%M:%S')] [SUCCESS] Đã tạo bản backup thành công ($FILE_SIZE): $BACKUP_FILE" >> "$LOG_FILE"
    echo "  -> [THÀNH CÔNG] Đã tạo file backup database ($FILE_SIZE) tại: $BACKUP_FILE"
else
    echo "[$(date '+%Y-%m-%d %H:%M:%S')] [ERROR] Xuất dữ liệu Database thất bại!" >> "$LOG_FILE"
    echo "  -> [LỖI] Xuất dữ liệu thất bại. Xem chi tiết tại $LOG_FILE"
    exit 1
fi

# 4. Tự động đồng bộ lên Cloudflare R2 Storage qua Rclone (S3 Protocol)
if ! command -v rclone >/dev/null 2>&1; then
    if command -v apt-get >/dev/null 2>&1; then
        echo "[$(date '+%Y-%m-%d %H:%M:%S')] [INFO] Rclone chưa có, đang tự động cài đặt gói rclone..." >> "$LOG_FILE"
        sudo apt-get update -y >/dev/null 2>&1 || true
        sudo apt-get install -y rclone >/dev/null 2>&1 || true
    fi
fi

if command -v rclone >/dev/null 2>&1; then
    # Cấu hình Rclone Remote 'r2' tự động từ API Key (Cloudflare R2 KHÔNG dùng ACL)
    mkdir -p "$HOME/.config/rclone"
    cat << R2EOF > "$HOME/.config/rclone/rclone.conf"
[r2]
type = s3
provider = $S3_PROVIDER
access_key_id = $CF_ACCESS_KEY
secret_access_key = $CF_SECRET_KEY
endpoint = https://$CF_ENDPOINT
R2EOF
    chmod 600 "$HOME/.config/rclone/rclone.conf"

    # Tự động kiểm tra và nhận diện Bucket hợp lệ trên tài khoản R2
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
        echo "  -> [THÀNH CÔNG] Đã lưu lên Cloudflare R2: r2:${CF_BUCKET}/backups/TruyenKomiDb_${TIMESTAMP}.sql.gz"
        
        # Tự động dọn dẹp các bản backup cũ hơn 30 ngày trên Cloudflare R2
        rclone delete --min-age 30d "r2:${CF_BUCKET}/backups/" 2>/dev/null || true
    else
        echo "[$(date '+%Y-%m-%d %H:%M:%S')] [WARNING] Tải lên Cloudflare R2 thất bại (kiểm tra key/mạng)." >> "$LOG_FILE"
        echo "  -> [CẢNH BÁO] Chưa thể tải lên Cloudflare R2. Vui lòng kiểm tra lại log: $LOG_FILE"
    fi
else
    echo "[$(date '+%Y-%m-%d %H:%M:%S')] [INFO] Chưa cài đặt Rclone. Bản backup chỉ lưu trữ cục bộ trên VPS." >> "$LOG_FILE"
    echo "  -> [INFO] Máy chủ chưa có Rclone. File backup hiện được lưu tại VPS: $BACKUP_DIR"
fi

# 5. Tự động xóa các file backup trên VPS cũ hơn 14 ngày để chống tràn ổ cứng
CLEANED_COUNT=0
for old_file in $(find "$BACKUP_DIR" -type f -name "TruyenKomiDb_*.sql.gz" -mtime +14 2>/dev/null); do
    rm -f "$old_file"
    CLEANED_COUNT=$((CLEANED_COUNT + 1))
done

if [ "$CLEANED_COUNT" -gt 0 ]; then
    echo "[$(date '+%Y-%m-%d %H:%M:%S')] [INFO] Đã tự động dọn dẹp $CLEANED_COUNT bản backup cũ quá 14 ngày trên VPS." >> "$LOG_FILE"
fi

echo "[$(date '+%Y-%m-%d %H:%M:%S')] [SUCCESS] Hoàn tất tiến trình sao lưu cơ sở dữ liệu." >> "$LOG_FILE"

#!/usr/bin/env bash
# ==============================================================================
# 💾 TRUYENKOMI - TỰ ĐỘNG BACKUP DATABASE POSTGRESQL & CLOUDFLARE R2 STORAGE
# ==============================================================================
export PATH="/usr/local/sbin:/usr/local/bin:/usr/sbin:/usr/bin:/sbin:/bin:$PATH"

SCRIPT_DIR="$(cd "$(dirname "${BASH_SOURCE[0]}")" && pwd)"
BACKUP_DIR="${HOME}/db_backups"
LOG_FILE="${HOME}/backup_truyenkomi.log"

mkdir -p "$BACKUP_DIR"

TIMESTAMP=$(date +"%Y%m%d_%H%M%S")
BACKUP_FILE="${BACKUP_DIR}/TruyenKomiDb_${TIMESTAMP}.sql.gz"

echo "" | tee -a "$LOG_FILE"
echo "================================================================" | tee -a "$LOG_FILE"
echo "[$(date '+%Y-%m-%d %H:%M:%S')] [INFO] Bắt đầu tiến trình sao lưu Database TruyenKomiDb..." | tee -a "$LOG_FILE"

# 1. Cấu hình Cloudflare R2 Storage & Database
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

S3_PROVIDER="Cloudflare"
if [[ "$CF_ENDPOINT" == *"storage.googleapis.com"* ]]; then
    S3_PROVIDER="GCS"
elif [[ "$CF_ENDPOINT" == *"backblazeb2.com"* ]]; then
    S3_PROVIDER="Backblaze"
fi

# 2. Khởi tạo cấu hình Rclone Remote 'r2' ngay lập tức
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

# 3. Kiểm tra container PostgreSQL có đang chạy hay không
CONTAINER_RUNNING=$(docker ps --filter "name=postgres" --filter "status=running" --format "{{.Names}}" | head -n1)
if [ -z "$CONTAINER_RUNNING" ]; then
    echo "[$(date '+%Y-%m-%d %H:%M:%S')] [ERROR] Không tìm thấy container Postgres đang chạy! Hủy sao lưu." | tee -a "$LOG_FILE"
    echo "[LỖI] Container postgres không hoạt động. Vui lòng kiểm tra 'docker compose ps'."
    exit 1
fi
echo "[$(date '+%Y-%m-%d %H:%M:%S')] [INFO] Đang dùng container Postgres: $CONTAINER_RUNNING" | tee -a "$LOG_FILE"

# 4. Xuất database PostgreSQL ra file nén gzip
echo "[$(date '+%Y-%m-%d %H:%M:%S')] [INFO] Đang trích xuất dữ liệu từ PostgreSQL..." | tee -a "$LOG_FILE"
if docker exec -e PGPASSWORD="$DB_PASS" -i "$CONTAINER_RUNNING" pg_dump -U postgres TruyenKomiDb 2>>"$LOG_FILE" | gzip > "$BACKUP_FILE"; then
    FILE_SIZE=$(ls -lh "$BACKUP_FILE" 2>/dev/null | awk '{print $5}')
    echo "[$(date '+%Y-%m-%d %H:%M:%S')] [SUCCESS] Đã tạo bản backup ($FILE_SIZE): $BACKUP_FILE" | tee -a "$LOG_FILE"
else
    echo "[$(date '+%Y-%m-%d %H:%M:%S')] [ERROR] Xuất dữ liệu Database thất bại!" | tee -a "$LOG_FILE"
    exit 1
fi

# 5. Tự động đồng bộ lên Cloudflare R2 Storage qua Rclone
if ! command -v rclone >/dev/null 2>&1; then
    if command -v apt-get >/dev/null 2>&1; then
        echo "[$(date '+%Y-%m-%d %H:%M:%S')] [INFO] Rclone chưa có, đang cài đặt..." | tee -a "$LOG_FILE"
        sudo apt-get update -y >/dev/null 2>&1 || true
        sudo apt-get install -y rclone >/dev/null 2>&1 || true
    fi
fi

if command -v rclone >/dev/null 2>&1; then
    # Kiểm tra bucket trên R2
    BUCKET_LIST=$(rclone lsd r2: 2>>"$LOG_FILE" | awk '{print $NF}' || true)
    if [ -n "$BUCKET_LIST" ]; then
        if ! echo "$BUCKET_LIST" | grep -q "^${CF_BUCKET}$"; then
            FIRST_BUCKET=$(echo "$BUCKET_LIST" | head -n1)
            echo "[$(date '+%Y-%m-%d %H:%M:%S')] [INFO] Bucket '${CF_BUCKET}' không khớp, dùng bucket có sẵn: '${FIRST_BUCKET}'" | tee -a "$LOG_FILE"
            CF_BUCKET="$FIRST_BUCKET"
        fi
    fi

    echo "[$(date '+%Y-%m-%d %H:%M:%S')] [INFO] Đang tải bản backup lên Cloudflare R2: r2:${CF_BUCKET}/backups/..." | tee -a "$LOG_FILE"
    if rclone copy "$BACKUP_FILE" "r2:${CF_BUCKET}/backups/" --stats=5s -P 2>>"$LOG_FILE"; then
        echo "[$(date '+%Y-%m-%d %H:%M:%S')] [SUCCESS] Đã sao lưu an toàn lên Cloudflare R2 thành công!" | tee -a "$LOG_FILE"
        echo "  -> [THÀNH CÔNG] Đã lưu lên Cloudflare R2: r2:${CF_BUCKET}/backups/TruyenKomiDb_${TIMESTAMP}.sql.gz"
        
        # Tự động dọn dẹp các bản backup cũ hơn 30 ngày trên Cloudflare R2
        rclone delete --min-age 30d "r2:${CF_BUCKET}/backups/" 2>/dev/null || true
    else
        echo "[$(date '+%Y-%m-%d %H:%M:%S')] [WARNING] Tải lên Cloudflare R2 thất bại (xem log: $LOG_FILE)." | tee -a "$LOG_FILE"
    fi
else
    echo "[$(date '+%Y-%m-%d %H:%M:%S')] [INFO] Chưa cài đặt Rclone. Bản backup chỉ lưu tại VPS: $BACKUP_DIR" | tee -a "$LOG_FILE"
fi

# 6. Tự động xóa các file backup trên VPS cũ hơn 14 ngày
CLEANED_COUNT=0
for old_file in $(find "$BACKUP_DIR" -type f -name "TruyenKomiDb_*.sql.gz" -mtime +14 2>/dev/null); do
    rm -f "$old_file"
    CLEANED_COUNT=$((CLEANED_COUNT + 1))
done

if [ "$CLEANED_COUNT" -gt 0 ]; then
    echo "[$(date '+%Y-%m-%d %H:%M:%S')] [INFO] Đã tự động dọn dẹp $CLEANED_COUNT bản backup cũ quá 14 ngày trên VPS." | tee -a "$LOG_FILE"
fi

echo "[$(date '+%Y-%m-%d %H:%M:%S')] [SUCCESS] Hoàn tất tiến trình sao lưu cơ sở dữ liệu." | tee -a "$LOG_FILE"

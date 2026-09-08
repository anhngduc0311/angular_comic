#!/usr/bin/env bash
# ==============================================================================
# 💾 TRUYENKOMI - TỰ ĐỘNG BACKUP DATABASE POSTGRESQL & ĐỒNG BỘ GOOGLE DRIVE
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

# 1. Kiểm tra container PostgreSQL có đang chạy hay không
if ! docker ps --format '{{.Names}}' | grep -q "^truyenkomi-postgres$"; then
    echo "[$(date '+%Y-%m-%d %H:%M:%S')] [ERROR] Container 'truyenkomi-postgres' không chạy! Hủy sao lưu." >> "$LOG_FILE"
    echo "[LỖI] Container truyenkomi-postgres không hoạt động. Vui lòng chạy 'docker compose up -d postgres'."
    exit 1
fi

# 2. Lấy password từ .env nếu có, fallback mật khẩu mặc định
DB_PASS="TruyenKomiDbPassword2026!"
if [ -f "$SCRIPT_DIR/.env" ]; then
    ENV_PASS=$(grep -E "^POSTGRES_PASSWORD=" "$SCRIPT_DIR/.env" | cut -d'=' -f2- | tr -d '\r' | tr -d '"' | tr -d "'")
    if [ -n "$ENV_PASS" ]; then
        DB_PASS="$ENV_PASS"
    fi
fi

# 3. Xuất database ra file nén gzip
echo "[$(date '+%Y-%m-%d %H:%M:%S')] [INFO] Đang trích xuất dữ liệu từ PostgreSQL..." >> "$LOG_FILE"
if docker exec -e PGPASSWORD="$DB_PASS" -i truyenkomi-postgres pg_dump -U postgres TruyenKomiDb 2>>"$LOG_FILE" | gzip > "$BACKUP_FILE"; then
    FILE_SIZE=$(ls -lh "$BACKUP_FILE" 2>/dev/null | awk '{print $5}')
    echo "[$(date '+%Y-%m-%d %H:%M:%S')] [SUCCESS] Đã tạo bản backup thành công ($FILE_SIZE): $BACKUP_FILE" >> "$LOG_FILE"
    echo "[THÀNH CÔNG] Đã tạo file backup database ($FILE_SIZE) tại: $BACKUP_FILE"
else
    echo "[$(date '+%Y-%m-%d %H:%M:%S')] [ERROR] Xuất dữ liệu Database thất bại!" >> "$LOG_FILE"
    echo "[LỖI] Xuất dữ liệu thất bại. Xem chi tiết tại $LOG_FILE"
    exit 1
fi

# 4. Tự động đồng bộ lên Google Drive qua Rclone (nếu có remote gdrive)
if command -v rclone >/dev/null 2>&1; then
    # Nếu chưa có cấu hình ở HOME nhưng có file rclone.conf ở repo thì nạp tự động
    if [ ! -f "$HOME/.config/rclone/rclone.conf" ] && [ -f "$SCRIPT_DIR/rclone.conf" ]; then
        mkdir -p "$HOME/.config/rclone"
        cp "$SCRIPT_DIR/rclone.conf" "$HOME/.config/rclone/rclone.conf"
        chmod 600 "$HOME/.config/rclone/rclone.conf"
    fi

    if rclone listremotes 2>/dev/null | grep -q "^gdrive:"; then
        echo "[$(date '+%Y-%m-%d %H:%M:%S')] [INFO] Đang tải bản backup lên Google Drive (gdrive:TruyenKomi_Backups/)..." >> "$LOG_FILE"
        if rclone copy "$BACKUP_FILE" gdrive:TruyenKomi_Backups/ >> "$LOG_FILE" 2>&1; then
            echo "[$(date '+%Y-%m-%d %H:%M:%S')] [SUCCESS] Đã đẩy bản backup lên Google Drive thành công!" >> "$LOG_FILE"
            echo "[THÀNH CÔNG] Đã sao lưu an toàn lên Google Drive: TruyenKomi_Backups/TruyenKomiDb_${TIMESTAMP}.sql.gz"
        else
            echo "[$(date '+%Y-%m-%d %H:%M:%S')] [WARNING] Tải lên Google Drive thất bại (kiểm tra token/mạng)." >> "$LOG_FILE"
            echo "[CẢNH BÁO] Không thể tải lên Google Drive. Vui lòng kiểm tra lại cấu hình rclone hoặc token."
        fi
    else
        echo "[$(date '+%Y-%m-%d %H:%M:%S')] [INFO] Rclone chưa cấu hình remote 'gdrive:'. Đã lưu trữ cục bộ tại VPS." >> "$LOG_FILE"
        echo "[INFO] Chưa cấu hình remote 'gdrive:'. File backup hiện được lưu an toàn tại VPS: $BACKUP_DIR"
    fi
else
    echo "[$(date '+%Y-%m-%d %H:%M:%S')] [INFO] Máy chủ chưa cài đặt Rclone. File backup chỉ lưu tại VPS." >> "$LOG_FILE"
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

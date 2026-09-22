Client ID
510177815251-88f3mqoiatfct4jj0bhnuhmol985ae0s.apps.googleusercontent.com
Client secret
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



 Backblaze B2
akzan0311@gmail.com
Nguyenducanh2003@


GOOGQHRXVRS7YCR24JBLB33S
3Iamo8whmuUeT2B+CMtRnfW6qdIsmwXVec47tF52


deploy vps ubuntu 22.04

sudo su -
usermod -aG sudo akzan0311
passwd akzan0311
sudo apt update && sudo apt install -y git && sudo apt install nano -y

git config --global credential.helper store
git clone https://github.com/anhngduc0311/angular_comic.git
Username: anhngduc0311
Password: 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

cd ~/angular_comic
git branch -a
git checkout mangadex
chmod +x deploy.sh
./deploy.sh

chmod +x tai_mangadex_ubuntu.sh
./tai_mangadex_ubuntu.sh

cd docker_env
docker compose up -d
docker compose down -v

docker compose logs -f crawler

docker-compose up -d postgres redis meilisearch

# ================= SAO LƯU & AN TOÀN DỮ LIỆU =================
# 1. Chạy sao lưu Database thủ công bất kỳ lúc nào:
./backup_db.sh

# 2. Xem danh sách backup đã lưu trên Cloudflare R2:
# rclone ls r2:truyenkomi/backups/

# 3. Tải file backup từ Cloudflare R2 về VPS khi cần:
# rclone copy r2:truyenkomi/backups/<ten_file>.sql.gz ~/db_backups/

# 4. Khôi phục dữ liệu Database từ bản backup khi cần:
# gunzip -c ~/db_backups/<ten_file>.sql.gz | docker exec -i truyenkomi-postgres psql -U postgres -d TruyenKomiDb
# docker compose restart api

# 5. Khởi động lại hoặc cập nhật (KHÔNG MẤT DỮ LIỆU):
# docker compose down && ./deploy.sh

# ⚠️ CẢNH BÁO: Lệnh dưới đây sẽ XÓA SẠCH toàn bộ Database và công cào truyện:
# xoa docker (chi dung khi muon reset trang web tu dau):
# docker compose down -v





Bước 1: Tạm dừng API và làm sạch Database cũ
# 1. Tạm dừng API để giải phóng kết nối database
docker compose stop api

# 2. Ngắt các kết nối đang mở đến database
docker exec -i truyenkomi-postgres psql -U postgres -c "SELECT pg_terminate_backend(pid) FROM pg_stat_activity WHERE datname = 'TruyenKomiDb' AND pid <> pg_backend_pid();"

# 3. Xóa database cũ bị xung đột
docker exec -i truyenkomi-postgres psql -U postgres -c 'DROP DATABASE IF EXISTS "TruyenKomiDb";'

# 4. Tạo lại database trắng sạch sẽ
docker exec -i truyenkomi-postgres psql -U postgres -c 'CREATE DATABASE "TruyenKomiDb";'

Bước 2: Nạp bản backup 125MB vào Database
gunzip -c ~/db_backups/TruyenKomiDb_20260921_145811.sql.gz | docker exec -i truyenkomi-postgres psql -U postgres -d TruyenKomiDb


Bước 3: Khởi động lại API

docker compose start api
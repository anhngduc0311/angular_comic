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
git checkout truyenggclone
chmod +x deploy.sh
./deploy.sh

chmod +x tai_mangadex_drive.sh
./tai_mangadex_drive.sh

# ================= SAO LƯU & AN TOÀN DỮ LIỆU =================
# 1. Chạy sao lưu Database thủ công bất kỳ lúc nào:
./backup_db.sh

# 2. Khôi phục dữ liệu Database từ bản backup khi cần:
# gunzip -c ~/db_backups/<ten_file>.sql.gz | docker exec -i truyenkomi-postgres psql -U postgres -d TruyenKomiDb

# 3. Khởi động lại hoặc cập nhật (KHÔNG MẤT DỮ LIỆU):
# docker compose down && ./deploy.sh

# ⚠️ CẢNH BÁO: Lệnh dưới đây sẽ XÓA SẠCH toàn bộ Database và công cào truyện:
# xoa docker (chi dung khi muon reset trang web tu dau):
# docker compose down -v

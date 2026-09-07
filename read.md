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
sudo apt update && sudo apt install -y git

git config --global credential.helper store
git clone https://github.com/anhngduc0311/angular_comic.git
Username: anhngduc0311
Password: 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

cd ~/angular_comic
git branch -a
git checkout truyenggclone
chmod +x deploy.sh
./deploy.sh

xoa docker
docker compose down -v
./deploy.sh




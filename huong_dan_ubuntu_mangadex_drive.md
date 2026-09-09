# 🚀 Hướng Dẫn: Tải Toàn Bộ Truyện MangaDex Lưu Vào Cloud Storage Bucket & Web API Trên Ubuntu

Tài liệu này hướng dẫn chi tiết cách chạy file **`tai_mangadex_ubuntu.sh`** trên máy tính hoặc máy chủ **Ubuntu / Debian** để cào toàn bộ hơn **6.600+ bộ truyện Tiếng Việt** trên MangaDex và lưu tự động vào Cloud Storage Bucket & Web API TruyenKomi:
👉 **Cloud Storage Bucket**: `truyenkomi` (Google Cloud Storage / R2 S3 API)  
👉 **CDN Base URL**: `https://img.truyenkomi.site`  
👉 **Web API**: `https://truyenkomi.com/api`  
👉 **Bộ nhớ ảo Swap**: Tự động tạo 4GB / 2GB Swap chống tràn RAM khi chạy đa luồng  
👉 *(Đã tắt lưu trữ trên Google Drive - Không cần cấu hình Rclone hay OAuth Token nữa)*

---

## ⚙️ Thiết Lập Mặc Định (Khớp 100% Giao Diện Của Bạn)

File script đã được cấu hình mặc định sẵn các tùy chọn xử lý chính xác như sau:
* ☑️ **Tự động tải lên Cloud Storage Bucket & Đồng bộ Web API**: `BẬT` (Lưu trực tiếp vào bucket `truyenkomi` & đồng bộ website)
* ☑️ **Tự động tạo bộ nhớ ảo Swap (4GB/2GB)**: `BẬT` (Ngăn chặn tràn RAM / OOM Killer khi chạy 32 luồng)
* ☑️ **Bỏ qua chapter đã có trên máy / Cloud (Tránh tải trùng / Resume)**: `BẬT` (Kiểm tra và bỏ qua chapter đã tải)
* ⬜ **MangaDex Data-Saver (Tải ảnh nén nhẹ tiết kiệm mạng)**: `TẮT` (**Tải ẢNH GỐC** chất lượng cao nhất)
* ☑️ **Ghép ảnh Manhwa 5-in-1 (Tự động khi chapter > 70 ảnh)**: `BẬT` (Tự động ghép 5 lát cắt thành 1 ảnh dài WebP)
* ⬜ **Tự động xuất mỗi chapter thành file PDF**: `TẮT`
* ⚡ **Luồng tải & upload song song**: `32 luồng` (Tối ưu Turbo Speed)

---

## 🌟 Điểm Vượt Trội Của File Script (Tối Ưu Turbo Speed)

1. **Tự động tạo bộ nhớ ảo Swap (Chống tràn RAM / Out-of-Memory)**:
   - Tự động kiểm tra bộ nhớ RAM và tạo Swapfile 4GB (hoặc 2GB nếu ổ cứng nhỏ) tại `/swapfile`.
   - Giúp các VPS gói thấp (1GB - 2GB RAM) có thể chạy mượt mà 32 luồng tải song song mà không bao giờ bị hệ thống Linux kill tiến trình (`Killed`).
2. **Tăng tốc độ tải & upload vượt trội (gấp 5 - 10 lần)**:
   - **Tái sử dụng kết nối HTTP Keep-Alive (Connection Pooling)**: Không phải tạo lại kết nối SSL/TLS cho từng ảnh, tiết kiệm hàng chục giây cho mỗi chapter.
   - **Nén WebP đa luồng song song**: Nén WebP cùng lúc trên đa nhân CPU với thuật toán tối ưu `method=4`, xử lý xong cả chapter trong 1-2 giây.
   - **Ghép dải Manhwa song song**: Các nhóm lát cắt Manhwa được xử lý đồng thời.
   - **Tải & upload 32 luồng song song**: Tận dụng tối đa băng thông mạng VPS / máy chủ.
3. **Chỉ cần đúng 1 file duy nhất (`tai_mangadex_ubuntu.sh`)**:
   - Tự động kiểm tra và cài đặt Python 3, pip, Virtualenv và các thư viện cần thiết.
   - Script tự trích xuất mã nguồn engine nếu chưa có trên máy.
4. **Cơ chế chống tràn ổ cứng VPS (Zero-Disk Buildup)**:
   - Tải và xử lý xong chapter nào ➡️ Tự động đẩy ngay lên Cloud Storage Bucket & Web API ➡️ Xóa sạch file đệm trên máy chủ.
   - Dù máy chủ Ubuntu chỉ có ổ cứng 20GB - 40GB vẫn tải được hàng trăm GB truyện mà không bao giờ lo đầy ổ cứng.
5. **Chất lượng ảnh gốc tối đa & Ghép Manhwa 5-in-1 mượt mà**:
   - Tải file ảnh gốc sắc nét từ MangaDex Network và tự động ghép các dải ảnh cuộn Manhwa khi có > 70 ảnh.
6. **Tự động lưu tiến trình (Resume Checkpoint)**:
   - File `mangadex_sync_state.json` ghi nhận danh sách truyện và chapter đã tải.
   - Nếu bị đứt mạng, khởi động lại VPS hoặc tắt máy, lần chạy tiếp theo sẽ tự động bỏ qua các truyện/chapter đã có, tiếp tục tải ngay lập tức.
7. **Hỗ trợ chạy ngầm 24/7 (Background Nohup)**:
   - Bạn có thể ngắt kết nối SSH, tắt máy tính cá nhân, máy chủ Ubuntu vẫn tự động tải xuyên ngày đêm.

---

## 📥 Bước 1: Đưa File Lên Máy Chủ Ubuntu

Bạn có thể đưa file `tai_mangadex_ubuntu.sh` lên máy Ubuntu theo một trong các cách sau:

### Cách 1: Sao chép qua lệnh `scp` (từ Windows)
Mở PowerShell trên máy Windows của bạn:
```powershell
scp d:\Project\angular_comic\tai_mangadex_ubuntu.sh user@dia_chi_ip_ubuntu:~/
```

### Cách 2: Nếu máy Ubuntu đã clone Git của dự án
Tại thư mục dự án trên Ubuntu:
```bash
git pull
chmod +x tai_mangadex_ubuntu.sh
```

### Cách 3: Tạo trực tiếp trên máy Ubuntu bằng `nano`
```bash
nano tai_mangadex_ubuntu.sh
# Dán toàn bộ nội dung file tai_mangadex_ubuntu.sh vào, bấm Ctrl+O -> Enter -> Ctrl+X để lưu
chmod +x tai_mangadex_ubuntu.sh
```

---

## ⚡ Bước 2: Khởi Chạy Script Trên Ubuntu

Tại terminal của máy Ubuntu, gõ lệnh:

```bash
bash tai_mangadex_ubuntu.sh
```

Lần đầu tiên khởi chạy:
- Script sẽ tự động tạo bộ nhớ ảo Swap (4GB / 2GB) và cài đặt `python3`, `python3-venv`, `pillow`, `requests`, `rich`.
- Màn hình Menu tương tác sẽ hiển thị:

```text
================================================================
🚀 MANGADEX TO CLOUD STORAGE & WEB SYNCHRONIZER (UBUNTU)
   Cloud Bucket: truyenkomi (Google Cloud Storage / R2)
   Web API:      https://truyenkomi.com/api
   Bộ nhớ ảo:    🟢 4096MB (Đã kích hoạt)
   Google Drive: ĐÃ TẮT (Chỉ lưu Cloud Bucket & Web)
================================================================
  [1] 🚀 Tải TOÀN BỘ truyện MangaDex Tiếng Việt (Chạy trực tiếp 32 luồng)
  [2] ⚡ Tải 1 bộ truyện cụ thể (Nhập link MangaDex hoặc UUID)
  [3] 🔄 Chạy ngầm trong nền 24/7 (nohup) - An toàn khi ngắt SSH
  [4] 📊 Xem trạng thái, thống kê & nhật ký (Logs)
  [5] 🛑 Dừng tiến trình tải ngầm
  [6] 🛡️  Thiết lập / Bật bộ nhớ ảo Swap (4GB / 2GB)
  [0] ❌ Thoát
----------------------------------------------------------------
Chọn thao tác [0-6]:
```

---

## 🚀 Bước 3: Bắt Đầu Tải Truyện

### Tùy chọn A: Chạy ngầm 24/7 (Khuyên Dùng Cho Máy Chủ / VPS)
- Chọn phím **`3`** trên menu (hoặc chạy lệnh: `./tai_mangadex_ubuntu.sh --bg`).
- Script sẽ kích hoạt tiến trình chạy ngầm qua `nohup`.
- Lúc này bạn có thể **tắt terminal SSH**, **tắt máy tính cá nhân**, máy chủ Ubuntu vẫn sẽ tải liên tục từng bộ truyện và tự đẩy lên Cloud Bucket & Web API.

### Tùy chọn B: Xem tiến độ & nhật ký thời gian thực
- Chọn phím **`4`** trên menu để xem thống kê số truyện, số chương, số ảnh đã hoàn thành và dung lượng RAM/Swap đang sử dụng.
- Hoặc gõ lệnh xem nhật ký live:
  ```bash
  tail -f mangadex_sync.log
  ```

### Tùy chọn C: Tải 1 bộ truyện cụ thể để kiểm tra
- Chọn phím **`2`** trên menu (hoặc gõ: `./tai_mangadex_ubuntu.sh --url https://mangadex.org/title/36300a46-485b-4c05-a570-ac3b23de3952`).
- Script sẽ tải đầy đủ các chương Tiếng Việt của bộ truyện đó và đẩy ngay lên Cloud Storage Bucket & Web.

---

## 📁 Cấu Trúc File Lưu Trữ Trên Cloud Storage Bucket

Trong Cloud Bucket **`truyenkomi`**, dữ liệu ảnh WebP sẽ được lưu theo cấu trúc chuẩn:

```text
truyenkomi (Bucket)/
├── covers/
│   ├── komi-san-wa-komyushou-desu.webp
│   ├── solo-leveling.webp
│   └── ...
└── chapters/
    ├── komi-san-wa-komyushou-desu/
    │   ├── chap1/
    │   │   ├── page_001.webp
    │   │   ├── page_002.webp
    │   │   └── ...
    │   └── chap2/
    │       └── ...
    └── solo-leveling/
        └── ...
```

---

## 🛠️ Các Lệnh Thao Tác Nhanh (CLI Shortcut)

Nếu bạn muốn tạo cronjob hoặc tự động hóa trong bash script khác:

```bash
# Thiết lập bộ nhớ ảo Swap:
./tai_mangadex_ubuntu.sh --setup-swap

# Chạy tải toàn bộ MangaDex trực tiếp (32 luồng):
./tai_mangadex_ubuntu.sh --all

# Chạy ngầm trong nền 24/7 (32 luồng):
./tai_mangadex_ubuntu.sh --bg

# Xem trạng thái tiến trình, thống kê và bộ nhớ:
./tai_mangadex_ubuntu.sh --status

# Dừng tiến trình chạy ngầm:
./tai_mangadex_ubuntu.sh --stop

# Tải 1 bộ truyện cụ thể:
./tai_mangadex_ubuntu.sh --url "https://mangadex.org/title/uuid-truyen"
```

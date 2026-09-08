# 🚀 Hướng Dẫn: Tải Toàn Bộ Truyện MangaDex Lưu Trực Tiếp Vào Google Drive Trên Ubuntu

Tài liệu này hướng dẫn chi tiết cách chạy file **`tai_mangadex_drive.sh`** trên máy tính hoặc máy chủ **Ubuntu / Debian** để cào toàn bộ hơn **6.600+ bộ truyện Tiếng Việt** trên MangaDex và lưu tự động vào Google Drive folder:
👉 **Link thư mục**: [luutruyenkomi - Google Drive](https://drive.google.com/drive/u/1/folders/1S3biMk6c2e-u5j7uO0wocFBW6J5eB8ef)  
👉 **Folder ID**: `1S3biMk6c2e-u5j7uO0wocFBW6J5eB8ef`

---

## ⚙️ Thiết Lập Mặc Định (Khớp 100% Giao Diện Của Bạn)

File script đã được cấu hình mặc định sẵn các tùy chọn xử lý chính xác như sau:
* ☑️ **Tự động tải lên Cloud Storage & Đồng bộ Web API**: `BẬT` (Lưu thẳng vào Google Drive `1S3biMk6c2e-u5j7uO0wocFBW6J5eB8ef`)
* ☑️ **Bỏ qua chapter đã có trên máy (Tránh tải trùng / Resume)**: `BẬT` (Kiểm tra và bỏ qua chapter đã tải)
* ⬜ **MangaDex Data-Saver (Tải ảnh nén nhẹ tiết kiệm mạng)**: `TẮT` (**Tải ẢNH GỐC** chất lượng cao nhất)
* ☑️ **Ghép ảnh Manhwa 5-in-1 (Tự động khi chapter > 70 ảnh)**: `BẬT` (Tự động ghép 5 lát cắt thành 1 ảnh dài WebP)
* ⬜ **Tự động xuất mỗi chapter thành file PDF**: `TẮT`
* ⚡ **Luồng tải song song**: `16 luồng`

---

## 🌟 Điểm Vượt Trội Của File Script

1. **Chỉ cần đúng 1 file duy nhất (`tai_mangadex_drive.sh`)**:
   - Tự động kiểm tra và cài đặt Python 3, pip, Virtualenv, Rclone và các thư viện cần thiết.
   - Script tự trích xuất mã nguồn engine nếu chưa có trên máy.
2. **Cơ chế chống tràn ổ cứng VPS (Zero-Disk Buildup)**:
   - Tải và xử lý xong bộ truyện nào ➡️ Tự động dùng `rclone move` chuyển ngay lên Google Drive ➡️ Xóa sạch file đệm trên máy chủ.
   - Dù máy chủ Ubuntu chỉ có ổ cứng 20GB - 40GB vẫn tải được hàng trăm GB truyện mà không bao giờ lo đầy ổ cứng.
3. **Chất lượng ảnh gốc tối đa & Ghép Manhwa 5-in-1 mượt mà**:
   - Tải file ảnh gốc sắc nét từ MangaDex Network và tự động ghép các dải ảnh cuộn Manhwa khi có > 70 ảnh.
4. **Tự động lưu tiến trình (Resume Checkpoint)**:
   - File `mangadex_sync_state.json` ghi nhận danh sách truyện và chapter đã tải.
   - Nếu bị đứt mạng, khởi động lại VPS hoặc tắt máy, lần chạy tiếp theo sẽ tự động bỏ qua các truyện/chapter đã có, tiếp tục tải ngay lập tức.
5. **Hỗ trợ chạy ngầm 24/7 (Background Nohup)**:
   - Bạn có thể ngắt kết nối SSH, tắt máy tính cá nhân, máy chủ Ubuntu vẫn tự động tải xuyên ngày đêm.

---

## 📥 Bước 1: Đưa File Lên Máy Chủ Ubuntu

Bạn có thể đưa file `tai_mangadex_drive.sh` lên máy Ubuntu theo một trong các cách sau:

### Cách 1: Sao chép qua lệnh `scp` (từ Windows)
Mở PowerShell trên máy Windows của bạn:
```powershell
scp d:\Project\angular_comic\tai_mangadex_drive.sh user@dia_chi_ip_ubuntu:~/
```

### Cách 2: Nếu máy Ubuntu đã clone Git của dự án
Tại thư mục dự án trên Ubuntu:
```bash
git pull
chmod +x tai_mangadex_drive.sh
```

### Cách 3: Tạo trực tiếp trên máy Ubuntu bằng `nano`
```bash
nano tai_mangadex_drive.sh
# Dán toàn bộ nội dung file tai_mangadex_drive.sh vào, bấm Ctrl+O -> Enter -> Ctrl+X để lưu
chmod +x tai_mangadex_drive.sh
```

---

## ⚡ Bước 2: Khởi Chạy Script Trên Ubuntu

Tại terminal của máy Ubuntu, gõ lệnh:

```bash
bash tai_mangadex_drive.sh
```

Lần đầu tiên khởi chạy:
- Script sẽ tự động cập nhật `apt` và cài đặt `python3`, `python3-venv`, `rclone`, `pillow`, `requests`, `rich`.
- Màn hình Menu tương tác sẽ hiển thị:

```text
================================================================
🚀 MANGADEX TO GOOGLE DRIVE SYNCHRONIZER (UBUNTU)
   Thư mục Drive đích: luutruyenkomi (ID: 1S3biMk6c2e-u5j7uO0wocFBW6J5eB8ef)
================================================================
  [1] 🚀 Tải TOÀN BỘ truyện MangaDex Tiếng Việt (Chạy trực tiếp màn hình)
  [2] ⚡ Tải 1 bộ truyện cụ thể (Nhập link MangaDex hoặc UUID)
  [3] 🔄 Chạy ngầm trong nền 24/7 (nohup) - An toàn khi ngắt SSH
  [4] 📊 Xem trạng thái, thống kê & nhật ký (Logs)
  [5] 🛑 Dừng tiến trình tải ngầm
  [6] ⚙️  Cấu hình kết nối Google Drive (Rclone)
  [0] ❌ Thoát
----------------------------------------------------------------
Chọn thao tác [0-6]:
```

---

## ⚙️ Bước 3: Cấu Hình Kết Nối Google Drive (CỰC KỲ ĐƠN GIẢN - 10 GIÂY)

Chọn phím **`6`** trên menu (hoặc script sẽ tự động nhắc khi bạn chọn tải truyện).

### Cách 1: Tự động 100% bằng 1-Click (Khuyên Dùng Nhất - 10 Giây)
1. **Trên máy tính Windows của bạn**:
   - Chỉ cần chạy file **`lay_token_drive.bat`** trong thư mục dự án:
     ```powershell
     .\lay_token_drive.bat
     ```
   - Trình duyệt sẽ tự động mở trang cấp quyền Google Drive -> Bấm **"Cho phép" (Allow)**.
   - Script sẽ **TỰ ĐỘNG COPY MÃ TOKEN VÀO BỘ NHỚ TẠM (CLIPBOARD)**!
2. **Trên máy chủ Ubuntu**:
   - Mở `./tai_mangadex_drive.sh` chọn mục **`[6]`** -> chọn tiếp **`[1]`**.
   - Nhấn chuột phải (hoặc `Ctrl+Shift+V`) dán Token vào rồi Enter!
   - Script tự động tạo cấu hình, kiểm tra kết nối tới thư mục `1S3biMk6c2e-u5j7uO0wocFBW6J5eB8ef` và báo thành công!

> [!TIP]
> Bạn cũng có thể kích hoạt bằng 1 lệnh duy nhất trên Ubuntu:
> ```bash
> ./tai_mangadex_drive.sh --setup-drive '<CHUỖI_TOKEN_JSON>'
> ```

### Cách 2: Sử dụng Google Service Account (`service_account.json`)
Nếu có file Service Account của Google Cloud, bạn chỉ cần chọn mục `[3]`, nhập đường dẫn file JSON là xong ngay không cần đăng nhập qua trình duyệt.


---

## 🚀 Bước 4: Bắt Đầu Tải Truyện

### Tùy chọn A: Chạy ngầm 24/7 (Khuyên Dùng Nhất Cho Máy Chủ / VPS)
- Chọn phím **`3`** trên menu (hoặc chạy lệnh: `./tai_mangadex_drive.sh --bg`).
- Script sẽ kích hoạt tiến trình chạy ngầm qua `nohup`.
- Lúc này bạn có thể **tắt terminal SSH**, **tắt máy tính cá nhân**, máy chủ Ubuntu vẫn sẽ tải liên tục từng bộ truyện và tự đẩy lên Google Drive.

### Tùy chọn B: Xem tiến độ & nhật ký thời gian thực
- Chọn phím **`4`** trên menu để xem thống kê số truyện, số chương, số ảnh đã hoàn thành.
- Hoặc gõ lệnh xem nhật ký live:
  ```bash
  tail -f mangadex_sync.log
  ```

### Tùy chọn C: Tải 1 bộ truyện cụ thể để kiểm tra
- Chọn phím **`2`** trên menu (hoặc gõ: `./tai_mangadex_drive.sh --url https://mangadex.org/title/36300a46-485b-4c05-a570-ac3b23de3952`).
- Script sẽ tải đầy đủ các chương Tiếng Việt của bộ truyện đó và đẩy ngay lên Google Drive.

---

## 📁 Cấu Trúc File Lưu Trữ Trên Google Drive

Trong thư mục **`luutruyenkomi`** (`1S3biMk6c2e-u5j7uO0wocFBW6J5eB8ef`), dữ liệu sẽ được lưu theo cấu trúc chuẩn:

```text
📁 luutruyenkomi/
├── 📁 covers/
│   ├── komi-san-wa-komyushou-desu.webp
│   ├── solo-leveling.webp
│   └── ...
└── 📁 chapters/
    ├── 📁 komi-san-wa-komyushou-desu/
    │   ├── 📄 info.json                # Thông tin tác giả, thể loại, link gốc MangaDex
    │   ├── 📁 chap1/
    │   │   ├── page_001.webp
    │   │   ├── page_002.webp
    │   │   └── ...
    │   ├── 📁 chap2/
    │   └── ...
    └── 📁 solo-leveling/
        └── ...
```

---

## 🛠️ Các Lệnh Thao Tác Nhanh (CLI Shortcut)

Nếu bạn muốn tạo cronjob hoặc tự động hóa trong bash script khác:

```bash
# Chạy tải toàn bộ MangaDex trực tiếp:
./tai_mangadex_drive.sh --all

# Chạy ngầm trong nền 24/7:
./tai_mangadex_drive.sh --bg

# Xem trạng thái tiến trình và thống kê:
./tai_mangadex_drive.sh --status

# Dừng tiến trình chạy ngầm:
./tai_mangadex_drive.sh --stop

# Tải 1 bộ truyện cụ thể:
./tai_mangadex_drive.sh --url "https://mangadex.org/title/uuid-truyen"
```

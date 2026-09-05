# ☁️ Hướng Dẫn Tích Hợp Cloudflare CDN Cho Hệ Thống TruyenKomi

Tài liệu chi tiết cấu hình **Cloudflare CDN, Cloudflare Tunnel & Cloudflare R2** để phục vụ **1 triệu người dùng** đọc truyện với băng thông tối ưu và chi phí 0đ (Zero-Egress Fee).

---

## 🎯 1. Tại Sao Cần Cloudflare CDN Cho TruyenKomi?

Trong ứng dụng đọc truyện tranh:
- 85% - 90% dung lượng truyền tải hệ thống nằm ở **Hình Ảnh Chapter (.webp, .jpg, .png)**.
- Đưa Cloudflare CDN lên làm "Lá chắn Edge" sẽ giúp **Cache 99% ảnh truyện tại server Cloudflare gần người dùng nhất**, MinIO Server và Backend API không phải chịu tải trực tiếp.

---

## 🛠️ 2. Cấu Hình Cloudflare Cache Rules (Dành Cho 1 Triệu User)

Vào Bảng điều khiển Cloudflare -> **Caching** -> **Cache Rules** -> Tạo quy tắc mới:

### ⚙️ Rule 1: Cache Everything For Static Comic Images
- **If incoming requests match:**
  - `URI Path` starts with `/comics/` OR `/images/` OR `File Extension` in `webp, jpg, jpeg, png, avif`
- **Then Cache status:**
  - **Cache Level:** Cache Everything
  - **Edge Cache TTL:** Respect origin or set `1 Month`
  - **Browser Cache TTL:** `1 Year` (tương ứng header `Cache-Control: public, max-age=31536000, immutable`)

---

## 🚀 3. Tùy Chọn 2: Cấu Hình Cloudflare R2 Object Storage (Miễn Phí Băng Thông Outbound)

Thay vì MinIO trên Server tự host (ngốn băng thông mạng), chuyển sang **Cloudflare R2**:
- **0đ Egress Fees:** Không tính phí băng thông tải ảnh từ Storage ra CDN.
- **S3 API Compatible:** Tương thích hoàn toàn với C# MinIO/S3 SDK trong `MinioStorageService.cs`.

### Cấu Hình Trong `appsettings.json`:
```json
"Minio": {
  "Endpoint": "<account_id>.r2.cloudflarestorage.com",
  "AccessKey": "<your_r2_access_key>",
  "SecretKey": "<your_r2_secret_key>",
  "BucketName": "comics",
  "Secure": true,
  "CdnBaseUrl": "https://cdn.truyenkomi.com"
}
```

---

## 🔒 4. Cloudflare WAF & Anti-Scraper (Chống Bot Cào Truyện Toàn Diện)

Để bảo vệ hệ thống khi đạt quy mô **1 triệu người dùng**, ngăn chặn triệt để các crawler bot độc hại gây quá tải cơ sở dữ liệu và ngốn băng thông:

### 🛡️ 4.1. Cloudflare Bot Management & Super Bot Fight Mode
- Vào **Security** -> **Bots**:
  - Bật **Bot Fight Mode** (Miễn phí) hoặc **Super Bot Fight Mode**.
  - Cấu hình:
    - **Definitely automated bots:** `Block`
    - **Likely automated bots:** `Managed Challenge` (Hiển thị xác thực Turnstile thân thiện không phiền người dùng thật).

### ⏱️ 4.2. Edge Rate Limiting Rules (Phân Tầng Theo Endpoint)
Vào **Security** -> **WAF** -> **Rate limiting rules** -> Tạo các quy tắc sau:

1. **Rule 1: Bảo Vệ Chapter Reader API (Anti-Scraper)**
   - **If incoming requests match:** `(http.request.uri.path contains "/api/chapters")`
   - **Rate limit:** Tối đa **15 requests** trong vòng **10 giây** trên mỗi IP.
   - **Action:** `Managed Challenge` (hoặc `Block` 10 phút nếu vượt ngưỡng liên tục).

2. **Rule 2: Bảo Vệ Authentication & Comment APIs (Anti-Brute Force / Anti-Spam)**
   - **If incoming requests match:** `(http.request.uri.path contains "/api/auth/login" or http.request.uri.path contains "/api/auth/register")`
   - **Rate limit:** Tối đa **5 requests** trong vòng **1 phút** trên mỗi IP.
   - **Action:** `Block` 1 giờ.

3. **Rule 3: Bảo Vệ CDN Tải Ảnh Chapter**
   - **If incoming requests match:** `(http.request.uri.path contains "/comics/" or http.request.uri.path contains "/covers/")`
   - **Rate limit:** Tối đa **120 requests** trong vòng **10 giây** trên mỗi IP.
   - **Action:** `Managed Challenge`.

### 🚫 4.3. WAF Custom Rules (Chặn Bad User-Agents & Hotlink)
Vào **Security** -> **WAF** -> **Custom rules**:
- **Expression:** `(http.user_agent contains "Scrapy" or http.user_agent contains "python-requests" or http.user_agent contains "Bytespider" or http.user_agent contains "sqlmap" or http.user_agent contains "wget" or http.user_agent eq "")`
- **Action:** `Block` (Chặn đứng 100% các công cụ crawler cào truyện tự động trước khi chạm tới Server Backend).
- **Hotlink Protection:** Bật **Scrape Shield** -> **Hotlink Protection** để ngăn chặn các website khác nhúng trộm link ảnh truyện từ hệ thống TruyenKomi.

---

## 🔌 5. Cloudflare Tunnel (cloudflared) Tích hợp Docker

Cấu hình `docker-compose.yml` chạy ngầm Tunnel bảo mật kết nối Server địa phương với CDN Cloudflare mà không cần mở Port Router:

```yaml
  cloudflared:
    image: cloudflare/cloudflared:latest
    container_name: truyenkomi-cloudflared
    restart: always
    command: tunnel --no-autoupdate run --token ${CLOUDFLARE_TUNNEL_TOKEN}
```

---

## 💡 6. Chiến Lược Tối Ưu Cho Gói Miễn Phí (Free Tier 10 GB Storage)

Nếu bạn sử dụng Cloudflare R2 gói miễn phí **10 GB dung lượng**:

1. **Chuyển Đổi Sang AVIF / WebP (Nén Nhẹ Hơn 5x - 8x):**
   - Ảnh JPEG gốc: `~1.2 MB` / trang -> Nén **WebP/AVIF (Max Width 1080px, Quality 80%)**: chỉ còn **`80 KB - 120 KB`** / trang.
   - Với 10 GB dung lượng, bạn có thể lưu tới **100.000 trang ảnh truyện** (tương đương **3.000+ chapter truyện**)!
2. **Mô Hình Hybrid (MinIO Tự Host + Cloudflare CDN Free):**
   - Bạn có thể đặt MinIO lưu trữ ảnh trên VPS/Máy tính cá nhân (ổ cứng HDD/SSD giá rẻ 100GB+).
   - Đặt **Cloudflare CDN (Miễn phí 100% băng thông truyền dữ liệu)** đứng trước MinIO qua Cloudflare Tunnel.
   - Khi có người đọc, Cloudflare chỉ lấy ảnh từ MinIO của bạn **1 lần**, 99.9% người đọc sau đó sẽ tải ảnh trực tiếp từ **Cloudflare Edge Cache** (Không mất tiền băng thông + Không bị giới hạn 10 GB của R2!).

---

## 🗄️ 7. Tận Dụng Multi-Bucket Free Storage (Cloudflare R2 + Backblaze B2)

Để nhân đôi hoặc nhân ba dung lượng lưu trữ miễn phí mà vẫn được **0đ Băng Thông (Zero Egress Fee)**:

1. **Backblaze B2 S3 API (Miễn phí 10 GB Storage):**
   - Backblaze là thành viên chính thức của **Cloudflare Bandwidth Alliance**.
   - Mọi lượt tải ảnh từ Backblaze B2 truyền qua Cloudflare CDN đều **MIỄN PHÍ 100% BĂNG THÔNG**.
2. **Cơ Chế Multi-Bucket & Failover Tự Động Trong C# (`MinioStorageService.cs`):**
   - **Primary Storage:** Cloudflare R2 / MinIO (`10 GB miễn phí`).
   - **Secondary Storage:** Backblaze B2 (`10 GB miễn phí` tiếp theo).
   - Khi Primary Storage gặp sự cố hoặc đầy, `MinioStorageService` tự động chuyển sang upload lên Backblaze B2 mà không làm gián đoạn hệ thống.
3. **Cấu Hình `appsettings.json`:**
   ```json
   "Minio": {
     "Endpoint": "https://7d2e9a7fa70afba6027908941eb6bd19.r2.cloudflarestorage.com",
     "AccessKey": "b55550a4f61f223173b5c5b742867416",
     "SecretKey": "2afe8eb25f16ff0c74bb0521ba87c04e6313d63bb6c731224e5a70de3f21a3a3",
     "BucketName": "comics",
     "CdnBaseUrl": "https://img.hypermmo.site",
     "Secondary": {
       "Endpoint": "s3.us-east-005.backblazeb2.com",
       "AccessKey": "0050dfbf3919d500000000001",
       "SecretKey": "K005wTMv67F283/4QcZoy1JXYSBAGuM",
       "BucketName": "truyenkomi-b2",
       "CdnBaseUrl": "https://cdn.truyenkomi.com/truyenkomi-b2"
     }
   }
---

## 🔑 8. Hướng Dẫn Từng Bước Lấy Thông Số Credentials (R2 & Backblaze B2)

### A. Hướng Dẫn Lấy Thông Số Cloudflare R2:
1. **Tạo Bucket:** Đăng nhập [Cloudflare Dashboard](https://dash.cloudflare.com/) -> Chọn **R2 Object Storage** -> **Create bucket** -> Nhập tên `comics` -> Chọn **Create**.
2. **Lấy Account ID & Endpoint:** 
   - Tại trang **R2 Overview**, nhìn mục **Account Details** góc phải -> Copy mã **Account ID** (Ví dụ: `a1b2c3d4e5f678901234...`).
   - `Endpoint` R2 của bạn sẽ là: `<account_id>.r2.cloudflarestorage.com`.
3. **Lấy Access Key & Secret Key:**
   - Chọn **Manage R2 API Tokens** -> **Create API Token**.
   - Chọn quyền **Admin Read & Write** -> Nhấp **Create API Token**.
   - Copy **Access Key ID** (điền vào `AccessKey`) và **Secret Access Key** (điền vào `SecretKey`).
4. **Lấy CdnBaseUrl (Custom Domain):**
   - Vào lại Bucket `comics` -> chọn tab **Settings** -> mục **Custom Domains** -> chọn **Connect Domain**.
   - Nhập domain/subdomain của bạn (ví dụ: `cdn.truyenkomi.com`) -> Chọn **Connect Domain**.

### B. Hướng Dẫn Lấy Thông Số Backblaze B2:
1. **Tạo Bucket:** Đăng ký [Backblaze B2](https://www.backblaze.com/b2/cloud-storage.html) (10 GB miễn phí) -> Chọn **B2 Cloud Storage** -> **Buckets** -> **Create a Bucket**.
   - Nhập tên: `truyenkomi-b2` -> Chọn **Public** -> **Create**.
2. **Lấy Endpoint:** Xem trong chi tiết bucket vừa tạo, ví dụ: `s3.us-west-004.backblazeb2.com`.
3. **Lấy Key ID & Application Key:**
   - Chọn menu **Application Keys** -> **Add a New Application Key**.
   - Chọn bucket `truyenkomi-b2`, quyền **Read and Write** -> bấm **Create**.
   - Copy **keyID** (`<b2_key_id>`) và **applicationKey** (`<b2_application_key>`).

---
*Tài liệu tích hợp Cloudflare CDN - TruyenKomi 2026.*

https://7d2e9a7fa70afba6027908941eb6bd19.r2.cloudflarestorage.com
Access Key ID
b55550a4f61f223173b5c5b742867416
Secret Access Key
2afe8eb25f16ff0c74bb0521ba87c04e6313d63bb6c731224e5a70de3f21a3a3

img.hypermmo.site
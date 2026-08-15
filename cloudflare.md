# ☁️ Hướng Dẫn Tích Hợp Cloudflare CDN Cho Hệ Thống MangaFlux

Tài liệu chi tiết cấu hình **Cloudflare CDN, Cloudflare Tunnel & Cloudflare R2** để phục vụ **1 triệu người dùng** đọc truyện với băng thông tối ưu và chi phí 0đ (Zero-Egress Fee).

---

## 🎯 1. Tại Sao Cần Cloudflare CDN Cho MangaFlux?

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
  "CdnBaseUrl": "https://cdn.mangaflux.com"
}
```

---

## 🔒 4. Cloudflare WAF & Anti-Scraper (Chống Bot Cào Truyện)

Để tránh bot cào ngốn tài nguyên hệ thống khi có 1M users:
1. **Cloudflare Bot Management:** Bật `Bot Fight Mode` để tự động chặn bot xấu.
2. **Rate Limiting Rule:**
   - URL: `api.mangaflux.com/api/*`
   - Limit: 60 requests / minute per IP.
   - Action: Block 1 hour hoặc captcha challenge.

---

## 🔌 5. Cloudflare Tunnel (cloudflared) Tích hợp Docker

Cấu hình `docker-compose.yml` chạy ngầm Tunnel bảo mật kết nối Server địa phương với CDN Cloudflare mà không cần mở Port Router:

```yaml
  cloudflared:
    image: cloudflare/cloudflared:latest
    container_name: mangaflux-cloudflared
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
*Tài liệu tích hợp Cloudflare CDN - MangaFlux 2026.*

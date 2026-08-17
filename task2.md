# 📋 Lộ Trình Nâng Cấp Tính Năng & Hệ Thống MangaFlux - Giai Đoạn 2 (Feature & System Evolution)

Tài liệu kế hoạch chi tiết triển khai các tính năng người dùng, hệ thống thời gian thực (Real-time), tìm kiếm nâng cao, tối ưu SEO, tự động hóa và mở rộng quản trị cho nền tảng **MangaFlux** (Angular + .NET 10 + MS SQL Server + Redis + MinIO / Cloudflare R2).

---

## 📱 Giai Đoạn 6: Nâng Cấp Trải Nghiệm Đọc Truyện & Mobile PWA (Reader UX & Offline Mode)

### 6.1 PWA & Đọc Truyện Offline (Service Worker & IndexedDB)
- [ ] **Cấu hình Angular PWA (`@angular/pwa`):**
  - Cài đặt Service Worker, tạo file `manifest.webmanifest` với đầy đủ icon (192x192, 512x512), theme color và splash screen chuẩn Progressive Web App.
  - Cho phép người dùng cài đặt MangaFlux như một ứng dụng Native trên Android, iOS và Desktop.
- [ ] **Lưu trữ ảnh và dữ liệu đọc Offline với IndexedDB:**
  - Xây dựng `OfflineStorageService` (sử dụng `idb` hoặc `dexie.js`) quản lý cơ sở dữ liệu IndexedDB tại trình duyệt.
  - Cho phép người dùng bấm nút **"Tải chương này"** hoặc **"Tải toàn bộ truyện"** để lưu trữ Blob hình ảnh cục bộ.
  - Tự động chuyển nguồn đọc sang IndexedDB khi mất kết nối mạng (Offline Mode) mà không gây gián đoạn trải nghiệm đọc.
- [ ] **Trang Quản Lý Truyện Đã Tải ("Tủ Truyện Offline"):**
  - Giao diện xem danh sách các truyện/chương đã tải về thiết bị, dung lượng bộ nhớ đã chiếm dụng và nút xóa giải phóng bộ nhớ.

### 6.2 Nâng Cấp Bộ Đọc Truyện Đa Chế Độ (Multi-Mode Reader Engine)
- [ ] **Đa dạng chế độ đọc:**
  - **Chế độ cuộn dọc (Webtoon Mode):** Đọc liền mạch tối ưu cho truyện tranh màu và điện thoại di động.
  - **Chế độ lật từng trang (Manga Single Page):** Đọc từng trang một, chuyển trang bằng cách chạm hoặc phím điều hướng.
  - **Chế độ trang đôi (Manga Double Page - RTL):** Đọc lật từ phải sang trái chuẩn truyện tranh Manga Nhật Bản trên màn hình PC / Tablet.
- [ ] **Hệ thống phím tắt bàn phím (Keyboard Navigation):**
  - Phím `A` / `←`: Trang/Chương trước.
  - Phím `D` / `→`: Trang/Chương kế tiếp.
  - Phím `F`: Bật/Tắt chế độ toàn màn hình (Fullscreen).
  - Phím `M`: Đổi nhanh chế độ đọc (Webtoon / Manga).
- [ ] **Khôi phục vị trí đọc chính xác (Scroll Position Resume):**
  - Tự động lưu tọa độ cuộn trang (scroll offset) hoặc số trang đang đọc vào `localStorage` và `ReadingHistories`.
  - Khi mở lại chương, tự động cuộn mượt (smooth scroll) đến đúng vị trí ảnh đang đọc dở.
- [ ] **Tùy chỉnh giao diện đọc (Reader Appearance & Eye-Care):**
  - Tùy chọn màu nền: Đen tuyền (AMOLED Black), Xám tối, Trắng sáng, Vàng ấm (Sepia bảo vệ mắt ban đêm).
  - Thanh trượt điều chỉnh độ sáng (Brightness) và độ tương phản của trang truyện.

---

## ⚡ Giai Đoạn 7: Hệ Thống Real-Time Với ASP.NET Core SignalR

### 7.1 Hạ Tầng SignalR Hub & Redis Backplane
- [ ] **Tích hợp SignalR Hub trong .NET 10 API:**
  - Xây dựng `MangaHub.cs` hỗ trợ xác thực qua JWT Token query param.
  - Kết nối SignalR với **Redis Backplane** (`Microsoft.AspNetCore.SignalR.StackExchangeRedis`) để đồng bộ kết nối giữa nhiều instance backend.
- [ ] **Quản lý Room & Kênh kết nối:**
  - Kênh người dùng cá nhân: `User_{userId}` (nhận thông báo cá nhân).
  - Kênh theo dõi truyện: `Comic_{comicId}` (nhận thông báo khi có chương mới).
  - Kênh phòng đọc chương: `Chapter_{chapterId}` (đồng bộ bình luận trực tiếp và đếm người đọc).

### 7.2 Tính Năng Tương Tác Thời Gian Thực
- [ ] **Thông Báo Tức Thì (Instant Notification):**
  - Khi quản trị viên hoặc crawler xuất bản chương mới, hệ thống tự động bắn sự kiện SignalR tới tất cả người dùng đang online có theo dõi truyện đó.
  - Hiển thị Toast thông báo nổi góc màn hình kèm âm thanh thông báo nhẹ.
- [ ] **Bình Luận Trực Tiếp (Live Comments Stream):**
  - Khi có người gửi bình luận hoặc thả tim bình luận trong chương đang đọc, bình luận mới tự động xuất hiện với hiệu ứng trượt mượt mà không cần F5 lại trang.
- [ ] **Bộ Đếm Độc Giả Trực Tiếp (Live Readers Counter):**
  - Hiển thị badge: *"🔥 Có X người đang đọc chương này"* cập nhật thời gian thực theo lượt kết nối vào SignalR Room của chương.

---

## 🔍 Giai Đoạn 8: Tối Ưu Tìm Kiếm Nâng Cao & Chuẩn Hóa SEO

### 8.1 Bộ Tìm Kiếm Tiếng Việt Không Dấu & Fuzzy Search (Meilisearch / Typesense)
- [x] **Tích hợp Search Engine chuyên biệt (Meilisearch Docker Container):**
  - Bổ sung service `meilisearch` vào `docker-compose.yml` với volume lưu trữ dữ liệu index `meili_data`.
  - Xây dựng `ISearchEngineService` & `SearchEngineService.cs` tự động đồng bộ và fallback mượt mà.
- [x] **Tìm kiếm chịu lỗi & không dấu (Typo Tolerance & Vietnamese Accent Insensitive):**
  - Xây dựng `VietnameseTextNormalizer.cs` chuẩn hóa chuỗi Unicode (loại bỏ dấu tiếng Việt, xử lý `đ` / `Đ`, Levenshtein Distance).
  - Hỗ trợ tìm kiếm theo nhiều từ khóa (tên truyện, tên khác, tên tác giả, tên họa sĩ).
- [x] **Instant Autocomplete Dropdown:**
  - Thanh tìm kiếm trên Header hiển thị gợi ý kết quả tức thì (hình ảnh, tên truyện, chương mới nhất, số sao) với độ trễ < 20ms ngay khi gõ từng ký tự kèm điều hướng phím `↑`/`↓`/`Enter`.
- [x] **Bộ Lọc Đa Tiêu Chí Nâng Cao (Advanced Multi-Filter):**
  - Giao diện lọc kết hợp: Thể loại bao gồm (+), Thể loại loại trừ (-), Số lượng chương (>10, >50, >100, >300, >500), Tình trạng (Đang tiến hành, Đã hoàn thành), Quốc gia (Manga, Manhwa, Manhua, Comic), Sắp xếp và phân trang.

### 8.2 Tối Ưu SEO & Angular Server-Side Rendering (SSR)
- [x] **Xây dựng `SeoService` Quản Lý Metadata Toàn Diện:**
  - Tự động cập nhật Title, Description, Keywords, Canonical URL cho trang chủ, trang chi tiết truyện (`/comic/:slug`), trang đọc chương (`/read/:slug/:chap`) và trang tìm kiếm (`/search`).
- [x] **Dynamic OpenGraph, Twitter Card & Schema.org JSON-LD:**
  - Tự động sinh thẻ `<meta property="og:title">`, `<meta property="og:image">`, `<meta property="og:description">`, `<meta name="twitter:card">` và cấu trúc JSON-LD `schema.org/Book` phục vụ Google Snippets và chia sẻ mạng xã hội Facebook/Zalo.
- [x] **Tự động sinh `sitemap.xml` và `robots.txt`:**
  - Xây dựng `SeoController.cs` với endpoint `/api/seo/sitemap.xml` và `/api/seo/robots.txt` tự động tổng hợp URL toàn bộ truyện và chương phục vụ Google Search Console cào dữ liệu nhanh chóng.
  - Cấu hình Nginx reverse proxy direct routing cho `/sitemap.xml` và `/robots.txt`.

---

## 🔐 Giai Đoạn 9: Mở Rộng Xác Thực, Cộng Đồng & Bảo Mật

### 9.1 Đăng Nhập Mạng Xã Hội 1-Click (Social Login OAuth2)
- [x] **Tích hợp Google OAuth2 Login:**
  - Sử dụng `@abacritt/angularx-social-login` hoặc Google Identity Services phía Angular.
  - Endpoint `.NET 10` xác thực Google ID Token với `Google.Apis.Auth`, tự động tạo tài khoản hoặc liên kết tài khoản hiện có.
- [ ] **Tùy chọn đăng nhập qua Discord / Facebook:**
  - Hỗ trợ đăng nhập tiện lợi cho cộng đồng độc giả yêu thích anime/manga.

### 9.2 Luồng Quên Mật Khẩu & Xác Thực Tài Khoản Qua Email
- [ ] **Tích hợp dịch vụ gửi Email:**
  - Xây dựng `EmailService` hỗ trợ gửi qua SMTP hoặc REST API (Resend / SendGrid / Amazon SES).
  - Thiết kế mẫu HTML Email chuyên nghiệp với logo và branding của MangaFlux.
- [ ] **Quy trình Reset Password an toàn:**
  - Tạo mã OTP / Token 6 chữ số có hiệu lực trong 15 phút lưu trữ trong Redis.
  - Endpoint xác thực OTP và cho phép đặt lại mật khẩu mới, đồng thời vô hiệu hóa tất cả Refresh Token cũ để bảo vệ tài khoản.

### 9.3 Tính Năng Cộng Đồng & Tương Tác Nâng Cao
- [ ] **Hệ thống Đánh Giá & Chấm Điểm Sao (Rating & Reviews):**
  - Cho phép người dùng chấm điểm (1 - 5 sao) và viết bài cảm nhận chi tiết cho truyện.
  - Tính điểm trung bình (Weighted Average Rating) chống nạn spam vote ảo (yêu cầu tài khoản đã đọc tối thiểu 3 chương mới được đánh giá).
- [ ] **Chống Spoil Trong Bình Luận (Spoiler Tag):**
  - Hỗ trợ cú pháp `[spoil]nội dung[/spoil]`. Mặc định nội dung sẽ bị mờ/che lại, người dùng phải nhấp chuột vào mới hiển thị.
- [ ] **Hệ thống Sticker & GIF Reaction:**
  - Bộ nhãn dán biểu cảm Manga vui nhộn để người dùng bình luận sinh động hơn.

---

## 🤖 Giai Đoạn 10: Tự Động Hóa Quản Trị, Vận Hành & DevOps

### 10.1 Quản Lý Crawler Tự Động Với Hangfire / Quartz.NET
- [ ] **Tích hợp Hangfire Dashboard:**
  - Tích hợp Hangfire vào .NET 10 API, lưu trữ state trong SQL Server hoặc Redis.
  - Bảo vệ đường dẫn `/hangfire` chỉ cho phép tài khoản Admin truy cập.
- [ ] **Lên lịch cào truyện tự động (Auto-Crawl Cron Jobs):**
  - Thiết lập Job chạy định kỳ mỗi 30 phút tự động kiểm tra các đầu truyện đang theo dõi trên nguồn gốc, nếu có chương mới thì tự động tải ảnh, nén WebP và đẩy lên MinIO/R2.
- [ ] **Quản lý Proxy xoay vòng (Proxy Rotation):**
  - Tích hợp pool danh sách HTTP/SOCKS5 proxy tránh bị chặn IP từ các website nguồn.

### 10.2 Quản Lý Log Tập Trung (Structured Logging Với Serilog & Grafana Loki)
- [ ] **Cấu hình Serilog Structured Logging:**
  - Thay thế toàn bộ `Console.WriteLine` bằng `ILogger` ghi log có cấu trúc dưới dạng JSON kèm `TraceId`, `UserId`, `ExecutionTimeMs`.
- [ ] **Tích hợp Grafana Loki / Seq:**
  - Đẩy log tập trung từ Backend và Nginx về Grafana Loki, liên kết trực tiếp với Grafana APM Dashboard để tra cứu lỗi theo request chỉ trong vài giây.
- [ ] **Nhật ký thao tác Quản trị viên (Admin Audit Logs):**
  - Tạo bảng `AuditLogs` ghi lại mọi hành động nhạy cảm: xóa truyện, sửa chương, khóa tài khoản người dùng, xóa bình luận kèm địa chỉ IP và thời gian thực hiện.

### 10.3 Sao Lưu Dữ Liệu Tự Động & CI/CD Pipeline
- [ ] **Script Tự Động Backup Database (Disaster Recovery):**
  - Cron job hàng ngày tự động backup cơ sở dữ liệu SQL Server và upload bản nén `.bak` / `.sql` lên Cloud Storage riêng biệt.
- [ ] **CI/CD Pipeline với GitHub Actions:**
  - Tự động chạy Unit Tests (`dotnet test`, `ng test`).
  - Tự động build Docker images cho Angular Frontend & .NET Backend và push lên Docker Hub / GitHub Packages.

---

## 🏆 Giai Đoạn 11: Gamification & Thương Mại Hóa (Tùy Chọn Mở Rộng)

### 11.1 Hệ Thống Cấp Bậc & Tu Tiên (User Leveling System)
- [ ] **Tính điểm kinh nghiệm (EXP) & Cấp độ độc giả:**
  - Cộng điểm EXP khi: Đọc hết 1 chương (+10 EXP), Bình luận (+5 EXP), Điểm danh hàng ngày (+20 EXP).
  - Hệ thống cảnh giới tu tiên hoặc cấp bậc Manga: *Luyện Khí ➔ Trúc Cơ ➔ Kim Đan ➔ Nguyên Anh ➔ Hóa Thần ➔ Độ Kiếp* (hoặc *Tân Thủ ➔ Đồng ➔ Bạc ➔ Vàng ➔ Kim Cương ➔ Tinh Anh*).
- [ ] **Khung Avatar Động & Huy Hiệu (Badges):**
  - Mở khóa khung viền avatar phát sáng theo cấp độ hoặc danh hiệu Top Độc Giả của tháng.

### 11.2 Hệ Thống Nạp Xu / Ủng Hộ Tác Giả & Đọc Trước Chương VIP (Fast Pass)
- [ ] **Tích hợp Cổng Thanh Toán Tự Động (VietQR / MoMo / VNPay):**
  - Tích hợp thanh toán QR Code tự động qua cổng SePay / Casso (quét mã QR chuyển khoản nhận diện webhook tức thì trong 3 giây).
- [ ] **Tính năng Mở Khóa Chương Sớm (Fast Pass):**
  - Các chương mới nhất có thể khóa VIP trong 24-48 giờ đầu cho độc giả ủng hộ nạp xu đọc trước, sau đó tự động mở miễn phí cho toàn bộ cộng đồng.

---

## 📊 Bảng Tổng Hợp Thứ Tự Ưu Tiên Triển Khai (Priority Matrix)

| Giai Đoạn | Hạng Mục | Độ Ưu Tiên | Mức Độ Tác Động |
| :--- | :--- | :--- | :--- |
| **Giai Đoạn 6** | PWA, Đọc Offline & Bộ đọc đa chế độ (Webtoon/Manga RTL) | ⭐⭐⭐⭐⭐ (Cao nhất) | Nâng tầm trải nghiệm người dùng đọc truyện |
| **Giai Đoạn 7** | SignalR Real-Time Notifications & Live Comments | ⭐⭐⭐⭐⭐ (Cao nhất) | Tăng tương tác và giữ chân người dùng (Retention) |
| **Giai Đoạn 8** | Meilisearch Fuzzy Search tiếng Việt & Angular SSR SEO | ⭐⭐⭐⭐ (Cao) | Kéo traffic tự nhiên từ Google & Tìm kiếm siêu nhanh |
| **Giai Đoạn 9** | Google OAuth2 Social Login & Reset Password qua Email | ⭐⭐⭐⭐ (Cao) | Tăng tỷ lệ đăng ký tài khoản và bảo mật |
| **Giai Đoạn 10**| Hangfire Auto-Crawler, Serilog Logging & Backup tự động | ⭐⭐⭐ (Trung bình) | Giảm tải công sức vận hành cho Admin |
| **Giai Đoạn 11**| Hệ thống Cấp bậc (Leveling) & Nạp xu đọc trước (Fast Pass)| ⭐⭐⭐ (Mở rộng) | Tăng tính gắn kết và tạo nguồn thu doanh thu |

---
*Tài liệu lộ trình phát triển tính năng và mở rộng hệ thống MangaFlux - Phiên bản 2.0 (2026).*

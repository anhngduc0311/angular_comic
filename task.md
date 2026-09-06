# 📋 Kế Hoạch & Lộ Trình Cải Thiện Toàn Diện Hệ Thống TruyenKomi

Tài liệu chi tiết phân loại các tác vụ cải thiện hiệu năng, tính năng người dùng, trải nghiệm đọc truyện, bảo mật, thời gian thực và vận hành tự động cho hệ thống **TruyenKomi** (Angular 18/19 + .NET 10 + MS SQL Server + Redis + MinIO / Cloudflare R2).

---

## 🎯 Giai Đoạn 1: Tối Ưu Hóa Hiệu Năng & Điểm Nghẽn Cấp Bách (P0 - Critical Bottlenecks)

### 1.1 Khắc Phục Xử Lý Tìm Kiếm In-Memory Trong `SearchEngineService.cs`
- [ ] **Tích hợp tìm kiếm Meilisearch API container thực tế:**
  - Kết nối service `meilisearch` từ `docker-compose.yml` qua HTTP client.
  - Tự động đẩy / đồng bộ dữ liệu truyện sang Meilisearch khi truyện được tạo mới hoặc cập nhật (`SyncIndexAsync`).
  - Gửi truy vấn trực tiếp đến Meilisearch với Typo-tolerance, Vietnamese accent-insensitive và nhận kết quả tức thì (< 10ms).
- [ ] **Tối ưu hóa Fallback SQL Server:**
  - Loại bỏ hoàn toàn `await query.ToListAsync()` kéo toàn bộ bảng Comics vào RAM của C#.
  - Đẩy bộ lọc `Status`, `Country`, `Categories` và phân trang `Skip((page-1)*pageSize).Take(pageSize)` trực tiếp xuống câu truy vấn SQL Server.
  - Thêm cột `TitleUnaccent` (hoặc SQL Server Full-Text Index) để tìm kiếm không dấu tốc độ cao mà không ngốn RAM backend.

### 1.2 Tách API Phân Trang Bình Luận (Comments Pagination)
- [ ] **Tối ưu hóa Payload Chi Tiết Truyện (`ComicService.cs`):**
  - Loại bỏ `.Include(c => c.Comments)` khỏi `GetComicByIdAsync` và `GetComicBySlugAsync` để giảm kích thước payload từ vài MB xuống vài KB.
- [ ] **Xây dựng Endpoint Phân Trang Riêng:**
  - `GET /api/comics/{comicId}/comments?page=1&pageSize=20&sortBy=newest|top` hỗ trợ phân trang hoặc Infinite Scroll.
- [ ] **Cập nhật Frontend Angular (`comic-detail.component.ts`):**
  - Tải danh sách bình luận bất đồng bộ theo trang, hiển thị skeleton loading mượt mà.

### 1.3 Chống Chặn Luồng Redis (Blocking KEYS) & Quản Lý Khóa Trong `CacheService.cs`
- [ ] **Chuyển đổi `server.Keys()` sang SCAN Cursor:**
  - Thay thế lệnh blocking `server.Keys(...)` trong `RemoveByPatternAsync` và `GetKeysAsync` bằng `server.KeysAsync(...)` hoặc cơ chế `SCAN` không làm gián đoạn Redis Server.
  - Quản lý xóa cache theo Cache Prefix / Tags thay vì quét toàn bộ database Redis.
- [ ] **Giải phóng Bộ nhớ Khóa Stampede (`_locks`):**
  - Bổ sung cơ chế tự động dọn dẹp hoặc giới hạn vòng đời của `SemaphoreSlim` trong `ConcurrentDictionary` chống rò rỉ bộ nhớ (Memory Leak).

### 1.4 Tối Ưu Batching Worker Đồng Bộ Lượt Xem (`ViewSyncWorker.cs`)
- [ ] **Gộp Thao Tác Cập Nhật (Batch Update):**
  - Thay thế vòng lặp tuần tự `foreach ExecuteUpdateAsync` bằng một câu lệnh Batch SQL duy nhất (hoặc Table-Valued Parameter / MERGE SQL) để cập nhật hàng trăm bộ truyện trong 1 database roundtrip.

---

## 📱 Giai Đoạn 2: Nâng Cấp Trải Nghiệm Độc Giả & Mobile PWA Đọc Offline (P1 - Reader UX & PWA)

### 2.1 PWA & Đọc Truyện Offline (Service Worker & IndexedDB)
- [ ] **Cấu hình Angular PWA (`@angular/pwa`):**
  - Cài đặt Service Worker, tạo `manifest.webmanifest` với đầy đủ icons, splash screen và theme color.
  - Cho phép người dùng cài đặt ứng dụng TruyenKomi trực tiếp lên màn hình chính Android, iOS và Desktop.
- [ ] **Lưu Trữ Ảnh & Dữ Liệu Offline Với IndexedDB:**
  - Xây dựng `OfflineStorageService` (sử dụng `idb` hoặc `dexie.js`) quản lý IndexedDB tại trình duyệt.
  - Thêm nút **"Tải chương này"** hoặc **"Tải toàn bộ truyện"** để lưu trữ Blob ảnh cục bộ.
  - Tự động nhận diện mất mạng (Offline Mode) và chuyển nguồn đọc sang IndexedDB mượt mà không bị ngắt quãng.
- [ ] **Giao Diện "Tủ Truyện Offline":**
  - Trang xem danh sách truyện đã tải về thiết bị, dung lượng bộ nhớ đã sử dụng và nút xóa giải phóng dung lượng.

### 2.2 Nâng Cấp Bộ Đọc Truyện Đa Chế Độ (Multi-Mode Reader Engine)
- [ ] **Hỗ Trợ Đa Chế Độ Đọc:**
  - **Chế độ cuộn dọc (Webtoon Mode):** Đọc liền mạch tối ưu cho Webtoon / Manhwa / Mobile.
  - **Chế độ lật từng trang (Single Page Flip):** Đọc từng trang với hiệu ứng chuyển trang mượt mà.
  - **Chế độ trang đôi (Double Page RTL):** Đọc lật trang từ phải sang trái chuẩn Manga Nhật Bản trên PC/Tablet.
- [ ] **Hệ Thống Phím Tắt Điều Hướng (Keyboard Navigation):**
  - Phím `A` / `←`: Trang hoặc chương trước.
  - Phím `D` / `→`: Trang hoặc chương kế tiếp.
  - Phím `F`: Bật / Tắt chế độ toàn màn hình (Fullscreen).
  - Phím `M`: Chuyển đổi nhanh chế độ đọc.
- [ ] **Tùy Chỉnh Giao Diện & Bảo Vệ Mắt (Eye-Care Mode):**
  - Tùy chọn màu nền: Vàng ấm (Sepia ban đêm), Đen tuyền (AMOLED Black), Xám tối, Trắng sáng.
  - Thanh trượt điều chỉnh độ sáng (Brightness) và độ tương phản của trang truyện.

### 2.3 Cải Tiến Tương Tác Bình Luận & Chống Spoiler
- [ ] **Hỗ Trợ Thẻ Che Spoiler:**
  - Cú pháp `[spoil]nội dung tiết lộ[/spoil]`: Mặc định bị làm mờ, độc giả nhấp chuột vào mới hiển thị.
- [ ] **Bình Luận Phân Cấp (Nested Comments / Reply Tree):**
  - Hỗ trợ trả lời trực tiếp bình luận của người khác theo dạng cây phân cấp trực quan.

---

## ⚡ Giai Đoạn 3: Hệ Thống Thời Gian Thực Với SignalR (P2 - Real-Time Engagement)

### 3.1 Hạ Tầng SignalR Hub & Redis Backplane
- [ ] **Tích hợp SignalR trong .NET 10 Web API:**
  - Xây dựng `MangaHub.cs` hỗ trợ xác thực người dùng qua JWT Query Token.
  - Kết nối SignalR với **Redis Backplane** (`Microsoft.AspNetCore.SignalR.StackExchangeRedis`) để đồng bộ kết nối đa instance server.
- [ ] **Quản Lý Kênh Nhóm (Groups):**
  - Kênh người dùng: `User_{userId}` (nhận thông báo cá nhân).
  - Kênh truyện: `Comic_{comicId}` (nhận thông báo phát hành chương mới).
  - Kênh phòng đọc: `Chapter_{chapterId}` (đồng bộ bình luận trực tiếp và đếm độc giả).

### 3.2 Trải Nghiệm Tương Tác Thời Gian Thực
- [ ] **Thông Báo Chương Mới Tức Thì (Instant Notification):**
  - Khi có chương mới được xuất bản, tự động bắn thông báo nổi (Toast Notification) tới tất cả độc giả đang online theo dõi truyện đó.
- [ ] **Luồng Bình Luận Trực Tiếp (Live Comments Stream):**
  - Bình luận mới và lượt thả tim hiển thị ngay lập tức trong chương đang đọc mà không cần tải lại trang.
- [ ] **Bộ Đếm Độc Giả Trực Tiếp (Live Readers Counter):**
  - Hiển thị badge: *"🔥 Có X người đang cùng đọc chương này"* cập nhật thời gian thực.

---

## 🔐 Giai Đoạn 4: Chuẩn Hóa CSDL, Bảo Mật & Xác Thực (P2 - Security & Database Lifecycle)

### 4.1 Quản Lý Vòng Đời CSDL Chuẩn Hóa Với EF Core Migrations
- [ ] **Chuyển Đổi Sang EF Core Migrations:**
  - Xóa bỏ các lệnh `ExecuteSqlRaw` ALTER TABLE thủ công trong `Program.cs`.
  - Khởi tạo và quản lý toàn bộ cấu trúc bảng thông qua lệnh `dotnet ef migrations add Initial_Schema_Sync`.
  - Tự động chạy `db.Database.Migrate()` an toàn khi triển khai production.

### 4.2 Kiểm Tra Dữ Liệu Đầu Vào & Chống XSS (Input Sanitization)
- [ ] **Tích hợp FluentValidation & Anti-XSS:**
  - Đăng ký bộ validator tự động kiểm tra định dạng dữ liệu cho tất cả DTOs.
  - Làm sạch các trường văn bản đầu vào (bình luận, tên tài khoản, nội dung báo cáo lỗi) tránh tấn công Stored XSS.
- [ ] **Siết Chặt Phân Quyền Quản Trị (Admin RBAC):**
  - Rà soát toàn bộ các endpoint trong `UserAndAdminControllers.cs` đảm bảo gắn đúng `[Authorize(Roles = "Admin")]`.

---

## 🤖 Giai Đoạn 5: Tự Động Hóa Crawler, Giám Sát & DevOps (P3 - Automation & Operations)

### 5.1 Quản Lý Tự Động Hóa Crawler Với Hangfire
- [ ] **Tích Hợp Hangfire Dashboard:**
  - Tích hợp Hangfire vào backend .NET, bảo vệ đường dẫn `/hangfire` chỉ cho phép Admin truy cập.
- [ ] **Lên Lịch Tự Động Quét Chương Mới (Auto-Crawler Recurring Jobs):**
  - Thiết lập Cron Job định kỳ 30 - 60 phút tự động kiểm tra và tải các chương mới từ các đầu truyện đang theo dõi, nén WebP và đẩy lên MinIO / Cloudflare R2.

### 5.2 Quản Lý Log Tập Trung (Structured Logging)
- [ ] **Cấu Hình Serilog Structured Logging:**
  - Thay thế toàn bộ `Console.WriteLine` bằng `ILogger` ghi log định dạng JSON có cấu trúc kèm `CorrelationId`, `UserId` và `ExecutionTimeMs`.
  - Kết nối log tập trung tới Grafana Loki hoặc Seq.

### 5.3 Tự Động Hóa CI/CD Với GitHub Actions
- [ ] **Thiết Lập GitHub Actions Workflow:**
  - Tự động chạy Unit Tests (`dotnet test`, `ng test`) khi tạo Pull Request hoặc Push code.
  - Tự động build Docker Image cho Angular Frontend và .NET Backend, đẩy lên Docker Hub hoặc GitHub Container Registry.

---

## 🏆 Giai Đoạn 6: Gamification, Cộng Đồng & Đánh Giá Truyện (P3 - Community & Gamification)

### 6.1 Hệ Thống Cấp Bậc Độc Giả (User Leveling & EXP)
- [ ] **Tính Điểm Kinh Nghiệm (EXP) & Cảnh Giới:**
  - Cộng EXP khi đọc hết 1 chương (+10 EXP), bình luận (+5 EXP), điểm danh hàng ngày (+20 EXP).
  - Hệ thống cấp bậc: *Luyện Khí ➔ Trúc Cơ ➔ Kim Đan ➔ Nguyên Anh ➔ Hóa Thần ➔ Độ Kiếp* (hoặc *Tân Thủ ➔ Đồng ➔ Bạc ➔ Vàng ➔ Kim Cương ➔ Tinh Anh*).
- [ ] **Khung Avatar Phát Sáng & Huy Hiệu Độc Quyền:**
  - Mở khóa khung viền avatar động theo cấp bậc hoặc danh hiệu Top Độc Giả của tháng.

### 6.2 Hệ Thống Đánh Giá & Review Truyện (Rating & Reviews)
- [ ] **Chấm Điểm Sao & Viết Nhận Xét:**
  - Cho phép người dùng chấm điểm (1 - 5 sao) và viết bài cảm nhận chi tiết cho truyện.
  - Điều kiện chống spam vote: Yêu cầu tài khoản đã đọc tối thiểu 3 chương mới được đánh giá.

---

## 📊 Bảng Tổng Hợp Thứ Tự Ưu Tiên Triển Khai (Priority Matrix)

| Giai Đoạn | Hạng Mục Công Việc | Mức Độ Ưu Tiên | Độ Phức Tạp | Lợi Ích Trọng Tâm |
| :--- | :--- | :--- | :--- | :--- |
| **Giai Đoạn 1** | Tối ưu tìm kiếm In-Memory, phân trang Comments, Redis non-blocking | ⭐⭐⭐⭐⭐ (P0) | Vừa phải | Giảm 80% tải RAM/CPU, ngăn chặn server sập khi đông truy cập |
| **Giai Đoạn 2** | PWA Đọc Offline (IndexedDB), Reader Engine đa chế độ (Webtoon/RTL) | ⭐⭐⭐⭐⭐ (P1) | Cao | Đột phá trải nghiệm người dùng trên Mobile & PC |
| **Giai Đoạn 3** | SignalR Hub Realtime, Live Comments, Thông báo chương mới | ⭐⭐⭐⭐ (P2) | Vừa phải | Tăng tương tác trực tiếp và giữ chân người dùng |
| **Giai Đoạn 4** | Chuẩn hóa EF Core Migrations, FluentValidation, chống XSS | ⭐⭐⭐⭐ (P2) | Thấp | Tăng độ an toàn dữ liệu và tính ổn định hạ tầng |
| **Giai Đoạn 5** | Hangfire Auto-Crawler, Serilog Structured Logging, CI/CD | ⭐⭐⭐ (P3) | Vừa phải | Tự động hóa vận hành 24/7 và giám sát lỗi chuyên nghiệp |
| **Giai Đoạn 6** | Gamification (Cấp bậc tu tiên), Đánh giá & Reviews 5 sao | ⭐⭐⭐ (P3) | Vừa phải | Thúc đẩy tính cộng đồng và thời gian on-site của độc giả |

---
*Kế hoạch cải thiện hệ thống TruyenKomi - Cập nhật 2026.*

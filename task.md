# 📋 Lộ Trình Tối Ưu Hệ Thống TruyenKomi Cho 1 Triệu Người Dùng (Optimization Roadmap)

Tài liệu hướng dẫn triển khai lần lượt các tác vụ tối ưu hóa hiệu năng, băng thông và khả năng chịu tải cho hệ thống **TruyenKomi** (Angular + .NET 10 + MS SQL Server + Redis + MinIO).

---

## 🎯 Giai Đoạn 1: Giải Quyết Các Điểm Nghẽn Cấp Bách (Urgent Bottlenecks)

### 1.1 Tách Bỏ Luồng Ghi Lượt Xem (View Counter) Đồng Bộ
- [x] **Tạo Redis View Counter Key:** Định dạng key `comic_views_count_{id}` và `chapter_views_count_{id}`.
- [x] **Cập nhật `ComicService.cs` & `CacheService.cs`:** Chuyển thao tác tăng view sang `IConnectionMultiplexer` Redis (`StringIncrementAsync`).
- [x] **Xây dựng Background Worker (.NET `IHostedService`):**
  - Chạy định kỳ 3 phút/lần (`ViewSyncWorker.cs`).
  - Lấy tổng số view từ Redis và thực hiện Batch Update xuống SQL Server bằng EF Core 9 `ExecuteUpdateAsync`.
  - Xóa/Reset counter trên Redis sau khi đồng bộ thành công.

### 1.2 Thiết Lập Cloudflare CDN & Cache Headers Cho Ảnh Truyện (MinIO / S3 / R2)
- [x] **Cấu hình Cache-Control Headers & Dynamic CDN Base URL:**
  - Thiết lập `ImageCacheMiddleware.cs` với `Cache-Control: public, max-age=31536000, immutable`.
  - Cập nhật `MinioStorageService.cs` & `appsettings.json` động theo cấu hình `CdnBaseUrl` (Cloudflare CDN / Cloudflare R2).
- [x] **Kết Nối Cloudflare Edge CDN & Cloudflare Tunnel (`cloudflared`):**
  - Cấu hình Edge Cache Rules, Page Rules, WAF Rate Limiting & Zero Egress Fee trong tài liệu [cloudflare.md](file:///c:/Users/ADMIN/Desktop/angular_comic/cloudflare.md).
  - Tích hợp service `cloudflared` vào `docker-compose.yml` để tạo đường truyền bảo mật tới Cloudflare Edge.

---

## ⚡ Giai Đoạn 2: Tối Ưu Caching & Backend API (.NET 10 & Redis)

### 2.1 Mở Rộng Redis Caching Layer (Cache-Aside Pattern)
- [x] **Cache API Metadata Trang Chủ:**
  - Cache danh sách truyện nổi bật (`Hot`), mới cập nhật (`Latest`), thể loại (`Categories`) (TTL: 15 phút) sử dụng `GetOrSetAsync`.
- [x] **Cache Chi Tiết Chapter & Danh Sách Trang Ảnh:**
  - Cache JSON danh sách trang ảnh của từng Chapter (`chapter:pages:{chapterId}`) (TTL: 24 giờ).
- [x] **Chống Cache Stampede (Thundering Herd):**
  - Áp dụng `ConcurrentDictionary` + `SemaphoreSlim` (Double-Check Locking) trong `GetOrSetAsync` và hỗ trợ xóa theo pattern `RemoveByPatternAsync`.

### 2.2 Tối Ưu Hóa Query Entity Framework Core 9
- [x] **Rà soát Query:** Chuyển tất cả truy vấn chỉ đọc (Read-only queries) sang `.AsNoTracking()`.
- [x] **Đánh Index SQL Server:**
  - Kiểm tra và bổ sung Index cho các cột thường xuyên `WHERE` / `JOIN` / `ORDER BY`: `Comics(Slug)`, `Chapters(ComicId, ChapterNumber)`, `ChapterPages(ChapterId, PageNumber)`, `ReadingHistories(UserId, LastReadAt)`.

---

## 🖼️ Giai Đoạn 3: Tối Ưu Frontend Angular & Trải Nghiệm Đọc

### 3.1 Tối Ưu Hóa Tải Ảnh Trong Component Đọc Truyện (`chapter-read`)
- [x] **Áp Dụng Eager/Lazy Loading, `decoding="async"` & `fetchpriority`:**
  - Thiết lập `eager` + `fetchpriority="high"` cho 2 trang đầu (LCP optimization) và `loading="lazy"` cho các trang tiếp theo.
- [x] **Tải Trước Trang Ảnh (Prefetching):**
  - Tự động prefetch 5 trang ảnh đầu tiên khi load chapter (`prefetchCurrentChapterPages`) và tự động prefetch chapter tiếp theo khi cuộn qua 70% chiều dài trang.

### 3.2 Tối Ưu Băng Thông Ảnh Tại Engine Crawler
- [x] **Cấu hình `sharp` trong Node.js Crawler (`crawler.js`):**
  - Tự động convert và nén tất cả trang ảnh về định dạng **WebP chất lượng cao (Quality 90, Near-Lossless, Smart Subsampling, Effort 6)** - giữ trọn vẹn 100% độ sắc nét, màu sắc và đường nét văn bản như ảnh gốc.
  - Tự động giữ nguyên độ phân giải chuẩn cao lên tới **1920px** (chuẩn đọc truyện nét căng cho màn hình PC 2K/4K và Mobile).

### 3.3 Tối Ưu Bundle & Phân Trang (Angular SPA)
- [x] **Phân Trang / Lazy Rendering Bình Luận & Chapter:**
  - Áp dụng `visibleCommentsCount` và nút "Xem thêm bình luận" tại `comic-detail` tránh render DOM quá tải.
- [x] **Tối Ưu Hóa Production Bundle Build:**
  - Cấu hình `angular.json` với `optimization: true`, `outputHashing: "all"`, `buildOptimizer: true` giúp nén bundle còn 105 kB gzipped.

---

## 🏗️ Giai Đoạn 4: Hạ Tầng & Khả Năng Mở Rộng (Scalability & Infrastructure)

### 4.1 Bảo Mật & Chống Bot Cào Truyện (Anti-Scraper)
- [x] **Cấu hình Rate Limiting & Anti-Scraper (Nginx, Cloudflare WAF & API Middleware):**
  - Giới hạn request/giây từ 1 IP đối với các endpoint API đọc truyện (10r/s), API chung (30r/s) và tải ảnh CDN (50r/s) trong [nginx.conf](file:///c:/Users/ADMIN/Desktop/angular_comic/nginx.conf).
  - Bổ sung `AntiScraperMiddleware` và `chapter-limiter` policy trong .NET 10 Web API chặn đứng các bot cào tự động (`Scrapy`, `Python-requests`, `Bytespider`, `Sqlmap`,...).
  - Thiết lập Cloudflare Edge Rate Limiting Rules, Super Bot Fight Mode và Hotlink Protection trong tài liệu [cloudflare.md](file:///c:/Users/ADMIN/Desktop/angular_comic/cloudflare.md).
- [x] **Bảo vệ JWT Token & Session:**
  - Cấu hình HttpOnly Cookie cho Refresh Token (`truyenkomi_refresh_token`) với các cờ `HttpOnly=true`, `SameSite=Lax`, `Path=/api/auth`, và dynamic `Secure=Request.IsHttps` chống triệt để tấn công XSS.
  - Triển khai cơ chế Refresh Token Rotation và Token Revocation an toàn khi đăng xuất trong `AuthController.cs` & `AuthService.cs`.

---

## 📈 Giai Đoạn 5: Kiểm Thử Tải & Giám Sát (Load Testing & Monitoring)

### 5.1 Kiểm Thử Chịu Tải (Load Testing)
- [x] **Xây dựng kịch bản kiểm thử tải đa tầng (k6 & Autocannon):**
  - Giả lập 1.000 đến 10.000 Virtual Users (VUs) đọc truyện, tìm kiếm và truy xuất trang chủ đồng thời (`loadtests/k6-load-test.js`, `k6-stress-test.js`, `k6-spike-test.js`).
  - Xây dựng công cụ benchmark Node.js tức thì (`loadtests/autocannon-benchmark.js`) đo đạc Latency (P50/P95/P99), Throughput (RPS), Error rate và SLA compliance.
- [x] **Phát hiện & Tối Ưu Bottleneck:** Đo đạc khả năng chịu tải của Redis Cache-Aside, Connection Multiplexer, và Background View Sync Worker.

### 5.2 Giám Sát Hệ Thống (APM, Metrics & Health Checks)
- [x] **Tích hợp Prometheus Metrics & ASP.NET Core Health Checks:**
  - Tích hợp `prometheus-net.AspNetCore` tạo endpoint `/metrics` thu thập Request Duration, Throughput, GC/Memory, ThreadPool, và Custom Business Metrics (`MangaMetrics.cs`).
  - Xây dựng Probes `/health`, `/health/ready`, `/health/live` giám sát trạng thái SQL Server, Redis Cache và MinIO Storage.
- [x] **Thiết lập Stack Prometheus + Grafana APM Dashboard:**
  - Tích hợp Prometheus và Grafana vào `docker-compose.yml` với cấu hình tự động kết nối Datasource.
  - Cung cấp sẵn Dashboard APM trực quan (`truyenkomi-apm.json`) theo dõi Response time, RPS, Redis Cache Hit Ratio, Views traffic và hệ thống cảnh báo Alerting Rules (`alert.rules.yml`).
  - Tài liệu chi tiết hướng dẫn kiểm thử tải & vận hành APM trong [loadtest_monitoring.md](file:///c:/Users/ADMIN/Desktop/angular_comic/loadtest_monitoring.md).

---
*Tài liệu tác vụ tối ưu hóa TruyenKomi cho 1M users - Cập nhật hoàn tất 2026.*

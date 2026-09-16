# 🏗️ Kiến Trúc Hệ Thống TruyenKomi (Next.js Fullstack Architecture)

Nền tảng đọc và quản lý truyện tranh trực tuyến **TruyenKomi** phiên bản **Next.js Fullstack** được thiết kế theo mô hình **Unified Fullstack Architecture** dựa trên **Next.js 15+ (App Router)**. Kiến trúc này tận dụng **React Server Components (RSC)** để tối ưu SEO và tốc độ nạp trang ban đầu (TTFB < 100ms), kết hợp **Server Actions / Route Handlers** cho Backend API, **Redis Caching & Batch Buffering**, **MinIO/Cloudflare R2** cho Object Storage, và **BullMQ Worker** cho hệ thống cào truyện tự động.

---

## 📌 1. Tổng Quan Kiến Trúc (System Architecture Overview)

```mermaid
graph TD
    subgraph Client & Edge Layer
        Client[Web Browser / Mobile PWA]
        CF[Cloudflare Edge CDN / WAF / Turnstile]
    end

    subgraph Next.js Fullstack Engine - App Router
        subgraph Frontend Layer - React 19
            RSC[React Server Components - SSR / ISR]
            RCC[Client Components - Interactive UI & PWA Reader]
        end

        subgraph Backend & API Layer
            MW[Edge Middleware - JWT Auth / RBAC / Rate Limit]
            SA[Server Actions - Form Mutations & Actions]
            RH[Route Handlers - REST API / Webhooks / Metrics]
            SSE[SSE Stream / WebSocket Server - Live Readers & Comments]
        end

        subgraph Core Services Layer
            S_Auth[Auth & User Service]
            S_Comic[Comic & Chapter Service]
            S_Cache[Multi-tier Cache Service]
            S_Game[Gamification & EXP Service]
            S_Search[Search Engine Service]
            S_Store[MinIO / R2 Storage Service]
        end
    end

    subgraph Data & Storage Layer
        DB[(Primary Database: PostgreSQL / MS SQL - Prisma ORM)]
        Redis[(Redis Cache v7 + Redis Streams / PubSub)]
        SearchDB[(Meilisearch Engine)]
        Storage[(MinIO / Cloudflare R2 Object Storage)]
    end

    subgraph Background & Worker Layer
        Worker[BullMQ Ingestion Worker]
        Crawler[Crawler Engine + Sharp Image Pipeline]
        ViewWorker[Batch View Buffering Worker]
    end

    subgraph Observability & APM Layer
        Prom[Prometheus Metrics - prom-client]
        Graf[Grafana Dashboards]
    end

    %% Flow Connections
    Client <-->|HTTPS / HTTP2 / PWA| CF
    CF <-->|Reverse Proxy| MW
    MW --> RSC
    MW --> RCC
    MW --> SA
    MW --> RH
    
    RSC & RCC & SA & RH --> S_Auth & S_Comic & S_Cache & S_Game & S_Search & S_Store
    
    S_Auth & S_Comic & S_Game <-->|Prisma ORM / Connection Pool| DB
    S_Cache <-->|ioredis / Cache Tag Invalidation| Redis
    S_Search <-->|REST Client / Search Query| SearchDB
    S_Store <-->|AWS S3 SDK v3 / Presigned URLs| Storage

    Crawler -->|Extract & Sharp Optimize| Storage
    Crawler -->|Push Payload via Ingestion API| RH
    RH -->|Push Jobs| Worker
    Worker -->|Sync Metadata| DB
    Worker -->|Index Data| SearchDB

    ViewWorker <-->|Buffer & Flush Batch Views| Redis & DB
    Prom -->|Scrape /api/metrics| RH
    Graf -->|Query Metrics| Prom
    SSE <-->|Real-time Events| Redis
```

---

## 🛠️ 2. Công Nghệ Sử Dụng (Technology Stack)

| Phân Hệ | Công Nghệ Lựa Chọn | Vai Trò & Mục Đích |
| :--- | :--- | :--- |
| **Fullstack Framework** | **Next.js 15+ (React 19, App Router)** | Hợp nhất FE & BE, hỗ trợ SSR, ISR, Server Actions và Route Handlers. |
| **Language & Typing** | **TypeScript 5.x** | Đảm bảo Type-safety từ Frontend đến Backend DB Schema. |
| **Styling & UI Engine** | **Tailwind CSS + Lucide Icons + Framer Motion** | Giao diện tối ưu, Dark/Light Mode, Sepia Eye-Care, micro-animations. |
| **State Management** | **Zustand + TanStack React Query** | Quản lý state cục bộ cho Reader Settings, History, Filters và Client Cache. |
| **Database & ORM** | **Prisma ORM** (hoặc **Drizzle ORM**) | Quản lý Migration, Data Access Type-safe kết nối PostgreSQL / MS SQL. |
| **Auth & Security** | **Auth.js v5 (NextAuth)** + **Jose / Argon2** | Quản lý Access/Refresh Token trong HttpOnly Cookies, RBAC, Rate Limiting. |
| **Distributed Cache** | **ioredis + Next.js `unstable_cache`** | Multi-tier caching: Cache Tag, Cache Invalidation, Redis SCAN không blocking. |
| **Search Engine** | **Meilisearch API Client** | Tìm kiếm truyện tức thì (<10ms), Typo-tolerant, tiếng Việt không dấu. |
| **Object Storage** | **AWS SDK v3 (`@aws-sdk/client-s3`)** | Giao tiếp S3-compatible API với **MinIO** cục bộ hoặc **Cloudflare R2**. |
| **Image Processing** | **Sharp + Next/Image Optimizer** | Tự động tối ưu WebP/AVIF, Lazy Loading, CDN caching cho hàng triệu trang truyện. |
| **Queue & Workers** | **BullMQ + Redis** | Xử lý cào truyện ngầm, tối ưu ảnh, batching update lượt xem theo chu kỳ. |
| **Offline & PWA** | **`next-pwa` + `idb` (IndexedDB)** | Cho phép tải chương/truyện đọc offline, Service Worker caching. |
| **Observability** | **`prom-client` + Winston/Pino** | Endpoint `/api/metrics` cho Prometheus, Grafana APM và health check. |

---

## 📁 3. Cấu Trúc Thư Mục Chuẩn (`src/`)

```
truyenkomi-next/
├── prisma/
│   ├── schema.prisma            # Schema định nghĩa Entities và Relations
│   └── migrations/              # Lịch sử Database Migrations
├── public/                      # Static assets, PWA manifest, icons
│   ├── manifest.json
│   ├── sw.js
│   └── icons/
├── src/
│   ├── app/                     # Next.js App Router
│   │   ├── (auth)/              # Route Group: Auth Pages
│   │   │   ├── login/page.tsx
│   │   │   ├── register/page.tsx
│   │   │   └── forgot-password/page.tsx
│   │   ├── (main)/              # Route Group: Độc giả
│   │   │   ├── layout.tsx       # Main Layout (Navbar, Footer, Notifications)
│   │   │   ├── page.tsx         # Trang chủ (Banner, Hot Comics, Mới Cập Nhật - ISR)
│   │   │   ├── comics/          # Danh sách & Bộ lọc truyện
│   │   │   │   ├── page.tsx
│   │   │   │   └── [slug]/      # Chi tiết truyện (/comics/dao-hai-tac)
│   │   │   │       ├── page.tsx
│   │   │   │       └── [chapter]/ # Bộ đọc chương (/comics/dao-hai-tac/chuong-1)
│   │   │   │           └── page.tsx
│   │   │   ├── categories/page.tsx
│   │   │   ├── history/page.tsx
│   │   │   ├── followed/page.tsx
│   │   │   ├── offline/page.tsx # Tủ truyện offline (IndexedDB)
│   │   │   ├── profile/page.tsx # Hồ sơ, Cấp bậc EXP, Gamification
│   │   │   └── search/page.tsx
│   │   ├── (admin)/             # Route Group: Quản trị (Admin Protected)
│   │   │   ├── layout.tsx       # Admin Sidebar & Dashboard Shell
│   │   │   └── admin/
│   │   │       ├── page.tsx     # Thống kê tổng quan & Charts
│   │   │       ├── comics/      # Quản lý truyện & Form thêm/sửa
│   │   │       ├── chapters/    # Quản lý chapter & Upload ảnh
│   │   │       ├── genres/      # Quản lý thể loại
│   │   │       ├── comments/    # Kiểm duyệt bình luận
│   │   │       ├── reports/     # Xử lý báo lỗi chương/ảnh
│   │   │       └── users/       # Phân quyền & Quản lý User
│   │   ├── api/                 # Route Handlers (Backend REST API & Webhooks)
│   │   │   ├── auth/[...nextauth]/route.ts
│   │   │   ├── comics/route.ts
│   │   │   ├── chapters/[id]/route.ts
│   │   │   ├── comments/route.ts
│   │   │   ├── ratings/route.ts
│   │   │   ├── upload/route.ts  # Presigned URL S3/MinIO
│   │   │   ├── crawler/ingest/route.ts # Endpoint nhận truyện từ crawler
│   │   │   ├── realtime/sse/route.ts   # Server-Sent Events (Live reader count)
│   │   │   ├── health/route.ts  # Health check endpoint
│   │   │   └── metrics/route.ts # Prometheus scraping
│   │   ├── global-error.tsx
│   │   ├── not-found.tsx
│   │   └── layout.tsx
│   │
│   ├── actions/                 # Next.js Server Actions (Mutations & Forms)
│   │   ├── auth.actions.ts
│   │   ├── comic.actions.ts
│   │   ├── comment.actions.ts
│   │   ├── rating.actions.ts
│   │   ├── user.actions.ts
│   │   └── report.actions.ts
│   │
│   ├── components/              # React Components
│   │   ├── ui/                  # Design System (Button, Modal, Toast, Input...)
│   │   ├── common/              # Navbar, Footer, Breadcrumbs, Pagination
│   │   ├── comic/               # ComicCard, ComicGrid, ChapterList, RatingStar
│   │   ├── reader/              # WebtoonReader, PageFlipReader, ReaderToolbar
│   │   ├── comment/             # CommentList, CommentItem, SpoilerBadge
│   │   └── admin/               # StatsCard, DataTable, ImageUploader
│   │
│   ├── services/                # Backend Core Business Logic (Singleton Pattern)
│   │   ├── auth.service.ts
│   │   ├── comic.service.ts
│   │   ├── chapter.service.ts
│   │   ├── comment.service.ts
│   │   ├── cache.service.ts     # Redis Caching (SCAN, Multi-tag invalidation)
│   │   ├── storage.service.ts   # MinIO / Cloudflare R2 Client
│   │   ├── search.service.ts    # Meilisearch Integration
│   │   ├── gamification.service.ts # Tính Level, EXP, Daily Streak
│   │   └── notification.service.ts
│   │
│   ├── lib/                     # Utilities, Database Clients, Configs
│   │   ├── prisma.ts            # Prisma Global Client Singleton
│   │   ├── redis.ts             # ioredis Global Client
│   │   ├── s3.ts                # S3 Client Singleton
│   │   ├── text-normalizer.ts   # Vietnamese accent remover
│   │   └── rate-limiter.ts      # Upstash/Redis Rate Limiter
│   │
│   ├── hooks/                   # Custom React Hooks
│   │   ├── use-reader-settings.ts
│   │   ├── use-offline-storage.ts # IndexedDB Storage Manager
│   │   └── use-live-readers.ts
│   │
│   ├── stores/                  # Zustand Global Client Stores
│   │   └── reader-store.ts
│   ├── types/                   # TypeScript DTOs & Interfaces
│   └── middleware.ts            # Next.js Edge Middleware (Auth Guard, RBAC, Anti-Spam)
│
├── workers/                     # Background Queues & Ingestion Engine
│   ├── index.ts                 # BullMQ Runner
│   ├── crawler.worker.ts        # Manga Ingestion Worker
│   ├── image-processor.ts       # Sharp WebP Batch Converter
│   └── view-sync.worker.ts      # Batch Flush View Counts to DB
│
├── docker-compose.yml           # Database, Redis, MinIO, Meilisearch, Prometheus
└── next.config.ts               # Image domains, headers, PWA config
```

---

## 🏛️ 4. Chi Tiết Các Lớp Chức Năng (Layer Architecture)

### 4.1. Lớp Trình Diễn & Rendering (Presentation Layer)
* **Server Components (RSC):**
  * Trang chủ, Danh mục thể loại, Chi tiết truyện được render trực tiếp tại Server.
  * Tận dụng **Incremental Static Regeneration (ISR)** với `revalidate = 60` hoặc `revalidateTag('comic-detail')` giúp tải trang ngay lập tức mà vẫn đảm bảo dữ liệu mới nhất.
* **Client Components (`'use client'`):**
  * **Interactive Reader Engine:** Hỗ trợ 3 chế độ: **Webtoon (cuộn dọc)**, **Single Page Flip (lật từng trang)**, **Double Page RTL (Manga)**.
  * **Eye-Care Reader Mode:** 4 chế độ màu nền (Sepia vàng dịu, AMOLED đen sâu, Dark xám, Light trắng), thanh điều chỉnh độ sáng, phím tắt điều hướng (`A/D`, `←/→`, `F`, `M`).
  * **Offline PWA Engine:** Đọc truyện mượt mà không cần internet qua Service Worker và IndexedDB (`idb`).

### 4.2. Lớp Backend API & Server Actions
* **Server Actions (`src/actions/`):**
  * Xử lý tương tác người dùng: Đăng nhập/Đăng ký, Đánh giá sao, Theo dõi truyện, Gửi bình luận (hỗ trợ tag `[spoil]...[/spoil]`), Báo lỗi chapter.
  * Tích hợp xác thực dữ liệu đầu vào với **Zod Schemas** và gọi tự động `revalidatePath` để cập nhật giao diện mà không cần refresh trang.
* **Route Handlers (`src/app/api/`):**
  * Cung cấp REST endpoints cho Crawler Engine, Upload file (Presigned URL), Webhooks và Xuất số liệu `/api/metrics` cho Prometheus.
* **Edge Middleware (`src/middleware.ts`):**
  * Xác thực JWT token từ HttpOnly Cookie.
  * Phân quyền **Role-Based Access Control (RBAC)**: Chỉ cho phép tài khoản `Admin` hoặc `Moderator` truy cập `/admin/*`.
  * Áp dụng Rate Limiting chống Brute-force và Spam API.

### 4.3. Caching & Buffer Lượt Xem (Multi-Tier Caching)
* **Tier 1 - Next.js Data Cache:** Cache kết quả truy vấn database theo Tags (`unstable_cache`). Khi thêm chapter mới, gọi `revalidateTag('comic-${slug}')` để xóa cache tức thì.
* **Tier 2 - Redis Distributed Cache:**
  * Cache danh sách trang ảnh Chapter (TTL: 2 giờ).
  * Cache Bảng xếp hạng Top ngày/tuần/tháng (TTL: 15 phút).
  * **Xóa cache theo pattern không blocking:** Dùng `SCAN` cursor thay vì lệnh `KEYS *`.
* **Buffer Lượt Xem (View Syncing):**
  * Khi độc giả đọc chapter, lượt xem được `INCR` vào Redis Key `comic:views:{id}`.
  * Định kỳ mỗi 30 giây, `view-sync.worker.ts` dùng Batch SQL (`UPDATE ... FROM ...`) để đồng bộ toàn bộ lượt xem về DB trong **1 câu truy vấn duy nhất**, loại bỏ hoàn toàn tình trạng nghẽn cổ chai Database.

### 4.4. Hệ Thống Cào Truyện & Xử Lý Ảnh (Data Ingestion Pipeline)
* **Crawler & Worker:** Chạy tách biệt qua **BullMQ + Redis**, không làm ảnh hưởng hiệu năng của ứng dụng web chính.
* **Quy trình tối ưu:**
  1. Crawler tải ảnh raw từ nguồn ngoài.
  2. Dùng **Sharp** chuyển đổi sang định dạng `.webp` với chất lượng nén 80%.
  3. Upload trực tiếp lên **MinIO / Cloudflare R2**.
  4. Gửi metadata về Next.js API để lưu Database và đẩy vào **Meilisearch**.

---

## 🗄️ 5. Mô Hình Dữ Liệu (Prisma Schema Reference)

```prisma
datasource db {
  provider = "postgresql" // hoặc "sqlserver"
  url      = env("DATABASE_URL")
}

generator client {
  provider = "prisma-client-js"
}

enum Role {
  USER
  MODERATOR
  ADMIN
}

enum ComicStatus {
  ONGOING
  COMPLETED
  DROPPED
}

model User {
  id              String         @id @default(uuid())
  username        String         @unique
  email           String         @unique
  passwordHash    String
  role            Role           @default(USER)
  avatar          String?
  exp             Int            @default(0)
  level           Int            @default(1)
  dailyStreak     Int            @default(0)
  lastActiveAt    DateTime       @default(now())
  refreshToken    String?
  refreshExpiry   DateTime?
  createdAt       DateTime       @default(now())
  updatedAt       DateTime       @updatedAt

  comments        Comment[]
  ratings         ComicRating[]
  follows         Follow[]
  histories       History[]
  notifications   Notification[]
  reports         Report[]

  @@index([email])
  @@index([username])
}

model Comic {
  id              String         @id @default(uuid())
  title           String
  titleUnaccent   String         // Dùng cho tìm kiếm không dấu
  slug            String         @unique
  otherNames      String?
  author          String?
  status          ComicStatus    @default(ONGOING)
  coverImage      String
  bannerImage     String?
  description     String?        @db.Text
  views           BigInt         @default(0)
  monthlyViews    BigInt         @default(0)
  weeklyViews     BigInt         @default(0)
  ratingAvg       Float          @default(0.0)
  ratingCount     Int            @default(0)
  createdAt       DateTime       @default(now())
  updatedAt       DateTime       @updatedAt

  chapters        Chapter[]
  categories      ComicCategory[]
  comments        Comment[]
  ratings         ComicRating[]
  follows         Follow[]
  histories       History[]

  @@index([slug])
  @@index([titleUnaccent])
  @@index([views(sort: Desc)])
}

model Category {
  id              String          @id @default(uuid())
  name            String          @unique
  slug            String          @unique
  description     String?
  comics          ComicCategory[]
}

model ComicCategory {
  comicId         String
  categoryId      String
  comic           Comic           @relation(fields: [comicId], references: [id], onDelete: Cascade)
  category        Category        @relation(fields: [categoryId], references: [id], onDelete: Cascade)

  @@id([comicId, categoryId])
}

model Chapter {
  id              String         @id @default(uuid())
  comicId         String
  chapterNumber   Float
  title           String?
  views           BigInt         @default(0)
  createdAt       DateTime       @default(now())
  comic           Comic          @relation(fields: [comicId], references: [id], onDelete: Cascade)
  pages           ChapterPage[]
  comments        Comment[]
  reports         Report[]

  @@unique([comicId, chapterNumber])
  @@index([comicId, chapterNumber])
}

model ChapterPage {
  id              String         @id @default(uuid())
  chapterId       String
  pageIndex       Int
  imageUrl        String
  chapter         Chapter        @relation(fields: [chapterId], references: [id], onDelete: Cascade)

  @@unique([chapterId, pageIndex])
  @@index([chapterId])
}

model Comment {
  id              String         @id @default(uuid())
  content         String         @db.Text
  isSpoiler       Boolean        @default(false)
  likes           Int            @default(0)
  userId          String
  comicId         String
  chapterId       String?
  parentId        String?        // Hỗ trợ Nested Comments (Trả lời bình luận)
  createdAt       DateTime       @default(now())

  user            User           @relation(fields: [userId], references: [id], onDelete: Cascade)
  comic           Comic          @relation(fields: [comicId], references: [id], onDelete: Cascade)
  chapter         Chapter?       @relation(fields: [chapterId], references: [id], onDelete: Cascade)
  parent          Comment?       @relation("Replies", fields: [parentId], references: [id], onDelete: Cascade)
  replies         Comment[]      @relation("Replies")

  @@index([comicId, createdAt(sort: Desc)])
  @@index([chapterId])
}

model Follow {
  userId          String
  comicId         String
  createdAt       DateTime       @default(now())

  user            User           @relation(fields: [userId], references: [id], onDelete: Cascade)
  comic           Comic          @relation(fields: [comicId], references: [id], onDelete: Cascade)

  @@id([userId, comicId])
}

model History {
  userId          String
  comicId         String
  chapterId       String
  lastReadPage    Int            @default(1)
  updatedAt       DateTime       @default(now())

  user            User           @relation(fields: [userId], references: [id], onDelete: Cascade)
  comic           Comic          @relation(fields: [comicId], references: [id], onDelete: Cascade)

  @@id([userId, comicId])
}

model ComicRating {
  userId          String
  comicId         String
  score           Int            // 1 đến 5 sao
  createdAt       DateTime       @default(now())

  user            User           @relation(fields: [userId], references: [id], onDelete: Cascade)
  comic           Comic          @relation(fields: [comicId], references: [id], onDelete: Cascade)

  @@id([userId, comicId])
}

model Notification {
  id              String         @id @default(uuid())
  userId          String
  title           String
  message         String
  linkUrl         String?
  isRead          Boolean        @default(false)
  createdAt       DateTime       @default(now())

  user            User           @relation(fields: [userId], references: [id], onDelete: Cascade)
  @@index([userId, isRead])
}

model Report {
  id              String         @id @default(uuid())
  userId          String?
  chapterId       String
  reason          String
  status          String         @default("PENDING") // PENDING, RESOLVED, REJECTED
  createdAt       DateTime       @default(now())

  user            User?          @relation(fields: [userId], references: [id], onDelete: SetNull)
  chapter         Chapter        @relation(fields: [chapterId], references: [id], onDelete: Cascade)
}
```

---

## 🔄 6. Các Luồng Hoạt Động Cốt Lõi (Core Sequence Flows)

### 6.1. Luồng Xác Thực (Next.js App Router Authentication)

```mermaid
sequenceDiagram
    autonumber
    actor User as Độc giả
    participant Client as React Client (Login Form)
    participant Action as Server Action (loginAction)
    participant Service as AuthService
    participant DB as Prisma (Database)

    User->>Client: Nhập email/username & password
    Client->>Action: Gọi loginAction(formData)
    Action->>Service: Xác thực thông tin đăng nhập
    Service->>DB: Query User theo email/username
    DB-->>Service: Trả về User & passwordHash
    Service->>Service: Argon2 / BCrypt verify password
    Service->>Service: Tạo JWT Access Token & Refresh Token
    Service->>DB: Cập nhật Refresh Token & LastActive
    Service-->>Action: Trả về User Profile & Token Payload
    Action->>Action: Set HttpOnly Secure Cookies (access_token, refresh_token)
    Action-->>Client: Trả về { success: true }
    Client->>Client: Router refresh / Redirect về trang chủ
```

---

### 6.2. Luồng Đọc Truyện & Buffering Lượt Xem (Fast Reader Flow)

```mermaid
sequenceDiagram
    autonumber
    actor Reader as Độc giả
    participant Page as RSC Chapter Page (/comics/[slug]/[chapter])
    participant Redis as Redis Cache
    participant DB as Database (Prisma)
    participant Storage as MinIO / Cloudflare R2 CDN

    Reader->>Page: Truy cập đọc chương
    Page->>Redis: GET cache chapter pages: `chapter:{id}:pages`
    alt Cache Hit (<2ms)
        Redis-->>Page: Trả về danh sách Image URLs
    else Cache Miss
        Page->>DB: Query ChapterPages từ Database
        DB-->>Page: Danh sách trang ảnh
        Page->>Redis: SETEX cache chapter pages (TTL 2h)
    end
    Page->>Redis: INCR `comic:views:{comicId}` & `chapter:views:{chapterId}`
    Page-->>Reader: Render HTML + Next/Image Loader
    Reader->>Storage: Tải ảnh trực tiếp từ S3/MinIO qua CDN Edge
```

---

### 6.3. Luồng Tải Truyện Đọc Offline (PWA & IndexedDB Flow)

```mermaid
sequenceDiagram
    autonumber
    actor Reader as Độc giả
    participant UI as Reader Toolbar Component
    participant IDB as OfflineStorageService (IndexedDB)
    participant S3 as MinIO / R2 Storage

    Reader->>UI: Bấm "Tải chương này để đọc offline"
    UI->>UI: Khởi tạo tiến trình tải trang (0% -> 100%)
    loop Với từng trang ảnh trong chương
        UI->>S3: Fetch Image ArrayBuffer / Blob
        S3-->>UI: Trả về Image Binary Blob
        UI->>IDB: Lưu Blob ảnh & Metadata vào IndexedDB store: `chapters`
    end
    UI-->>Reader: Hiển thị thông báo: "Đã tải xong chương để đọc offline ✅"
    Note over Reader,IDB: Khi mất kết nối Internet, Reader tự chuyển sang đọc trực tiếp từ IndexedDB.
```

---

## 🔒 7. Chiến Lược Bảo Mật & Tối Ưu Hiệu Năng

### **Bảo Mật (Security & Hardening)**
1. **HttpOnly Cookie Tokens:** Ngăn chặn tuyệt đối các cuộc tấn công XSS đánh cắp JWT Token.
2. **Edge Rate Limiting:** 
   - Đăng nhập/Đăng ký: Tối đa **5 requests/phút**.
   - Bình luận/Đánh giá: Tối đa **15 requests/phút**.
   - API crawler ingest: Yêu cầu **Bearer Ingestion Secret Key**.
3. **Chống XSS & Data Sanitization:** Sử dụng `DOMPurify` / `sanitize-html` trên Server Actions trước khi lưu nội dung bình luận vào Database.
4. **Cloudflare Turnstile (Tùy chọn):** Bảo vệ form đăng ký và báo lỗi khỏi Bot spam.

### **Hiệu Năng (Performance Optimization)**
1. **Next/Image with Sharp:** Tự động nén WebP, responsive srcset và lazy load trang truyện kế tiếp (Preload n+1, n+2 pages).
2. **Meilisearch Indexed Search:** Tìm kiếm siêu tốc không phân biệt dấu tiếng Việt, không khóa hay ngốn CPU của Database chính.
3. **Batch View Buffering:** Gộp hàng ngàn lượt xem từ Redis về Database theo chu kỳ, giải phóng I/O disk.
4. **Multi-tag ISR Invalidation:** Cập nhật nội dung truyện mới ngay lập tức trên toàn hệ thống chỉ với 1 lời gọi `revalidateTag()`.

---

## 🚀 8. Hướng Dẫn Vận Hành & Khởi Chạy (Deployment & Setup)

### **1. Khởi chạy Services nền (Docker Compose)**
```bash
docker compose up -d
```
* **PostgreSQL:** `localhost:5432`
* **Redis Server:** `localhost:6379`
* **MinIO Console:** `http://localhost:9001`
* **Meilisearch:** `http://localhost:7700`
* **Prometheus:** `http://localhost:9090`

### **2. Cài đặt Dependencies & Migration CSDL**
```bash
npm install
npx prisma migrate dev --name init
npx prisma generate
```

### **3. Khởi chạy Development Server**
```bash
npm run dev
```
* Ứng dụng Next.js chạy tại: `http://localhost:3000`
* Health Check: `http://localhost:3000/api/health`
* Prometheus Metrics: `http://localhost:3000/api/metrics`

### **4. Khởi chạy Background Ingestion Worker**
```bash
npm run worker
```

---
*Tài liệu kiến trúc hệ thống TruyenKomi Next.js Fullstack - Cập nhật 2026.*

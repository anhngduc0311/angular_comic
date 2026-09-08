# 📚 Hướng Dẫn: Đổi Tên Miền Hệ Thống & Tối Ưu Tốc Độ Tải Truyện Hàng Loạt

Tài liệu này tổng hợp giải pháp chi tiết cho 2 vấn đề quan trọng trong quá trình vận hành hệ thống truyện **TruyenKomi**:
1. **Quy trình đổi tên miền linh hoạt & siêu tốc** mà không lo mất mát dữ liệu truyện đã tải.
2. **Các mẹo tối ưu tăng tốc độ tải truyện hàng loạt** từ MangaDex / ZetTruyen nhanh gấp 3 - 5 lần.

---

## 🌐 PHẦN 1: HƯỚNG DẪN ĐỔI TÊN MIỀN SAU KHI TẢI HẾT TRUYỆN

### 1. Vì sao không bao giờ lo mất dữ liệu ảnh?
* **Ảnh trên ổ cứng (`G:\My Drive\luutruyenkomi`)**: Lưu dạng file vật lý `.webp` cục bộ trên máy tính của bạn, độc lập 100% với tên miền.
* **Ảnh trên Cloud Storage (Cloudflare R2 / Google Cloud Storage)**: Dữ liệu nằm trong Bucket theo cấu trúc khóa:
  - Ảnh bìa: `covers/{slug}.webp`
  - Trang đọc: `chapters/{slug}/chap{x}/page_xxx.webp`
  Các object này không bị gắn cứng vào tên miền mà chỉ cần gắn tên miền CDN trỏ vào Bucket.

---

### 2. Các phương án đổi tên miền nhanh nhất

#### ⚡ Cách 1: Trỏ song song 2 tên miền vào cùng 1 Bucket (Nhanh nhất - 30 giây)
- **Cơ chế**: Thêm tên miền mới (`img.truyenkomi.com`) làm Custom Domain thứ 2 vào cùng Bucket R2 / GCS lưu ảnh.
- **Ưu điểm**:
  - Link ảnh cũ (`img.truyenkomi.site/...`) và link ảnh mới (`img.truyenkomi.com/...`) đều load được bình thường.
  - **Không cần sửa 1 dòng code hay 1 câu lệnh SQL nào trong Database**.

#### ⚡ Cách 2: Tạo Redirect Rule trên Cloudflare (1 phút)
- Trên Dashboard Cloudflare của domain cũ, vào **Rules** ➡️ **Redirect Rules** tạo quy tắc:
  - **Match**: `Hostname equals img.truyenkomi.site`
  - **Action**: Dynamic Redirect sang `concat("https://img.truyenkomi.com", http.request.uri.path)` (Status 301).
- Mọi truy cập ảnh từ link cũ sẽ được CDN chuyển tiếp tức thì sang link mới.

#### ⚡ Cách 3: Chạy lệnh đổi trực tiếp trong SQL / PostgreSQL (Chỉ 2 dòng lệnh)
Nếu bạn muốn Database hoàn toàn sạch sẽ và chuyển hẳn sang tên miền mới:
```sql
-- 1. Cập nhật ảnh bìa truyện
UPDATE "Comics" 
SET "CoverImage" = REPLACE("CoverImage", 'img.truyenkomi.site', 'img.truyenkomi.com'),
    "BannerImage" = REPLACE("BannerImage", 'img.truyenkomi.site', 'img.truyenkomi.com')
WHERE "CoverImage" LIKE '%img.truyenkomi.site%' OR "BannerImage" LIKE '%img.truyenkomi.site%';

-- 2. Cập nhật ảnh tất cả các trang chương truyện
UPDATE "ChapterPages" 
SET "ImageUrl" = REPLACE("ImageUrl", 'img.truyenkomi.site', 'img.truyenkomi.com')
WHERE "ImageUrl" LIKE '%img.truyenkomi.site%';
```
*Thời gian thực thi: Chỉ 2 - 5 giây cho hàng triệu trang ảnh.*

#### ⚡ Cập nhật cấu hình hệ thống
Sau khi đổi tên miền, cập nhật lại biến môi trường:
1. **File `.env`**:
   ```ini
   R2_CDN_BASE_URL=https://img.truyenkomi.com
   PUBLIC_DOMAIN=https://truyenkomi.com
   API_BASE_URL=https://truyenkomi.com/api
   ```
2. **File `backend/MangaFlux.API/appsettings.Production.json`**:
   ```json
   "CdnBaseUrl": "https://img.truyenkomi.com"
   ```
3. **Nginx (`nginx.conf`)**:
   Đổi `server_name` sang `truyenkomi.com www.truyenkomi.com` và cấp chứng chỉ SSL.

---

## ⚡ PHẦN 2: BÍ QUYẾT TĂNG TỐC TẢI TRUYỆN MANGADEX GẤP 3 - 5 LẦN

Khi tải hàng ngàn bộ truyện (6.800+ truyện từ MangaDex), áp dụng các thiết lập sau để tối đa hóa tốc độ:

### 1. Bật tùy chọn "MangaDex Data-Saver" ⚡
- **Vị trí**: Tích vào ô `MangaDex Data-Saver (Ảnh nén nhẹ)` trên giao diện Tool tải.
- **Tác dụng**: MangaDex sẽ trả về phiên bản ảnh nén nhẹ hơn **50% - 70%** so với ảnh gốc, chất lượng mắt nhìn tương đương 95%.
- **Hiệu quả**: Tốc độ tải nhanh gấp **2 lần** và tiết kiệm dung lượng ổ cứng / cloud đáng kể.

### 2. Tắt "Ghép ảnh (5-in-1)" khi tải Manga Nhật Bản 📖
- **Manhwa Hàn / Manhua Trung**: Vẽ theo dải cuộn dọc dài, bị cắt thành hàng trăm lát nhỏ nên **cần ghép** ảnh (`STITCH_GROUP_SIZE = 5`).
- **Manga Nhật**: Là các trang truyện rời (page 1, page 2, page 3,...). 
- **Mẹo**: Nếu truyện là Manga Nhật truyền thống, hãy bỏ chọn tính năng Ghép ảnh. Quá trình tải sẽ bỏ qua bước CPU phải giải nén - ghép ảnh - nén lại WebP, tải xong ảnh nào lưu ngay ảnh đó.

### 3. Quy trình tải tách biệt: Tải Local trước ➡️ Đồng bộ Cloud sau 🚀
- **Vấn đề**: Vừa tải từ MangaDex vừa đẩy từng ảnh lên Cloud sẽ gây nghẽn mạng do phải đợi handshake HTTP PUT từng file.
- **Cách làm tối ưu**:
  1. Tắt nút "Đồng bộ Web & Cloud" khi cắm máy tải hàng loạt về ổ cứng (`G:\My Drive\luutruyenkomi`).
  2. Khi tải xong một đợt lớn, dùng công cụ đồng bộ chuyên dụng như **Rclone**:
     ```bash
     rclone copy "G:\My Drive\luutruyenkomi" remote_r2:truyenkomi --transfers=64 --checkers=32 -P
     ```
  3. Tốc độ upload của Rclone sẽ đạt tối đa băng thông đường truyền nhà bạn (nhanh gấp 5 - 10 lần tải lẻ).

### 4. Tăng số luồng tải song song (Workers) 🚀
- Mặc định là `16 luồng`. Nếu đường truyền mạng từ 100Mbps - 1Gbps và CPU đa nhân, bạn có thể tăng lên `32` hoặc `48 luồng` để kéo toàn bộ ảnh của chương về trong vài giây.

---

## 🛠️ PHỤ LỤC: GHI CHÚ BẢN SỬA LỖI GHÉP ẢNH
- **Lỗi cũ**: `⚠️ Lỗi khi ghép nhóm ảnh: Operation on closed image`.
- **Nguyên nhân**: Trong `_merge_images_vertical` (`zet_downloader.py`), toán tử `im not in loaded_imgs` gọi `Image.__eq__` so sánh dữ liệu byte với ảnh đã bị đóng ở vòng lặp trước đó.
- **Đã khắc phục**: Sử dụng từ điển định danh `{id(im): im for im in (loaded_imgs + resized_imgs)}` đặt trong khối `finally`, giải phóng bộ nhớ sạch sẽ mà không bao giờ kích hoạt lỗi `Operation on closed image`.

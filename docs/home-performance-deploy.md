# Tối ưu tải trang chủ trên VPS Ubuntu

## Các thay đổi

- API danh sách chỉ nạp 3 chương mới nhất mỗi truyện. Tổng số chương và chương đầu được tính trong PostgreSQL; giữ nguyên dữ liệu trả về cho giao diện.
- Tách truy vấn thể loại và chương để tránh nhân số dòng khi JOIN hai danh sách.
- Sửa đường dẫn Nginx `location = /api/chapters/proxy-image`: trước đây regex API chương ghi đè nhánh cache ảnh.
- Ảnh bìa Zetimage/Viestorage trên home đi qua proxy ngay, dùng chung cache VPS thay vì đợi tải trực tiếp thất bại.
- Cache ảnh có volume riêng, giới hạn 10 GB như cấu hình cũ, giữ qua lần tạo lại container. Không gắn header cache một năm lên phản hồi lỗi.
- Ưu tiên tải ảnh đầu trang, tiếp tục lazy-load các ảnh còn lại.

## Cập nhật

Sau khi đưa các file đã sửa lên đúng thư mục dự án trên VPS, chạy tại thư mục chứa `docker-compose.yml`:

```bash
docker compose build api frontend
docker compose up -d --no-deps api frontend
docker compose run --rm --no-deps nginx nginx -t
docker compose up -d --no-deps --force-recreate nginx
```

Không cần chạy lại `deploy.sh`, khởi tạo database hoặc xóa volume. Cache ảnh cũ trong filesystem của container sẽ cần được nạp lại một lần khi chuyển sang volume mới. Lần đầu gặp một ảnh chưa cache vẫn phụ thuộc tốc độ CDN nguồn.

## Kiểm tra sau triển khai

Mở home với DevTools → Network, bật Disable cache để kiểm tra lần truy cập mới. Kiểm tra thời gian API search, ảnh bìa và lỗi HTTP. Với một URL ảnh bìa Zetimage thực tế từ API, gọi hai lần:

```bash
curl -sS -D - -o /dev/null --get \
  --data-urlencode 'url=https://cdn1.zetimage.com/thumb/ki-su-ba-nhat-the-gioi.jpg' \
  https://truyenkomi.com/api/chapters/proxy-image
```

Phản hồi thành công lần hai phải có `X-Cache-Status: HIT` nếu request tới Nginx này và ảnh đã được cache. Nếu Cloudflare phục vụ từ cache, kiểm tra trực tiếp gateway tại `http://127.0.0.1` trên VPS. Nếu không có header, kiểm tra reverse proxy bên ngoài có đang đi vào cổng frontend 4200 thay vì gateway cổng 80/8080 không.

Không có số liệu tăng tốc production trước/sau cho đến khi triển khai và đo lại trên cùng thiết bị/mạng. Đã kiểm tra production build Angular, 42 backend tests, truy vấn danh sách với PostgreSQL 16 riêng và `nginx -t` bằng image nginx:alpine.

import { Component } from '@angular/core';
import { CommonModule } from '@angular/common';

@Component({
  selector: 'app-privacy',
  standalone: true,
  imports: [CommonModule],
  template: `
    <div class="container static-page">
      <div class="page-card bg-glass">
        <div class="page-header">
          <h1><i class="fa-solid fa-user-shield text-success"></i> Chính Sách Bảo Mật Quyền Riêng Tư</h1>
          <p class="update-date">Cập nhật lần cuối: Ngày 01 tháng 01 năm 2026</p>
        </div>

        <div class="legal-content">
          <section class="section-block">
            <h2>1. Cam Kết Bảo Mật</h2>
            <p>
              TruyenKomi tôn trọng và cam kết bảo vệ quyền riêng tư của người dùng. Chính sách bảo mật này giải thích cách chúng tôi thu thập, sử dụng và bảo vệ thông tin cá nhân của bạn khi bạn sử dụng dịch vụ đọc truyện tranh trên website và ứng dụng của chúng tôi.
            </p>
          </section>

          <section class="section-block">
            <h2>2. Thông Tin Thu Thập</h2>
            <p>Chúng tôi chỉ thu thập các thông tin cần thiết tối thiểu để vận hành ứng dụng:</p>
            <ul>
              <li><strong>Thông tin tài khoản:</strong> Tên đăng nhập, Địa chỉ Email, Mật khẩu được mã hóa an toàn (khi bạn đăng ký tài khoản thành viên).</li>
              <li><strong>Dữ liệu đọc truyện:</strong> Lịch sử đọc chapter, danh sách truyện theo dõi, bookmark nhằm giúp bạn lưu vết quá trình đọc.</li>
              <li><strong>Dữ liệu kỹ thuật tự động:</strong> Địa chỉ IP, loại trình duyệt, hệ điều hành nhằm tối ưu hiển thị và phát hiện gian lận.</li>
            </ul>
          </section>

          <section class="section-block">
            <h2>3. Sử Dụng Cookie & Trình Lưu Trữ Cục Bộ (LocalStorage)</h2>
            <p>
              TruyenKomi sử dụng Cookie và LocalStorage để lưu trạng thái đăng nhập (JWT token), cài đặt giao diện (Chế độ đọc, kích thước chữ) và lịch sử đọc dở dang. Các dữ liệu này được lưu trữ an toàn trên thiết bị của bạn.
            </p>
          </section>

          <section class="section-block">
            <h2>4. Cam Kết Không Chia Sẻ Dữ Liệu</h2>
            <p>
              TruyenKomi tuyệt đối <strong>KHÔNG</strong> bán, trao đổi hoặc cho thuê thông tin cá nhân của người dùng cho bất kỳ bên thứ ba nào vì mục đích thương mại. Thông tin chỉ có thể được cung cấp trong trường hợp có yêu cầu chính thức từ cơ quan pháp luật có thẩm quyền.
            </p>
          </section>

          <section class="section-block">
            <h2>5. Quyền Của Người Dùng</h2>
            <p>Bạn có toàn quyền đối với dữ liệu cá nhân của mình:</p>
            <ul>
              <li>Xem và chỉnh sửa thông tin cá nhân bất kỳ lúc nào tại trang <a href="/settings" class="link-text">Cài Đặt Tài Khoản</a>.</li>
              <li>Yêu cầu xóa toàn bộ dữ liệu lịch sử đọc hoặc yêu cầu xóa vĩnh viễn tài khoản.</li>
            </ul>
          </section>
        </div>
      </div>
    </div>
  `,
  styles: [`
    .static-page {
      padding-top: 2.5rem;
      padding-bottom: 4rem;
    }

    .bg-glass {
      background: rgba(26, 26, 46, 0.85);
      backdrop-filter: blur(12px);
      border: 1px solid rgba(255, 255, 255, 0.08);
      border-radius: 20px;
      box-shadow: 0 8px 32px 0 rgba(0, 0, 0, 0.37);
      padding: 3rem;

      @media (max-width: 768px) {
        padding: 1.5rem;
      }
    }

    .page-header {
      border-bottom: 1px solid rgba(255, 255, 255, 0.1);
      padding-bottom: 1.5rem;
      margin-bottom: 2rem;

      h1 { font-size: 2rem; font-weight: 700; color: #fff; margin-bottom: 0.5rem; }
      .update-date { color: #34d399; font-size: 0.88rem; margin: 0; }
    }

    .legal-content {
      color: #cbd5e1;
      line-height: 1.7;

      .section-block {
        margin-bottom: 2rem;

        h2 {
          font-size: 1.3rem;
          color: #fff;
          font-weight: 600;
          margin-bottom: 0.75rem;
        }

        p {
          font-size: 0.98rem;
          margin-bottom: 0.75rem;
        }

        ul {
          padding-left: 1.5rem;
          margin-bottom: 0.75rem;

          li {
            margin-bottom: 0.4rem;
            font-size: 0.95rem;
          }
        }

        .link-text {
          color: #38bdf8;
          text-decoration: underline;
        }
      }
    }
  `]
})
export class PrivacyComponent {}

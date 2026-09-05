import { Component } from '@angular/core';
import { CommonModule } from '@angular/common';

@Component({
  selector: 'app-terms',
  standalone: true,
  imports: [CommonModule],
  template: `
    <div class="container static-page">
      <div class="page-card bg-glass">
        <div class="page-header">
          <h1><i class="fa-solid fa-file-contract text-primary"></i> Điều Khoản Sử Dụng</h1>
          <p class="update-date">Cập nhật lần cuối: Ngày 01 tháng 01 năm 2026</p>
        </div>

        <div class="legal-content">
          <section class="section-block">
            <h2>1. Chấp Nhận Điều Khoản</h2>
            <p>
              Chào mừng bạn đến với TruyenKomi. Khi truy cập và sử dụng dịch vụ của chúng tôi, bạn đồng ý tuân thủ và chịu sự ràng buộc bởi các điều khoản và điều kiện sử dụng dưới đây. Nếu bạn không đồng ý với bất kỳ phần nào của các điều khoản này, vui lòng không sử dụng dịch vụ của chúng tôi.
            </p>
          </section>

          <section class="section-block">
            <h2>2. Quyền Bản Quyền & Nội Dung</h2>
            <p>
              Tất cả thông tin, truyện tranh, hình ảnh và tài nguyên hiển thị trên TruyenKomi được sưu tầm và tổng hợp từ các nguồn công khai trên Internet hoặc do cộng đồng đóng góp. Chúng tôi không sở hữu bản quyền trực tiếp đối với các tác phẩm này ngoại trừ giao diện và mã nguồn của nền tảng TruyenKomi.
            </p>
            <p>
              Nếu bạn là chủ sở hữu bản quyền hợp pháp của bất kỳ nội dung nào và không muốn nó xuất hiện trên ứng dụng, vui lòng liên hệ với chúng tôi qua trang <a href="/contact" class="link-text">Liên Hệ (DMCA)</a> kèm bằng chứng sở hữu. Chúng tôi sẽ tiến hành gỡ bỏ nội dung trong vòng 48 giờ làm việc.
            </p>
          </section>

          <section class="section-block">
            <h2>3. Quy Định Về Tài Khoản Người Dùng</h2>
            <ul>
              <li>Người dùng phải cung cấp thông tin chính xác khi đăng ký tài khoản (Tên đăng nhập, Email).</li>
              <li>Bạn có trách nhiệm bảo mật mật khẩu và chịu trách nhiệm cho mọi hoạt động diễn ra dưới tài khoản của mình.</li>
              <li>Nghiêm cấm việc tạo tài khoản giả mạo, spam, hack hoặc phá hoại hệ thống của TruyenKomi.</li>
            </ul>
          </section>

          <section class="section-block">
            <h2>4. Quy Tắc Ứng Xử & Bình Luận</h2>
            <p>Độc giả khi tham gia bình luận và tương tác trên nền tảng cần tuân thủ các quy định sau:</p>
            <ul>
              <li>Không sử dụng ngôn từ kích động thù hằn, xúc phạm tôn giáo, chủng tộc, cá nhân hoặc tổ chức khác.</li>
              <li>Không chia sẻ các nội dung đồi trụy, vi phạm pháp luật hoặc liên kết có chứa mã độc.</li>
              <li>Không spoiler nội dung truyện mà không có cảnh báo trước cho các độc giả khác.</li>
            </ul>
          </section>

          <section class="section-block">
            <h2>5. Giới Hạn Trách Nhiệm</h2>
            <p>
              TruyenKomi cung cấp dịch vụ "như hiện có" và không đưa ra bất kỳ bảo đảm nào về tính liên tục không bị gián đoạn của ứng dụng. Chúng tôi không chịu trách nhiệm cho bất kỳ thiệt hại trực tiếp hoặc gián tiếp nào phát sinh từ việc sử dụng dịch vụ của bạn.
            </p>
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
      .update-date { color: #818cf8; font-size: 0.88rem; margin: 0; }
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
export class TermsComponent {}

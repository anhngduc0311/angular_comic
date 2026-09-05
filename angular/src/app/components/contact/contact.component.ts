import { Component } from '@angular/core';
import { CommonModule } from '@angular/common';
import { FormsModule } from '@angular/forms';
import { RouterLink } from '@angular/router';

@Component({
  selector: 'app-contact',
  standalone: true,
  imports: [CommonModule, FormsModule, RouterLink],
  template: `
    <div class="container contact-page">
      <!-- Header -->
      <div class="page-header text-center">
        <h1><i class="fa-solid fa-headset text-gradient"></i> Liên Hệ & Hỗ Trợ</h1>
        <p>Bạn có thắc mắc, yêu cầu bản quyền hoặc đề xuất hợp tác quảng cáo? Hãy gửi tin nhắn cho TruyenKomi!</p>
      </div>

      <div class="contact-grid">
        <!-- Contact Information Side -->
        <div class="info-side bg-glass">
          <h3>Thông Tin Liên Hệ Direct</h3>
          <p class="side-desc">Chúng tôi sẵn sàng lắng nghe mọi ý kiến đóng góp từ độc giả và đối tác 24/7.</p>

          <div class="info-list">
            <div class="info-item">
              <div class="info-icon"><i class="fa-solid fa-envelope"></i></div>
              <div class="info-text">
                <span class="label">Email Hỗ Trợ:</span>
                <span class="value">support&#64;truyenkomi.com</span>
              </div>
            </div>

            <div class="info-item">
              <div class="info-icon icon-discord"><i class="fa-brands fa-discord"></i></div>
              <div class="info-text">
                <span class="label">Discord Community:</span>
                <span class="value">discord.gg/truyenkomi</span>
              </div>
            </div>

            <div class="info-item">
              <div class="info-icon icon-telegram"><i class="fa-brands fa-telegram"></i></div>
              <div class="info-text">
                <span class="label">Telegram Admin:</span>
                <span class="value">&#64;truyenkomi_official</span>
              </div>
            </div>

            <div class="info-item">
              <div class="info-icon icon-time"><i class="fa-solid fa-clock"></i></div>
              <div class="info-text">
                <span class="label">Thời Gian Phản Hồi:</span>
                <span class="value">Trong vòng 12 - 24 giờ làm việc</span>
              </div>
            </div>
          </div>

          <div class="quick-faq-box">
            <h4><i class="fa-solid fa-circle-question text-warning"></i> Cần Câu Trả Lời Nhanh?</h4>
            <p>Hãy truy cập mục Câu hỏi thường gặp để tìm giải đáp cho các vấn đề phổ biến nhất.</p>
            <a routerLink="/faq" class="btn btn-secondary btn-sm"><i class="fa-solid fa-arrow-right"></i> Xem Trang FAQ</a>
          </div>
        </div>

        <!-- Contact Form Side -->
        <div class="form-side bg-glass">
          <h3>Gửi Tin Nhắn Phản Hồi</h3>

          <div class="alert alert-success" *ngIf="submittedSuccess">
            <i class="fa-solid fa-circle-check"></i> Cảm ơn bạn! Tin nhắn của bạn đã được gửi thành công. Đội ngũ TruyenKomi sẽ liên hệ lại sớm nhất.
          </div>

          <form (ngSubmit)="onSubmit()" *ngIf="!submittedSuccess">
            <div class="form-row">
              <div class="form-group">
                <label for="name">Họ và tên <span class="text-danger">*</span></label>
                <input 
                  type="text" 
                  id="name" 
                  [(ngModel)]="formData.name" 
                  name="name" 
                  required 
                  class="form-control" 
                  placeholder="Nhập họ tên của bạn..." 
                />
              </div>

              <div class="form-group">
                <label for="email">Địa chỉ Email <span class="text-danger">*</span></label>
                <input 
                  type="email" 
                  id="email" 
                  [(ngModel)]="formData.email" 
                  name="email" 
                  required 
                  class="form-control" 
                  placeholder="name&#64;example.com..." 
                />
              </div>
            </div>

            <div class="form-group">
              <label for="subject">Chủ đề liên hệ <span class="text-danger">*</span></label>
              <select id="subject" [(ngModel)]="formData.subject" name="subject" class="form-control">
                <option value="GENERAL">Hỗ trợ chung / Góp ý ứng dụng</option>
                <option value="COPYRIGHT">Khiếu nại Bản quyền (DMCA)</option>
                <option value="ADVERTISING">Hợp tác Quảng cáo / Partnership</option>
                <option value="BUG">Báo lỗi Kỹ thuật / Tài khoản</option>
                <option value="OTHER">Vấn đề khác</option>
              </select>
            </div>

            <div class="form-group">
              <label for="message">Nội dung tin nhắn <span class="text-danger">*</span></label>
              <textarea 
                id="message" 
                [(ngModel)]="formData.message" 
                name="message" 
                rows="5" 
                required 
                class="form-control" 
                placeholder="Vui lòng mô tả chi tiết nội dung cần hỗ trợ..."
              ></textarea>
            </div>

            <button type="submit" class="btn btn-primary btn-block" [disabled]="isSubmitting">
              <i class="fa-solid fa-paper-plane"></i> {{ isSubmitting ? 'Đang gửi tin nhắn...' : 'Gửi Tin Nhắn Ngay' }}
            </button>
          </form>
        </div>
      </div>
    </div>
  `,
  styles: [`
    .contact-page {
      padding-top: 2.5rem;
      padding-bottom: 4rem;
    }

    .bg-glass {
      background: rgba(26, 26, 46, 0.85);
      backdrop-filter: blur(12px);
      border: 1px solid rgba(255, 255, 255, 0.08);
      border-radius: 20px;
      box-shadow: 0 8px 32px 0 rgba(0, 0, 0, 0.37);
    }

    .page-header {
      margin-bottom: 3rem;
      h1 { font-size: 2.2rem; font-weight: 700; color: #fff; margin-bottom: 0.5rem; }
      p { color: #94a3b8; font-size: 1rem; max-width: 600px; margin: 0 auto; }
    }

    .contact-grid {
      display: grid;
      grid-template-columns: 1fr 1.4fr;
      gap: 2rem;

      @media (max-width: 900px) {
        grid-template-columns: 1fr;
      }
    }

    .info-side, .form-side {
      padding: 2.5rem;
      h3 { font-size: 1.35rem; color: #fff; font-weight: 700; margin-bottom: 0.75rem; }
    }

    .info-side {
      .side-desc { color: #a0aec0; font-size: 0.95rem; margin-bottom: 2rem; line-height: 1.5; }

      .info-list {
        display: flex;
        flex-direction: column;
        gap: 1.25rem;
        margin-bottom: 2.5rem;

        .info-item {
          display: flex;
          align-items: center;
          gap: 1rem;

          .info-icon {
            width: 44px;
            height: 44px;
            border-radius: 12px;
            background: rgba(99, 102, 241, 0.15);
            color: #818cf8;
            display: flex;
            align-items: center;
            justify-content: center;
            font-size: 1.2rem;

            &.icon-discord { background: rgba(88, 101, 242, 0.15); color: #5865F2; }
            &.icon-telegram { background: rgba(36, 161, 222, 0.15); color: #24A1DE; }
            &.icon-time { background: rgba(16, 185, 129, 0.15); color: #34d399; }
          }

          .info-text {
            display: flex;
            flex-direction: column;
            .label { font-size: 0.8rem; color: #718096; }
            .value { font-size: 0.95rem; color: #f1f5f9; font-weight: 600; }
          }
        }
      }

      .quick-faq-box {
        padding: 1.25rem;
        background: rgba(15, 23, 42, 0.6);
        border: 1px solid rgba(255, 255, 255, 0.05);
        border-radius: 14px;

        h4 { font-size: 1rem; color: #fff; margin-bottom: 0.4rem; display: flex; align-items: center; gap: 0.5rem; }
        p { font-size: 0.88rem; color: #94a3b8; margin-bottom: 1rem; }
      }
    }

    .form-side {
      .alert {
        padding: 1.25rem;
        border-radius: 12px;
        background: rgba(16, 185, 129, 0.15);
        border: 1px solid rgba(16, 185, 129, 0.4);
        color: #34d399;
        margin-bottom: 1.5rem;
        font-weight: 500;
      }

      .form-row {
        display: grid;
        grid-template-columns: 1fr 1fr;
        gap: 1rem;

        @media (max-width: 576px) {
          grid-template-columns: 1fr;
        }
      }

      .form-group {
        margin-bottom: 1.5rem;
        label { display: block; font-size: 0.9rem; color: #cbd5e1; font-weight: 500; margin-bottom: 0.5rem; }
        .form-control {
          width: 100%;
          padding: 0.75rem 1rem;
          background: rgba(15, 23, 42, 0.8);
          border: 1px solid rgba(255, 255, 255, 0.12);
          border-radius: 10px;
          color: #fff;
          font-size: 0.95rem;

          &:focus { outline: none; border-color: #6366f1; box-shadow: 0 0 0 3px rgba(99, 102, 241, 0.2); }
          option { background: #1e293b; color: #fff; }
        }
      }

      .btn-block {
        width: 100%;
        padding: 0.85rem;
        font-size: 1rem;
        font-weight: 600;
      }
    }
  `]
})
export class ContactComponent {
  formData = {
    name: '',
    email: '',
    subject: 'GENERAL',
    message: ''
  };

  isSubmitting = false;
  submittedSuccess = false;

  onSubmit(): void {
    if (!this.formData.name || !this.formData.email || !this.formData.message) return;

    this.isSubmitting = true;
    setTimeout(() => {
      this.isSubmitting = false;
      this.submittedSuccess = true;
    }, 1000);
  }
}

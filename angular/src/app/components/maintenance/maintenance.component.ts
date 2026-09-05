import { Component, OnInit, OnDestroy } from '@angular/core';
import { CommonModule } from '@angular/common';
import { RouterLink } from '@angular/router';
import { FormsModule } from '@angular/forms';

@Component({
  selector: 'app-maintenance',
  standalone: true,
  imports: [CommonModule, RouterLink, FormsModule],
  template: `
    <div class="container maintenance-page text-center">
      <div class="card-maint bg-glass">
        <div class="maint-icon">
          <i class="fa-solid fa-gears icon-spin"></i>
        </div>

        <div class="maint-badge">
          <i class="fa-solid fa-screwdriver-wrench"></i> BẢO TRÌ NÂNG CẤP HỆ THỐNG
        </div>

        <h1>Hệ Thống Đang Được Nâng Cấp!</h1>
        <p class="desc-text">
          TruyenKomi đang tiến hành nâng cấp máy chủ và tối ưu hóa hệ thống để mang lại trải nghiệm đọc truyện tuyệt vời hơn. 
          Chúng tôi sẽ quay trở lại ngay lập tức!
        </p>

        <!-- Countdown Timer -->
        <div class="countdown-grid">
          <div class="time-box">
            <span class="num">{{ hours }}</span>
            <span class="unit">Giờ</span>
          </div>
          <div class="colon">:</div>
          <div class="time-box">
            <span class="num">{{ minutes }}</span>
            <span class="unit">Phút</span>
          </div>
          <div class="colon">:</div>
          <div class="time-box">
            <span class="num">{{ seconds }}</span>
            <span class="unit">Giây</span>
          </div>
        </div>

        <!-- Progress Bar -->
        <div class="progress-container">
          <div class="progress-info">
            <span>Tiến độ hoàn tất:</span>
            <strong>85%</strong>
          </div>
          <div class="progress-bar">
            <div class="progress-fill" style="width: 85%;"></div>
          </div>
        </div>

        <!-- Notification Form -->
        <div class="notify-form-box" *ngIf="!subscribed">
          <p class="notify-hint">Nhập email của bạn để nhận thông báo ngay khi hệ thống mở lại:</p>
          <form (ngSubmit)="subscribe()" class="notify-form">
            <input 
              type="email" 
              [(ngModel)]="emailInput" 
              name="email" 
              required 
              placeholder="Nhập địa chỉ email..." 
            />
            <button type="submit" class="btn btn-primary"><i class="fa-solid fa-bell"></i> Thông Báo Cho Tôi</button>
          </form>
        </div>

        <div class="alert alert-success" *ngIf="subscribed">
          <i class="fa-solid fa-circle-check"></i> Đã đăng ký thành công! Chúng tôi sẽ gửi email thông báo cho bạn ngay khi bảo trì hoàn tất.
        </div>

        <div class="actions">
          <a routerLink="/" class="btn btn-secondary btn-sm"><i class="fa-solid fa-arrows-rotate"></i> Thử Tải Lại Trang</a>
        </div>
      </div>
    </div>
  `,
  styles: [`
    .maintenance-page {
      padding-top: 3.5rem;
      padding-bottom: 5rem;
      display: flex;
      justify-content: center;
    }

    .bg-glass {
      background: rgba(26, 26, 46, 0.85);
      backdrop-filter: blur(12px);
      border: 1px solid rgba(255, 255, 255, 0.08);
      border-radius: 24px;
      box-shadow: 0 12px 40px 0 rgba(0, 0, 0, 0.45);
    }

    .card-maint {
      padding: 3.5rem 2.5rem;
      max-width: 680px;
      width: 100%;

      .maint-icon {
        width: 80px;
        height: 80px;
        margin: 0 auto 1.5rem;
        background: rgba(99, 102, 241, 0.15);
        border: 1px solid rgba(99, 102, 241, 0.3);
        border-radius: 50%;
        display: flex;
        align-items: center;
        justify-content: center;
        font-size: 2.2rem;
        color: #818cf8;

        .icon-spin {
          animation: spin 8s linear infinite;
        }
      }

      @keyframes spin {
        100% { transform: rotate(360deg); }
      }

      .maint-badge {
        display: inline-flex;
        align-items: center;
        gap: 0.5rem;
        padding: 0.35rem 1rem;
        background: rgba(6, 182, 212, 0.15);
        border: 1px solid rgba(6, 182, 212, 0.3);
        border-radius: 20px;
        color: #22d3ee;
        font-size: 0.82rem;
        font-weight: 700;
        letter-spacing: 0.5px;
        margin-bottom: 1rem;
      }

      h1 {
        font-size: 2rem;
        font-weight: 800;
        color: #fff;
        margin-bottom: 0.75rem;
      }

      .desc-text {
        color: #94a3b8;
        font-size: 1rem;
        line-height: 1.6;
        margin-bottom: 2rem;
      }

      .countdown-grid {
        display: flex;
        justify-content: center;
        align-items: center;
        gap: 1rem;
        margin-bottom: 2rem;

        .time-box {
          padding: 1rem 1.25rem;
          background: rgba(15, 23, 42, 0.7);
          border: 1px solid rgba(255, 255, 255, 0.1);
          border-radius: 14px;
          min-width: 80px;
          display: flex;
          flex-direction: column;

          .num { font-size: 2rem; font-weight: 800; color: #38bdf8; }
          .unit { font-size: 0.8rem; color: #718096; text-transform: uppercase; }
        }

        .colon {
          font-size: 1.8rem;
          font-weight: 800;
          color: #6366f1;
        }
      }

      .progress-container {
        max-width: 480px;
        margin: 0 auto 2rem;

        .progress-info {
          display: flex;
          justify-content: space-between;
          font-size: 0.88rem;
          color: #cbd5e1;
          margin-bottom: 0.4rem;
        }

        .progress-bar {
          height: 8px;
          background: rgba(15, 23, 42, 0.8);
          border-radius: 4px;
          overflow: hidden;

          .progress-fill {
            height: 100%;
            background: linear-gradient(90deg, #6366f1 0%, #38bdf8 100%);
            border-radius: 4px;
          }
        }
      }

      .notify-form-box {
        max-width: 480px;
        margin: 0 auto 1.5rem;

        .notify-hint { font-size: 0.88rem; color: #a0aec0; margin-bottom: 0.75rem; }

        .notify-form {
          display: flex;
          gap: 0.5rem;

          input {
            flex: 1;
            padding: 0.7rem 1rem;
            background: rgba(15, 23, 42, 0.8);
            border: 1px solid rgba(255, 255, 255, 0.12);
            border-radius: 10px;
            color: #fff;
            font-size: 0.92rem;
            &:focus { outline: none; border-color: #6366f1; }
          }
        }
      }

      .alert {
        padding: 1rem;
        border-radius: 10px;
        background: rgba(16, 185, 129, 0.15);
        border: 1px solid rgba(16, 185, 129, 0.4);
        color: #34d399;
        font-size: 0.9rem;
        margin-bottom: 1.5rem;
      }
    }
  `]
})
export class MaintenanceComponent implements OnInit, OnDestroy {
  hours: string = '01';
  minutes: string = '45';
  seconds: string = '30';
  private timer: any;
  private totalSeconds = 6330;

  emailInput: string = '';
  subscribed: boolean = false;

  ngOnInit(): void {
    this.timer = setInterval(() => {
      if (this.totalSeconds > 0) {
        this.totalSeconds--;
        const h = Math.floor(this.totalSeconds / 3600);
        const m = Math.floor((this.totalSeconds % 3600) / 60);
        const s = this.totalSeconds % 60;
        this.hours = h < 10 ? '0' + h : '' + h;
        this.minutes = m < 10 ? '0' + m : '' + m;
        this.seconds = s < 10 ? '0' + s : '' + s;
      }
    }, 1000);
  }

  ngOnDestroy(): void {
    if (this.timer) clearInterval(this.timer);
  }

  subscribe(): void {
    if (this.emailInput) {
      this.subscribed = true;
    }
  }
}

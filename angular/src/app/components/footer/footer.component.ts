import { Component } from '@angular/core';
import { CommonModule } from '@angular/common';
import { RouterModule } from '@angular/router';

@Component({
  selector: 'app-footer',
  standalone: true,
  imports: [CommonModule, RouterModule],
  template: `
    <footer class="footer">
      <div class="container footer-content">
        <div class="brand-col">
          <a routerLink="/" class="logo">
            <i class="fa-solid fa-bolt logo-icon"></i>
            <span class="logo-text">Manga<span class="text-gradient">Flux</span></span>
          </a>
          <p class="brand-desc">
            Nền tảng đọc truyện tranh online miễn phí hàng đầu với giao diện hiện đại, tốc độ tải nhanh và trải nghiệm tối ưu nhất trên mọi thiết bị.
          </p>
          <div class="brand-badges">
            <span class="badge badge-primary"><i class="fa-solid fa-bolt"></i> Tải siêu nhanh</span>
            <span class="badge badge-success"><i class="fa-solid fa-shield-halved"></i> Không quảng cáo độc hại</span>
          </div>
        </div>

        <div class="footer-links">
          <h4><i class="fa-solid fa-compass text-primary"></i> Điều Hướng</h4>
          <a routerLink="/"><i class="fa-solid fa-angle-right"></i> Trang chủ</a>
          <a routerLink="/comics"><i class="fa-solid fa-angle-right"></i> Danh sách truyện</a>
          <a routerLink="/categories"><i class="fa-solid fa-angle-right"></i> Thể loại truyện</a>
          <a routerLink="/history"><i class="fa-solid fa-angle-right"></i> Lịch sử đọc</a>
        </div>

        <div class="footer-links">
          <h4><i class="fa-solid fa-shield-cat text-accent"></i> Thông Tin</h4>
          <a href="javascript:void(0)"><i class="fa-solid fa-angle-right"></i> Điều khoản dịch vụ</a>
          <a href="javascript:void(0)"><i class="fa-solid fa-angle-right"></i> Chính sách bảo mật</a>
          <a href="javascript:void(0)"><i class="fa-solid fa-angle-right"></i> Khiếu nại bản quyền</a>
          <a href="javascript:void(0)"><i class="fa-solid fa-angle-right"></i> Liên hệ quảng cáo</a>
        </div>

        <div class="socials-col">
          <h4><i class="fa-solid fa-share-nodes text-primary"></i> Kết Nối</h4>
          <p class="social-desc">Tham gia cộng đồng để cập nhật tin tức truyện mới nhất!</p>
          <div class="social-buttons">
            <a href="https://facebook.com" target="_blank" class="social-btn facebook" title="Facebook">
              <i class="fa-brands fa-facebook-f"></i>
            </a>
            <a href="https://discord.com" target="_blank" class="social-btn discord" title="Discord">
              <i class="fa-brands fa-discord"></i>
            </a>
            <a href="https://t.me" target="_blank" class="social-btn telegram" title="Telegram">
              <i class="fa-brands fa-telegram"></i>
            </a>
            <a href="https://youtube.com" target="_blank" class="social-btn youtube" title="Youtube">
              <i class="fa-brands fa-youtube"></i>
            </a>
          </div>
        </div>
      </div>

      <div class="footer-bottom">
        <div class="container footer-bottom-content">
          <p class="copyright">© 2026 <strong>MangaFlux</strong>. All rights reserved.</p>
          <p class="disclaimer">Nội dung được chia sẻ từ cộng đồng. MangaFlux không lưu trữ file trên máy chủ.</p>
        </div>
      </div>
    </footer>
  `,
  styles: [`
    .footer {
      background: linear-gradient(180deg, #0B0E14 0%, #06080C 100%);
      border-top: 1px solid var(--border-color);
      padding-top: 3.5rem;
      margin-top: 4rem;
      position: relative;
    }

    .footer-content {
      display: grid;
      grid-template-columns: 2fr 1fr 1fr 1.3fr;
      gap: 2.5rem;
      padding-bottom: 3rem;

      @media (max-width: 992px) {
        grid-template-columns: 1fr 1fr;
        gap: 2rem;
      }

      @media (max-width: 576px) {
        grid-template-columns: 1fr;
        gap: 2rem;
      }
    }

    .brand-col {
      display: flex;
      flex-direction: column;
      gap: 1rem;

      .logo {
        display: flex;
        align-items: center;
        gap: 0.6rem;
        text-decoration: none;

        .logo-icon {
          font-size: 1.5rem;
          color: var(--primary);
        }

        .logo-text {
          font-size: 1.5rem;
          font-weight: 800;
          color: var(--text-main);
          letter-spacing: -0.5px;
        }
      }

      .brand-desc {
        color: var(--text-muted);
        font-size: 0.88rem;
        line-height: 1.6;
        max-width: 420px;
      }

      .brand-badges {
        display: flex;
        flex-wrap: wrap;
        gap: 0.6rem;
        margin-top: 0.3rem;
      }
    }

    .footer-links {
      display: flex;
      flex-direction: column;
      gap: 0.75rem;

      h4 {
        color: var(--text-main);
        font-size: 1rem;
        font-weight: 700;
        margin-bottom: 0.5rem;
        display: flex;
        align-items: center;
        gap: 0.5rem;
      }

      a {
        color: var(--text-muted);
        text-decoration: none;
        font-size: 0.88rem;
        white-space: nowrap;
        display: flex;
        align-items: center;
        gap: 0.4rem;
        transition: var(--transition);

        i {
          font-size: 0.75rem;
          opacity: 0.5;
          transition: var(--transition);
        }

        &:hover {
          color: var(--primary);
          transform: translateX(4px);

          i {
            opacity: 1;
            color: var(--primary);
          }
        }
      }
    }

    .socials-col {
      display: flex;
      flex-direction: column;
      gap: 0.75rem;

      h4 {
        color: var(--text-main);
        font-size: 1rem;
        font-weight: 700;
        margin-bottom: 0.2rem;
        display: flex;
        align-items: center;
        gap: 0.5rem;
      }

      .social-desc {
        color: var(--text-muted);
        font-size: 0.85rem;
        margin-bottom: 0.5rem;
      }

      .social-buttons {
        display: flex;
        gap: 0.75rem;
        flex-wrap: wrap;

        .social-btn {
          width: 40px;
          height: 40px;
          border-radius: var(--radius-md);
          background: rgba(255, 255, 255, 0.05);
          border: 1px solid var(--border-color);
          display: flex;
          align-items: center;
          justify-content: center;
          color: var(--text-main);
          font-size: 1.1rem;
          text-decoration: none;
          transition: var(--transition);

          &.facebook:hover { background: #1877F2; color: #FFF; border-color: #1877F2; transform: translateY(-3px); }
          &.discord:hover { background: #5865F2; color: #FFF; border-color: #5865F2; transform: translateY(-3px); }
          &.telegram:hover { background: #24A1DE; color: #FFF; border-color: #24A1DE; transform: translateY(-3px); }
          &.youtube:hover { background: #FF0000; color: #FFF; border-color: #FF0000; transform: translateY(-3px); }
        }
      }
    }

    .footer-bottom {
      border-top: 1px solid rgba(255, 255, 255, 0.06);
      padding: 1.25rem 0;
      background: #040508;

      .footer-bottom-content {
        display: flex;
        justify-content: space-between;
        align-items: center;
        gap: 1rem;
        flex-wrap: wrap;

        @media (max-width: 768px) {
          flex-direction: column;
          text-align: center;
        }
      }

      .copyright {
        color: var(--text-muted);
        font-size: 0.82rem;

        strong {
          color: var(--text-main);
        }
      }

      .disclaimer {
        color: var(--text-dark);
        font-size: 0.78rem;
      }
    }
  `]
})
export class FooterComponent {}

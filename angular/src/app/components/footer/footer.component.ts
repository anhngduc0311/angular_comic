import { Component } from '@angular/core';
import { CommonModule } from '@angular/common';
import { RouterModule } from '@angular/router';

@Component({
  selector: 'app-footer',
  standalone: true,
  imports: [CommonModule, RouterModule],
  template: `
    <footer class="nextgen-footer">
      <div class="div_middle footer-container">
        <!-- Top Row: Brand & Quick Tag Links -->
        <div class="footer-grid">
          <!-- Column 1: Brand & Disclaimer -->
          <div class="footer-col-brand">
            <div class="footer-logo">
              <a routerLink="/" title="TruyenKomi - Nền tảng đọc truyện tranh Next-Gen">
                <img src="assets/logo.svg" alt="TruyenKomi" class="footer-logo-svg" />
              </a>
            </div>
            <p class="footer-about">
              <strong>TruyenKomi</strong> là nền tảng đọc truyện tranh Manga, Manhwa, Manhua sắc nét chuẩn HD. Toàn bộ tài nguyên được đóng góp bởi cộng đồng và sưu tầm từ internet.
            </p>
            <div class="footer-social-links">
              <a href="https://t.me/truyenkomi" target="_blank" rel="nofollow" class="social-icon-btn tg" title="Telegram">
                <i class="fa fa-paper-plane"></i>
              </a>
              <a href="https://discord.com" target="_blank" rel="nofollow" class="social-icon-btn dc" title="Discord">
                <i class="fa fa-gamepad"></i>
              </a>
              <a href="https://facebook.com" target="_blank" rel="nofollow" class="social-icon-btn fb" title="Facebook">
                <i class="fa fa-facebook"></i>
              </a>
            </div>
          </div>

          <!-- Column 2: Navigation Links -->
          <div class="footer-col-nav">
            <h4 class="col-title">Khám Phá</h4>
            <ul class="col-links">
              <li><a routerLink="/">Trang Chủ</a></li>
              <li><a [routerLink]="['/comics']" [queryParams]="{ sort: 'hot' }">Truyện Hot Đề Cử</a></li>
              <li><a [routerLink]="['/comics']" [queryParams]="{ sort: 'new' }">Truyện Mới Cập Nhật</a></li>
              <li><a [routerLink]="['/comics']" [queryParams]="{ sort: 'full' }">Truyện Đã Hoàn Thành</a></li>
              <li><a routerLink="/categories">Kho Thể Loại</a></li>
              <li><a routerLink="/search">Bộ Lọc Tìm Kiếm</a></li>
            </ul>
          </div>

          <!-- Column 3: Top Categories -->
          <div class="footer-col-tags">
            <h4 class="col-title">Thể Loại Nổi Bật</h4>
            <div class="tags-cloud">
              <a [routerLink]="['/comics']" [queryParams]="{ country: 'Hàn Quốc' }" class="tag-chip">Manhwa</a>
              <a [routerLink]="['/comics']" [queryParams]="{ country: 'Nhật Bản' }" class="tag-chip">Manga</a>
              <a [routerLink]="['/comics']" [queryParams]="{ country: 'Trung Quốc' }" class="tag-chip">Manhua</a>
              <a [routerLink]="['/comics']" [queryParams]="{ category: 'chuyen-sinh' }" class="tag-chip">Chuyển Sinh</a>
              <a [routerLink]="['/comics']" [queryParams]="{ category: 'action' }" class="tag-chip">Hành Động</a>
              <a [routerLink]="['/comics']" [queryParams]="{ category: 'ngon-tinh' }" class="tag-chip">Ngôn Tình</a>
              <a [routerLink]="['/comics']" [queryParams]="{ category: 'romance' }" class="tag-chip">Romance</a>
              <a [routerLink]="['/comics']" [queryParams]="{ category: 'fantasy' }" class="tag-chip">Fantasy</a>
            </div>
          </div>
        </div>

        <!-- Bottom Copyright Row -->
        <div class="footer-bottom-row">
          <p class="copyright-text">
            © 2026 <strong>TruyenKomi</strong>. All rights reserved. Trải nghiệm đọc truyện đỉnh cao.
          </p>
          <div class="policy-links">
            <a routerLink="/privacy">Chính Sách Bảo Mật</a>
            <span class="dot">•</span>
            <a routerLink="/terms">Điều Khoản Sử Dụng</a>
            <span class="dot">•</span>
            <a routerLink="/contact">Liên Hệ DMCA</a>
          </div>
        </div>
      </div>
    </footer>
  `,
  styles: [`
    .nextgen-footer {
      background: var(--bg-surface);
      border-top: 1px solid var(--border-color);
      padding: 48px 0 24px;
      margin-top: 50px;
      color: var(--text-main);

      .footer-grid {
        display: grid;
        grid-template-columns: 1.5fr 1fr 1.2fr;
        gap: 40px;
        padding-bottom: 36px;
        border-bottom: 1px solid var(--border-color);

        @media (max-width: 992px) {
          grid-template-columns: 1fr 1fr;
          gap: 30px;
        }

        @media (max-width: 576px) {
          grid-template-columns: 1fr;
          gap: 24px;
        }
      }

      .footer-col-brand {
        .footer-logo {
          margin-bottom: 14px;
          .footer-logo-svg {
            height: 42px;
            width: auto;
          }
        }

        .footer-about {
          font-size: 13.5px;
          line-height: 1.65;
          color: var(--text-muted);
          margin-bottom: 18px;
        }

        .footer-social-links {
          display: flex;
          gap: 10px;

          .social-icon-btn {
            width: 36px;
            height: 36px;
            border-radius: 50%;
            background: var(--bg-elevated);
            color: var(--text-main);
            display: flex;
            align-items: center;
            justify-content: center;
            font-size: 14px;
            transition: var(--transition-fast);

            &.tg:hover { background: #0ea5e9; color: #fff; }
            &.dc:hover { background: #8b5cf6; color: #fff; }
            &.fb:hover { background: #3b5998; color: #fff; }
          }
        }
      }

      .col-title {
        font-size: 15px;
        font-weight: 800;
        margin-bottom: 16px;
        color: var(--text-main);
      }

      .footer-col-nav {
        .col-links {
          list-style: none;
          padding: 0;
          margin: 0;
          display: flex;
          flex-direction: column;
          gap: 9px;

          li a {
            font-size: 13.5px;
            color: var(--text-muted);
            transition: var(--transition-fast);

            &:hover {
              color: var(--primary-orange);
              transform: translateX(4px);
              display: inline-block;
            }
          }
        }
      }

      .footer-col-tags {
        .tags-cloud {
          display: flex;
          flex-wrap: wrap;
          gap: 8px;

          .tag-chip {
            background: var(--bg-elevated);
            border: 1px solid var(--border-color);
            color: var(--text-secondary);
            padding: 5px 12px;
            border-radius: var(--radius-pill);
            font-size: 12.5px;
            font-weight: 600;
            transition: var(--transition-fast);

            &:hover {
              background: var(--primary-orange);
              color: #ffffff;
              border-color: var(--primary-orange);
              transform: translateY(-2px);
            }
          }
        }
      }

      .footer-bottom-row {
        padding-top: 24px;
        display: flex;
        justify-content: space-between;
        align-items: center;
        flex-wrap: wrap;
        gap: 12px;
        font-size: 12.5px;
        color: var(--text-muted);

        .policy-links {
          display: flex;
          align-items: center;
          gap: 8px;

          a:hover { color: var(--primary-orange); }
          .dot { opacity: 0.5; }
        }
      }
    }
  `]
})
export class FooterComponent {}

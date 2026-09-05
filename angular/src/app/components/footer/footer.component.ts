import { Component } from '@angular/core';
import { CommonModule } from '@angular/common';
import { RouterModule } from '@angular/router';

@Component({
  selector: 'app-footer',
  standalone: true,
  imports: [CommonModule, RouterModule],
  template: `
    <footer class="truyengg-footer">
      <div class="div_middle footer-body">
        <!-- Left Column: Logo & Disclaimer -->
        <div class="left footer-col-left">
          <div class="footer-logo">
            <a routerLink="/" title="TruyenKomi - Truyện tranh Online">
              <img src="assets/logo.svg" alt="TruyenKomi" class="footer-logo-svg" />
            </a>
          </div>
          <p class="footer-disclaimer">
            Trang web này cung cấp truyện tranh chỉ với mục đích giải trí và không chịu trách nhiệm về nội dung quảng cáo hoặc liên kết từ bên thứ ba. Mọi thông tin và hình ảnh đều được thu thập từ internet. Nếu bạn có bất kỳ vấn đề nào liên quan đến nội dung hiển thị, vui lòng liên hệ với chúng tôi để được hỗ trợ.
          </p>
        </div>

        <!-- Right Column: Navigation Tag Links -->
        <div class="right footer-col-right">
          <ul class="footer-tags-grid">
            <li><a routerLink="/">Truyện Tranh</a></li>
            <li><a routerLink="/comics">Truyện Tranh Online</a></li>
            <li><a routerLink="/comics" [queryParams]="{ sort: 'new' }">Truyện Tranh Mới</a></li>
            <li><a routerLink="/comics" [queryParams]="{ sort: 'hot' }">Truyện Tranh Hay</a></li>
            <li><a routerLink="/comics">Đọc Truyện Tranh</a></li>
            <li><a routerLink="/">TruyenKomi</a></li>
            <li><a routerLink="/comics" [queryParams]="{ category: 'manhwa' }">Manhwa</a></li>
            <li><a routerLink="/comics" [queryParams]="{ category: 'manhua' }">Manhua</a></li>
            <li><a routerLink="/comics" [queryParams]="{ category: 'manga' }">Manga</a></li>
            <li><a routerLink="/comics" [queryParams]="{ category: 'ngon-tinh' }">Truyện Ngôn Tình</a></li>
            <li><a routerLink="/comics">nettruyen</a></li>
            <li><a routerLink="/comics">toptruyen</a></li>
            <li><a routerLink="/comics">blogtruyen</a></li>
            <li><a routerLink="/comics">vcomycs</a></li>
            <li><a routerLink="/comics">protruyen</a></li>
            <li><a routerLink="/comics">tusachxinh</a></li>
          </ul>
          <p class="privacy-link">
            <a routerLink="/privacy">Chính Sách Bảo Mật</a> - 
            <a routerLink="/terms">Điều Khoản Sử Dụng</a> - 
            <a routerLink="/contact">Liên Hệ</a>
          </p>
        </div>
        <div class="clear"></div>
      </div>
    </footer>
  `,
  styles: [`
    .truyengg-footer {
      background-color: var(--bg-card);
      border-top: 1px solid var(--border-color);
      padding: 30px 0 24px;
      margin-top: 30px;
      color: var(--text-main);

      .footer-body {
        display: flex;
        gap: 30px;

        @media (max-width: 768px) {
          flex-direction: column;
          gap: 20px;
        }

        .footer-col-left {
          flex: 0 0 45%;

          @media (max-width: 768px) {
            flex: 1;
          }

          .footer-logo {
            margin-bottom: 12px;

            a {
              display: inline-flex;
              align-items: center;
            }

            .footer-logo-svg {
              height: 40px;
              width: auto;
              max-width: 200px;
              display: block;
              object-fit: contain;
            }
          }

          .footer-disclaimer {
            font-size: 13px;
            line-height: 1.65;
            color: var(--text-muted);
          }
        }

        .footer-col-right {
          flex: 1;

          .footer-tags-grid {
            display: grid;
            grid-template-columns: repeat(3, 1fr);
            gap: 8px 12px;
            list-style: none;
            padding: 0;
            margin: 0 0 16px;

            @media (max-width: 576px) {
              grid-template-columns: repeat(2, 1fr);
            }

            li a {
              font-size: 13px;
              color: var(--text-muted);
              transition: color 0.2s;

              &:hover {
                color: var(--primary-orange);
              }
            }
          }

          .privacy-link {
            font-size: 13px;
            font-weight: 600;
            color: var(--primary-blue);

            a {
              color: inherit;
              &:hover {
                color: var(--primary-orange);
                text-decoration: underline !important;
              }
            }
          }
        }
      }
    }
  `]
})
export class FooterComponent {}

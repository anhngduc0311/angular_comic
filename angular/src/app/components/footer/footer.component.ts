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
        <div class="brand">
          <h3>Manga<span class="text-gradient">Flux</span></h3>
          <p>Nền tảng đọc truyện tranh online miễn phí hàng đầu với trải nghiệm tối ưu nhất.</p>
        </div>
        <div class="footer-links">
          <h4>Liên kết</h4>
          <a routerLink="/">Trang chủ</a>
          <a routerLink="/comics">Danh sách truyện</a>
          <a routerLink="/categories">Thể loại</a>
        </div>
        <div class="socials">
          <h4>Kết nối</h4>
          <div class="icons">
            <i class="fa-brands fa-facebook"></i>
            <i class="fa-brands fa-discord"></i>
            <i class="fa-brands fa-telegram"></i>
          </div>
        </div>
      </div>
      <div class="copyright">
        <p>© 2026 MangaFlux. All rights reserved.</p>
      </div>
    </footer>
  `,
  styles: [`
    .footer {
      background: #090B10;
      border-top: 1px solid var(--border-color);
      padding: 3rem 0 1.5rem;
      margin-top: 4rem;
    }
    .footer-content {
      display: grid;
      grid-template-columns: 2fr 1fr 1fr;
      gap: 2rem;
      margin-bottom: 2rem;
    }
    .brand p { color: var(--text-muted); font-size: 0.9rem; margin-top: 0.5rem; }
    .footer-links {
      display: flex;
      flex-direction: column;
      gap: 0.5rem;
      h4 { margin-bottom: 0.5rem; }
      a { color: var(--text-muted); text-decoration: none; font-size: 0.9rem; &:hover { color: var(--primary); } }
    }
    .socials .icons { display: flex; gap: 1rem; font-size: 1.4rem; color: var(--text-muted); i { cursor: pointer; &:hover { color: var(--primary); } } }
    .copyright { text-align: center; color: var(--text-dark); font-size: 0.85rem; border-top: 1px solid rgba(255,255,255,0.04); padding-top: 1.5rem; }
  `]
})
export class FooterComponent {}

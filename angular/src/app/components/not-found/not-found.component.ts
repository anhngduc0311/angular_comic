import { Component } from '@angular/core';
import { CommonModule } from '@angular/common';
import { Router, RouterLink } from '@angular/router';
import { FormsModule } from '@angular/forms';

@Component({
  selector: 'app-not-found',
  standalone: true,
  imports: [CommonModule, RouterLink, FormsModule],
  template: `
    <div class="container not-found-page text-center">
      <div class="card-404 bg-glass">
        <div class="badge-404">
          <i class="fa-solid fa-triangle-exclamation text-warning"></i> ERROR 404
        </div>
        <h1 class="code-title">4<span class="glow-text">0</span>4</h1>
        <h2>Không Tìm Thấy Trang Yêu Cầu!</h2>
        <p class="desc-text">
          Đường dẫn bạn truy cập không tồn tại, đã bị di chuyển hoặc tạm thời không khả dụng.
        </p>

        <!-- Search Box -->
        <form (ngSubmit)="onSearch()" class="search-form">
          <i class="fa-solid fa-magnifying-glass search-icon"></i>
          <input 
            type="text" 
            [(ngModel)]="searchQuery" 
            name="query" 
            placeholder="Tìm kiếm bộ truyện bạn cần..." 
          />
          <button type="submit" class="btn btn-primary btn-sm">Tìm Kiếm</button>
        </form>

        <!-- Action Links -->
        <div class="action-buttons">
          <a routerLink="/" class="btn btn-primary"><i class="fa-solid fa-house"></i> Trở Về Trang Chủ</a>
          <a routerLink="/comics" class="btn btn-secondary"><i class="fa-solid fa-book-open"></i> Danh Sách Truyện</a>
          <a routerLink="/categories" class="btn btn-secondary"><i class="fa-solid fa-tags"></i> Thể Loại</a>
        </div>
      </div>
    </div>
  `,
  styles: [`
    .not-found-page {
      padding-top: 4rem;
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

    .card-404 {
      padding: 3.5rem 2.5rem;
      max-width: 650px;
      width: 100%;

      .badge-404 {
        display: inline-flex;
        align-items: center;
        gap: 0.5rem;
        padding: 0.35rem 1rem;
        background: rgba(245, 158, 11, 0.15);
        border: 1px solid rgba(245, 158, 11, 0.3);
        border-radius: 20px;
        color: #fbbf24;
        font-size: 0.85rem;
        font-weight: 700;
        letter-spacing: 0.5px;
        margin-bottom: 1rem;
      }

      .code-title {
        font-size: 6rem;
        font-weight: 900;
        color: #fff;
        line-height: 1;
        margin-bottom: 1rem;
        letter-spacing: -2px;

        .glow-text {
          color: #6366f1;
          text-shadow: 0 0 20px rgba(99, 102, 241, 0.8);
        }

        @media (max-width: 576px) {
          font-size: 4.5rem;
        }
      }

      h2 {
        font-size: 1.6rem;
        color: #fff;
        font-weight: 700;
        margin-bottom: 0.75rem;
      }

      .desc-text {
        color: #94a3b8;
        font-size: 1rem;
        margin-bottom: 2rem;
        line-height: 1.5;
      }

      .search-form {
        position: relative;
        max-width: 480px;
        margin: 0 auto 2rem;

        .search-icon {
          position: absolute;
          left: 1rem;
          top: 50%;
          transform: translateY(-50%);
          color: #718096;
        }

        input {
          width: 100%;
          padding: 0.75rem 6.5rem 0.75rem 2.5rem;
          background: rgba(15, 23, 42, 0.8);
          border: 1px solid rgba(255, 255, 255, 0.12);
          border-radius: 12px;
          color: #fff;
          font-size: 0.95rem;

          &:focus { outline: none; border-color: #6366f1; }
        }

        button {
          position: absolute;
          right: 0.4rem;
          top: 50%;
          transform: translateY(-50%);
        }
      }

      .action-buttons {
        display: flex;
        justify-content: center;
        gap: 0.75rem;
        flex-wrap: wrap;
      }
    }
  `]
})
export class NotFoundComponent {
  searchQuery: string = '';

  constructor(private router: Router) {}

  onSearch(): void {
    if (this.searchQuery.trim()) {
      this.router.navigate(['/search'], { queryParams: { q: this.searchQuery } });
    }
  }
}

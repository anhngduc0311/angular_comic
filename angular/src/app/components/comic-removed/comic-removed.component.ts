import { Component, OnInit } from '@angular/core';
import { CommonModule } from '@angular/common';
import { RouterLink } from '@angular/router';
import { ComicService } from '../../services/comic.service';
import { Comic } from '../../models/comic.model';

@Component({
  selector: 'app-comic-removed',
  standalone: true,
  imports: [CommonModule, RouterLink],
  template: `
    <div class="container comic-removed-page text-center">
      <div class="card-removed bg-glass">
        <div class="icon-box">
          <i class="fa-solid fa-file-excel text-danger"></i>
        </div>

        <div class="badge-notice">
          <i class="fa-solid fa-shield-cat"></i> THÔNG BÁO BẢN QUYỀN / GỠ NỘI DUNG
        </div>

        <h1>Truyện Này Đã Bị Gỡ Hoặc Không Tồn Tại</h1>
        <p class="desc-text">
          Bộ truyện hoặc chapter bạn đang tìm kiếm hiện không khả dụng do yêu cầu bản quyền từ tác giả / nhà phát hành, hoặc đường dẫn đã bị thay đổi.
        </p>

        <div class="actions">
          <a routerLink="/" class="btn btn-primary"><i class="fa-solid fa-house"></i> Về Trang Chủ</a>
          <a routerLink="/comics" class="btn btn-secondary"><i class="fa-solid fa-book-open"></i> Xem Truyện Khác</a>
          <a routerLink="/contact" class="btn btn-secondary"><i class="fa-solid fa-envelope"></i> Liên Hệ Admin</a>
        </div>
      </div>

      <!-- Recommended Comics Section -->
      <div class="recommended-section" *ngIf="recommendedComics.length > 0">
        <div class="section-title text-left">
          <h2><i class="fa-solid fa-fire text-danger"></i> Gợi Ý Truyện HOT Đang Được Đọc Nhiều</h2>
          <p>Khám phá ngay những bộ truyện hấp dẫn khác trên TruyenKomi</p>
        </div>

        <div class="comics-grid">
          <div class="comic-card bg-glass" *ngFor="let comic of recommendedComics">
            <a [routerLink]="['/comic', comic.slug]" class="cover-wrapper">
              <img [src]="comic.coverImage || 'https://images.unsplash.com/photo-1578632767115-351597cf2477?auto=format&fit=crop&w=400&q=80'" [alt]="comic.title" loading="lazy" />
              <span class="chapter-badge">Chap {{ comic.latestChapter?.chapterNumber || 1 }}</span>
            </a>
            <div class="comic-info text-left">
              <h3 class="comic-title">
                <a [routerLink]="['/comic', comic.slug]">{{ comic.title }}</a>
              </h3>
              <div class="meta-row">
                <span class="views"><i class="fa-solid fa-eye text-primary"></i> {{ comic.views | number }}</span>
                <span class="rating"><i class="fa-solid fa-star text-warning"></i> {{ comic.rating || 5.0 }}</span>
              </div>
            </div>
          </div>
        </div>
      </div>
    </div>
  `,
  styles: [`
    .comic-removed-page {
      padding-top: 3.5rem;
      padding-bottom: 5rem;
    }

    .bg-glass {
      background: rgba(26, 26, 46, 0.85);
      backdrop-filter: blur(12px);
      border: 1px solid rgba(255, 255, 255, 0.08);
      border-radius: 24px;
      box-shadow: 0 12px 40px 0 rgba(0, 0, 0, 0.45);
    }

    .card-removed {
      padding: 3.5rem 2.5rem;
      max-width: 700px;
      margin: 0 auto 4rem;

      .icon-box {
        width: 80px;
        height: 80px;
        margin: 0 auto 1.5rem;
        background: rgba(239, 68, 68, 0.15);
        border: 1px solid rgba(239, 68, 68, 0.3);
        border-radius: 50%;
        display: flex;
        align-items: center;
        justify-content: center;
        font-size: 2.5rem;
      }

      .badge-notice {
        display: inline-flex;
        align-items: center;
        gap: 0.5rem;
        padding: 0.4rem 1.1rem;
        background: rgba(239, 68, 68, 0.15);
        border: 1px solid rgba(239, 68, 68, 0.3);
        border-radius: 20px;
        color: #f87171;
        font-size: 0.82rem;
        font-weight: 700;
        letter-spacing: 0.5px;
        margin-bottom: 1.25rem;
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
        max-width: 550px;
        margin-left: auto;
        margin-right: auto;
      }

      .actions {
        display: flex;
        justify-content: center;
        gap: 0.75rem;
        flex-wrap: wrap;
      }
    }

    .recommended-section {
      .section-title {
        margin-bottom: 1.5rem;
        h2 { font-size: 1.5rem; color: #fff; font-weight: 700; margin-bottom: 0.25rem; }
        p { color: #94a3b8; font-size: 0.92rem; margin: 0; }
      }

      .comics-grid {
        display: grid;
        grid-template-columns: repeat(auto-fill, minmax(180px, 1fr));
        gap: 1.25rem;

        .comic-card {
          border-radius: 14px;
          overflow: hidden;
          transition: transform 0.2s ease;

          &:hover {
            transform: translateY(-5px);
          }

          .cover-wrapper {
            position: relative;
            display: block;
            aspect-ratio: 3 / 4;

            img {
              width: 100%;
              height: 100%;
              object-fit: cover;
            }

            .chapter-badge {
              position: absolute;
              bottom: 0.5rem;
              left: 0.5rem;
              background: rgba(99, 102, 241, 0.9);
              color: #fff;
              font-size: 0.75rem;
              font-weight: 700;
              padding: 0.2rem 0.5rem;
              border-radius: 6px;
            }
          }

          .comic-info {
            padding: 0.85rem;

            .comic-title {
              font-size: 0.95rem;
              font-weight: 600;
              margin-bottom: 0.4rem;
              white-space: nowrap;
              overflow: hidden;
              text-overflow: ellipsis;

              a { color: #fff; text-decoration: none; &:hover { color: #818cf8; } }
            }

            .meta-row {
              display: flex;
              justify-content: space-between;
              font-size: 0.78rem;
              color: #94a3b8;
            }
          }
        }
      }
    }
  `]
})
export class ComicRemovedComponent implements OnInit {
  recommendedComics: Comic[] = [];

  constructor(private comicService: ComicService) {}

  ngOnInit(): void {
    this.comicService.getFeaturedComics().subscribe({
      next: (data) => {
        this.recommendedComics = data.slice(0, 6);
      },
      error: () => {
        this.comicService.getLatestComics(6).subscribe({
          next: (latest) => (this.recommendedComics = latest)
        });
      }
    });
  }
}

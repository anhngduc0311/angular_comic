import { Component } from '@angular/core';
import { CommonModule } from '@angular/common';
import { FormsModule } from '@angular/forms';
import { RouterLink } from '@angular/router';

interface FaqItem {
  id: number;
  category: 'account' | 'reading' | 'report' | 'other';
  categoryLabel: string;
  question: string;
  answer: string;
  isOpen?: boolean;
}

@Component({
  selector: 'app-faq',
  standalone: true,
  imports: [CommonModule, FormsModule, RouterLink],
  template: `
    <div class="container faq-page">
      <!-- Header -->
      <div class="page-header text-center">
        <h1><i class="fa-solid fa-circle-question text-gradient"></i> Câu Hỏi Thường Gặp (FAQ)</h1>
        <p>Giải đáp nhanh chóng tất cả các thắc mắc phổ biến về tài khoản, tính năng đọc truyện và hỗ trợ độc giả.</p>
      </div>

      <!-- Search & Category Controls -->
      <div class="faq-controls bg-glass">
        <div class="search-box">
          <i class="fa-solid fa-magnifying-glass search-icon"></i>
          <input 
            type="text" 
            [(ngModel)]="searchTerm" 
            (input)="applyFilter()" 
            placeholder="Tìm kiếm câu hỏi (ví dụ: đăng ký, lịch sử đọc, báo lỗi)..." 
          />
          <button *ngIf="searchTerm" (click)="searchTerm = ''; applyFilter()" class="btn-clear">
            <i class="fa-solid fa-xmark"></i>
          </button>
        </div>

        <div class="category-tabs">
          <button [class.active]="selectedCategory === 'ALL'" (click)="selectedCategory = 'ALL'; applyFilter()">Tất Cả</button>
          <button [class.active]="selectedCategory === 'account'" (click)="selectedCategory = 'account'; applyFilter()"><i class="fa-solid fa-user"></i> Tài Khoản</button>
          <button [class.active]="selectedCategory === 'reading'" (click)="selectedCategory = 'reading'; applyFilter()"><i class="fa-solid fa-book-open"></i> Đọc Truyện</button>
          <button [class.active]="selectedCategory === 'report'" (click)="selectedCategory = 'report'; applyFilter()"><i class="fa-solid fa-flag"></i> Báo Lỗi</button>
          <button [class.active]="selectedCategory === 'other'" (click)="selectedCategory = 'other'; applyFilter()"><i class="fa-solid fa-cubes"></i> Khác</button>
        </div>
      </div>

      <!-- FAQ Accordion List -->
      <div class="faq-list">
        <div class="empty-state bg-glass text-center" *ngIf="filteredFaqs.length === 0">
          <i class="fa-solid fa-ghost"></i>
          <h3>Không tìm thấy câu hỏi phù hợp!</h3>
          <p>Thử tìm kiếm với từ khóa khác hoặc gửi câu hỏi trực tiếp cho chúng tôi qua trang <a routerLink="/contact" class="link-text">Liên Hệ</a>.</p>
        </div>

        <div 
          *ngFor="let item of filteredFaqs" 
          class="faq-card bg-glass"
          [class.open]="item.isOpen"
        >
          <div class="faq-question" (click)="toggleFaq(item)">
            <div class="question-text">
              <span class="cat-badge">{{ item.categoryLabel }}</span>
              <h3>{{ item.question }}</h3>
            </div>
            <button class="toggle-btn">
              <i class="fa-solid" [class.fa-chevron-down]="!item.isOpen" [class.fa-chevron-up]="item.isOpen"></i>
            </button>
          </div>

          <div class="faq-answer" *ngIf="item.isOpen">
            <p [innerHTML]="item.answer"></p>
          </div>
        </div>
      </div>

      <!-- Support CTA Banner -->
      <div class="cta-banner bg-glass text-center">
        <h2>Vẫn Cần Thêm Sự Hỗ Trợ?</h2>
        <p>Nếu bạn không tìm thấy câu trả lời cho vấn đề của mình, hãy liên hệ ngay với đội ngũ quản trị MangaFlux.</p>
        <a routerLink="/contact" class="btn btn-primary"><i class="fa-solid fa-headset"></i> Gửi Yêu Cầu Hỗ Trợ</a>
      </div>
    </div>
  `,
  styles: [`
    .faq-page {
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
      margin-bottom: 2.5rem;
      h1 { font-size: 2.2rem; font-weight: 700; color: #fff; margin-bottom: 0.5rem; }
      p { color: #94a3b8; font-size: 1rem; max-width: 650px; margin: 0 auto; }
    }

    .faq-controls {
      padding: 1.25rem;
      margin-bottom: 2rem;
      display: flex;
      flex-direction: column;
      gap: 1rem;

      .search-box {
        position: relative;
        width: 100%;

        .search-icon {
          position: absolute;
          left: 1.25rem;
          top: 50%;
          transform: translateY(-50%);
          color: #718096;
        }

        input {
          width: 100%;
          padding: 0.85rem 3rem;
          background: rgba(15, 23, 42, 0.7);
          border: 1px solid rgba(255, 255, 255, 0.12);
          border-radius: 12px;
          color: #fff;
          font-size: 1rem;

          &:focus { outline: none; border-color: #6366f1; box-shadow: 0 0 0 3px rgba(99, 102, 241, 0.2); }
        }

        .btn-clear {
          position: absolute;
          right: 1rem;
          top: 50%;
          transform: translateY(-50%);
          background: none;
          border: none;
          color: #718096;
          cursor: pointer;
          &:hover { color: #fff; }
        }
      }

      .category-tabs {
        display: flex;
        gap: 0.5rem;
        flex-wrap: wrap;

        button {
          padding: 0.5rem 1.1rem;
          border-radius: 10px;
          border: 1px solid rgba(255, 255, 255, 0.1);
          background: rgba(15, 23, 42, 0.5);
          color: #a0aec0;
          font-size: 0.9rem;
          cursor: pointer;
          transition: all 0.2s ease;
          display: flex;
          align-items: center;
          gap: 0.4rem;

          &:hover { color: #fff; background: rgba(255, 255, 255, 0.08); }
          &.active { background: #6366f1; color: #fff; border-color: #6366f1; font-weight: 600; }
        }
      }
    }

    .faq-list {
      display: flex;
      flex-direction: column;
      gap: 1rem;
      margin-bottom: 3.5rem;

      .empty-state {
        padding: 3rem;
        color: #94a3b8;
        i { font-size: 3rem; color: #6366f1; margin-bottom: 1rem; }
        h3 { color: #fff; font-size: 1.25rem; margin-bottom: 0.5rem; }
        .link-text { color: #38bdf8; text-decoration: underline; }
      }

      .faq-card {
        border-radius: 14px;
        overflow: hidden;
        transition: border-color 0.2s ease;

        &.open {
          border-color: rgba(99, 102, 241, 0.4);
        }

        .faq-question {
          padding: 1.25rem 1.5rem;
          display: flex;
          justify-content: space-between;
          align-items: center;
          cursor: pointer;
          user-select: none;

          .question-text {
            display: flex;
            align-items: center;
            gap: 0.8rem;
            flex-wrap: wrap;

            .cat-badge {
              padding: 0.2rem 0.6rem;
              border-radius: 6px;
              background: rgba(99, 102, 241, 0.2);
              color: #818cf8;
              font-size: 0.78rem;
              font-weight: 600;
              text-transform: uppercase;
            }

            h3 {
              font-size: 1.05rem;
              color: #fff;
              font-weight: 600;
              margin: 0;
            }
          }

          .toggle-btn {
            background: none;
            border: none;
            color: #94a3b8;
            font-size: 1.1rem;
          }
        }

        .faq-answer {
          padding: 0 1.5rem 1.25rem 1.5rem;
          color: #cbd5e1;
          font-size: 0.95rem;
          line-height: 1.6;
          border-top: 1px solid rgba(255, 255, 255, 0.05);
          margin-top: 0.5rem;
          padding-top: 1rem;

          p { margin: 0; }
        }
      }
    }

    .cta-banner {
      padding: 3rem 2rem;
      h2 { font-size: 1.6rem; color: #fff; font-weight: 700; margin-bottom: 0.5rem; }
      p { color: #94a3b8; font-size: 1rem; margin-bottom: 1.5rem; }
    }
  `]
})
export class FaqComponent {
  searchTerm: string = '';
  selectedCategory: string = 'ALL';

  faqs: FaqItem[] = [
    {
      id: 1,
      category: 'account',
      categoryLabel: 'Tài Khoản',
      question: 'Đăng ký tài khoản trên MangaFlux có mất phí không?',
      answer: 'Hoàn toàn <strong>MIỄN PHÍ</strong>! Việc đăng ký tài khoản giúp bạn theo dõi truyện yêu thích, lưu lịch sử đọc không giới hạn và nhận thông báo khi có chap mới.',
      isOpen: true
    },
    {
      id: 2,
      category: 'account',
      categoryLabel: 'Tài Khoản',
      question: 'Làm sao để đổi mật khẩu hoặc lấy lại mật khẩu bị quên?',
      answer: 'Bạn có thể vào trang <strong>Cài Đặt Tài Khoản</strong> để cập nhật mật khẩu mới. Nếu quên mật khẩu, hãy liên hệ với ban quản trị qua trang Liên hệ để được hỗ trợ khôi phục.',
      isOpen: false
    },
    {
      id: 3,
      category: 'reading',
      categoryLabel: 'Đọc Truyện',
      question: 'Tại sao ảnh chapter bị lỗi không hiển thị hoặc load chậm?',
      answer: 'Có thể do nghẽn mạng tạm thời hoặc link ảnh gốc bị sự cố. Bạn hãy bấm vào nút <strong><i class="fa-solid fa-flag text-warning"></i> Báo Lỗi</strong> ở thanh công cụ đọc chapter để admin cập nhật lại link ảnh nhé.',
      isOpen: false
    },
    {
      id: 4,
      category: 'reading',
      categoryLabel: 'Đọc Truyện',
      question: 'MangaFlux có hỗ trợ phím tắt chuyển chương nhanh không?',
      answer: 'Có! Khi đang xem ở trang đọc chapter, bạn có thể nhấn phím <strong>← (Mũi tên trái)</strong> để về chap trước và <strong>→ (Mũi tên phải)</strong> để sang chap tiếp theo.',
      isOpen: false
    },
    {
      id: 5,
      category: 'report',
      categoryLabel: 'Báo Lỗi',
      question: 'Tôi phát hiện chapter bị trùng hoặc sai thứ tự ảnh thì làm thế nào?',
      answer: 'Ngay tại giao diện đọc chapter, bạn bấm vào nút <strong>Báo Lỗi</strong>, chọn loại lỗi (ví dụ: *Sai thứ tự ảnh* hoặc *Chapter bị trùng*) và bấm gửi. Hệ thống admin sẽ nhận thông báo và sửa trong thời gian ngắn nhất.',
      isOpen: false
    },
    {
      id: 6,
      category: 'other',
      categoryLabel: 'Khác',
      question: 'MangaFlux cập nhật chapter mới vào thời gian nào?',
      answer: 'Hệ thống MangaFlux tự động cập nhật và đăng tải các chapter truyện mới liên tục 24/7 ngay khi nhóm dịch phát hành.',
      isOpen: false
    }
  ];

  filteredFaqs: FaqItem[] = [...this.faqs];

  toggleFaq(item: FaqItem): void {
    item.isOpen = !item.isOpen;
  }

  applyFilter(): void {
    this.filteredFaqs = this.faqs.filter(item => {
      const matchCat = this.selectedCategory === 'ALL' || item.category === this.selectedCategory;
      const matchSearch = !this.searchTerm || 
        item.question.toLowerCase().includes(this.searchTerm.toLowerCase()) || 
        item.answer.toLowerCase().includes(this.searchTerm.toLowerCase());
      return matchCat && matchSearch;
    });
  }
}

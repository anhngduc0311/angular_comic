import { Component } from '@angular/core';
import { CommonModule } from '@angular/common';
import { RouterLink } from '@angular/router';

@Component({
  selector: 'app-about',
  standalone: true,
  imports: [CommonModule, RouterLink],
  template: `
    <div class="container about-page">
      <!-- Hero Section -->
      <div class="about-hero bg-glass">
        <div class="hero-badge">
          <i class="fa-solid fa-bolt text-primary"></i> Về MangaFlux
        </div>
        <h1 class="hero-title">Trải Nghiệm Đọc Truyện Tranh <span class="text-gradient">Đỉnh Cao</span> & <span class="text-gradient">Miễn Phí</span></h1>
        <p class="hero-desc">
          MangaFlux được xây dựng với mục tiêu mang đến cho cộng đồng yêu thích Manga, Manhwa, Manhua nền tảng đọc truyện mượt mà nhất, không bị quấy rầy bởi quảng cáo độc hại và tốc độ tải trang tức thì.
        </p>

        <div class="hero-stats">
          <div class="stat-box">
            <span class="stat-number">10.000+</span>
            <span class="stat-label">Bộ Truyện Tranh</span>
          </div>
          <div class="stat-box">
            <span class="stat-number">500.000+</span>
            <span class="stat-label">Độc Giả Hàng Tháng</span>
          </div>
          <div class="stat-box">
            <span class="stat-number">99.9%</span>
            <span class="stat-label">Thời Gian Uptime</span>
          </div>
          <div class="stat-box">
            <span class="stat-number">0s</span>
            <span class="stat-label">Độ Trễ Tải Trang</span>
          </div>
        </div>
      </div>

      <!-- Core Features Grid -->
      <div class="section-title text-center">
        <h2><i class="fa-solid fa-star text-warning"></i> Tại Sao Chọn MangaFlux?</h2>
        <p>Những ưu điểm vượt trội khiến MangaFlux trở thành lựa chọn hàng đầu của độc giả Việt Nam</p>
      </div>

      <div class="features-grid">
        <div class="feature-card bg-glass">
          <div class="feature-icon icon-cyan">
            <i class="fa-solid fa-bolt"></i>
          </div>
          <h3>Tốc Độ Tải Ảnh Siêu Tốc</h3>
          <p>Tối ưu hóa hình ảnh với công nghệ nén thế hệ mới, giúp tải trang cực nhanh ngay cả khi kết nối mạng yếu.</p>
        </div>

        <div class="feature-card bg-glass">
          <div class="feature-icon icon-purple">
            <i class="fa-solid fa-shield-halved"></i>
          </div>
          <h3>Không Quảng Cáo Độc Hại</h3>
          <p>Cam kết trải nghiệm đọc sạch sẽ, không có pop-up nhảy tab, không quảng cáo lừa đảo hoặc chứa mã độc.</p>
        </div>

        <div class="feature-card bg-glass">
          <div class="feature-icon icon-green">
            <i class="fa-solid fa-mobile-screen-button"></i>
          </div>
          <h3>Tương Thích Mọi Thiết Bị</h3>
          <p>Giao diện responsive tự động tối ưu hoàn hảo trên Điện thoại, Máy tính bảng và Máy tính để bàn.</p>
        </div>

        <div class="feature-card bg-glass">
          <div class="feature-icon icon-orange">
            <i class="fa-solid fa-bookmark"></i>
          </div>
          <h3>Đánh Dấu & Lịch Sử Tự Động</h3>
          <p>Tự động lưu lịch sử đọc, đánh dấu chương dở dang và đồng bộ hóa tức thì trên tài khoản của bạn.</p>
        </div>

        <div class="feature-card bg-glass">
          <div class="feature-icon icon-pink">
            <i class="fa-solid fa-comments"></i>
          </div>
          <h3>Cộng Đồng Sôi Nổi</h3>
          <p>Hệ thống bình luận tương tác sinh động, nơi bạn thỏa sức thảo luận và chia sẻ cảm xúc cùng các đồng đạo.</p>
        </div>

        <div class="feature-card bg-glass">
          <div class="feature-icon icon-yellow">
            <i class="fa-solid fa-bell"></i>
          </div>
          <h3>Thông Báo Chap Mới Tức Thì</h3>
          <p>Nhận ngay thông báo chuông trực quan khi truyện yêu thích của bạn có chương mới được đăng tải.</p>
        </div>
      </div>

      <!-- Mission & Vision Banner -->
      <div class="mission-banner bg-glass">
        <div class="mission-content">
          <h2><i class="fa-solid fa-bullseye text-accent"></i> Sứ Mệnh Của Chúng Tôi</h2>
          <p>
            Chúng tôi tin rằng niềm vui đọc truyện tranh là không biên giới. Đội ngũ phát triển MangaFlux luôn nỗ lực cải tiến công nghệ hàng ngày để tạo nên một sân chơi văn minh, hiện đại và kết nối hàng triệu người hâm mộ truyện tranh tại Việt Nam.
          </p>
          <div class="mission-actions">
            <a routerLink="/comics" class="btn btn-primary"><i class="fa-solid fa-compass"></i> Khám Phá Kho Truyện</a>
            <a routerLink="/contact" class="btn btn-secondary"><i class="fa-solid fa-paper-plane"></i> Liên Hệ Hợp Tác</a>
          </div>
        </div>
      </div>
    </div>
  `,
  styles: [`
    .about-page {
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

    .about-hero {
      text-align: center;
      padding: 3.5rem 2rem;
      margin-bottom: 3.5rem;

      .hero-badge {
        display: inline-flex;
        align-items: center;
        gap: 0.5rem;
        padding: 0.4rem 1rem;
        background: rgba(99, 102, 241, 0.15);
        border: 1px solid rgba(99, 102, 241, 0.3);
        border-radius: 20px;
        color: #818cf8;
        font-size: 0.88rem;
        font-weight: 600;
        margin-bottom: 1.5rem;
      }

      .hero-title {
        font-size: 2.5rem;
        font-weight: 800;
        color: #fff;
        margin-bottom: 1rem;
        line-height: 1.2;

        @media (max-width: 768px) {
          font-size: 1.8rem;
        }
      }

      .hero-desc {
        max-width: 720px;
        margin: 0 auto 2.5rem;
        color: #a0aec0;
        font-size: 1.05rem;
        line-height: 1.6;
      }

      .hero-stats {
        display: grid;
        grid-template-columns: repeat(4, 1fr);
        gap: 1.5rem;
        max-width: 850px;
        margin: 0 auto;

        @media (max-width: 768px) {
          grid-template-columns: repeat(2, 1fr);
        }

        .stat-box {
          padding: 1.25rem;
          background: rgba(15, 23, 42, 0.6);
          border: 1px solid rgba(255, 255, 255, 0.05);
          border-radius: 14px;
          display: flex;
          flex-direction: column;

          .stat-number {
            font-size: 1.8rem;
            font-weight: 800;
            color: #38bdf8;
            margin-bottom: 0.25rem;
          }

          .stat-label {
            font-size: 0.85rem;
            color: #94a3b8;
          }
        }
      }
    }

    .section-title {
      margin-bottom: 2.5rem;
      h2 {
        font-size: 1.8rem;
        color: #fff;
        font-weight: 700;
        margin-bottom: 0.5rem;
      }
      p {
        color: #94a3b8;
        font-size: 0.95rem;
      }
    }

    .features-grid {
      display: grid;
      grid-template-columns: repeat(auto-fit, minmax(300px, 1fr));
      gap: 1.5rem;
      margin-bottom: 3.5rem;

      .feature-card {
        padding: 2rem;
        transition: transform 0.25 ease, border-color 0.25s ease;

        &:hover {
          transform: translateY(-5px);
          border-color: rgba(255, 255, 255, 0.2);
        }

        .feature-icon {
          width: 54px;
          height: 54px;
          border-radius: 14px;
          display: flex;
          align-items: center;
          justify-content: center;
          font-size: 1.5rem;
          margin-bottom: 1.25rem;

          &.icon-cyan { background: rgba(6, 182, 212, 0.15); color: #22d3ee; }
          &.icon-purple { background: rgba(168, 85, 247, 0.15); color: #c084fc; }
          &.icon-green { background: rgba(16, 185, 129, 0.15); color: #34d399; }
          &.icon-orange { background: rgba(249, 115, 22, 0.15); color: #fb923c; }
          &.icon-pink { background: rgba(236, 72, 153, 0.15); color: #f472b6; }
          &.icon-yellow { background: rgba(245, 158, 11, 0.15); color: #fbbf24; }
        }

        h3 {
          font-size: 1.2rem;
          color: #fff;
          font-weight: 600;
          margin-bottom: 0.6rem;
        }

        p {
          color: #94a3b8;
          font-size: 0.92rem;
          line-height: 1.5;
          margin: 0;
        }
      }
    }

    .mission-banner {
      padding: 3rem 2rem;
      text-align: center;

      .mission-content {
        max-width: 750px;
        margin: 0 auto;

        h2 {
          font-size: 1.8rem;
          color: #fff;
          font-weight: 700;
          margin-bottom: 1rem;
        }

        p {
          color: #cbd5e1;
          font-size: 1.05rem;
          line-height: 1.6;
          margin-bottom: 2rem;
        }

        .mission-actions {
          display: flex;
          justify-content: center;
          gap: 1rem;
          flex-wrap: wrap;
        }
      }
    }
  `]
})
export class AboutComponent {}

import { Component, OnInit } from '@angular/core';
import { CommonModule } from '@angular/common';
import { FormsModule } from '@angular/forms';
import { RouterLink, Router } from '@angular/router';
import { ComicService } from '../../services/comic.service';
import { NotificationService } from '../../services/notification.service';
import { Comic, DashboardStats, DailyViewStat } from '../../models/comic.model';

@Component({
  selector: 'app-admin',
  standalone: true,
  imports: [CommonModule, FormsModule, RouterLink],
  templateUrl: './admin.component.html',
  styleUrls: ['./admin.component.scss']
})
export class AdminComponent implements OnInit {
  activeTab: 'dashboard' | 'broadcast' = 'dashboard';

  // Dashboard Stats State
  stats: DashboardStats | null = null;
  isLoadingStats: boolean = true;
  chartRange: '7days' | '30days' = '7days';

  // Broadcast Form Model
  broadcastForm = {
    title: '',
    message: '',
    link: ''
  };

  message: string = '';
  isError: boolean = false;

  constructor(
    private comicService: ComicService,
    private notificationService: NotificationService,
    private router: Router
  ) {}

  ngOnInit(): void {
    this.loadDashboardStats();
  }

  loadDashboardStats(): void {
    this.isLoadingStats = true;
    this.comicService.getAdminDashboardStats().subscribe({
      next: (data) => {
        this.stats = data;
        this.isLoadingStats = false;
      },
      error: (err) => {
        console.error('Error loading dashboard stats:', err);
        this.isLoadingStats = false;
      }
    });
  }

  // Stats & Chart Calculation Helpers
  get maxChartViews(): number {
    if (!this.stats || !this.stats.readingStats.length) return 100;
    const max = Math.max(...this.stats.readingStats.map(s => s.views));
    return max > 0 ? Math.ceil(max * 1.15) : 100;
  }

  get totalChartViews(): number {
    if (!this.stats) return 0;
    return this.stats.readingStats.reduce((sum, item) => sum + item.views, 0);
  }

  get avgDailyViews(): number {
    if (!this.stats || !this.stats.readingStats.length) return 0;
    return Math.round(this.totalChartViews / this.stats.readingStats.length);
  }

  get peakDay(): DailyViewStat | null {
    if (!this.stats || !this.stats.readingStats.length) return null;
    return [...this.stats.readingStats].sort((a, b) => b.views - a.views)[0];
  }

  getSvgPolylinePoints(): string {
    if (!this.stats || !this.stats.readingStats.length) return '';
    const points: string[] = [];
    const statsList = this.stats.readingStats;
    const width = 600;
    const height = 180;
    const maxVal = this.maxChartViews;

    statsList.forEach((stat, index) => {
      const x = (index / (statsList.length - 1)) * width;
      const y = height - (stat.views / maxVal) * (height - 20) - 10;
      points.push(`${x.toFixed(1)},${y.toFixed(1)}`);
    });

    return points.join(' ');
  }

  getSvgAreaPath(): string {
    const points = this.getSvgPolylinePoints();
    if (!points) return '';
    const width = 600;
    const height = 180;
    return `M 0,${height} L ${points.replace(/ /g, ' L ')} L ${width},${height} Z`;
  }

  getBarHeightPercentage(views: number): number {
    const max = this.maxChartViews;
    if (!max) return 0;
    return Math.max(12, Math.round((views / max) * 100));
  }

  formatTimeAgo(dateStr: string): string {
    if (!dateStr) return 'Mới đây';
    const date = new Date(dateStr);
    const now = new Date();
    const diffSeconds = Math.floor((now.getTime() - date.getTime()) / 1000);

    if (diffSeconds < 60) return 'Vừa xong';
    if (diffSeconds < 3600) return `${Math.floor(diffSeconds / 60)} phút trước`;
    if (diffSeconds < 86400) return `${Math.floor(diffSeconds / 3600)} giờ trước`;
    if (diffSeconds < 2592000) return `${Math.floor(diffSeconds / 86400)} ngày trước`;
    return date.toLocaleDateString('vi-VN');
  }

  getMaxComicViews(): number {
    if (!this.stats || !this.stats.topViewedComics.length) return 1;
    return Math.max(...this.stats.topViewedComics.map(c => c.views));
  }

  getComicViewPercentage(views: number): number {
    const max = this.getMaxComicViews();
    return Math.min(100, Math.max(8, Math.round((views / max) * 100)));
  }

  sendBroadcast(): void {
    if (!this.broadcastForm.message) {
      this.showMessage('Vui lòng nhập nội dung thông báo.', true);
      return;
    }

    this.notificationService.sendAdminBroadcast(this.broadcastForm).subscribe({
      next: () => {
        this.showMessage('Gửi thông báo toàn hệ thống thành công!');
        this.broadcastForm = { title: '', message: '', link: '' };
        this.activeTab = 'dashboard';
      },
      error: () => this.showMessage('Gửi thông báo thất bại.', true)
    });
  }

  editComic(comic: Comic): void {
    this.router.navigate(['/admin/stories'], { queryParams: { id: comic.id } });
  }

  showMessage(msg: string, isErr = false): void {
    this.message = msg;
    this.isError = isErr;
    setTimeout(() => this.message = '', 4000);
  }
}


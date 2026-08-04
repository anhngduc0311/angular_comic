import { Component, OnInit } from '@angular/core';
import { CommonModule } from '@angular/common';
import { FormsModule } from '@angular/forms';
import { RouterLink } from '@angular/router';
import { ComicService } from '../../services/comic.service';
import { NotificationService } from '../../services/notification.service';
import { Comic, Category, DashboardStats, DailyViewStat } from '../../models/comic.model';

@Component({
  selector: 'app-admin',
  standalone: true,
  imports: [CommonModule, FormsModule, RouterLink],
  templateUrl: './admin.component.html',
  styleUrls: ['./admin.component.scss']
})
export class AdminComponent implements OnInit {
  activeTab: 'dashboard' | 'comics' | 'add-comic' | 'add-chapter' | 'broadcast' = 'dashboard';
  comics: Comic[] = [];
  categories: Category[] = [];

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

  // Add/Edit Comic Form Model
  comicForm = {
    id: 0,
    title: '',
    author: '',
    description: '',
    coverImage: '',
    bannerImage: '',
    status: 'Ongoing',
    isFeatured: false,
    selectedCategoryIds: [] as number[]
  };

  // Add Chapter Form Model
  chapterForm = {
    comicId: 0,
    chapterNumber: 1,
    title: '',
    imageUrlsText: '' // Split by newline
  };

  message: string = '';
  isError: boolean = false;

  constructor(
    private comicService: ComicService,
    private notificationService: NotificationService
  ) {}

  ngOnInit(): void {
    this.loadData();
    this.loadDashboardStats();
  }

  loadData(): void {
    this.comicService.getLatestComics(50).subscribe(data => this.comics = data);
    this.comicService.getCategories().subscribe(cats => this.categories = cats);
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
        this.activeTab = 'comics';
      },
      error: () => this.showMessage('Gửi thông báo thất bại.', true)
    });
  }

  toggleCategorySelection(catId: number): void {
    const index = this.comicForm.selectedCategoryIds.indexOf(catId);
    if (index > -1) {
      this.comicForm.selectedCategoryIds.splice(index, 1);
    } else {
      this.comicForm.selectedCategoryIds.push(catId);
    }
  }

  saveComic(): void {
    if (!this.comicForm.title) {
      this.showMessage('Vui lòng nhập tên truyện.', true);
      return;
    }

    const payload = {
      title: this.comicForm.title,
      author: this.comicForm.author,
      description: this.comicForm.description,
      coverImage: this.comicForm.coverImage,
      bannerImage: this.comicForm.bannerImage,
      status: this.comicForm.status,
      isFeatured: this.comicForm.isFeatured,
      categoryIds: this.comicForm.selectedCategoryIds
    };

    if (this.comicForm.id > 0) {
      this.comicService.updateComic(this.comicForm.id, payload).subscribe({
        next: () => {
          this.showMessage('Cập nhật truyện thành công!');
          this.resetComicForm();
          this.loadData();
          this.loadDashboardStats();
          this.activeTab = 'comics';
        },
        error: () => this.showMessage('Cập nhật thất bại.', true)
      });
    } else {
      this.comicService.createComic(payload).subscribe({
        next: () => {
          this.showMessage('Thêm mới truyện thành công!');
          this.resetComicForm();
          this.loadData();
          this.loadDashboardStats();
          this.activeTab = 'comics';
        },
        error: () => this.showMessage('Thêm truyện thất bại.', true)
      });
    }
  }

  editComic(comic: Comic): void {
    this.comicForm = {
      id: comic.id,
      title: comic.title,
      author: comic.author || '',
      description: comic.description || '',
      coverImage: comic.coverImage || '',
      bannerImage: comic.bannerImage || '',
      status: comic.status,
      isFeatured: comic.isFeatured,
      selectedCategoryIds: comic.categories.map(c => c.id)
    };
    this.activeTab = 'add-comic';
  }

  deleteComic(id: number): void {
    if (confirm('Bạn có chắc chắn muốn xóa bộ truyện này?')) {
      this.comicService.deleteComic(id).subscribe(() => {
        this.showMessage('Đã xóa bộ truyện.');
        this.loadData();
        this.loadDashboardStats();
      });
    }
  }

  saveChapter(): void {
    if (!this.chapterForm.comicId || !this.chapterForm.title) {
      this.showMessage('Vui lòng chọn truyện và nhập tên chapter.', true);
      return;
    }

    const pages = this.chapterForm.imageUrlsText.split('\n').map(url => url.trim()).filter(url => url.length > 0);

    this.comicService.addChapter({
      comicId: this.chapterForm.comicId,
      chapterNumber: this.chapterForm.chapterNumber,
      title: this.chapterForm.title,
      imageUrls: pages
    }).subscribe({
      next: () => {
        this.showMessage('Thêm chapter mới thành công!');
        this.chapterForm = { comicId: 0, chapterNumber: 1, title: '', imageUrlsText: '' };
        this.loadData();
        this.loadDashboardStats();
        this.activeTab = 'comics';
      },
      error: () => this.showMessage('Thêm chapter thất bại.', true)
    });
  }

  resetComicForm(): void {
    this.comicForm = {
      id: 0,
      title: '',
      author: '',
      description: '',
      coverImage: '',
      bannerImage: '',
      status: 'Ongoing',
      isFeatured: false,
      selectedCategoryIds: []
    };
  }

  showMessage(msg: string, isErr = false): void {
    this.message = msg;
    this.isError = isErr;
    setTimeout(() => this.message = '', 4000);
  }
}

import { Component, OnInit } from '@angular/core';
import { CommonModule } from '@angular/common';
import { RouterModule } from '@angular/router';
import { ComicService } from '../../services/comic.service';
import { Comic, Category } from '../../models/comic.model';

@Component({
  selector: 'app-home',
  standalone: true,
  imports: [CommonModule, RouterModule],
  templateUrl: './home.component.html',
  styleUrls: ['./home.component.scss']
})
export class HomeComponent implements OnInit {
  featuredComics: Comic[] = [];
  latestComics: Comic[] = [];
  topViewComics: Comic[] = [];
  categories: Category[] = [];

  activeHeroIndex: number = 0;
  activeRankingTab: 'day' | 'week' | 'month' = 'day';
  isLoading: boolean = true;

  constructor(private comicService: ComicService) {}

  ngOnInit(): void {
    this.loadData();
  }

  loadData(): void {
    this.isLoading = true;

    this.comicService.getFeaturedComics().subscribe({
      next: (data) => {
        this.featuredComics = data;
        this.isLoading = false;
      },
      error: () => (this.isLoading = false)
    });

    this.comicService.getLatestComics(12).subscribe({
      next: (data) => {
        this.latestComics = data;
        this.updateTopComics();
      }
    });

    this.comicService.getCategories().subscribe({
      next: (cats) => (this.categories = cats)
    });
  }

  get currentHero(): Comic | undefined {
    return this.featuredComics[this.activeHeroIndex];
  }

  selectHero(index: number): void {
    this.activeHeroIndex = index;
  }

  switchRankingTab(tab: 'day' | 'week' | 'month'): void {
    this.activeRankingTab = tab;
    this.updateTopComics();
  }

  updateTopComics(): void {
    const list = [...this.latestComics];
    if (this.activeRankingTab === 'day') {
      this.topViewComics = list.sort((a, b) => b.views - a.views).slice(0, 5);
    } else if (this.activeRankingTab === 'week') {
      this.topViewComics = list.sort((a, b) => b.rating - a.rating).slice(0, 5);
    } else {
      this.topViewComics = list.sort((a, b) => b.id - a.id).slice(0, 5);
    }
  }

  formatViews(views: number): string {
    if (views >= 1_000_000) {
      return (views / 1_000_000).toFixed(1) + 'M';
    }
    if (views >= 1_000) {
      return (views / 1_000).toFixed(0) + 'k';
    }
    return views.toString();
  }

  formatTimeAgo(dateStr?: string): string {
    if (!dateStr) return 'Vừa cập nhật';
    const date = new Date(dateStr);
    const now = new Date();
    const diffMs = now.getTime() - date.getTime();
    const diffMins = Math.floor(diffMs / (1000 * 60));
    const diffHours = Math.floor(diffMs / (1000 * 60 * 60));
    const diffDays = Math.floor(diffMs / (1000 * 60 * 60 * 24));

    if (diffMins < 5) return 'Vừa xong';
    if (diffMins < 60) return `${diffMins} phút trước`;
    if (diffHours < 24) return `${diffHours} giờ trước`;
    if (diffDays < 30) return `${diffDays} ngày trước`;
    return date.toLocaleDateString('vi-VN');
  }

  onImgError(event: Event): void {
    const target = event.target as HTMLImageElement;
    if (target) {
      target.src = 'data:image/svg+xml;charset=UTF-8,%3Csvg%20xmlns%3D%22http%3A%2F%2Fwww.w3.org%2F2000%2Fsvg%22%20width%3D%22100%22%20height%3D%22140%22%20viewBox%3D%220%200%20100%20140%22%3E%3Crect%20width%3D%22100%22%20height%3D%22140%22%20fill%3D%22%231E2330%22%2F%3E%3Ctext%20x%3D%2250%25%22%20y%3D%2250%25%22%20dominant-baseline%3D%22middle%22%20text-anchor%3D%22middle%22%20fill%3D%22%236B7280%22%20font-size%3D%2212%22%3ENo%20Cover%3C%2Ftext%3E%3C%2Fsvg%3E';
    }
  }
}

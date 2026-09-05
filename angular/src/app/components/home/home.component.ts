import { Component, ElementRef, OnInit, ViewChild } from '@angular/core';
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
  @ViewChild('suggestContainer') suggestContainer?: ElementRef<HTMLDivElement>;

  featuredComics: Comic[] = [];
  latestComics: Comic[] = [];
  hotComics: Comic[] = [];
  categories: Category[] = [];

  isLoading: boolean = true;
  isLoadingHot: boolean = true;
  page: number = 1;
  hasMore: boolean = true;

  skeletonHotCards: number[] = Array(8).fill(0);
  skeletonCards: number[] = Array(18).fill(0);

  constructor(private comicService: ComicService) {}

  ngOnInit(): void {
    this.loadData();
  }

  loadData(): void {
    this.isLoading = true;
    this.isLoadingHot = true;

    // Load Hot / Featured Comics for Suggest slider
    this.comicService.getFeaturedComics().subscribe({
      next: (data) => {
        this.hotComics = data;
        this.isLoadingHot = false;
      },
      error: () => {
        this.isLoadingHot = false;
      }
    });

    // Load Latest Comics for Grid
    this.comicService.getLatestComics(24).subscribe({
      next: (data) => {
        this.latestComics = data;
        this.isLoading = false;
      },
      error: () => {
        this.isLoading = false;
      }
    });
  }

  scrollSuggest(direction: 'left' | 'right'): void {
    if (!this.suggestContainer?.nativeElement) return;
    const container = this.suggestContainer.nativeElement;
    const scrollAmount = direction === 'left' ? -380 : 380;
    container.scrollBy({ left: scrollAmount, behavior: 'smooth' });
  }

  scrollToTop(): void {
    window.scrollTo({ top: 0, behavior: 'smooth' });
  }

  formatTimeAgo(dateStr?: string): string {
    if (!dateStr) return 'Vừa xong';
    const date = new Date(dateStr);
    const now = new Date();
    const diffMs = now.getTime() - date.getTime();
    const diffMins = Math.floor(diffMs / (1000 * 60));
    const diffHours = Math.floor(diffMs / (1000 * 60 * 60));
    const diffDays = Math.floor(diffMs / (1000 * 60 * 60 * 24));

    if (diffMins < 5) return 'Vừa xong';
    if (diffMins < 60) return `${diffMins} Phút Trước`;
    if (diffHours < 24) return `${diffHours} Giờ Trước`;
    if (diffDays < 30) return `${diffDays} Ngày Trước`;
    return date.toLocaleDateString('vi-VN');
  }

  onImgError(event: Event): void {
    const target = event.target as HTMLImageElement;
    if (target) {
      target.src = 'https://images.unsplash.com/photo-1607604276583-eef5d076aa5f?auto=format&fit=crop&w=190&q=80';
    }
  }
}

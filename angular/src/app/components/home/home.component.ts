import { Component, DestroyRef, ElementRef, OnInit, ViewChild, inject } from '@angular/core';
import { takeUntilDestroyed } from '@angular/core/rxjs-interop';
import { CommonModule } from '@angular/common';
import { RouterModule } from '@angular/router';
import { ComicService } from '../../services/comic.service';
import { SeoService } from '../../services/seo.service';
import { Comic } from '../../models/comic.model';

@Component({
  selector: 'app-home',
  standalone: true,
  imports: [CommonModule, RouterModule],
  templateUrl: './home.component.html',
  styleUrls: ['./home.component.scss']
})
export class HomeComponent implements OnInit {
  @ViewChild('suggestContainer') suggestContainer?: ElementRef<HTMLDivElement>;

  latestComics: Comic[] = [];
  hotComics: Comic[] = [];

  private readonly destroyRef = inject(DestroyRef);
  latestError = false;
  hotError = false;
  filteredComics: Comic[] = [];

  selectedFilter: string = 'all';
  filterChips = [
    { label: 'Tất Cả', key: 'all', icon: 'fa-globe' },
    { label: 'Mới Nhất', key: 'new', icon: 'fa-bolt' },
    { label: 'Hot Tuần', key: 'hot', icon: 'fa-fire' },
    { label: 'Manhwa', key: 'manhwa', icon: 'fa-flag' },
    { label: 'Manga', key: 'manga', icon: 'fa-star' },
    { label: 'Chuyển Sinh', key: 'isekai', icon: 'fa-magic' },
    { label: 'Hành Động', key: 'action', icon: 'fa-crosshairs' },
    { label: 'Ngôn Tình', key: 'romance', icon: 'fa-heart' }
  ];

  isLoading: boolean = true;
  isLoadingHot: boolean = true;

  skeletonCards: number[] = Array(12).fill(0);

  constructor(
    private comicService: ComicService,
    private seoService: SeoService
  ) {}

  ngOnInit(): void {
    this.seoService.setHomeSeo();
    this.loadData();
  }

  loadData(): void {
    this.isLoading = true;
    this.isLoadingHot = true;
    this.latestError = false;
    this.hotError = false;

    // Load Hot Comics for Suggested Carousel (15 items)
    this.comicService.getFeaturedComics('views', 15).pipe(takeUntilDestroyed(this.destroyRef)).subscribe({
      next: (data) => {
        this.hotComics = data;
        this.updateFilteredComics();
        this.isLoadingHot = false;
      },
      error: () => {
        this.hotError = true;
        this.isLoadingHot = false;
      }
    });

    // Load Latest Comics for Grid
    this.comicService.getLatestComics(24).pipe(takeUntilDestroyed(this.destroyRef)).subscribe({
      next: (data) => {
        this.latestComics = data;
        this.updateFilteredComics();
        this.isLoading = false;
      },
      error: () => {
        this.latestError = true;
        this.isLoading = false;
      }
    });
  }

  setFilter(key: string): void {
    this.selectedFilter = key;
    this.updateFilteredComics();
  }

  get isFilterLoading(): boolean {
    return this.selectedFilter === 'hot' ? this.isLoadingHot : this.isLoading;
  }

  get hasFilterError(): boolean {
    return this.selectedFilter === 'hot' ? this.hotError : this.latestError;
  }

  private updateFilteredComics(): void {
    if (this.selectedFilter === 'all') this.filteredComics = this.latestComics;
    else if (this.selectedFilter === 'hot') this.filteredComics = this.hotComics;
    else if (this.selectedFilter === 'new') this.filteredComics = this.latestComics.slice(0, 12);
    else {
      const aliases: Record<string, string[]> = {
        isekai: ['isekai', 'chuyen-sinh', 'chuyển sinh'],
        action: ['action', 'hanh-dong', 'hành động'],
        romance: ['romance', 'ngon-tinh', 'ngôn tình']
      };
      const terms = aliases[this.selectedFilter] || [this.selectedFilter];
      this.filteredComics = this.latestComics.filter(comic =>
        comic.categories?.some(category => terms.some(term =>
          category.slug.toLowerCase().includes(term) || category.name.toLowerCase().includes(term))));
    }
  }

  private get scrollBehavior(): ScrollBehavior {
    return window.matchMedia('(prefers-reduced-motion: reduce)').matches ? 'auto' : 'smooth';
  }

  scrollSuggest(direction: 'left' | 'right'): void {
    const el = this.suggestContainer?.nativeElement;
    if (!el) return;
    el.scrollBy({ left: el.clientWidth * 0.8 * (direction === 'left' ? -1 : 1), behavior: this.scrollBehavior });
  }

  scrollToTop(): void {
    window.scrollTo({ top: 0, behavior: this.scrollBehavior });
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
    if (diffMins < 60) return `${diffMins} phút trước`;
    if (diffHours < 24) return `${diffHours} giờ trước`;
    if (diffDays < 30) return `${diffDays} ngày trước`;
    return date.toLocaleDateString('vi-VN');
  }

  formatNumber(num?: number | string | null): string {
    if (!num) return '0';
    const n = typeof num === 'string' ? parseFloat(num) : num;
    if (isNaN(n)) return '0';
    if (n >= 1000000) return (n / 1000000).toFixed(1) + 'M';
    if (n >= 1000) return (n / 1000).toFixed(1) + 'K';
    return Math.floor(n).toString();
  }

  onImgError(event: Event): void {
    const target = event.target as HTMLImageElement;
    if (target && !target.src.endsWith('/assets/cover-placeholder.svg')) {
      target.src = 'assets/cover-placeholder.svg';
    }
  }

  trackByComicId(index: number, comic: Comic): number {
    return comic.id;
  }

  trackByChapterId(index: number, ch: any): number {
    return ch.id;
  }
}

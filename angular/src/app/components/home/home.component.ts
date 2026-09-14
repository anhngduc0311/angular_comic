import { Component, ElementRef, OnInit, OnDestroy, ViewChild } from '@angular/core';
import { CommonModule } from '@angular/common';
import { RouterModule } from '@angular/router';
import { ComicService } from '../../services/comic.service';
import { SeoService } from '../../services/seo.service';
import { Comic, Category } from '../../models/comic.model';

@Component({
  selector: 'app-home',
  standalone: true,
  imports: [CommonModule, RouterModule],
  templateUrl: './home.component.html',
  styleUrls: ['./home.component.scss']
})
export class HomeComponent implements OnInit, OnDestroy {
  @ViewChild('suggestContainer') suggestContainer?: ElementRef<HTMLDivElement>;

  featuredComics: Comic[] = [];
  latestComics: Comic[] = [];
  hotComics: Comic[] = [];
  categories: Category[] = [];

  activeSpotlightIndex: number = 0;
  private spotlightTimer?: any;


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
  page: number = 1;

  skeletonHotCards: number[] = Array(8).fill(0);
  skeletonCards: number[] = Array(12).fill(0);

  constructor(
    private comicService: ComicService,
    private seoService: SeoService
  ) {}

  private suggestTimer?: any;
  private isSuggestHovered: boolean = false;
  displayHotComics: Comic[] = [];
  private isSliding: boolean = false;

  ngOnInit(): void {
    this.seoService.setHomeSeo();
    this.loadData();
    this.startSuggestAutoScroll();
  }

  ngOnDestroy(): void {
    this.stopSpotlightAutoPlay();
    this.stopSuggestAutoScroll();
  }

  loadData(): void {
    this.isLoading = true;
    this.isLoadingHot = true;

    // Load Hot Comics for Suggested Carousel (15 items)
    this.comicService.getFeaturedComics('views', 15).subscribe({
      next: (data) => {
        this.hotComics = data;
        // Duplicate items for seamless continuous infinite loop (TruyenGG style)
        this.displayHotComics = data.length > 0 ? [...data, ...data, ...data] : [];
        this.isLoadingHot = false;
        setTimeout(() => this.startSuggestAutoScroll(), 300);
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

  startSpotlightAutoPlay(): void {
    this.spotlightTimer = setInterval(() => {
      if (this.featuredComics.length > 0) {
        this.activeSpotlightIndex = (this.activeSpotlightIndex + 1) % this.featuredComics.length;
      }
    }, 6000);
  }

  stopSpotlightAutoPlay(): void {
    if (this.spotlightTimer) {
      clearInterval(this.spotlightTimer);
    }
  }

  get itemWidth(): number {
    if (!this.suggestContainer?.nativeElement) return 174;
    const firstCard = this.suggestContainer.nativeElement.querySelector('.suggest-card') as HTMLElement;
    return firstCard ? (firstCard.offsetWidth + 14) : 174;
  }

  startSuggestAutoScroll(): void {
    this.stopSuggestAutoScroll();
    this.suggestTimer = setInterval(() => {
      if (this.isSuggestHovered || !this.suggestContainer?.nativeElement || this.isSliding) return;
      this.scrollSuggest('right');
    }, 3500);
  }

  stopSuggestAutoScroll(): void {
    if (this.suggestTimer) {
      clearInterval(this.suggestTimer);
      this.suggestTimer = undefined;
    }
  }

  onSuggestMouseEnter(): void {
    this.isSuggestHovered = true;
  }

  onSuggestMouseLeave(): void {
    this.isSuggestHovered = false;
  }

  onSuggestScroll(): void {
    this.checkInfiniteLoopReset();
  }

  private checkInfiniteLoopReset(): void {
    if (!this.suggestContainer?.nativeElement) return;
    const el = this.suggestContainer.nativeElement;
    const oneSetWidth = el.scrollWidth / 3;
    if (oneSetWidth <= 0) return;

    if (el.scrollLeft >= oneSetWidth * 2) {
      el.scrollLeft -= oneSetWidth;
    }
  }

  selectSpotlight(index: number): void {
    this.activeSpotlightIndex = index;
    this.stopSpotlightAutoPlay();
    this.startSpotlightAutoPlay();
  }

  get currentSpotlight(): Comic | undefined {
    return this.featuredComics[this.activeSpotlightIndex];
  }

  setFilter(key: string): void {
    this.selectedFilter = key;
  }

  get filteredComics(): Comic[] {
    if (this.selectedFilter === 'all') return this.latestComics;
    if (this.selectedFilter === 'hot') return this.hotComics;
    if (this.selectedFilter === 'new') return this.latestComics.slice(0, 12);
    return this.latestComics.filter(c => 
      c.categories?.some(cat => cat.slug.toLowerCase().includes(this.selectedFilter) || cat.name.toLowerCase().includes(this.selectedFilter))
    );
  }

  scrollSuggest(direction: 'left' | 'right'): void {
    if (!this.suggestContainer?.nativeElement || this.isSliding) return;
    const el = this.suggestContainer.nativeElement;
    const step = this.itemWidth * (el.clientWidth > 768 ? 2 : 1);
    const oneSetWidth = el.scrollWidth / 3;

    this.isSliding = true;

    if (direction === 'left') {
      if (el.scrollLeft <= 10 && oneSetWidth > 0) {
        el.scrollLeft = oneSetWidth;
      }
      el.scrollBy({ left: -step, behavior: 'smooth' });
    } else {
      if (el.scrollLeft >= oneSetWidth * 2 && oneSetWidth > 0) {
        el.scrollLeft -= oneSetWidth;
      }
      el.scrollBy({ left: step, behavior: 'smooth' });
    }

    setTimeout(() => {
      this.isSliding = false;
      this.checkInfiniteLoopReset();
    }, 450);

    this.startSuggestAutoScroll();
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
    if (target) {
      target.src = 'https://images.unsplash.com/photo-1607604276583-eef5d076aa5f?auto=format&fit=crop&w=300&q=80';
    }
  }

  trackByComicId(index: number, comic: Comic): number {
    return comic.id;
  }

  trackByComicIndex(index: number, comic: Comic): number | string {
    return `${comic.id}-${index}`;
  }

  trackByChapterId(index: number, ch: any): number {
    return ch.id;
  }
}

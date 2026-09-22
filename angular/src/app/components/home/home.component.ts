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
    { label: 'Chuyển Sinh', key: 'isekai', icon: 'fa-magic' },
    { label: 'Hành Động', key: 'action', icon: 'fa-crosshairs' },
    { label: 'Ngôn Tình', key: 'romance', icon: 'fa-heart' },
    { label: 'Hài Hước', key: 'comedy', icon: 'fa-smile-o' },
    { label: 'Học Đường', key: 'school', icon: 'fa-graduation-cap' }
  ];

  isLoading: boolean = true;
  isLoadingHot: boolean = true;

  skeletonCards: number[] = Array(12).fill(0);

  constructor(
    private comicService: ComicService,
    private seoService: SeoService
  ) { }

  ngOnInit(): void {
    this.seoService.setHomeSeo();
    this.loadData();
  }

  loadData(): void {
    this.isLoading = true;
    this.isLoadingHot = true;
    this.latestError = false;
    this.hotError = false;

    const isValidHomeComic = (c: Comic): boolean => {
      const total = c.totalChapters ?? 0;
      if (total <= 0) return false;
      if (c.hasChapterOne === true) return true;
      if (c.firstChapterNumber !== undefined && c.firstChapterNumber <= 1.5) return true;
      if (c.recentChapters && c.recentChapters.some(ch => (ch.chapterNumber >= 0.8 && ch.chapterNumber < 2.0) || Math.floor(ch.chapterNumber) === 1 || ch.chapterNumber <= 1.5)) return true;
      if (c.hasChapterOne === false) return false;
      return true;
    };

    // Load Hot Manhwa & Manhua Romance Comics for Suggested Carousel
    const isManhwaOrManhua = (c: Comic): boolean => {
      const country = (c.country || '').toLowerCase();
      if (country.includes('hàn') || country.includes('trung') || country.includes('korea') || country.includes('china') || country.includes('manhwa') || country.includes('manhua')) {
        return true;
      }
      return c.categories?.some(cat => {
        const name = (cat.name || '').toLowerCase();
        const slug = (cat.slug || '').toLowerCase();
        return name.includes('manhwa') || name.includes('manhua') || slug.includes('manhwa') || slug.includes('manhua');
      }) ?? false;
    };

    const hasRomance = (c: Comic): boolean => {
      return c.categories?.some(cat => {
        const name = (cat.name || '').toLowerCase();
        const slug = (cat.slug || '').toLowerCase();
        return name.includes('romance') || name.includes('ngôn tình') || slug.includes('romance') || slug.includes('ngon-tinh');
      }) ?? false;
    };

    this.comicService.searchComics(undefined, 'romance', undefined, 'views', undefined, 1, 24).pipe(takeUntilDestroyed(this.destroyRef)).subscribe({
      next: (res) => {
        const filtered = (res.items || []).filter(c => isValidHomeComic(c) && isManhwaOrManhua(c));
        if (filtered.length > 0) {
          this.hotComics = filtered.slice(0, 15);
          this.updateFilteredComics();
          this.isLoadingHot = false;
        } else {
          // Fallback: search by getFeaturedComics and filter for romance manhwa/manhua
          this.comicService.getFeaturedComics('views', 20).pipe(takeUntilDestroyed(this.destroyRef)).subscribe({
            next: (data) => {
              const fallbackFiltered = data.filter(c => isValidHomeComic(c) && isManhwaOrManhua(c) && hasRomance(c));
              this.hotComics = fallbackFiltered.length > 0 ? fallbackFiltered.slice(0, 15) : data.filter(c => isValidHomeComic(c) && isManhwaOrManhua(c)).slice(0, 15);
              this.updateFilteredComics();
              this.isLoadingHot = false;
            },
            error: () => {
              this.hotError = true;
              this.isLoadingHot = false;
            }
          });
        }
      },
      error: () => {
        this.hotError = true;
        this.isLoadingHot = false;
      }
    });

    // Load Latest Manga Comics for Grid (strictly excluding Manhwa & Manhua)
    const isMangaOnly = (c: Comic): boolean => {
      const country = (c.country || '').toLowerCase();
      if (country.includes('hàn') || country.includes('trung') || country.includes('korea') || country.includes('china') || country.includes('manhwa') || country.includes('manhua')) {
        return false;
      }
      const hasManhwaOrManhuaCat = c.categories?.some(cat => {
        const name = (cat.name || '').toLowerCase();
        const slug = (cat.slug || '').toLowerCase();
        return name.includes('manhwa') || name.includes('manhua') || slug.includes('manhwa') || slug.includes('manhua') || slug.includes('tu-tien') || slug.includes('dam-my');
      });
      return !hasManhwaOrManhuaCat;
    };

    this.comicService.searchComics(undefined, undefined, undefined, 'latest', 'Nhật Bản', 1, 36).pipe(takeUntilDestroyed(this.destroyRef)).subscribe({
      next: (res) => {
        const mangaList = (res.items || []).filter(c => isValidHomeComic(c) && isMangaOnly(c));
        if (mangaList.length > 0) {
          this.latestComics = mangaList;
          this.updateFilteredComics();
          this.isLoading = false;
        } else {
          this.comicService.getLatestComics(36).pipe(takeUntilDestroyed(this.destroyRef)).subscribe({
            next: (data) => {
              this.latestComics = data.filter(c => isValidHomeComic(c) && isMangaOnly(c));
              this.updateFilteredComics();
              this.isLoading = false;
            },
            error: () => {
              this.latestError = true;
              this.isLoading = false;
            }
          });
        }
      },
      error: () => {
        this.comicService.getLatestComics(36).pipe(takeUntilDestroyed(this.destroyRef)).subscribe({
          next: (data) => {
            this.latestComics = data.filter(c => isValidHomeComic(c) && isMangaOnly(c));
            this.updateFilteredComics();
            this.isLoading = false;
          },
          error: () => {
            this.latestError = true;
            this.isLoading = false;
          }
        });
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
    else if (this.selectedFilter === 'hot') this.filteredComics = [...this.latestComics].sort((a, b) => (b.views || 0) - (a.views || 0));
    else if (this.selectedFilter === 'new') this.filteredComics = this.latestComics.slice(0, 12);
    else {
      const aliases: Record<string, string[]> = {
        isekai: ['isekai', 'chuyen-sinh', 'chuyển sinh'],
        action: ['action', 'hanh-dong', 'hành động'],
        romance: ['romance', 'ngon-tinh', 'ngôn tình'],
        comedy: ['comedy', 'hai-huoc', 'hài hước'],
        school: ['school', 'school-life', 'hoc-duong', 'học đường']
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
    if (!target) return;
    const currentSrc = target.src || '';
    if (!currentSrc.includes('/proxy-image') && (currentSrc.includes('zetimage.com') || currentSrc.includes('viestorage.com') || currentSrc.includes('zettruyen'))) {
      const base = (typeof window !== 'undefined' && window.location.origin.includes('localhost:4200')) ? 'http://localhost:5000' : '';
      target.src = `${base}/api/chapters/proxy-image?url=${encodeURIComponent(currentSrc)}`;
      return;
    }
    if (!target.src.endsWith('/assets/cover-placeholder.svg')) {
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

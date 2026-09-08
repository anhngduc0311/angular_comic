import { Component, OnInit, OnDestroy, HostListener } from '@angular/core';
import { CommonModule, Location } from '@angular/common';
import { RouterModule, ActivatedRoute, Router } from '@angular/router';
import { FormsModule } from '@angular/forms';
import { ComicService } from '../../services/comic.service';
import { UserService } from '../../services/user.service';
import { AuthService } from '../../services/auth.service';
import { ReportService } from '../../services/report.service';
import { SeoService } from '../../services/seo.service';
import { Chapter, ChapterDetail } from '../../models/comic.model';
import { ERROR_TYPE_OPTIONS } from '../../models/report.model';

export interface PageLoadingState {
  loaded: boolean;
  error: boolean;
  retrying: boolean;
  retryCount: number;
  url: string;
}

@Component({
  selector: 'app-chapter-read',
  standalone: true,
  imports: [CommonModule, RouterModule, FormsModule],
  templateUrl: './chapter-read.component.html',
  styleUrls: ['./chapter-read.component.scss']
})
export class ChapterReadComponent implements OnInit, OnDestroy {
  chapter: ChapterDetail | null = null;
  selectedChapterId: number = 0;
  prevChapterId: number | null = null;
  nextChapterId: number | null = null;
  isLoading: boolean = true;
  showScrollTop: boolean = false;
  restoredPosition: boolean = false;

  // Smart Auto-Hide & Zen Mode states
  isHeaderHidden: boolean = false;
  isHeaderHovered: boolean = false;
  isPinned: boolean = false;
  isFullscreen: boolean = false;
  showHint: boolean = false;
  private lastScrollY: number = 0;
  private scrollThreshold: number = 4;

  // Preloading & Reading Position states
  private preloadedChapterId: number | null = null;
  private preloadedImages: HTMLImageElement[] = [];
  private saveScrollTimeout: any = null;

  // Zoom Controls state
  zoomWidth: number = 900; // 900px default (100%)
  zoomLevels = [
    { label: '50%', width: 500 },
    { label: '75%', width: 700 },
    { label: '100%', width: 900 },
    { label: '125%', width: 1150 },
    { label: '150%', width: 1400 },
    { label: '200%', width: 1800 },
    { label: 'Tràn màn', width: 0 }
  ];

  // Auto-Scroll State
  isAutoScrolling: boolean = false;
  autoScrollSpeed: number = 2; // Default 2x speed
  autoScrollSpeeds = [
    { label: '1x (Chậm)', speed: 1 },
    { label: '2x (Vừa)', speed: 2 },
    { label: '3x (Nhanh)', speed: 3 },
    { label: '4x (Rất nhanh)', speed: 4 }
  ];
  private autoScrollAnimFrame: number | null = null;
  private lastFrameTime: number = 0;

  // Report Modal States
  showReportModal: boolean = false;
  selectedReportErrorType: string = 'IMAGE_FAILED';
  reportDescription: string = '';
  reporterName: string = '';
  isSubmittingReport: boolean = false;
  reportSuccessMessage: string = '';
  reportErrorMessage: string = '';
  errorTypeOptions = ERROR_TYPE_OPTIONS;

  // CDN Image Loading & Error Handling States
  pageStates: { [index: number]: PageLoadingState | undefined } = {};
  totalFailedCount: number = 0;
  totalLoadedCount: number = 0;

  private onFullscreenChangeListener = () => {
    this.isFullscreen = !!document.fullscreenElement;
  };

  constructor(
    private route: ActivatedRoute,
    private router: Router,
    private comicService: ComicService,
    private userService: UserService,
    public authService: AuthService,
    private reportService: ReportService,
    private seoService: SeoService,
    private location: Location
  ) {}

  ngOnInit(): void {
    this.loadSavedZoom();
    this.loadSavedAutoScrollSpeed();
    this.loadSavedPinState();
    this.checkHintVisibility();

    document.addEventListener('fullscreenchange', this.onFullscreenChangeListener);

    this.route.params.subscribe(params => {
      const slug = params['slug'];
      const chapterNumber = params['chapterNumber'];
      const id = +params['id'];

      this.stopAutoScroll();

      if (slug && chapterNumber) {
        this.fetchChapterBySlugAndNumber(slug, +chapterNumber);
      } else if (id) {
        this.fetchChapter(id);
      }
    });
  }

  ngOnDestroy(): void {
    this.stopAutoScroll();
    document.removeEventListener('fullscreenchange', this.onFullscreenChangeListener);
  }


  loadSavedPinState(): void {
    const savedPin = localStorage.getItem('truyenkomi_reader_pinned');
    this.isPinned = savedPin === 'true';
  }

  togglePin(): void {
    this.isPinned = !this.isPinned;
    if (this.isPinned) {
      this.isHeaderHidden = false;
    }
    localStorage.setItem('truyenkomi_reader_pinned', this.isPinned.toString());
  }

  toggleFullscreen(): void {
    if (!document.fullscreenElement) {
      document.documentElement.requestFullscreen().catch(err => console.warn('Fullscreen error:', err));
    } else {
      if (document.exitFullscreen) {
        document.exitFullscreen().catch(err => console.warn('Exit fullscreen error:', err));
      }
    }
  }

  toggleHeader(): void {
    this.isHeaderHidden = !this.isHeaderHidden;
  }

  onReaderClick(event: MouseEvent): void {
    const target = event.target as HTMLElement;
    if (target.closest('button, select, input, a, textarea, .report-modal-dialog, .floating-reader-tools, .reader-header, .restore-toast, .zen-hint-pill, .reader-bottom-nav')) {
      return;
    }
    this.toggleHeader();
  }

  checkHintVisibility(): void {
    const hasSeenHint = localStorage.getItem('truyenkomi_seen_zen_hint');
    if (!hasSeenHint) {
      this.showHint = true;
      setTimeout(() => {
        this.showHint = false;
      }, 7000);
    }
  }

  dismissHint(event?: MouseEvent): void {
    if (event) {
      event.stopPropagation();
    }
    this.showHint = false;
    localStorage.setItem('truyenkomi_seen_zen_hint', 'true');
  }

  loadSavedAutoScrollSpeed(): void {
    const savedSpeed = localStorage.getItem('truyenkomi_autoscroll_speed');
    if (savedSpeed !== null) {
      const parsed = parseInt(savedSpeed, 10);
      if (!isNaN(parsed) && parsed >= 1 && parsed <= 4) {
        this.autoScrollSpeed = parsed;
      }
    }
  }

  toggleAutoScroll(): void {
    if (this.isAutoScrolling) {
      this.stopAutoScroll();
    } else {
      this.startAutoScroll();
    }
  }

  startAutoScroll(): void {
    if (this.isAutoScrolling) return;
    this.isAutoScrolling = true;
    this.lastFrameTime = performance.now();

    const scrollStep = (currentTime: number) => {
      if (!this.isAutoScrolling) return;

      const delta = (currentTime - this.lastFrameTime) / 1000;
      this.lastFrameTime = currentTime;

      // Smooth frame-based scrolling (28px per sec * multiplier)
      const pxToScroll = 28 * this.autoScrollSpeed * delta;
      window.scrollBy(0, pxToScroll);

      // Stop if reached bottom of page
      if ((window.innerHeight + window.scrollY) >= (document.documentElement.scrollHeight - 15)) {
        this.stopAutoScroll();
        return;
      }

      this.autoScrollAnimFrame = requestAnimationFrame(scrollStep);
    };

    this.autoScrollAnimFrame = requestAnimationFrame(scrollStep);
  }

  stopAutoScroll(): void {
    this.isAutoScrolling = false;
    if (this.autoScrollAnimFrame !== null) {
      cancelAnimationFrame(this.autoScrollAnimFrame);
      this.autoScrollAnimFrame = null;
    }
  }

  setAutoScrollSpeed(speed: number): void {
    this.autoScrollSpeed = speed;
    localStorage.setItem('truyenkomi_autoscroll_speed', speed.toString());
  }

  loadSavedZoom(): void {
    const savedZoom = localStorage.getItem('truyenkomi_reader_zoom');
    if (savedZoom !== null) {
      const parsed = parseInt(savedZoom, 10);
      if (!isNaN(parsed)) {
        this.zoomWidth = parsed;
      }
    }
  }

  setZoomWidth(width: number): void {
    this.zoomWidth = width;
    localStorage.setItem('truyenkomi_reader_zoom', width.toString());
  }

  zoomIn(): void {
    const widths = [500, 700, 900, 1150, 1400, 1800, 0];
    const currentIndex = widths.indexOf(this.zoomWidth);
    if (currentIndex >= 0 && currentIndex < widths.length - 1) {
      this.setZoomWidth(widths[currentIndex + 1]);
    } else if (currentIndex === -1) {
      this.setZoomWidth(1150);
    }
  }

  zoomOut(): void {
    const widths = [500, 700, 900, 1150, 1400, 1800, 0];
    const currentIndex = widths.indexOf(this.zoomWidth);
    if (currentIndex > 0) {
      this.setZoomWidth(widths[currentIndex - 1]);
    } else if (currentIndex === -1) {
      this.setZoomWidth(900);
    }
  }

  resetZoom(): void {
    this.setZoomWidth(900);
  }

  getZoomLabel(): string {
    const found = this.zoomLevels.find(l => l.width === this.zoomWidth);
    return found ? found.label : `${this.zoomWidth}px`;
  }

  @HostListener('window:scroll', [])
  onWindowScroll(): void {
    const currentScrollY = window.scrollY || document.documentElement.scrollTop || 0;
    this.showScrollTop = currentScrollY > 400;

    // Smart Auto-hide logic: reveal header instantly when scrolling UP
    if (!this.isPinned) {
      if (currentScrollY <= 60) {
        // At the top: always show header
        this.isHeaderHidden = false;
      } else if (currentScrollY > this.lastScrollY + this.scrollThreshold) {
        // Scrolling down: smoothly hide header
        this.isHeaderHidden = true;
      } else if (currentScrollY < this.lastScrollY - this.scrollThreshold) {
        // Scrolling up: reveal header immediately
        this.isHeaderHidden = false;
      }
    }

    this.lastScrollY = Math.max(0, currentScrollY);

    // Save scroll position for the current chapter (throttled 300ms)
    if (this.chapter && currentScrollY > 50) {
      if (this.saveScrollTimeout) clearTimeout(this.saveScrollTimeout);
      this.saveScrollTimeout = setTimeout(() => {
        if (this.chapter) {
          localStorage.setItem(`truyenkomi_scroll_${this.chapter.id}`, currentScrollY.toString());
        }
      }, 300);
    }

    // Auto prefetch next chapter images when scrolling near the end (70%+ down page)
    const scrollPercent = (currentScrollY + window.innerHeight) / (document.documentElement.scrollHeight || 1);
    if (scrollPercent > 0.7 && this.nextChapterId) {
      this.preloadNextChapter();
    }
  }

  @HostListener('window:keydown', ['$event'])
  handleKeyboardEvent(event: KeyboardEvent): void {
    const targetTag = (event.target as HTMLElement)?.tagName?.toLowerCase();
    if (targetTag === 'input' || targetTag === 'textarea' || targetTag === 'select') {
      return;
    }

    if (event.key === 'ArrowLeft' && this.prevChapterId) {
      this.navigateToChapter(this.prevChapterId);
    } else if (event.key === 'ArrowRight' && this.nextChapterId) {
      this.navigateToChapter(this.nextChapterId);
    } else if (event.key === '+' || event.key === '=') {
      this.zoomIn();
    } else if (event.key === '-' || event.key === '_') {
      this.zoomOut();
    } else if (event.key === '0') {
      this.resetZoom();
    } else if (event.key === ' ' || event.key === 's' || event.key === 'S') {
      event.preventDefault();
      this.toggleAutoScroll();
    } else if (event.key === 'f' || event.key === 'F') {
      event.preventDefault();
      this.toggleFullscreen();
    } else if (event.key === 'h' || event.key === 'H' || event.key === 'z' || event.key === 'Z') {
      event.preventDefault();
      this.toggleHeader();
    } else if (event.key === 'p' || event.key === 'P') {
      event.preventDefault();
      this.togglePin();
    } else if (event.key === 'Escape') {
      if (this.showReportModal) {
        this.closeReportModal();
      }
    }
  }


  fetchChapter(id: number): void {
    this.isLoading = true;
    this.restoredPosition = false;

    this.comicService.getChapterById(id).subscribe({
      next: (detail) => {
        if (!detail) {
          this.router.navigate(['/404']);
          return;
        }
        this.chapter = detail;
        this.selectedChapterId = detail.id;
        this.initPageStates(detail.pages);
        this.isLoading = false;
        this.seoService.setChapterReadSeo(
          detail.comicTitle, 
          detail.comicSlug, 
          detail.title, 
          detail.chapterNumber, 
          detail.pages && detail.pages.length > 0 ? detail.pages[0].imageUrl : undefined
        );
        this.calculateNavChapters();
        if (detail.comicSlug && detail.chapterNumber !== undefined) {
          this.location.replaceState(`/read/${detail.comicSlug}/chuong-${detail.chapterNumber}`);
        }
        this.trackHistory();
        this.restoreReadingPosition(id);
        this.prefetchCurrentChapterPages();
        this.preloadNextChapter();
      },
      error: () => {
        this.isLoading = false;
        this.router.navigate(['/404']);
      }
    });
  }

  fetchChapterBySlugAndNumber(slug: string, chapterNumber: number): void {
    this.isLoading = true;
    this.restoredPosition = false;

    this.comicService.getChapterBySlugAndNumber(slug, chapterNumber).subscribe({
      next: (detail) => {
        if (!detail) {
          this.router.navigate(['/404']);
          return;
        }
        this.chapter = detail;
        this.selectedChapterId = detail.id;
        this.initPageStates(detail.pages);
        this.isLoading = false;
        this.seoService.setChapterReadSeo(
          detail.comicTitle, 
          detail.comicSlug, 
          detail.title, 
          detail.chapterNumber, 
          detail.pages && detail.pages.length > 0 ? detail.pages[0].imageUrl : undefined
        );
        this.calculateNavChapters();
        this.trackHistory();
        this.restoreReadingPosition(detail.id);
        this.prefetchCurrentChapterPages();
        this.preloadNextChapter();
      },
      error: () => {
        this.isLoading = false;
        this.router.navigate(['/404']);
      }
    });
  }

  navigateToChapter(chId: number | null): void {
    if (!chId || !this.chapter) return;
    const ch = this.chapter.allChapters.find(c => c.id === chId);
    if (ch && this.chapter.comicSlug) {
      this.router.navigate(['/read', this.chapter.comicSlug, `chuong-${ch.chapterNumber}`]);
    } else {
      this.router.navigate(['/read', chId]);
    }
  }

  getChapterRoute(chId: number | null): any[] {
    if (!chId || !this.chapter) return ['/404'];
    const ch = this.chapter.allChapters.find(c => c.id === chId);
    if (ch && this.chapter.comicSlug) {
      return ['/read', this.chapter.comicSlug, `chuong-${ch.chapterNumber}`];
    }
    return ['/read', chId];
  }

  restoreReadingPosition(chapterId: number): void {
    const savedScroll = localStorage.getItem(`truyenkomi_scroll_${chapterId}`);
    if (savedScroll && +savedScroll > 150) {
      setTimeout(() => {
        window.scrollTo({ top: +savedScroll, behavior: 'instant' });
        this.restoredPosition = true;
        setTimeout(() => { this.restoredPosition = false; }, 4000);
      }, 150);
    } else {
      window.scrollTo({ top: 0, behavior: 'instant' });
    }
  }

  prefetchCurrentChapterPages(): void {
    if (!this.chapter || !this.chapter.pages) return;
    // Eagerly prefetch initial pages into browser cache
    const initialPages = this.chapter.pages.slice(0, 5);
    initialPages.forEach(page => {
      const img = new Image();
      img.src = page.imageUrl;
    });
  }

  preloadNextChapter(): void {
    if (!this.nextChapterId || this.preloadedChapterId === this.nextChapterId) return;

    this.preloadedChapterId = this.nextChapterId;
    this.comicService.getChapterById(this.nextChapterId).subscribe({
      next: (nextChapter) => {
        if (nextChapter && nextChapter.pages) {
          this.preloadedImages = nextChapter.pages.slice(0, 5).map(page => {
            const img = new Image();
            img.src = page.imageUrl;
            return img;
          });
        }
      },
      error: () => {}
    });
  }

  calculateNavChapters(): void {
    if (!this.chapter) return;
    const sorted = [...this.chapter.allChapters].sort((a, b) => a.chapterNumber - b.chapterNumber);
    const currentIndex = sorted.findIndex(ch => ch.id === this.chapter?.id);

    this.prevChapterId = currentIndex > 0 ? sorted[currentIndex - 1].id : null;
    this.nextChapterId = currentIndex < sorted.length - 1 ? sorted[currentIndex + 1].id : null;
  }

  getChapterLabel(ch: Chapter): string {
    if (!ch) return '';
    if (ch.title && ch.title !== `Chapter ${ch.chapterNumber}` && ch.title !== `Chương ${ch.chapterNumber}`) {
      return `Chapter ${ch.chapterNumber} - ${ch.title}`;
    }
    return `Chapter ${ch.chapterNumber}`;
  }

  onSelectChapter(): void {
    if (this.selectedChapterId) {
      this.navigateToChapter(this.selectedChapterId);
    }
  }

  scrollToTop(): void {
    window.scrollTo({ top: 0, behavior: 'smooth' });
  }

  expGainedToast: boolean = false;

  trackHistory(): void {
    if (this.authService.isLoggedIn && this.chapter) {
      this.userService.trackHistory(this.chapter.comicId, this.chapter.id).subscribe({
        next: () => {
          this.expGainedToast = true;
          setTimeout(() => {
            this.expGainedToast = false;
          }, 3500);
        }
      });
    }
  }

  openReportModal(): void {
    this.reportSuccessMessage = '';
    this.reportErrorMessage = '';
    this.reportDescription = '';
    this.selectedReportErrorType = 'IMAGE_FAILED';
    if (this.authService.isLoggedIn && this.authService.currentUserValue) {
      this.reporterName = this.authService.currentUserValue.fullName || this.authService.currentUserValue.username;
    } else {
      this.reporterName = '';
    }
    this.showReportModal = true;
  }

  closeReportModal(): void {
    this.showReportModal = false;
  }

  initPageStates(pages: any[]): void {
    this.pageStates = {};
    this.totalFailedCount = 0;
    this.totalLoadedCount = 0;
    if (!pages) return;
    pages.forEach((page, index) => {
      this.pageStates[index] = {
        loaded: false,
        error: false,
        retrying: false,
        retryCount: 0,
        url: page.imageUrl
      };
    });
  }

  onImgLoad(index: number): void {
    const state = this.pageStates[index];
    if (state) {
      state.loaded = true;
      state.error = false;
      state.retrying = false;
      this.updateCounters();
    }
  }

  onImgError(index: number, event?: Event): void {
    const state = this.pageStates[index];
    if (!state) return;

    // Tự động thử lại tối đa 3 lần với timestamp để vượt cache lỗi của CDN
    if (state.retryCount < 3) {
      state.retrying = true;
      state.loaded = false;
      state.error = false;
      state.retryCount++;

      const retryDelay = 1200 * state.retryCount;
      setTimeout(() => {
        const pState = this.pageStates[index];
        if (pState && pState.retrying) {
          const original = this.chapter?.pages[index]?.imageUrl || pState.url;
          const cleanBase = original.split('?')[0];
          pState.url = `${cleanBase}?retry=${pState.retryCount}&t=${Date.now()}`;
          pState.retrying = false;
        }
      }, retryDelay);
    } else {
      state.retrying = false;
      state.error = true;
      state.loaded = false;
      this.updateCounters();
    }
  }

  retrySinglePage(index: number): void {
    const state = this.pageStates[index];
    if (!state) return;
    state.error = false;
    state.retrying = true;
    state.loaded = false;
    state.retryCount = 0;

    const original = this.chapter?.pages[index]?.imageUrl || state.url;
    const cleanBase = original.split('?')[0];
    state.url = `${cleanBase}?reload=${Date.now()}`;
    setTimeout(() => {
      const pState = this.pageStates[index];
      if (pState) {
        pState.retrying = false;
      }
    }, 300);
    this.updateCounters();
  }

  retryAllFailedPages(): void {
    if (!this.chapter || !this.chapter.pages) return;
    this.chapter.pages.forEach((_, idx) => {
      if (this.pageStates[idx]?.error) {
        this.retrySinglePage(idx);
      }
    });
  }

  reportPageIssue(index: number): void {
    this.openReportModal();
    this.selectedReportErrorType = 'IMAGE_FAILED';
    this.reportDescription = `Trang ${index + 1} không tải được từ CDN (máy chủ ảnh).`;
  }

  private updateCounters(): void {
    let failed = 0;
    let loaded = 0;
    Object.values(this.pageStates).forEach(s => {
      if (s?.error) failed++;
      if (s?.loaded) loaded++;
    });
    this.totalFailedCount = failed;
    this.totalLoadedCount = loaded;
  }

  submitReport(): void {
    if (!this.chapter) return;

    this.isSubmittingReport = true;
    this.reportSuccessMessage = '';
    this.reportErrorMessage = '';

    this.reportService.createReport({
      comicId: this.chapter.comicId,
      chapterId: this.chapter.id,
      errorType: this.selectedReportErrorType,
      description: this.reportDescription,
      reporterName: this.reporterName
    }).subscribe({
      next: () => {
        this.isSubmittingReport = false;
        this.reportSuccessMessage = 'Báo lỗi đã được gửi thành công! Ban quản trị sẽ sớm xử lý. Cảm ơn bạn!';
        setTimeout(() => {
          this.closeReportModal();
        }, 2000);
      },
      error: (err) => {
        console.error('Lỗi gửi báo cáo:', err);
        this.isSubmittingReport = false;
        this.reportErrorMessage = 'Có lỗi xảy ra khi gửi báo lỗi. Vui lòng thử lại sau.';
      }
    });
  }
}

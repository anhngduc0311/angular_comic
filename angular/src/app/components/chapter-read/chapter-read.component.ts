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

  // Mobile Settings Drawer State
  showMobileSettingsDrawer: boolean = false;

  // Reading Mode State (Vertical Scroll vs Page Flip)
  readingMode: 'vertical' | 'flip' = 'vertical';
  showModeMenu: boolean = false;
  currentPageIndex: number = 0;
  flipDirection: 'ltr' | 'rtl' = 'ltr'; // ltr: Left-to-Right (Webtoon), rtl: Right-to-Left (Manga)
  flipFitMode: 'contain' | 'width' | 'height' = 'contain';
  showFitMenu: boolean = false;
  flipAnimClass: string = '';

  fitModes: { label: string; shortLabel: string; mode: 'contain' | 'width' | 'height'; icon: string }[] = [
    { label: 'Vừa màn hình', shortLabel: 'Vừa', mode: 'contain', icon: 'fa-compress' },
    { label: 'Tràn chiều rộng', shortLabel: 'Rộng', mode: 'width', icon: 'fa-arrows-h' },
    { label: 'Tràn chiều cao', shortLabel: 'Cao', mode: 'height', icon: 'fa-arrows-v' }
  ];

  // Auto-Flip (Tự động lật trang) State
  isAutoFlipping: boolean = false;
  autoFlipSeconds: number = 5;
  showAutoFlipMenu: boolean = false;
  private autoFlipTimer: any = null;
  autoFlipSpeeds = [
    { label: '3 giây / trang', seconds: 3 },
    { label: '5 giây / trang', seconds: 5 },
    { label: '8 giây / trang', seconds: 8 },
    { label: '10 giây / trang', seconds: 10 }
  ];

  // Touch Swipe Tracking
  private touchStartX: number = 0;
  private touchStartY: number = 0;
  private touchStartTime: number = 0;

  // Preloading & Reading Position states
  private preloadedChapterId: number | null = null;
  private preloadedImages: HTMLImageElement[] = [];
  private preloadedPageIndices = new Set<number>();
  private preloadScrollThrottle: any = null;
  private saveScrollTimeout: any = null;

  // Zoom Controls state
  zoomWidth: number = 900; // 900px default (100%)
  showZoomMenu: boolean = false;
  zoomLevels = [
    { label: '50%', width: 500 },
    { label: '75%', width: 700 },
    { label: '100%', width: 900 },
    { label: '125%', width: 1150 },
    { label: '150%', width: 1400 },
    { label: '200%', width: 1800 },
    { label: 'Tràn màn', width: 0 }
  ];

  get isMinZoom(): boolean {
    return this.zoomWidth === 500;
  }

  get isMaxZoom(): boolean {
    return this.zoomWidth === 0;
  }


  // Auto-Scroll State
  isAutoScrolling: boolean = false;
  autoScrollSpeed: number = 2; // Default 2x speed (85px/s)
  showSpeedMenu: boolean = false;
  autoScrollSpeeds = [
    { label: '1x (Chậm)', speed: 1 },
    { label: '2x (Vừa)', speed: 2 },
    { label: '3x (Nhanh)', speed: 3 },
    { label: '4x (Rất nhanh)', speed: 4 }
  ];
  private autoScrollAnimFrame: number | null = null;
  private lastFrameTime: number = 0;
  private scrollSubpixelAccumulator: number = 0;
  private isUserTouching: boolean = false;

  private speedPixelsPerSecond: { [speed: number]: number } = {
    1: 45,
    2: 85,
    3: 140,
    4: 220
  };

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
  useDataSaver: boolean = true; // Default True for 20x faster WebP loading
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
    this.loadSavedReadingMode();
    this.loadSavedFlipSettings();
    this.loadSavedDataSaver();
    this.loadSavedZoom();
    this.loadSavedAutoScrollSpeed();
    this.checkHintVisibility();

    document.addEventListener('fullscreenchange', this.onFullscreenChangeListener);

    this.route.params.subscribe(params => {
      const slug = params['slug'];
      const chapterNumber = params['chapterNumber'];
      const id = +params['id'];

      this.stopAutoScroll();
      this.stopAutoFlip();

      if (slug && chapterNumber) {
        this.fetchChapterBySlugAndNumber(slug, +chapterNumber);
      } else if (id) {
        this.fetchChapter(id);
      }
    });
  }

  private flipHeaderAutoHideTimer: any = null;

  ngOnDestroy(): void {
    this.stopAutoScroll();
    this.stopAutoFlip();
    this.clearFlipHeaderAutoHide();
    document.removeEventListener('fullscreenchange', this.onFullscreenChangeListener);
  }


  loadSavedReadingMode(): void {
    const savedMode = localStorage.getItem('truyenkomi_reading_mode');
    if (savedMode === 'flip' || savedMode === 'vertical') {
      this.readingMode = savedMode;
    }
  }

  loadSavedFlipSettings(): void {
    const savedDir = localStorage.getItem('truyenkomi_flip_dir');
    if (savedDir === 'rtl' || savedDir === 'ltr') {
      this.flipDirection = savedDir;
    }
    const savedFit = localStorage.getItem('truyenkomi_flip_fit');
    if (savedFit === 'contain' || savedFit === 'width' || savedFit === 'height') {
      this.flipFitMode = savedFit;
    }
    const savedSec = localStorage.getItem('truyenkomi_autoflip_sec');
    if (savedSec) {
      const s = parseInt(savedSec, 10);
      if (!isNaN(s) && [3, 5, 8, 10].includes(s)) {
        this.autoFlipSeconds = s;
      }
    }
  }

  togglePin(): void {
    this.isPinned = !this.isPinned;
    if (this.isPinned) {
      this.isHeaderHidden = false;
    }
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
    if (!this.isHeaderHidden && this.readingMode === 'flip') {
      this.scheduleFlipHeaderAutoHide(3500);
    } else {
      this.clearFlipHeaderAutoHide();
    }
  }

  scheduleFlipHeaderAutoHide(delayMs: number = 3000): void {
    if (this.readingMode !== 'flip') return;
    this.clearFlipHeaderAutoHide();
    this.flipHeaderAutoHideTimer = setTimeout(() => {
      if (!this.showMobileSettingsDrawer && !this.showModeMenu && !this.showFitMenu && !this.showAutoFlipMenu && !this.showReportModal) {
        this.isHeaderHidden = true;
      }
    }, delayMs);
  }

  clearFlipHeaderAutoHide(): void {
    if (this.flipHeaderAutoHideTimer) {
      clearTimeout(this.flipHeaderAutoHideTimer);
      this.flipHeaderAutoHideTimer = null;
    }
  }

  onReaderClick(event: MouseEvent): void {
    const target = event.target as HTMLElement;
    if (target.closest('button, select, input, a, textarea, .report-modal-dialog, .floating-reader-tools, .reader-header, .restore-toast, .zen-hint-pill, .reader-bottom-nav, .zoom-header-group, .zoom-levels-menu, .autoscroll-header-group, .as-speed-menu, .mode-dropdown-wrap, .mode-menu, .fit-dropdown-wrap, .fit-levels-menu, .autoflip-dropdown-wrap, .reader-flip-bottom-bar, .flip-click-zone')) {
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

  // ==================== READING MODE (VERTICAL VS FLIP) ====================
  toggleModeMenu(): void {
    this.showModeMenu = !this.showModeMenu;
  }

  setReadingMode(mode: 'vertical' | 'flip'): void {
    if (this.readingMode === mode) {
      this.showModeMenu = false;
      return;
    }

    if (mode === 'flip') {
      // Sync current visible page from vertical scroll into flip currentPageIndex
      let currentIdx = 0;
      const windowH = window.innerHeight;
      if (this.chapter?.pages) {
        for (let i = 0; i < this.chapter.pages.length; i++) {
          const el = document.getElementById('page-' + (i + 1));
          if (el) {
            const rect = el.getBoundingClientRect();
            if (rect.top <= windowH * 0.6 && rect.bottom >= 0) {
              currentIdx = i;
            }
          }
        }
      }
      this.currentPageIndex = currentIdx;
      this.stopAutoScroll();
      this.readingMode = 'flip';
      this.preloadFlipBuffer(currentIdx);
      window.scrollTo({ top: 0, behavior: 'instant' });
      this.saveCurrentPage();
      this.scheduleFlipHeaderAutoHide(2500);
    } else {
      // Switching from Flip to Vertical
      this.clearFlipHeaderAutoHide();
      this.isHeaderHidden = false;
      this.stopAutoFlip();
      this.readingMode = 'vertical';
      setTimeout(() => {
        const el = document.getElementById('page-' + (this.currentPageIndex + 1));
        if (el) {
          el.scrollIntoView({ behavior: 'smooth', block: 'start' });
        }
      }, 80);
    }

    localStorage.setItem('truyenkomi_reading_mode', mode);
    this.showModeMenu = false;
  }

  // ==================== FLIP MODE NAVIGATION ====================
  nextPage(): void {
    if (!this.chapter?.pages || this.chapter.pages.length === 0) return;
    if (this.readingMode === 'flip') {
      this.isHeaderHidden = true;
      this.clearFlipHeaderAutoHide();
    }
    if (this.currentPageIndex < this.chapter.pages.length - 1) {
      this.flipAnimClass = 'slide-next';
      this.currentPageIndex++;
      this.saveCurrentPage();
      this.preloadFlipBuffer(this.currentPageIndex);
      setTimeout(() => { this.flipAnimClass = ''; }, 260);
    } else {
      if (this.isAutoFlipping) {
        this.stopAutoFlip();
      }
    }
  }

  prevPage(): void {
    if (!this.chapter?.pages || this.chapter.pages.length === 0) return;
    if (this.readingMode === 'flip') {
      this.isHeaderHidden = true;
      this.clearFlipHeaderAutoHide();
    }
    if (this.currentPageIndex > 0) {
      this.flipAnimClass = 'slide-prev';
      this.currentPageIndex--;
      this.saveCurrentPage();
      this.preloadFlipBuffer(this.currentPageIndex);
      setTimeout(() => { this.flipAnimClass = ''; }, 260);
    }
  }

  goToPage(index: number): void {
    if (!this.chapter?.pages || this.chapter.pages.length === 0) return;
    if (this.readingMode === 'flip') {
      this.isHeaderHidden = true;
      this.clearFlipHeaderAutoHide();
    }
    const target = Math.max(0, Math.min(index, this.chapter.pages.length - 1));
    if (target !== this.currentPageIndex) {
      this.flipAnimClass = target > this.currentPageIndex ? 'slide-next' : 'slide-prev';
      this.currentPageIndex = target;
      this.saveCurrentPage();
      this.preloadFlipBuffer(target);
      setTimeout(() => { this.flipAnimClass = ''; }, 260);
    }
  }

  onPageSliderChange(event: any): void {
    const val = parseInt(event.target.value, 10);
    if (!isNaN(val)) {
      this.goToPage(val);
    }
  }

  saveCurrentPage(): void {
    if (this.chapter) {
      localStorage.setItem(`truyenkomi_page_${this.chapter.id}`, this.currentPageIndex.toString());
    }
  }

  // ==================== MOBILE SETTINGS DRAWER ====================
  toggleMobileSettingsDrawer(): void {
    this.showMobileSettingsDrawer = !this.showMobileSettingsDrawer;
  }

  openMobileSettingsDrawer(): void {
    this.showMobileSettingsDrawer = true;
  }

  closeMobileSettingsDrawer(): void {
    this.showMobileSettingsDrawer = false;
  }

  setFlipDirection(dir: 'ltr' | 'rtl'): void {
    this.flipDirection = dir;
    localStorage.setItem('truyenkomi_flip_dir', dir);
  }

  toggleFlipDirection(): void {
    this.flipDirection = this.flipDirection === 'ltr' ? 'rtl' : 'ltr';
    localStorage.setItem('truyenkomi_flip_dir', this.flipDirection);
  }

  toggleFitMenu(): void {
    this.showFitMenu = !this.showFitMenu;
  }

  selectFitMode(mode: 'contain' | 'width' | 'height'): void {
    this.flipFitMode = mode;
    this.showFitMenu = false;
    localStorage.setItem('truyenkomi_flip_fit', mode);
  }

  getFitLabel(): string {
    const found = this.fitModes.find(f => f.mode === this.flipFitMode);
    return found ? found.label : 'Vừa màn hình';
  }

  getFitShortLabel(): string {
    const found = this.fitModes.find(f => f.mode === this.flipFitMode);
    return found ? found.shortLabel : 'Vừa';
  }

  getFitIcon(): string {
    const found = this.fitModes.find(f => f.mode === this.flipFitMode);
    return found ? found.icon : 'fa-compress';
  }

  // ==================== AUTO-FLIP ====================
  toggleAutoFlip(): void {
    if (this.isAutoFlipping) {
      this.stopAutoFlip();
    } else {
      this.startAutoFlip();
    }
  }

  startAutoFlip(): void {
    if (this.isAutoFlipping) return;
    this.isAutoFlipping = true;
    this.stopAutoScroll();
    this.runAutoFlipTimer();
  }

  stopAutoFlip(): void {
    this.isAutoFlipping = false;
    if (this.autoFlipTimer) {
      clearInterval(this.autoFlipTimer);
      this.autoFlipTimer = null;
    }
  }

  private runAutoFlipTimer(): void {
    if (this.autoFlipTimer) clearInterval(this.autoFlipTimer);
    this.autoFlipTimer = setInterval(() => {
      if (!this.isAutoFlipping) {
        this.stopAutoFlip();
        return;
      }
      if (this.chapter && this.currentPageIndex < this.chapter.pages.length - 1) {
        this.nextPage();
      } else {
        this.stopAutoFlip();
      }
    }, this.autoFlipSeconds * 1000);
  }

  toggleAutoFlipMenu(): void {
    this.showAutoFlipMenu = !this.showAutoFlipMenu;
  }

  selectAutoFlipSpeed(seconds: number): void {
    this.autoFlipSeconds = seconds;
    localStorage.setItem('truyenkomi_autoflip_sec', seconds.toString());
    this.showAutoFlipMenu = false;
    if (this.isAutoFlipping) {
      this.runAutoFlipTimer();
    }
  }

  preloadFlipBuffer(idx: number): void {
    if (!this.chapter || !this.chapter.pages) return;
    const targets = [idx, idx + 1, idx + 2, idx + 3, idx - 1];
    targets.forEach(t => {
      if (t >= 0 && t < this.chapter!.pages.length && !this.preloadedPageIndices.has(t)) {
        this.preloadedPageIndices.add(t);
        const page = this.chapter!.pages[t];
        if (page && page.imageUrl) {
          const img = new Image();
          img.referrerPolicy = 'no-referrer';
          if ('fetchPriority' in img) {
            (img as any).fetchPriority = t === idx ? 'high' : 'auto';
          }
          img.src = this.getOptimizedPageUrl(page.imageUrl);
        }
      }
    });

    if (idx >= this.chapter.pages.length - 2 && this.nextChapterId) {
      this.preloadNextChapter();
    }
  }

  // ==================== FLIP CLICK ZONES & TOUCH ====================
  onFlipLeftClick(event?: MouseEvent): void {
    if (event) event.stopPropagation();
    if (this.readingMode === 'flip') {
      this.isHeaderHidden = true;
      this.clearFlipHeaderAutoHide();
    }
    if (this.flipDirection === 'ltr') {
      if (this.currentPageIndex === 0 && this.prevChapterId) {
        this.navigateToChapter(this.prevChapterId);
      } else {
        this.prevPage();
      }
    } else {
      if (this.currentPageIndex === (this.chapter?.pages?.length || 1) - 1 && this.nextChapterId) {
        this.navigateToChapter(this.nextChapterId);
      } else {
        this.nextPage();
      }
    }
  }

  onFlipRightClick(event?: MouseEvent): void {
    if (event) event.stopPropagation();
    if (this.readingMode === 'flip') {
      this.isHeaderHidden = true;
      this.clearFlipHeaderAutoHide();
    }
    if (this.flipDirection === 'ltr') {
      if (this.currentPageIndex === (this.chapter?.pages?.length || 1) - 1 && this.nextChapterId) {
        this.navigateToChapter(this.nextChapterId);
      } else {
        this.nextPage();
      }
    } else {
      if (this.currentPageIndex === 0 && this.prevChapterId) {
        this.navigateToChapter(this.prevChapterId);
      } else {
        this.prevPage();
      }
    }
  }

  @HostListener('window:wheel', ['$event'])
  onWindowWheel(event: WheelEvent): void {
    if (this.readingMode === 'flip') {
      const target = event.target as HTMLElement;
      if (target?.closest('.mobile-settings-sheet, .mode-menu, .zoom-levels-menu, .fit-levels-menu, .as-speed-menu, .report-modal-dialog')) {
        return;
      }

      if (event.deltaY < -3) {
        // Cuộn chuột LÊN (Scroll UP): Hiện thanh Header ngay lập tức!
        this.isHeaderHidden = false;
        this.scheduleFlipHeaderAutoHide(3500);
      } else if (event.deltaY > 3) {
        // Cuộn chuột XUỐNG (Scroll DOWN): Ẩn thanh Header đi!
        this.isHeaderHidden = true;
        this.clearFlipHeaderAutoHide();
        if (this.showMobileSettingsDrawer) {
          this.closeMobileSettingsDrawer();
        }
      }
    }
  }

  onFlipTouchStart(event: TouchEvent): void {
    if (event.touches.length === 1) {
      this.touchStartX = event.touches[0].clientX;
      this.touchStartY = event.touches[0].clientY;
      this.touchStartTime = Date.now();
    }
  }

  onFlipTouchEnd(event: TouchEvent): void {
    if (event.changedTouches.length === 1) {
      const deltaX = event.changedTouches[0].clientX - this.touchStartX;
      const deltaY = event.changedTouches[0].clientY - this.touchStartY;
      const duration = Date.now() - this.touchStartTime;

      // 1. Vuốt ngang: Chuyển trang (Horizontal Swipe)
      if (Math.abs(deltaX) > 35 && Math.abs(deltaX) > Math.abs(deltaY) * 1.2 && duration < 600) {
        if (this.readingMode === 'flip') {
          this.isHeaderHidden = true;
          this.clearFlipHeaderAutoHide();
        }
        if (deltaX < 0) {
          // Vuốt sang trái
          if (this.flipDirection === 'ltr') {
            this.nextPage();
          } else {
            this.prevPage();
          }
        } else {
          // Vuốt sang phải
          if (this.flipDirection === 'ltr') {
            this.prevPage();
          } else {
            this.nextPage();
          }
        }
      } 
      // 2. Vuốt dọc ở chế độ lật trang (Vertical Swipe in Flip Mode):
      else if (Math.abs(deltaY) > 25 && Math.abs(deltaY) > Math.abs(deltaX) * 1.2 && duration < 600) {
        if (deltaY > 0) {
          // Vuốt từ trên xuống (Cuộn lên): Hiện thanh Header!
          this.isHeaderHidden = false;
          this.scheduleFlipHeaderAutoHide(3500);
        } else {
          // Vuốt từ dưới lên (Cuộn xuống): Ẩn thanh Header!
          this.isHeaderHidden = true;
          this.clearFlipHeaderAutoHide();
        }
      }
    }
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
    this.scrollSubpixelAccumulator = 0;
    this.lastFrameTime = performance.now();

    if (typeof document !== 'undefined') {
      document.documentElement.classList.add('is-autoscrolling');
    }

    const scrollStep = (currentTime: number) => {
      if (!this.isAutoScrolling) return;

      const delta = Math.min((currentTime - this.lastFrameTime) / 1000, 0.1);
      this.lastFrameTime = currentTime;

      if (!this.isUserTouching) {
        const speedInPxPerSec = this.speedPixelsPerSecond[this.autoScrollSpeed] || (50 * this.autoScrollSpeed);
        this.scrollSubpixelAccumulator += speedInPxPerSec * delta;

        const intPixels = Math.floor(this.scrollSubpixelAccumulator);
        if (intPixels >= 1) {
          this.scrollSubpixelAccumulator -= intPixels;

          const currentY = window.pageYOffset || document.documentElement.scrollTop || (document.body ? document.body.scrollTop : 0) || 0;
          const maxScroll = Math.max(
            document.documentElement.scrollHeight,
            document.body ? document.body.scrollHeight : 0
          ) - window.innerHeight;

          if (currentY >= maxScroll - 15) {
            this.stopAutoScroll();
            return;
          }

          window.scrollBy({ top: intPixels, left: 0, behavior: 'auto' });

          const newY = window.pageYOffset || document.documentElement.scrollTop || (document.body ? document.body.scrollTop : 0) || 0;
          if (newY === currentY && intPixels > 0 && currentY < maxScroll - 15) {
            document.documentElement.scrollTop = currentY + intPixels;
            if (document.body) {
              document.body.scrollTop = currentY + intPixels;
            }
          }
        }
      }

      this.autoScrollAnimFrame = requestAnimationFrame(scrollStep);
    };

    this.autoScrollAnimFrame = requestAnimationFrame(scrollStep);
  }

  stopAutoScroll(): void {
    this.isAutoScrolling = false;
    this.scrollSubpixelAccumulator = 0;
    if (this.autoScrollAnimFrame !== null) {
      cancelAnimationFrame(this.autoScrollAnimFrame);
      this.autoScrollAnimFrame = null;
    }
    if (typeof document !== 'undefined') {
      document.documentElement.classList.remove('is-autoscrolling');
    }
  }

  cycleAutoScrollSpeed(): void {
    let nextSpeed = this.autoScrollSpeed + 1;
    if (nextSpeed > 4) nextSpeed = 1;
    this.setAutoScrollSpeed(nextSpeed);
  }

  @HostListener('window:touchstart', [])
  onTouchStart(): void {
    this.isUserTouching = true;
  }

  @HostListener('window:touchend', [])
  onTouchEnd(): void {
    this.isUserTouching = false;
    this.lastFrameTime = performance.now();
  }

  @HostListener('window:touchcancel', [])
  onTouchCancel(): void {
    this.isUserTouching = false;
    this.lastFrameTime = performance.now();
  }

  setAutoScrollSpeed(speed: number): void {
    this.autoScrollSpeed = speed;
    localStorage.setItem('truyenkomi_autoscroll_speed', speed.toString());
  }

  toggleSpeedMenu(): void {
    this.showSpeedMenu = !this.showSpeedMenu;
  }

  selectSpeed(speed: number): void {
    this.setAutoScrollSpeed(speed);
    this.showSpeedMenu = false;
  }

  loadSavedZoom(): void {
    const savedZoom = localStorage.getItem('truyenkomi_reader_zoom');
    if (savedZoom !== null) {
      const parsed = parseInt(savedZoom, 10);
      if (!isNaN(parsed) && [500, 700, 900, 1150, 1400, 1800, 0].includes(parsed)) {
        this.zoomWidth = parsed;
      }
    }
  }

  setZoomWidth(width: number): void {
    this.zoomWidth = width;
    localStorage.setItem('truyenkomi_reader_zoom', width.toString());
  }

  toggleZoomMenu(): void {
    this.showZoomMenu = !this.showZoomMenu;
  }

  selectZoomWidth(width: number): void {
    this.setZoomWidth(width);
    this.showZoomMenu = false;
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
    this.showZoomMenu = false;
  }

  getZoomLabel(): string {
    const found = this.zoomLevels.find(l => l.width === this.zoomWidth);
    return found ? found.label : (this.zoomWidth === 0 ? 'Tràn màn' : `${this.zoomWidth}px`);
  }

  getMainStreamStyle(): { [key: string]: string } {
    const isMobile = typeof window !== 'undefined' && window.innerWidth <= 768;
    if (isMobile) {
      return { width: '100%', 'max-width': '100%' };
    }
    // Desktop
    if (this.zoomWidth === 0) {
      return { width: '100%', 'max-width': '100%' };
    }
    return { width: '100%', 'max-width': `${this.zoomWidth}px` };
  }

  @HostListener('document:click', ['$event'])
  onDocumentClick(event: MouseEvent): void {
    const target = event.target as HTMLElement;
    if (!target.closest('.zoom-dropdown-wrap')) {
      this.showZoomMenu = false;
    }
    if (!target.closest('.as-speed-dropdown-wrap')) {
      this.showSpeedMenu = false;
    }
    if (!target.closest('.mode-dropdown-wrap')) {
      this.showModeMenu = false;
    }
    if (!target.closest('.fit-dropdown-wrap')) {
      this.showFitMenu = false;
    }
    if (!target.closest('.autoflip-dropdown-wrap')) {
      this.showAutoFlipMenu = false;
    }
  }

  @HostListener('window:scroll', [])
  onWindowScroll(): void {
    if (this.readingMode === 'flip') return;

    const currentScrollY = window.pageYOffset || window.scrollY || document.documentElement.scrollTop || (document.body ? document.body.scrollTop : 0) || 0;
    this.showScrollTop = currentScrollY > 400;

    const scrollDiff = currentScrollY - this.lastScrollY;

    // Smart Auto-hide logic:
    // 1. At or near very top of page (<= 50px): always show header
    if (currentScrollY <= 50) {
      this.isHeaderHidden = false;
    } 
    // 2. Scrolling DOWN (downward movement > 4px): hide header immediately
    else if (scrollDiff > 4) {
      if (!this.isHeaderHidden) {
        this.isHeaderHidden = true;
        if (this.showMobileSettingsDrawer) {
          this.closeMobileSettingsDrawer();
        }
      }
    } 
    // 3. Scrolling UP (any upward movement < -2px): reveal header immediately!
    else if (scrollDiff < -2) {
      this.isHeaderHidden = false;
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

    // Dynamic sliding window: tự động tải trước 4-5 trang kế tiếp khi cuộn gần tới
    this.checkAndPreloadSlidingPages();

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

    // Toggle reading mode with 'm' or 'M'
    if (event.key === 'm' || event.key === 'M') {
      event.preventDefault();
      this.setReadingMode(this.readingMode === 'vertical' ? 'flip' : 'vertical');
      return;
    }

    if (this.readingMode === 'flip') {
      if (event.key === 'ArrowRight') {
        event.preventDefault();
        if (this.flipDirection === 'ltr') {
          if (this.currentPageIndex === (this.chapter?.pages?.length || 1) - 1 && this.nextChapterId) {
            this.navigateToChapter(this.nextChapterId);
          } else {
            this.nextPage();
          }
        } else {
          if (this.currentPageIndex === 0 && this.prevChapterId) {
            this.navigateToChapter(this.prevChapterId);
          } else {
            this.prevPage();
          }
        }
      } else if (event.key === 'ArrowLeft') {
        event.preventDefault();
        if (this.flipDirection === 'ltr') {
          if (this.currentPageIndex === 0 && this.prevChapterId) {
            this.navigateToChapter(this.prevChapterId);
          } else {
            this.prevPage();
          }
        } else {
          if (this.currentPageIndex === (this.chapter?.pages?.length || 1) - 1 && this.nextChapterId) {
            this.navigateToChapter(this.nextChapterId);
          } else {
            this.nextPage();
          }
        }
      } else if (event.key === 'ArrowUp') {
        event.preventDefault();
        this.isHeaderHidden = false;
        this.scheduleFlipHeaderAutoHide(3500);
      } else if (event.key === 'ArrowDown') {
        event.preventDefault();
        this.isHeaderHidden = true;
        this.clearFlipHeaderAutoHide();
      } else if (event.key === ' ' || event.key === 'PageDown') {
        event.preventDefault();
        this.nextPage();
      } else if (event.key === 'PageUp') {
        event.preventDefault();
        this.prevPage();
      } else if (event.key === 'Home') {
        event.preventDefault();
        this.goToPage(0);
      } else if (event.key === 'End') {
        event.preventDefault();
        if (this.chapter?.pages) this.goToPage(this.chapter.pages.length - 1);
      } else if (event.key === 'd' || event.key === 'D') {
        event.preventDefault();
        this.toggleFlipDirection();
      } else if (event.key === 'a' || event.key === 'A') {
        event.preventDefault();
        this.toggleAutoFlip();
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
        if (this.showMobileSettingsDrawer) {
          this.closeMobileSettingsDrawer();
        } else if (this.showReportModal) {
          this.closeReportModal();
        }
      }
    } else {
      // Vertical mode key navigation
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
        if (this.showMobileSettingsDrawer) {
          this.closeMobileSettingsDrawer();
        } else if (this.showReportModal) {
          this.closeReportModal();
        }
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
    this.closeMobileSettingsDrawer();
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
    const savedPage = localStorage.getItem(`truyenkomi_page_${chapterId}`);
    if (savedPage && this.chapter?.pages && this.chapter.pages.length > 0) {
      const p = parseInt(savedPage, 10);
      if (!isNaN(p) && p >= 0 && p < this.chapter.pages.length) {
        this.currentPageIndex = p;
      } else {
        this.currentPageIndex = 0;
      }
    } else {
      this.currentPageIndex = 0;
    }

    if (this.readingMode === 'flip') {
      window.scrollTo({ top: 0, behavior: 'instant' });
      this.preloadFlipBuffer(this.currentPageIndex);
      this.scheduleFlipHeaderAutoHide(2500);
      return;
    }

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
    // Tải trước 8 trang đầu ngay lập tức với độ ưu tiên cao vào browser cache
    const initialPages = this.chapter.pages.slice(0, 8);
    initialPages.forEach((page, i) => {
      this.preloadedPageIndices.add(i);
      const url = this.getOptimizedPageUrl(page.imageUrl);
      const img = new Image();
      img.referrerPolicy = 'no-referrer';
      if ('fetchPriority' in img) {
        (img as any).fetchPriority = i < 3 ? 'high' : 'auto';
      }
      img.src = url;
    });
  }

  /**
   * Cơ chế cửa sổ trượt: Tự động tải trước 6 trang kế tiếp bám theo vị trí cuộn thực tế của người đọc
   */
  checkAndPreloadSlidingPages(): void {
    if (!this.chapter || !this.chapter.pages || this.chapter.pages.length === 0) return;

    if (this.preloadScrollThrottle) return;
    this.preloadScrollThrottle = setTimeout(() => {
      this.preloadScrollThrottle = null;
      this.performSlidingPreload();
    }, 120);
  }

  private performSlidingPreload(): void {
    if (!this.chapter || !this.chapter.pages) return;
    const windowH = window.innerHeight;

    // Tìm trang đang đọc dựa theo vị trí cuộn
    let currentIdx = 0;
    for (let i = 0; i < this.chapter.pages.length; i++) {
      const el = document.getElementById('page-' + (i + 1));
      if (el) {
        const rect = el.getBoundingClientRect();
        if (rect.top <= windowH * 0.85 && rect.bottom >= 0) {
          currentIdx = i;
        }
      }
    }

    // Tải trước 6 trang tiếp theo vào bộ nhớ đệm
    const bufferCount = 6;
    const end = Math.min(this.chapter.pages.length, currentIdx + bufferCount + 1);
    for (let i = currentIdx + 1; i < end; i++) {
      if (!this.preloadedPageIndices.has(i)) {
        this.preloadedPageIndices.add(i);
        const page = this.chapter.pages[i];
        if (page && page.imageUrl) {
          const img = new Image();
          img.referrerPolicy = 'no-referrer';
          if ('fetchPriority' in img) {
            (img as any).fetchPriority = 'low';
          }
          img.src = this.getOptimizedPageUrl(page.imageUrl);
        }
      }
    }
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

  getOptimizedPageUrl(rawUrl: string): string {
    if (!rawUrl) return '';
    if (this.useDataSaver && rawUrl.includes('uploads.mangadex.org/data/') && !rawUrl.includes('/data-saver/')) {
      return rawUrl.replace('/data/', '/data-saver/');
    } else if (!this.useDataSaver && rawUrl.includes('uploads.mangadex.org/data-saver/')) {
      return rawUrl.replace('/data-saver/', '/data/');
    }
    return rawUrl;
  }

  loadSavedDataSaver(): void {
    const saved = localStorage.getItem('truyenkomi_data_saver');
    this.useDataSaver = saved !== null ? saved === 'true' : true;
  }

  toggleDataSaver(): void {
    this.useDataSaver = !this.useDataSaver;
    localStorage.setItem('truyenkomi_data_saver', String(this.useDataSaver));
    if (this.chapter && this.chapter.pages) {
      this.initPageStates(this.chapter.pages);
      this.prefetchCurrentChapterPages();
    }
  }

  initPageStates(pages: any[]): void {
    this.pageStates = {};
    this.totalFailedCount = 0;
    this.totalLoadedCount = 0;
    this.preloadedPageIndices.clear();
    if (!pages) return;
    pages.forEach((page, index) => {
      this.pageStates[index] = {
        loaded: false,
        error: false,
        retrying: false,
        retryCount: 0,
        url: this.getOptimizedPageUrl(page.imageUrl)
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
    this.reportDescription = `Trang ${index + 1} không tải được ảnh.`;
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

  trackByPageId(index: number, page: any): number {
    return page.id || index;
  }

  trackByChapterId(index: number, ch: any): number {
    return ch.id;
  }
}

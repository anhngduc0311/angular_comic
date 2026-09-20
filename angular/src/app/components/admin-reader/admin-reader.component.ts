import { Component, OnInit, OnDestroy, HostListener } from '@angular/core';
import { CommonModule } from '@angular/common';
import { FormsModule } from '@angular/forms';
import { ActivatedRoute, Router, RouterModule } from '@angular/router';
import { ComicService } from '../../services/comic.service';
import { Comic, ComicDetail, ChapterDetail, ChapterPage } from '../../models/comic.model';
import JSZip from 'jszip';

@Component({
  selector: 'app-admin-reader',
  standalone: true,
  imports: [CommonModule, FormsModule, RouterModule],
  templateUrl: './admin-reader.component.html',
  styleUrls: ['./admin-reader.component.scss']
})
export class AdminReaderComponent implements OnInit, OnDestroy {
  // Comic and Chapter Data
  allComics: Comic[] = [];
  filteredComics: Comic[] = [];
  comicSearchQuery: string = '';
  selectedComicId: number = 0;
  selectedComic: Comic | ComicDetail | null = null;

  chapters: ChapterDetail[] = [];
  currentChapterId: number = 0;
  currentChapter: ChapterDetail | null = null;
  chapterPages: string[] = []; // Current list of page URLs (editable)

  prevChapterId: number | null = null;
  nextChapterId: number | null = null;

  // UI & Loading States
  isLoadingComics: boolean = false;
  isLoadingChapter: boolean = false;
  message: string = '';
  isError: boolean = false;

  // Reading Modes
  readingMode: 'vertical' | 'flip' = 'vertical'; // 'vertical' = webtoon, 'flip' = manga page by page
  currentPageIndex: number = 0;
  flipDirection: 'ltr' | 'rtl' = 'ltr';
  zoomWidth: number = 900; // 0 = 100% / fit container, or pixel width
  isFullscreen: boolean = false;
  isZenMode: boolean = false; // Hide top bar for immersive reading

  // Admin Panels / Drawers
  showComicSelectorModal: boolean = false;
  showPageManagerDrawer: boolean = false;
  showCoverModal: boolean = false;

  // Upload States (Cloudflare R2)
  isUploadingPages: boolean = false;
  pageUploadProgressText: string = '';
  isUploadingCover: boolean = false;
  coverUploadProgressText: string = '';
  isUnzipping: boolean = false;
  unzipProgressText: string = '';
  isSavingChapter: boolean = false;
  isTogglingVisibility: boolean = false;

  // Cover image preview / edit
  coverInputUrl: string = '';

  // Preset zoom levels
  zoomOptions = [
    { label: 'Vừa màn', width: 0 },
    { label: '50%', width: 500 },
    { label: '75%', width: 700 },
    { label: '100%', width: 900 },
    { label: '125%', width: 1100 },
    { label: '150%', width: 1300 },
    { label: '180%', width: 1600 }
  ];

  private onFullscreenChange = () => {
    this.isFullscreen = !!document.fullscreenElement;
  };

  constructor(
    private comicService: ComicService,
    private route: ActivatedRoute,
    private router: Router
  ) {}

  ngOnInit(): void {
    document.addEventListener('fullscreenchange', this.onFullscreenChange);
    this.loadComics();

    this.route.params.subscribe(params => {
      const comicIdParam = params['comicId'] ? parseInt(params['comicId'], 10) : 0;
      const chapterIdParam = params['chapterId'] ? parseInt(params['chapterId'], 10) : 0;

      if (comicIdParam && comicIdParam !== this.selectedComicId) {
        this.selectedComicId = comicIdParam;
        this.loadComicAndChapters(comicIdParam, chapterIdParam);
      } else if (chapterIdParam && chapterIdParam !== this.currentChapterId) {
        this.loadChapter(chapterIdParam);
      }
    });
  }

  ngOnDestroy(): void {
    document.removeEventListener('fullscreenchange', this.onFullscreenChange);
  }

  // --- KEYBOARD SHORTCUTS ---
  @HostListener('window:keydown', ['$event'])
  handleKeyboardEvent(event: KeyboardEvent): void {
    // Avoid triggering if inside an input or textarea
    const target = event.target as HTMLElement;
    if (target && (target.tagName === 'INPUT' || target.tagName === 'TEXTAREA' || target.isContentEditable)) {
      return;
    }

    if (this.readingMode === 'flip') {
      if (event.key === 'ArrowRight' || event.key === 'PageDown') {
        event.preventDefault();
        this.nextPage();
      } else if (event.key === 'ArrowLeft' || event.key === 'PageUp') {
        event.preventDefault();
        this.prevPage();
      }
    } else {
      // In vertical mode, arrow left/right switches chapters
      if (event.key === 'ArrowLeft' && this.prevChapterId) {
        event.preventDefault();
        this.navigateToChapter(this.prevChapterId);
      } else if (event.key === 'ArrowRight' && this.nextChapterId) {
        event.preventDefault();
        this.navigateToChapter(this.nextChapterId);
      }
    }

    // Toggle Zen Mode with 'Z'
    if (event.key === 'z' || event.key === 'Z') {
      this.toggleZenMode();
    }

    // Toggle Fullscreen with 'F'
    if (event.key === 'f' || event.key === 'F') {
      this.toggleFullscreen();
    }
  }

  // --- LOAD COMICS ---
  loadComics(): void {
    this.isLoadingComics = true;
    this.comicService.getAdminComics().subscribe({
      next: (data) => {
        this.allComics = data || [];
        this.filteredComics = [...this.allComics];
        this.isLoadingComics = false;

        // If no comic is currently selected from route, auto-select the first one
        if (!this.selectedComicId && this.allComics.length > 0) {
          const firstComic = this.allComics[0];
          this.selectComic(firstComic.id);
        }
      },
      error: (err) => {
        console.error('Lỗi tải danh sách truyện admin:', err);
        this.showMessage('Không thể tải danh sách truyện.', true);
        this.isLoadingComics = false;
      }
    });
  }

  filterComics(): void {
    if (!this.comicSearchQuery.trim()) {
      this.filteredComics = [...this.allComics];
      return;
    }
    const q = this.comicSearchQuery.toLowerCase().trim();
    this.filteredComics = this.allComics.filter(c =>
      c.title.toLowerCase().includes(q) ||
      (c.author && c.author.toLowerCase().includes(q)) ||
      c.id.toString() === q
    );
  }

  // --- SELECT COMIC ---
  selectComic(comicId: number, targetChapterId: number = 0): void {
    this.selectedComicId = comicId;
    this.showComicSelectorModal = false;
    this.loadComicAndChapters(comicId, targetChapterId);
  }

  loadComicAndChapters(comicId: number, targetChapterId: number = 0): void {
    this.isLoadingChapter = true;

    // 1. Fetch comic detail
    this.comicService.getComicById(comicId).subscribe({
      next: (comic) => {
        this.selectedComic = comic;
        this.coverInputUrl = comic.coverImage || '';

        // 2. Fetch all chapters for this comic (including unpublished ones)
        this.comicService.getAdminChaptersByComicId(comicId).subscribe({
          next: (chaps) => {
            // Sort ascending by chapterNumber so navigation is natural
            this.chapters = (chaps || []).sort((a, b) => a.chapterNumber - b.chapterNumber);

            if (this.chapters.length > 0) {
              // If targetChapterId specified and exists, load it
              const target = this.chapters.find(c => c.id === targetChapterId);
              const chapterToLoad = target || this.chapters[0];
              this.loadChapter(chapterToLoad.id);
            } else {
              this.currentChapter = null;
              this.currentChapterId = 0;
              this.chapterPages = [];
              this.isLoadingChapter = false;
            }
          },
          error: (err) => {
            console.error('Lỗi tải danh sách chapter:', err);
            this.showMessage('Không thể tải danh sách chapter của bộ truyện.', true);
            this.isLoadingChapter = false;
          }
        });
      },
      error: (err) => {
        console.error('Lỗi tải thông tin bộ truyện:', err);
        this.showMessage('Không tìm thấy thông tin bộ truyện.', true);
        this.isLoadingChapter = false;
      }
    });
  }

  // --- LOAD SPECIFIC CHAPTER ---
  loadChapter(chapterId: number): void {
    this.currentChapterId = chapterId;
    this.isLoadingChapter = true;
    this.currentPageIndex = 0;

    this.comicService.getChapterById(chapterId).subscribe({
      next: (chap) => {
        this.currentChapter = chap;
        this.chapterPages = (chap.pages && chap.pages.length > 0)
          ? chap.pages.sort((a: ChapterPage, b: ChapterPage) => a.pageNumber - b.pageNumber).map((p: ChapterPage) => p.imageUrl)
          : [];

        this.calculatePrevNextChapter();
        this.isLoadingChapter = false;

        // Scroll reader container to top
        window.scrollTo({ top: 0, behavior: 'smooth' });
      },
      error: (err) => {
        console.error('Lỗi tải chapter:', err);
        this.showMessage('Không thể tải nội dung chapter này.', true);
        this.isLoadingChapter = false;
      }
    });
  }

  calculatePrevNextChapter(): void {
    if (!this.chapters || this.chapters.length === 0 || !this.currentChapter) {
      this.prevChapterId = null;
      this.nextChapterId = null;
      return;
    }

    const currentIndex = this.chapters.findIndex(c => c.id === this.currentChapterId);
    if (currentIndex > 0) {
      this.prevChapterId = this.chapters[currentIndex - 1].id;
    } else {
      this.prevChapterId = null;
    }

    if (currentIndex >= 0 && currentIndex < this.chapters.length - 1) {
      this.nextChapterId = this.chapters[currentIndex + 1].id;
    } else {
      this.nextChapterId = null;
    }
  }

  navigateToChapter(chapterId: number): void {
    if (!chapterId) return;
    this.loadChapter(chapterId);
  }

  // --- CHAPTER VISIBILITY TOGGLE ---
  toggleChapterVisibility(): void {
    if (!this.currentChapter) return;
    this.isTogglingVisibility = true;

    this.comicService.toggleChapterVisibility(this.currentChapter.id).subscribe({
      next: (res) => {
        this.isTogglingVisibility = false;
        if (this.currentChapter) {
          this.currentChapter.isPublic = res.isPublic;
        }
        // Also update in chapters list
        const found = this.chapters.find(c => c.id === this.currentChapterId);
        if (found) {
          found.isPublic = res.isPublic;
        }
        this.showMessage(res.isPublic ? 'Chapter đã được CÔNG KHAI cho độc giả!' : 'Chapter đã được CHUYỂN VỀ TRẠNG THÁI ẨN!');
      },
      error: (err) => {
        this.isTogglingVisibility = false;
        console.error('Lỗi toggle visibility:', err);
        this.showMessage('Không thể cập nhật trạng thái hiển thị của chapter.', true);
      }
    });
  }

  // --- CLOUDFLARE R2: UPLOAD COVER IMAGE ---
  openCoverModal(): void {
    if (!this.selectedComic) return;
    this.coverInputUrl = this.selectedComic.coverImage || '';
    this.showCoverModal = true;
  }

  closeCoverModal(): void {
    this.showCoverModal = false;
  }

  onCoverFileSelected(event: Event): void {
    const input = event.target as HTMLInputElement;
    if (!input.files || input.files.length === 0) return;

    const file = input.files[0];
    this.isUploadingCover = true;
    this.coverUploadProgressText = `Đang tải ${file.name} lên Cloudflare R2 bucket...`;

    const comicSlug = this.selectedComic?.slug || this.selectedComic?.title;
    this.comicService.uploadImage(file, 'covers', comicSlug).subscribe({
      next: (res) => {
        this.isUploadingCover = false;
        if (res && res.url) {
          this.coverInputUrl = res.url;
          this.applyNewCoverImage(res.url);
          this.showMessage('Đã tải ảnh bìa lên Cloudflare R2 thành công!');
        }
      },
      error: (err) => {
        this.isUploadingCover = false;
        console.error('Lỗi upload cover lên Cloudflare R2:', err);
        this.showMessage('Upload ảnh bìa thất bại. Vui lòng kiểm tra lại cấu hình Cloudflare R2.', true);
      }
    });

    input.value = '';
  }

  applyNewCoverImage(newUrl: string): void {
    if (!this.selectedComic || !this.selectedComicId) return;

    const updatedData: any = {
      ...this.selectedComic,
      coverImage: newUrl.trim()
    };

    this.comicService.updateComic(this.selectedComicId, updatedData).subscribe({
      next: () => {
        if (this.selectedComic) {
          this.selectedComic.coverImage = newUrl.trim();
        }
        // Also update in allComics list
        const comicInList = this.allComics.find(c => c.id === this.selectedComicId);
        if (comicInList) {
          comicInList.coverImage = newUrl.trim();
        }
        this.showMessage('Ảnh bìa đã được cập nhật thành công vào truyện!');
        this.showCoverModal = false;
      },
      error: (err) => {
        console.error('Lỗi lưu ảnh bìa vào truyện:', err);
        this.showMessage('Upload thành công nhưng lưu vào truyện thất bại.', true);
      }
    });
  }

  // --- CLOUDFLARE R2: UPLOAD CHAPTER PAGES ---
  onPageFilesSelected(event: Event): void {
    const input = event.target as HTMLInputElement;
    if (!input.files || input.files.length === 0) return;

    const files = Array.from(input.files);
    this.isUploadingPages = true;
    this.pageUploadProgressText = `Đang tải ${files.length} trang ảnh lên Cloudflare R2 bucket...`;

    const comicSlug = this.selectedComic?.slug || this.selectedComic?.title;
    this.comicService.uploadImages(files, 'chapters', comicSlug, this.currentChapter?.chapterNumber).subscribe({
      next: (res) => {
        this.isUploadingPages = false;
        if (res && res.urls && res.urls.length > 0) {
          this.chapterPages.push(...res.urls);
          this.showMessage(`Đã tải thành công ${res.urls.length} ảnh lên Cloudflare R2! Nhớ bấm 'Lưu Chapter' để cập nhật.`);
        }
      },
      error: (err) => {
        this.isUploadingPages = false;
        console.error('Lỗi upload pages lên Cloudflare R2:', err);
        this.showMessage('Upload ảnh chapter lên Cloudflare R2 thất bại. Vui lòng thử lại.', true);
      }
    });

    input.value = '';
  }

  // --- CLOUDFLARE R2: ZIP UPLOAD ---
  async onZipFileSelected(event: Event): Promise<void> {
    const input = event.target as HTMLInputElement;
    if (!input.files || input.files.length === 0) return;

    const file = input.files[0];
    this.isUnzipping = true;
    this.unzipProgressText = `Đang đọc file zip ${file.name}...`;

    try {
      const zip = new JSZip();
      const zipContent = await zip.loadAsync(file);

      // Extract image files
      const imageFiles: { name: string; file: File }[] = [];
      const validExtensions = ['.jpg', '.jpeg', '.png', '.webp', '.avif', '.gif'];

      const entries = Object.keys(zipContent.files).sort((a, b) => {
        // Natural sort (page 1, 2, ... 10)
        return a.localeCompare(b, undefined, { numeric: true, sensitivity: 'base' });
      });

      for (const filename of entries) {
        const zipEntry = zipContent.files[filename];
        if (zipEntry.dir) continue;

        const lowerName = filename.toLowerCase();
        const hasValidExt = validExtensions.some(ext => lowerName.endsWith(ext));
        if (!hasValidExt) continue;

        const blob = await zipEntry.async('blob');
        const imgFile = new File([blob], filename, { type: blob.type || 'image/jpeg' });
        imageFiles.push({ name: filename, file: imgFile });
      }

      if (imageFiles.length === 0) {
        this.isUnzipping = false;
        this.showMessage('Không tìm thấy file ảnh hợp lệ nào trong file ZIP.', true);
        return;
      }

      this.isUnzipping = false;
      this.isUploadingPages = true;
      this.pageUploadProgressText = `Đã giải nén ${imageFiles.length} ảnh. Đang tải lên Cloudflare R2...`;

      const filesToUpload = imageFiles.map(item => item.file);
      const comicSlug = this.selectedComic?.slug || this.selectedComic?.title;
      this.comicService.uploadImages(filesToUpload, 'chapters', comicSlug, this.currentChapter?.chapterNumber).subscribe({
        next: (res) => {
          this.isUploadingPages = false;
          if (res && res.urls && res.urls.length > 0) {
            this.chapterPages.push(...res.urls);
            this.showMessage(`Đã tải lên thành công ${res.urls.length} ảnh từ file ZIP lên Cloudflare R2! Nhớ bấm 'Lưu Chapter'.`);
          }
        },
        error: (err) => {
          this.isUploadingPages = false;
          console.error('Lỗi upload file zip lên Cloudflare R2:', err);
          this.showMessage('Lỗi tải các ảnh từ file ZIP lên Cloudflare R2.', true);
        }
      });
    } catch (ex: any) {
      this.isUnzipping = false;
      console.error('Lỗi đọc file zip:', ex);
      this.showMessage('Lỗi giải nén file ZIP: ' + (ex.message || ''), true);
    }

    input.value = '';
  }

  // --- PAGE REORDERING & MANAGEMENT ---
  movePageUp(index: number): void {
    if (index <= 0) return;
    const temp = this.chapterPages[index];
    this.chapterPages[index] = this.chapterPages[index - 1];
    this.chapterPages[index - 1] = temp;
  }

  movePageDown(index: number): void {
    if (index >= this.chapterPages.length - 1) return;
    const temp = this.chapterPages[index];
    this.chapterPages[index] = this.chapterPages[index + 1];
    this.chapterPages[index + 1] = temp;
  }

  removePage(index: number): void {
    if (confirm(`Bạn có chắc chắn muốn xóa trang số ${index + 1}?`)) {
      this.chapterPages.splice(index, 1);
    }
  }

  // --- SAVE CHAPTER PAGES TO DATABASE ---
  saveChapterPages(): void {
    if (!this.currentChapter) return;
    this.isSavingChapter = true;

    const updatePayload = {
      title: this.currentChapter.title,
      chapterNumber: this.currentChapter.chapterNumber,
      isPublic: this.currentChapter.isPublic !== false,
      imageUrls: this.chapterPages
    };

    this.comicService.updateChapter(this.currentChapter.id, updatePayload).subscribe({
      next: (updated) => {
        this.isSavingChapter = false;
        this.currentChapter = updated;
        if (updated.pages) {
          this.chapterPages = updated.pages.sort((a: ChapterPage, b: ChapterPage) => a.pageNumber - b.pageNumber).map((p: ChapterPage) => p.imageUrl);
        }
        this.showMessage('Đã lưu các thay đổi của chapter vào hệ thống!');
        this.showPageManagerDrawer = false;
      },
      error: (err) => {
        this.isSavingChapter = false;
        console.error('Lỗi lưu chapter:', err);
        this.showMessage('Lưu chapter thất bại. Vui lòng thử lại.', true);
      }
    });
  }

  // --- READING CONTROLS ---
  setReadingMode(mode: 'vertical' | 'flip'): void {
    this.readingMode = mode;
    this.currentPageIndex = 0;
  }

  prevPage(): void {
    if (this.currentPageIndex > 0) {
      this.currentPageIndex--;
    } else if (this.prevChapterId) {
      this.navigateToChapter(this.prevChapterId);
    }
  }

  nextPage(): void {
    if (this.currentPageIndex < this.chapterPages.length - 1) {
      this.currentPageIndex++;
    } else if (this.nextChapterId) {
      this.navigateToChapter(this.nextChapterId);
    }
  }

  goToPage(index: number): void {
    if (index >= 0 && index < this.chapterPages.length) {
      this.currentPageIndex = index;
    }
  }

  setZoom(width: number): void {
    this.zoomWidth = width;
  }

  toggleZenMode(): void {
    this.isZenMode = !this.isZenMode;
  }

  toggleFullscreen(): void {
    if (!document.fullscreenElement) {
      document.documentElement.requestFullscreen().catch(err => {
        console.warn('Lỗi bật toàn màn hình:', err);
      });
    } else {
      if (document.exitFullscreen) {
        document.exitFullscreen().catch(err => {
          console.warn('Lỗi thoát toàn màn hình:', err);
        });
      }
    }
  }

  showMessage(msg: string, isErr = false): void {
    this.message = msg;
    this.isError = isErr;
    setTimeout(() => {
      this.message = '';
    }, 4500);
  }
}

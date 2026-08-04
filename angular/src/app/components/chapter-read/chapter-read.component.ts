import { Component, OnInit, HostListener } from '@angular/core';
import { CommonModule } from '@angular/common';
import { RouterModule, ActivatedRoute, Router } from '@angular/router';
import { FormsModule } from '@angular/forms';
import { ComicService } from '../../services/comic.service';
import { UserService } from '../../services/user.service';
import { AuthService } from '../../services/auth.service';
import { ReportService } from '../../services/report.service';
import { ChapterDetail } from '../../models/comic.model';
import { ERROR_TYPE_OPTIONS } from '../../models/report.model';

@Component({
  selector: 'app-chapter-read',
  standalone: true,
  imports: [CommonModule, RouterModule, FormsModule],
  templateUrl: './chapter-read.component.html',
  styleUrls: ['./chapter-read.component.scss']
})
export class ChapterReadComponent implements OnInit {
  chapter: ChapterDetail | null = null;
  selectedChapterId: number = 0;
  prevChapterId: number | null = null;
  nextChapterId: number | null = null;
  isLoading: boolean = true;
  showScrollTop: boolean = false;

  // Report Modal States
  showReportModal: boolean = false;
  selectedReportErrorType: string = 'IMAGE_FAILED';
  reportDescription: string = '';
  reporterName: string = '';
  isSubmittingReport: boolean = false;
  reportSuccessMessage: string = '';
  reportErrorMessage: string = '';
  errorTypeOptions = ERROR_TYPE_OPTIONS;

  constructor(
    private route: ActivatedRoute,
    private router: Router,
    private comicService: ComicService,
    private userService: UserService,
    public authService: AuthService,
    private reportService: ReportService
  ) {}

  ngOnInit(): void {
    this.route.params.subscribe(params => {
      const id = +params['id'];
      if (id) this.fetchChapter(id);
    });
  }

  @HostListener('window:scroll', [])
  onWindowScroll(): void {
    this.showScrollTop = window.scrollY > 400;
  }

  @HostListener('window:keydown', ['$event'])
  handleKeyboardEvent(event: KeyboardEvent): void {
    if (event.key === 'ArrowLeft' && this.prevChapterId) {
      this.router.navigate(['/read', this.prevChapterId]);
    } else if (event.key === 'ArrowRight' && this.nextChapterId) {
      this.router.navigate(['/read', this.nextChapterId]);
    }
  }

  fetchChapter(id: number): void {
    this.isLoading = true;
    this.comicService.getChapterById(id).subscribe({
      next: (detail) => {
        if (!detail) {
          this.router.navigate(['/comic-unavailable']);
          return;
        }
        this.chapter = detail;
        this.selectedChapterId = detail.id;
        this.isLoading = false;
        this.calculateNavChapters();
        this.trackHistory();
        window.scrollTo({ top: 0, behavior: 'smooth' });
      },
      error: () => {
        this.isLoading = false;
        this.router.navigate(['/comic-unavailable']);
      }
    });
  }

  calculateNavChapters(): void {
    if (!this.chapter) return;
    const sorted = [...this.chapter.allChapters].sort((a, b) => a.chapterNumber - b.chapterNumber);
    const currentIndex = sorted.findIndex(ch => ch.id === this.chapter?.id);

    this.prevChapterId = currentIndex > 0 ? sorted[currentIndex - 1].id : null;
    this.nextChapterId = currentIndex < sorted.length - 1 ? sorted[currentIndex + 1].id : null;
  }

  onSelectChapter(): void {
    if (this.selectedChapterId) {
      this.router.navigate(['/read', this.selectedChapterId]);
    }
  }

  scrollToTop(): void {
    window.scrollTo({ top: 0, behavior: 'smooth' });
  }

  trackHistory(): void {
    if (this.authService.isLoggedIn && this.chapter) {
      this.userService.trackHistory(this.chapter.comicId, this.chapter.id).subscribe();
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

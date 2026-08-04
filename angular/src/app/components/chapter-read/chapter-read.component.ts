import { Component, OnInit, HostListener } from '@angular/core';
import { CommonModule } from '@angular/common';
import { RouterModule, ActivatedRoute, Router } from '@angular/router';
import { FormsModule } from '@angular/forms';
import { ComicService } from '../../services/comic.service';
import { UserService } from '../../services/user.service';
import { AuthService } from '../../services/auth.service';
import { ChapterDetail } from '../../models/comic.model';

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

  constructor(
    private route: ActivatedRoute,
    private router: Router,
    private comicService: ComicService,
    private userService: UserService,
    private authService: AuthService
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
        this.chapter = detail;
        this.selectedChapterId = detail.id;
        this.isLoading = false;
        this.calculateNavChapters();
        this.trackHistory();
        window.scrollTo({ top: 0, behavior: 'smooth' });
      },
      error: () => (this.isLoading = false)
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
}

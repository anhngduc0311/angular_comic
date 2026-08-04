import { Component, OnInit } from '@angular/core';
import { CommonModule } from '@angular/common';
import { RouterModule, ActivatedRoute, Router } from '@angular/router';
import { FormsModule } from '@angular/forms';
import { ComicService } from '../../services/comic.service';
import { UserService } from '../../services/user.service';
import { AuthService } from '../../services/auth.service';
import { ComicDetail } from '../../models/comic.model';

@Component({
  selector: 'app-comic-detail',
  standalone: true,
  imports: [CommonModule, RouterModule, FormsModule],
  templateUrl: './comic-detail.component.html',
  styleUrls: ['./comic-detail.component.scss']
})
export class ComicDetailComponent implements OnInit {
  comic: ComicDetail | null = null;
  isBookmarked: boolean = false;
  commentContent: string = '';
  isLoading: boolean = true;

  constructor(
    private route: ActivatedRoute,
    private comicService: ComicService,
    private userService: UserService,
    public authService: AuthService,
    private router: Router
  ) {}

  ngOnInit(): void {
    this.route.params.subscribe(params => {
      const slug = params['slug'];
      if (slug) this.fetchComic(slug);
    });
  }

  fetchComic(slug: string): void {
    this.isLoading = true;
    this.comicService.getComicBySlug(slug).subscribe({
      next: (detail) => {
        if (!detail) {
          this.router.navigate(['/404']);
          return;
        }
        this.comic = detail;
        this.isLoading = false;
        this.checkBookmarkStatus();
      },
      error: () => {
        this.isLoading = false;
        this.router.navigate(['/404']);
      }
    });
  }

  get firstChapterId(): number | null {
    return (this.comic && this.comic.chapters.length > 0) ? this.comic.chapters[0].id : null;
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

  checkBookmarkStatus(): void {
    if (this.authService.isLoggedIn && this.comic) {
      this.userService.getBookmarks().subscribe(bookmarks => {
        this.isBookmarked = bookmarks.some(b => b.comicId === this.comic?.id);
      });
    }
  }

  toggleBookmark(): void {
    if (!this.authService.isLoggedIn) {
      this.router.navigate(['/auth']);
      return;
    }

    if (!this.comic) return;

    if (this.isBookmarked) {
      this.userService.removeBookmark(this.comic.id).subscribe(() => {
        this.isBookmarked = false;
      });
    } else {
      this.userService.addBookmark(this.comic.id).subscribe(() => {
        this.isBookmarked = true;
      });
    }
  }

  submitComment(): void {
    if (!this.authService.isLoggedIn) {
      this.router.navigate(['/auth']);
      return;
    }

    if (!this.commentContent.trim() || !this.comic) return;

    this.comicService.addComment({
      comicId: this.comic.id,
      content: this.commentContent.trim()
    }).subscribe(comment => {
      this.comic?.comments.unshift(comment);
      this.commentContent = '';
    });
  }
}

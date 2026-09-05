import { Component, OnInit } from '@angular/core';
import { CommonModule } from '@angular/common';
import { RouterModule, ActivatedRoute, Router } from '@angular/router';
import { FormsModule } from '@angular/forms';
import { ComicService } from '../../services/comic.service';
import { UserService } from '../../services/user.service';
import { AuthService } from '../../services/auth.service';
import { SeoService } from '../../services/seo.service';
import { ComicDetail, Chapter } from '../../models/comic.model';

@Component({
  selector: 'app-comic-detail',
  standalone: true,
  imports: [CommonModule, RouterModule, FormsModule],
  templateUrl: './comic-detail.component.html',
  styleUrls: ['./comic-detail.component.scss']
})
export class ComicDetailComponent implements OnInit {
  Math = Math;
  comic: ComicDetail | null = null;
  isBookmarked: boolean = false;
  isLiked: boolean = false;
  likesCount: number = 524;
  commentContent: string = '';
  isLoading: boolean = true;
  visibleCommentsCount: number = 10;
  skeletonChapters: number[] = Array(8).fill(0);

  chapterSearchQuery: string = '';
  sortOrder: 'desc' | 'asc' = 'desc';

  get visibleComments(): any[] {
    if (!this.comic || !this.comic.comments) return [];
    return this.comic.comments.slice(0, this.visibleCommentsCount);
  }

  loadMoreComments(): void {
    this.visibleCommentsCount += 10;
  }

  constructor(
    private route: ActivatedRoute,
    private comicService: ComicService,
    private userService: UserService,
    public authService: AuthService,
    private seoService: SeoService,
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
        this.likesCount = Math.floor((detail.views || 1000) * 0.05) || 524;
        this.isLoading = false;
        this.seoService.setComicDetailSeo(detail);
        this.checkBookmarkStatus();
      },
      error: () => {
        this.isLoading = false;
        this.router.navigate(['/404']);
      }
    });
  }

  get filteredChapters(): Chapter[] {
    if (!this.comic || !this.comic.chapters) return [];
    let list = [...this.comic.chapters];

    if (this.chapterSearchQuery.trim()) {
      const q = this.chapterSearchQuery.trim().toLowerCase();
      list = list.filter(ch => 
        ch.chapterNumber.toString().includes(q) || 
        (ch.title && ch.title.toLowerCase().includes(q))
      );
    }

    if (this.sortOrder === 'desc') {
      list.sort((a, b) => b.chapterNumber - a.chapterNumber);
    } else {
      list.sort((a, b) => a.chapterNumber - b.chapterNumber);
    }

    return list;
  }

  toggleSort(): void {
    this.sortOrder = this.sortOrder === 'desc' ? 'asc' : 'desc';
  }

  get firstChapterNumber(): number | null {
    if (!this.comic || !this.comic.chapters || this.comic.chapters.length === 0) return null;
    return this.comic.chapters[0].chapterNumber;
  }

  get latestChapterNumber(): number | null {
    if (!this.comic || !this.comic.chapters || this.comic.chapters.length === 0) return null;
    return this.comic.chapters[this.comic.chapters.length - 1].chapterNumber;
  }

  formatViews(views: number): string {
    if (views >= 1_000_000) {
      return (views / 1_000_000).toFixed(1) + 'M';
    }
    if (views >= 1_000) {
      return (views / 1_000).toFixed(0) + 'k';
    }
    return (views || 0).toLocaleString('vi-VN');
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

  toggleLike(): void {
    this.isLiked = !this.isLiked;
    this.likesCount += this.isLiked ? 1 : -1;
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

  onImgError(event: Event): void {
    const target = event.target as HTMLImageElement;
    if (target) {
      target.src = 'https://images.unsplash.com/photo-1607604276583-eef5d076aa5f?auto=format&fit=crop&w=200&q=80';
    }
  }
}

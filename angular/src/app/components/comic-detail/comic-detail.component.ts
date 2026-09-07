import { Component, OnInit } from '@angular/core';
import { CommonModule } from '@angular/common';
import { RouterModule, ActivatedRoute, Router } from '@angular/router';
import { FormsModule } from '@angular/forms';
import { ComicService } from '../../services/comic.service';
import { UserService } from '../../services/user.service';
import { AuthService } from '../../services/auth.service';
import { SeoService } from '../../services/seo.service';
import { ComicDetail, Chapter, ComicRatingSummary, ComicReview } from '../../models/comic.model';

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
  comments: any[] = [];
  commentsPage: number = 1;
  commentsPageSize: number = 10;
  totalComments: number = 0;
  hasMoreComments: boolean = false;
  isLoadingComments: boolean = false;
  skeletonChapters: number[] = Array(8).fill(0);

  // 5-Star Rating & Reviews State
  ratingSummary: ComicRatingSummary | null = null;
  userRatingScore: number = 5;
  userHoverScore: number = 0;
  userReviewText: string = '';
  isSubmittingRating: boolean = false;
  ratingSuccessMsg: string = '';
  reviews: ComicReview[] = [];
  reviewsPage: number = 1;
  totalReviews: number = 0;
  isLoadingReviews: boolean = false;

  chapterSearchQuery: string = '';
  sortOrder: 'desc' | 'asc' = 'desc';

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
      if (slug) {
        window.scrollTo({ top: 0, left: 0, behavior: 'instant' });
        this.fetchComic(slug);
      }
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
        this.loadComments(true);
        this.loadRatingSummary(detail.id);
        this.loadReviews(detail.id, 1);
      },
      error: () => {
        this.isLoading = false;
        this.router.navigate(['/404']);
      }
    });
  }

  loadComments(reset = false): void {
    if (!this.comic) return;
    if (reset) {
      this.commentsPage = 1;
      this.comments = [];
    }
    this.isLoadingComments = true;
    this.comicService.getComicComments(this.comic.id, this.commentsPage, this.commentsPageSize).subscribe({
      next: (res) => {
        if (reset) {
          this.comments = res.items || [];
        } else {
          this.comments = [...this.comments, ...(res.items || [])];
        }
        this.totalComments = res.totalCount;
        this.hasMoreComments = this.comments.length < res.totalCount;
        this.isLoadingComments = false;
      },
      error: () => {
        this.isLoadingComments = false;
      }
    });
  }

  loadMoreComments(): void {
    if (this.isLoadingComments || !this.hasMoreComments) return;
    this.commentsPage++;
    this.loadComments(false);
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
      this.comments.unshift(comment);
      this.totalComments++;
      this.commentContent = '';
    });
  }

  onImgError(event: Event): void {
    const target = event.target as HTMLImageElement;
    if (target) {
      target.src = 'https://images.unsplash.com/photo-1607604276583-eef5d076aa5f?auto=format&fit=crop&w=200&q=80';
    }
  }

  onAvatarError(event: Event): void {
    const target = event.target as HTMLImageElement;
    if (target && target.src !== 'assets/default-avatar.svg') {
      target.src = 'assets/default-avatar.svg';
    }
  }

  // ==================== 5-STAR RATING & REVIEWS ====================
  loadRatingSummary(comicId: number): void {
    this.comicService.getRatingSummary(comicId).subscribe({
      next: (summary) => {
        this.ratingSummary = summary;
        if (summary.currentUserReview) {
          this.userRatingScore = summary.currentUserReview.score;
          this.userReviewText = summary.currentUserReview.review || '';
        }
      }
    });
  }

  loadReviews(comicId: number, page: number = 1): void {
    this.isLoadingReviews = true;
    this.comicService.getComicReviews(comicId, page, 6).subscribe({
      next: (res) => {
        this.reviews = res.items || [];
        this.totalReviews = res.totalCount;
        this.reviewsPage = res.page;
        this.isLoadingReviews = false;
      },
      error: () => {
        this.isLoadingReviews = false;
      }
    });
  }

  setUserRatingScore(score: number): void {
    this.userRatingScore = score;
  }

  setUserHoverScore(score: number): void {
    this.userHoverScore = score;
  }

  get activeStars(): number {
    return this.userHoverScore > 0 ? this.userHoverScore : this.userRatingScore;
  }

  submitRating(): void {
    if (!this.comic || this.isSubmittingRating) return;
    if (!this.authService.isLoggedIn) {
      this.router.navigate(['/auth']);
      return;
    }

    this.isSubmittingRating = true;
    this.comicService.submitRating(this.comic.id, this.userRatingScore, this.userReviewText).subscribe({
      next: (summary) => {
        this.ratingSummary = summary;
        this.isSubmittingRating = false;
        this.ratingSuccessMsg = 'Cảm ơn bạn đã đánh giá truyện (+10 EXP)!';
        if (this.comic) {
          this.comic.rating = summary.averageScore;
          this.comic.ratingCount = summary.totalRatings;
        }
        this.loadReviews(this.comic!.id, 1);
        setTimeout(() => {
          this.ratingSuccessMsg = '';
        }, 4000);
      },
      error: () => {
        this.isSubmittingRating = false;
      }
    });
  }

  getRatingPercent(count: number): number {
    if (!this.ratingSummary || this.ratingSummary.totalRatings === 0) return 0;
    return Math.round((count / this.ratingSummary.totalRatings) * 100);
  }
}

import { Component, OnInit } from '@angular/core';
import { CommonModule } from '@angular/common';
import { RouterModule } from '@angular/router';
import { UserService } from '../../services/user.service';
import { Bookmark } from '../../models/user.model';

@Component({
  selector: 'app-followed',
  standalone: true,
  imports: [CommonModule, RouterModule],
  templateUrl: './followed.component.html',
  styleUrls: ['./followed.component.scss']
})
export class FollowedComponent implements OnInit {
  bookmarks: Bookmark[] = [];
  isLoading: boolean = true;

  constructor(private userService: UserService) {}

  ngOnInit(): void {
    this.fetchBookmarks();
  }

  fetchBookmarks(): void {
    this.isLoading = true;
    this.userService.getBookmarks().subscribe({
      next: (data) => {
        this.bookmarks = data;
        this.isLoading = false;
      },
      error: () => (this.isLoading = false)
    });
  }

  removeBookmark(comicId: number, event: Event): void {
    event.preventDefault();
    event.stopPropagation();
    this.userService.removeBookmark(comicId).subscribe(() => {
      this.bookmarks = this.bookmarks.filter(b => b.comicId !== comicId);
    });
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
}

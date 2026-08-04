import { Component, OnInit } from '@angular/core';
import { CommonModule } from '@angular/common';
import { FormsModule } from '@angular/forms';
import { RouterLink } from '@angular/router';
import { ComicService } from '../../services/comic.service';
import { UserService } from '../../services/user.service';
import { Comment } from '../../models/comic.model';

@Component({
  selector: 'app-admin-comments',
  standalone: true,
  imports: [CommonModule, FormsModule, RouterLink],
  templateUrl: './admin-comments.component.html',
  styleUrls: ['./admin-comments.component.scss']
})
export class AdminCommentsComponent implements OnInit {
  comments: Comment[] = [];
  filteredComments: Comment[] = [];

  isLoading: boolean = true;
  message: string = '';
  isError: boolean = false;

  // Filter States
  searchTerm: string = '';
  selectedStatus: string = 'All'; // 'All', 'Reported', 'Hidden', 'Normal'
  sortBy: 'date-desc' | 'date-asc' | 'reports' = 'date-desc';

  // Stats Counters
  totalReportedCount: number = 0;
  totalHiddenCount: number = 0;

  constructor(
    private comicService: ComicService,
    private userService: UserService
  ) {}

  ngOnInit(): void {
    this.loadComments();
  }

  loadComments(): void {
    this.isLoading = true;
    this.comicService.getAdminComments().subscribe({
      next: (data) => {
        this.comments = data;
        this.calculateStats();
        this.applyFilters();
        this.isLoading = false;
      },
      error: (err) => {
        console.error('Lỗi tải danh sách bình luận:', err);
        this.showMessage('Không thể tải danh sách bình luận.', true);
        this.isLoading = false;
      }
    });
  }

  calculateStats(): void {
    this.totalReportedCount = this.comments.filter(c => (c.reportCount || 0) > 0).length;
    this.totalHiddenCount = this.comments.filter(c => c.isHidden === true).length;
  }

  applyFilters(): void {
    let result = [...this.comments];

    // Search filter
    if (this.searchTerm.trim()) {
      const q = this.searchTerm.toLowerCase().trim();
      result = result.filter(c =>
        c.content.toLowerCase().includes(q) ||
        c.username.toLowerCase().includes(q) ||
        (c.comicTitle && c.comicTitle.toLowerCase().includes(q))
      );
    }

    // Status filter
    if (this.selectedStatus === 'Reported') {
      result = result.filter(c => (c.reportCount || 0) > 0);
    } else if (this.selectedStatus === 'Hidden') {
      result = result.filter(c => c.isHidden === true);
    } else if (this.selectedStatus === 'Normal') {
      result = result.filter(c => !c.isHidden && (!c.reportCount || c.reportCount === 0));
    }

    // Sort
    result.sort((a, b) => {
      if (this.sortBy === 'reports') return (b.reportCount || 0) - (a.reportCount || 0);
      if (this.sortBy === 'date-asc') return new Date(a.createdAt).getTime() - new Date(b.createdAt).getTime();
      return new Date(b.createdAt).getTime() - new Date(a.createdAt).getTime(); // date-desc
    });

    this.filteredComments = result;
  }

  // --- ACTIONS ---

  toggleHidden(comment: Comment): void {
    this.comicService.toggleCommentHidden(comment.id).subscribe({
      next: (res) => {
        comment.isHidden = res.isHidden;
        this.calculateStats();
        this.applyFilters();
        this.showMessage(`Đã ${res.isHidden ? 'ẩn' : 'hiển thị lại'} bình luận của "${comment.username}".`);
      },
      error: (err) => {
        console.error('Lỗi đổi trạng thái ẩn bình luận:', err);
        this.showMessage('Đổi trạng thái ẩn bình luận thất bại.', true);
      }
    });
  }

  resolveReport(comment: Comment): void {
    this.comicService.resolveCommentReport(comment.id).subscribe({
      next: () => {
        comment.reportCount = 0;
        comment.reportReason = undefined;
        this.calculateStats();
        this.applyFilters();
        this.showMessage(`Đã xác nhận xử lý báo cáo bình luận của "${comment.username}".`);
      },
      error: (err) => {
        console.error('Lỗi xử lý báo cáo:', err);
        this.showMessage('Xử lý báo cáo thất bại.', true);
      }
    });
  }

  lockUser(comment: Comment): void {
    if (confirm(`Bạn có chắc chắn muốn KHÓA TÀI KHOẢN của người dùng "${comment.username}"?`)) {
      this.userService.toggleUserLock(comment.userId).subscribe({
        next: (res) => {
          this.showMessage(`Đã ${res.isLocked ? 'khóa' : 'mở khóa'} tài khoản "${comment.username}".`);
        },
        error: (err) => {
          console.error('Lỗi khóa tài khoản người bình luận:', err);
          this.showMessage('Khóa tài khoản thất bại.', true);
        }
      });
    }
  }

  deleteComment(comment: Comment): void {
    if (confirm(`Bạn có chắc chắn muốn XÓA bình luận của "${comment.username}"? Hành động này không thể hoàn tác.`)) {
      this.comicService.deleteComment(comment.id).subscribe({
        next: () => {
          this.showMessage('Đã xóa bình luận vi phạm thành công.');
          this.loadComments();
        },
        error: (err) => {
          console.error('Lỗi xóa bình luận:', err);
          this.showMessage('Xóa bình luận thất bại.', true);
        }
      });
    }
  }

  showMessage(msg: string, isErr = false): void {
    this.message = msg;
    this.isError = isErr;
    setTimeout(() => this.message = '', 4000);
  }
}

import { Component, OnInit } from '@angular/core';
import { CommonModule } from '@angular/common';
import { RouterModule, Router } from '@angular/router';
import { NotificationService } from '../../services/notification.service';
import { AppNotification } from '../../models/notification.model';

@Component({
  selector: 'app-notifications',
  standalone: true,
  imports: [CommonModule, RouterModule],
  templateUrl: './notifications.component.html',
  styleUrls: ['./notifications.component.scss']
})
export class NotificationsComponent implements OnInit {
  notifications: AppNotification[] = [];
  filteredNotifications: AppNotification[] = [];
  isLoading: boolean = true;
  activeFilter: string = 'all'; // 'all', 'unread', 'NewChapter', 'CommentReply', 'CommentLike', 'AdminSystem'

  constructor(
    private notificationService: NotificationService,
    private router: Router
  ) {}

  ngOnInit(): void {
    this.fetchNotifications();
  }

  fetchNotifications(): void {
    this.isLoading = true;
    this.notificationService.getNotifications().subscribe({
      next: (data) => {
        this.notifications = data;
        this.applyFilter(this.activeFilter);
        this.isLoading = false;
        // Also update global unread count
        this.notificationService.fetchUnreadCount().subscribe();
      },
      error: (err) => {
        console.error('Lỗi khi tải thông báo:', err);
        this.isLoading = false;
      }
    });
  }

  applyFilter(filter: string): void {
    this.activeFilter = filter;
    if (filter === 'all') {
      this.filteredNotifications = this.notifications;
    } else if (filter === 'unread') {
      this.filteredNotifications = this.notifications.filter(n => !n.isRead);
    } else {
      this.filteredNotifications = this.notifications.filter(n => n.type === filter);
    }
  }

  onNotificationClick(notification: AppNotification): void {
    if (!notification.isRead) {
      this.notificationService.markAsRead(notification.id).subscribe(() => {
        notification.isRead = true;
        this.applyFilter(this.activeFilter);
      });
    }

    if (notification.link) {
      this.router.navigateByUrl(notification.link);
    }
  }

  markAllAsRead(): void {
    this.notificationService.markAllAsRead().subscribe(() => {
      this.notifications.forEach(n => (n.isRead = true));
      this.applyFilter(this.activeFilter);
    });
  }

  getIconClass(type: string): string {
    switch (type) {
      case 'NewChapter':
        return 'fa-book-open icon-chapter';
      case 'CommentReply':
        return 'fa-reply icon-reply';
      case 'CommentLike':
        return 'fa-heart icon-like';
      case 'AdminSystem':
        return 'fa-bullhorn icon-admin';
      default:
        return 'fa-bell icon-default';
    }
  }

  getTypeLabel(type: string): string {
    switch (type) {
      case 'NewChapter':
        return 'Chapter mới';
      case 'CommentReply':
        return 'Trả lời bình luận';
      case 'CommentLike':
        return 'Thích bình luận';
      case 'AdminSystem':
        return 'Hệ thống';
      default:
        return 'Thông báo';
    }
  }
}

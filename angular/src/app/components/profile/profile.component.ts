import { Component, OnInit } from '@angular/core';
import { CommonModule } from '@angular/common';
import { RouterModule } from '@angular/router';
import { UserService } from '../../services/user.service';
import { AuthService } from '../../services/auth.service';
import { UserProfile, UserComment } from '../../models/user.model';

@Component({
  selector: 'app-profile',
  standalone: true,
  imports: [CommonModule, RouterModule],
  templateUrl: './profile.component.html',
  styleUrls: ['./profile.component.scss']
})
export class ProfileComponent implements OnInit {
  profile: UserProfile | null = null;
  comments: UserComment[] = [];
  isLoadingProfile: boolean = true;
  isLoadingComments: boolean = true;
  errorMsg: string = '';

  constructor(
    public authService: AuthService,
    private userService: UserService
  ) {}

  ngOnInit(): void {
    this.loadProfile();
    this.loadComments();
  }

  loadProfile(): void {
    this.isLoadingProfile = true;
    this.userService.getProfile().subscribe({
      next: (data) => {
        this.profile = data;
        this.isLoadingProfile = false;
      },
      error: (err) => {
        console.error('Lỗi khi tải thông tin cá nhân', err);
        this.errorMsg = 'Không thể tải thông tin trang cá nhân.';
        this.isLoadingProfile = false;
      }
    });
  }

  loadComments(): void {
    this.isLoadingComments = true;
    this.userService.getUserComments().subscribe({
      next: (data) => {
        this.comments = data;
        this.isLoadingComments = false;
      },
      error: (err) => {
        console.error('Lỗi khi tải lịch sử bình luận', err);
        this.isLoadingComments = false;
      }
    });
  }

  get defaultAvatar(): string {
    return 'assets/default-avatar.svg';
  }

  onAvatarError(event: Event): void {
    const img = event.target as HTMLImageElement;
    if (img && img.src !== this.defaultAvatar) {
      img.src = this.defaultAvatar;
    }
  }
}

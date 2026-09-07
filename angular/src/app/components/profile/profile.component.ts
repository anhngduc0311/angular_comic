import { Component, OnInit } from '@angular/core';
import { CommonModule } from '@angular/common';
import { RouterModule } from '@angular/router';
import { UserService } from '../../services/user.service';
import { AuthService } from '../../services/auth.service';
import { GamificationService } from '../../services/gamification.service';
import { UserProfile, UserComment, UserGamificationProfile, AvatarFrameOption } from '../../models/user.model';

@Component({
  selector: 'app-profile',
  standalone: true,
  imports: [CommonModule, RouterModule],
  templateUrl: './profile.component.html',
  styleUrls: ['./profile.component.scss']
})
export class ProfileComponent implements OnInit {
  profile: UserProfile | null = null;
  gamification: UserGamificationProfile | null = null;
  comments: UserComment[] = [];
  isLoadingProfile: boolean = true;
  isLoadingComments: boolean = true;
  isLoadingGamification: boolean = true;
  isCheckingIn: boolean = false;
  isEquippingFrame: boolean = false;
  toastMsg: string = '';
  toastType: 'success' | 'error' = 'success';
  errorMsg: string = '';

  activeTab: 'cultivation' | 'frames' | 'comments' = 'cultivation';

  constructor(
    public authService: AuthService,
    private userService: UserService,
    private gamificationService: GamificationService
  ) {}

  ngOnInit(): void {
    this.loadProfile();
    this.loadGamification();
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

  loadGamification(): void {
    this.isLoadingGamification = true;
    this.gamificationService.getProfile().subscribe({
      next: (data) => {
        this.gamification = data;
        this.isLoadingGamification = false;
      },
      error: (err) => {
        console.error('Lỗi khi tải thông tin tu vi', err);
        this.isLoadingGamification = false;
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

  checkIn(): void {
    if (this.isCheckingIn || this.gamification?.hasCheckedInToday) return;

    this.isCheckingIn = true;
    this.gamificationService.checkIn().subscribe({
      next: (res) => {
        this.isCheckingIn = false;
        if (res.success) {
          this.showToast(res.message, 'success');
          this.loadGamification();
        } else {
          this.showToast(res.message, 'error');
        }
      },
      error: (err) => {
        this.isCheckingIn = false;
        this.showToast(err.error?.message || 'Điểm danh thất bại. Vui lòng thử lại!', 'error');
      }
    });
  }

  equipFrame(frame: AvatarFrameOption): void {
    if (!frame.isUnlocked || frame.isActive || this.isEquippingFrame) return;

    this.isEquippingFrame = true;
    this.gamificationService.equipFrame(frame.id).subscribe({
      next: (res) => {
        this.isEquippingFrame = false;
        this.showToast(res.message, 'success');
        if (this.gamification) {
          this.gamification.activeFrame = frame.id;
          this.gamification.unlockedFrames.forEach((f) => (f.isActive = f.id === frame.id));
        }
        if (this.profile) {
          this.profile.activeFrame = frame.id;
        }
      },
      error: (err) => {
        this.isEquippingFrame = false;
        this.showToast(err.error?.message || 'Không thể đổi khung avatar!', 'error');
      }
    });
  }

  showToast(message: string, type: 'success' | 'error'): void {
    this.toastMsg = message;
    this.toastType = type;
    setTimeout(() => {
      this.toastMsg = '';
    }, 4500);
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

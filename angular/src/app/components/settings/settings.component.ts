import { Component, OnInit } from '@angular/core';
import { CommonModule } from '@angular/common';
import { FormsModule } from '@angular/forms';
import { Router, RouterModule } from '@angular/router';
import { UserService } from '../../services/user.service';
import { AuthService } from '../../services/auth.service';
import { ThemeService } from '../../services/theme.service';

@Component({
  selector: 'app-settings',
  standalone: true,
  imports: [CommonModule, FormsModule, RouterModule],
  templateUrl: './settings.component.html',
  styleUrls: ['./settings.component.scss']
})
export class SettingsComponent implements OnInit {
  activeTab: 'profile' | 'password' | 'theme' | 'notifications' | 'danger' = 'profile';

  // Profile Form
  profileForm = {
    fullName: '',
    email: '',
    avatar: ''
  };

  // Password Form
  passwordForm = {
    currentPassword: '',
    newPassword: '',
    confirmPassword: ''
  };

  // Danger Form
  deleteForm = {
    password: ''
  };

  // Theme Settings
  currentTheme: 'dark' | 'light' = 'light';

  // Notification Preferences
  notificationPrefs = {
    notifyNewChapter: true,
    notifyCommentReply: true,
    notifyCommentLike: true,
    notifyAdminSystem: true
  };

  message: string = '';
  isError: boolean = false;
  isSaving: boolean = false;

  constructor(
    public authService: AuthService,
    private userService: UserService,
    public themeService: ThemeService,
    private router: Router
  ) {}

  ngOnInit(): void {
    this.loadUserData();
    this.currentTheme = this.themeService.currentTheme;
    this.initNotificationPrefs();
  }

  loadUserData(): void {
    const currentUser = this.authService.currentUserValue;
    if (currentUser) {
      this.profileForm = {
        fullName: currentUser.fullName || '',
        email: currentUser.email || '',
        avatar: currentUser.avatar || ''
      };
    }

    this.userService.getProfile().subscribe({
      next: (profile) => {
        if (profile) {
          this.profileForm = {
            fullName: profile.fullName || '',
            email: profile.email || '',
            avatar: profile.avatar || ''
          };
        }
      }
    });
  }

  saveProfile(): void {
    this.isSaving = true;
    this.userService.updateProfile(this.profileForm).subscribe({
      next: (updatedProfile) => {
        this.authService.updateCurrentUser({
          fullName: updatedProfile.fullName,
          avatar: updatedProfile.avatar,
          email: updatedProfile.email
        });
        this.showMessage('Cập nhật thông tin cá nhân thành công!');
        this.isSaving = false;
      },
      error: (err) => {
        this.showMessage(err.error?.message || 'Cập nhật thất bại.', true);
        this.isSaving = false;
      }
    });
  }

  changePassword(): void {
    if (!this.passwordForm.currentPassword || !this.passwordForm.newPassword) {
      this.showMessage('Vui lòng nhập đầy đủ thông tin mật khẩu.', true);
      return;
    }

    if (this.passwordForm.newPassword !== this.passwordForm.confirmPassword) {
      this.showMessage('Mật khẩu mới và xác nhận mật khẩu không khớp.', true);
      return;
    }

    this.isSaving = true;
    this.userService.changePassword({
      currentPassword: this.passwordForm.currentPassword,
      newPassword: this.passwordForm.newPassword
    }).subscribe({
      next: (res) => {
        this.showMessage(res.message || 'Đổi mật khẩu thành công!');
        this.passwordForm = { currentPassword: '', newPassword: '', confirmPassword: '' };
        this.isSaving = false;
      },
      error: (err) => {
        this.showMessage(err.error?.message || 'Đổi mật khẩu thất bại.', true);
        this.isSaving = false;
      }
    });
  }

  // Theme Handling
  initTheme(): void {
    const savedTheme = (localStorage.getItem('truyenkomi_theme') as 'dark' | 'light') || 'dark';
    this.setTheme(savedTheme);
  }

  setTheme(theme: 'dark' | 'light'): void {
    this.currentTheme = theme;
    this.themeService.setTheme(theme);
  }

  // Notification Preferences Handling
  initNotificationPrefs(): void {
    const saved = localStorage.getItem('truyenkomi_notif_prefs');
    if (saved) {
      try {
        this.notificationPrefs = JSON.parse(saved);
      } catch (e) {}
    }
  }

  saveNotificationPrefs(): void {
    localStorage.setItem('truyenkomi_notif_prefs', JSON.stringify(this.notificationPrefs));
    this.showMessage('Cài đặt thông báo đã được lưu!');
  }

  // Account Deletion
  deleteAccount(): void {
    if (!this.deleteForm.password) {
      this.showMessage('Vui lòng nhập mật khẩu xác nhận xóa tài khoản.', true);
      return;
    }

    if (!confirm('Hành động này KHÔNG THỂ KHÔI PHỤC. Bạn có chắc chắn muốn xóa vĩnh viễn tài khoản của mình?')) {
      return;
    }

    this.isSaving = true;
    this.userService.deleteAccount({ password: this.deleteForm.password }).subscribe({
      next: () => {
        alert('Tài khoản của bạn đã được xóa thành công.');
        this.authService.logout();
        this.router.navigate(['/']);
      },
      error: (err) => {
        this.showMessage(err.error?.message || 'Xóa tài khoản thất bại.', true);
        this.isSaving = false;
      }
    });
  }

  showMessage(msg: string, isErr = false): void {
    this.message = msg;
    this.isError = isErr;
    setTimeout(() => this.message = '', 4000);
  }
}

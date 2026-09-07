import { Component, AfterViewInit, NgZone, ElementRef, ViewChild } from '@angular/core';
import { CommonModule } from '@angular/common';
import { FormsModule } from '@angular/forms';
import { Router } from '@angular/router';
import { AuthService } from '../../services/auth.service';
import { environment } from '../../../environments/environment';

declare const google: any;

@Component({
  selector: 'app-auth',
  standalone: true,
  imports: [CommonModule, FormsModule],
  templateUrl: './auth.component.html',
  styleUrls: ['./auth.component.scss']
})
export class AuthComponent implements AfterViewInit {
  @ViewChild('googleBtn') googleBtn?: ElementRef;

  isLoginMode: boolean = true;
  errorMessage: string = '';
  isLoading: boolean = false;
  isGoogleLoading: boolean = false;

  // Google Client ID from environment
  googleClientId = environment.googleClientId;

  // Login Form Fields
  loginData = {
    usernameOrEmail: '',
    password: ''
  };

  // Register Form Fields
  registerData = {
    username: '',
    email: '',
    password: '',
    confirmPassword: ''
  };

  constructor(
    private authService: AuthService, 
    private router: Router,
    private ngZone: NgZone
  ) {}

  ngAfterViewInit(): void {
    this.initGoogleAuth();
  }

  initGoogleAuth(): void {
    if (typeof window === 'undefined') return;

    const checkGoogleInterval = setInterval(() => {
      if (typeof google !== 'undefined' && google.accounts && google.accounts.id) {
        clearInterval(checkGoogleInterval);
        this.setupGoogleButton();
      }
    }, 200);

    // Timeout after 5s
    setTimeout(() => clearInterval(checkGoogleInterval), 5000);
  }

  setupGoogleButton(): void {
    try {
      google.accounts.id.initialize({
        client_id: this.googleClientId,
        callback: (response: any) => this.handleGoogleCredentialResponse(response),
        auto_select: false,
        cancel_on_tap_outside: true
      });

      const btnElement = document.getElementById('googleSignInBtn');
      if (btnElement) {
        google.accounts.id.renderButton(btnElement, {
          theme: 'filled_black',
          size: 'large',
          shape: 'pill',
          text: 'signin_with',
          width: 320,
          locale: 'vi'
        });
      }
    } catch (e) {
      console.warn('Google Identity Services setup note:', e);
    }
  }

  handleGoogleCredentialResponse(response: any): void {
    if (response && response.credential) {
      this.ngZone.run(() => {
        this.isGoogleLoading = true;
        this.errorMessage = '';

        this.authService.googleLogin(response.credential).subscribe({
          next: () => {
            this.isGoogleLoading = false;
            this.router.navigate(['/']);
          },
          error: (err) => {
            this.isGoogleLoading = false;
            this.errorMessage = err.error?.message || 'Đăng nhập bằng tài khoản Google không thành công.';
          }
        });
      });
    }
  }

  switchMode(isLogin: boolean): void {
    this.isLoginMode = isLogin;
    this.errorMessage = '';
    setTimeout(() => this.setupGoogleButton(), 50);
  }

  onLogin(): void {
    if (!this.loginData.usernameOrEmail || !this.loginData.password) {
      this.errorMessage = 'Vui lòng nhập đầy đủ thông tin đăng nhập.';
      return;
    }

    this.isLoading = true;
    this.errorMessage = '';

    this.authService.login(this.loginData).subscribe({
      next: () => {
        this.isLoading = false;
        this.router.navigate(['/']);
      },
      error: (err) => {
        this.isLoading = false;
        this.errorMessage = err.error?.message || 'Đăng nhập thất bại. Kiểm tra lại thông tin.';
      }
    });
  }

  onRegister(): void {
    if (!this.registerData.username || !this.registerData.email || !this.registerData.password) {
      this.errorMessage = 'Vui lòng điền đầy đủ thông tin bắt buộc.';
      return;
    }

    if (this.registerData.password !== this.registerData.confirmPassword) {
      this.errorMessage = 'Mật khẩu xác nhận không trùng khớp.';
      return;
    }

    this.isLoading = true;
    this.errorMessage = '';

    this.authService.register({
      username: this.registerData.username,
      email: this.registerData.email,
      password: this.registerData.password
    }).subscribe({
      next: () => {
        this.isLoading = false;
        this.router.navigate(['/']);
      },
      error: (err) => {
        this.isLoading = false;
        this.errorMessage = err.error?.message || 'Đăng ký thất bại. Tên người dùng hoặc email có thể đã tồn tại.';
      }
    });
  }
}

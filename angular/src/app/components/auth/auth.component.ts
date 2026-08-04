import { Component } from '@angular/core';
import { CommonModule } from '@angular/common';
import { FormsModule } from '@angular/forms';
import { Router } from '@angular/router';
import { AuthService } from '../../services/auth.service';

@Component({
  selector: 'app-auth',
  standalone: true,
  imports: [CommonModule, FormsModule],
  templateUrl: './auth.component.html',
  styleUrls: ['./auth.component.scss']
})
export class AuthComponent {
  isLoginMode: boolean = true;
  errorMessage: string = '';
  isLoading: boolean = false;

  // Login Form Fields
  loginData = {
    usernameOrEmail: '',
    password: ''
  };

  // Register Form Fields
  registerData = {
    username: '',
    email: '',
    fullName: '',
    password: '',
    confirmPassword: ''
  };

  constructor(private authService: AuthService, private router: Router) {}

  switchMode(isLogin: boolean): void {
    this.isLoginMode = isLogin;
    this.errorMessage = '';
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
      fullName: this.registerData.fullName,
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

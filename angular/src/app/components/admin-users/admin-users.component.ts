import { Component, OnInit } from '@angular/core';
import { CommonModule } from '@angular/common';
import { FormsModule } from '@angular/forms';
import { RouterLink } from '@angular/router';
import { UserService } from '../../services/user.service';
import { UserProfile } from '../../models/user.model';

@Component({
  selector: 'app-admin-users',
  standalone: true,
  imports: [CommonModule, FormsModule, RouterLink],
  templateUrl: './admin-users.component.html',
  styleUrls: ['./admin-users.component.scss']
})
export class AdminUsersComponent implements OnInit {
  users: UserProfile[] = [];
  filteredUsers: UserProfile[] = [];

  isLoading: boolean = true;
  message: string = '';
  isError: boolean = false;

  // Filter States
  searchTerm: string = '';
  selectedRole: string = 'All'; // 'All', 'Admin', 'User'
  selectedStatus: string = 'All'; // 'All', 'Active', 'Locked'
  sortBy: 'date-desc' | 'date-asc' | 'username' | 'role' = 'date-desc';

  // Stats Counters
  totalAdminsCount: number = 0;
  totalLockedCount: number = 0;

  constructor(private userService: UserService) {}

  ngOnInit(): void {
    this.loadUsers();
  }

  loadUsers(): void {
    this.isLoading = true;
    this.userService.getAdminUsers().subscribe({
      next: (data) => {
        this.users = data;
        this.calculateStats();
        this.applyFilters();
        this.isLoading = false;
      },
      error: (err) => {
        console.error('Lỗi tải danh sách người dùng:', err);
        this.showMessage('Không thể tải danh sách người dùng.', true);
        this.isLoading = false;
      }
    });
  }

  calculateStats(): void {
    this.totalAdminsCount = this.users.filter(u => u.role === 'Admin').length;
    this.totalLockedCount = this.users.filter(u => u.isLocked === true).length;
  }

  applyFilters(): void {
    let result = [...this.users];

    // Search filter
    if (this.searchTerm.trim()) {
      const q = this.searchTerm.toLowerCase().trim();
      result = result.filter(u =>
        u.username.toLowerCase().includes(q) ||
        u.email.toLowerCase().includes(q) ||
        (u.fullName && u.fullName.toLowerCase().includes(q))
      );
    }

    // Role filter
    if (this.selectedRole !== 'All') {
      result = result.filter(u => u.role === this.selectedRole);
    }

    // Lock Status filter
    if (this.selectedStatus === 'Active') {
      result = result.filter(u => u.isLocked !== true);
    } else if (this.selectedStatus === 'Locked') {
      result = result.filter(u => u.isLocked === true);
    }

    // Sort
    result.sort((a, b) => {
      if (this.sortBy === 'username') return a.username.localeCompare(b.username);
      if (this.sortBy === 'role') return b.role.localeCompare(a.role);
      if (this.sortBy === 'date-asc') return new Date(a.createdAt).getTime() - new Date(b.createdAt).getTime();
      return new Date(b.createdAt).getTime() - new Date(a.createdAt).getTime(); // date-desc
    });

    this.filteredUsers = result;
  }

  // --- ACTIONS ---

  toggleLock(user: UserProfile): void {
    const actionText = user.isLocked ? 'mở khóa' : 'khóa';
    if (confirm(`Bạn có chắc chắn muốn ${actionText} tài khoản "${user.username}"?`)) {
      this.userService.toggleUserLock(user.id).subscribe({
        next: (res) => {
          user.isLocked = res.isLocked;
          this.calculateStats();
          this.applyFilters();
          this.showMessage(`Đã ${res.isLocked ? 'khóa' : 'mở khóa'} thành công tài khoản "${user.username}".`);
        },
        error: (err) => {
          console.error('Lỗi đổi trạng thái khóa tài khoản:', err);
          this.showMessage('Thao tác khóa/mở khóa thất bại.', true);
        }
      });
    }
  }

  toggleRole(user: UserProfile): void {
    const newRole = user.role === 'Admin' ? 'User' : 'Admin';
    if (confirm(`Bạn có chắc chắn muốn thay đổi quyền của "${user.username}" thành ${newRole}?`)) {
      this.userService.updateUserRole(user.id, newRole).subscribe({
        next: (res) => {
          user.role = res.role;
          this.calculateStats();
          this.applyFilters();
          this.showMessage(`Đã cập nhật quyền thành công cho "${user.username}" (${res.role}).`);
        },
        error: (err) => {
          console.error('Lỗi đổi quyền người dùng:', err);
          this.showMessage('Đổi quyền thất bại.', true);
        }
      });
    }
  }

  deleteUser(user: UserProfile): void {
    if (confirm(`⚠️ CẢNH BÁO: Xóa tài khoản "${user.username}" sẽ xóa toàn bộ lịch sử đọc, bình luận và Bookmark liên quan. Bạn có chắc muốn tiếp tục?`)) {
      this.userService.adminDeleteUser(user.id).subscribe({
        next: () => {
          this.showMessage(`Đã xóa vĩnh viễn tài khoản "${user.username}".`);
          this.loadUsers();
        },
        error: (err) => {
          console.error('Lỗi xóa người dùng:', err);
          this.showMessage('Xóa tài khoản thất bại.', true);
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

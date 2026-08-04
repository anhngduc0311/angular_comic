import { Component } from '@angular/core';
import { CommonModule } from '@angular/common';
import { RouterModule, Router } from '@angular/router';
import { FormsModule } from '@angular/forms';
import { AuthService } from '../../services/auth.service';
import { NotificationService } from '../../services/notification.service';

@Component({
  selector: 'app-navbar',
  standalone: true,
  imports: [CommonModule, RouterModule, FormsModule],
  templateUrl: './navbar.component.html',
  styleUrls: ['./navbar.component.scss']
})
export class NavbarComponent {
  searchQuery: string = '';
  isMobileMenuOpen: boolean = false;

  constructor(
    public authService: AuthService, 
    public notificationService: NotificationService,
    private router: Router
  ) {
    this.authService.currentUser$.subscribe((user) => {
      if (user) {
        this.notificationService.fetchUnreadCount().subscribe();
      }
    });
  }

  toggleMobileMenu(): void {
    this.isMobileMenuOpen = !this.isMobileMenuOpen;
  }

  closeMobileMenu(): void {
    this.isMobileMenuOpen = false;
  }

  onSearch(): void {
    if (this.searchQuery.trim()) {
      this.router.navigate(['/search'], { queryParams: { q: this.searchQuery.trim() } });
      this.closeMobileMenu();
    }
  }

  logout(): void {
    this.authService.logout();
    this.closeMobileMenu();
    this.router.navigate(['/']);
  }
}

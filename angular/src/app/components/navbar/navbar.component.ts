import { Component, ElementRef, HostListener, OnInit, OnDestroy, inject } from '@angular/core';
import { CommonModule } from '@angular/common';
import { RouterModule, Router } from '@angular/router';
import { FormsModule } from '@angular/forms';
import { Subject, Subscription } from 'rxjs';
import { debounceTime, distinctUntilChanged, switchMap } from 'rxjs/operators';
import { AuthService } from '../../services/auth.service';
import { NotificationService } from '../../services/notification.service';
import { ComicService } from '../../services/comic.service';
import { ThemeService } from '../../services/theme.service';
import { SearchAutocompleteItem, Category } from '../../models/comic.model';

@Component({
  selector: 'app-navbar',
  standalone: true,
  imports: [CommonModule, RouterModule, FormsModule],
  templateUrl: './navbar.component.html',
  styleUrls: ['./navbar.component.scss']
})
export class NavbarComponent implements OnInit, OnDestroy {
  public authService = inject(AuthService);
  public notificationService = inject(NotificationService);
  public themeService = inject(ThemeService);
  private comicService = inject(ComicService);
  private router = inject(Router);
  private elementRef = inject(ElementRef);

  searchQuery: string = '';
  isSearchOpen: boolean = false;
  isMobileMenuOpen: boolean = false;
  isUserDropdownOpen: boolean = false;
  isCategoryMenuOpen: boolean = false;
  isRankMenuOpen: boolean = false;
  
  isAutocompleteOpen: boolean = false;
  autocompleteResults: SearchAutocompleteItem[] = [];
  isLoadingAutocomplete: boolean = false;
  selectedIndex: number = -1;

  categories: Category[] = [];
  isMobileGenresOpen: boolean = true;

  rankItems = [
    { label: 'Top Ngày', icon: 'fa-sun-o', query: 'day' },
    { label: 'Top Tuần', icon: 'fa-calendar-o', query: 'week' },
    { label: 'Top Tháng', icon: 'fa-trophy', query: 'month' },
    { label: 'Yêu Thích', icon: 'fa-heart', query: 'favorite' },
    { label: 'Mới Cập Nhật', icon: 'fa-refresh', query: 'latest' },
    { label: 'Truyện Mới', icon: 'fa-star', query: 'new' },
    { label: 'Truyện Full', icon: 'fa-check-circle', query: 'full' },
    { label: 'Ngẫu Nhiên', icon: 'fa-random', query: 'random' }
  ];

  private searchSubject = new Subject<string>();
  private searchSub?: Subscription;

  constructor() {
    this.authService.currentUser$.subscribe((user) => {
      if (user) {
        this.notificationService.fetchUnreadCount().subscribe();
      }
    });
  }

  ngOnInit(): void {
    this.loadCategories();

    this.searchSub = this.searchSubject.pipe(
      debounceTime(150),
      distinctUntilChanged(),
      switchMap(query => {
        if (!query || query.trim().length < 1) {
          this.isLoadingAutocomplete = false;
          this.autocompleteResults = [];
          this.isAutocompleteOpen = false;
          return [];
        }
        this.isLoadingAutocomplete = true;
        return this.comicService.autocomplete(query.trim(), 6);
      })
    ).subscribe({
      next: (results) => {
        this.autocompleteResults = results;
        this.isLoadingAutocomplete = false;
        this.isAutocompleteOpen = results.length > 0;
        this.selectedIndex = -1;
      },
      error: () => {
        this.isLoadingAutocomplete = false;
        this.autocompleteResults = [];
      }
    });
  }

  loadCategories(): void {
    this.comicService.getCategories(true).subscribe({
      next: (cats) => {
        this.categories = cats || [];
      },
      error: () => {
        this.categories = [];
      }
    });
  }

  ngOnDestroy(): void {
    this.searchSub?.unsubscribe();
  }

  toggleSearchBar(): void {
    this.isSearchOpen = !this.isSearchOpen;
    if (this.isSearchOpen) {
      setTimeout(() => {
        const input = document.getElementById('search_input') as HTMLInputElement;
        input?.focus();
      }, 50);
    } else {
      this.isAutocompleteOpen = false;
    }
  }

  toggleTheme(): void {
    this.themeService.toggleTheme();
  }

  onSearchInput(): void {
    this.searchSubject.next(this.searchQuery);
  }

  onKeyDown(event: KeyboardEvent): void {
    if (!this.isAutocompleteOpen || this.autocompleteResults.length === 0) {
      return;
    }

    if (event.key === 'ArrowDown') {
      event.preventDefault();
      this.selectedIndex = (this.selectedIndex + 1) % this.autocompleteResults.length;
    } else if (event.key === 'ArrowUp') {
      event.preventDefault();
      this.selectedIndex = this.selectedIndex <= 0 ? this.autocompleteResults.length - 1 : this.selectedIndex - 1;
    } else if (event.key === 'Enter' && this.selectedIndex >= 0) {
      event.preventDefault();
      const selected = this.autocompleteResults[this.selectedIndex];
      this.selectComic(selected.slug);
    } else if (event.key === 'Escape') {
      this.isAutocompleteOpen = false;
      this.isSearchOpen = false;
    }
  }

  selectComic(slug: string): void {
    this.isAutocompleteOpen = false;
    this.isSearchOpen = false;
    this.searchQuery = '';
    this.closeMobileMenu();
    this.router.navigate(['/comic', slug]);
  }

  private categoryTimeout: any = null;
  private rankTimeout: any = null;

  toggleMobileMenu(): void {
    this.isMobileMenuOpen = !this.isMobileMenuOpen;
    if (this.isMobileMenuOpen) {
      this.isUserDropdownOpen = false;
      this.isAutocompleteOpen = false;
    }
  }

  closeMobileMenu(): void {
    this.isMobileMenuOpen = false;
    this.isUserDropdownOpen = false;
    this.isAutocompleteOpen = false;
    this.isCategoryMenuOpen = false;
    this.isRankMenuOpen = false;
    if (this.categoryTimeout) clearTimeout(this.categoryTimeout);
    if (this.rankTimeout) clearTimeout(this.rankTimeout);
  }

  onCategoryMouseEnter(): void {
    if (this.categoryTimeout) {
      clearTimeout(this.categoryTimeout);
      this.categoryTimeout = null;
    }
    if (this.categories.length === 0) {
      this.loadCategories();
    }
    this.isCategoryMenuOpen = true;
    this.isRankMenuOpen = false;
  }

  onCategoryMouseLeave(): void {
    this.categoryTimeout = setTimeout(() => {
      this.isCategoryMenuOpen = false;
    }, 250);
  }

  onRankMouseEnter(): void {
    if (this.rankTimeout) {
      clearTimeout(this.rankTimeout);
      this.rankTimeout = null;
    }
    this.isRankMenuOpen = true;
    this.isCategoryMenuOpen = false;
  }

  onRankMouseLeave(): void {
    this.rankTimeout = setTimeout(() => {
      this.isRankMenuOpen = false;
    }, 250);
  }

  toggleCategoryMenu(event?: Event): void {
    if (event) event.stopPropagation();
    if (this.categoryTimeout) clearTimeout(this.categoryTimeout);
    if (this.categories.length === 0) {
      this.loadCategories();
    }
    this.isCategoryMenuOpen = !this.isCategoryMenuOpen;
    this.isRankMenuOpen = false;
  }

  toggleRankMenu(event?: Event): void {
    if (event) event.stopPropagation();
    if (this.rankTimeout) clearTimeout(this.rankTimeout);
    this.isRankMenuOpen = !this.isRankMenuOpen;
    this.isCategoryMenuOpen = false;
  }

  toggleUserDropdown(event?: Event): void {
    if (event) {
      event.stopPropagation();
    }
    this.isUserDropdownOpen = !this.isUserDropdownOpen;
    if (this.isUserDropdownOpen) {
      this.isAutocompleteOpen = false;
    }
  }

  closeUserDropdown(): void {
    this.isUserDropdownOpen = false;
  }

  @HostListener('document:click', ['$event'])
  onDocumentClick(event: MouseEvent): void {
    if (!this.elementRef.nativeElement.contains(event.target)) {
      this.isUserDropdownOpen = false;
      this.isAutocompleteOpen = false;
      this.isCategoryMenuOpen = false;
      this.isRankMenuOpen = false;
    }
  }

  onSearch(): void {
    if (this.selectedIndex >= 0 && this.autocompleteResults[this.selectedIndex]) {
      this.selectComic(this.autocompleteResults[this.selectedIndex].slug);
      return;
    }

    if (this.searchQuery.trim()) {
      this.router.navigate(['/search'], { queryParams: { q: this.searchQuery.trim() } });
      this.closeMobileMenu();
      this.isAutocompleteOpen = false;
      this.isSearchOpen = false;
    }
  }

  logout(): void {
    this.authService.logout();
    this.closeMobileMenu();
    this.isUserDropdownOpen = false;
    this.router.navigate(['/']);
  }

  onImgError(event: Event): void {
    const target = event.target as HTMLImageElement;
    if (target) {
      target.src = 'https://images.unsplash.com/photo-1607604276583-eef5d076aa5f?auto=format&fit=crop&w=150&q=80';
    }
  }

  readonly DEFAULT_AVATAR = 'assets/default-avatar.svg';

  getUserAvatar(): string {
    const avatar = this.authService.currentUserValue?.avatar;
    if (!avatar || !avatar.trim()) {
      return this.DEFAULT_AVATAR;
    }
    return avatar;
  }

  onAvatarError(event: Event): void {
    const img = event.target as HTMLImageElement;
    if (img && img.src !== this.DEFAULT_AVATAR) {
      img.src = this.DEFAULT_AVATAR;
    }
  }

  getGenreSlug(genre: string): string {
    return genre.toLowerCase()
      .normalize('NFD')
      .replace(/[\u0300-\u036f]/g, '')
      .replace(/[đĐ]/g, 'd')
      .replace(/[^a-z0-9]+/g, '-')
      .replace(/^-+|-+$/g, '');
  }

  toggleMobileGenres(event?: Event): void {
    if (event) event.stopPropagation();
    this.isMobileGenresOpen = !this.isMobileGenresOpen;
  }

  isHotGenre(name?: string): boolean {
    if (!name) return false;
    const hotList = [
      'tất cả', 'chuyển sinh', 'cổ đại', 'đam mỹ', 'manhua', 'manhwa', 
      'ngôn tình', 'romance', 'huyền huyễn', 'trọng sinh'
    ];
    return hotList.includes(name.toLowerCase().trim());
  }
}

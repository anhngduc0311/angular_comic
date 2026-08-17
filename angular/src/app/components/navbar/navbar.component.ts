import { Component, ElementRef, HostListener, OnInit, OnDestroy } from '@angular/core';
import { CommonModule } from '@angular/common';
import { RouterModule, Router } from '@angular/router';
import { FormsModule } from '@angular/forms';
import { Subject, Subscription } from 'rxjs';
import { debounceTime, distinctUntilChanged, switchMap } from 'rxjs/operators';
import { AuthService } from '../../services/auth.service';
import { NotificationService } from '../../services/notification.service';
import { ComicService } from '../../services/comic.service';
import { SearchAutocompleteItem } from '../../models/comic.model';

@Component({
  selector: 'app-navbar',
  standalone: true,
  imports: [CommonModule, RouterModule, FormsModule],
  templateUrl: './navbar.component.html',
  styleUrls: ['./navbar.component.scss']
})
export class NavbarComponent implements OnInit, OnDestroy {
  searchQuery: string = '';
  isMobileMenuOpen: boolean = false;
  isUserDropdownOpen: boolean = false;
  isAutocompleteOpen: boolean = false;
  autocompleteResults: SearchAutocompleteItem[] = [];
  isLoadingAutocomplete: boolean = false;
  selectedIndex: number = -1;

  private searchSubject = new Subject<string>();
  private searchSub?: Subscription;

  constructor(
    public authService: AuthService, 
    public notificationService: NotificationService,
    private comicService: ComicService,
    private router: Router,
    private elementRef: ElementRef
  ) {
    this.authService.currentUser$.subscribe((user) => {
      if (user) {
        this.notificationService.fetchUnreadCount().subscribe();
      }
    });
  }

  ngOnInit(): void {
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

  ngOnDestroy(): void {
    this.searchSub?.unsubscribe();
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
    }
  }

  selectComic(slug: string): void {
    this.isAutocompleteOpen = false;
    this.searchQuery = '';
    this.closeMobileMenu();
    this.router.navigate(['/comic', slug]);
  }

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
}


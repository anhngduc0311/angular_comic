import { Component, OnInit } from '@angular/core';
import { CommonModule } from '@angular/common';
import { RouterModule, ActivatedRoute, Router } from '@angular/router';
import { FormsModule } from '@angular/forms';
import { ComicService } from '../../services/comic.service';
import { SeoService } from '../../services/seo.service';
import { Comic, Category, SearchFilter } from '../../models/comic.model';

@Component({
  selector: 'app-search',
  standalone: true,
  imports: [CommonModule, RouterModule, FormsModule],
  templateUrl: './search.component.html',
  styleUrls: ['./search.component.scss']
})
export class SearchComponent implements OnInit {
  query: string = '';
  selectedCategory: string = '';
  includeCategories: string[] = [];
  excludeCategories: string[] = [];
  selectedStatus: string = 'All';
  selectedCountry: string = 'All';
  selectedMinChapters: number = 0;
  selectedSort: string = 'latest';

  currentPage: number = 1;
  pageSize: number = 24;
  totalCount: number = 0;
  totalPages: number = 1;

  viewMode: 'grid' | 'list' = 'grid';
  showAdvancedFilters: boolean = true;

  categories: Category[] = [];
  results: Comic[] = [];
  isLoading: boolean = false;

  countries = [
    { label: 'Tất cả quốc gia', value: 'All' },
    { label: 'Nhật Bản (Manga)', value: 'Nhật Bản' },
    { label: 'Hàn Quốc (Manhwa)', value: 'Hàn Quốc' },
    { label: 'Trung Quốc (Manhua)', value: 'Trung Quốc' },
    { label: 'Âu Mỹ (Comic)', value: 'Mỹ' }
  ];

  chapterRanges = [
    { label: 'Tất cả số chương', value: 0 },
    { label: 'Trên 10 chương', value: 10 },
    { label: 'Trên 50 chương', value: 50 },
    { label: 'Trên 100 chương', value: 100 },
    { label: 'Trên 300 chương', value: 300 },
    { label: 'Trên 500 chương', value: 500 }
  ];

  constructor(
    private comicService: ComicService,
    private seoService: SeoService,
    private route: ActivatedRoute,
    private router: Router
  ) {}

  ngOnInit(): void {
    this.comicService.getCategories().subscribe(cats => this.categories = cats);

    this.route.queryParams.subscribe(params => {
      this.query = params['q'] || '';
      
      const inc = params['includeCategories'] || params['category'] || '';
      this.includeCategories = inc ? inc.split(',') : [];
      this.selectedCategory = this.includeCategories.length > 0 ? this.includeCategories[0] : '';

      const exc = params['excludeCategories'] || '';
      this.excludeCategories = exc ? exc.split(',') : [];

      this.selectedStatus = params['status'] || 'All';
      
      const rawCountry = params['country'] || 'All';
      if (rawCountry.toLowerCase() === 'japan' || rawCountry.toLowerCase() === 'manga') {
        this.selectedCountry = 'Nhật Bản';
      } else if (rawCountry.toLowerCase() === 'korea' || rawCountry.toLowerCase() === 'manhwa') {
        this.selectedCountry = 'Hàn Quốc';
      } else if (rawCountry.toLowerCase() === 'china' || rawCountry.toLowerCase() === 'manhua') {
        this.selectedCountry = 'Trung Quốc';
      } else if (rawCountry.toLowerCase() === 'western') {
        this.selectedCountry = 'Mỹ';
      } else {
        this.selectedCountry = rawCountry;
      }

      this.selectedMinChapters = params['minChapters'] ? parseInt(params['minChapters'], 10) : 0;
      this.selectedSort = params['sortBy'] || params['sort'] || 'latest';
      this.currentPage = params['page'] ? parseInt(params['page'], 10) : 1;

      this.executeSearch();
    });
  }

  executeSearch(): void {
    this.isLoading = true;

    // Set SEO
    const searchLabel = this.query ? `Tìm kiếm: "${this.query}"` : 'Bộ Lọc & Tìm Kiếm Truyện Tranh Nâng Cao';
    this.seoService.setGeneralSeo(
      `${searchLabel} - TruyenKomi`,
      'Tìm kiếm và lọc truyện tranh tiếng Việt theo nhiều thể loại, tác giả, quốc gia, số chương và xếp hạng tại TruyenKomi.',
      undefined,
      '/search'
    );

    const filter: SearchFilter = {
      query: this.query,
      includeCategories: this.selectedCategory ? [this.selectedCategory] : this.includeCategories,
      excludeCategories: this.excludeCategories,
      status: this.selectedStatus,
      country: this.selectedCountry,
      minChapters: this.selectedMinChapters,
      sortBy: this.selectedSort,
      page: this.currentPage,
      pageSize: this.pageSize
    };

    this.comicService.advancedSearch(filter).subscribe({
      next: (res) => {
        this.results = res.items || [];
        this.totalCount = res.totalCount || 0;
        this.totalPages = res.totalPages || 1;
        this.currentPage = res.page || 1;
        this.isLoading = false;
      },
      error: () => {
        this.results = [];
        this.isLoading = false;
      }
    });
  }

  applyFilters(page: number = 1): void {
    this.currentPage = page;
    this.router.navigate([], {
      relativeTo: this.route,
      queryParams: {
        q: this.query ? this.query.trim() : null,
        category: this.selectedCategory || null,
        includeCategories: this.includeCategories.length > 0 ? this.includeCategories.join(',') : null,
        excludeCategories: this.excludeCategories.length > 0 ? this.excludeCategories.join(',') : null,
        status: this.selectedStatus === 'All' ? null : this.selectedStatus,
        country: this.selectedCountry === 'All' ? null : this.selectedCountry,
        minChapters: this.selectedMinChapters > 0 ? this.selectedMinChapters : null,
        sortBy: this.selectedSort,
        page: this.currentPage > 1 ? this.currentPage : null
      }
    });
  }

  toggleCategoryState(slug: string): void {
    if (this.includeCategories.includes(slug)) {
      // Move from Include (+) to Exclude (-)
      this.includeCategories = this.includeCategories.filter(s => s !== slug);
      this.excludeCategories.push(slug);
    } else if (this.excludeCategories.includes(slug)) {
      // Move from Exclude (-) to Neutral
      this.excludeCategories = this.excludeCategories.filter(s => s !== slug);
    } else {
      // Move from Neutral to Include (+)
      this.includeCategories.push(slug);
    }
    this.applyFilters(1);
  }

  getCategoryState(slug: string): 'include' | 'exclude' | 'neutral' {
    if (this.includeCategories.includes(slug)) return 'include';
    if (this.excludeCategories.includes(slug)) return 'exclude';
    return 'neutral';
  }

  resetFilters(): void {
    this.query = '';
    this.selectedCategory = '';
    this.includeCategories = [];
    this.excludeCategories = [];
    this.selectedStatus = 'All';
    this.selectedCountry = 'All';
    this.selectedMinChapters = 0;
    this.selectedSort = 'latest';
    this.applyFilters(1);
  }

  onPageChange(newPage: number): void {
    if (newPage >= 1 && newPage <= this.totalPages) {
      this.applyFilters(newPage);
      window.scrollTo({ top: 0, behavior: 'smooth' });
    }
  }

  formatTimeAgo(dateStr?: string): string {
    if (!dateStr) return 'Vừa xong';
    const date = new Date(dateStr);
    const now = new Date();
    const diffMs = now.getTime() - date.getTime();
    const diffMins = Math.floor(diffMs / (1000 * 60));
    const diffHours = Math.floor(diffMs / (1000 * 60 * 60));
    const diffDays = Math.floor(diffMs / (1000 * 60 * 60 * 24));

    if (diffMins < 5) return 'Vừa xong';
    if (diffMins < 60) return `${diffMins} phút trước`;
    if (diffHours < 24) return `${diffHours} giờ trước`;
    if (diffDays < 30) return `${diffDays} ngày trước`;
    return date.toLocaleDateString('vi-VN');
  }

  formatNumber(num?: number | string | null): string {
    if (!num) return '0';
    const n = typeof num === 'string' ? parseFloat(num) : num;
    if (isNaN(n)) return '0';
    if (n >= 1000000) return (n / 1000000).toFixed(1) + 'M';
    if (n >= 1000) return (n / 1000).toFixed(1) + 'K';
    return Math.floor(n).toString();
  }

  onImgError(event: Event): void {
    const target = event.target as HTMLImageElement;
    if (target) {
      target.src = 'https://images.unsplash.com/photo-1607604276583-eef5d076aa5f?auto=format&fit=crop&w=600&q=80';
    }
  }

  trackByComicId(index: number, comic: Comic): number {
    return comic.id;
  }

  trackByChapterId(index: number, ch: any): number {
    return ch.id;
  }
}

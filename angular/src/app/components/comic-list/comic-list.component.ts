import { Component, OnInit } from '@angular/core';
import { CommonModule } from '@angular/common';
import { RouterModule, ActivatedRoute, Router } from '@angular/router';
import { FormsModule } from '@angular/forms';
import { ComicService } from '../../services/comic.service';
import { SeoService } from '../../services/seo.service';
import { Comic, Category } from '../../models/comic.model';

@Component({
  selector: 'app-comic-list',
  standalone: true,
  imports: [CommonModule, RouterModule, FormsModule],
  templateUrl: './comic-list.component.html',
  styleUrls: ['./comic-list.component.scss']
})
export class ComicListComponent implements OnInit {
  comics: Comic[] = [];
  categories: Category[] = [];

  selectedCategory: string = '';
  selectedStatus: string = 'All';
  selectedSort: string = 'latest';
  selectedCountry: string = 'All';
  isLoading: boolean = true;
  skeletonCards: number[] = Array(18).fill(0);

  countries = [
    { label: 'Tất cả quốc gia', value: 'All' },
    { label: 'Nhật Bản (Manga)', value: 'Nhật Bản' },
    { label: 'Hàn Quốc (Manhwa)', value: 'Hàn Quốc' },
    { label: 'Trung Quốc (Manhua)', value: 'Trung Quốc' },
    { label: 'Âu Mỹ (Comic)', value: 'Mỹ' }
  ];

  constructor(
    private comicService: ComicService,
    private seoService: SeoService,
    private route: ActivatedRoute,
    private router: Router
  ) {}

  ngOnInit(): void {
    this.comicService.getCategories().subscribe(cats => {
      this.categories = cats;
      this.updateSeo();
    });

    this.route.queryParams.subscribe(params => {
      this.selectedCategory = params['category'] || '';
      this.selectedStatus = params['status'] || 'All';
      this.selectedSort = params['sort'] || params['sortBy'] || 'latest';
      this.selectedCountry = params['country'] || 'All';
      this.updateSeo();
      this.fetchComics();
    });
  }

  private updateSeo(): void {
    const catObj = this.categories.find(c => c.slug === this.selectedCategory);
    const catName = catObj ? catObj.name : (this.selectedCountry !== 'All' ? this.selectedCountry : undefined);
    this.seoService.setCategorySeo(catName);
  }

  fetchComics(): void {
    this.isLoading = true;
    this.comicService.searchComics(undefined, this.selectedCategory, this.selectedStatus, this.selectedSort, this.selectedCountry)
      .subscribe({
        next: (data) => {
          this.comics = data;
          this.isLoading = false;
        },
        error: () => this.isLoading = false
      });
  }

  onFilterChange(): void {
    this.router.navigate([], {
      relativeTo: this.route,
      queryParams: {
        category: this.selectedCategory || null,
        status: this.selectedStatus === 'All' ? null : this.selectedStatus,
        sort: this.selectedSort,
        country: this.selectedCountry === 'All' ? null : this.selectedCountry
      },
      queryParamsHandling: 'merge'
    });
  }

  getPageHeading(): string {
    if (this.selectedCountry && this.selectedCountry !== 'All') {
      const match = this.countries.find(c => 
        c.value.toLowerCase() === this.selectedCountry.toLowerCase() || 
        (c.value === 'Nhật Bản' && (this.selectedCountry.toLowerCase() === 'japan' || this.selectedCountry.toLowerCase() === 'manga')) ||
        (c.value === 'Hàn Quốc' && (this.selectedCountry.toLowerCase() === 'korea' || this.selectedCountry.toLowerCase() === 'manhwa')) ||
        (c.value === 'Trung Quốc' && (this.selectedCountry.toLowerCase() === 'china' || this.selectedCountry.toLowerCase() === 'manhua'))
      );
      if (match) {
        return `TRUYỆN TRANH ${match.label.toUpperCase()}`;
      }
      return `TRUYỆN TRANH ${this.selectedCountry.toUpperCase()}`;
    }
    if (this.selectedCategory) {
      const cat = this.categories.find(c => c.slug === this.selectedCategory);
      if (cat) return `TRUYỆN TRANH - THỂ LOẠI ${cat.name.toUpperCase()}`;
    }
    return 'DANH SÁCH TRUYỆN TRANH';
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
      target.src = 'https://images.unsplash.com/photo-1607604276583-eef5d076aa5f?auto=format&fit=crop&w=190&q=80';
    }
  }
}

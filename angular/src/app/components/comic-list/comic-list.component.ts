import { Component, OnInit } from '@angular/core';
import { CommonModule } from '@angular/common';
import { RouterModule, ActivatedRoute, Router } from '@angular/router';
import { FormsModule } from '@angular/forms';
import { ComicService } from '../../services/comic.service';
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
  isLoading: boolean = true;
  skeletonCards: number[] = Array(18).fill(0);

  constructor(
    private comicService: ComicService,
    private route: ActivatedRoute,
    private router: Router
  ) {}

  ngOnInit(): void {
    this.comicService.getCategories().subscribe(cats => this.categories = cats);

    this.route.queryParams.subscribe(params => {
      this.selectedCategory = params['category'] || '';
      this.selectedStatus = params['status'] || 'All';
      this.selectedSort = params['sort'] || params['sortBy'] || 'latest';
      this.fetchComics();
    });
  }

  fetchComics(): void {
    this.isLoading = true;
    this.comicService.searchComics(undefined, this.selectedCategory, this.selectedStatus, this.selectedSort)
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
        sort: this.selectedSort
      },
      queryParamsHandling: 'merge'
    });
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
    if (diffMins < 60) return `${diffMins} Phút Trước`;
    if (diffHours < 24) return `${diffHours} Giờ Trước`;
    if (diffDays < 30) return `${diffDays} Ngày Trước`;
    return date.toLocaleDateString('vi-VN');
  }

  onImgError(event: Event): void {
    const target = event.target as HTMLImageElement;
    if (target) {
      target.src = 'https://images.unsplash.com/photo-1607604276583-eef5d076aa5f?auto=format&fit=crop&w=190&q=80';
    }
  }
}

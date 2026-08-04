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
  isLoading: boolean = false;

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
      this.selectedSort = params['sortBy'] || 'latest';
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
        sortBy: this.selectedSort
      },
      queryParamsHandling: 'merge'
    });
  }
}

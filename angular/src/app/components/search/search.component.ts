import { Component, OnInit } from '@angular/core';
import { CommonModule } from '@angular/common';
import { RouterModule, ActivatedRoute, Router } from '@angular/router';
import { FormsModule } from '@angular/forms';
import { ComicService } from '../../services/comic.service';
import { Comic, Category } from '../../models/comic.model';

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
  selectedStatus: string = 'All';
  selectedSort: string = 'latest';

  categories: Category[] = [];
  results: Comic[] = [];
  isLoading: boolean = false;

  constructor(
    private comicService: ComicService,
    private route: ActivatedRoute,
    private router: Router
  ) {}

  ngOnInit(): void {
    this.comicService.getCategories().subscribe(cats => this.categories = cats);

    this.route.queryParams.subscribe(params => {
      this.query = params['q'] || '';
      this.selectedCategory = params['category'] || '';
      this.selectedStatus = params['status'] || 'All';
      this.selectedSort = params['sortBy'] || 'latest';
      this.executeSearch();
    });
  }

  executeSearch(): void {
    this.isLoading = true;
    this.comicService.searchComics(this.query, this.selectedCategory, this.selectedStatus, this.selectedSort)
      .subscribe({
        next: (data) => {
          this.results = data;
          this.isLoading = false;
        },
        error: () => (this.isLoading = false)
      });
  }

  onSearchSubmit(): void {
    this.router.navigate([], {
      relativeTo: this.route,
      queryParams: {
        q: this.query || null,
        category: this.selectedCategory || null,
        status: this.selectedStatus === 'All' ? null : this.selectedStatus,
        sortBy: this.selectedSort
      }
    });
  }
}

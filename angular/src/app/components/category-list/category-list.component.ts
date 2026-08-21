import { Component, OnInit } from '@angular/core';
import { CommonModule } from '@angular/common';
import { RouterModule } from '@angular/router';
import { ComicService } from '../../services/comic.service';
import { Category } from '../../models/comic.model';

@Component({
  selector: 'app-category-list',
  standalone: true,
  imports: [CommonModule, RouterModule],
  templateUrl: './category-list.component.html',
  styleUrls: ['./category-list.component.scss']
})
export class CategoryListComponent implements OnInit {
  categories: Category[] = [];
  isLoading: boolean = true;
  skeletonCategories: number[] = Array(8).fill(0);

  constructor(private comicService: ComicService) {}

  ngOnInit(): void {
    this.isLoading = true;
    this.comicService.getCategories().subscribe({
      next: (cats) => {
        this.categories = cats;
        this.isLoading = false;
      },
      error: () => (this.isLoading = false)
    });
  }
}

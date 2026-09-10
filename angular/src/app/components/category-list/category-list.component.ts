import { Component, OnInit } from '@angular/core';
import { CommonModule } from '@angular/common';
import { FormsModule } from '@angular/forms';
import { RouterModule } from '@angular/router';
import { ComicService } from '../../services/comic.service';
import { Category } from '../../models/comic.model';

export interface CategoryGroup {
  letter: string;
  categories: Category[];
}

@Component({
  selector: 'app-category-list',
  standalone: true,
  imports: [CommonModule, FormsModule, RouterModule],
  templateUrl: './category-list.component.html',
  styleUrls: ['./category-list.component.scss']
})
export class CategoryListComponent implements OnInit {
  categories: Category[] = [];
  isLoading: boolean = true;
  skeletonCategories: number[] = Array(12).fill(0);

  // Alphabet list: ALL, # (numbers/symbols), A to Z
  readonly alphabetList: string[] = [
    'TẤT CẢ', '#', 'A', 'B', 'C', 'D', 'E', 'F', 'G', 'H', 'I', 'J', 'K', 'L', 'M',
    'N', 'O', 'P', 'Q', 'R', 'S', 'T', 'U', 'V', 'W', 'X', 'Y', 'Z'
  ];

  selectedLetter: string = 'TẤT CẢ';
  searchQuery: string = '';
  sortBy: 'az' | 'popular' | 'za' = 'az';
  letterCounts: { [key: string]: number } = {};

  constructor(private comicService: ComicService) {}

  ngOnInit(): void {
    this.loadCategories();
  }

  loadCategories(): void {
    this.isLoading = true;
    this.comicService.getCategories().subscribe({
      next: (cats) => {
        this.categories = cats || [];
        this.computeLetterCounts();
        this.isLoading = false;
      },
      error: () => {
        this.categories = [];
        this.isLoading = false;
      }
    });
  }

  getInitialLetter(name: string): string {
    if (!name || !name.trim()) return '#';
    const trimmed = name.trim();
    let firstChar = trimmed.charAt(0).toUpperCase();
    if (firstChar === 'Đ') return 'D';

    // Normalize Vietnamese diacritics
    const normalized = firstChar.normalize('NFD').replace(/[\u0300-\u036f]/g, '');
    if (/^[A-Z]$/.test(normalized)) {
      return normalized;
    }
    return '#';
  }

  computeLetterCounts(): void {
    const counts: { [key: string]: number } = { 'TẤT CẢ': this.categories.length, '#': 0 };
    for (let i = 65; i <= 90; i++) {
      counts[String.fromCharCode(i)] = 0;
    }

    for (const cat of this.categories) {
      const letter = this.getInitialLetter(cat.name);
      counts[letter] = (counts[letter] || 0) + 1;
    }
    this.letterCounts = counts;
  }

  selectLetter(letter: string): void {
    this.selectedLetter = letter;
    if (letter === 'TẤT CẢ') {
      window.scrollTo({ top: 0, behavior: 'smooth' });
    } else {
      setTimeout(() => {
        const el = document.getElementById(`group-${letter}`);
        if (el) {
          el.scrollIntoView({ behavior: 'smooth', block: 'start' });
        }
      }, 50);
    }
  }

  jumpToLetter(letter: string, event: Event): void {
    event.preventDefault();
    this.selectLetter(letter);
  }

  clearSearch(): void {
    this.searchQuery = '';
  }

  resetFilters(): void {
    this.selectedLetter = 'TẤT CẢ';
    this.searchQuery = '';
    this.sortBy = 'az';
  }

  get hasActiveFilters(): boolean {
    return this.selectedLetter !== 'TẤT CẢ' || this.searchQuery.trim().length > 0 || this.sortBy !== 'az';
  }

  get totalFilteredCount(): number {
    return this.groupedCategories.reduce((acc, g) => acc + g.categories.length, 0);
  }

  get groupedCategories(): CategoryGroup[] {
    let list = this.categories;

    // Filter by selected letter if not TẤT CẢ
    if (this.selectedLetter !== 'TẤT CẢ') {
      list = list.filter(cat => this.getInitialLetter(cat.name) === this.selectedLetter);
    }

    // Filter by search query
    if (this.searchQuery && this.searchQuery.trim()) {
      const q = this.searchQuery.trim().toLowerCase();
      list = list.filter(cat =>
        (cat.name && cat.name.toLowerCase().includes(q)) ||
        (cat.slug && cat.slug.toLowerCase().includes(q)) ||
        (cat.description && cat.description.toLowerCase().includes(q))
      );
    }

    const groupsMap = new Map<string, Category[]>();

    for (const cat of list) {
      const letter = this.getInitialLetter(cat.name);
      if (!groupsMap.has(letter)) {
        groupsMap.set(letter, []);
      }
      groupsMap.get(letter)!.push(cat);
    }

    // Sort categories within each letter group
    groupsMap.forEach((cats) => {
      cats.sort((a, b) => {
        if (this.sortBy === 'popular') {
          return (b.comicCount || 0) - (a.comicCount || 0);
        } else if (this.sortBy === 'za') {
          return b.name.localeCompare(a.name, 'vi', { sensitivity: 'base' });
        } else {
          return a.name.localeCompare(b.name, 'vi', { sensitivity: 'base' });
        }
      });
    });

    // Sort group keys (# first or A-Z)
    const sortedKeys = Array.from(groupsMap.keys()).sort((a, b) => {
      if (a === '#') return -1;
      if (b === '#') return 1;
      return a.localeCompare(b);
    });

    return sortedKeys.map(letter => ({
      letter,
      categories: groupsMap.get(letter)!
    }));
  }
}

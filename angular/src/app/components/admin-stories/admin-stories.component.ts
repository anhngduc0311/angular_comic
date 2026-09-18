import { Component, OnInit } from '@angular/core';
import { CommonModule } from '@angular/common';
import { FormsModule } from '@angular/forms';
import { RouterLink } from '@angular/router';
import { ComicService } from '../../services/comic.service';
import { Comic, Category } from '../../models/comic.model';

@Component({
  selector: 'app-admin-stories',
  standalone: true,
  imports: [CommonModule, FormsModule, RouterLink],
  templateUrl: './admin-stories.component.html',
  styleUrls: ['./admin-stories.component.scss']
})
export class AdminStoriesComponent implements OnInit {
  comics: Comic[] = [];
  filteredComics: Comic[] = [];
  categories: Category[] = [];

  isLoading: boolean = true;
  message: string = '';
  isError: boolean = false;

  // Filter States
  searchTerm: string = '';
  selectedStatus: string = 'All';
  selectedVisibility: string = 'All'; // 'All', 'Public', 'Hidden'
  selectedFeatured: 'All' | 'Featured' | 'Normal' = 'All';
  selectedCategory: string = 'All';
  selectedChapterStatus: 'All' | 'NoChapters' | 'MissingChapter1' | 'HasChaptersMissingC1' | 'HasChapters' | 'HasChapter1' = 'All';
  sortBy: 'latest' | 'views' | 'rating' | 'title' | 'chapters' = 'latest';

  // Pagination States
  currentPage: number = 1;
  pageSize: number = 10;
  pageSizeOptions: number[] = [10, 20, 50, 100];
  totalPages: number = 1;
  pagedComics: Comic[] = [];
  startIndex: number = 0;
  endIndex: number = 0;

  // Form Modal State
  showFormModal: boolean = false;
  isEditing: boolean = false;
  comicForm = {
    id: 0,
    title: '',
    author: '',
    description: '',
    coverImage: '',
    bannerImage: '',
    status: 'Ongoing',
    isFeatured: false,
    isPublic: true,
    selectedCategoryIds: [] as number[]
  };

  // Cover Image Manager Modal State
  showCoverModal: boolean = false;
  selectedComicForCover: Comic | null = null;
  coverUrlInput: string = '';

  // Sample Preset Covers Gallery for 1-click selection
  presetCovers: string[] = [
    'https://images.unsplash.com/photo-1607604276583-eef5d076aa5f?auto=format&fit=crop&w=600&q=80',
    'https://images.unsplash.com/photo-1578632767115-351597cf2477?auto=format&fit=crop&w=600&q=80',
    'https://images.unsplash.com/photo-1534447677768-be436bb09401?auto=format&fit=crop&w=600&q=80',
    'https://images.unsplash.com/photo-1569705460033-cfaa4b368e6a?auto=format&fit=crop&w=600&q=80',
    'https://images.unsplash.com/photo-1579783900882-c0d3dad7b119?auto=format&fit=crop&w=600&q=80',
    'https://images.unsplash.com/photo-1579783902614-a3fb3927b675?auto=format&fit=crop&w=600&q=80',
    'https://images.unsplash.com/photo-1618005182384-a83a8bd57fbe?auto=format&fit=crop&w=600&q=80',
    'https://images.unsplash.com/photo-1563089145-599997674d42?auto=format&fit=crop&w=600&q=80'
  ];

  constructor(private comicService: ComicService) {}

  ngOnInit(): void {
    this.loadData();
  }

  loadData(preservePage: boolean = false): void {
    this.isLoading = true;
    this.comicService.getAdminComics().subscribe({
      next: (data) => {
        this.comics = data.map(c => {
          const totalChapters = c.totalChapters ?? 0;
          let hasChapterOne = c.hasChapterOne;
          if (hasChapterOne === undefined) {
            hasChapterOne = totalChapters > 0 && (
              (c.firstChapterNumber !== undefined && c.firstChapterNumber <= 1.5) ||
              (c.recentChapters?.some(ch => (ch.chapterNumber >= 0.8 && ch.chapterNumber < 2.0) || Math.floor(ch.chapterNumber) === 1 || ch.chapterNumber <= 1.5) ?? false)
            );
          }
          return {
            ...c,
            isPublic: c.isPublic !== undefined ? c.isPublic : true,
            totalChapters,
            hasChapterOne
          };
        });
        this.applyFilters(!preservePage);
        this.isLoading = false;
      },
      error: (err) => {
        console.error('Lỗi tải danh sách truyện:', err);
        this.showMessage('Không thể tải danh sách truyện.', true);
        this.isLoading = false;
      }
    });

    this.comicService.getCategories().subscribe(cats => this.categories = cats);
  }

  applyFilters(resetPage: boolean = true): void {
    let result = [...this.comics];

    // Search by title or author
    if (this.searchTerm.trim()) {
      const query = this.searchTerm.toLowerCase().trim();
      result = result.filter(c => 
        c.title.toLowerCase().includes(query) || 
        (c.author && c.author.toLowerCase().includes(query))
      );
    }

    // Filter Status
    if (this.selectedStatus !== 'All') {
      result = result.filter(c => c.status === this.selectedStatus);
    }

    // Filter Visibility
    if (this.selectedVisibility === 'Public') {
      result = result.filter(c => c.isPublic !== false);
    } else if (this.selectedVisibility === 'Hidden') {
      result = result.filter(c => c.isPublic === false);
    }

    // Filter Hot / Featured
    if (this.selectedFeatured === 'Featured') {
      result = result.filter(c => c.isFeatured);
    } else if (this.selectedFeatured === 'Normal') {
      result = result.filter(c => !c.isFeatured);
    }

    // Filter Category
    if (this.selectedCategory !== 'All') {
      const catId = Number(this.selectedCategory);
      result = result.filter(c => c.categories.some(cat => cat.id === catId));
    }

    // Filter Chapter Status
    if (this.selectedChapterStatus === 'NoChapters') {
      result = result.filter(c => (c.totalChapters || 0) === 0);
    } else if (this.selectedChapterStatus === 'MissingChapter1') {
      result = result.filter(c => (c.totalChapters || 0) === 0 || !c.hasChapterOne);
    } else if (this.selectedChapterStatus === 'HasChaptersMissingC1') {
      result = result.filter(c => (c.totalChapters || 0) > 0 && !c.hasChapterOne);
    } else if (this.selectedChapterStatus === 'HasChapters') {
      result = result.filter(c => (c.totalChapters || 0) > 0);
    } else if (this.selectedChapterStatus === 'HasChapter1') {
      result = result.filter(c => !!c.hasChapterOne);
    }

    // Sort
    result.sort((a, b) => {
      if (this.sortBy === 'views') return b.views - a.views;
      if (this.sortBy === 'rating') return b.rating - a.rating;
      if (this.sortBy === 'title') return a.title.localeCompare(b.title);
      if (this.sortBy === 'chapters') return (b.totalChapters || 0) - (a.totalChapters || 0);
      return new Date(b.updatedAt).getTime() - new Date(a.updatedAt).getTime();
    });

    this.filteredComics = result;
    this.updatePagination(resetPage);
  }

  updatePagination(resetPage: boolean = false): void {
    const total = this.filteredComics.length;
    this.totalPages = Math.max(1, Math.ceil(total / this.pageSize));

    if (resetPage || this.currentPage < 1) {
      this.currentPage = 1;
    } else if (this.currentPage > this.totalPages) {
      this.currentPage = this.totalPages;
    }

    const start = (this.currentPage - 1) * this.pageSize;
    const end = Math.min(start + this.pageSize, total);

    this.startIndex = total === 0 ? 0 : start + 1;
    this.endIndex = end;
    this.pagedComics = this.filteredComics.slice(start, end);
  }

  onPageChange(newPage: number): void {
    if (newPage >= 1 && newPage <= this.totalPages && newPage !== this.currentPage) {
      this.currentPage = newPage;
      this.updatePagination(false);

      const tableElem = document.querySelector('.table-container');
      if (tableElem) {
        tableElem.scrollIntoView({ behavior: 'smooth', block: 'start' });
      }
    }
  }

  onPageSizeChange(): void {
    this.pageSize = Number(this.pageSize);
    this.updatePagination(true);
  }

  getPageNumbers(): (number | string)[] {
    const pages: (number | string)[] = [];
    const total = this.totalPages;
    const current = this.currentPage;

    if (total <= 7) {
      for (let i = 1; i <= total; i++) pages.push(i);
      return pages;
    }

    pages.push(1);

    if (current > 3) {
      pages.push('...');
    }

    const start = Math.max(2, current - 1);
    const end = Math.min(total - 1, current + 1);

    for (let i = start; i <= end; i++) {
      pages.push(i);
    }

    if (current < total - 2) {
      pages.push('...');
    }

    pages.push(total);

    return pages;
  }

  toggleVisibility(comic: Comic): void {
    this.comicService.toggleComicVisibility(comic.id).subscribe({
      next: (res) => {
        comic.isPublic = res.isPublic;
        this.showMessage(`Đã chuyển '${comic.title}' sang ${res.isPublic ? 'Công khai' : 'Đang ẩn'}.`);
        this.applyFilters(false);
      },
      error: () => this.showMessage('Chuyển đổi trạng thái thất bại.', true)
    });
  }

  toggleFeatured(comic: Comic): void {
    this.comicService.toggleComicFeatured(comic.id).subscribe({
      next: (res) => {
        comic.isFeatured = res.isFeatured;
        this.showMessage(
          res.isFeatured
            ? `Đã chọn '${comic.title}' làm Truyện Hot Trang Chủ!`
            : `Đã bỏ chọn Truyện Hot cho '${comic.title}'.`
        );
        this.applyFilters(false);
      },
      error: () => this.showMessage('Chuyển đổi trạng thái Truyện Hot thất bại.', true)
    });
  }

  get featuredCount(): number {
    return this.comics.filter(c => c.isFeatured).length;
  }

  isUnpinning: boolean = false;

  unpinAllFeatured(): void {
    if (this.featuredCount === 0) {
      this.showMessage('Hiện tại không có bộ truyện nào được ghim Hot.', true);
      return;
    }

    const count = this.featuredCount;
    if (!confirm(`Bạn có chắc chắn muốn gỡ Hot toàn bộ ${count} bộ truyện đang ghim ngoài trang chủ không?`)) {
      return;
    }

    this.isUnpinning = true;
    this.comicService.unpinAllFeaturedComics().subscribe({
      next: (res) => {
        this.comics.forEach(c => c.isFeatured = false);
        this.applyFilters(false);
        this.showMessage(`Đã gỡ Hot thành công cho toàn bộ ${res.count} truyện!`);
        this.isUnpinning = false;
      },
      error: (err) => {
        console.error('Lỗi khi gỡ hot toàn bộ:', err);
        this.showMessage('Gỡ Hot toàn bộ thất bại, vui lòng thử lại.', true);
        this.isUnpinning = false;
      }
    });
  }

  openAddModal(): void {
    this.isEditing = false;
    this.comicForm = {
      id: 0,
      title: '',
      author: '',
      description: '',
      coverImage: 'https://images.unsplash.com/photo-1607604276583-eef5d076aa5f?auto=format&fit=crop&w=600&q=80',
      bannerImage: 'https://images.unsplash.com/photo-1563089145-599997674d42?auto=format&fit=crop&w=1200&q=80',
      status: 'Ongoing',
      isFeatured: false,
      isPublic: true,
      selectedCategoryIds: []
    };
    this.showFormModal = true;
  }

  openEditModal(comic: Comic): void {
    this.isEditing = true;
    this.comicForm = {
      id: comic.id,
      title: comic.title,
      author: comic.author || '',
      description: comic.description || '',
      coverImage: comic.coverImage || '',
      bannerImage: comic.bannerImage || '',
      status: comic.status,
      isFeatured: comic.isFeatured,
      isPublic: comic.isPublic !== false,
      selectedCategoryIds: comic.categories.map(c => c.id)
    };
    this.showFormModal = true;
  }

  closeFormModal(): void {
    this.showFormModal = false;
  }

  toggleCategorySelection(catId: number): void {
    const index = this.comicForm.selectedCategoryIds.indexOf(catId);
    if (index > -1) {
      this.comicForm.selectedCategoryIds.splice(index, 1);
    } else {
      this.comicForm.selectedCategoryIds.push(catId);
    }
  }

  saveComic(): void {
    if (!this.comicForm.title.trim()) {
      this.showMessage('Vui lòng nhập tên truyện.', true);
      return;
    }

    const payload = {
      title: this.comicForm.title.trim(),
      author: this.comicForm.author.trim(),
      description: this.comicForm.description,
      coverImage: this.comicForm.coverImage,
      bannerImage: this.comicForm.bannerImage,
      status: this.comicForm.status,
      isFeatured: this.comicForm.isFeatured,
      isPublic: this.comicForm.isPublic,
      categoryIds: this.comicForm.selectedCategoryIds
    };

    if (this.isEditing && this.comicForm.id > 0) {
      this.comicService.updateComic(this.comicForm.id, payload).subscribe({
        next: () => {
          this.showMessage('Cập nhật bộ truyện thành công!');
          this.closeFormModal();
          this.loadData(true);
        },
        error: () => this.showMessage('Cập nhật bộ truyện thất bại.', true)
      });
    } else {
      this.comicService.createComic(payload).subscribe({
        next: () => {
          this.showMessage('Thêm bộ truyện mới thành công!');
          this.closeFormModal();
          this.loadData(false);
        },
        error: () => this.showMessage('Thêm bộ truyện thất bại.', true)
      });
    }
  }

  deleteComic(comic: Comic): void {
    if (confirm(`Bạn có chắc chắn muốn xóa bộ truyện "${comic.title}"? Thao tác này không thể hoàn tác.`)) {
      this.comicService.deleteComic(comic.id).subscribe({
        next: () => {
          this.showMessage(`Đã xóa bộ truyện "${comic.title}".`);
          this.loadData(true);
        },
        error: () => this.showMessage('Xóa bộ truyện thất bại.', true)
      });
    }
  }

  // Cover Image Management Modal Methods
  openCoverManager(comic: Comic): void {
    this.selectedComicForCover = comic;
    this.coverUrlInput = comic.coverImage || '';
    this.showCoverModal = true;
  }

  closeCoverModal(): void {
    this.showCoverModal = false;
    this.selectedComicForCover = null;
  }

  selectPresetCover(url: string): void {
    this.coverUrlInput = url;
  }

  saveCoverImage(): void {
    if (!this.selectedComicForCover) return;
    if (!this.coverUrlInput.trim()) {
      this.showMessage('Vui lòng nhập hoặc chọn URL ảnh bìa.', true);
      return;
    }

    const comic = this.selectedComicForCover;
    const payload = {
      title: comic.title,
      author: comic.author || '',
      description: comic.description || '',
      coverImage: this.coverUrlInput.trim(),
      bannerImage: comic.bannerImage || '',
      status: comic.status,
      isFeatured: comic.isFeatured,
      isPublic: comic.isPublic !== false,
      categoryIds: comic.categories.map(c => c.id)
    };

    this.comicService.updateComic(comic.id, payload).subscribe({
      next: () => {
        this.showMessage(`Đã cập nhật ảnh bìa cho truyện "${comic.title}".`);
        this.closeCoverModal();
        this.loadData(true);
      },
      error: () => this.showMessage('Cập nhật ảnh bìa thất bại.', true)
    });
  }

  showMessage(msg: string, isErr = false): void {
    this.message = msg;
    this.isError = isErr;
    setTimeout(() => this.message = '', 4000);
  }
}

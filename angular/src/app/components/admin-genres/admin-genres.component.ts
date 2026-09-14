import { Component, OnInit } from '@angular/core';
import { CommonModule } from '@angular/common';
import { FormsModule } from '@angular/forms';
import { RouterLink } from '@angular/router';
import { ComicService } from '../../services/comic.service';
import { Category } from '../../models/comic.model';

@Component({
  selector: 'app-admin-genres',
  standalone: true,
  imports: [CommonModule, FormsModule, RouterLink],
  templateUrl: './admin-genres.component.html',
  styleUrls: ['./admin-genres.component.scss']
})
export class AdminGenresComponent implements OnInit {
  genres: Category[] = [];
  filteredGenres: Category[] = [];

  isLoading: boolean = true;
  message: string = '';
  isError: boolean = false;

  // Search & Filters
  searchTerm: string = '';
  sortBy: 'name' | 'nameDesc' | 'comicCount' | 'comicCountAsc' | 'id' = 'name';
  filterStatus: 'all' | 'has_comics' | 'no_comics' = 'all';

  // View Mode: 'grid' (thẻ gọn) or 'table' (bảng)
  viewMode: 'grid' | 'table' = (typeof localStorage !== 'undefined' && localStorage.getItem('admin_genres_view_mode') as 'grid' | 'table') || 'grid';

  // Modal Form State
  showFormModal: boolean = false;
  isEditing: boolean = false;
  isCustomSlug: boolean = false;

  genreForm = {
    id: 0,
    name: '',
    slug: '',
    description: '',
    imageUrl: ''
  };

  // Preset sample high quality anime / fantasy images for genres
  presetGenreImages: string[] = [
    'https://images.unsplash.com/photo-1578632767115-351597cf2477?auto=format&fit=crop&w=600&q=80',
    'https://images.unsplash.com/photo-1607604276583-eef5d076aa5f?auto=format&fit=crop&w=600&q=80',
    'https://images.unsplash.com/photo-1534447677768-be436bb09401?auto=format&fit=crop&w=600&q=80',
    'https://images.unsplash.com/photo-1569705460033-cfaa4b368e6a?auto=format&fit=crop&w=600&q=80',
    'https://images.unsplash.com/photo-1579783900882-c0d3dad7b119?auto=format&fit=crop&w=600&q=80',
    'https://images.unsplash.com/photo-1618005182384-a83a8bd57fbe?auto=format&fit=crop&w=600&q=80',
    'https://images.unsplash.com/photo-1518709268805-4e9042af9f23?auto=format&fit=crop&w=600&q=80',
    'https://images.unsplash.com/photo-1563089145-599997674d42?auto=format&fit=crop&w=600&q=80'
  ];

  defaultFallbackCover: string = 'https://images.unsplash.com/photo-1578632767115-351597cf2477?auto=format&fit=crop&w=600&q=80';

  constructor(private comicService: ComicService) {}

  ngOnInit(): void {
    this.loadGenres();
  }

  // --- STAT COMPUTATIONS ---
  get totalGenresCount(): number {
    return this.genres.length;
  }

  get totalComicsAssigned(): number {
    return this.genres.reduce((sum, g) => sum + (g.comicCount || 0), 0);
  }

  get topGenre(): Category | null {
    if (!this.genres || this.genres.length === 0) return null;
    const sorted = [...this.genres].sort((a, b) => (b.comicCount || 0) - (a.comicCount || 0));
    return sorted[0] && (sorted[0].comicCount || 0) > 0 ? sorted[0] : null;
  }

  get emptyGenresCount(): number {
    return this.genres.filter(g => !g.comicCount || g.comicCount === 0).length;
  }

  loadGenres(): void {
    this.isLoading = true;
    this.comicService.getCategories().subscribe({
      next: (data) => {
        this.genres = data || [];
        this.applyFilters();
        this.isLoading = false;
      },
      error: (err) => {
        console.error('Lỗi tải danh sách thể loại:', err);
        this.showMessage('Không thể tải danh sách thể loại.', true);
        this.isLoading = false;
      }
    });
  }

  applyFilters(): void {
    let result = [...this.genres];

    // Filter status
    if (this.filterStatus === 'has_comics') {
      result = result.filter(g => (g.comicCount || 0) > 0);
    } else if (this.filterStatus === 'no_comics') {
      result = result.filter(g => !g.comicCount || g.comicCount === 0);
    }

    // Search term
    if (this.searchTerm.trim()) {
      const q = this.searchTerm.toLowerCase().trim();
      result = result.filter(g =>
        g.name.toLowerCase().includes(q) ||
        g.slug.toLowerCase().includes(q) ||
        (g.description && g.description.toLowerCase().includes(q))
      );
    }

    // Sorting
    result.sort((a, b) => {
      if (this.sortBy === 'comicCount') return (b.comicCount || 0) - (a.comicCount || 0);
      if (this.sortBy === 'comicCountAsc') return (a.comicCount || 0) - (b.comicCount || 0);
      if (this.sortBy === 'nameDesc') return b.name.localeCompare(a.name);
      if (this.sortBy === 'id') return b.id - a.id;
      return a.name.localeCompare(b.name);
    });

    this.filteredGenres = result;
  }

  setFilterStatus(status: 'all' | 'has_comics' | 'no_comics'): void {
    this.filterStatus = status;
    this.applyFilters();
  }

  setViewMode(mode: 'grid' | 'table'): void {
    this.viewMode = mode;
    try {
      if (typeof localStorage !== 'undefined') {
        localStorage.setItem('admin_genres_view_mode', mode);
      }
    } catch (e) {
      console.warn('Cannot persist viewMode to localStorage', e);
    }
  }

  // --- SLUG AUTO GENERATION ---
  onNameChange(): void {
    if (!this.isCustomSlug && !this.isEditing) {
      this.genreForm.slug = this.generateSlug(this.genreForm.name);
    }
  }

  generateSlug(str: string): string {
    if (!str) return '';
    let slug = str.toLowerCase().trim();
    // Vietnamese accents replacement
    slug = slug.replace(/á|à|ả|ã|ạ|ă|ắ|ằ|ẳ|ẵ|ặ|â|ấ|ầ|ẩ|ẫ|ậ/g, 'a');
    slug = slug.replace(/é|è|ẻ|ẽ|ẹ|ê|ế|ề|ể|ễ|ệ/g, 'e');
    slug = slug.replace(/i|í|ì|ỉ|ĩ|ị/g, 'i');
    slug = slug.replace(/ó|ò|ỏ|õ|ọ|ô|ố|ồ|ổ|ỗ|ộ|ơ|ớ|ờ|ở|ỡ|ợ/g, 'o');
    slug = slug.replace(/ú|ù|ủ|ũ|ụ|ư|ứ|ừ|ử|ữ|ự/g, 'u');
    slug = slug.replace(/ý|ỳ|ỷ|ỹ|ỵ/g, 'y');
    slug = slug.replace(/đ/g, 'd');
    slug = slug.replace(/[^a-z0-9\s-]/g, '');
    slug = slug.replace(/\s+/g, '-').replace(/-+/g, '-');
    return slug;
  }

  onImageError(event: any): void {
    event.target.src = this.defaultFallbackCover;
  }

  // --- MODAL ACTIONS ---
  openAddModal(): void {
    this.isEditing = false;
    this.isCustomSlug = false;
    this.genreForm = {
      id: 0,
      name: '',
      slug: '',
      description: '',
      imageUrl: this.presetGenreImages[0]
    };
    this.showFormModal = true;
  }

  openEditModal(genre: Category): void {
    this.isEditing = true;
    this.isCustomSlug = true;
    this.genreForm = {
      id: genre.id,
      name: genre.name,
      slug: genre.slug,
      description: genre.description || '',
      imageUrl: genre.imageUrl || this.defaultFallbackCover
    };
    this.showFormModal = true;
  }

  closeFormModal(): void {
    this.showFormModal = false;
  }

  selectPresetImage(url: string): void {
    this.genreForm.imageUrl = url;
  }

  saveGenre(): void {
    if (!this.genreForm.name.trim()) {
      this.showMessage('Vui lòng nhập tên thể loại.', true);
      return;
    }

    const payload = {
      name: this.genreForm.name.trim(),
      slug: this.genreForm.slug.trim() || this.generateSlug(this.genreForm.name),
      description: this.genreForm.description.trim(),
      imageUrl: this.genreForm.imageUrl.trim() || this.defaultFallbackCover
    };

    if (this.isEditing && this.genreForm.id > 0) {
      this.comicService.updateCategory(this.genreForm.id, payload).subscribe({
        next: () => {
          this.showMessage(`Cập nhật thể loại "${payload.name}" thành công!`);
          this.closeFormModal();
          this.loadGenres();
        },
        error: (err) => {
          console.error('Lỗi cập nhật thể loại:', err);
          this.showMessage('Cập nhật thể loại thất bại.', true);
        }
      });
    } else {
      this.comicService.createCategory(payload).subscribe({
        next: () => {
          this.showMessage(`Thêm mới thể loại "${payload.name}" thành công!`);
          this.closeFormModal();
          this.loadGenres();
        },
        error: (err) => {
          console.error('Lỗi tạo thể loại:', err);
          this.showMessage('Tạo thể loại mới thất bại.', true);
        }
      });
    }
  }

  deleteGenre(genre: Category): void {
    let confirmMsg = `Bạn có chắc chắn muốn xóa thể loại "${genre.name}"?`;
    if (genre.comicCount && genre.comicCount > 0) {
      confirmMsg += `\n\nLưu ý: Thể loại này hiện đang được gán cho ${genre.comicCount} bộ truyện.`;
    }

    if (confirm(confirmMsg)) {
      this.comicService.deleteCategory(genre.id).subscribe({
        next: () => {
          this.showMessage(`Đã xóa thành công thể loại "${genre.name}".`);
          this.loadGenres();
        },
        error: (err) => {
          console.error('Lỗi xóa thể loại:', err);
          this.showMessage('Xóa thể loại thất bại.', true);
        }
      });
    }
  }

  showMessage(msg: string, isErr = false): void {
    this.message = msg;
    this.isError = isErr;
    setTimeout(() => this.message = '', 4500);
  }
}


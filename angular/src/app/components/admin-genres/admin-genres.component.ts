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

  // Search & Filter
  searchTerm: string = '';
  sortBy: 'name' | 'comicCount' | 'id' = 'name';

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

  // Preset sample images for genres
  presetGenreImages: string[] = [
    'https://images.unsplash.com/photo-1578632767115-351597cf2477?auto=format&fit=crop&w=600&q=80',
    'https://images.unsplash.com/photo-1607604276583-eef5d076aa5f?auto=format&fit=crop&w=600&q=80',
    'https://images.unsplash.com/photo-1534447677768-be436bb09401?auto=format&fit=crop&w=600&q=80',
    'https://images.unsplash.com/photo-1569705460033-cfaa4b368e6a?auto=format&fit=crop&w=600&q=80',
    'https://images.unsplash.com/photo-1579783900882-c0d3dad7b119?auto=format&fit=crop&w=600&q=80',
    'https://images.unsplash.com/photo-1618005182384-a83a8bd57fbe?auto=format&fit=crop&w=600&q=80'
  ];

  constructor(private comicService: ComicService) {}

  ngOnInit(): void {
    this.loadGenres();
  }

  loadGenres(): void {
    this.isLoading = true;
    this.comicService.getCategories().subscribe({
      next: (data) => {
        this.genres = data;
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

    if (this.searchTerm.trim()) {
      const q = this.searchTerm.toLowerCase().trim();
      result = result.filter(g =>
        g.name.toLowerCase().includes(q) ||
        g.slug.toLowerCase().includes(q) ||
        (g.description && g.description.toLowerCase().includes(q))
      );
    }

    result.sort((a, b) => {
      if (this.sortBy === 'comicCount') return (b.comicCount || 0) - (a.comicCount || 0);
      if (this.sortBy === 'id') return a.id - b.id;
      return a.name.localeCompare(b.name);
    });

    this.filteredGenres = result;
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

  // --- MODAL ACTIONS ---
  openAddModal(): void {
    this.isEditing = false;
    this.isCustomSlug = false;
    this.genreForm = {
      id: 0,
      name: '',
      slug: '',
      description: '',
      imageUrl: 'https://images.unsplash.com/photo-1578632767115-351597cf2477?auto=format&fit=crop&w=600&q=80'
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
      imageUrl: genre.imageUrl || 'https://images.unsplash.com/photo-1578632767115-351597cf2477?auto=format&fit=crop&w=600&q=80'
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
      imageUrl: this.genreForm.imageUrl.trim()
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
      confirmMsg += ` Thể loại này hiện đang được gán cho ${genre.comicCount} bộ truyện.`;
    }

    if (confirm(confirmMsg)) {
      this.comicService.deleteCategory(genre.id).subscribe({
        next: () => {
          this.showMessage(`Đã xóa thể loại "${genre.name}".`);
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
    setTimeout(() => this.message = '', 4000);
  }
}

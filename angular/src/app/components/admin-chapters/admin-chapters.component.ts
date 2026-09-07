import { Component, OnInit } from '@angular/core';
import { CommonModule } from '@angular/common';
import { FormsModule } from '@angular/forms';
import { ActivatedRoute, Router, RouterLink } from '@angular/router';
import { ComicService } from '../../services/comic.service';
import { ComicDetail, ChapterDetail, ChapterPage } from '../../models/comic.model';

@Component({
  selector: 'app-admin-chapters',
  standalone: true,
  imports: [CommonModule, FormsModule, RouterLink],
  templateUrl: './admin-chapters.component.html',
  styleUrls: ['./admin-chapters.component.scss']
})
export class AdminChaptersComponent implements OnInit {
  comicId: number = 0;
  comic: ComicDetail | null = null;
  chapters: ChapterDetail[] = [];
  filteredChapters: ChapterDetail[] = [];

  isLoading: boolean = true;
  message: string = '';
  isError: boolean = false;

  // Filter States
  searchTerm: string = '';
  selectedVisibility: string = 'All'; // 'All', 'Public', 'Hidden'
  sortBy: 'number-desc' | 'number-asc' | 'views' | 'date' = 'number-desc';

  // Modal State
  showFormModal: boolean = false;
  isEditing: boolean = false;

  chapterForm = {
    id: 0,
    chapterNumber: 1,
    title: '',
    isPublic: true,
    publishedAt: '', // format YYYY-MM-DDTHH:mm
    imageUrls: [] as string[]
  };

  // Preset sample page images for quick testing
  samplePageImages: string[] = [
    'https://images.unsplash.com/photo-1607604276583-eef5d076aa5f?auto=format&fit=crop&w=800&q=80',
    'https://images.unsplash.com/photo-1578632767115-351597cf2477?auto=format&fit=crop&w=800&q=80',
    'https://images.unsplash.com/photo-1534447677768-be436bb09401?auto=format&fit=crop&w=800&q=80',
    'https://images.unsplash.com/photo-1569705460033-cfaa4b368e6a?auto=format&fit=crop&w=800&q=80'
  ];

  // Raw URL input text block
  bulkUrlInput: string = '';
  showBulkUrlInput: boolean = false;

  // Upload & saving progress states
  isUploading: boolean = false;
  uploadProgressText: string = '';
  isSaving: boolean = false;

  constructor(
    private route: ActivatedRoute,
    private router: Router,
    private comicService: ComicService
  ) {}

  ngOnInit(): void {
    this.route.params.subscribe(params => {
      this.comicId = Number(params['id']);
      if (this.comicId) {
        this.loadComicAndChapters();
      }
    });
  }

  loadComicAndChapters(): void {
    this.isLoading = true;
    this.comicService.getComicById(this.comicId).subscribe({
      next: (comicData) => {
        this.comic = comicData;
        this.loadChapters();
      },
      error: (err) => {
        console.error('Lỗi tải thông tin truyện:', err);
        this.showMessage('Không tìm thấy thông tin bộ truyện này.', true);
        this.isLoading = false;
      }
    });
  }

  loadChapters(): void {
    this.comicService.getAdminChaptersByComicId(this.comicId).subscribe({
      next: (data) => {
        this.chapters = data;
        this.applyFilters();
        this.isLoading = false;
      },
      error: (err) => {
        console.error('Lỗi tải danh sách chapter:', err);
        this.showMessage('Không thể tải danh sách chapter.', true);
        this.isLoading = false;
      }
    });
  }

  applyFilters(): void {
    let result = [...this.chapters];

    // Search filter
    if (this.searchTerm.trim()) {
      const q = this.searchTerm.toLowerCase().trim();
      result = result.filter(ch =>
        ch.title.toLowerCase().includes(q) ||
        ch.chapterNumber.toString().includes(q)
      );
    }

    // Visibility filter
    if (this.selectedVisibility === 'Public') {
      result = result.filter(ch => ch.isPublic !== false);
    } else if (this.selectedVisibility === 'Hidden') {
      result = result.filter(ch => ch.isPublic === false);
    }

    // Sort
    result.sort((a, b) => {
      if (this.sortBy === 'number-asc') return a.chapterNumber - b.chapterNumber;
      if (this.sortBy === 'views') return b.views - a.views;
      if (this.sortBy === 'date') return new Date(b.createdAt).getTime() - new Date(a.createdAt).getTime();
      return b.chapterNumber - a.chapterNumber; // default number-desc
    });

    this.filteredChapters = result;
  }

  // --- MODAL & EDITOR ACTIONS ---

  openAddModal(): void {
    this.isEditing = false;
    // Calculate next chapter number
    const maxChap = this.chapters.length > 0
      ? Math.max(...this.chapters.map(c => c.chapterNumber))
      : 0;
    const nextChapNum = maxChap + 1;

    this.chapterForm = {
      id: 0,
      chapterNumber: nextChapNum,
      title: `Chapter ${nextChapNum}`,
      isPublic: true,
      publishedAt: '',
      imageUrls: []
    };
    this.bulkUrlInput = '';
    this.showBulkUrlInput = false;
    this.showFormModal = true;
  }

  openEditModal(chapter: ChapterDetail): void {
    this.isEditing = true;
    let publishedAtStr = '';
    if (chapter.publishedAt) {
      const dateObj = new Date(chapter.publishedAt);
      if (!isNaN(dateObj.getTime())) {
        // Format to ISO local datetime-local format YYYY-MM-DDTHH:mm
        const tzOffset = dateObj.getTimezoneOffset() * 60000;
        publishedAtStr = new Date(dateObj.getTime() - tzOffset).toISOString().slice(0, 16);
      }
    }

    this.chapterForm = {
      id: chapter.id,
      chapterNumber: chapter.chapterNumber,
      title: chapter.title || '',
      isPublic: chapter.isPublic !== false,
      publishedAt: publishedAtStr,
      imageUrls: chapter.pages ? chapter.pages.map(p => p.imageUrl) : []
    };
    this.bulkUrlInput = '';
    this.showBulkUrlInput = false;
    this.showFormModal = true;
  }

  closeFormModal(): void {
    this.showFormModal = false;
  }

  // --- IMAGE MANAGEMENT ---

  onFilesSelected(event: Event): void {
    const input = event.target as HTMLInputElement;
    if (!input.files || input.files.length === 0) return;

    const files = Array.from(input.files);
    this.isUploading = true;
    this.uploadProgressText = `Đang tải lên ${files.length} ảnh lên máy chủ lưu trữ...`;

    this.comicService.uploadImages(files, 'chapters').subscribe({
      next: (res) => {
        this.isUploading = false;
        if (res && res.urls && res.urls.length > 0) {
          this.chapterForm.imageUrls.push(...res.urls);
          this.showMessage(`Đã tải lên thành công ${res.urls.length} ảnh.`);
        }
      },
      error: (err) => {
        console.warn('Lỗi tải ảnh qua API upload, tự động fallback sang xử lý Base64:', err);
        let loadedCount = 0;
        files.forEach(file => {
          const reader = new FileReader();
          reader.onload = (e: ProgressEvent<FileReader>) => {
            if (e.target?.result) {
              this.chapterForm.imageUrls.push(e.target.result as string);
            }
            loadedCount++;
            if (loadedCount === files.length) {
              this.isUploading = false;
              this.showMessage(`Đã thêm ${files.length} ảnh vào danh sách.`);
            }
          };
          reader.onerror = () => {
            loadedCount++;
            if (loadedCount === files.length) {
              this.isUploading = false;
            }
          };
          reader.readAsDataURL(file);
        });
      }
    });

    input.value = ''; // reset file input
  }

  toggleBulkUrlInput(): void {
    this.showBulkUrlInput = !this.showBulkUrlInput;
  }

  addBulkUrls(): void {
    if (!this.bulkUrlInput.trim()) return;

    // Split by newlines, commas, or spaces
    const urls = this.bulkUrlInput
      .split(/[\n,\s]+/)
      .map(u => u.trim())
      .filter(u => u.length > 0 && (u.startsWith('http://') || u.startsWith('https://') || u.startsWith('data:image')));

    if (urls.length > 0) {
      this.chapterForm.imageUrls.push(...urls);
      this.bulkUrlInput = '';
      this.showBulkUrlInput = false;
      this.showMessage(`Đã thêm ${urls.length} liên kết ảnh vào chapter.`);
    } else {
      this.showMessage('Không tìm thấy đường dẫn URL ảnh hợp lệ (http:// hoặc https://).', true);
    }
  }

  addPresetImages(): void {
    this.chapterForm.imageUrls.push(...this.samplePageImages);
    this.showMessage(`Đã thêm ${this.samplePageImages.length} ảnh mẫu demo.`);
  }

  moveImageUp(index: number): void {
    if (index <= 0) return;
    const temp = this.chapterForm.imageUrls[index];
    this.chapterForm.imageUrls[index] = this.chapterForm.imageUrls[index - 1];
    this.chapterForm.imageUrls[index - 1] = temp;
  }

  moveImageDown(index: number): void {
    if (index >= this.chapterForm.imageUrls.length - 1) return;
    const temp = this.chapterForm.imageUrls[index];
    this.chapterForm.imageUrls[index] = this.chapterForm.imageUrls[index + 1];
    this.chapterForm.imageUrls[index + 1] = temp;
  }

  removeImage(index: number): void {
    this.chapterForm.imageUrls.splice(index, 1);
  }

  clearAllImages(): void {
    if (confirm('Bạn có chắc muốn xóa tất cả ảnh trong danh sách hiện tại?')) {
      this.chapterForm.imageUrls = [];
    }
  }

  // --- SAVE & DELETE ---

  saveChapter(): void {
    if (this.isSaving || this.isUploading) return;

    if (this.chapterForm.chapterNumber <= 0) {
      this.showMessage('Số Chapter phải lớn hơn 0.', true);
      return;
    }
    if (!this.chapterForm.title.trim()) {
      this.showMessage('Vui lòng nhập tên Chapter.', true);
      return;
    }
    if (this.chapterForm.imageUrls.length === 0) {
      this.showMessage('Chapter phải có ít nhất 1 ảnh trang truyện.', true);
      return;
    }

    this.isSaving = true;
    const payload = {
      comicId: this.comicId,
      chapterNumber: Number(this.chapterForm.chapterNumber),
      title: this.chapterForm.title.trim(),
      isPublic: this.chapterForm.isPublic,
      publishedAt: this.chapterForm.publishedAt ? new Date(this.chapterForm.publishedAt).toISOString() : null,
      imageUrls: this.chapterForm.imageUrls
    };

    if (this.isEditing && this.chapterForm.id > 0) {
      this.comicService.updateChapter(this.chapterForm.id, payload).subscribe({
        next: () => {
          this.isSaving = false;
          this.showMessage(`Cập nhật Chapter ${payload.chapterNumber} thành công!`);
          this.closeFormModal();
          this.loadChapters();
        },
        error: (err) => {
          this.isSaving = false;
          console.error('Lỗi cập nhật chapter:', err);
          this.showMessage(err?.error?.detail || err?.error?.message || 'Cập nhật chapter thất bại.', true);
        }
      });
    } else {
      this.comicService.addChapter(payload).subscribe({
        next: () => {
          this.isSaving = false;
          this.showMessage(`Thêm mới Chapter ${payload.chapterNumber} thành công!`);
          this.closeFormModal();
          this.loadChapters();
        },
        error: (err) => {
          this.isSaving = false;
          console.error('Lỗi thêm chapter:', err);
          this.showMessage(err?.error?.detail || err?.error?.message || 'Thêm chapter mới thất bại.', true);
        }
      });
    }
  }

  toggleVisibility(chapter: ChapterDetail): void {
    this.comicService.toggleChapterVisibility(chapter.id).subscribe({
      next: (res) => {
        chapter.isPublic = res.isPublic;
        this.showMessage(`Đã chuyển Chapter ${chapter.chapterNumber} sang ${res.isPublic ? 'Công khai' : 'Đang ẩn'}.`);
        this.applyFilters();
      },
      error: () => this.showMessage('Đổi trạng thái hiển thị chapter thất bại.', true)
    });
  }

  deleteChapter(chapter: ChapterDetail): void {
    if (confirm(`Bạn có chắc chắn muốn xóa Chapter ${chapter.chapterNumber}: "${chapter.title}"? Hành động này không thể hoàn tác.`)) {
      this.comicService.deleteChapter(chapter.id).subscribe({
        next: () => {
          this.showMessage(`Đã xóa Chapter ${chapter.chapterNumber}.`);
          this.loadChapters();
        },
        error: () => this.showMessage('Xóa chapter thất bại.', true)
      });
    }
  }

  isScheduled(chapter: ChapterDetail): boolean {
    if (!chapter.publishedAt) return false;
    return new Date(chapter.publishedAt).getTime() > new Date().getTime();
  }

  formatDate(dateStr?: string | null): string {
    if (!dateStr) return 'Xuất bản ngay';
    const d = new Date(dateStr);
    if (isNaN(d.getTime())) return dateStr;
    return d.toLocaleString('vi-VN', {
      day: '2-digit',
      month: '2-digit',
      year: 'numeric',
      hour: '2-digit',
      minute: '2-digit'
    });
  }

  showMessage(msg: string, isErr = false): void {
    this.message = msg;
    this.isError = isErr;
    setTimeout(() => this.message = '', 4000);
  }
}

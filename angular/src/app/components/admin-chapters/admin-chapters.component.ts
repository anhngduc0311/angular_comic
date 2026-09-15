import { Component, OnInit } from '@angular/core';
import { CommonModule } from '@angular/common';
import { FormsModule } from '@angular/forms';
import { ActivatedRoute, Router, RouterLink } from '@angular/router';
import { ComicService } from '../../services/comic.service';
import { ComicDetail, ChapterDetail, ChapterPage } from '../../models/comic.model';
import JSZip from 'jszip';

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

  // Download chapter as ZIP states
  isDownloadingMap: { [chapterId: number]: boolean } = {};
  downloadProgressMap: { [chapterId: number]: string } = {};

  // Unzip ZIP chapter states
  isUnzipping: boolean = false;
  unzipProgressText: string = '';

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

  async onZipFileSelected(event: Event): Promise<void> {
    const input = event.target as HTMLInputElement;
    if (!input.files || input.files.length === 0) return;

    const file = input.files[0];
    this.isUnzipping = true;
    this.unzipProgressText = `Đang đọc file ${file.name}...`;

    try {
      // 1. Gợi ý số chapter từ tên file nếu chưa sửa và chapterNumber đang mặc định
      if (!this.isEditing) {
        const match = file.name.match(/(?:chap|chapter|c|ch)?[_.\s-]*([0-9]+(?:\.[0-9]+)?)/i);
        if (match && match[1]) {
          const parsedNum = parseFloat(match[1]);
          if (!isNaN(parsedNum)) {
            this.chapterForm.chapterNumber = parsedNum;
            this.chapterForm.title = `Chapter ${parsedNum}`;
          }
        }
      }

      // 2. Đọc file nén ZIP bằng JSZip
      const zip = await JSZip.loadAsync(file);
      const validExts = ['.jpg', '.jpeg', '.png', '.webp', '.avif', '.gif'];

      // Lọc các file ảnh hợp lệ, loại bỏ các file rác của hệ điều hành
      const entries: { name: string; entry: any }[] = [];
      zip.forEach((relativePath, zipEntry) => {
        if (zipEntry.dir) return;
        const lower = relativePath.toLowerCase();
        if (lower.includes('__macosx') || lower.includes('.ds_store') || lower.includes('thumbs.db')) return;
        if (validExts.some(ext => lower.endsWith(ext))) {
          entries.push({ name: relativePath, entry: zipEntry });
        }
      });

      if (entries.length === 0) {
        this.showMessage('Không tìm thấy file ảnh hợp lệ (.jpg, .png, .webp) nào bên trong file ZIP.', true);
        this.isUnzipping = false;
        input.value = '';
        return;
      }

      // 3. Sắp xếp tự nhiên theo tên file (natural alphanumeric sort: 1, 2, ... 10 thay vì 1, 10, 2)
      entries.sort((a, b) => a.name.localeCompare(b.name, undefined, { numeric: true, sensitivity: 'base' }));

      this.unzipProgressText = `Đã tìm thấy ${entries.length} trang ảnh. Đang trích xuất dữ liệu...`;

      // 4. Trích xuất từng file thành File object
      const extractedFiles: File[] = [];
      for (let i = 0; i < entries.length; i++) {
        const item = entries[i];
        const blob = await item.entry.async('blob');
        const filename = item.name.split('/').pop() || `page_${i + 1}.jpg`;
        const imageFile = new File([blob], filename, { type: blob.type || 'image/jpeg' });
        extractedFiles.push(imageFile);
      }

      // 5. Upload các trang ảnh lên Cloud Storage
      this.unzipProgressText = `Đang tải ${extractedFiles.length} trang ảnh lên máy chủ lưu trữ...`;
      this.comicService.uploadImages(extractedFiles, 'chapters').subscribe({
        next: (res) => {
          this.isUnzipping = false;
          if (res && res.urls && res.urls.length > 0) {
            this.chapterForm.imageUrls.push(...res.urls);
            this.showMessage(`Đã giải nén và tải lên thành công ${res.urls.length} trang ảnh từ file ZIP!`);
          }
        },
        error: (err) => {
          console.warn('Lỗi upload ảnh ZIP qua API, tự động fallback sang Base64:', err);
          let loadedCount = 0;
          extractedFiles.forEach(f => {
            const reader = new FileReader();
            reader.onload = (e: ProgressEvent<FileReader>) => {
              if (e.target?.result) {
                this.chapterForm.imageUrls.push(e.target.result as string);
              }
              loadedCount++;
              if (loadedCount === extractedFiles.length) {
                this.isUnzipping = false;
                this.showMessage(`Đã giải nén và thêm ${extractedFiles.length} ảnh vào chapter.`);
              }
            };
            reader.onerror = () => {
              loadedCount++;
              if (loadedCount === extractedFiles.length) {
                this.isUnzipping = false;
              }
            };
            reader.readAsDataURL(f);
          });
        }
      });
    } catch (err) {
      console.error('Lỗi khi đọc file ZIP:', err);
      this.showMessage('Không thể đọc hoặc giải nén file ZIP này. Vui lòng thử lại.', true);
      this.isUnzipping = false;
    }

    input.value = '';
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

  downloadChapter(chapter: ChapterDetail): void {
    if (this.isDownloadingMap[chapter.id]) return;

    this.isDownloadingMap[chapter.id] = true;
    this.downloadProgressMap[chapter.id] = 'Đang tải file ZIP từ máy chủ...';

    // 1. Ưu tiên tải trực tiếp từ Backend để vượt qua hoàn toàn rào cản CORS của CDN
    this.comicService.downloadChapterZip(chapter.id).subscribe({
      next: (blob: Blob) => {
        const comicName = (this.comic?.title || 'Comic').replace(/[/\\?%*:|"<>]/g, '_').trim();
        const zipFilename = `${comicName} - Chap ${chapter.chapterNumber}.zip`;

        const downloadUrl = URL.createObjectURL(blob);
        const link = document.createElement('a');
        link.href = downloadUrl;
        link.download = zipFilename;
        document.body.appendChild(link);
        link.click();
        document.body.removeChild(link);
        setTimeout(() => URL.revokeObjectURL(downloadUrl), 10000);

        this.isDownloadingMap[chapter.id] = false;
        delete this.downloadProgressMap[chapter.id];
        this.showMessage(`Đã tải xuống thành công Chapter ${chapter.chapterNumber} (.zip)!`);
      },
      error: async (err) => {
        console.warn('Backend download gặp sự cố, tự động fallback sang client-side download:', err);
        this.downloadProgressMap[chapter.id] = 'Máy chủ bận, đang chuyển sang tải client-side...';
        await this.downloadChapterClientSide(chapter);
      }
    });
  }

  async downloadChapterClientSide(chapter: ChapterDetail): Promise<void> {
    try {
      // 1. Tải chi tiết chapter nếu pages chưa được nạp
      let pages = chapter.pages;
      if (!pages || pages.length === 0) {
        try {
          const detail = await this.comicService.getChapterById(chapter.id).toPromise();
          if (detail && detail.pages) {
            pages = detail.pages;
            chapter.pages = detail.pages;
          }
        } catch (e) {
          console.warn('Không thể tải chi tiết chapter qua getChapterById:', e);
        }
      }

      if (!pages || pages.length === 0) {
        this.showMessage(`Chapter ${chapter.chapterNumber} chưa có trang ảnh nào để tải về.`, true);
        this.isDownloadingMap[chapter.id] = false;
        delete this.downloadProgressMap[chapter.id];
        return;
      }

      this.downloadProgressMap[chapter.id] = `Bắt đầu tải ${pages.length} ảnh...`;
      const zip = new JSZip();

      // 2. Lần lượt tải từng ảnh (thử direct fetch trước, fallback qua proxy nếu bị CORS)
      let successCount = 0;
      for (let i = 0; i < pages.length; i++) {
        const page = pages[i];
        const pageNum = i + 1;
        this.downloadProgressMap[chapter.id] = `Đang tải ảnh ${pageNum}/${pages.length}...`;

        try {
          if (page.imageUrl.startsWith('data:image/')) {
            const res = await fetch(page.imageUrl);
            const blob = await res.blob();
            let ext = 'jpg';
            if (page.imageUrl.includes('image/png')) ext = 'png';
            else if (page.imageUrl.includes('image/webp')) ext = 'webp';
            zip.file(`${String(pageNum).padStart(3, '0')}.${ext}`, blob);
            successCount++;
            continue;
          }

          let response: Response;
          try {
            response = await fetch(page.imageUrl);
            if (!response.ok) throw new Error(`HTTP ${response.status}`);
          } catch (directErr) {
            // Khi bị chặn CORS từ CDN (img.truyenkomi.site), tự động gọi qua proxy của Backend
            const proxyUrl = this.comicService.getImageProxyUrl(page.imageUrl);
            response = await fetch(proxyUrl);
            if (!response.ok) throw new Error(`Proxy HTTP ${response.status}`);
          }

          const blob = await response.blob();

          let ext = 'jpg';
          const match = page.imageUrl.match(/\.(jpg|jpeg|png|webp|avif|gif)(?:\?.*)?$/i);
          if (match) {
            ext = match[1].toLowerCase();
            if (ext === 'jpeg') ext = 'jpg';
          } else if (blob.type) {
            const typeMatch = blob.type.split('/')[1];
            if (typeMatch) ext = typeMatch;
          }

          const filename = `${String(pageNum).padStart(3, '0')}.${ext}`;
          zip.file(filename, blob);
          successCount++;
        } catch (err) {
          console.warn(`Lỗi khi tải trang ${pageNum} (${page.imageUrl}):`, err);
        }
      }

      if (successCount === 0) {
        this.showMessage(`Không thể tải trang ảnh nào của Chapter ${chapter.chapterNumber}. Vui lòng kiểm tra lại kết nối mạng.`, true);
        this.isDownloadingMap[chapter.id] = false;
        delete this.downloadProgressMap[chapter.id];
        return;
      }

      // 3. Đóng gói ZIP (Dùng Level 1 để nén nhanh hơn gấp 5 lần với ảnh đã nén sẵn)
      this.downloadProgressMap[chapter.id] = 'Đang đóng gói file ZIP...';
      const zipBlob = await zip.generateAsync({
        type: 'blob',
        compression: 'DEFLATE',
        compressionOptions: { level: 1 }
      });

      // 4. Kích hoạt tải xuống trình duyệt
      const comicName = (this.comic?.title || 'Comic').replace(/[/\\?%*:|"<>]/g, '_').trim();
      const zipFilename = `${comicName} - Chap ${chapter.chapterNumber}.zip`;

      const downloadUrl = URL.createObjectURL(zipBlob);
      const link = document.createElement('a');
      link.href = downloadUrl;
      link.download = zipFilename;
      document.body.appendChild(link);
      link.click();
      document.body.removeChild(link);
      setTimeout(() => URL.revokeObjectURL(downloadUrl), 10000);

      this.showMessage(`Đã tải xuống thành công Chapter ${chapter.chapterNumber} (${successCount}/${pages.length} trang ảnh)!`);
    } catch (err) {
      console.error('Lỗi tải chapter:', err);
      this.showMessage('Đã xảy ra lỗi khi tải chapter về máy.', true);
    } finally {
      this.isDownloadingMap[chapter.id] = false;
      delete this.downloadProgressMap[chapter.id];
    }
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

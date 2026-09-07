import { Component, OnInit } from '@angular/core';
import { CommonModule } from '@angular/common';
import { FormsModule } from '@angular/forms';
import { ActivatedRoute, Router, RouterLink } from '@angular/router';
import { ComicService } from '../../services/comic.service';
import { Category, ComicDetail } from '../../models/comic.model';

@Component({
  selector: 'app-admin-story-form',
  standalone: true,
  imports: [CommonModule, FormsModule, RouterLink],
  templateUrl: './admin-story-form.component.html',
  styleUrls: ['./admin-story-form.component.scss']
})
export class AdminStoryFormComponent implements OnInit {
  isEditing: boolean = false;
  comicId: number | null = null;
  isLoading: boolean = false;
  isSaving: boolean = false;

  categories: Category[] = [];
  message: string = '';
  isError: boolean = false;

  // Form model containing all 11 required fields + optional meta
  form = {
    title: '',
    slug: '',
    otherNames: '',
    coverImage: 'https://images.unsplash.com/photo-1607604276583-eef5d076aa5f?auto=format&fit=crop&w=600&q=80',
    bannerImage: 'https://images.unsplash.com/photo-1563089145-599997674d42?auto=format&fit=crop&w=1200&q=80',
    author: '',
    artist: '',
    description: '',
    selectedCategoryIds: [] as number[],
    status: 'Ongoing',
    country: 'Nhật Bản',
    releaseYear: new Date().getFullYear(),
    isFeatured: false,
    isPublic: true
  };

  // Preset covers gallery
  showPresetModal: boolean = false;
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

  statusOptions = [
    { value: 'Ongoing', label: 'Đang tiến hành' },
    { value: 'Completed', label: 'Hoàn thành' },
    { value: 'Paused', label: 'Tạm ngưng' }
  ];

  countryOptions = [
    'Nhật Bản',
    'Hàn Quốc',
    'Trung Quốc',
    'Mỹ',
    'Khác'
  ];

  private manualSlugEdited: boolean = false;

  constructor(
    private route: ActivatedRoute,
    private router: Router,
    private comicService: ComicService
  ) {}

  ngOnInit(): void {
    this.loadCategories();
    this.checkRouteMode();
  }

  loadCategories(): void {
    this.comicService.getCategories().subscribe({
      next: (cats) => this.categories = cats,
      error: (err) => console.error('Lỗi tải danh mục:', err)
    });
  }

  checkRouteMode(): void {
    const routeId = this.route.snapshot.paramMap.get('id');
    const queryId = this.route.snapshot.queryParamMap.get('id');
    const targetId = routeId ? parseInt(routeId, 10) : (queryId ? parseInt(queryId, 10) : null);

    if (targetId && !isNaN(targetId)) {
      this.isEditing = true;
      this.comicId = targetId;
      this.fetchComicData(targetId);
    }
  }

  fetchComicData(id: number): void {
    this.isLoading = true;
    this.comicService.getComicById(id).subscribe({
      next: (comic: ComicDetail) => {
        this.isLoading = false;
        this.form = {
          title: comic.title || '',
          slug: comic.slug || '',
          otherNames: comic.otherNames || '',
          coverImage: comic.coverImage || '',
          bannerImage: comic.bannerImage || '',
          author: comic.author || '',
          artist: comic.artist || '',
          description: comic.description || '',
          selectedCategoryIds: comic.categories ? comic.categories.map(c => c.id) : [],
          status: comic.status || 'Ongoing',
          country: comic.country || 'Nhật Bản',
          releaseYear: comic.releaseYear || new Date().getFullYear(),
          isFeatured: comic.isFeatured || false,
          isPublic: comic.isPublic !== false
        };
        this.manualSlugEdited = true;
      },
      error: (err) => {
        this.isLoading = false;
        this.showMessage('Không thể tải thông tin bộ truyện này.', true);
      }
    });
  }

  onTitleChange(): void {
    if (!this.manualSlugEdited || !this.form.slug) {
      this.form.slug = this.slugify(this.form.title);
    }
  }

  onSlugInput(): void {
    this.manualSlugEdited = true;
  }

  slugify(text: string): string {
    if (!text) return '';
    return text
      .toLowerCase()
      .normalize('NFD')
      .replace(/[\u0300-\u036f]/g, '')
      .replace(/[đĐ]/g, 'd')
      .replace(/[^a-z0-9\s-]/g, '')
      .trim()
      .replace(/\s+/g, '-');
  }

  toggleCategory(catId: number): void {
    const index = this.form.selectedCategoryIds.indexOf(catId);
    if (index > -1) {
      this.form.selectedCategoryIds.splice(index, 1);
    } else {
      this.form.selectedCategoryIds.push(catId);
    }
  }

  isCategorySelected(catId: number): boolean {
    return this.form.selectedCategoryIds.includes(catId);
  }

  selectPresetCover(url: string): void {
    this.form.coverImage = url;
    this.showPresetModal = false;
  }

  saveStory(): void {
    if (!this.form.title.trim()) {
      this.showMessage('Vui lòng nhập tên truyện.', true);
      return;
    }

    if (!this.form.slug.trim()) {
      this.form.slug = this.slugify(this.form.title);
    }

    this.isSaving = true;
    const payload = {
      title: this.form.title.trim(),
      slug: this.form.slug.trim(),
      otherNames: this.form.otherNames.trim(),
      coverImage: this.form.coverImage.trim(),
      bannerImage: this.form.bannerImage.trim(),
      author: this.form.author.trim(),
      artist: this.form.artist.trim(),
      description: this.form.description,
      status: this.form.status,
      country: this.form.country,
      releaseYear: this.form.releaseYear ? Number(this.form.releaseYear) : null,
      isFeatured: this.form.isFeatured,
      isPublic: this.form.isPublic,
      categoryIds: this.form.selectedCategoryIds
    };

    if (this.isEditing && this.comicId) {
      this.comicService.updateComic(this.comicId, payload).subscribe({
        next: () => {
          this.isSaving = false;
          this.showMessage('Cập nhật truyện thành công!');
          setTimeout(() => this.router.navigate(['/admin/stories']), 1200);
        },
        error: (err) => {
          this.isSaving = false;
          this.showMessage('Cập nhật thất bại. Vui lòng thử lại.', true);
        }
      });
    } else {
      this.comicService.createComic(payload).subscribe({
        next: () => {
          this.isSaving = false;
          this.showMessage('Thêm bộ truyện mới thành công!');
          setTimeout(() => this.router.navigate(['/admin/stories']), 1200);
        },
        error: (err) => {
          this.isSaving = false;
          this.showMessage('Thêm truyện mới thất bại. Vui lòng thử lại.', true);
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

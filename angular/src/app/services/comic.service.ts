import { Injectable } from '@angular/core';
import { Observable, of, tap } from 'rxjs';
import { ApiService } from './api.service';
import { Comic, ComicDetail, Category, ChapterDetail, Comment, DashboardStats, SearchAutocompleteItem, SearchFilter, PagedResult, ComicRatingSummary, ComicReview } from '../models/comic.model';

@Injectable({
  providedIn: 'root'
})
export class ComicService {
  constructor(private api: ApiService) {}

  getFeaturedComics(criteria?: string, count: number = 10): Observable<Comic[]> {
    const params = [];
    if (criteria) params.push(`criteria=${encodeURIComponent(criteria)}`);
    if (count) params.push(`count=${count}`);
    const query = params.length ? `?${params.join('&')}` : '';
    return this.api.get<Comic[]>(`comics/featured${query}`);
  }

  getLatestComics(count = 12): Observable<Comic[]> {
    return this.api.get<Comic[]>(`comics/latest?count=${count}`);
  }

  autocomplete(query: string, limit = 6): Observable<SearchAutocompleteItem[]> {
    if (!query || !query.trim()) {
      return new Observable(obs => obs.next([]));
    }
    return this.api.get<SearchAutocompleteItem[]>(`comics/autocomplete?q=${encodeURIComponent(query.trim())}&limit=${limit}`);
  }

  searchComics(query?: string, category?: string, status?: string, sortBy?: string, country?: string, page: number = 1, pageSize: number = 24): Observable<PagedResult<Comic>> {
    let params = [];
    if (query) params.push(`q=${encodeURIComponent(query)}`);
    if (category) params.push(`category=${encodeURIComponent(category)}`);
    if (status) params.push(`status=${encodeURIComponent(status)}`);
    if (sortBy) params.push(`sortBy=${encodeURIComponent(sortBy)}`);
    if (country && country !== 'All') params.push(`country=${encodeURIComponent(country)}`);
    if (page) params.push(`page=${page}`);
    if (pageSize) params.push(`pageSize=${pageSize}`);
    
    const queryString = params.length ? `?${params.join('&')}` : '';
    return this.api.get<PagedResult<Comic>>(`comics/search${queryString}`);
  }

  advancedSearch(filter: SearchFilter): Observable<PagedResult<Comic>> {
    let params = [];
    if (filter.query) params.push(`q=${encodeURIComponent(filter.query)}`);
    if (filter.includeCategories && filter.includeCategories.length > 0) {
      params.push(`includeCategories=${encodeURIComponent(filter.includeCategories.join(','))}`);
    }
    if (filter.excludeCategories && filter.excludeCategories.length > 0) {
      params.push(`excludeCategories=${encodeURIComponent(filter.excludeCategories.join(','))}`);
    }
    if (filter.status && filter.status !== 'All') {
      params.push(`status=${encodeURIComponent(filter.status)}`);
    }
    if (filter.country && filter.country !== 'All') {
      params.push(`country=${encodeURIComponent(filter.country)}`);
    }
    if (filter.minChapters && filter.minChapters > 0) {
      params.push(`minChapters=${filter.minChapters}`);
    }
    if (filter.sortBy) {
      params.push(`sortBy=${encodeURIComponent(filter.sortBy)}`);
    }
    if (filter.page) {
      params.push(`page=${filter.page}`);
    }
    if (filter.pageSize) {
      params.push(`pageSize=${filter.pageSize}`);
    }

    const queryString = params.length ? `?${params.join('&')}` : '';
    return this.api.get<PagedResult<Comic>>(`comics/advanced-search${queryString}`);
  }

  getComicBySlug(slug: string): Observable<ComicDetail> {
    return this.api.get<ComicDetail>(`comics/${slug}`);
  }

  getComicById(id: number): Observable<ComicDetail> {
    return this.api.get<ComicDetail>(`admin/comics/${id}`);
  }

  private chapterCache = new Map<string, { data: ChapterDetail; timestamp: number }>();
  private readonly CHAPTER_CACHE_TTL = 15 * 60 * 1000; // 15 mins cache

  getChapterById(id: number): Observable<ChapterDetail> {
    const cacheKey = `id_${id}`;
    const cached = this.chapterCache.get(cacheKey);
    if (cached && (Date.now() - cached.timestamp < this.CHAPTER_CACHE_TTL)) {
      return of(cached.data);
    }
    return this.api.get<ChapterDetail>(`chapters/${id}`).pipe(
      tap(detail => {
        if (detail) {
          this.chapterCache.set(cacheKey, { data: detail, timestamp: Date.now() });
          if (detail.comicSlug && detail.chapterNumber !== undefined) {
            this.chapterCache.set(`slug_${detail.comicSlug}_${detail.chapterNumber}`, { data: detail, timestamp: Date.now() });
          }
        }
      })
    );
  }

  getChapterBySlugAndNumber(comicSlug: string, chapterNumber: number): Observable<ChapterDetail> {
    const cacheKey = `slug_${comicSlug}_${chapterNumber}`;
    const cached = this.chapterCache.get(cacheKey);
    if (cached && (Date.now() - cached.timestamp < this.CHAPTER_CACHE_TTL)) {
      return of(cached.data);
    }
    return this.api.get<ChapterDetail>(`chapters/by-slug/${comicSlug}/chuong-${chapterNumber}`).pipe(
      tap(detail => {
        if (detail) {
          this.chapterCache.set(cacheKey, { data: detail, timestamp: Date.now() });
          if (detail.id) {
            this.chapterCache.set(`id_${detail.id}`, { data: detail, timestamp: Date.now() });
          }
        }
      })
    );
  }

  /**
   * Tải trước ảnh vào bộ nhớ đệm trình duyệt (Browser Cache)
   * Giúp khi chuyển trang hoặc mở chương, ảnh đã có sẵn trong máy không cần chờ mạng.
   */
  preloadChapterImages(pages: { imageUrl: string }[], count: number = 5): void {
    if (!pages || !pages.length) return;
    const targets = pages.slice(0, count);
    targets.forEach((p, idx) => {
      if (p && p.imageUrl) {
        const img = new Image();
        if ('fetchPriority' in img) {
          (img as any).fetchPriority = idx < 2 ? 'high' : 'auto';
        }
        img.src = p.imageUrl;
      }
    });
  }

  getCategories(onlyWithComics = false): Observable<Category[]> {
    const query = onlyWithComics ? '?onlyWithComics=true' : '';
    return this.api.get<Category[]>(`categories${query}`);
  }

  getComicComments(comicId: number, page = 1, pageSize = 20): Observable<PagedResult<Comment>> {
    return this.api.get<PagedResult<Comment>>(`comics/${comicId}/comments?page=${page}&pageSize=${pageSize}`);
  }

  getComicCommentsBySlug(slug: string, page = 1, pageSize = 20): Observable<PagedResult<Comment>> {
    return this.api.get<PagedResult<Comment>>(`comics/slug/${encodeURIComponent(slug)}/comments?page=${page}&pageSize=${pageSize}`);
  }

  addComment(data: { comicId: number; chapterId?: number; content: string }): Observable<Comment> {
    return this.api.post<Comment>('comics/comments', data);
  }

  // File Upload to MinIO Storage
  uploadImage(file: File, folder = 'covers'): Observable<{ url: string }> {
    const formData = new FormData();
    formData.append('file', file);
    return this.api.post<{ url: string }>(`upload/image?folder=${folder}`, formData);
  }

  uploadImages(files: FileList | File[], folder = 'chapters'): Observable<{ urls: string[] }> {
    const formData = new FormData();
    Array.from(files).forEach(file => formData.append('files', file));
    return this.api.post<{ urls: string[] }>(`upload/images?folder=${folder}`, formData);
  }

  // Admin Actions
  getAdminDashboardStats(): Observable<DashboardStats> {
    return this.api.get<DashboardStats>('admin/stats');
  }

  getAdminComics(): Observable<Comic[]> {
    return this.api.get<Comic[]>('admin/comics');
  }

  createComic(data: any): Observable<Comic> {
    return this.api.post<Comic>('admin/comics', data);
  }

  updateComic(id: number, data: any): Observable<Comic> {
    return this.api.put<Comic>(`admin/comics/${id}`, data);
  }

  toggleComicVisibility(id: number): Observable<{ success: boolean; isPublic: boolean }> {
    return this.api.put<{ success: boolean; isPublic: boolean }>(`admin/comics/${id}/toggle-visibility`, {});
  }

  toggleComicFeatured(id: number): Observable<{ success: boolean; isFeatured: boolean }> {
    return this.api.put<{ success: boolean; isFeatured: boolean }>(`admin/comics/${id}/toggle-featured`, {});
  }

  unpinAllFeaturedComics(): Observable<{ success: boolean; count: number }> {
    return this.api.put<{ success: boolean; count: number }>('admin/comics/unpin-all-featured', {});
  }

  deleteComic(id: number): Observable<{ success: boolean }> {
    return this.api.delete<{ success: boolean }>(`admin/comics/${id}`);
  }

  getAdminChaptersByComicId(comicId: number): Observable<ChapterDetail[]> {
    return this.api.get<ChapterDetail[]>(`admin/comics/${comicId}/chapters`);
  }

  downloadChapterZip(chapterId: number): Observable<Blob> {
    return this.api.getBlob(`chapters/${chapterId}/download`);
  }

  getImageProxyUrl(imageUrl: string): string {
    return `${this.api.getBaseUrl()}/chapters/proxy-image?url=${encodeURIComponent(imageUrl)}`;
  }

  addChapter(data: any): Observable<any> {
    return this.api.post<any>('admin/chapters', data);
  }

  updateChapter(id: number, data: any): Observable<any> {
    return this.api.put<any>(`admin/chapters/${id}`, data);
  }

  toggleChapterVisibility(id: number): Observable<{ success: boolean; isPublic: boolean }> {
    return this.api.put<{ success: boolean; isPublic: boolean }>(`admin/chapters/${id}/toggle-visibility`, {});
  }

  deleteChapter(id: number): Observable<{ success: boolean }> {
    return this.api.delete<{ success: boolean }>(`admin/chapters/${id}`);
  }

  createCategory(data: any): Observable<Category> {
    return this.api.post<Category>('admin/categories', data);
  }

  updateCategory(id: number, data: any): Observable<Category> {
    return this.api.put<Category>(`admin/categories/${id}`, data);
  }

  deleteCategory(id: number): Observable<{ success: boolean }> {
    return this.api.delete<{ success: boolean }>(`admin/categories/${id}`);
  }

  getAdminComments(): Observable<Comment[]> {
    return this.api.get<Comment[]>('admin/comments');
  }

  toggleCommentHidden(id: number): Observable<{ success: boolean; isHidden: boolean }> {
    return this.api.put<{ success: boolean; isHidden: boolean }>(`admin/comments/${id}/toggle-hidden`, {});
  }

  resolveCommentReport(id: number): Observable<{ success: boolean }> {
    return this.api.put<{ success: boolean }>(`admin/comments/${id}/resolve-report`, {});
  }

  deleteComment(id: number): Observable<{ success: boolean }> {
    return this.api.delete<{ success: boolean }>(`admin/comments/${id}`);
  }

  // Comic Rating & Reviews
  submitRating(comicId: number, score: number, review?: string): Observable<ComicRatingSummary> {
    return this.api.post<ComicRatingSummary>(`comics/${comicId}/ratings`, { score, review });
  }

  getRatingSummary(comicId: number): Observable<ComicRatingSummary> {
    return this.api.get<ComicRatingSummary>(`comics/${comicId}/rating-summary`);
  }

  getComicReviews(comicId: number, page: number = 1, pageSize: number = 10): Observable<PagedResult<ComicReview>> {
    return this.api.get<PagedResult<ComicReview>>(`comics/${comicId}/reviews?page=${page}&pageSize=${pageSize}`);
  }
}

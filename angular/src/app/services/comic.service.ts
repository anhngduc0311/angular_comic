import { Injectable } from '@angular/core';
import { Observable } from 'rxjs';
import { ApiService } from './api.service';
import { Comic, ComicDetail, Category, ChapterDetail, Comment, DashboardStats, SearchAutocompleteItem, SearchFilter, PagedResult } from '../models/comic.model';

@Injectable({
  providedIn: 'root'
})
export class ComicService {
  constructor(private api: ApiService) {}

  getFeaturedComics(): Observable<Comic[]> {
    return this.api.get<Comic[]>('comics/featured');
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

  searchComics(query?: string, category?: string, status?: string, sortBy?: string): Observable<Comic[]> {
    let params = [];
    if (query) params.push(`q=${encodeURIComponent(query)}`);
    if (category) params.push(`category=${encodeURIComponent(category)}`);
    if (status) params.push(`status=${encodeURIComponent(status)}`);
    if (sortBy) params.push(`sortBy=${encodeURIComponent(sortBy)}`);
    
    const queryString = params.length ? `?${params.join('&')}` : '';
    return this.api.get<Comic[]>(`comics/search${queryString}`);
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

  getChapterById(id: number): Observable<ChapterDetail> {
    return this.api.get<ChapterDetail>(`chapters/${id}`);
  }

  getChapterBySlugAndNumber(comicSlug: string, chapterNumber: number): Observable<ChapterDetail> {
    return this.api.get<ChapterDetail>(`chapters/by-slug/${comicSlug}/chuong-${chapterNumber}`);
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

  createComic(data: any): Observable<Comic> {
    return this.api.post<Comic>('admin/comics', data);
  }

  updateComic(id: number, data: any): Observable<Comic> {
    return this.api.put<Comic>(`admin/comics/${id}`, data);
  }

  toggleComicVisibility(id: number): Observable<{ success: boolean; isPublic: boolean }> {
    return this.api.put<{ success: boolean; isPublic: boolean }>(`admin/comics/${id}/toggle-visibility`, {});
  }

  deleteComic(id: number): Observable<{ success: boolean }> {
    return this.api.delete<{ success: boolean }>(`admin/comics/${id}`);
  }

  getAdminChaptersByComicId(comicId: number): Observable<ChapterDetail[]> {
    return this.api.get<ChapterDetail[]>(`admin/comics/${comicId}/chapters`);
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
}

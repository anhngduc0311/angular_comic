import { Injectable } from '@angular/core';
import { Observable } from 'rxjs';
import { ApiService } from './api.service';
import { Comic, ComicDetail, Category, ChapterDetail, Comment, DashboardStats } from '../models/comic.model';

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

  searchComics(query?: string, category?: string, status?: string, sortBy?: string): Observable<Comic[]> {
    let params = [];
    if (query) params.push(`q=${encodeURIComponent(query)}`);
    if (category) params.push(`category=${encodeURIComponent(category)}`);
    if (status) params.push(`status=${encodeURIComponent(status)}`);
    if (sortBy) params.push(`sortBy=${encodeURIComponent(sortBy)}`);
    
    const queryString = params.length ? `?${params.join('&')}` : '';
    return this.api.get<Comic[]>(`comics/search${queryString}`);
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

  getCategories(): Observable<Category[]> {
    return this.api.get<Category[]>('categories');
  }

  addComment(data: { comicId: number; chapterId?: number; content: string }): Observable<Comment> {
    return this.api.post<Comment>('comics/comments', data);
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

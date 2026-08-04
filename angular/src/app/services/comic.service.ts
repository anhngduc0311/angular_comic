import { Injectable } from '@angular/core';
import { Observable } from 'rxjs';
import { ApiService } from './api.service';
import { Comic, ComicDetail, Category, ChapterDetail, Comment } from '../models/comic.model';

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
  createComic(data: any): Observable<Comic> {
    return this.api.post<Comic>('admin/comics', data);
  }

  updateComic(id: number, data: any): Observable<Comic> {
    return this.api.put<Comic>(`admin/comics/${id}`, data);
  }

  deleteComic(id: number): Observable<{ success: boolean }> {
    return this.api.delete<{ success: boolean }>(`admin/comics/${id}`);
  }

  addChapter(data: any): Observable<any> {
    return this.api.post<any>('admin/chapters', data);
  }
}

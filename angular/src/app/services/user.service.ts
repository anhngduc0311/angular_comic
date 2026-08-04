import { Injectable } from '@angular/core';
import { Observable } from 'rxjs';
import { ApiService } from './api.service';
import { Bookmark, ReadingHistory, UserProfile, UserComment } from '../models/user.model';

@Injectable({
  providedIn: 'root'
})
export class UserService {
  constructor(private api: ApiService) {}

  getProfile(): Observable<UserProfile> {
    return this.api.get<UserProfile>('user/profile');
  }

  getUserComments(): Observable<UserComment[]> {
    return this.api.get<UserComment[]>('user/comments');
  }

  getBookmarks(): Observable<Bookmark[]> {
    return this.api.get<Bookmark[]>('user/bookmarks');
  }

  addBookmark(comicId: number): Observable<{ success: boolean }> {
    return this.api.post<{ success: boolean }>('user/bookmarks', { comicId });
  }

  removeBookmark(comicId: number): Observable<{ success: boolean }> {
    return this.api.delete<{ success: boolean }>(`user/bookmarks/${comicId}`);
  }

  getHistory(): Observable<ReadingHistory[]> {
    return this.api.get<ReadingHistory[]>('user/history');
  }

  trackHistory(comicId: number, chapterId: number): Observable<{ success: boolean }> {
    return this.api.post<{ success: boolean }>('user/history', { comicId, chapterId });
  }
}

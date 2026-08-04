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

  updateProfile(data: { fullName?: string; avatar?: string; email?: string }): Observable<UserProfile> {
    return this.api.put<UserProfile>('user/profile', data);
  }

  changePassword(data: { currentPassword: string; newPassword: string }): Observable<{ success: boolean; message: string }> {
    return this.api.put<{ success: boolean; message: string }>('user/change-password', data);
  }

  deleteAccount(data: { password: string }): Observable<{ success: boolean; message: string }> {
    return this.api.post<{ success: boolean; message: string }>('user/delete-account', data);
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

  // Admin Methods
  getAdminUsers(): Observable<UserProfile[]> {
    return this.api.get<UserProfile[]>('admin/users');
  }

  toggleUserLock(id: number): Observable<{ success: boolean; isLocked: boolean }> {
    return this.api.put<{ success: boolean; isLocked: boolean }>(`admin/users/${id}/toggle-lock`, {});
  }

  updateUserRole(id: number, role: string): Observable<{ success: boolean; role: string }> {
    return this.api.put<{ success: boolean; role: string }>(`admin/users/${id}/role`, { role });
  }

  adminDeleteUser(id: number): Observable<{ success: boolean }> {
    return this.api.delete<{ success: boolean }>(`admin/users/${id}`);
  }
}

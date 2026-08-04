import { Injectable } from '@angular/core';
import { BehaviorSubject, Observable, tap } from 'rxjs';
import { ApiService } from './api.service';
import { AppNotification, BroadcastNotification, UnreadCount } from '../models/notification.model';

@Injectable({
  providedIn: 'root'
})
export class NotificationService {
  private unreadCountSubject = new BehaviorSubject<number>(0);
  public unreadCount$ = this.unreadCountSubject.asObservable();

  constructor(private api: ApiService) {}

  getNotifications(): Observable<AppNotification[]> {
    return this.api.get<AppNotification[]>('user/notifications');
  }

  fetchUnreadCount(): Observable<UnreadCount> {
    return this.api.get<UnreadCount>('user/notifications/unread-count').pipe(
      tap((res) => {
        if (res && res.unreadCount !== undefined) {
          this.unreadCountSubject.next(res.unreadCount);
        }
      })
    );
  }

  markAsRead(id: number): Observable<{ success: boolean }> {
    return this.api.put<{ success: boolean }>(`user/notifications/${id}/read`, {}).pipe(
      tap(() => {
        const current = this.unreadCountSubject.value;
        if (current > 0) {
          this.unreadCountSubject.next(current - 1);
        }
      })
    );
  }

  markAllAsRead(): Observable<{ success: boolean }> {
    return this.api.put<{ success: boolean }>('user/notifications/read-all', {}).pipe(
      tap(() => {
        this.unreadCountSubject.next(0);
      })
    );
  }

  sendAdminBroadcast(dto: BroadcastNotification): Observable<{ success: boolean }> {
    return this.api.post<{ success: boolean }>('admin/notifications/broadcast', dto);
  }
}

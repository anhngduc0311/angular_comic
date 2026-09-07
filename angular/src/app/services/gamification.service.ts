import { Injectable } from '@angular/core';
import { Observable, BehaviorSubject, tap } from 'rxjs';
import { ApiService } from './api.service';
import { UserGamificationProfile, CheckInResult, LeaderboardUser } from '../models/user.model';

@Injectable({
  providedIn: 'root'
})
export class GamificationService {
  private profileSubject = new BehaviorSubject<UserGamificationProfile | null>(null);
  public profile$ = this.profileSubject.asObservable();

  constructor(private api: ApiService) {}

  getProfile(): Observable<UserGamificationProfile> {
    return this.api.get<UserGamificationProfile>('gamification/profile').pipe(
      tap((profile) => this.profileSubject.next(profile))
    );
  }

  checkIn(): Observable<CheckInResult> {
    return this.api.post<CheckInResult>('gamification/check-in', {}).pipe(
      tap((res) => {
        if (res.success && this.profileSubject.value) {
          const current = this.profileSubject.value;
          this.profileSubject.next({
            ...current,
            exp: res.totalExp,
            attendanceStreak: res.streak,
            hasCheckedInToday: true,
            realm: res.newRealm || current.realm
          });
        }
      })
    );
  }

  equipFrame(frameId: string): Observable<{ success: boolean; message: string }> {
    return this.api.post<{ success: boolean; message: string }>('gamification/equip-frame', { frameId }).pipe(
      tap((res) => {
        if (res.success && this.profileSubject.value) {
          const current = this.profileSubject.value;
          this.profileSubject.next({
            ...current,
            activeFrame: frameId,
            unlockedFrames: current.unlockedFrames.map((f) => ({
              ...f,
              isActive: f.id === frameId
            }))
          });
        }
      })
    );
  }

  getLeaderboard(limit: number = 20): Observable<LeaderboardUser[]> {
    return this.api.get<LeaderboardUser[]>(`gamification/leaderboard?limit=${limit}`);
  }

  awardReadChapter(comicId: number, chapterId: number): Observable<any> {
    return this.api.post<any>('gamification/read-chapter', { comicId, chapterId });
  }

  clearProfile(): void {
    this.profileSubject.next(null);
  }
}

import { Injectable } from '@angular/core';
import { BehaviorSubject } from 'rxjs';

@Injectable({
  providedIn: 'root'
})
export class ThemeService {
  private themeSubject = new BehaviorSubject<'light' | 'dark'>('light');
  public theme$ = this.themeSubject.asObservable();

  constructor() {
    this.initTheme();
  }

  get currentTheme(): 'light' | 'dark' {
    return this.themeSubject.value;
  }

  get isDarkMode(): boolean {
    return this.themeSubject.value === 'dark';
  }

  initTheme(): void {
    const saved = (localStorage.getItem('truyengg_theme') || localStorage.getItem('mangaflux_theme')) as 'light' | 'dark';
    const theme = saved || 'light';
    this.applyTheme(theme);
  }

  toggleTheme(): void {
    const next = this.themeSubject.value === 'light' ? 'dark' : 'light';
    this.applyTheme(next);
  }

  setTheme(theme: 'light' | 'dark'): void {
    this.applyTheme(theme);
  }

  private applyTheme(theme: 'light' | 'dark'): void {
    this.themeSubject.next(theme);
    localStorage.setItem('truyengg_theme', theme);
    localStorage.setItem('mangaflux_theme', theme);

    if (typeof document !== 'undefined') {
      document.documentElement.setAttribute('data-theme', theme);
      if (theme === 'dark') {
        document.body.classList.remove('light');
        document.body.classList.add('dark');
      } else {
        document.body.classList.remove('dark');
        document.body.classList.add('light');
      }
    }
  }
}

import { Routes, UrlSegment, UrlMatchResult } from '@angular/router';
import { HomeComponent } from './components/home/home.component';
import { authGuard } from './guards/auth.guard';
import { adminGuard } from './guards/admin.guard';

export function chapterUrlMatcher(segments: UrlSegment[]): UrlMatchResult | null {
  if (segments.length === 2 && segments[1].path.startsWith('chuong-')) {
    const slug = segments[0].path;
    const chapStr = segments[1].path.replace('chuong-', '');
    const chapterNumber = parseFloat(chapStr);
    if (!isNaN(chapterNumber)) {
      return {
        consumed: segments,
        posParams: {
          slug: new UrlSegment(slug, {}),
          chapterNumber: new UrlSegment(chapStr, {})
        }
      };
    }
  }
  if (segments.length === 3 && segments[0].path === 'comic' && segments[2].path.startsWith('chuong-')) {
    const slug = segments[1].path;
    const chapStr = segments[2].path.replace('chuong-', '');
    const chapterNumber = parseFloat(chapStr);
    if (!isNaN(chapterNumber)) {
      return {
        consumed: segments,
        posParams: {
          slug: new UrlSegment(slug, {}),
          chapterNumber: new UrlSegment(chapStr, {})
        }
      };
    }
  }
  return null;
}

export const routes: Routes = [
  { path: '', component: HomeComponent, title: 'MangaFlux - Trang Chủ' },
  { 
    path: 'comics', 
    loadComponent: () => import('./components/comic-list/comic-list.component').then(m => m.ComicListComponent), 
    title: 'Danh Sách Truyện Tranh - MangaFlux' 
  },
  { 
    path: 'categories', 
    loadComponent: () => import('./components/category-list/category-list.component').then(m => m.CategoryListComponent), 
    title: 'Thể Loại Truyện - MangaFlux' 
  },
  { 
    path: 'comic/:slug', 
    loadComponent: () => import('./components/comic-detail/comic-detail.component').then(m => m.ComicDetailComponent), 
    title: 'Chi Tiết Truyện - MangaFlux' 
  },
  { 
    matcher: chapterUrlMatcher, 
    loadComponent: () => import('./components/chapter-read/chapter-read.component').then(m => m.ChapterReadComponent), 
    title: 'Đọc Chapter - MangaFlux' 
  },
  { 
    path: 'read/:id', 
    loadComponent: () => import('./components/chapter-read/chapter-read.component').then(m => m.ChapterReadComponent), 
    title: 'Đọc Chapter - MangaFlux' 
  },
  { 
    path: 'search', 
    loadComponent: () => import('./components/search/search.component').then(m => m.SearchComponent), 
    title: 'Tìm Kiếm Truyện - MangaFlux' 
  },
  { 
    path: 'auth', 
    loadComponent: () => import('./components/auth/auth.component').then(m => m.AuthComponent), 
    title: 'Đăng Nhập & Đăng Ký - MangaFlux' 
  },
  { 
    path: 'followed', 
    loadComponent: () => import('./components/followed/followed.component').then(m => m.FollowedComponent), 
    title: 'Truyện Theo Dõi - MangaFlux', 
    canActivate: [authGuard] 
  },
  { 
    path: 'history', 
    loadComponent: () => import('./components/history/history.component').then(m => m.HistoryComponent), 
    title: 'Lịch Sử Đọc - MangaFlux', 
    canActivate: [authGuard] 
  },
  { 
    path: 'profile', 
    loadComponent: () => import('./components/profile/profile.component').then(m => m.ProfileComponent), 
    title: 'Trang Cá Nhân - MangaFlux', 
    canActivate: [authGuard] 
  },
  { 
    path: 'notifications', 
    loadComponent: () => import('./components/notifications/notifications.component').then(m => m.NotificationsComponent), 
    title: 'Thông Báo - MangaFlux', 
    canActivate: [authGuard] 
  },
  { 
    path: 'settings', 
    loadComponent: () => import('./components/settings/settings.component').then(m => m.SettingsComponent), 
    title: 'Cài Đặt Tài Khoản - MangaFlux', 
    canActivate: [authGuard] 
  },
  
  // Informational Pages
  { 
    path: 'about', 
    loadComponent: () => import('./components/about/about.component').then(m => m.AboutComponent), 
    title: 'Giới Thiệu - MangaFlux' 
  },
  { 
    path: 'contact', 
    loadComponent: () => import('./components/contact/contact.component').then(m => m.ContactComponent), 
    title: 'Liên Hệ & Hỗ Trợ - MangaFlux' 
  },
  { 
    path: 'terms', 
    loadComponent: () => import('./components/terms/terms.component').then(m => m.TermsComponent), 
    title: 'Điều Khoản Sử Dụng - MangaFlux' 
  },
  { 
    path: 'privacy', 
    loadComponent: () => import('./components/privacy/privacy.component').then(m => m.PrivacyComponent), 
    title: 'Chính Sách Bảo Mật - MangaFlux' 
  },
  { 
    path: 'faq', 
    loadComponent: () => import('./components/faq/faq.component').then(m => m.FaqComponent), 
    title: 'Câu Hỏi Thường Gặp (FAQ) - MangaFlux' 
  },

  // Status & Error Pages
  { 
    path: 'maintenance', 
    loadComponent: () => import('./components/maintenance/maintenance.component').then(m => m.MaintenanceComponent), 
    title: 'Hệ Thống Bảo Trì - MangaFlux' 
  },
  { 
    path: 'comic-unavailable', 
    redirectTo: '/404', 
    pathMatch: 'full' 
  },
  { 
    path: '404', 
    loadComponent: () => import('./components/not-found/not-found.component').then(m => m.NotFoundComponent), 
    title: '404 Not Found - MangaFlux' 
  },

  // Admin Routes
  { 
    path: 'admin', 
    loadComponent: () => import('./components/admin/admin.component').then(m => m.AdminComponent), 
    title: 'Admin Quản Lý - MangaFlux', 
    canActivate: [adminGuard] 
  },
  { 
    path: 'admin/stories', 
    loadComponent: () => import('./components/admin-stories/admin-stories.component').then(m => m.AdminStoriesComponent), 
    title: 'Quản Lý Truyện - MangaFlux', 
    canActivate: [adminGuard] 
  },
  { 
    path: 'admin/stories/create', 
    loadComponent: () => import('./components/admin-story-form/admin-story-form.component').then(m => m.AdminStoryFormComponent), 
    title: 'Thêm / Sửa Truyện - MangaFlux', 
    canActivate: [adminGuard] 
  },
  { 
    path: 'admin/stories/edit/:id', 
    loadComponent: () => import('./components/admin-story-form/admin-story-form.component').then(m => m.AdminStoryFormComponent), 
    title: 'Chỉnh Sửa Truyện - MangaFlux', 
    canActivate: [adminGuard] 
  },
  { 
    path: 'admin/stories/:id/chapters', 
    loadComponent: () => import('./components/admin-chapters/admin-chapters.component').then(m => m.AdminChaptersComponent), 
    title: 'Quản Lý Chapter - MangaFlux', 
    canActivate: [adminGuard] 
  },
  { 
    path: 'admin/genres', 
    loadComponent: () => import('./components/admin-genres/admin-genres.component').then(m => m.AdminGenresComponent), 
    title: 'Quản Lý Thể Loại - MangaFlux', 
    canActivate: [adminGuard] 
  },
  { 
    path: 'admin/users', 
    loadComponent: () => import('./components/admin-users/admin-users.component').then(m => m.AdminUsersComponent), 
    title: 'Quản Lý Người Dùng - MangaFlux', 
    canActivate: [adminGuard] 
  },
  { 
    path: 'admin/comments', 
    loadComponent: () => import('./components/admin-comments/admin-comments.component').then(m => m.AdminCommentsComponent), 
    title: 'Quản Lý Bình Luận - MangaFlux', 
    canActivate: [adminGuard] 
  },
  { 
    path: 'admin/reports', 
    loadComponent: () => import('./components/admin-reports/admin-reports.component').then(m => m.AdminReportsComponent), 
    title: 'Quản Lý Báo Lỗi - MangaFlux', 
    canActivate: [adminGuard] 
  },

  // Fallback 404 Route
  { 
    path: '**', 
    loadComponent: () => import('./components/not-found/not-found.component').then(m => m.NotFoundComponent), 
    title: '404 Not Found - MangaFlux' 
  }
];

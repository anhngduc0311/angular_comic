import { Routes } from '@angular/router';
import { HomeComponent } from './components/home/home.component';
import { ComicListComponent } from './components/comic-list/comic-list.component';
import { CategoryListComponent } from './components/category-list/category-list.component';
import { ComicDetailComponent } from './components/comic-detail/comic-detail.component';
import { ChapterReadComponent } from './components/chapter-read/chapter-read.component';
import { SearchComponent } from './components/search/search.component';
import { AuthComponent } from './components/auth/auth.component';
import { FollowedComponent } from './components/followed/followed.component';
import { HistoryComponent } from './components/history/history.component';
import { AdminComponent } from './components/admin/admin.component';
import { AdminStoriesComponent } from './components/admin-stories/admin-stories.component';
import { AdminStoryFormComponent } from './components/admin-story-form/admin-story-form.component';
import { AdminChaptersComponent } from './components/admin-chapters/admin-chapters.component';
import { AdminGenresComponent } from './components/admin-genres/admin-genres.component';
import { AdminUsersComponent } from './components/admin-users/admin-users.component';
import { AdminCommentsComponent } from './components/admin-comments/admin-comments.component';
import { AdminReportsComponent } from './components/admin-reports/admin-reports.component';
import { ProfileComponent } from './components/profile/profile.component';
import { NotificationsComponent } from './components/notifications/notifications.component';
import { SettingsComponent } from './components/settings/settings.component';
import { AboutComponent } from './components/about/about.component';
import { ContactComponent } from './components/contact/contact.component';
import { TermsComponent } from './components/terms/terms.component';
import { PrivacyComponent } from './components/privacy/privacy.component';
import { FaqComponent } from './components/faq/faq.component';
import { NotFoundComponent } from './components/not-found/not-found.component';
import { MaintenanceComponent } from './components/maintenance/maintenance.component';
import { ComicRemovedComponent } from './components/comic-removed/comic-removed.component';

export const routes: Routes = [
  { path: '', component: HomeComponent, title: 'MangaFlux - Trang Chủ' },
  { path: 'comics', component: ComicListComponent, title: 'Danh Sách Truyện Tranh - MangaFlux' },
  { path: 'categories', component: CategoryListComponent, title: 'Thể Loại Truyện - MangaFlux' },
  { path: 'comic/:slug', component: ComicDetailComponent, title: 'Chi Tiết Truyện - MangaFlux' },
  { path: 'read/:id', component: ChapterReadComponent, title: 'Đọc Chapter - MangaFlux' },
  { path: 'search', component: SearchComponent, title: 'Tìm Kiếm Truyện - MangaFlux' },
  { path: 'auth', component: AuthComponent, title: 'Đăng Nhập & Đăng Ký - MangaFlux' },
  { path: 'followed', component: FollowedComponent, title: 'Truyện Theo Dõi - MangaFlux' },
  { path: 'history', component: HistoryComponent, title: 'Lịch Sử Đọc - MangaFlux' },
  { path: 'profile', component: ProfileComponent, title: 'Trang Cá Nhân - MangaFlux' },
  { path: 'notifications', component: NotificationsComponent, title: 'Thông Báo - MangaFlux' },
  { path: 'settings', component: SettingsComponent, title: 'Cài Đặt Tài Khoản - MangaFlux' },
  
  // Informational Pages
  { path: 'about', component: AboutComponent, title: 'Giới Thiệu - MangaFlux' },
  { path: 'contact', component: ContactComponent, title: 'Liên Hệ & Hỗ Trợ - MangaFlux' },
  { path: 'terms', component: TermsComponent, title: 'Điều Khoản Sử Dụng - MangaFlux' },
  { path: 'privacy', component: PrivacyComponent, title: 'Chính Sách Bảo Mật - MangaFlux' },
  { path: 'faq', component: FaqComponent, title: 'Câu Hỏi Thường Gặp (FAQ) - MangaFlux' },

  // Status & Error Pages
  { path: 'maintenance', component: MaintenanceComponent, title: 'Hệ Thống Bảo Trì - MangaFlux' },
  { path: 'comic-unavailable', component: ComicRemovedComponent, title: 'Truyện Không Tồn Tại - MangaFlux' },
  { path: '404', component: NotFoundComponent, title: '404 Not Found - MangaFlux' },

  // Admin Routes
  { path: 'admin', component: AdminComponent, title: 'Admin Quản Lý - MangaFlux' },
  { path: 'admin/stories', component: AdminStoriesComponent, title: 'Quản Lý Truyện - MangaFlux' },
  { path: 'admin/stories/create', component: AdminStoryFormComponent, title: 'Thêm / Sửa Truyện - MangaFlux' },
  { path: 'admin/stories/edit/:id', component: AdminStoryFormComponent, title: 'Chỉnh Sửa Truyện - MangaFlux' },
  { path: 'admin/stories/:id/chapters', component: AdminChaptersComponent, title: 'Quản Lý Chapter - MangaFlux' },
  { path: 'admin/genres', component: AdminGenresComponent, title: 'Quản Lý Thể Loại - MangaFlux' },
  { path: 'admin/users', component: AdminUsersComponent, title: 'Quản Lý Người Dùng - MangaFlux' },
  { path: 'admin/comments', component: AdminCommentsComponent, title: 'Quản Lý Bình Luận - MangaFlux' },
  { path: 'admin/reports', component: AdminReportsComponent, title: 'Quản Lý Báo Lỗi - MangaFlux' },

  // Fallback 404 Route
  { path: '**', component: NotFoundComponent, title: '404 Not Found - MangaFlux' }
];

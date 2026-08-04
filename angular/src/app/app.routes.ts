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
import { ProfileComponent } from './components/profile/profile.component';
import { NotificationsComponent } from './components/notifications/notifications.component';

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
  { path: 'admin', component: AdminComponent, title: 'Admin Quản Lý - MangaFlux' },
  { path: '**', redirectTo: '' }
];

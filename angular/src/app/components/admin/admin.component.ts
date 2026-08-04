import { Component, OnInit } from '@angular/core';
import { CommonModule } from '@angular/common';
import { FormsModule } from '@angular/forms';
import { ComicService } from '../../services/comic.service';
import { NotificationService } from '../../services/notification.service';
import { Comic, Category } from '../../models/comic.model';

@Component({
  selector: 'app-admin',
  standalone: true,
  imports: [CommonModule, FormsModule],
  templateUrl: './admin.component.html',
  styleUrls: ['./admin.component.scss']
})
export class AdminComponent implements OnInit {
  activeTab: 'comics' | 'add-comic' | 'add-chapter' | 'broadcast' = 'comics';
  comics: Comic[] = [];
  categories: Category[] = [];

  // Broadcast Form Model
  broadcastForm = {
    title: '',
    message: '',
    link: ''
  };

  // Add/Edit Comic Form Model
  comicForm = {
    id: 0,
    title: '',
    author: '',
    description: '',
    coverImage: '',
    bannerImage: '',
    status: 'Ongoing',
    isFeatured: false,
    selectedCategoryIds: [] as number[]
  };

  // Add Chapter Form Model
  chapterForm = {
    comicId: 0,
    chapterNumber: 1,
    title: '',
    imageUrlsText: '' // Split by newline
  };

  message: string = '';
  isError: boolean = false;

  constructor(
    private comicService: ComicService,
    private notificationService: NotificationService
  ) {}

  sendBroadcast(): void {
    if (!this.broadcastForm.message) {
      this.showMessage('Vui lòng nhập nội dung thông báo.', true);
      return;
    }

    this.notificationService.sendAdminBroadcast(this.broadcastForm).subscribe({
      next: () => {
        this.showMessage('Gửi thông báo toàn hệ thống thành công!');
        this.broadcastForm = { title: '', message: '', link: '' };
        this.activeTab = 'comics';
      },
      error: () => this.showMessage('Gửi thông báo thất bại.', true)
    });
  }

  ngOnInit(): void {
    this.loadData();
  }

  loadData(): void {
    this.comicService.getLatestComics(50).subscribe(data => this.comics = data);
    this.comicService.getCategories().subscribe(cats => this.categories = cats);
  }

  toggleCategorySelection(catId: number): void {
    const index = this.comicForm.selectedCategoryIds.indexOf(catId);
    if (index > -1) {
      this.comicForm.selectedCategoryIds.splice(index, 1);
    } else {
      this.comicForm.selectedCategoryIds.push(catId);
    }
  }

  saveComic(): void {
    if (!this.comicForm.title) {
      this.showMessage('Vui lòng nhập tên truyện.', true);
      return;
    }

    const payload = {
      title: this.comicForm.title,
      author: this.comicForm.author,
      description: this.comicForm.description,
      coverImage: this.comicForm.coverImage,
      bannerImage: this.comicForm.bannerImage,
      status: this.comicForm.status,
      isFeatured: this.comicForm.isFeatured,
      categoryIds: this.comicForm.selectedCategoryIds
    };

    if (this.comicForm.id > 0) {
      this.comicService.updateComic(this.comicForm.id, payload).subscribe({
        next: () => {
          this.showMessage('Cập nhật truyện thành công!');
          this.resetComicForm();
          this.loadData();
          this.activeTab = 'comics';
        },
        error: () => this.showMessage('Cập nhật thất bại.', true)
      });
    } else {
      this.comicService.createComic(payload).subscribe({
        next: () => {
          this.showMessage('Thêm mới truyện thành công!');
          this.resetComicForm();
          this.loadData();
          this.activeTab = 'comics';
        },
        error: () => this.showMessage('Thêm truyện thất bại.', true)
      });
    }
  }

  editComic(comic: Comic): void {
    this.comicForm = {
      id: comic.id,
      title: comic.title,
      author: comic.author || '',
      description: comic.description || '',
      coverImage: comic.coverImage || '',
      bannerImage: comic.bannerImage || '',
      status: comic.status,
      isFeatured: comic.isFeatured,
      selectedCategoryIds: comic.categories.map(c => c.id)
    };
    this.activeTab = 'add-comic';
  }

  deleteComic(id: number): void {
    if (confirm('Bạn có chắc chắn muốn xóa bộ truyện này?')) {
      this.comicService.deleteComic(id).subscribe(() => {
        this.showMessage('Đã xóa bộ truyện.');
        this.loadData();
      });
    }
  }

  saveChapter(): void {
    if (!this.chapterForm.comicId || !this.chapterForm.title) {
      this.showMessage('Vui lòng chọn truyện và nhập tên chapter.', true);
      return;
    }

    const pages = this.chapterForm.imageUrlsText.split('\n').map(url => url.trim()).filter(url => url.length > 0);

    this.comicService.addChapter({
      comicId: this.chapterForm.comicId,
      chapterNumber: this.chapterForm.chapterNumber,
      title: this.chapterForm.title,
      imageUrls: pages
    }).subscribe({
      next: () => {
        this.showMessage('Thêm chapter mới thành công!');
        this.chapterForm = { comicId: 0, chapterNumber: 1, title: '', imageUrlsText: '' };
        this.activeTab = 'comics';
      },
      error: () => this.showMessage('Thêm chapter thất bại.', true)
    });
  }

  resetComicForm(): void {
    this.comicForm = {
      id: 0,
      title: '',
      author: '',
      description: '',
      coverImage: '',
      bannerImage: '',
      status: 'Ongoing',
      isFeatured: false,
      selectedCategoryIds: []
    };
  }

  showMessage(msg: string, isErr = false): void {
    this.message = msg;
    this.isError = isErr;
    setTimeout(() => this.message = '', 4000);
  }
}

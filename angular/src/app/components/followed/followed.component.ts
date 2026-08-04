import { Component, OnInit } from '@angular/core';
import { CommonModule } from '@angular/common';
import { RouterModule } from '@angular/router';
import { UserService } from '../../services/user.service';
import { Bookmark } from '../../models/user.model';

@Component({
  selector: 'app-followed',
  standalone: true,
  imports: [CommonModule, RouterModule],
  templateUrl: './followed.component.html',
  styleUrls: ['./followed.component.scss']
})
export class FollowedComponent implements OnInit {
  bookmarks: Bookmark[] = [];
  isLoading: boolean = true;

  constructor(private userService: UserService) {}

  ngOnInit(): void {
    this.fetchBookmarks();
  }

  fetchBookmarks(): void {
    this.isLoading = true;
    this.userService.getBookmarks().subscribe({
      next: (data) => {
        this.bookmarks = data;
        this.isLoading = false;
      },
      error: () => (this.isLoading = false)
    });
  }

  removeBookmark(comicId: number, event: Event): void {
    event.preventDefault();
    event.stopPropagation();
    this.userService.removeBookmark(comicId).subscribe(() => {
      this.bookmarks = this.bookmarks.filter(b => b.comicId !== comicId);
    });
  }
}

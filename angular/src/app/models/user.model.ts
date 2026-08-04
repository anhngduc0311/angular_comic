import { Comic, Chapter } from './comic.model';

export interface User {
  id: number;
  username: string;
  email: string;
  fullName?: string;
  avatar?: string;
  role: string;
  token?: string;
}

export interface Bookmark {
  id: number;
  comicId: number;
  comic: Comic;
  createdAt: string;
}

export interface ReadingHistory {
  id: number;
  comicId: number;
  comic: Comic;
  chapterId: number;
  chapter: Chapter;
  lastReadAt: string;
}

export interface UserProfile {
  id: number;
  username: string;
  email: string;
  fullName?: string;
  avatar?: string;
  role: string;
  createdAt: string;
  followedCount: number;
  commentsCount: number;
}

export interface UserComment {
  id: number;
  comicId: number;
  comicTitle: string;
  comicSlug: string;
  comicCover?: string;
  chapterId?: number;
  chapterNumber?: number;
  content: string;
  createdAt: string;
}

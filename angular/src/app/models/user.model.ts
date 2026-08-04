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

export interface Category {
  id: number;
  name: string;
  slug: string;
  description?: string;
  imageUrl?: string;
  comicCount?: number;
}

export interface Chapter {
  id: number;
  comicId: number;
  chapterNumber: number;
  title: string;
  views: number;
  isPublic?: boolean;
  publishedAt?: string | null;
  createdAt: string;
}

export interface ChapterPage {
  id: number;
  pageNumber: number;
  imageUrl: string;
}

export interface ChapterDetail extends Chapter {
  comicTitle: string;
  comicSlug: string;
  pages: ChapterPage[];
  allChapters: Chapter[];
}

export interface Comic {
  id: number;
  title: string;
  slug: string;
  description?: string;
  coverImage?: string;
  bannerImage?: string;
  author?: string;
  otherNames?: string;
  artist?: string;
  country?: string;
  releaseYear?: number;
  status: string;
  views: number;
  rating: number;
  isFeatured: boolean;
  isPublic?: boolean;
  updatedAt: string;
  categories: Category[];
  latestChapter?: Chapter;
}

export interface Comment {
  id: number;
  userId: number;
  username: string;
  userAvatar?: string;
  comicId: number;
  chapterId?: number;
  content: string;
  createdAt: string;
}

export interface ComicDetail extends Comic {
  chapters: Chapter[];
  comments: Comment[];
}

export interface RecentChapter {
  id: number;
  comicId: number;
  comicTitle: string;
  comicSlug: string;
  comicCoverImage?: string;
  chapterNumber: number;
  title: string;
  views: number;
  createdAt: string;
}

export interface DailyViewStat {
  date: string;
  views: number;
}

export interface DashboardStats {
  totalComics: number;
  totalChapters: number;
  totalUsers: number;
  totalViews: number;
  topViewedComics: Comic[];
  recentChapters: RecentChapter[];
  readingStats: DailyViewStat[];
}


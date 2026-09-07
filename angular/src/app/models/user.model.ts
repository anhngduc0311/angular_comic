import { Comic, Chapter } from './comic.model';

export interface User {
  id: number;
  username: string;
  email: string;
  fullName?: string;
  avatar?: string;
  role: string;
  isLocked?: boolean;
  token?: string;
}

export interface RealmInfo {
  name: string;
  stage: string;
  title: string;
  level: number;
  color: string;
  frameClass: string;
  auraDescription: string;
}

export interface AvatarFrameOption {
  id: string;
  name: string;
  frameClass: string;
  requiredRealm: string;
  requiredExp: number;
  isUnlocked: boolean;
  isActive: boolean;
  description: string;
}

export interface UserGamificationProfile {
  userId: number;
  username: string;
  avatar?: string;
  exp: number;
  realm: RealmInfo;
  currentLevelExp: number;
  expForNextLevel: number;
  progressPercent: number;
  attendanceStreak: number;
  hasCheckedInToday: boolean;
  activeFrame: string;
  activeBadge?: string;
  unlockedFrames: AvatarFrameOption[];
}

export interface CheckInResult {
  success: boolean;
  message: string;
  expGained: number;
  totalExp: number;
  streak: number;
  leveledUp: boolean;
  newRealm?: RealmInfo;
}

export interface LeaderboardUser {
  rank: number;
  userId: number;
  username: string;
  fullName?: string;
  avatar?: string;
  exp: number;
  realm: RealmInfo;
  activeFrame: string;
  activeBadge?: string;
  attendanceStreak: number;
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
  isLocked?: boolean;
  createdAt: string;
  followedCount: number;
  commentsCount: number;
  // Gamification properties
  exp?: number;
  realm?: RealmInfo;
  attendanceStreak?: number;
  hasCheckedInToday?: boolean;
  activeFrame?: string;
  activeBadge?: string;
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

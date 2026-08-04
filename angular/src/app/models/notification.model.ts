export interface AppNotification {
  id: number;
  userId: number;
  type: 'NewChapter' | 'CommentReply' | 'CommentLike' | 'AdminSystem';
  title: string;
  message: string;
  link?: string;
  isRead: boolean;
  createdAt: string;
}

export interface BroadcastNotification {
  title: string;
  message: string;
  link?: string;
}

export interface UnreadCount {
  unreadCount: number;
}

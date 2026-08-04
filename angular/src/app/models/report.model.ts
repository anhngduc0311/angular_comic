export interface Report {
  id: number;
  comicId: number;
  comicTitle: string;
  comicSlug: string;

  chapterId?: number;
  chapterNumber?: number;
  chapterTitle?: string;

  userId?: number;
  username?: string;
  userAvatar?: string;

  reporterName: string;
  errorType: string;
  errorTypeLabel: string;
  description?: string;

  status: 'Pending' | 'Processing' | 'Resolved' | 'Dismissed';
  statusLabel: string;
  adminNotes?: string;

  createdAt: string;
  resolvedAt?: string;
}

export interface CreateReportDto {
  comicId: number;
  chapterId?: number;
  errorType: string;
  description?: string;
  reporterName?: string;
}

export interface UpdateReportStatusDto {
  status: string;
  adminNotes?: string;
}

export interface ReportStats {
  total: number;
  pending: number;
  processing: number;
  resolved: number;
  dismissed: number;
}

export const ERROR_TYPE_OPTIONS = [
  { value: 'IMAGE_FAILED', label: 'Ảnh không tải được', icon: 'fa-image' },
  { value: 'WRONG_IMAGE_ORDER', label: 'Sai thứ tự ảnh', icon: 'fa-arrow-down-short-wide' },
  { value: 'DUPLICATE_CHAPTER', label: 'Chapter bị trùng', icon: 'fa-copy' },
  { value: 'INAPPROPRIATE_CONTENT', label: 'Nội dung không phù hợp', icon: 'fa-triangle-exclamation' },
  { value: 'BROKEN_LINK', label: 'Link chapter bị lỗi', icon: 'fa-link-slash' },
  { value: 'OTHER', label: 'Lỗi khác', icon: 'fa-circle-question' }
];

import { Component, OnInit } from '@angular/core';
import { CommonModule } from '@angular/common';
import { FormsModule } from '@angular/forms';
import { RouterLink } from '@angular/router';
import { ReportService } from '../../services/report.service';
import { Report, ReportStats, ERROR_TYPE_OPTIONS } from '../../models/report.model';

@Component({
  selector: 'app-admin-reports',
  standalone: true,
  imports: [CommonModule, FormsModule, RouterLink],
  templateUrl: './admin-reports.component.html',
  styleUrls: ['./admin-reports.component.scss']
})
export class AdminReportsComponent implements OnInit {
  reports: Report[] = [];
  stats: ReportStats = { total: 0, pending: 0, processing: 0, resolved: 0, dismissed: 0 };
  
  isLoading: boolean = true;
  message: string = '';
  isError: boolean = false;

  // Filter & Search Controls
  selectedStatus: string = 'ALL'; // ALL, Pending, Processing, Resolved, Dismissed
  selectedErrorType: string = 'ALL'; // ALL, IMAGE_FAILED, WRONG_IMAGE_ORDER, etc.
  searchTerm: string = '';

  // Detail Modal State
  selectedReport: Report | null = null;
  showDetailModal: boolean = false;
  adminNotesInput: string = '';
  newStatusInput: string = '';
  isUpdatingStatus: boolean = false;

  errorTypeOptions = ERROR_TYPE_OPTIONS;

  constructor(private reportService: ReportService) {}

  ngOnInit(): void {
    this.loadData();
  }

  loadData(): void {
    this.isLoading = true;
    this.loadStats();
    this.loadReports();
  }

  loadStats(): void {
    this.reportService.getStats().subscribe({
      next: (data) => {
        this.stats = data;
      },
      error: (err) => console.error('Lỗi tải thống kê báo lỗi:', err)
    });
  }

  loadReports(): void {
    this.isLoading = true;
    this.reportService.getReports(
      this.selectedStatus === 'ALL' ? undefined : this.selectedStatus,
      this.selectedErrorType === 'ALL' ? undefined : this.selectedErrorType,
      this.searchTerm ? this.searchTerm : undefined
    ).subscribe({
      next: (data) => {
        this.reports = data;
        this.isLoading = false;
      },
      error: (err) => {
        console.error('Lỗi tải danh sách báo lỗi:', err);
        this.showMessage('Không thể tải danh sách báo lỗi.', true);
        this.isLoading = false;
      }
    });
  }

  onFilterChange(): void {
    this.loadReports();
  }

  onSearch(): void {
    this.loadReports();
  }

  resetFilters(): void {
    this.selectedStatus = 'ALL';
    this.selectedErrorType = 'ALL';
    this.searchTerm = '';
    this.loadReports();
  }

  // Quick Action Status Change
  quickUpdateStatus(report: Report, newStatus: string): void {
    this.reportService.updateStatus(report.id, {
      status: newStatus,
      adminNotes: report.adminNotes
    }).subscribe({
      next: (updated) => {
        report.status = updated.status;
        report.statusLabel = updated.statusLabel;
        report.resolvedAt = updated.resolvedAt;
        this.showMessage(`Đã cập nhật trạng thái báo lỗi #${report.id} thành "${updated.statusLabel}".`, false);
        this.loadStats();
      },
      error: (err) => {
        console.error('Lỗi cập nhật trạng thái:', err);
        this.showMessage('Không thể cập nhật trạng thái báo lỗi.', true);
      }
    });
  }

  openDetailModal(report: Report): void {
    this.selectedReport = report;
    this.adminNotesInput = report.adminNotes || '';
    this.newStatusInput = report.status;
    this.showDetailModal = true;
  }

  closeDetailModal(): void {
    this.showDetailModal = false;
    this.selectedReport = null;
  }

  saveReportDetail(): void {
    if (!this.selectedReport) return;

    this.isUpdatingStatus = true;
    this.reportService.updateStatus(this.selectedReport.id, {
      status: this.newStatusInput,
      adminNotes: this.adminNotesInput
    }).subscribe({
      next: (updated) => {
        if (this.selectedReport) {
          this.selectedReport.status = updated.status;
          this.selectedReport.statusLabel = updated.statusLabel;
          this.selectedReport.adminNotes = updated.adminNotes;
          this.selectedReport.resolvedAt = updated.resolvedAt;
        }
        this.showMessage(`Đã lưu thay đổi cho báo lỗi #${updated.id}`, false);
        this.isUpdatingStatus = false;
        this.closeDetailModal();
        this.loadReports();
        this.loadStats();
      },
      error: (err) => {
        console.error('Lỗi cập nhật báo lỗi:', err);
        this.showMessage('Không thể lưu thông tin báo lỗi.', true);
        this.isUpdatingStatus = false;
      }
    });
  }

  deleteReport(report: Report): void {
    if (!confirm(`Bạn có chắc chắn muốn xóa báo lỗi #${report.id} của truyện "${report.comicTitle}"?`)) {
      return;
    }

    this.reportService.deleteReport(report.id).subscribe({
      next: () => {
        this.reports = this.reports.filter(r => r.id !== report.id);
        this.showMessage(`Đã xóa báo lỗi #${report.id}.`, false);
        this.loadStats();
      },
      error: (err) => {
        console.error('Lỗi xóa báo lỗi:', err);
        this.showMessage('Không thể xóa báo lỗi.', true);
      }
    });
  }

  getErrorTypeBadgeClass(errorType: string): string {
    switch (errorType) {
      case 'IMAGE_FAILED': return 'badge-danger';
      case 'WRONG_IMAGE_ORDER': return 'badge-warning';
      case 'DUPLICATE_CHAPTER': return 'badge-purple';
      case 'INAPPROPRIATE_CONTENT': return 'badge-danger';
      case 'BROKEN_LINK': return 'badge-orange';
      default: return 'badge-secondary';
    }
  }

  getStatusBadgeClass(status: string): string {
    switch (status) {
      case 'Pending': return 'status-pending';
      case 'Processing': return 'status-processing';
      case 'Resolved': return 'status-resolved';
      case 'Dismissed': return 'status-dismissed';
      default: return 'status-pending';
    }
  }

  private showMessage(msg: string, isError: boolean): void {
    this.message = msg;
    this.isError = isError;
    setTimeout(() => {
      this.message = '';
    }, 4000);
  }
}

import { Injectable } from '@angular/core';
import { Observable } from 'rxjs';
import { ApiService } from './api.service';
import { Report, CreateReportDto, UpdateReportStatusDto, ReportStats } from '../models/report.model';

@Injectable({
  providedIn: 'root'
})
export class ReportService {
  constructor(private api: ApiService) {}

  // Create a new report (Public or Auth)
  createReport(data: CreateReportDto): Observable<Report> {
    return this.api.post<Report>('reports', data);
  }

  // Admin: Get all reports with optional status, errorType, search filters
  getReports(status?: string, errorType?: string, search?: string): Observable<Report[]> {
    let queryParams: string[] = [];
    if (status) queryParams.push(`status=${encodeURIComponent(status)}`);
    if (errorType) queryParams.push(`errorType=${encodeURIComponent(errorType)}`);
    if (search) queryParams.push(`search=${encodeURIComponent(search)}`);

    const queryStr = queryParams.length ? `?${queryParams.join('&')}` : '';
    return this.api.get<Report[]>(`reports${queryStr}`);
  }

  // Admin: Get statistics summary
  getStats(): Observable<ReportStats> {
    return this.api.get<ReportStats>('reports/stats');
  }

  // Admin: Update status & notes
  updateStatus(id: number, data: UpdateReportStatusDto): Observable<Report> {
    return this.api.put<Report>(`reports/${id}/status`, data);
  }

  // Admin: Delete report
  deleteReport(id: number): Observable<{ success: boolean; message: string }> {
    return this.api.delete<{ success: boolean; message: string }>(`reports/${id}`);
  }
}

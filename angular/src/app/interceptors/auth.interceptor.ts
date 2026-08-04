import { HttpInterceptorFn, HttpErrorResponse } from '@angular/common/http';
import { inject } from '@angular/core';
import { Router } from '@angular/router';
import { catchError, switchMap, throwError } from 'rxjs';
import { AuthService } from '../services/auth.service';

let isRefreshing = false;

export const authInterceptor: HttpInterceptorFn = (req, next) => {
  const authService = inject(AuthService);
  const router = inject(Router);
  const token = localStorage.getItem('mangaflux_token');

  let authReq = req.clone({
    withCredentials: true
  });

  if (token && !authReq.headers.has('Authorization')) {
    authReq = authReq.clone({
      setHeaders: {
        Authorization: `Bearer ${token}`
      }
    });
  }

  return next(authReq).pipe(
    catchError((error: HttpErrorResponse) => {
      if (error.status === 401) {
        const isAuthEndpoint = req.url.includes('auth/login') ||
                               req.url.includes('auth/register') ||
                               req.url.includes('auth/refresh-token');

        if (!isAuthEndpoint && !isRefreshing) {
          isRefreshing = true;
          return authService.refreshToken().pipe(
            switchMap((user) => {
              isRefreshing = false;
              const newToken = user?.token || localStorage.getItem('mangaflux_token');
              const retryReq = req.clone({
                setHeaders: {
                  Authorization: `Bearer ${newToken}`
                },
                withCredentials: true
              });
              return next(retryReq);
            }),
            catchError((refreshErr) => {
              isRefreshing = false;
              authService.logout();
              router.navigate(['/auth'], { queryParams: { expired: 'true' } });
              return throwError(() => refreshErr);
            })
          );
        } else if (isAuthEndpoint) {
          isRefreshing = false;
          authService.logout();
        }
      } else if (error.status === 403) {
        alert('Bạn không có quyền thực hiện thao tác này.');
      }
      return throwError(() => error);
    })
  );
};


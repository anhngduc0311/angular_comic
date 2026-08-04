import { inject } from '@angular/core';
import { CanActivateFn, Router } from '@angular/router';
import { AuthService } from '../services/auth.service';

export const adminGuard: CanActivateFn = (route, state) => {
  const authService = inject(AuthService);
  const router = inject(Router);

  if (authService.isLoggedIn && authService.isAdmin) {
    return true;
  }

  if (authService.isLoggedIn) {
    if (typeof window !== 'undefined' && typeof window.alert === 'function') {
      alert('Bạn không có quyền truy cập vào trang Quản trị!');
    }
    return router.createUrlTree(['/']);
  }

  return router.createUrlTree(['/auth'], {
    queryParams: { returnUrl: state.url }
  });
};

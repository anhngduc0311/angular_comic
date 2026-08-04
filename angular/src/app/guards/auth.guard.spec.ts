import { TestBed } from '@angular/core/testing';
import { Router, UrlTree } from '@angular/router';
import { authGuard } from './auth.guard';
import { AuthService } from '../services/auth.service';

describe('authGuard', () => {
  let authServiceSpy: jasmine.SpyObj<AuthService>;
  let routerSpy: jasmine.SpyObj<Router>;

  beforeEach(() => {
    authServiceSpy = jasmine.createSpyObj('AuthService', [], { isLoggedIn: true });
    routerSpy = jasmine.createSpyObj('Router', ['createUrlTree']);

    TestBed.configureTestingModule({
      providers: [
        { provide: AuthService, useValue: authServiceSpy },
        { provide: Router, useValue: routerSpy }
      ]
    });
  });

  it('should be defined', () => {
    expect(authGuard).toBeTruthy();
  });

  it('should allow access if user is logged in', () => {
    const result = TestBed.runInInjectionContext(() => authGuard({} as any, { url: '/followed' } as any));
    expect(result).toBeTrue();
  });

  it('should redirect to auth page if user is not logged in', () => {
    authServiceSpy = jasmine.createSpyObj('AuthService', [], { isLoggedIn: false });
    TestBed.resetTestingModule();
    TestBed.configureTestingModule({
      providers: [
        { provide: AuthService, useValue: authServiceSpy },
        { provide: Router, useValue: routerSpy }
      ]
    });
    const dummyTree = {} as UrlTree;
    routerSpy.createUrlTree.and.returnValue(dummyTree);

    const result = TestBed.runInInjectionContext(() => authGuard({} as any, { url: '/followed' } as any));
    expect(result).toBe(dummyTree);
    expect(routerSpy.createUrlTree).toHaveBeenCalledWith(['/auth'], { queryParams: { returnUrl: '/followed' } });
  });
});


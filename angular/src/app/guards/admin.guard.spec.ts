import { TestBed } from '@angular/core/testing';
import { Router, UrlTree } from '@angular/router';
import { adminGuard } from './admin.guard';
import { AuthService } from '../services/auth.service';

describe('adminGuard', () => {
  let authServiceSpy: jasmine.SpyObj<AuthService>;
  let routerSpy: jasmine.SpyObj<Router>;

  beforeEach(() => {
    authServiceSpy = jasmine.createSpyObj('AuthService', [], { isLoggedIn: true, isAdmin: true });
    routerSpy = jasmine.createSpyObj('Router', ['createUrlTree']);

    TestBed.configureTestingModule({
      providers: [
        { provide: AuthService, useValue: authServiceSpy },
        { provide: Router, useValue: routerSpy }
      ]
    });
  });

  it('should be defined', () => {
    expect(adminGuard).toBeTruthy();
  });

  it('should allow access if user is logged in and is admin', () => {
    const result = TestBed.runInInjectionContext(() => adminGuard({} as any, { url: '/admin' } as any));
    expect(result).toBeTrue();
  });

  it('should redirect to home if user is logged in but not admin', () => {
    authServiceSpy = jasmine.createSpyObj('AuthService', [], { isLoggedIn: true, isAdmin: false });
    TestBed.resetTestingModule();
    TestBed.configureTestingModule({
      providers: [
        { provide: AuthService, useValue: authServiceSpy },
        { provide: Router, useValue: routerSpy }
      ]
    });
    const dummyTree = {} as UrlTree;
    routerSpy.createUrlTree.and.returnValue(dummyTree);

    const result = TestBed.runInInjectionContext(() => adminGuard({} as any, { url: '/admin' } as any));
    expect(result).toBe(dummyTree);
    expect(routerSpy.createUrlTree).toHaveBeenCalledWith(['/']);
  });

  it('should redirect to auth page if user is not logged in', () => {
    authServiceSpy = jasmine.createSpyObj('AuthService', [], { isLoggedIn: false, isAdmin: false });
    TestBed.resetTestingModule();
    TestBed.configureTestingModule({
      providers: [
        { provide: AuthService, useValue: authServiceSpy },
        { provide: Router, useValue: routerSpy }
      ]
    });
    const dummyTree = {} as UrlTree;
    routerSpy.createUrlTree.and.returnValue(dummyTree);

    const result = TestBed.runInInjectionContext(() => adminGuard({} as any, { url: '/admin' } as any));
    expect(result).toBe(dummyTree);
    expect(routerSpy.createUrlTree).toHaveBeenCalledWith(['/auth'], { queryParams: { returnUrl: '/admin' } });
  });
});


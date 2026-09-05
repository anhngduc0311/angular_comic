import { Component, OnInit } from '@angular/core';
import { CommonModule } from '@angular/common';
import { RouterOutlet, Router, NavigationEnd } from '@angular/router';
import { filter } from 'rxjs/operators';
import { NavbarComponent } from './components/navbar/navbar.component';
import { FooterComponent } from './components/footer/footer.component';

@Component({
  selector: 'app-root',
  standalone: true,
  imports: [CommonModule, RouterOutlet, NavbarComponent, FooterComponent],
  templateUrl: './app.component.html',
  styleUrls: ['./app.component.scss']
})
export class AppComponent implements OnInit {
  title = 'truyenkomi';
  isReaderRoute: boolean = false;

  constructor(private router: Router) {}

  ngOnInit(): void {
    this.checkReaderRoute(this.router.url);
    this.router.events.pipe(
      filter(event => event instanceof NavigationEnd)
    ).subscribe((event: any) => {
      this.checkReaderRoute(event.urlAfterRedirects || event.url || '');
    });
  }

  private checkReaderRoute(url: string): void {
    this.isReaderRoute = /chuong-|\/read\//.test(url);
  }
}


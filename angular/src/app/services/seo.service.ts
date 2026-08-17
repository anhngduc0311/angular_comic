import { Injectable, Inject } from '@angular/core';
import { Title, Meta } from '@angular/platform-browser';
import { DOCUMENT } from '@angular/common';
import { ComicDetail } from '../models/comic.model';

@Injectable({
  providedIn: 'root'
})
export class SeoService {
  private defaultSiteName = 'MangaFlux - Đọc Truyện Tranh Online Miễn Phí';
  private defaultImage = 'https://images.unsplash.com/photo-1607604276583-eef5d076aa5f?auto=format&fit=crop&w=1200&q=80';
  private defaultDescription = 'MangaFlux - Nền tảng đọc truyện tranh Manga, Manhwa, Manhua sắc nét chuẩn 4K, tốc độ tải siêu tốc, cập nhật chương mới nhất liên tục.';

  constructor(
    private titleService: Title,
    private metaService: Meta,
    @Inject(DOCUMENT) private document: Document
  ) {}

  setComicDetailSeo(comic: ComicDetail): void {
    const fullTitle = `${comic.title} [Tới Chapter ${comic.latestChapter?.chapterNumber || 'Mới Nhất'}] Tiếng Việt - MangaFlux`;
    const cleanDesc = comic.description 
      ? comic.description.substring(0, 200).replace(/\n/g, ' ') + '...'
      : `Đọc truyện tranh ${comic.title} Tiếng Việt bản dịch đẹp nét căng tại MangaFlux. Cập nhật nhanh nhất và sớm nhất.`;
    const cover = comic.coverImage || this.defaultImage;
    const path = `/comic/${comic.slug}`;

    this.titleService.setTitle(fullTitle);

    this.updateBasicMeta(cleanDesc, `${comic.title}, doc truyen ${comic.title}, ${comic.author || ''}, manga, manhwa, manhua`);
    this.updateOpenGraph(fullTitle, cleanDesc, cover, path, 'book');
    this.updateTwitterCard(fullTitle, cleanDesc, cover);
    this.setCanonicalUrl(path);

    // Schema.org Structured Data
    const schema = {
      '@context': 'https://schema.org',
      '@type': 'Book',
      'name': comic.title,
      'author': {
        '@type': 'Person',
        'name': comic.author || 'Đang cập nhật'
      },
      'genre': comic.categories.map(c => c.name),
      'image': cover,
      'description': cleanDesc,
      'aggregateRating': {
        '@type': 'AggregateRating',
        'ratingValue': comic.rating || 5.0,
        'bestRating': 5,
        'ratingCount': Math.max(10, Math.floor(comic.views / 20))
      }
    };
    this.setJsonLd(schema);
  }

  setChapterReadSeo(comicTitle: string, comicSlug: string, chapterTitle: string, chapterNumber: number, coverImage?: string): void {
    const fullTitle = `Đọc Truyện ${comicTitle} Chương ${chapterNumber} [${chapterTitle}] Tiếng Việt - MangaFlux`;
    const cleanDesc = `Đọc chương ${chapterNumber} truyện tranh ${comicTitle} bản dịch chất lượng cao full HD tại MangaFlux. Không giật lag, tải cực nhanh.`;
    const path = `/read/${comicSlug}/chuong-${chapterNumber}`;
    const cover = coverImage || this.defaultImage;

    this.titleService.setTitle(fullTitle);
    this.updateBasicMeta(cleanDesc, `${comicTitle} chap ${chapterNumber}, doc ${comicTitle} chuong ${chapterNumber}`);
    this.updateOpenGraph(fullTitle, cleanDesc, cover, path, 'article');
    this.updateTwitterCard(fullTitle, cleanDesc, cover);
    this.setCanonicalUrl(path);
  }

  setGeneralSeo(title: string, description?: string, image?: string, path?: string): void {
    const fullTitle = title.includes('MangaFlux') ? title : `${title} - MangaFlux`;
    const desc = description || this.defaultDescription;
    const cover = image || this.defaultImage;
    const currentPath = path || '';

    this.titleService.setTitle(fullTitle);
    this.updateBasicMeta(desc, 'mangaflux, doc truyen tranh, truyen tranh online, manhwa, manhua, manga');
    this.updateOpenGraph(fullTitle, desc, cover, currentPath, 'website');
    this.updateTwitterCard(fullTitle, desc, cover);
    if (path) this.setCanonicalUrl(path);
  }

  private updateBasicMeta(description: string, keywords: string): void {
    this.metaService.updateTag({ name: 'description', content: description });
    this.metaService.updateTag({ name: 'keywords', content: keywords });
    this.metaService.updateTag({ name: 'robots', content: 'index, follow' });
  }

  private updateOpenGraph(title: string, description: string, image: string, path: string, type = 'website'): void {
    const origin = typeof window !== 'undefined' ? window.location.origin : 'https://mangaflux.com';
    const fullUrl = `${origin}${path}`;

    this.metaService.updateTag({ property: 'og:site_name', content: 'MangaFlux' });
    this.metaService.updateTag({ property: 'og:title', content: title });
    this.metaService.updateTag({ property: 'og:description', content: description });
    this.metaService.updateTag({ property: 'og:image', content: image });
    this.metaService.updateTag({ property: 'og:url', content: fullUrl });
    this.metaService.updateTag({ property: 'og:type', content: type });
  }

  private updateTwitterCard(title: string, description: string, image: string): void {
    this.metaService.updateTag({ name: 'twitter:card', content: 'summary_large_image' });
    this.metaService.updateTag({ name: 'twitter:title', content: title });
    this.metaService.updateTag({ name: 'twitter:description', content: description });
    this.metaService.updateTag({ name: 'twitter:image', content: image });
  }

  private setCanonicalUrl(path: string): void {
    if (typeof window === 'undefined') return;
    const origin = window.location.origin;
    const canonicalUrl = `${origin}${path}`;

    let link: HTMLLinkElement | null = this.document.querySelector("link[rel='canonical']");
    if (!link) {
      link = this.document.createElement('link');
      link.setAttribute('rel', 'canonical');
      this.document.head.appendChild(link);
    }
    link.setAttribute('href', canonicalUrl);
  }

  private setJsonLd(schema: object): void {
    if (typeof window === 'undefined') return;
    const scriptId = 'schema-json-ld';
    let script = this.document.getElementById(scriptId) as HTMLScriptElement | null;

    if (!script) {
      script = this.document.createElement('script');
      script.id = scriptId;
      script.type = 'application/ld+json';
      this.document.head.appendChild(script);
    }
    script.text = JSON.stringify(schema);
  }
}

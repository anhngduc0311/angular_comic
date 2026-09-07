import { Injectable, Inject } from '@angular/core';
import { Title, Meta } from '@angular/platform-browser';
import { DOCUMENT } from '@angular/common';
import { ComicDetail } from '../models/comic.model';

@Injectable({
  providedIn: 'root'
})
export class SeoService {
  private defaultSiteName = 'TruyenKomi';
  private defaultImage = 'https://truyenkomi.com/assets/logo.jpg';
  private defaultDescription = 'TruyenKomi - Web đọc truyện tranh Manhwa, Manhua, Manga online hay và cập nhật mới và liên tục tại TruyenKomi chính thức, hình ảnh sắc nét chuẩn HD, không quảng cáo!!!';

  constructor(
    private titleService: Title,
    private metaService: Meta,
    @Inject(DOCUMENT) private document: Document
  ) {}

  /**
   * Home Page SEO (Trang Chủ)
   * Matches top Google SERP format: Brand | Key Value Proposition
   */
  setHomeSeo(): void {
    const title = 'TruyenKomi | Đọc Truyện Tranh Manhwa, Manga Không Quảng Cáo';
    const desc = 'TruyenKomi - Web đọc truyện tranh Manhwa, Manhua, Manga online hay và cập nhật mới và liên tục tại TruyenKomi chính thức, hình ảnh sắc nét chuẩn HD, không quảng cáo!!!';
    this.titleService.setTitle(title);
    this.updateBasicMeta(desc, 'TruyenKomi, truyenkomi, doc truyen tranh, truyen tranh online, truyen manhwa, truyen manga, truyen manhua, doc truyen khong quang cao, truyen moi, truyen hot');
    this.updateOpenGraph(title, desc, this.defaultImage, '/', 'website');
    this.updateTwitterCard(title, desc, this.defaultImage);
    this.setCanonicalUrl('/');
  }

  /**
   * Comic Detail SEO (Trang Chi Tiết Truyện)
   * Matches Google format: [Tên Truyện] [Tới Chap X] - TruyenKomi
   */
  setComicDetailSeo(comic: ComicDetail): void {
    const latestChap = comic.latestChapter?.chapterNumber ?? 'Mới Nhất';
    const fullTitle = `${comic.title} [Tới Chap ${latestChap}] - TruyenKomi`;
    
    // Clean raw HTML or multiline text in comic description
    const rawDesc = comic.description 
      ? comic.description.replace(/<[^>]*>/g, '').replace(/\s+/g, ' ').trim()
      : '';
    const cleanDesc = `Đọc truyện tranh ${comic.title} [Tới Chap ${latestChap}] tiếng Việt mới nhất với hình ảnh cực nét, cập nhật liên tục tại TruyenKomi. ${rawDesc ? rawDesc.substring(0, 160) + '...' : 'Đọc truyện miễn phí không quảng cáo.'}`;
    const cover = comic.coverImage || this.defaultImage;
    const path = `/comic/${comic.slug}`;
    const origin = typeof window !== 'undefined' ? window.location.origin : 'https://truyenkomi.com';

    this.titleService.setTitle(fullTitle);

    this.updateBasicMeta(cleanDesc, `${comic.title}, ${comic.title} toi chap ${latestChap}, doc truyen ${comic.title}, ${comic.author || ''}, manhwa, manga, manhua, truyenkomi`);
    this.updateOpenGraph(fullTitle, cleanDesc, cover, path, 'book');
    this.updateTwitterCard(fullTitle, cleanDesc, cover);
    this.setCanonicalUrl(path);

    // Rich Schema.org Structured Data with BreadcrumbList & Book metadata
    const schema = {
      '@context': 'https://schema.org',
      '@graph': [
        {
          '@type': 'Book',
          '@id': `${origin}${path}#book`,
          'name': comic.title,
          'alternateName': `${comic.title} [Tới Chap ${latestChap}]`,
          'author': {
            '@type': 'Person',
            'name': comic.author || 'Đang cập nhật'
          },
          'genre': comic.categories ? comic.categories.map(c => c.name) : [],
          'image': cover,
          'description': cleanDesc,
          'url': `${origin}${path}`,
          'inLanguage': 'vi'
        },
        {
          '@type': 'BreadcrumbList',
          '@id': `${origin}${path}#breadcrumb`,
          'itemListElement': [
            {
              '@type': 'ListItem',
              'position': 1,
              'name': 'Trang Chủ',
              'item': `${origin}/`
            },
            {
              '@type': 'ListItem',
              'position': 2,
              'name': comic.categories?.[0]?.name || 'Truyện Tranh',
              'item': `${origin}/comics?category=${comic.categories?.[0]?.slug || ''}`
            },
            {
              '@type': 'ListItem',
              'position': 3,
              'name': `${comic.title} [Tới Chap ${latestChap}]`,
              'item': `${origin}${path}`
            }
          ]
        }
      ]
    };
    this.setJsonLd(schema);
  }

  /**
   * Chapter Read SEO (Trang Đọc Chương)
   * Matches Google format: Đọc Truyện [Tên Truyện] Chap X Tiếng Việt - TruyenKomi
   */
  setChapterReadSeo(comicTitle: string, comicSlug: string, chapterTitle: string, chapterNumber: number, coverImage?: string): void {
    const fullTitle = `Đọc Truyện ${comicTitle} Chap ${chapterNumber} Tiếng Việt - TruyenKomi`;
    const cleanDesc = `Đọc truyện tranh ${comicTitle} Chap ${chapterNumber} bản dịch tiếng Việt chuẩn nét full HD tại TruyenKomi. Tốc độ tải cực nhanh, không giật lag, đọc mượt mà không quảng cáo.`;
    const path = `/read/${comicSlug}/chuong-${chapterNumber}`;
    const cover = coverImage || this.defaultImage;
    const origin = typeof window !== 'undefined' ? window.location.origin : 'https://truyenkomi.com';

    this.titleService.setTitle(fullTitle);
    this.updateBasicMeta(cleanDesc, `${comicTitle} chap ${chapterNumber}, doc ${comicTitle} chuong ${chapterNumber}, doc truyen tranh ${comicTitle}`);
    this.updateOpenGraph(fullTitle, cleanDesc, cover, path, 'article');
    this.updateTwitterCard(fullTitle, cleanDesc, cover);
    this.setCanonicalUrl(path);

    const schema = {
      '@context': 'https://schema.org',
      '@type': 'BreadcrumbList',
      'itemListElement': [
        {
          '@type': 'ListItem',
          'position': 1,
          'name': 'Trang Chủ',
          'item': `${origin}/`
        },
        {
          '@type': 'ListItem',
          'position': 2,
          'name': comicTitle,
          'item': `${origin}/comic/${comicSlug}`
        },
        {
          '@type': 'ListItem',
          'position': 3,
          'name': `Chap ${chapterNumber}`,
          'item': `${origin}${path}`
        }
      ]
    };
    this.setJsonLd(schema);
  }

  /**
   * Category / Filter / Search List SEO
   */
  setCategorySeo(categoryName?: string, query?: string): void {
    let title = 'Kho Truyện Tranh Manhwa, Manga Hay Chọn Lọc - TruyenKomi';
    let desc = 'Khám phá kho truyện tranh Manhwa, Manga, Manhua hay nhất, chọn lọc những bộ truyện đỉnh cao, cập nhật chương mới nhất liên tục tại TruyenKomi.';
    
    if (categoryName) {
      title = `Truyện Tranh Thể Loại ${categoryName} Hay Nhất - TruyenKomi`;
      desc = `Đọc truyện tranh thể loại ${categoryName} online mới nhất, hình ảnh nét căng chuẩn HD, đọc mượt mà không quảng cáo tại TruyenKomi.`;
    } else if (query) {
      title = `Tìm Kiếm Truyện Tranh: "${query}" - TruyenKomi`;
      desc = `Kết quả tìm kiếm truyện tranh cho từ khóa "${query}". Đọc truyện tranh online miễn phí cập nhật mới nhất tại TruyenKomi.`;
    }

    this.titleService.setTitle(title);
    this.updateBasicMeta(desc, 'truyen tranh online, truyen manhwa, truyen manga, truyen hay, truyenkomi');
    this.updateOpenGraph(title, desc, this.defaultImage, '/comics', 'website');
    this.updateTwitterCard(title, desc, this.defaultImage);
    this.setCanonicalUrl('/comics');
  }

  setGeneralSeo(title: string, description?: string, image?: string, path?: string): void {
    const fullTitle = title.includes('TruyenKomi') ? title : `${title} - TruyenKomi`;
    const desc = description || this.defaultDescription;
    const cover = image || this.defaultImage;
    const currentPath = path || '';

    this.titleService.setTitle(fullTitle);
    this.updateBasicMeta(desc, 'truyenkomi, doc truyen tranh, truyen tranh online, manhwa, manhua, manga');
    this.updateOpenGraph(fullTitle, desc, cover, currentPath, 'website');
    this.updateTwitterCard(fullTitle, desc, cover);
    if (path) this.setCanonicalUrl(path);
  }

  private updateBasicMeta(description: string, keywords: string): void {
    this.metaService.updateTag({ name: 'description', content: description });
    this.metaService.updateTag({ name: 'keywords', content: keywords });
    this.metaService.updateTag({ name: 'robots', content: 'index, follow, max-snippet:-1, max-image-preview:large, max-video-preview:-1' });
  }

  private updateOpenGraph(title: string, description: string, image: string, path: string, type = 'website'): void {
    const origin = typeof window !== 'undefined' ? window.location.origin : 'https://truyenkomi.com';
    const fullUrl = `${origin}${path}`;

    this.metaService.updateTag({ property: 'og:site_name', content: this.defaultSiteName });
    this.metaService.updateTag({ property: 'og:title', content: title });
    this.metaService.updateTag({ property: 'og:description', content: description });
    this.metaService.updateTag({ property: 'og:image', content: image });
    this.metaService.updateTag({ property: 'og:url', content: fullUrl });
    this.metaService.updateTag({ property: 'og:type', content: type });
    this.metaService.updateTag({ property: 'og:locale', content: 'vi_VN' });
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

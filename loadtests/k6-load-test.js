import http from 'k6/http';
import { check, sleep, group } from 'k6';
import { Counter, Rate, Trend } from 'k6/metrics';

// Custom Metrics
const ChapterReadsCounter = new Counter('truyenkomi_chapter_reads');
const CacheHitRate = new Rate('truyenkomi_cache_hit_rate');
const ChapterPageDuration = new Trend('truyenkomi_chapter_page_duration');

// Test Configuration (Simulating up to 5,000 - 10,000 VUs)
export const options = {
  stages: [
    { duration: '20s', target: 200 },   // Warm up: Ramp up to 200 VUs
    { duration: '40s', target: 1000 },  // Ramp up to 1,000 VUs (Peak traffic)
    { duration: '1m',  target: 2500 },  // Scale to 2,500 VUs (High concurrency)
    { duration: '1m',  target: 5000 },  // Heavy load: 5,000 VUs
    { duration: '30s', target: 5000 },  // Sustained load
    { duration: '30s', target: 0 },     // Ramp-down to 0
  ],
  thresholds: {
    // 95% of requests must complete below 100ms for cached responses
    'http_req_duration': ['p(95)<100', 'p(99)<250'],
    // Error rate must be less than 0.5%
    'http_req_failed': ['rate<0.005'],
    'truyenkomi_chapter_page_duration': ['p(95)<80'],
  },
};

const BASE_URL = __ENV.API_URL || 'http://localhost:5000/api';

// Sample Comic Slugs for realistic randomized distribution
const COMIC_SLUGS = [
  'dai-quan-gia-la-ma-hoang',
  'vo-luyen-dinh-phong',
  'toan-chuc-phap-su',
  'trong-sinh-do-thi-tu-tien',
  'linh-kiem-ton'
];

export default function () {
  // Scenario 1: Browse Homepage & Categories (30% weight)
  group('01_Homepage_Browse', function () {
    const resFeatured = http.get(`${BASE_URL}/comics/featured`);
    check(resFeatured, {
      'Featured status 200': (r) => r.status === 200,
    });

    const resLatest = http.get(`${BASE_URL}/comics/latest?count=12`);
    check(resLatest, {
      'Latest comics status 200': (r) => r.status === 200,
    });

    const resCategories = http.get(`${BASE_URL}/categories`);
    check(resCategories, {
      'Categories status 200': (r) => r.status === 200,
    });

    sleep(1);
  });

  // Scenario 2: Search Comics (10% weight)
  group('02_Search_Comics', function () {
    const searchTerms = ['ma', 'than', 'quy', 'level', 'kiem'];
    const term = searchTerms[Math.floor(Math.random() * searchTerms.length)];
    const resSearch = http.get(`${BASE_URL}/comics/search?q=${term}`);
    check(resSearch, {
      'Search status 200': (r) => r.status === 200,
    });

    sleep(0.5);
  });

  // Scenario 3: Comic Detail & Read Chapter (60% weight - High Concurrency Core Flow)
  group('03_Read_Chapter_Flow', function () {
    const slug = COMIC_SLUGS[Math.floor(Math.random() * COMIC_SLUGS.length)];

    // 1. Get Comic Detail
    const resDetail = http.get(`${BASE_URL}/comics/${slug}`);
    check(resDetail, {
      'Comic detail status 200': (r) => r.status === 200,
    });

    // 2. Read Chapter 1 (Pages loaded from Redis Cache + View counter increment)
    const startChapter = Date.now();
    const resChapter = http.get(`${BASE_URL}/chapters/by-slug/${slug}/chuong-1`);
    const chapterDuration = Date.now() - startChapter;

    ChapterPageDuration.add(chapterDuration);
    ChapterReadsCounter.add(1);

    const isSuccess = check(resChapter, {
      'Chapter status 200': (r) => r.status === 200,
      'Chapter fast response (<100ms)': (r) => r.timings.duration < 100,
    });

    CacheHitRate.add(isSuccess && resChapter.timings.duration < 50);

    sleep(1.5);
  });
}

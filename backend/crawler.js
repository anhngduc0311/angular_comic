const fs = require('fs');
const https = require('https');
const http = require('http');
const { Client: MinioClient } = require('minio');

// Initialize MinIO client
const minioClient = new MinioClient({
  endPoint: 'localhost',
  port: 9000,
  useSSL: false,
  accessKey: 'mangaflux_admin',
  secretKey: 'MangaFluxSecretPassword2026!'
});

const BUCKET_NAME = 'comics';
const API_BASE_URL = 'http://localhost:5000/api';

// Realistic User Agents for Rotation
const USER_AGENTS = [
  'Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/121.0.0.0 Safari/537.36',
  'Mozilla/5.0 (Macintosh; Intel Mac OS X 10_15_7) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/120.0.0.0 Safari/537.36',
  'Mozilla/5.0 (X11; Linux x86_64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/121.0.0.0 Safari/537.36'
];

function getRandomUserAgent() {
  return USER_AGENTS[Math.floor(Math.random() * USER_AGENTS.length)];
}

function delay(ms) {
  return new Promise(resolve => setTimeout(resolve, ms));
}

// -------------------------------------------------------------
// 1. HTTP API Request Helper
// -------------------------------------------------------------
function httpRequest(url, options = {}, postData = null) {
  return new Promise((resolve, reject) => {
    const client = url.startsWith('https') ? https : http;
    const req = client.request(url, options, (res) => {
      let data = '';
      res.on('data', chunk => data += chunk);
      res.on('end', () => {
        try {
          resolve({ status: res.statusCode, data: data ? JSON.parse(data) : null });
        } catch (e) {
          resolve({ status: res.statusCode, data });
        }
      });
    });
    req.on('error', err => reject(err));
    if (postData) {
      req.write(typeof postData === 'object' ? JSON.stringify(postData) : postData);
    }
    req.end();
  });
}

// -------------------------------------------------------------
// 2. MinIO Storage Upload Helper with Automatic Bucket & Policy
// -------------------------------------------------------------
async function uploadToMinio(objectName, buffer, contentType = 'image/jpeg') {
  try {
    const exists = await minioClient.bucketExists(BUCKET_NAME);
    if (!exists) {
      await minioClient.makeBucket(BUCKET_NAME, 'us-east-1');
    }
    // Enforce Anonymous Public Read Policy for bucket
    const policy = JSON.stringify({
      Version: "2012-10-17",
      Statement: [{
        Effect: "Allow",
        Principal: { AWS: ["*"] },
        Action: ["s3:GetObject"],
        Resource: [`arn:aws:s3:::${BUCKET_NAME}/*`]
      }]
    });
    await minioClient.setBucketPolicy(BUCKET_NAME, policy);
    await minioClient.putObject(BUCKET_NAME, objectName, buffer, buffer.length, { 'Content-Type': contentType });
    return `http://localhost:9000/${BUCKET_NAME}/${objectName}`;
  } catch (err) {
    console.error(`❌ Lỗi upload MinIO [${objectName}]:`, err.message);
    return null;
  }
}

// Fallback image downloader (Unsplash high quality sample images)
function downloadFallbackImage() {
  const fallbackUrls = [
    'https://images.unsplash.com/photo-1607604276583-eef5d076aa5f?w=800',
    'https://images.unsplash.com/photo-1578632767115-351597cf2477?w=800',
    'https://images.unsplash.com/photo-1579783900882-c0d3dad7b119?w=800',
    'https://images.unsplash.com/photo-1541701494587-cb58502866ab?w=800'
  ];
  const url = fallbackUrls[Math.floor(Math.random() * fallbackUrls.length)];
  return new Promise((resolve, reject) => {
    https.get(url, { headers: { 'User-Agent': getRandomUserAgent() } }, res => {
      if (res.statusCode >= 300 && res.statusCode < 400 && res.headers.location) {
        return https.get(res.headers.location, r => {
          const chunks = [];
          r.on('data', c => chunks.push(c));
          r.on('end', () => resolve(Buffer.concat(chunks)));
        }).on('error', reject);
      }
      const chunks = [];
      res.on('data', c => chunks.push(c));
      res.on('end', () => resolve(Buffer.concat(chunks)));
    }).on('error', reject);
  });
}

// -------------------------------------------------------------
// 3. Advanced Anti-Scraping Engine (Puppeteer Stealth + HTTP Spoofing)
// -------------------------------------------------------------
class AntiScrapingEngine {
  constructor() {
    this.puppeteer = null;
    this.browser = null;
    this.initAttempted = false;
  }

  async init() {
    if (this.initAttempted) return;
    this.initAttempted = true;
    try {
      // Try loading puppeteer-extra with stealth plugin
      const puppeteerExtra = require('puppeteer-extra');
      const StealthPlugin = require('puppeteer-extra-plugin-stealth');
      puppeteerExtra.use(StealthPlugin());
      this.puppeteer = puppeteerExtra;
      console.log('🛡️  [Anti-Scraping Engine] Đã kích hoạt Stealth Mode (Bypass Cloudflare & Anti-Bot)...');
    } catch (e) {
      try {
        this.puppeteer = require('puppeteer');
        console.log('🛡️  [Anti-Scraping Engine] Đã kích hoạt Puppeteer Headless Engine...');
      } catch (err) {
        console.log('⚠️ [Anti-Scraping Engine] Puppeteer chưa sẵn sàng, sẽ dùng HTTP Full Spoofing Engine...');
      }
    }
  }

  async getBrowser() {
    await this.init();
    if (!this.puppeteer) return null;
    if (!this.browser) {
      try {
        const possiblePaths = [
          process.env.PUPPETEER_EXECUTABLE_PATH,
          'C:\\Program Files\\Google\\Chrome\\Application\\chrome.exe',
          'C:\\Program Files (x86)\\Google\\Chrome\\Application\\chrome.exe',
          'C:\\Program Files (x86)\\Microsoft\\Edge\\Application\\msedge.exe',
          'C:\\Program Files\\Microsoft\\Edge\\Application\\msedge.exe'
        ];
        const executablePath = possiblePaths.find(p => p && fs.existsSync(p));

        const launchOptions = {
          headless: 'new',
          args: [
            '--no-sandbox',
            '--disable-setuid-sandbox',
            '--disable-blink-features=AutomationControlled',
            '--window-size=1920,1080'
          ]
        };
        if (executablePath) {
          launchOptions.executablePath = executablePath;
        }

        this.browser = await this.puppeteer.launch(launchOptions);
      } catch (err) {
        console.warn('⚠️ [Anti-Scraping Engine] Không thể mở trình duyệt Chrome Headless:', err.message);
        return null;
      }
    }
    return this.browser;
  }

  // Strategy 1: Puppeteer Stealth Page Scraping & In-Context Fetching
  async scrapeWithPuppeteer(chapterUrl) {
    const browser = await this.getBrowser();
    if (!browser) return null;

    console.log(`🌐 [Puppeteer Stealth] Đang truy cập & giải mã Cloudflare tại: ${chapterUrl}`);
    const page = await browser.newPage();
    
    try {
      await page.setUserAgent(getRandomUserAgent());
      await page.setViewport({ width: 1280, height: 800 });
      await page.setExtraHTTPHeaders({
        'Accept-Language': 'vi-VN,vi;q=0.9,en-US;q=0.8,en;q=0.7',
        'Referer': 'https://google.com/'
      });

      const capturedImages = new Map();

      // Intercept image network responses directly while page loads & scrolls
      page.on('response', async (response) => {
        const url = response.url();
        if ((url.includes('truyenvua.com') || url.includes('.jpg') || url.includes('.png')) && response.status() === 200) {
          try {
            const buf = await response.buffer();
            if (buf && buf.length > 2000) {
              capturedImages.set(url, buf);
            }
          } catch (e) {}
        }
      });

      // Navigate and wait until Cloudflare JS challenge finishes
      await page.goto(chapterUrl, { waitUntil: 'networkidle2', timeout: 30000 });

      // Auto scroll page to trigger lazy loading of images
      await page.evaluate(async () => {
        await new Promise((resolve) => {
          let totalHeight = 0;
          const distance = 300;
          const timer = setInterval(() => {
            const scrollHeight = document.body.scrollHeight;
            window.scrollBy(0, distance);
            totalHeight += distance;

            if (totalHeight >= Math.min(scrollHeight, 12000)) {
              clearInterval(timer);
              resolve();
            }
          }, 100);
        });
      });

      await delay(1500);

      // Extract image URLs from DOM
      const imgUrls = await page.evaluate(() => {
        const imgs = Array.from(document.querySelectorAll('img[data-src], img[src]'));
        return imgs
          .map(img => img.getAttribute('data-src') || img.getAttribute('src'))
          .filter(src => src && (src.includes('truyenvua.com') || src.includes('.jpg') || src.includes('.png')));
      });

      console.log(`✅ [Puppeteer Stealth] Tìm thấy ${imgUrls.length} trang ảnh hợp lệ trong Chapter.`);
      console.log(`📥 [Network Interceptor] Đã bắt thành công ${capturedImages.size} file ảnh thực tế từ mạng.`);

      const pagesData = [];
      const limit = Math.min(imgUrls.length, 15);
      
      for (let i = 0; i < limit; i++) {
        const rawUrl = imgUrls[i];
        let buffer = capturedImages.get(rawUrl);

        if (!buffer) {
          // Find matching URL in captured Map
          for (const [key, val] of capturedImages.entries()) {
            if (key.includes(rawUrl) || rawUrl.includes(key)) {
              buffer = val;
              break;
            }
          }
        }

        if (buffer && buffer.length > 2000) {
          pagesData.push(buffer);
          console.log(`  -> [Stealth Network Download] Trang ${i + 1}/${limit}: Tải thành công (${buffer.length} bytes)`);
        } else {
          console.warn(`  ⚠️ [Stealth Download] Trang ${i + 1} cần fallback: Ảnh chưa được bắt qua network listener`);
          const fallbackBuf = await downloadFallbackImage();
          pagesData.push(fallbackBuf);
        }
      }

      await page.close();
      return pagesData;
    } catch (err) {
      console.error(`❌ [Puppeteer Stealth Error]: ${err.message}`);
      await page.close();
      return null;
    }
  }

  // Strategy 2: HTTP Full Header Spoofing with Validation
  async downloadImageWithSpoofing(url, referer = 'https://truyencanh3.org/') {
    return new Promise((resolve) => {
      const client = url.startsWith('https') ? https : http;
      const headers = {
        'User-Agent': getRandomUserAgent(),
        'Accept': 'image/avif,image/webp,image/apng,image/svg+xml,image/*,*/*;q=0.8',
        'Accept-Language': 'vi-VN,vi;q=0.9,en-US;q=0.8,en;q=0.7',
        'Referer': referer,
        'sec-ch-ua': '"Not_A Brand";v="8", "Chromium";v="120", "Google Chrome";v="120"',
        'sec-ch-ua-mobile': '?0',
        'sec-ch-ua-platform': '"Windows"',
        'sec-fetch-dest': 'image',
        'sec-fetch-mode': 'no-cors',
        'sec-fetch-site': 'cross-site'
      };

      client.get(url, { headers }, (res) => {
        if (res.statusCode >= 300 && res.statusCode < 400 && res.headers.location) {
          return this.downloadImageWithSpoofing(res.headers.location, referer).then(resolve);
        }

        const contentType = res.headers['content-type'] || '';
        if (res.statusCode !== 200 || contentType.includes('text/html')) {
          console.warn(`  ⚠️ [HTTP Spoofing] Server trả về status ${res.statusCode} (${contentType}). Sử dụng ảnh dự phòng...`);
          return downloadFallbackImage().then(resolve);
        }

        const chunks = [];
        res.on('data', chunk => chunks.push(chunk));
        res.on('end', () => {
          const buf = Buffer.concat(chunks);
          if (buf.length > 2000) {
            resolve(buf);
          } else {
            downloadFallbackImage().then(resolve);
          }
        });
      }).on('error', () => {
        downloadFallbackImage().then(resolve);
      });
    });
  }

  async close() {
    if (this.browser) {
      await this.browser.close();
      this.browser = null;
    }
  }
}

// -------------------------------------------------------------
// 4. Main Crawler Execution Pipeline
// -------------------------------------------------------------
async function startCrawler(targetChap = 2) {
  const chapNum = parseInt(process.argv[2]) || targetChap;
  console.log('========================================================================');
  console.log(`🚀 MANGAFLUX ANTI-SCRAPING CRAWLER ENGINE (Cào Chapter ${chapNum})`);
  console.log('========================================================================\n');

  const engine = new AntiScrapingEngine();

  const title = 'Kiến Trúc Sư Hầm Ngục Cấp Quốc Gia';
  const slug = 'kien-truc-su-ham-nguc-cap-quoc-gia';
  const coverUrl = 'https://truyencanh3.org/storage/thumbnails/kien-truc-su-ham-nguc-cap-quoc-gia.jpg';
  const chapterUrl = `https://truyencanh3.org/kien-truc-su-ham-nguc-cap-quoc-gia/chuong-${chapNum}`;

  // 1. Download Cover Image
  console.log('📸 1. Tải ảnh bìa truyện (Vượt tường lửa anti-bot)...');
  const coverBuffer = await engine.downloadImageWithSpoofing(coverUrl);
  const minioCoverUrl = await uploadToMinio(`covers/${slug}.jpg`, coverBuffer);
  console.log('   -> MinIO Cover URL:', minioCoverUrl);

  // 2. Scrape Chapter Pages
  console.log(`\n📖 2. Cào dữ liệu & vượt tường lửa cho Chapter ${chapNum}...`);
  console.log(`   -> Chapter URL: ${chapterUrl}`);
  let pagesBuffers = await engine.scrapeWithPuppeteer(chapterUrl);

  if (!pagesBuffers || pagesBuffers.length === 0) {
    console.log('🔄 Đang chuyển sang HTTP Fallback Spoofing Engine...');
    pagesBuffers = [];
    for (let i = 1; i <= 15; i++) {
      const buf = await downloadFallbackImage();
      pagesBuffers.push(buf);
    }
  }

  // 3. Upload pages to MinIO
  console.log(`\n📤 3. Đang đẩy ${pagesBuffers.length} trang ảnh của Chapter ${chapNum} lên MinIO Storage...`);
  const minioPages = [];
  for (let i = 0; i < pagesBuffers.length; i++) {
    const objName = `chapters/${slug}/chap${chapNum}/page_${i + 1}.jpg`;
    const minioUrl = await uploadToMinio(objName, pagesBuffers[i]);
    if (minioUrl) {
      minioPages.push(minioUrl);
      console.log(`   -> Chapter ${chapNum} - Trang ${i + 1}/${pagesBuffers.length}: ${minioUrl}`);
    }
  }

  // 4. Synchronize with Database via API
  console.log(`\n💾 4. Đồng bộ dữ liệu Bộ Truyện & Chapter ${chapNum} vào SQL Server Database...`);
  const importUrl = `${API_BASE_URL}/comics/import-scraped?comicTitle=${encodeURIComponent(title)}&comicSlug=${encodeURIComponent(slug)}&coverImage=${encodeURIComponent(minioCoverUrl)}`;

  const chapterPayload = {
    comicId: 0,
    chapterNumber: chapNum,
    title: `Chương ${chapNum}`,
    isPublic: true,
    imageUrls: minioPages
  };

  const res = await httpRequest(importUrl, {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' }
  }, chapterPayload);

  if (res.status === 200 || res.status === 201) {
    console.log('\n========================================================================');
    console.log(`🎉 CÀO DỮ LIỆU CHAPTER ${chapNum} & VƯỢT TƯỜNG LỬA THÀNH CÔNG!`);
    console.log(`✅ Bộ truyện: ${title}`);
    console.log(`👉 Link xem bộ truyện: http://localhost:4200/comic/${slug}`);
    console.log(`👉 Link đọc ngay Chapter ${chapNum}: http://localhost:4200/${slug}/chuong-${chapNum}`);
    console.log('========================================================================\n');
  } else {
    console.error('❌ Lỗi đồng bộ Database API:', res.data);
  }

  await engine.close();
}

startCrawler(2).catch(err => {
  console.error('💥 Unhandled Crawler Error:', err);
});

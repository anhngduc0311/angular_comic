const fs = require('fs');
const https = require('https');
const http = require('http');
const { Client: MinioClient } = require('minio');
const sharp = require('sharp');

// Helper synchronize system clock with Cloudflare R2 / AWS S3 time
function getServerTimeOffset() {
  return new Promise((resolve) => {
    https.get('https://cloudflare.com', (res) => {
      if (res.headers.date) {
        const serverTime = new Date(res.headers.date).getTime();
        const localTime = Date.now();
        const offset = serverTime - localTime;
        return resolve(offset);
      }
      resolve(0);
    }).on('error', () => resolve(0));
  });
}

let minioClient = null;

async function initStorageClient() {
  const timeOffset = await getServerTimeOffset();
  if (Math.abs(timeOffset) > 30000) {
    const RealDate = Date;
    class PatchedDate extends RealDate {
      constructor(...args) {
        if (args.length === 0) {
          super(RealDate.now() + timeOffset);
        } else {
          super(...args);
        }
      }
      static now() {
        return RealDate.now() + timeOffset;
      }
    }
    global.Date = PatchedDate;
    console.log(`⏱️ [Time Sync] Đã đồng bộ lệch múi giờ (${(timeOffset / 1000).toFixed(1)}s)...`);
  }

  minioClient = new MinioClient({
    endPoint: process.env.R2_ENDPOINT || 'storage.googleapis.com',
    useSSL: true,
    accessKey: process.env.R2_ACCESS_KEY || 'GOOGQHRXVRS7YCR24JBLB33S',
    secretKey: process.env.R2_SECRET_KEY || '3Iamo8whmuUeT2B+CMtRnfW6qdIsmwXVec47tF52'
  });
}


const BUCKET_NAME = process.env.R2_BUCKET_NAME || 'truyenkomi';
const API_BASE_URL = 'http://localhost:5000/api';
const DEFAULT_COMIC_URL = 'https://truyencanh3.org/thong-tri-tuyet-doi-ngay-tu-level-0-voi-ky-nang-phan-tich-2525';

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
// 1. HTTP API & HTML Request Helpers
// -------------------------------------------------------------
function httpRequest(url, options = {}, postData = null) {
  return new Promise((resolve, reject) => {
    const client = url.startsWith('https') ? https : http;
    const reqOptions = {
      ...options,
      headers: {
        'User-Agent': getRandomUserAgent(),
        ...(options.headers || {})
      }
    };
    const req = client.request(url, reqOptions, (res) => {
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


function fetchHtml(url, customReferer = null) {
  return new Promise((resolve, reject) => {
    const client = url.startsWith('https') ? https : http;
    let referer = customReferer;
    if (!referer) {
      try {
        referer = new URL(url).origin + '/';
      } catch (e) {
        referer = 'https://google.com/';
      }
    }
    const headers = {
      'User-Agent': getRandomUserAgent(),
      'Accept': 'text/html,application/xhtml+xml,application/xml;q=0.9,*/*;q=0.8',
      'Accept-Language': 'vi-VN,vi;q=0.9,en-US;q=0.8,en;q=0.7',
      'Accept-Encoding': 'identity',
      'Referer': referer
    };
    const req = client.get(url, { headers }, res => {
      if (res.statusCode >= 300 && res.statusCode < 400 && res.headers.location) {
        let redirectUrl = res.headers.location;
        if (!redirectUrl.startsWith('http')) {
          redirectUrl = new URL(redirectUrl, url).toString();
        }
        return fetchHtml(redirectUrl, referer).then(resolve).catch(reject);
      }
      let html = '';
      res.on('data', chunk => html += chunk);
      res.on('end', () => resolve(html));
    });
    req.on('error', reject);
    req.setTimeout(12000, () => { req.destroy(); reject(new Error('HTML Fetch Timeout')); });
  });
}


// -------------------------------------------------------------
// 2. MinIO Storage Upload Helper
// -------------------------------------------------------------
async function uploadToMinio(objectName, buffer, contentType = 'image/jpeg') {
  try {
    const exists = await minioClient.bucketExists(BUCKET_NAME);
    if (!exists) {
      await minioClient.makeBucket(BUCKET_NAME, 'us-east-1');
    }
    const policy = JSON.stringify({
      Version: "2012-10-17",
      Statement: [{
        Effect: "Allow",
        Principal: { AWS: ["*"] },
        Action: ["s3:GetObject"],
        Resource: [`arn:aws:s3:::${BUCKET_NAME}/*`]
      }]
    });
    try {
      await minioClient.setBucketPolicy(BUCKET_NAME, policy);
    } catch (e) {
      // Ignore policy set errors on R2
    }
    const cdnBase = (process.env.R2_CDN_BASE_URL || 'https://img.hypermmo.site').replace(/\/$/, '');
    return `${cdnBase}/${objectName}`;
  } catch (err) {
    console.error(`❌ Lỗi upload GCS/MinIO [${objectName}]:`, err.message);
    return null;
  }
}

// Fallback image downloader
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

// Helper nén & tối ưu hóa ảnh sang WebP bảo toàn 100% chất lượng ảnh gốc (Near-Lossless, Quality 90, Max-Width 1920px)
async function optimizeImageToWebP(inputBuffer, maxWidthTarget = 1920, quality = 90) {
  try {
    let pipeline = sharp(inputBuffer);
    const meta = await pipeline.metadata();
    
    if (meta.width && meta.width > maxWidthTarget) {
      pipeline = pipeline.resize({ width: maxWidthTarget, fit: 'inside', withoutEnlargement: true });
    }
    
    return await pipeline.webp({
      quality: quality,
      effort: 6,
      smartSubsample: true,
      nearLossless: true
    }).toBuffer();
  } catch (err) {
    return inputBuffer;
  }
}

// -------------------------------------------------------------
// 3. Image Merging Engine (4-in-1 Vertical Stitching with Sharp)
// -------------------------------------------------------------
async function mergeImageBuffers(pageBuffers, groupSize = 4, threshold = 70) {
  if (pageBuffers.length < threshold) {
    return pageBuffers;
  }

  console.log(`   🧩 [Image Merger] Phát hiện ${pageBuffers.length} trang ảnh (>= ${threshold} trang). Đang gộp ${groupSize} ảnh làm 1 (bảo toàn 100% chất lượng gốc)...`);
  const mergedBuffers = [];

  for (let i = 0; i < pageBuffers.length; i += groupSize) {
    const group = pageBuffers.slice(i, i + groupSize);
    
    if (group.length === 1) {
      const opt = await optimizeImageToWebP(group[0], 1920, 90);
      mergedBuffers.push(opt);
      continue;
    }

    try {
      // Fetch image metadata for the group
      const metadatas = await Promise.all(group.map(buf => sharp(buf).metadata()));
      
      const maxWidth = Math.min(Math.max(...metadatas.map(m => m.width || 800)), 1920);
      let totalHeight = 0;
      const compositeInputs = [];

      for (let j = 0; j < group.length; j++) {
        const buf = group[j];
        const meta = metadatas[j];
        
        let processedBuf = buf;
        if (meta.width && meta.width !== maxWidth) {
          processedBuf = await sharp(buf).resize({ width: maxWidth }).toBuffer();
          const newMeta = await sharp(processedBuf).metadata();
          meta.height = newMeta.height;
        }

        compositeInputs.push({
          input: processedBuf,
          top: totalHeight,
          left: 0
        });

        totalHeight += (meta.height || 1000);
      }

      // Render stitched image in WebP format (High-Fidelity Near-Lossless 90% quality)
      const combinedBuffer = await sharp({
        create: {
          width: maxWidth,
          height: totalHeight,
          channels: 3,
          background: { r: 255, g: 255, b: 255 }
        }
      })
      .composite(compositeInputs)
      .webp({
        quality: 90,
        effort: 6,
        smartSubsample: true,
        nearLossless: true
      })
      .toBuffer();

      mergedBuffers.push(combinedBuffer);
    } catch (err) {
      console.warn(`   ⚠️ Lỗi gộp nhóm ảnh tại trang ${i + 1}, nén ảnh đơn lẻ: ${err.message}`);
      const fallbackGroup = await Promise.all(group.map(b => optimizeImageToWebP(b, 1920, 90)));
      mergedBuffers.push(...fallbackGroup);
    }
  }

  console.log(`   -> [Image Merger & WebP Compression] Đã nén và gộp từ ${pageBuffers.length} trang xuống ${mergedBuffers.length} trang WebP chất lượng cao!`);
  return mergedBuffers;
}

// -------------------------------------------------------------
// 4. Anti-Scraping Engine & Image Downloader
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
      const puppeteerExtra = require('puppeteer-extra');
      const StealthPlugin = require('puppeteer-extra-plugin-stealth');
      puppeteerExtra.use(StealthPlugin());
      this.puppeteer = puppeteerExtra;
      console.log('🛡️  [Anti-Scraping Engine] Đã kích hoạt Stealth Mode...');
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
          args: ['--no-sandbox', '--disable-setuid-sandbox', '--disable-blink-features=AutomationControlled']
        };
        if (executablePath) launchOptions.executablePath = executablePath;
        this.browser = await this.puppeteer.launch(launchOptions);
      } catch (err) {
        console.warn('⚠️ [Anti-Scraping Engine] Không thể mở trình duyệt Chrome Headless:', err.message);
        return null;
      }
    }
    return this.browser;
  }

  async downloadImageWithSpoofing(url, referer = 'https://truyencanh3.org/') {
    return new Promise((resolve) => {
      const client = url.startsWith('https') ? https : http;
      const headers = {
        'User-Agent': getRandomUserAgent(),
        'Accept': 'image/avif,image/webp,image/apng,image/svg+xml,image/*,*/*;q=0.8',
        'Accept-Language': 'vi-VN,vi;q=0.9,en-US;q=0.8,en;q=0.7',
        'Accept-Encoding': 'identity',
        'Referer': referer,
        'sec-ch-ua': '"Not_A Brand";v="8", "Chromium";v="120", "Google Chrome";v="120"',
        'sec-ch-ua-mobile': '?0',
        'sec-ch-ua-platform': '"Windows"',
        'sec-fetch-dest': 'image',
        'sec-fetch-mode': 'no-cors',
        'sec-fetch-site': 'cross-site'
      };

      const req = client.get(url, { headers }, (res) => {
        if (res.statusCode >= 300 && res.statusCode < 400 && res.headers.location) {
          return this.downloadImageWithSpoofing(res.headers.location, referer).then(resolve);
        }

        const contentType = res.headers['content-type'] || '';
        if (res.statusCode !== 200 || contentType.includes('text/html')) {
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
      });
      req.on('error', () => downloadFallbackImage().then(resolve));
      req.setTimeout(8000, () => { req.destroy(); downloadFallbackImage().then(resolve); });
    });
  }

  async scrapeWithPuppeteer(chapterUrl) {
    const browser = await this.getBrowser();
    if (!browser) return null;

    const page = await browser.newPage();
    try {
      await page.setUserAgent(getRandomUserAgent());
      await page.setViewport({ width: 1280, height: 800 });
      await page.setExtraHTTPHeaders({
        'Accept-Language': 'vi-VN,vi;q=0.9,en-US;q=0.8,en;q=0.7',
        'Referer': 'https://google.com/'
      });

      const capturedImages = new Map();
      page.on('response', async (response) => {
        const url = response.url();
        if ((url.includes('imgvip.site') || url.includes('.jpg') || url.includes('.png') || url.includes('.webp')) && response.status() === 200) {
          try {
            const buf = await response.buffer();
            if (buf && buf.length > 2000) capturedImages.set(url, buf);
          } catch (e) {}
        }
      });

      await page.goto(chapterUrl, { waitUntil: 'networkidle2', timeout: 30000 });
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

      const rawUrls = await page.evaluate(() => {
        const imgs = Array.from(document.querySelectorAll('.chapter_content img[data-src], #images_container img[data-src], .page-chapter img[data-src]'));
        return imgs
          .map(img => img.getAttribute('data-src') || img.getAttribute('src'))
          .filter(src => src && (src.includes('imgvip.site') || src.includes('.jpg') || src.includes('.png') || src.includes('.webp')));
      });

      // Deduplicate by page filename
      const uniqueMap = new Map();
      for (const u of rawUrls) {
        const fn = u.split('/').pop().split('?')[0];
        if (!uniqueMap.has(fn)) uniqueMap.set(fn, u);
      }
      const imgUrls = Array.from(uniqueMap.values());

      const pagesData = await Promise.all(imgUrls.map(async (rawUrl) => {
        let buffer = capturedImages.get(rawUrl);
        if (!buffer) {
          for (const [key, val] of capturedImages.entries()) {
            if (key.includes(rawUrl) || rawUrl.includes(key)) {
              buffer = val;
              break;
            }
          }
        }
        if (!buffer) {
          buffer = await this.downloadImageWithSpoofing(rawUrl, chapterUrl);
        }
        return buffer;
      }));

      await page.close();
      return pagesData;
    } catch (err) {
      console.error(`❌ [Puppeteer Stealth Error]: ${err.message}`);
      await page.close();
      return null;
    }
  }

  async close() {
    if (this.browser) {
      await this.browser.close();
      this.browser = null;
    }
  }
}

// -------------------------------------------------------------
// 5. Manga & Chapter Parser
// -------------------------------------------------------------
async function scrapeComicInfo(comicUrl) {
  console.log(`🔍 Đang tải thông tin chi tiết bộ truyện từ: ${comicUrl}`);
  const html = await fetchHtml(comicUrl);

  // Title
  let title = 'Truyện Tranh';
  const titleMatch = html.match(/<h1[^>]*>(?:Truyện tranh\s+)?(.*?)<\/h1>/i) ||
                     html.match(/<meta\s+property="og:title"\s+content="(?:Full Truyện\s+)?(.*?)(?:\s+-\s+truyencanh3|\s+-\s+ZetTruyen)?"/i);
  if (titleMatch && titleMatch[1]) {
    title = titleMatch[1].replace(/<[^>]+>/g, '').replace(/^Truyện tranh\s+/i, '').trim();
  }

  // Slug extraction
  let slug = '';
  const urlParts = comicUrl.split('?')[0].split('#')[0].split('/').filter(Boolean);
  let lastPart = urlParts[urlParts.length - 1] || '';
  slug = lastPart.replace(/-\d+$/, '');
  if (!slug) slug = 'truyen-tranh';

  // Cover Image URL
  let coverUrl = '';
  const coverMatch = html.match(/<meta\s+property="og:image"\s+content="(.*?)"/i) ||
                     html.match(/<link[^>]+rel="preload"[^>]+href="([^"]*zetimage\.com\/thumb\/[^"]+)"/i) ||
                     html.match(/<div\s+class="book_avatar"[^>]*>\s*<img[^>]+src="(.*?)"/i);
  if (coverMatch && coverMatch[1]) {
    coverUrl = coverMatch[1];
  }
  if (!coverUrl && comicUrl.includes('zettruyen')) {
    coverUrl = `https://cdn1.zetimage.com/thumb/${slug}.jpg`;
  }

  // Chapters extraction
  const chapters = [];
  const seen = new Set();

  if (comicUrl.includes('zettruyen')) {
    // Try ZetTruyen Chapters API
    try {
      const apiUrl = `https://www.zettruyen.work/api/comics/${slug}/chapters?per_page=-1&order=asc`;
      const apiRes = await httpRequest(apiUrl, {
        headers: {
          'User-Agent': getRandomUserAgent(),
          'Accept': 'application/json, text/plain, */*',
          'Referer': 'https://www.zettruyen.work/'
        }
      });
      if (apiRes && apiRes.data && apiRes.data.data && Array.isArray(apiRes.data.data.chapters)) {
        for (const c of apiRes.data.data.chapters) {
          const num = parseFloat(c.chapter_num || c.num);
          const cUrl = `https://www.zettruyen.work/truyen-tranh/${slug}/chuong-${num}`;
          if (!seen.has(num)) {
            seen.add(num);
            chapters.push({
              url: cUrl,
              chapterNumber: num,
              title: c.name || c.chapter_name || `Chương ${num}`
            });
          }
        }
      }

    } catch (e) {
      console.warn('⚠️ Lỗi gọi API chapters ZetTruyen, sẽ fallback cào từ HTML:', e.message);
    }

    // If API returned no chapters, parse HTML for ZetTruyen chapter links
    if (chapters.length === 0) {
      const zetChapRegex = /href="([^"]*\/truyen-tranh\/[^\/"]+\/(?:chuong|chapter)-(\d+(?:\.\d+)?))"/gi;
      let m;
      while ((m = zetChapRegex.exec(html)) !== null) {
        let u = m[1];
        if (!u.startsWith('http')) u = 'https://www.zettruyen.work' + (u.startsWith('/') ? '' : '/') + u;
        const num = parseFloat(m[2]);
        if (!seen.has(num)) {
          seen.add(num);
          chapters.push({ url: u, chapterNumber: num, title: `Chương ${num}` });
        }
      }
    }
  } else {
    // truyencanh3.org & general
    const chapterRegex = /href="(https?:\/\/truyencanh3\.org\/[^\/"]+\/chuong-(\d+(?:\.\d+)?))"/gi;
    let match;
    while ((match = chapterRegex.exec(html)) !== null) {
      const url = match[1];
      const num = parseFloat(match[2]);
      if (!seen.has(num)) {
        seen.add(num);
        chapters.push({ url, chapterNumber: num, title: `Chương ${num}` });
      }
    }
  }

  // Sort ascending by chapterNumber
  chapters.sort((a, b) => a.chapterNumber - b.chapterNumber);

  console.log(`📌 Tên bộ truyện: ${title}`);
  console.log(`📌 Slug: ${slug}`);
  console.log(`📌 Ảnh bìa gốc: ${coverUrl}`);
  console.log(`📚 Tổng số chapter phát hiện: ${chapters.length} chương (Chương ${chapters[0]?.chapterNumber || 1} -> Chương ${chapters[chapters.length - 1]?.chapterNumber || chapters.length})\n`);

  return { title, slug, coverUrl, chapters };
}

async function scrapeChapterImages(engine, chapterUrl) {
  try {
    const html = await fetchHtml(chapterUrl);
    
    let imageUrls = [];

    if (chapterUrl.includes('zettruyen')) {
      const idx = html.indexOf('chapter-images-container');
      const searchHtml = idx !== -1 ? html.substring(idx) : html;
      const imgRegex = /<img[^>]+(?:src|data-src)=['"]([^'"]+)['"]/gi;
      let im;
      while ((im = imgRegex.exec(searchHtml)) !== null) {
        const src = im[1];
        if ((src.includes('zetimage.com') || src.includes('.jpg') || src.includes('.png') || src.includes('.webp')) &&
            !src.includes('banner') && !src.includes('logo') && !src.includes('thumb-default') && !src.includes('zettruyen-wp') && !src.includes('/thumb/')) {
          imageUrls.push(src);
        }
      }

      // Deduplicate
      imageUrls = [...new Set(imageUrls)];

      // Sort naturally by page number (e.g. 0.jpg, 1.jpg, 10.jpg)
      imageUrls.sort((a, b) => {
        const numA = parseInt((a.match(/\/(\d+)\.(?:jpg|png|webp)/i) || [])[1] || '0');
        const numB = parseInt((b.match(/\/(\d+)\.(?:jpg|png|webp)/i) || [])[1] || '0');
        return numA - numB;
      });
    } else {
      // Direct fast match for imgvip.site URLs
      const matches = html.match(/https?:\/\/[^"'\s>]*(?:imgvip\.site)[^"'\s>]+/gi) || [];
      const cleaned = matches.map(u => u.replace(/[\\"\';>].*$/, ''));
      
      // Deduplicate by page filename (e.g. page_0.jpg) to avoid duplicate server links
      const uniqueMap = new Map();
      for (const u of cleaned) {
        const filename = u.split('/').pop().split('?')[0];
        if (!uniqueMap.has(filename)) {
          uniqueMap.set(filename, u);
        }
      }

      // Sort naturally by page index (e.g. page_0.jpg, page_1.jpg, page_10.jpg)
      imageUrls = Array.from(uniqueMap.values()).sort((a, b) => {
        const numA = parseInt((a.match(/page_(\d+)/i) || [])[1] || '0');
        const numB = parseInt((b.match(/page_(\d+)/i) || [])[1] || '0');
        return numA - numB;
      });
    }

    if (imageUrls.length > 0) {
      console.log(`   📸 Tìm thấy ${imageUrls.length} trang ảnh chất lượng cao. Đang tải song song...`);
      // Download images in parallel batches of 15
      const pageBuffers = [];
      const batchSize = 15;
      for (let i = 0; i < imageUrls.length; i += batchSize) {
        const batch = imageUrls.slice(i, i + batchSize);
        const results = await Promise.all(batch.map(imgUrl => engine.downloadImageWithSpoofing(imgUrl, chapterUrl)));
        pageBuffers.push(...results);
      }
      return pageBuffers;
    }
  } catch (err) {
    console.warn(`⚠️ HTTP Scraping thất bại cho ${chapterUrl}, thử dùng Puppeteer...`);
  }

  return await engine.scrapeWithPuppeteer(chapterUrl);
}


// -------------------------------------------------------------
// 6. Main Crawler Pipeline
// -------------------------------------------------------------
async function startCrawler() {
  const args = process.argv.slice(2);
  let comicUrl = DEFAULT_COMIC_URL;
  let filterChapStart = null;
  let filterChapEnd = null;

  if (args.length > 0) {
    if (args[0].startsWith('http')) {
      comicUrl = args[0];
      if (args[1]) filterChapStart = parseFloat(args[1]);
      if (args[2]) filterChapEnd = parseFloat(args[2]);
    } else {
      filterChapStart = parseFloat(args[0]);
      filterChapEnd = filterChapStart;
    }
  }

  console.log('========================================================================');
  console.log(`🚀 MANGAFLUX ANTI-SCRAPING CRAWLER ENGINE (AUTOMATIC MULTI-CHAPTER)`);
  console.log('========================================================================\n');

  // Initialize Storage with Cloudflare R2 Time-Offset Sync
  await initStorageClient();

  const engine = new AntiScrapingEngine();

  // 1. Scrape Comic Information
  const comicInfo = await scrapeComicInfo(comicUrl);
  const { title, slug, coverUrl, chapters } = comicInfo;
  const cleanTitle = title.replace(/\s*\|\s*ZetTruyen/i, '').replace(/\s*-\s*ZetTruyen/i, '').replace(/\s*-\s*truyencanh3/i, '').trim();

  // Filter chapters if requested
  let targetChapters = chapters;
  if (filterChapStart !== null) {
    targetChapters = chapters.filter(c => {
      if (filterChapEnd !== null) return c.chapterNumber >= filterChapStart && c.chapterNumber <= filterChapEnd;
      return c.chapterNumber === filterChapStart;
    });
  }

  if (targetChapters.length === 0) {
    console.error('❌ Không tìm thấy chapter nào phù hợp với yêu cầu!');
    await engine.close();
    return;
  }

  // 2. Download and Upload Cover Image
  console.log('📸 1. Tải & Đẩy Ảnh Bìa Bộ Truyện lên MinIO Storage...');
  let minioCoverUrl = null;
  if (coverUrl) {
    const coverBuffer = await engine.downloadImageWithSpoofing(coverUrl, comicUrl);
    minioCoverUrl = await uploadToMinio(`covers/${slug}.jpg`, coverBuffer);
    console.log(`   -> MinIO Cover URL: ${minioCoverUrl}\n`);
  }
  const finalCoverUrl = minioCoverUrl || coverUrl || 'https://images.unsplash.com/photo-1607604276583-eef5d076aa5f?w=800';

  // 3. Process each chapter
  console.log(`========================================================================`);
  console.log(`📖 2. Bắt đầu tải ${targetChapters.length} Chapter lên hệ thống...`);
  console.log(`========================================================================\n`);

  let successCount = 0;
  let failCount = 0;

  for (let idx = 0; idx < targetChapters.length; idx++) {
    const chap = targetChapters[idx];
    const chapNum = chap.chapterNumber;
    console.log(`------------------------------------------------------------------------`);
    console.log(`🔄 [${idx + 1}/${targetChapters.length}] Đang xử lý Chapter ${chapNum}...`);

    try {
      let pageBuffers = await scrapeChapterImages(engine, chap.url);

      if (!pageBuffers || pageBuffers.length === 0) {
        console.warn(`   ⚠️ Chapter ${chapNum} không lấy được ảnh nào. Bỏ qua.`);
        failCount++;
        continue;
      }

      // Merge 4 images into 1 if >= 70 pages (using sharp high quality vertical stitching)
      pageBuffers = await mergeImageBuffers(pageBuffers, 4, 70);

      // Parallel upload to MinIO/R2 in batches of 15 (WebP Optimized)
      const minioPages = [];
      const batchSize = 15;
      for (let p = 0; p < pageBuffers.length; p += batchSize) {
        const batch = pageBuffers.slice(p, p + batchSize);
        const batchUrls = await Promise.all(batch.map(async (buf, offset) => {
          const pageIdx = p + offset + 1;
          const webpBuf = await optimizeImageToWebP(buf, 1920, 90);
          const objName = `chapters/${slug}/chap${chapNum}/page_${pageIdx}.webp`;
          return uploadToMinio(objName, webpBuf, 'image/webp');
        }));
        minioPages.push(...batchUrls.filter(Boolean));
      }

      // Synchronize with API
      const importUrl = `${API_BASE_URL}/comics/import-scraped?comicTitle=${encodeURIComponent(cleanTitle)}&comicSlug=${encodeURIComponent(slug)}&coverImage=${encodeURIComponent(finalCoverUrl)}`;
      const chapterPayload = {
        comicId: 0,
        chapterNumber: chapNum,
        title: chap.title || `Chương ${chapNum}`,
        isPublic: true,
        imageUrls: minioPages
      };

      const res = await httpRequest(importUrl, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' }
      }, chapterPayload);

      if (res.status === 200 || res.status === 201) {
        console.log(`   ✅ SUCCESS: Chapter ${chapNum} đã đồng bộ thành công! (${minioPages.length} trang ảnh)`);
        successCount++;
      } else {
        console.error(`   ❌ Lỗi đồng bộ API Chapter ${chapNum}:`, res.data);
        failCount++;
      }
    } catch (err) {
      console.error(`   💥 Lỗi khi xử lý Chapter ${chapNum}:`, err.message);
      failCount++;
    }

    await delay(100);
  }

  console.log('\n========================================================================');
  console.log(`🎉 HOÀN THÀNH TẢI BỘ TRUYỆN: ${cleanTitle}`);
  console.log(`✅ Thành công: ${successCount}/${targetChapters.length} chapter`);
  if (failCount > 0) console.log(`⚠️ Thất bại: ${failCount} chapter`);
  console.log(`👉 Xem chi tiết bộ truyện tại: http://localhost:4200/comic/${slug}`);
  console.log('========================================================================\n');

  await engine.close();
}


startCrawler().catch(err => {
  console.error('💥 Unhandled Crawler Error:', err);
});

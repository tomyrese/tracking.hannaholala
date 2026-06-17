# BNB Hot Products Integration Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Add a featured products section that pulls realtime product data from Bep Ngoc Bao through a Netlify Function, preserves the existing tracking flow, and redirects purchases to Bep Ngoc Bao.

**Architecture:** A new Netlify Function fetches and parses the Bep Ngoc Bao `hot-products` collection, normalizes product data, and serves cached JSON to the current static frontend. The frontend adds a self-contained featured-products section below the hero, fetches the local function only, and renders a responsive product grid with loading, error, and fallback states.

**Tech Stack:** Static HTML, vanilla JavaScript ES modules, Netlify Functions, Node built-in fetch, Node test runner

---

## File Structure

- Create `src/utils/parser.js`
  - Shared HTML-to-product parser and normalization helpers.
- Create `netlify/functions/bnb-products.js`
  - Netlify endpoint for fetching, parsing, caching, and returning product JSON.
- Create `src/services/bnb-api.js`
  - Frontend service layer for calling the local Netlify Function.
- Create `src/components/featured-products.js`
  - UI rendering, skeleton loading, error state, product grid, click behavior, fallback image handling, and JSON-LD injection.
- Create `tests/parser.test.mjs`
  - Unit tests for parser extraction and normalization.
- Modify `index.html`
  - Insert the featured products section markup and improve page metadata.
- Modify `styles.css`
  - Add section, card, grid, badge, skeleton, and responsive styles.
- Modify `src/app.js`
  - Initialize the new featured-products module without breaking tracking.
- Modify `netlify.toml`
  - Add redirect for the new function route.

### Task 1: Add parser coverage first

**Files:**
- Create: `D:\Work\HOtracking\tests\parser.test.mjs`
- Test: `D:\Work\HOtracking\src\utils\parser.js`

- [ ] **Step 1: Write the failing test**

```js
import test from 'node:test';
import assert from 'node:assert/strict';

import { parseBnbProductsFromHtml } from '../src/utils/parser.js';

const html = `
  <div class="product-item" data-id="1072968360">
    <a href="/products/am-dien-swf17s18avn-vn" title="Am dien/SWF17S18AVN/VN/">
      <img src="//cdn.example.com/product.jpg" alt="Am dien">
    </a>
    <span class="price">453.000đ</span>
    <span class="compare-price">860.000đ</span>
    <span class="sale-off">-48%</span>
  </div>
`;

test('parseBnbProductsFromHtml extracts normalized product cards', () => {
  const products = parseBnbProductsFromHtml(html, 'https://bepngocbao.vn/collections/hot-products');

  assert.equal(products.length, 1);
  assert.deepEqual(products[0], {
    id: '1072968360',
    name: 'Am dien/SWF17S18AVN/VN/',
    price: '453000',
    comparePrice: '860000',
    discount: '48',
    image: 'https://cdn.example.com/product.jpg',
    url: 'https://bepngocbao.vn/products/am-dien-swf17s18avn-vn',
  });
});

test('parseBnbProductsFromHtml derives missing values from JSON-like source', () => {
  const jsonHtml = `
    <script type="application/json" data-products>
      {
        "products": [
          {
            "id": 2001,
            "title": "Noi com dien",
            "price": 1299000,
            "compare_at_price": 1599000,
            "url": "/products/noi-com-dien",
            "featured_image": "//cdn.example.com/rice-cooker.jpg"
          }
        ]
      }
    </script>
  `;

  const products = parseBnbProductsFromHtml(jsonHtml, 'https://bepngocbao.vn/collections/hot-products');

  assert.equal(products.length, 1);
  assert.equal(products[0].id, '2001');
  assert.equal(products[0].discount, '19');
  assert.equal(products[0].url, 'https://bepngocbao.vn/products/noi-com-dien');
});
```

- [ ] **Step 2: Run test to verify it fails**

Run: `node --test tests/parser.test.mjs`
Expected: FAIL with `Cannot find module '../src/utils/parser.js'`

- [ ] **Step 3: Write minimal implementation**

```js
export function parseBnbProductsFromHtml() {
  return [];
}
```

- [ ] **Step 4: Run test to verify it fails for behavior**

Run: `node --test tests/parser.test.mjs`
Expected: FAIL because `0 !== 1`

- [ ] **Step 5: Commit**

```bash
git add tests/parser.test.mjs src/utils/parser.js
git commit -m "test: add parser coverage for BNB products"
```

### Task 2: Implement the parser

**Files:**
- Create: `D:\Work\HOtracking\src\utils\parser.js`
- Test: `D:\Work\HOtracking\tests\parser.test.mjs`

- [ ] **Step 1: Implement HTML normalization helpers**

```js
const BASE_URL = 'https://bepngocbao.vn';

function decodeHtml(value) {
  return String(value ?? '')
    .replace(/&amp;/g, '&')
    .replace(/&quot;/g, '"')
    .replace(/&#39;/g, "'")
    .replace(/&lt;/g, '<')
    .replace(/&gt;/g, '>')
    .replace(/&nbsp;/g, ' ')
    .trim();
}

function normalizeMoney(value) {
  const digits = String(value ?? '').replace(/[^\d]/g, '');
  return digits || '';
}

function normalizeUrl(value, baseUrl = BASE_URL) {
  if (!value) return '';
  if (value.startsWith('//')) return `https:${value}`;
  return new URL(value, baseUrl).toString();
}

function computeDiscount(price, comparePrice) {
  const current = Number(price);
  const original = Number(comparePrice);
  if (!current || !original || original <= current) return '';
  return String(Math.round(((original - current) / original) * 100));
}
```

- [ ] **Step 2: Implement extraction from embedded JSON and card HTML**

```js
function parseEmbeddedProducts(html, baseUrl) {
  const results = [];
  const scriptPattern = /<script[^>]*type=["']application\/json["'][^>]*>([\s\S]*?)<\/script>/gi;

  for (const match of html.matchAll(scriptPattern)) {
    const payload = match[1]?.trim();
    if (!payload || !payload.includes('products')) continue;

    try {
      const parsed = JSON.parse(payload);
      const items = Array.isArray(parsed?.products) ? parsed.products : [];
      for (const item of items) {
        results.push({
          id: String(item.id ?? ''),
          name: decodeHtml(item.title ?? ''),
          price: normalizeMoney(item.price),
          comparePrice: normalizeMoney(item.compare_at_price),
          discount: computeDiscount(normalizeMoney(item.price), normalizeMoney(item.compare_at_price)),
          image: normalizeUrl(item.featured_image || item.image || '', baseUrl),
          url: normalizeUrl(item.url || '', baseUrl),
        });
      }
    } catch {}
  }

  return results;
}

function parseCardProducts(html, baseUrl) {
  const results = [];
  const cardPattern = /<div[^>]*class=["'][^"']*product-item[^"']*["'][^>]*data-id=["']?([^"'>\s]+)[^>]*>([\s\S]*?)<\/div>\s*<\/div>?/gi;

  for (const match of html.matchAll(cardPattern)) {
    const [, id, cardHtml] = match;
    const href = cardHtml.match(/<a[^>]*href=["']([^"']+)["'][^>]*title=["']([^"']+)["']/i);
    const image = cardHtml.match(/<img[^>]*src=["']([^"']+)["']/i);
    const price = cardHtml.match(/class=["'][^"']*price[^"']*["'][^>]*>([^<]+)/i);
    const comparePrice = cardHtml.match(/class=["'][^"']*compare-price[^"']*["'][^>]*>([^<]+)/i);
    const discount = cardHtml.match(/(\d+)\s*%/i);

    results.push({
      id: String(id ?? ''),
      name: decodeHtml(href?.[2] ?? ''),
      price: normalizeMoney(price?.[1] ?? ''),
      comparePrice: normalizeMoney(comparePrice?.[1] ?? ''),
      discount: String(discount?.[1] ?? '') || computeDiscount(normalizeMoney(price?.[1] ?? ''), normalizeMoney(comparePrice?.[1] ?? '')),
      image: normalizeUrl(image?.[1] ?? '', baseUrl),
      url: normalizeUrl(href?.[1] ?? '', baseUrl),
    });
  }

  return results;
}
```

- [ ] **Step 3: Export the final parser and dedupe results**

```js
function sanitizeProduct(product) {
  const url = product.url || '';
  const name = decodeHtml(product.name || '');
  if (!url || !name) return null;

  const price = normalizeMoney(product.price);
  const comparePrice = normalizeMoney(product.comparePrice);
  const discount = String(product.discount || '') || computeDiscount(price, comparePrice);

  return {
    id: String(product.id || url.split('/').pop() || '').trim(),
    name,
    price,
    comparePrice,
    discount: discount ? String(Number(discount)) : '',
    image: normalizeUrl(product.image || '', BASE_URL),
    url: normalizeUrl(url, BASE_URL),
  };
}

export function parseBnbProductsFromHtml(html, sourceUrl = `${BASE_URL}/collections/hot-products`) {
  const rawProducts = [
    ...parseEmbeddedProducts(html, sourceUrl),
    ...parseCardProducts(html, sourceUrl),
  ];

  const deduped = new Map();
  for (const candidate of rawProducts) {
    const product = sanitizeProduct(candidate);
    if (!product) continue;
    if (!deduped.has(product.url)) deduped.set(product.url, product);
  }

  return Array.from(deduped.values());
}
```

- [ ] **Step 4: Run test to verify it passes**

Run: `node --test tests/parser.test.mjs`
Expected: PASS for both parser scenarios

- [ ] **Step 5: Commit**

```bash
git add src/utils/parser.js tests/parser.test.mjs
git commit -m "feat: implement BNB product parser"
```

### Task 3: Build the Netlify Function

**Files:**
- Create: `D:\Work\HOtracking\netlify\functions\bnb-products.js`
- Modify: `D:\Work\HOtracking\netlify.toml`
- Test: `D:\Work\HOtracking\src\utils\parser.js`

- [ ] **Step 1: Write the function around fetch, cache, and fallback behavior**

```js
import { parseBnbProductsFromHtml } from '../../src/utils/parser.js';

const COLLECTION_URL = 'https://bepngocbao.vn/collections/hot-products';
const CACHE_TTL_MS = 30 * 60 * 1000;

let cache = {
  data: [],
  fetchedAt: 0,
  source: 'empty',
};

function json(statusCode, payload) {
  return {
    statusCode,
    headers: {
      'content-type': 'application/json; charset=utf-8',
      'cache-control': 'public, max-age=1800',
    },
    body: JSON.stringify(payload),
  };
}

function hasFreshCache() {
  return cache.data.length > 0 && Date.now() - cache.fetchedAt < CACHE_TTL_MS;
}

async function fetchCollectionHtml() {
  const response = await fetch(COLLECTION_URL, {
    headers: {
      'user-agent': 'Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/126.0.0.0 Safari/537.36',
      'accept-language': 'vi-VN,vi;q=0.9,en-US;q=0.8,en;q=0.7',
      accept: 'text/html,application/xhtml+xml',
    },
  });

  if (!response.ok) {
    throw new Error(`BNB responded with status ${response.status}`);
  }

  return response.text();
}

export async function handler() {
  if (hasFreshCache()) {
    return json(200, {
      ok: true,
      source: 'cache',
      fetchedAt: cache.fetchedAt,
      products: cache.data,
    });
  }

  try {
    const html = await fetchCollectionHtml();
    const products = parseBnbProductsFromHtml(html, COLLECTION_URL).slice(0, 12);

    if (products.length === 0) {
      throw new Error('No products parsed from BNB collection HTML');
    }

    cache = {
      data: products,
      fetchedAt: Date.now(),
      source: 'live',
    };

    return json(200, {
      ok: true,
      source: 'live',
      fetchedAt: cache.fetchedAt,
      products,
    });
  } catch (error) {
    if (cache.data.length > 0) {
      return json(200, {
        ok: true,
        source: 'cache',
        fetchedAt: cache.fetchedAt,
        products: cache.data,
        warning: error.message,
      });
    }

    return json(200, {
      ok: false,
      source: 'error',
      fetchedAt: Date.now(),
      products: [],
      message: 'Khong the tai san pham',
    });
  }
}
```

- [ ] **Step 2: Add the Netlify redirect**

```toml
[[redirects]]
  from = "/api/bnb-products"
  to = "/.netlify/functions/bnb-products"
  status = 200
```

- [ ] **Step 3: Run a local function import smoke test**

Run: `node -e "import('./netlify/functions/bnb-products.js').then(m => console.log(typeof m.handler))"`
Expected: `function`

- [ ] **Step 4: Run the parser tests again**

Run: `node --test tests/parser.test.mjs`
Expected: PASS

- [ ] **Step 5: Commit**

```bash
git add netlify/functions/bnb-products.js netlify.toml src/utils/parser.js tests/parser.test.mjs
git commit -m "feat: add BNB products Netlify function"
```

### Task 4: Add frontend service and renderer

**Files:**
- Create: `D:\Work\HOtracking\src\services\bnb-api.js`
- Create: `D:\Work\HOtracking\src\components\featured-products.js`
- Modify: `D:\Work\HOtracking\src\app.js`

- [ ] **Step 1: Add the frontend service**

```js
export async function fetchFeaturedProducts() {
  const response = await fetch('/.netlify/functions/bnb-products', {
    headers: {
      accept: 'application/json',
    },
  });

  const payload = await response.json().catch(() => null);

  if (!response.ok || !payload) {
    throw new Error('Khong the tai san pham');
  }

  return payload;
}
```

- [ ] **Step 2: Add the featured products renderer**

```js
import { fetchFeaturedProducts } from '../services/bnb-api.js';

const FALLBACK_IMAGE = 'https://placehold.co/600x600/f4e8e1/6f625d?text=San+pham';

function formatVnd(value) {
  if (!value) return '';
  return `${Number(value).toLocaleString('vi-VN')}đ`;
}

function createCard(product) {
  const showPricing = product.price || product.comparePrice;
  return `
    <article class="featured-products__card" data-product-card tabindex="0" role="link" aria-label="${product.name}">
      <div class="featured-products__media">
        ${product.discount ? `<span class="featured-products__badge">-${product.discount}%</span>` : ''}
        <img
          src="${product.image || FALLBACK_IMAGE}"
          alt="${product.name}"
          loading="lazy"
          decoding="async"
          data-product-image
        >
      </div>
      <div class="featured-products__body">
        <h3>${product.name}</h3>
        ${showPricing ? `
          <div class="featured-products__pricing">
            ${product.price ? `<strong>${formatVnd(product.price)}</strong>` : ''}
            ${product.comparePrice ? `<span>${formatVnd(product.comparePrice)}</span>` : ''}
          </div>
        ` : ''}
      </div>
    </article>
  `;
}

function skeletonMarkup(count = 6) {
  return Array.from({ length: count }, () => `
    <article class="featured-products__card featured-products__card--skeleton" aria-hidden="true">
      <div class="featured-products__media"><div class="featured-products__skeleton featured-products__skeleton--image"></div></div>
      <div class="featured-products__body">
        <div class="featured-products__skeleton featured-products__skeleton--title"></div>
        <div class="featured-products__skeleton featured-products__skeleton--price"></div>
      </div>
    </article>
  `).join('');
}
```

- [ ] **Step 3: Add mount logic, error state, click behavior, and JSON-LD injection**

```js
function injectProductSchema(products) {
  const schema = {
    '@context': 'https://schema.org',
    '@type': 'ItemList',
    itemListElement: products.map((product, index) => ({
      '@type': 'ListItem',
      position: index + 1,
      item: {
        '@type': 'Product',
        name: product.name,
        image: product.image ? [product.image] : [],
        url: product.url,
        offers: product.price ? {
          '@type': 'Offer',
          priceCurrency: 'VND',
          price: product.price,
          availability: 'https://schema.org/InStock',
        } : undefined,
      },
    })),
  };

  const previous = document.getElementById('featured-products-schema');
  if (previous) previous.remove();

  const script = document.createElement('script');
  script.type = 'application/ld+json';
  script.id = 'featured-products-schema';
  script.textContent = JSON.stringify(schema);
  document.head.appendChild(script);
}

export async function mountFeaturedProducts() {
  const root = document.querySelector('[data-featured-products]');
  if (!root) return;

  const grid = root.querySelector('[data-featured-products-grid]');
  const status = root.querySelector('[data-featured-products-status]');
  grid.innerHTML = skeletonMarkup();
  status.textContent = 'Dang tai san pham noi bat...';

  try {
    const payload = await fetchFeaturedProducts();
    if (!payload?.ok || !Array.isArray(payload.products) || payload.products.length === 0) {
      throw new Error(payload?.message || 'Khong the tai san pham');
    }

    grid.innerHTML = payload.products.slice(0, 12).map(createCard).join('');
    status.textContent = payload.source === 'cache'
      ? 'San pham duoc cap nhat tu bo nho dem gan nhat.'
      : 'San pham noi bat duoc dong bo tu Bep Ngoc Bao.';

    grid.querySelectorAll('[data-product-card]').forEach((card, index) => {
      const product = payload.products[index];
      const openProduct = () => window.open(product.url, '_blank', 'noopener');
      card.addEventListener('click', openProduct);
      card.addEventListener('keydown', (event) => {
        if (event.key === 'Enter' || event.key === ' ') {
          event.preventDefault();
          openProduct();
        }
      });
    });

    grid.querySelectorAll('[data-product-image]').forEach((image) => {
      image.addEventListener('error', () => {
        image.src = FALLBACK_IMAGE;
      }, { once: true });
    });

    injectProductSchema(payload.products.slice(0, 12));
  } catch (error) {
    grid.innerHTML = '';
    status.textContent = 'Khong the tai san pham';
  }
}
```

- [ ] **Step 4: Initialize it from `src/app.js`**

```js
import { mountFeaturedProducts } from './components/featured-products.js';

mountFeaturedProducts();
```

- [ ] **Step 5: Commit**

```bash
git add src/services/bnb-api.js src/components/featured-products.js src/app.js
git commit -m "feat: render BNB featured products on the frontend"
```

### Task 5: Update HTML and CSS for layout, SEO, and responsive cards

**Files:**
- Modify: `D:\Work\HOtracking\index.html`
- Modify: `D:\Work\HOtracking\styles.css`

- [ ] **Step 1: Add the new section and metadata in `index.html`**

```html
<title>Tracking Hannah Olala | San pham noi bat Bep Ngoc Bao</title>
<meta name="description" content="Tra cuu don hang Hannah Olala va xem nhanh san pham noi bat duoc dong bo tu Bep Ngoc Bao.">
<meta property="og:title" content="Tracking Hannah Olala | San pham noi bat Bep Ngoc Bao">
<meta property="og:description" content="Tra cuu don hang va kham pha san pham noi bat tu Bep Ngoc Bao.">

<section class="featured-products" data-featured-products aria-labelledby="featured-products-title">
  <div class="featured-products__header">
    <p class="featured-products__eyebrow">Bep Ngoc Bao</p>
    <div>
      <h2 id="featured-products-title">San pham noi bat</h2>
      <p class="featured-products__lead">San pham, gia, hinh anh va khuyen mai duoc dong bo tu dong tu collection hot-products.</p>
    </div>
  </div>
  <p class="featured-products__status" data-featured-products-status aria-live="polite"></p>
  <div class="featured-products__grid" data-featured-products-grid></div>
</section>
```

- [ ] **Step 2: Add section, card, skeleton, and grid styling**

```css
.featured-products {
  max-width: 1120px;
  margin: 0 auto 20px;
  padding: 20px;
  background: rgba(255, 255, 255, 0.86);
  border: 1px solid var(--line);
  border-radius: 28px;
  box-shadow: 0 24px 70px rgba(82, 51, 42, 0.08);
  backdrop-filter: blur(10px);
}

.featured-products__header {
  display: grid;
  gap: 10px;
  margin-bottom: 12px;
}

.featured-products__eyebrow {
  margin: 0;
  color: #9b6b5c;
  font-size: 11px;
  font-weight: 800;
  letter-spacing: .14em;
  text-transform: uppercase;
}

.featured-products__lead,
.featured-products__status {
  margin: 0;
  color: var(--muted);
  font-size: 13px;
  line-height: 1.5;
}

.featured-products__grid {
  display: grid;
  grid-template-columns: repeat(2, minmax(0, 1fr));
  gap: 12px;
  align-items: stretch;
}

.featured-products__card {
  display: grid;
  grid-template-rows: auto 1fr;
  min-width: 0;
  overflow: hidden;
  background: linear-gradient(180deg, rgba(255,255,255,0.98) 0%, rgba(255,248,245,0.96) 100%);
  border: 1px solid rgba(234, 216, 208, 0.9);
  border-radius: 20px;
  box-shadow: 0 12px 28px rgba(82, 51, 42, 0.08);
  transition: transform 0.22s ease, box-shadow 0.22s ease, border-color 0.22s ease;
  cursor: pointer;
}

.featured-products__card:hover,
.featured-products__card:focus-visible {
  transform: translateY(-4px);
  box-shadow: 0 18px 34px rgba(82, 51, 42, 0.14);
  border-color: #d9b7a9;
  outline: none;
}
```

- [ ] **Step 3: Add media, pricing, and responsive breakpoints**

```css
.featured-products__media {
  position: relative;
  aspect-ratio: 1 / 1;
  background:
    radial-gradient(circle at top, rgba(255,255,255,0.95), rgba(244,232,225,0.85)),
    linear-gradient(180deg, #fff 0%, #f9f1ec 100%);
}

.featured-products__media img {
  width: 100%;
  height: 100%;
  object-fit: contain;
  display: block;
  padding: 14px;
}

.featured-products__badge {
  position: absolute;
  top: 10px;
  left: 10px;
  z-index: 1;
  padding: 6px 10px;
  color: var(--white);
  background: linear-gradient(135deg, #d9485f, #b92f47);
  border-radius: 999px;
  font-size: 11px;
  font-weight: 800;
}

.featured-products__body {
  display: grid;
  gap: 10px;
  padding: 14px;
}

.featured-products__body h3 {
  margin: 0;
  font-size: 14px;
  line-height: 1.45;
  display: -webkit-box;
  -webkit-box-orient: vertical;
  -webkit-line-clamp: 2;
  overflow: hidden;
  min-height: 40px;
}

.featured-products__pricing {
  display: flex;
  align-items: baseline;
  gap: 8px;
  flex-wrap: wrap;
}

.featured-products__pricing strong {
  color: var(--ink);
  font-size: 16px;
}

.featured-products__pricing span {
  color: var(--muted);
  font-size: 12px;
  text-decoration: line-through;
}

.featured-products__skeleton {
  border-radius: 12px;
  background: linear-gradient(90deg, #f0e5df 25%, #fbf6f2 50%, #f0e5df 75%);
  background-size: 200% 100%;
  animation: featured-products-shimmer 1.2s linear infinite;
}

.featured-products__skeleton--image {
  width: 100%;
  height: 100%;
}

.featured-products__skeleton--title {
  height: 16px;
}

.featured-products__skeleton--price {
  width: 60%;
  height: 14px;
}

@keyframes featured-products-shimmer {
  from { background-position: 200% 0; }
  to { background-position: -200% 0; }
}

@media (min-width: 768px) {
  .featured-products__grid {
    grid-template-columns: repeat(3, minmax(0, 1fr));
  }
}

@media (min-width: 1200px) {
  .featured-products__grid {
    grid-template-columns: repeat(6, minmax(0, 1fr));
  }
}
```

- [ ] **Step 4: Verify the page still loads and layout stays responsive**

Run: `npm run build`
Expected: command completes without syntax errors

- [ ] **Step 5: Commit**

```bash
git add index.html styles.css src/app.js src/components/featured-products.js src/services/bnb-api.js
git commit -m "feat: add featured products section and responsive styling"
```

### Task 6: Verify behavior end-to-end

**Files:**
- Test: `D:\Work\HOtracking\tests\parser.test.mjs`
- Test: `D:\Work\HOtracking\netlify\functions\bnb-products.js`

- [ ] **Step 1: Run the parser test suite**

Run: `node --test tests/parser.test.mjs`
Expected: PASS

- [ ] **Step 2: Run the build**

Run: `npm run build`
Expected: build completes successfully

- [ ] **Step 3: Smoke test the function locally**

Run: `node -e "import('./netlify/functions/bnb-products.js').then(async m => { const result = await m.handler(); console.log(result.statusCode); const body = JSON.parse(result.body); console.log(body.ok, Array.isArray(body.products), body.products.length); })"`
Expected: `200` and a truthy `ok`; if upstream blocks the request, expect `200 false` with a safe error payload

- [ ] **Step 4: Manual browser verification checklist**

Run: `npm run build`
Expected:
- featured products section appears below the hero
- skeletons show before data loads
- at least 6 products render when upstream returns them
- product click opens Bep Ngoc Bao
- missing image falls back safely
- tracking form still behaves as before

- [ ] **Step 5: Commit**

```bash
git add .
git commit -m "chore: verify BNB products integration"
```

## Self-Review

Spec coverage check:

- Request flow `Client -> Netlify Function -> Bep Ngoc Bao`: covered by Tasks 3 and 4.
- Parse collection HTML without official API: covered by Tasks 1, 2, and 3.
- Keep tracking and place section below hero: covered by Tasks 4 and 5.
- Cache fallback and safe error handling: covered by Task 3 and verified in Task 6.
- Responsive 6/3/2 grid, skeletons, hover, badges, lazy loading: covered by Task 5 and verified in Task 6.
- SEO metadata and Product schema: covered by Tasks 4 and 5.

Placeholder scan:

- No `TODO`, `TBD`, or undefined implementation steps remain.

Type consistency:

- Parser export uses `parseBnbProductsFromHtml` consistently in tests and function code.
- Frontend payload uses `payload.products` consistently in service and renderer.

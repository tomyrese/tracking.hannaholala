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
  const raw = String(value ?? '').trim();
  if (!raw) return '';
  if (raw.startsWith('//')) return `https:${raw}`;
  return new URL(raw, baseUrl).toString();
}

function computeDiscount(price, comparePrice) {
  const current = Number(price);
  const original = Number(comparePrice);

  if (!current || !original || original <= current) return '';
  return String(Math.round(((original - current) / original) * 100));
}

function stripTags(value) {
  return decodeHtml(String(value ?? '').replace(/<[^>]*>/g, ' ')).replace(/\s+/g, ' ').trim();
}

function parseEmbeddedProducts(html, baseUrl) {
  const results = [];
  const scriptPattern = /<script[^>]*type=["']application\/json["'][^>]*>([\s\S]*?)<\/script>/gi;

  for (const match of html.matchAll(scriptPattern)) {
    const payload = match[1]?.trim();
    if (!payload || !payload.includes('"products"')) continue;

    try {
      const parsed = JSON.parse(payload);
      const items = Array.isArray(parsed?.products) ? parsed.products : [];

      for (const item of items) {
        results.push({
          id: String(item.id ?? ''),
          name: decodeHtml(item.title ?? item.name ?? ''),
          price: normalizeMoney(item.price),
          comparePrice: normalizeMoney(item.compare_at_price ?? item.comparePrice),
          discount: computeDiscount(
            normalizeMoney(item.price),
            normalizeMoney(item.compare_at_price ?? item.comparePrice),
          ),
          image: normalizeUrl(item.featured_image || item.image || '', baseUrl),
          url: normalizeUrl(item.url || '', baseUrl),
        });
      }
    } catch {
      // Ignore malformed JSON blocks from unrelated widgets.
    }
  }

  return results;
}

function extractFirst(pattern, input, index = 1) {
  const match = pattern.exec(input);
  return match?.[index] ?? '';
}

function parseFormProducts(html, baseUrl) {
  const results = [];
  const formPattern = /<form[^>]*data-id=["']product-actions-(\d+)["'][^>]*>([\s\S]*?)<\/form>/gi;

  for (const match of html.matchAll(formPattern)) {
    const [, id, formHtml] = match;
    const url = extractFirst(/<a[^>]*href=["']([^"']+)["'][^>]*title=/i, formHtml);
    const title = extractFirst(/<a[^>]*title=["']([^"']+)["']/i, formHtml)
      || stripTags(extractFirst(/<div[^>]*class=["'][^"']*card-product__title[^"']*["'][^>]*>([\s\S]*?)<\/div>/i, formHtml));
    const sourceSetImage = extractFirst(/<source[^>]*srcset=["']([^"']+)["']/i, formHtml);
    const image = extractFirst(/<img[^>]*src=["']([^"']+)["']/i, formHtml) || sourceSetImage;
    const price = stripTags(extractFirst(/<span[^>]*class=["'][^"']*\bprice\b[^"']*["'][^>]*>([\s\S]*?)<\/span>/i, formHtml));
    const comparePrice = stripTags(extractFirst(/<span[^>]*class=["'][^"']*compare-price[^"']*["'][^>]*>([\s\S]*?)<\/span>/i, formHtml));
    const discountText = stripTags(
      extractFirst(/<div[^>]*class=["'][^"']*sale-badge[^"']*["'][^>]*>([\s\S]*?)<\/div>/i, formHtml),
    );
    const discount = normalizeMoney(discountText);

    results.push({
      id: String(id ?? ''),
      name: title,
      price: normalizeMoney(price),
      comparePrice: normalizeMoney(comparePrice),
      discount: discount || computeDiscount(normalizeMoney(price), normalizeMoney(comparePrice)),
      image: normalizeUrl(image, baseUrl),
      url: normalizeUrl(url, baseUrl),
    });
  }

  return results;
}

function sanitizeProduct(product) {
  const url = normalizeUrl(product.url || '', BASE_URL);
  const name = decodeHtml(product.name || '').replace(/\s+/g, ' ').trim();

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
    url,
  };
}

export function parseBnbProductsFromHtml(html, sourceUrl = `${BASE_URL}/collections/hot-products`) {
  const rawProducts = [
    ...parseEmbeddedProducts(html, sourceUrl),
    ...parseFormProducts(html, sourceUrl),
  ];

  const deduped = new Map();
  for (const candidate of rawProducts) {
    const product = sanitizeProduct(candidate);
    if (!product) continue;

    const existing = deduped.get(product.url);
    if (!existing) {
      deduped.set(product.url, product);
      continue;
    }

    deduped.set(product.url, {
      ...existing,
      ...product,
      image: product.image || existing.image,
      comparePrice: product.comparePrice || existing.comparePrice,
      discount: product.discount || existing.discount,
    });
  }

  return Array.from(deduped.values());
}

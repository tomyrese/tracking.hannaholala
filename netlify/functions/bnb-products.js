import { parseBnbProductsFromHtml } from '../../src/utils/parser.js';

const COLLECTION_URL = 'https://bepngocbao.vn/collections/hot-products';
const CACHE_TTL_MS = 30 * 60 * 1000;
const MAX_PRODUCTS = 12;

let cache = {
  data: [],
  fetchedAt: 0,
};

function json(statusCode, payload) {
  return {
    statusCode,
    headers: {
      'Content-Type': 'application/json; charset=utf-8',
      'Cache-Control': 'public, max-age=1800',
      'Access-Control-Allow-Origin': '*',
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
      'User-Agent': 'Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/126.0.0.0 Safari/537.36',
      'Accept-Language': 'vi-VN,vi;q=0.9,en-US;q=0.8,en;q=0.7',
      Accept: 'text/html,application/xhtml+xml,application/xml;q=0.9,*/*;q=0.8',
      Referer: 'https://bepngocbao.vn/',
    },
  });

  if (!response.ok) {
    throw new Error(`BNB responded with status ${response.status}`);
  }

  return response.text();
}

export async function handler(event) {
  if (event?.httpMethod === 'OPTIONS') {
    return {
      statusCode: 204,
      headers: {
        'Access-Control-Allow-Origin': '*',
        'Access-Control-Allow-Methods': 'GET,OPTIONS',
        'Access-Control-Allow-Headers': 'Content-Type',
      },
      body: '',
    };
  }

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
    const products = parseBnbProductsFromHtml(html, COLLECTION_URL).slice(0, MAX_PRODUCTS);

    if (products.length === 0) {
      throw new Error('No products parsed from BNB collection HTML');
    }

    cache = {
      data: products,
      fetchedAt: Date.now(),
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

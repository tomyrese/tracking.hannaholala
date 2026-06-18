import { createServer } from 'node:http';
import { readFile } from 'node:fs/promises';
import { existsSync, readFileSync } from 'node:fs';
import { extname, join, normalize } from 'node:path';
import { fileURLToPath } from 'node:url';
import { trackShipment } from './src/trackingApi.mjs';
import { generateSvgCaptcha, validateCaptcha } from './src/captcha.mjs';
import { syncGhnOrders } from './src/sync.mjs';

const root = fileURLToPath(new URL('.', import.meta.url));
const port = Number(process.env.PORT || 3000);

function loadEnvFile() {
  const envPath = join(root, '.env');
  if (!existsSync(envPath)) return;

  const lines = readFileSync(envPath, 'utf8').split(/\r?\n/);
  for (const line of lines) {
    const trimmed = line.trim();
    if (!trimmed || trimmed.startsWith('#') || !trimmed.includes('=')) continue;

    const [key, ...valueParts] = trimmed.split('=');
    const value = valueParts.join('=').trim().replace(/^["']|["']$/g, '');
    process.env[key.trim()] = value;
  }
}

const contentTypes = {
  '.html': 'text/html; charset=utf-8',
  '.css': 'text/css; charset=utf-8',
  '.js': 'text/javascript; charset=utf-8',
  '.mjs': 'text/javascript; charset=utf-8',
  '.json': 'application/json; charset=utf-8',
  '.svg': 'image/svg+xml',
  '.png': 'image/png',
  '.jpg': 'image/jpeg',
  '.jpeg': 'image/jpeg',
};

function sendJson(response, status, payload) {
  response.writeHead(status, {
    'Content-Type': 'application/json; charset=utf-8',
    'Access-Control-Allow-Origin': '*',
  });
  response.end(JSON.stringify(payload));
}

async function handleApi(request, response, url) {
  if (url.pathname === '/api/health') {
    sendJson(response, 200, { ok: true, message: 'Tracking Hannah Olala API is running.' });
    return;
  }

  if (url.pathname === '/api/captcha/generate') {
    const captcha = generateSvgCaptcha();
    sendJson(response, 200, captcha);
    return;
  }

  if (url.pathname === '/api/route') {
    const points = url.searchParams.get('points') || '';
    if (!points) {
      sendJson(response, 400, { ok: false, message: 'Missing points parameter' });
      return;
    }

    const urls = [
      `https://routing.openstreetmap.de/routed-car/route/v1/driving/${points}?overview=full&geometries=geojson`,
      `https://router.project-osrm.org/route/v1/driving/${points}?overview=full&geometries=geojson`
    ];

    for (const routeUrl of urls) {
      try {
        const routeRes = await fetch(routeUrl);
        if (routeRes.ok) {
          const data = await routeRes.json();
          sendJson(response, 200, data);
          return;
        } else {
          console.warn(`Upstream routing URL returned status ${routeRes.status}: ${routeUrl}`);
        }
      } catch (err) {
        console.error(`Error requesting upstream route URL ${routeUrl}:`, err.message);
      }
    }

    sendJson(response, 502, { ok: false, message: 'Failed to fetch route from upstream services' });
    return;
  }

  if (url.pathname !== '/api/track') {
    sendJson(response, 404, { ok: false, message: 'API route không tồn tại.' });
    return;
  }

  const code = url.searchParams.get('code') || '';
  const carrier = url.searchParams.get('carrier') || '';

  // Captcha Verification
  const captchaAnswer = url.searchParams.get('captchaAnswer') || '';
  const captchaTimestamp = url.searchParams.get('captchaTimestamp') || '';
  const captchaToken = url.searchParams.get('captchaToken') || '';

  const isCaptchaValid = validateCaptcha(captchaAnswer, captchaTimestamp, captchaToken);
  if (!isCaptchaValid) {
    sendJson(response, 403, { 
      ok: false, 
      type: 'captcha_error', 
      message: 'Mã xác thực không chính xác hoặc đã hết hạn.' 
    });
    return;
  }

  const result = await trackShipment(code, carrier);
  sendJson(response, result.ok ? 200 : 424, result);
}

async function handleStatic(response, url) {
  const requestedPath = url.pathname === '/' ? '/index.html' : decodeURIComponent(url.pathname);
  const resolvedPath = normalize(join(root, requestedPath));

  if (!resolvedPath.startsWith(root)) {
    response.writeHead(403);
    response.end('Forbidden');
    return;
  }

  try {
    const file = await readFile(resolvedPath);
    response.writeHead(200, {
      'Content-Type': contentTypes[extname(resolvedPath)] || 'application/octet-stream',
      'Cache-Control': 'no-store',
    });
    response.end(file);
  } catch {
    response.writeHead(404);
    response.end('Not found');
  }
}

loadEnvFile();

// Start automatic GHN order synchronization
const syncIntervalMs = Number(process.env.SYNC_INTERVAL_MS || 600000); // Default to 10 minutes
syncGhnOrders(); // Trigger first sync immediately on startup
setInterval(syncGhnOrders, syncIntervalMs); // Set background timer

createServer(async (request, response) => {
  const url = new URL(request.url || '/', `http://${request.headers.host || `localhost:${port}`}`);

  try {
    if (request.method === 'OPTIONS') {
      response.writeHead(204, {
        'Access-Control-Allow-Origin': '*',
        'Access-Control-Allow-Methods': 'GET,OPTIONS',
        'Access-Control-Allow-Headers': 'Content-Type',
      });
      response.end();
      return;
    }

    if (url.pathname.startsWith('/api/')) {
      await handleApi(request, response, url);
      return;
    }

    await handleStatic(response, url);
  } catch (error) {
    sendJson(response, 500, { ok: false, message: error.message });
  }
}).listen(port, () => {
  console.log(`Tracking Hannah Olala running at http://localhost:${port}`);
});

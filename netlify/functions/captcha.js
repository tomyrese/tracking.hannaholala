import crypto from 'node:crypto';

const CAPTCHA_SECRET = process.env.CAPTCHA_SECRET || 'ho-tracking-captcha-default-secret-key-1994';

function generateSvgCaptcha() {
  const chars = '0123456789';
  let text = '';
  for (let i = 0; i < 4; i += 1) {
    text += chars[Math.floor(Math.random() * chars.length)];
  }

  const width = 180;
  const height = 60;
  let svg = `<svg width="${width}" height="${height}" viewBox="0 0 ${width} ${height}" xmlns="http://www.w3.org/2000/svg" style="background: #fff8f5; border: 1px solid #efd2c8; border-radius: 10px; display: block; width: 180px; height: 60px; box-shadow: inset 0 1px 3px rgba(0,0,0,0.05);">`;

  for (let i = 0; i < 6; i += 1) {
    const x1 = Math.random() * width;
    const y1 = Math.random() * height;
    const x2 = Math.random() * width;
    const y2 = Math.random() * height;
    svg += `<line x1="${x1}" y1="${y1}" x2="${x2}" y2="${y2}" stroke="#e2c6ba" stroke-width="2" opacity="0.6"/>`;
  }

  for (let i = 0; i < 40; i += 1) {
    const cx = Math.random() * width;
    const cy = Math.random() * height;
    const r = 1 + Math.random() * 1.5;
    svg += `<circle cx="${cx}" cy="${cy}" r="${r}" fill="#8b6f65" opacity="0.4"/>`;
  }

  for (let i = 0; i < text.length; i += 1) {
    const char = text[i];
    const fontSize = 34 + Math.random() * 8;
    const x = 25 + i * 36 + Math.random() * 6;
    const y = 42 + Math.random() * 6;
    const rotate = -15 + Math.random() * 30;
    svg += `<text x="${x}" y="${y}" font-family="'Be Vietnam Pro', 'Inter', sans-serif" font-size="${fontSize}" font-weight="bold" fill="#8b6f65" transform="rotate(${rotate} ${x} ${y})">${char}</text>`;
  }

  svg += '</svg>';

  const timestamp = Date.now();
  const token = crypto
    .createHmac('sha256', CAPTCHA_SECRET)
    .update(`${text}:${timestamp}`)
    .digest('hex');

  return { svg, timestamp, token };
}

export async function handler(event) {
  if (event.httpMethod === 'OPTIONS') {
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

  try {
    return {
      statusCode: 200,
      headers: {
        'Content-Type': 'application/json; charset=utf-8',
        'Access-Control-Allow-Origin': '*',
      },
      body: JSON.stringify(generateSvgCaptcha()),
    };
  } catch (error) {
    return {
      statusCode: 500,
      headers: {
        'Content-Type': 'application/json; charset=utf-8',
        'Access-Control-Allow-Origin': '*',
      },
      body: JSON.stringify({ ok: false, message: error.message }),
    };
  }
}

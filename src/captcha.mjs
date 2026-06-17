import crypto from 'node:crypto';

const CAPTCHA_SECRET = process.env.CAPTCHA_SECRET || 'ho-tracking-captcha-default-secret-key-1994';
const CLIENT_CAPTCHA_SALT = 'ho-tracking-client-captcha-v1';

export function generateSvgCaptcha() {
  const chars = '0123456789';
  let text = '';
  for (let i = 0; i < 4; i++) {
    text += chars[Math.floor(Math.random() * chars.length)];
  }

  const width = 180;
  const height = 60;
  let svg = `<svg width="${width}" height="${height}" viewBox="0 0 ${width} ${height}" xmlns="http://www.w3.org/2000/svg" style="background: #fff8f5; border: 1px solid #efd2c8; border-radius: 10px; display: block; width: 180px; height: 60px; box-shadow: inset 0 1px 3px rgba(0,0,0,0.05);">`;
  
  // Add some background noise lines
  for (let i = 0; i < 6; i++) {
    const x1 = Math.random() * width;
    const y1 = Math.random() * height;
    const x2 = Math.random() * width;
    const y2 = Math.random() * height;
    svg += `<line x1="${x1}" y1="${y1}" x2="${x2}" y2="${y2}" stroke="#e2c6ba" stroke-width="2" opacity="0.6"/>`;
  }
  
  // Add some noise dots
  for (let i = 0; i < 40; i++) {
    const cx = Math.random() * width;
    const cy = Math.random() * height;
    const r = 1 + Math.random() * 1.5;
    svg += `<circle cx="${cx}" cy="${cy}" r="${r}" fill="#8b6f65" opacity="0.4"/>`;
  }

  // Add text characters with random font size, rotation, and translation
  for (let i = 0; i < text.length; i++) {
    const char = text[i];
    const fontSize = 34 + Math.random() * 8;
    const x = 25 + i * 36 + Math.random() * 6;
    const y = 42 + Math.random() * 6;
    const rotate = -15 + Math.random() * 30;
    svg += `<text x="${x}" y="${y}" font-family="'Be Vietnam Pro', 'Inter', sans-serif" font-size="${fontSize}" font-weight="bold" fill="#8b6f65" transform="rotate(${rotate} ${x} ${y})">${char}</text>`;
  }

  svg += '</svg>';
  
  const timestamp = Date.now();
  const token = crypto.createHmac('sha256', CAPTCHA_SECRET)
    .update(`${text}:${timestamp}`)
    .digest('hex');

  return {
    svg,
    timestamp,
    token
  };
}

export function validateCaptcha(answer, timestamp, token) {
  if (!answer || !timestamp || !token) return false;
  
  // 1. Expiration check: captcha is valid for 10 hours to prevent sandboxed clock drift issues
  const now = Date.now();
  const timeDiff = now - Number(timestamp);
  if (Math.abs(timeDiff) > 10 * 60 * 60 * 1000) {
    return false;
  }

  const cleanAnswer = String(answer).replace(/\D+/g, '');

  if (String(token).startsWith('client:')) {
    const clientToken = `client:${crypto
      .createHash('sha256')
      .update(`${cleanAnswer}:${timestamp}:${CLIENT_CAPTCHA_SALT}`)
      .digest('hex')}`;

    return clientToken === token;
  }

  // 2. Signature verification
  const expectedToken = crypto.createHmac('sha256', CAPTCHA_SECRET)
    .update(`${cleanAnswer}:${timestamp}`)
    .digest('hex');

  return expectedToken === token;
}

import crypto from 'node:crypto';
import { readFile } from 'node:fs/promises';
import { join, resolve } from 'node:path';

const CAPTCHA_SECRET = process.env.CAPTCHA_SECRET || 'ho-tracking-captcha-default-secret-key-1994';
const CLIENT_CAPTCHA_SALT = 'ho-tracking-client-captcha-v1';
const DEFAULT_GHN_BASE_URL = 'https://online-gateway.ghn.vn/shiip/public-api';

const statusLabels = {
  ready_to_pick: 'Chờ lấy hàng',
  picking: 'Đang lấy hàng',
  picked: 'Đã lấy hàng',
  storing: 'Lưu kho',
  transporting: 'Đang luân chuyển',
  sorting: 'Đang phân loại',
  delivering: 'Đang giao',
  money_collect_delivering: 'Đang giao (thu tiền)',
  delivered: 'Giao thành công',
  delivery_fail: 'Giao thất bại',
  waiting_to_return: 'Chờ trả hàng',
  return: 'Đang trả',
  returning: 'Đang trả',
  returned: 'Đã trả',
  return_fail: 'Trả hàng thất bại',
  cancel: 'Đã huỷ',
  exception: 'Sự cố',
  lost: 'Thất lạc',
  damage: 'Hư hỏng',
  money_collect_picking: 'Đang lấy hàng (thu tiền)',
  return_transporting: 'Đang luân chuyển hàng trả',
  COLLECT_PICKING_MONEY: 'Thu tiền khi lấy hàng',
  COLLECT_DELIVERING_MONEY: 'Thu tiền khi giao hàng',
  CANCEL_COLLECT_DELIVERING_MONEY: 'Hủy thu tiền khi giao hàng',
  CANCEL_COLLECT_PICKING_MONEY: 'Hủy thu tiền khi lấy hàng',
  FORCE_RETURN: 'Yêu cầu trả hàng',
  RETURN: 'Trả hàng',
  START_DELIVERY_TRIP: 'Bắt đầu giao hàng',
  DELIVER_IN_TRIP: 'Đang giao hàng',
};

const ghnCarrier = {
  id: 'ghn',
  name: 'Giao Hàng Nhanh',
  shortName: 'GHN',
  hotline: '1900 636 677',
  email: 'cskh@ghn.vn',
  hours: '8h - 20h',
  confidence: 'high',
};

function json(statusCode, payload) {
  return {
    statusCode,
    headers: {
      'Content-Type': 'application/json; charset=utf-8',
      'Access-Control-Allow-Origin': '*',
    },
    body: JSON.stringify(payload),
  };
}

function validateCaptcha(answer, timestamp, token) {
  if (!answer || !timestamp || !token) return false;

  const timeDiff = Date.now() - Number(timestamp);
  if (Math.abs(timeDiff) > 10 * 60 * 60 * 1000) return false;
  const cleanAnswer = String(answer).replace(/\D+/g, '');

  if (String(token).startsWith('client:')) {
    const clientToken = `client:${crypto
      .createHash('sha256')
      .update(`${cleanAnswer}:${timestamp}:${CLIENT_CAPTCHA_SALT}`)
      .digest('hex')}`;

    return clientToken === token;
  }

  const expectedToken = crypto
    .createHmac('sha256', CAPTCHA_SECRET)
    .update(`${cleanAnswer}:${timestamp}`)
    .digest('hex');

  return expectedToken === token;
}

function normalizeCode(rawCode) {
  return String(rawCode ?? '').trim().replace(/\s+/g, '').toUpperCase();
}

function validCode(code) {
  return /^[A-Z0-9._-]{4,40}$/i.test(code);
}

function isPhoneQuery(code) {
  return /^\d{9,11}$/.test(code);
}

function phoneKey(value) {
  const digits = String(value ?? '').replace(/\D+/g, '');
  return digits.slice(-9);
}

function formatGhnTime(value) {
  if (!value) return '';
  const date = new Date(value);
  if (Number.isNaN(date.getTime())) return String(value);

  const pad = (number) => String(number).padStart(2, '0');
  return `${pad(date.getHours())}:${pad(date.getMinutes())} ${pad(date.getDate())}/${pad(date.getMonth() + 1)}/${date.getFullYear()}`;
}

function formatMoney(value) {
  if (value === undefined || value === null || value === '') return '';
  return `${Number(value).toLocaleString('vi-VN')}đ`;
}

function cleanErrorMessage(msg) {
  if (!msg) return '';
  let cleaned = String(msg);
  cleaned = cleaned.replace(/^Lỗi gọi API:\s*/i, '');
  cleaned = cleaned.replace(/^[a-zA-Z0-9_]+\s*-\s*/, '');
  return cleaned.trim();
}

function normalizeEvent(title, time, detail, lat, lng) {
  return {
    title: statusLabels[title] || title || 'Cập nhật hành trình',
    time: formatGhnTime(time),
    detail: detail || '',
    lat: lat || null,
    lng: lng || null,
  };
}

function chooseLookup(code) {
  if (/^HO[A-Z0-9._-]+$/i.test(code)) {
    return {
      endpoint: '/v2/shipping-order/detail-by-client-code',
      body: { client_order_code: code },
      mode: 'client_order_code',
    };
  }

  return {
    endpoint: '/v2/shipping-order/detail',
    body: { order_code: code },
    mode: 'order_code',
  };
}

function buildTimeline(order) {
  const events = [];
  const push = (title, time, detail, lat, lng) => {
    if (!time) return;
    events.push({
      title,
      time,
      detail,
      lat: lat || null,
      lng: lng || null,
      timestamp: Date.parse(time) || 0
    });
  };

  const fromLat = order.from_location?.lat || null;
  const fromLng = order.from_location?.long || order.from_location?.lng || null;
  const toLat = order.to_location?.lat || null;
  const toLng = order.to_location?.long || order.to_location?.lng || null;

  push('Khởi tạo đơn hàng', order.order_date || order.created_date, order.from_name ? `Người gửi: ${order.from_name}` : '', fromLat, fromLng);
  push(statusLabels[order.status] || order.status, order.updated_date, order.updated_warehouse ? `Tại ${order.updated_warehouse}` : order.note || '', null, null);
  push('Dự kiến giao hàng', order.leadtime || order.expected_delivery_time, 'Thời gian giao hàng dự kiến tới người nhận.', toLat, toLng);
  push('Giao hàng thành công', order.finish_date, order.to_name ? `Người nhận: ${order.to_name}` : '', toLat, toLng);

  if (Array.isArray(order.log)) {
    for (const log of order.log) {
      const lat = log.updated_lat || log.lat || log.latitude || null;
      const lng = log.updated_long || log.lng || log.longitude || log.long || null;
      push(
        log.status || log.action || log.title || log.current_status || log.next_status || '',
        log.updated_date || log.created_date || log.action_at || log.time || log.updated_at || log.created_at || '',
        log.note || log.reason || log.message || log.location || log.warehouse || log.driver_name || '',
        lat,
        lng,
      );
    }
  }

  const seen = new Set();
  return events
    .sort((a, b) => b.timestamp - a.timestamp)
    .map((event) => normalizeEvent(event.title, event.time, event.detail, event.lat, event.lng))
    .filter((event) => {
      const key = `${event.title}|${event.time}|${event.detail}`;
      if (seen.has(key)) return false;
      seen.add(key);
      return true;
    });
}

async function readOrdersDatabase() {
  const candidates = [
    resolve('ghn_orders.json'),
    join(process.cwd(), 'ghn_orders.json'),
    process.env.LAMBDA_TASK_ROOT && join(process.env.LAMBDA_TASK_ROOT, 'ghn_orders.json'),
    process.env.NETLIFY_FUNCTIONS_DIR && join(process.env.NETLIFY_FUNCTIONS_DIR, 'ghn_orders.json'),
    '/var/task/ghn_orders.json',
  ].filter((candidate) => typeof candidate === 'string' && candidate.length > 0);

  let lastError = null;
  for (const candidate of candidates) {
    try {
      const content = await readFile(candidate, 'utf8');
      const parsed = JSON.parse(content);
      return Array.isArray(parsed) ? parsed : [];
    } catch (error) {
      lastError = error;
    }
  }

  throw new Error(lastError?.message || 'Không đọc được dữ liệu đơn hàng.');
}

function normalizePhoneOrder(order) {
  return {
    order_code: order.order_code || '',
    client_order_code: order.client_order_code || '',
    status: statusLabels[order.status] || order.status || 'Chưa cập nhật',
    to_name: order.to_name || '',
    to_phone: order.to_phone || '',
    to_address: order.to_address || '',
    order_date: formatGhnTime(order.order_date || order.created_date),
    cod_amount: order.cod_amount || 0,
    total_fee: order.total_fee || 0,
    updated_date: order.updated_date || order.created_date || '',
    carrier: ghnCarrier,
  };
}

async function searchOrdersByPhone(phone) {
  const key = phoneKey(phone);
  const orders = await readOrdersDatabase();
  const matchedOrders = orders
    .filter((order) => {
      const phones = [
        order.to_phone,
        order.from_phone,
        order.return_phone,
        order.from_hotline,
      ];
      return phones.some((value) => phoneKey(value) === key);
    })
    .sort((a, b) => {
      const dateA = Date.parse(a.updated_date || a.order_date || a.created_date || '') || 0;
      const dateB = Date.parse(b.updated_date || b.order_date || b.created_date || '') || 0;
      return dateB - dateA;
    })
    .map(normalizePhoneOrder);

  return {
    ok: true,
    type: 'phone',
    carrier: { ...ghnCarrier, code: phone },
    phone,
    code: phone,
    status: matchedOrders.length ? `Tìm thấy ${matchedOrders.length} đơn hàng` : 'Không tìm thấy đơn hàng',
    message: matchedOrders.length
      ? `Đã tìm thấy ${matchedOrders.length} đơn hàng theo số điện thoại.`
      : 'Không tìm thấy đơn hàng nào liên kết với số điện thoại này trong dữ liệu đã đồng bộ.',
    orders: matchedOrders,
    events: [],
  };
}

async function requestJson(url, options) {
  const response = await fetch(url, options);
  const text = await response.text();
  let data = null;

  try {
    data = text ? JSON.parse(text) : null;
  } catch {
    data = { raw: text };
  }

  if (!response.ok || data?.code < 200 || data?.code >= 300) {
    const error = new Error(data?.message || `GHN API trả HTTP ${response.status}`);
    error.data = data;
    error.status = response.status;
    throw error;
  }

  return data;
}

export function findCoordinatesByWardOrDistrict(orders, wardCode, districtId) {
  if (!orders || !Array.isArray(orders)) return null;

  if (wardCode) {
    const codeStr = String(wardCode).trim();
    if (codeStr) {
      const match = orders.find((o) => {
        const fromWard = o.from_ward_code ? String(o.from_ward_code).trim() : '';
        const toWard = o.to_ward_code ? String(o.to_ward_code).trim() : '';
        return (fromWard === codeStr && o.from_location?.lat) || (toWard === codeStr && o.to_location?.lat);
      });
      if (match) {
        const loc = String(match.from_ward_code).trim() === codeStr ? match.from_location : match.to_location;
        if (loc && loc.lat && (loc.long || loc.lng)) {
          return {
            lat: Number(loc.lat),
            long: Number(loc.long || loc.lng),
            lng: Number(loc.long || loc.lng),
          };
        }
      }
    }
  }

  if (districtId) {
    const distNum = Number(districtId);
    if (distNum) {
      const match = orders.find((o) => {
        const fromDist = o.from_district_id ? Number(o.from_district_id) : 0;
        const toDist = o.to_district_id ? Number(o.to_district_id) : 0;
        return (fromDist === distNum && o.from_location?.lat) || (toDist === distNum && o.to_location?.lat);
      });
      if (match) {
        const loc = Number(match.from_district_id) === distNum ? match.from_location : match.to_location;
        if (loc && loc.lat && (loc.long || loc.lng)) {
          return {
            lat: Number(loc.lat),
            long: Number(loc.long || loc.lng),
            lng: Number(loc.long || loc.lng),
          };
        }
      }
    }
  }

  return null;
}

async function trackGhn(code) {
  const token = process.env.GHN_TOKEN;
  const shopId = process.env.GHN_SHOP_ID;
  const baseUrl = process.env.GHN_BASE_URL || DEFAULT_GHN_BASE_URL;
  const carrier = { ...ghnCarrier, code };

  if (!token || !shopId) {
    return {
      ok: false,
      type: 'needs_config',
      carrier,
      code,
      status: 'Chưa cấu hình GHN API',
      message: 'Cần cấu hình GHN_BASE_URL, GHN_SHOP_ID và GHN_TOKEN trong Netlify Environment variables.',
      events: [
        normalizeEvent('Chưa thể gọi GHN API', '', 'Server cần Token và ShopId để gọi GHN API.'),
      ],
    };
  }

  const lookup = chooseLookup(code);
  const data = await requestJson(`${baseUrl}${lookup.endpoint}`, {
    method: 'POST',
    headers: {
      Token: token,
      ShopId: String(shopId),
      'Content-Type': 'application/json',
    },
    body: JSON.stringify(lookup.body),
  });

  const order = data?.data || {};
  try {
    const localOrders = await readOrdersDatabase();
    const localOrder = localOrders.find((o) => 
      String(o.order_code || '').toUpperCase() === String(code || '').toUpperCase() || 
      String(o.client_order_code || '').toUpperCase() === String(code || '').toUpperCase()
    );
    if (localOrder) {
      if (!order.to_location && localOrder.to_location) {
        order.to_location = localOrder.to_location;
      }
      if (!order.from_location && localOrder.from_location) {
        order.from_location = localOrder.from_location;
      }
    }
    // Geocode fallback coordinates if they remain missing
    if (!order.from_location) {
      const geo = findCoordinatesByWardOrDistrict(localOrders, order.from_ward_code, order.from_district_id);
      if (geo) {
        order.from_location = geo;
      }
    }
    if (!order.to_location) {
      const geo = findCoordinatesByWardOrDistrict(localOrders, order.to_ward_code, order.to_district_id);
      if (geo) {
        order.to_location = geo;
      }
    }
  } catch (err) {
    console.warn('[Sync Fallback] Failed to read local database:', err.message);
  }

  const status = order.status || order.current_status || '';
  const feeParts = [
    order.main_service ? `Phí giao: ${formatMoney(order.main_service)}` : '',
    order.cod_amount ? `COD: ${formatMoney(order.cod_amount)}` : '',
    order.total_fee ? `Tổng phí: ${formatMoney(order.total_fee)}` : '',
  ].filter(Boolean);

  return {
    ok: true,
    type: 'live',
    source: lookup.mode === 'client_order_code'
      ? 'GHN detail-by-client-code API'
      : 'GHN shipping-order detail API',
    carrier,
    code: order.order_code || code,
    clientOrderCode: order.client_order_code || '',
    status: statusLabels[status] || status || data?.message || 'Đã nhận dữ liệu GHN',
    message: [
      order.leadtime || order.expected_delivery_time ? `Dự kiến giao: ${formatGhnTime(order.leadtime || order.expected_delivery_time)}` : '',
      feeParts.join(' · '),
    ].filter(Boolean).join(' · ') || data?.message || 'Đã nhận dữ liệu từ GHN.',
    from_location: order.from_location || null,
    to_location: order.to_location || null,
    events: buildTimeline(order),
    raw: data,
  };
}

export async function handler(event) {
  const query = event.queryStringParameters || {};

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

  if (!validateCaptcha(query.captchaAnswer || '', query.captchaTimestamp || '', query.captchaToken || '')) {
    return json(403, {
      ok: false,
      type: 'captcha_error',
      message: 'Mã xác thực không chính xác hoặc đã hết hạn.',
    });
  }

  const code = normalizeCode(query.code);
  if (isPhoneQuery(code)) {
    try {
      const result = await searchOrdersByPhone(code);
      return json(200, result);
    } catch (error) {
      return json(424, {
        ok: false,
        type: 'phone_error',
        carrier: { ...ghnCarrier, code },
        code,
        status: 'Không đọc được dữ liệu đơn hàng',
        message: error.message,
        events: [
          normalizeEvent('Không đọc được dữ liệu đơn hàng', '', error.message),
        ],
      });
    }
  }

  if (!validCode(code)) {
    return json(424, {
      ok: false,
      type: 'unknown',
      carrier: { ...ghnCarrier, id: 'unknown', name: 'Không nhận diện được mã GHN', confidence: 'low' },
      code,
      status: 'Không nhận diện được mã GHN',
      message: 'Vui lòng nhập mã vận đơn GHN hoặc mã nội bộ HO hợp lệ.',
      events: [],
    });
  }

  try {
    const result = await trackGhn(code);
    return json(result.ok ? 200 : 424, result);
  } catch (error) {
    const cleanedMsg = cleanErrorMessage(error.data?.message || error.message);
    return json(424, {
      ok: false,
      type: 'api_error',
      carrier: { ...ghnCarrier, code },
      code,
      status: 'GHN API trả lỗi',
      message: cleanedMsg,
      events: [
        normalizeEvent('Không lấy được dữ liệu GHN', '', cleanedMsg),
      ],
      raw: error.data,
    });
  }
}

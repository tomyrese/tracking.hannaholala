import { detectCarrier } from './detectCarrier.mjs';
import { readFile } from 'node:fs/promises';
import { fileURLToPath } from 'node:url';

const GHN_BASE_URL = 'https://online-gateway.ghn.vn/shiip/public-api';
const rootDir = fileURLToPath(new URL('..', import.meta.url));

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

function env(name) {
  return process.env[name] || '';
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

function buildGhnHeaders() {
  const token = env('GHN_TOKEN');
  const shopId = env('GHN_SHOP_ID');

  if (!token || !shopId) {
    return null;
  }

  return {
    Token: token,
    ShopId: String(shopId),
    'Content-Type': 'application/json',
  };
}

function getGhnBaseUrl() {
  return env('GHN_BASE_URL') || GHN_BASE_URL;
}

function createSetupResponse(carrier, code) {
  return {
    ok: false,
    type: 'needs_config',
    carrier,
    code,
    status: 'Chưa cấu hình GHN API',
    message: 'Cần cấu hình GHN_BASE_URL, GHN_SHOP_ID và GHN_TOKEN trong Netlify Environment variables.',
    docsUrl: 'https://api.ghn.vn/home/docs/detail?id=66',
    lookupUrl: 'https://donhang.ghn.vn/',
    events: [
      normalizeEvent(
        'Chưa thể gọi GHN API',
        '',
        'Server cần Token và ShopId để gọi /v2/shipping-order/detail.',
      ),
    ],
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
    error.status = response.status;
    error.data = data;
    throw error;
  }

  return data;
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

function readLogTime(log) {
  return log.updated_date || log.created_date || log.action_at || log.time || log.updated_at || log.created_at || '';
}

function readLogTitle(log) {
  return log.status || log.action || log.title || log.current_status || log.next_status || '';
}

function readLogDetail(log) {
  return log.note || log.reason || log.message || log.location || log.warehouse || log.driver_name || '';
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
      timestamp: Date.parse(time) || 0,
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
      push(readLogTitle(log), readLogTime(log), readLogDetail(log), lat, lng);
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

function normalizeGhnResponse(data, carrier, code, lookupMode) {
  const order = data?.data || {};
  const status = order.status || order.current_status || '';
  const feeParts = [
    order.main_service ? `Phí giao: ${formatMoney(order.main_service)}` : '',
    order.cod_amount ? `COD: ${formatMoney(order.cod_amount)}` : '',
    order.total_fee ? `Tổng phí: ${formatMoney(order.total_fee)}` : '',
  ].filter(Boolean);

  return {
    ok: true,
    type: 'live',
    source: lookupMode === 'client_order_code'
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

async function callGhnDetail(carrier, code, lookup) {
  const headers = buildGhnHeaders();
  if (!headers) {
    try {
      const content = await readFile(`${rootDir}/ghn_orders.json`, 'utf8');
      const orders = JSON.parse(content);
      const found = orders.find(o => o.order_code === code || o.client_order_code === code);
      if (found) {
        return normalizeGhnResponse({ data: found }, carrier, code, lookup.mode);
      }
    } catch (err) {
      console.warn('[Offline Fallback] Failed to read ghn_orders.json:', err.message);
    }
    return createSetupResponse(carrier, code);
  }

  const data = await requestJson(`${getGhnBaseUrl()}${lookup.endpoint}`, {
    method: 'POST',
    headers,
    body: JSON.stringify(lookup.body),
  });

  return normalizeGhnResponse(data, carrier, code, lookup.mode);
}

function phoneKey(value) {
  const digits = String(value ?? '').replace(/\D+/g, '');
  return digits.slice(-9);
}

async function searchOrdersByPhone(phone) {
  const content = await readFile(`${rootDir}/ghn_orders.json`, 'utf8');
  const orders = JSON.parse(content);
  const key = phoneKey(phone);
  const matchedOrders = orders
    .filter((order) => [order.to_phone, order.from_phone, order.return_phone, order.from_hotline].some((value) => phoneKey(value) === key))
    .sort((a, b) => {
      const dateA = Date.parse(a.updated_date || a.order_date || a.created_date || '') || 0;
      const dateB = Date.parse(b.updated_date || b.order_date || b.created_date || '') || 0;
      return dateB - dateA;
    })
    .map((order) => ({
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
      carrier: { id: 'ghn', name: 'Giao Hàng Nhanh', shortName: 'GHN' },
    }));

  return {
    ok: true,
    type: 'phone',
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

export async function trackShipment(rawCode) {
  const carrier = detectCarrier(rawCode);
  const code = carrier.code;

  if (carrier.id === 'phone') {
    return searchOrdersByPhone(code);
  }

  if (!code || carrier.id === 'unknown') {
    return {
      ok: false,
      type: 'unknown',
      carrier,
      code,
      status: 'Không nhận diện được mã GHN',
      message: 'Vui lòng nhập mã vận đơn GHN hoặc mã nội bộ HO hợp lệ.',
      events: [],
    };
  }

  const lookup = chooseLookup(code);

  try {
    return await callGhnDetail(carrier, code, lookup);
  } catch (error) {
    const cleanedMsg = cleanErrorMessage(error.data?.message || error.message);
    return {
      ok: false,
      type: 'api_error',
      carrier,
      code,
      status: 'GHN API trả lỗi',
      message: cleanedMsg,
      docsUrl: 'https://api.ghn.vn/home/docs/detail?id=66',
      lookupUrl: 'https://donhang.ghn.vn/',
      events: [
        normalizeEvent('Không lấy được dữ liệu GHN', '', cleanedMsg),
      ],
      raw: error.data,
    };
  }
}

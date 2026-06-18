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
  CANCEL_COLLECT_DELIVERING_MONEY: 'Huỷ thu tiền khi giao hàng',
  CANCEL_COLLECT_PICKING_MONEY: 'Huỷ thu tiền khi lấy hàng',
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

function normalizeVietnameseText(value) {
  return String(value || '')
    .normalize('NFD')
    .replace(/\p{Diacritic}/gu, '')
    .replace(/[đĐ]/gu, 'd')
    .toLowerCase()
    .trim();
}

function isNoiseTimelineTitle(title) {
  const text = normalizeVietnameseText(title);
  const raw = String(title || '').toLowerCase();
  return (
    text.includes('khoi tao don hang') ||
    text.includes('goi hen') ||
    text.includes('goi khach') ||
    text.includes('call') ||
    text.includes('sms') ||
    raw.includes('khởi tạo') ||
    raw.includes('gọi')
  );
}

function readLogDetail(log) {
  const locationParts = [
    log.updated_warehouse,
    log.warehouse,
    log.location,
    log.address,
  ].filter(Boolean);

  const messageParts = [
    log.note,
    log.reason,
    log.message,
    log.driver_name,
  ].filter(Boolean);

  return [...locationParts, ...messageParts].join(' · ');
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

function buildEventFamily(title) {
  const text = normalizeVietnameseText(title);

  if (text.includes('giao thanh cong') || text.includes('giao hang thanh cong') || text.includes('delivered')) return 'delivered';
  if (
    text.includes('hoan tra') ||
    text.includes('dang tra') ||
    text.includes('cho tra hang') ||
    text.includes('tra hang') ||
    text.includes('da tra') ||
    text.includes('returned')
  ) return 'returned';
  if (text.includes('giao that bai') || text.includes('delivery fail')) return 'delivery_fail';
  if (text.includes('du kien giao hang')) return 'leadtime';
  if (
    text.includes('dang giao') ||
    text.includes('dang giao (thu tien)') ||
    text.includes('giao hang (thu tien)') ||
    text.includes('delivering')
  ) return 'delivering';
  if (
    text.includes('luan chuyen') ||
    text.includes('luu kho') ||
    text.includes('phan loai') ||
    text.includes('sorting') ||
    text.includes('transporting') ||
    text.includes('storing')
  ) return 'transporting';
  if (
    text.includes('da lay hang') ||
    text.includes('dang lay hang') ||
    text.includes('lay hang (thu tien)') ||
    text.includes('picked') ||
    text.includes('picking')
  ) return 'picked';
  if (text.includes('cho lay hang') || text.includes('ready to pick') || text.includes('ready_to_pick')) return 'ready';
  if (text.includes('da huy') || text.includes('su co') || text.includes('that lac') || text.includes('hu hong')) return 'issue';
  return text;
}

function cleanTimelineDetail(detail) {
  return String(detail || '')
    .split(/ · | Â· | Ã‚Â· /)
    .map((part) => part.trim())
    .filter(Boolean)
    .slice(0, 2)
    .join(' · ');
}

function canonicalTimelineTitle(family, fallbackTitle) {
  const titles = {
    ready: 'Chờ lấy hàng',
    picked: 'Đã lấy hàng',
    transporting: 'Đang luân chuyển',
    delivering: 'Đang giao',
    delivered: 'Giao thành công',
    delivery_fail: 'Giao thất bại',
    returned: 'Hoàn trả',
    issue: 'Sự cố',
    leadtime: 'Dự kiến giao hàng',
  };

  return titles[family] || fallbackTitle;
}

function compactTimelineDetail(family, detail) {
  const cleaned = cleanTimelineDetail(detail);
  const parts = cleaned
    .split(/ · | Â· | Ã‚Â· /)
    .map((part) => part.trim())
    .filter(Boolean);

  if (!parts.length) return '';
  if (family === 'leadtime') return 'Thời gian giao hàng dự kiến tới người nhận.';

  if (family === 'delivered') {
    return parts.find((part) => normalizeVietnameseText(part).includes('nguoi nhan')) || '';
  }

  if (family === 'delivery_fail' || family === 'returned' || family === 'issue') {
    return parts[0];
  }

  return '';
}

export function buildTimelineForDisplay(order) {
  const currentFamily = buildEventFamily(statusLabels[order?.status] || order?.status || '');
  const preparedEvents = buildTimeline(order)
    .filter((event) => !isNoiseTimelineTitle(event.title))
    .map((event) => ({
      ...event,
      family: buildEventFamily(event.title),
    }));

  const latestByFamily = new Map();
  for (const event of preparedEvents) {
    if (!latestByFamily.has(event.family)) {
      latestByFamily.set(event.family, {
        ...event,
        title: canonicalTimelineTitle(event.family, event.title),
        detail: compactTimelineDetail(event.family, event.detail),
      });
    }
  }

  let familiesToShow = [];
  if (currentFamily === 'returned') {
    familiesToShow = ['returned'];
  } else if (currentFamily === 'delivered') {
    familiesToShow = ['delivered', 'delivering', 'transporting', 'picked', 'ready'];
  } else if (currentFamily === 'delivery_fail') {
    familiesToShow = ['delivery_fail', 'delivering', 'transporting', 'picked', 'ready'];
  } else if (currentFamily === 'issue') {
    familiesToShow = ['issue'];
  } else {
    // Normal active order flow
    familiesToShow = [
      ...(latestByFamily.has('delivered') ? ['delivered'] : []),
      'leadtime',
      'delivering',
      'transporting',
      'picked',
      'ready',
    ];
  }

  // Inject placeholders for missing standard families in familiesToShow
  for (const family of familiesToShow) {
    if (!latestByFamily.has(family)) {
      latestByFamily.set(family, {
        title: canonicalTimelineTitle(family, ''),
        time: '',
        detail: family === 'leadtime' ? 'Thời gian giao hàng dự kiến tới người nhận.' : '',
        lat: null,
        lng: null,
        family,
      });
    }
  }

  return familiesToShow
    .map((family) => latestByFamily.get(family))
    .filter(Boolean)
    .filter((event) => {
      if (event.family === 'leadtime' && (currentFamily === 'delivered' || currentFamily === 'returned' || currentFamily === 'delivery_fail')) {
        return false;
      }
      return true;
    })
    .map(({ family, ...event }) => event);
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
    events: buildTimelineForDisplay(order),
    raw: data,
  };
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

async function callGhnDetail(carrier, code, lookup) {
  const headers = buildGhnHeaders();
  if (!headers) {
    try {
      const content = await readFile(`${rootDir}/ghn_orders.json`, 'utf8');
      const orders = JSON.parse(content);
      const found = orders.find((order) => 
        String(order.order_code || '').toUpperCase() === String(code || '').toUpperCase() || 
        String(order.client_order_code || '').toUpperCase() === String(code || '').toUpperCase()
      );
      if (found) {
        if (!found.from_location) {
          const geo = findCoordinatesByWardOrDistrict(orders, found.from_ward_code, found.from_district_id);
          if (geo) found.from_location = geo;
        }
        if (!found.to_location) {
          const geo = findCoordinatesByWardOrDistrict(orders, found.to_ward_code, found.to_district_id);
          if (geo) found.to_location = geo;
        }
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

  const order = data?.data || {};
  try {
    const content = await readFile(`${rootDir}/ghn_orders.json`, 'utf8');
    const orders = JSON.parse(content);
    const localOrder = orders.find((o) => 
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
      const geo = findCoordinatesByWardOrDistrict(orders, order.from_ward_code, order.from_district_id);
      if (geo) {
        order.from_location = geo;
      }
    }
    if (!order.to_location) {
      const geo = findCoordinatesByWardOrDistrict(orders, order.to_ward_code, order.to_district_id);
      if (geo) {
        order.to_location = geo;
      }
    }
  } catch (err) {
    console.warn('[Local Merge] Failed to merge local order locations:', err.message);
  }

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

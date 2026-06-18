import { trackShipment } from './trackingApi.mjs';
import { extractReviewIdentity, isOrderDelayed } from './reviewGateway.mjs';

function json(statusCode, body) {
  return {
    statusCode,
    headers: {
      'Content-Type': 'application/json',
      'Access-Control-Allow-Origin': '*',
      'Access-Control-Allow-Methods': 'GET,POST,OPTIONS',
      'Access-Control-Allow-Headers': 'Content-Type',
    },
    body: typeof body === 'string' ? body : JSON.stringify(body),
  };
}

async function checkDiscountClaimed(fetchFn, webAppUrl, secret, trackingCode) {
  const url = new URL(webAppUrl);
  url.searchParams.set('action', 'check_discount');
  url.searchParams.set('tracking_code', trackingCode);
  if (secret) url.searchParams.set('secret', secret);

  const res = await fetchFn(url);
  if (!res.ok) {
    throw new Error('Không thể kiểm tra trạng thái mã giảm giá từ Apps Script.');
  }
  return await res.json();
}

async function claimDiscountInSheet(fetchFn, webAppUrl, secret, payload) {
  const res = await fetchFn(webAppUrl, {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({
      action: 'claim_discount',
      secret,
      ...payload
    })
  });
  if (!res.ok) {
    throw new Error('Không thể lưu vết mã giảm giá vào Apps Script.');
  }
  return await res.json();
}

async function createHaravanDiscount(fetchFn, token, trackingCode) {
  const randSuffix = Math.random().toString(36).substring(2, 6).toUpperCase();
  const discountCode = `BNB-${trackingCode}-${randSuffix}`;

  // If token is missing, return a dummy code for offline/testing/fallback
  if (!token || token === 'undefined' || token === 'null' || token === 'your-haravan-token-here') {
    return { discountCode, mock: true };
  }

  const payload = {
    discount: {
      code: discountCode,
      value: 50000,
      discount_type: 'product_amount',
      take_type: 'amount',
      usage_limit: 1,
      once_per_customer: true,
      customers_selection: 'all',
      starts_at: new Date().toISOString(),
      ends_at: new Date(Date.now() + 30 * 24 * 60 * 60 * 1000).toISOString()
    }
  };

  const response = await fetchFn('https://apis.haravan.com/com/discounts.json', {
    method: 'POST',
    headers: {
      'Authorization': `Bearer ${token}`,
      'Content-Type': 'application/json'
    },
    body: JSON.stringify(payload)
  });

  if (!response.ok) {
    const errorText = await response.text();
    throw new Error(`Haravan API error: ${response.status} - ${errorText}`);
  }

  const responseData = await response.json();
  return {
    discountCode: responseData?.discount?.code || discountCode,
    mock: false
  };
}

export async function handleDiscountRequest({
  method = 'GET',
  query = {},
  body = '',
  env = process.env,
  fetchFn = fetch,
  trackShipmentFn = trackShipment,
} = {}) {
  const webAppUrl = env.GOOGLE_REVIEW_WEB_APP_URL || '';
  const secret = env.GOOGLE_REVIEW_SHARED_SECRET || '';
  const haravanToken = env.HARAVAN_TOKEN || '';

  if (!webAppUrl || webAppUrl === 'undefined' || webAppUrl === 'null') {
    return json(503, {
      ok: false,
      message: 'Chưa cấu hình GOOGLE_REVIEW_WEB_APP_URL trong environment.',
    });
  }

  if (method === 'OPTIONS') {
    return json(204, '');
  }

  if (method === 'GET') {
    const trackingCode = String(query.code || query.trackingCode || '').trim().toUpperCase();
    if (!trackingCode) {
      return json(400, { ok: false, message: 'Thiếu mã đơn hàng.' });
    }

    const result = await trackShipmentFn(trackingCode);
    if (!result.ok) {
      return json(404, { ok: false, message: 'Không tìm thấy thông tin đơn hàng.' });
    }

    const delayed = isOrderDelayed(result);
    if (!delayed) {
      return json(200, { ok: true, delayed: false, message: 'Đơn hàng chưa trễ hạn hoặc đã giao/hủy/trả.' });
    }

    try {
      const identity = extractReviewIdentity(result);
      const sheetStatus = await checkDiscountClaimed(fetchFn, webAppUrl, secret, identity.trackingCode);
      return json(200, {
        ok: true,
        delayed: true,
        claimed: Boolean(sheetStatus?.claimed),
        code: sheetStatus?.code || null,
        trackingCode: identity.trackingCode
      });
    } catch (err) {
      return json(500, { ok: false, message: err.message });
    }
  }

  if (method === 'POST') {
    let parsedBody = {};
    try {
      parsedBody = body ? JSON.parse(body) : {};
    } catch {
      return json(400, { ok: false, message: 'Dữ liệu yêu cầu không hợp lệ.' });
    }

    const trackingCode = String(parsedBody.trackingCode || '').trim().toUpperCase();
    if (!trackingCode) {
      return json(400, { ok: false, message: 'Thiếu mã đơn hàng.' });
    }

    const result = await trackShipmentFn(trackingCode);
    if (!result.ok) {
      return json(404, { ok: false, message: 'Không tìm thấy thông tin đơn hàng.' });
    }

    const delayed = isOrderDelayed(result);
    if (!delayed) {
      return json(400, { ok: false, message: 'Đơn hàng chưa trễ hạn hoặc đã giao/hủy/trả.' });
    }

    try {
      const identity = extractReviewIdentity(result);
      
      // 1. Kiểm tra xem đã claim chưa
      const sheetStatus = await checkDiscountClaimed(fetchFn, webAppUrl, secret, identity.trackingCode);
      if (sheetStatus?.claimed) {
        return json(200, {
          ok: true,
          claimed: true,
          code: sheetStatus.code,
          message: 'Đơn hàng này đã nhận mã giảm giá.'
        });
      }

      // 2. Tạo mã Haravan
      const haravanResult = await createHaravanDiscount(fetchFn, haravanToken, identity.trackingCode);

      // 3. Ghi nhận vào Google Sheets
      await claimDiscountInSheet(fetchFn, webAppUrl, secret, {
        tracking_code: identity.trackingCode,
        order_code: identity.orderCode,
        phone: identity.phone,
        discount_code: haravanResult.discountCode,
        value: 50000
      });

      return json(201, {
        ok: true,
        claimed: true,
        code: haravanResult.discountCode,
        mock: haravanResult.mock,
        message: 'Nhận mã giảm giá thành công!'
      });
    } catch (err) {
      return json(500, { ok: false, message: err.message });
    }
  }

  return json(405, { ok: false, message: 'Phương thức không được hỗ trợ.' });
}

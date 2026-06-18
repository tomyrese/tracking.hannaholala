import { trackShipment } from './trackingApi.mjs';
import {
  extractReviewIdentity,
  isDeliveredReviewableResult,
  normalizeReviewCode,
  validateReviewSubmission,
} from './reviewGateway.mjs';

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

function buildConfigError() {
  return json(503, {
    ok: false,
    type: 'needs_config',
    message: 'Chưa cấu hình GOOGLE_REVIEW_WEB_APP_URL trong environment.',
  });
}

async function readJsonResponse(response) {
  try {
    return await response.json();
  } catch {
    return null;
  }
}

async function fetchReviewStatus(fetchFn, webAppUrl, secret, trackingCode) {
  const url = new URL(webAppUrl);
  url.searchParams.set('action', 'status');
  url.searchParams.set('tracking_code', trackingCode);
  if (secret) url.searchParams.set('secret', secret);

  const response = await fetchFn(url);
  const payload = await readJsonResponse(response);
  if (!response.ok || !payload?.ok) {
    throw new Error(payload?.message || 'Không kiểm tra được trạng thái đánh giá.');
  }

  return payload;
}

async function submitReview(fetchFn, webAppUrl, secret, payload) {
  const response = await fetchFn(webAppUrl, {
    method: 'POST',
    headers: {
      'Content-Type': 'application/json',
    },
    body: JSON.stringify({
      action: 'submit',
      secret,
      ...payload,
    }),
  });

  const responsePayload = await readJsonResponse(response);
  if (!response.ok) {
    return {
      ok: false,
      reviewed: Boolean(responsePayload?.reviewed),
      message: responsePayload?.message || 'Không gửi được đánh giá.',
    };
  }

  return responsePayload || { ok: false, message: 'Không nhận được phản hồi từ dịch vụ đánh giá.' };
}

function buildDeliveredIdentityPayload(identity, reviewed) {
  return {
    ok: true,
    delivered: true,
    reviewed,
    trackingCode: identity.trackingCode,
    orderCode: identity.orderCode,
    clientOrderCode: identity.clientOrderCode,
    phone: identity.phone,
    message: reviewed ? 'Đơn hàng này đã được đánh giá.' : 'Bạn có thể đánh giá đơn hàng này.',
  };
}

export async function handleReviewRequest({
  method = 'GET',
  query = {},
  body = '',
  env = process.env,
  fetchFn = fetch,
  trackShipmentFn = trackShipment,
} = {}) {
  const webAppUrl = env.GOOGLE_REVIEW_WEB_APP_URL || '';
  const secret = env.GOOGLE_REVIEW_SHARED_SECRET || '';

  if (!webAppUrl) return buildConfigError();

  if (method === 'OPTIONS') {
    return {
      statusCode: 204,
      headers: {
        'Access-Control-Allow-Origin': '*',
        'Access-Control-Allow-Methods': 'GET,POST,OPTIONS',
        'Access-Control-Allow-Headers': 'Content-Type',
      },
      body: '',
    };
  }

  if (method === 'GET') {
    const code = normalizeReviewCode(query.code || query.trackingCode);
    if (!code) {
      return json(400, {
        ok: false,
        message: 'Thiếu mã đơn hàng để kiểm tra đánh giá.',
      });
    }

    const result = await trackShipmentFn(code);
    if (!isDeliveredReviewableResult(result)) {
      return json(409, {
        ok: false,
        delivered: false,
        reviewed: false,
        message: 'Chỉ đơn hàng đã giao thành công mới được đánh giá.',
      });
    }

    const identity = extractReviewIdentity(result);
    const reviewStatus = await fetchReviewStatus(fetchFn, webAppUrl, secret, identity.trackingCode);
    return json(200, buildDeliveredIdentityPayload(identity, Boolean(reviewStatus.reviewed)));
  }

  if (method !== 'POST') {
    return json(405, {
      ok: false,
      message: 'Phương thức không được hỗ trợ.',
    });
  }

  let parsedBody = null;
  try {
    parsedBody = body ? JSON.parse(body) : {};
  } catch {
    return json(400, {
      ok: false,
      message: 'Dữ liệu đánh giá không hợp lệ.',
    });
  }

  const submission = validateReviewSubmission(parsedBody);
  if (!submission.ok) {
    return json(400, submission);
  }

  const result = await trackShipmentFn(submission.trackingCode);
  if (!isDeliveredReviewableResult(result)) {
    return json(409, {
      ok: false,
      delivered: false,
      reviewed: false,
      message: 'Chỉ đơn hàng đã giao thành công mới được đánh giá.',
    });
  }

  const identity = extractReviewIdentity(result);
  const responsePayload = await submitReview(fetchFn, webAppUrl, secret, {
    tracking_code: identity.trackingCode,
    order_code: identity.orderCode,
    client_order_code: identity.clientOrderCode,
    phone: identity.phone,
    status: identity.status,
    rating: submission.rating,
    note: submission.note,
  });

  if (!responsePayload?.ok || (responsePayload.reviewed && responsePayload.created === false)) {
    return json(409, {
      ok: false,
      type: 'already_reviewed',
      reviewed: true,
      message: responsePayload?.message || 'Đơn hàng này đã được đánh giá.',
      trackingCode: identity.trackingCode,
      orderCode: identity.orderCode,
      clientOrderCode: identity.clientOrderCode,
      phone: identity.phone,
    });
  }

  return json(201, {
    ok: true,
    saved: true,
    reviewed: true,
    trackingCode: identity.trackingCode,
    orderCode: identity.orderCode,
    clientOrderCode: identity.clientOrderCode,
    phone: identity.phone,
    message: 'Cảm ơn bạn đã gửi đánh giá cho đơn hàng này.',
  });
}

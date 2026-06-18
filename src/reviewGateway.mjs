function normalizeText(value) {
  return String(value || '')
    .normalize('NFD')
    .replace(/\p{Diacritic}/gu, '')
    .replace(/[đĐ]/gu, 'd')
    .toLowerCase()
    .trim();
}

export function normalizeReviewCode(value) {
  return String(value || '')
    .trim()
    .replace(/\s+/g, '')
    .toUpperCase();
}

export function normalizeReviewPhone(value) {
  return String(value || '').replace(/\D+/g, '');
}

export function isDeliveredReviewableResult(result) {
  if (!result?.ok || result?.type !== 'live') return false;

  const candidates = [
    result.status,
    ...(Array.isArray(result.events) ? result.events.map((event) => event?.title) : []),
  ].filter(Boolean).map(normalizeText);

  return candidates.some((text) =>
    text.includes('giao thanh cong') ||
    text.includes('giao hang thanh cong') ||
    text.includes('delivered')
  );
}

export function isOrderDelayed(result) {
  if (!result?.ok || result?.type !== 'live') return false;

  const rawOrder = result.raw?.data || {};
  const leadtimeStr = rawOrder.leadtime || rawOrder.expected_delivery_time;
  if (!leadtimeStr) return false;

  const leadtimeDate = new Date(leadtimeStr);
  if (isNaN(leadtimeDate.getTime())) return false;

  const now = new Date();
  const delayedMs = now.getTime() - leadtimeDate.getTime();
  const delayedDays = delayedMs / (1000 * 60 * 60 * 24);
  const isTimePassed = delayedDays >= 5;

  const status = normalizeText(rawOrder.status || result.status || '');
  const isExcludedStatus = 
    status.includes('delivered') || 
    status.includes('giao thanh cong') ||
    status.includes('cancel') || 
    status.includes('huy') ||
    status.includes('return') || 
    status.includes('tra hang') ||
    status.includes('returned') ||
    status.includes('returning');

  return isTimePassed && !isExcludedStatus;
}

export function extractReviewIdentity(result) {
  return {
    trackingCode: normalizeReviewCode(result?.clientOrderCode || result?.code),
    orderCode: normalizeReviewCode(result?.code),
    clientOrderCode: normalizeReviewCode(result?.clientOrderCode),
    phone: normalizeReviewPhone(
      result?.raw?.data?.to_phone ||
      result?.raw?.data?.from_phone ||
      result?.to_phone ||
      result?.from_phone ||
      ''
    ),
    status: String(result?.status || ''),
  };
}

export function validateReviewSubmission(payload = {}) {
  const trackingCode = normalizeReviewCode(payload.trackingCode || payload.code);
  const numericRating = Number(payload.rating);
  const note = String(payload.note || '')
    .replace(/[^\p{L}\p{N}\s.,?!()\-]/gu, '')
    .trim()
    .slice(0, 1000);

  if (!trackingCode || !/^[A-Z0-9._-]{4,40}$/i.test(trackingCode)) {
    return { ok: false, message: 'Mã đơn hàng không hợp lệ.' };
  }

  if (!Number.isInteger(numericRating) || numericRating < 0 || numericRating > 5) {
    return { ok: false, message: 'Vui lòng chọn số sao từ 0 đến 5.' };
  }

  return {
    ok: true,
    trackingCode,
    rating: numericRating,
    note,
  };
}

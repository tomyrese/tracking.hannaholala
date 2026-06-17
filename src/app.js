import { detectCarrier } from './detectCarrier.mjs';
import { buildMapJourney } from './mapJourney.mjs';
import { fetchRoadRoute } from './mapRoute.mjs';
import { createTrackingRouteManager } from './TrackingRouteManager.mjs';
import { buildMarkerDisplayState, buildViewportFocusPoints } from './mapViewport.mjs';
import { mountFeaturedProducts } from './components/featured-products.js';

const icons = {
  check: '<path d="M20 6 9 17l-5-5"></path>',
  truck: '<path d="M3 7h11v8H3z"></path><path d="M14 10h4l3 3v2h-7z"></path><circle cx="7" cy="17" r="2"></circle><circle cx="17" cy="17" r="2"></circle>',
  box: '<path d="M3 9l9-5 9 5-9 5z"></path><path d="M3 15l9 5 9-5"></path>',
  pin: '<path d="M12 21s7-4.4 7-11a7 7 0 0 0-14 0c0 6.6 7 11 7 11z"></path><circle cx="12" cy="10" r="2"></circle>',
  alert: '<circle cx="12" cy="12" r="10"></circle><path d="M12 8v4"></path><path d="M12 16h.01"></path>',
  warehouse: '<path d="M3 21h18"></path><path d="M3 10l9-7 9 7v11H3V10z"></path><path d="M9 21v-8h6v8"></path>',
};

const form = document.querySelector('[data-track-form]');
const input = document.querySelector('[data-tracking-input]');
const resultGrid = document.querySelector('[data-result-grid]');
const detectAlert = document.querySelector('[data-detect-alert]');
const statusCode = document.querySelector('[data-status-code]');
const statusTitle = document.querySelector('[data-status-title]');
const statusIcon = document.querySelector('[data-status-icon]');
const timeline = document.querySelector('[data-timeline]');
const helperText = document.querySelector('[data-helper-text]');
const trackButton = document.querySelector('.track-button');
const backBtnContainer = document.querySelector('[data-back-btn-container]');

let lastPhoneSearchResult = null;
let activeResultCode = '';
let lastCaptchaProof = null;
const CLIENT_CAPTCHA_SALT = 'ho-tracking-client-captcha-v1';

function mountBrandMarquee() {
  const marquee = document.querySelector('[data-brand-marquee]');
  if (!marquee || marquee.childElementCount > 0) return;

  const logos = Array.from({ length: 17 }, (_, index) => `./src/logo-optimized/${index + 1}.png`);
  const trackHtml = [...logos, ...logos]
    .map((src, index) => `<img src="${src}" alt="" width="156" height="78" decoding="async" loading="lazy"${index >= logos.length ? ' aria-hidden="true"' : ''}>`)
    .join('');

  marquee.innerHTML = `<div class="brand-marquee__track">${trackHtml}</div>`;
}

function apiBaseUrl() {
  const isLocalFile = window.location.protocol === 'file:';
  const isLocalhost = window.location.hostname === 'localhost' || window.location.hostname === '127.0.0.1';
  return isLocalFile ? 'http://localhost:3000' : isLocalhost ? window.location.origin : window.location.origin;
}

function cleanLookupCode(value) {
  return String(value ?? '').replace(/\s+/g, '').toUpperCase();
}

function syncCleanInputValue() {
  const cleaned = cleanLookupCode(input.value);
  if (input.value !== cleaned) input.value = cleaned;
  return cleaned;
}

function getEventIconName(title) {
  const lowercaseTitle = String(title || '').toLowerCase();
  if (lowercaseTitle.includes('thành công') || lowercaseTitle.includes('delivered') || lowercaseTitle.includes('trả hàng thành công') || lowercaseTitle.includes('returned')) {
    return 'check';
  }
  if (lowercaseTitle.includes('hủy') || lowercaseTitle.includes('cancel') || lowercaseTitle.includes('sự cố') || lowercaseTitle.includes('thất bại') || lowercaseTitle.includes('fail') || lowercaseTitle.includes('damage') || lowercaseTitle.includes('lost')) {
    return 'alert';
  }
  if (lowercaseTitle.includes('kho') || lowercaseTitle.includes('phân loại') || lowercaseTitle.includes('storing') || lowercaseTitle.includes('sorting')) {
    return 'warehouse';
  }
  if (lowercaseTitle.includes('giao') || lowercaseTitle.includes('lấy') || lowercaseTitle.includes('vận chuyển') || lowercaseTitle.includes('luân chuyển') || lowercaseTitle.includes('delivering') || lowercaseTitle.includes('picking') || lowercaseTitle.includes('transporting')) {
    return 'truck';
  }
  return 'pin';
}

function isOrderInitEvent(title) {
  const text = normalizeStatusText(title);
  return text.includes('khoi tao don hang') || text.includes('tao don hang');
}

function isDeliveredTimelineEvent(event) {
  const text = normalizeStatusText(event?.title);
  return (
    text.includes('giao thanh cong') ||
    text.includes('giao hang thanh cong') ||
    text.includes('delivered') ||
    text.includes('returned')
  );
}

function readTimelinePoint(event) {
  const lat = Number(event?.lat);
  const lng = Number(event?.lng);
  if (!Number.isFinite(lat) || !Number.isFinite(lng)) return null;
  return { lat, lng };
}

function readRecipientPoint(result) {
  const lat = Number(result?.to_location?.lat);
  const lng = Number(result?.to_location?.long ?? result?.to_location?.lng);
  if (!Number.isFinite(lat) || !Number.isFinite(lng)) return null;
  return { lat, lng };
}

function prepareVisibleTimelineEvents(result) {
  const manager = createTrackingRouteManager(result, {
    fallbackOrigin: { lat: 21.0285, lng: 105.8542 },
    fallbackDestination: { lat: 10.8231, lng: 106.6297 },
  });

  return manager.syncTimeline(manager.activeStepIndex).map((step, index) => ({
    title: step.title,
    time: step.time,
    detail: step.detail,
    lat: step.point?.lat,
    lng: step.point?.lng,
    timelineIndex: index,
    isVirtual: Boolean(step.isVirtual),
    isCurrent: Boolean(step.isCurrent),
    timelineState: step.timelineState,
  }));
}

function timelineItem(event, index = 0) {
  const iconName = getEventIconName(event.title);
  const detail = [event.time, event.detail].filter(Boolean).join(' · ');
  const latAttr = event.lat ? ` data-lat="${event.lat}"` : '';
  const lngAttr = event.lng ? ` data-lng="${event.lng}"` : '';
  const titleAttr = ` data-title="${event.title || ''}"`;
  const indexAttr = ` data-timeline-index="${index}"`;
  const isMapInteractive = Boolean(event.lat && event.lng);
  const interactiveAttr = isMapInteractive ? ' data-map-interactive="true"' : '';
  const itemClassName = [
    'timeline__item',
    !isMapInteractive ? 'timeline__item--static' : '',
    event.timelineState ? `timeline__item--${event.timelineState}` : '',
  ].filter(Boolean).join(' ');
  const clickHint = isMapInteractive ? '<span class="timeline__map-hint">Bấm để xem trên bản đồ</span>' : '';

  return `
    <li class="${itemClassName}" data-timeline-event${indexAttr}${latAttr}${lngAttr}${titleAttr}${interactiveAttr} style="padding: 6px 8px; border-radius: 12px; transition: background-color 0.2s;">
      <span class="timeline__icon" aria-hidden="true">
        <svg viewBox="0 0 24 24">${icons[iconName]}</svg>
      </span>
      <div>
        <strong>${event.title || 'Cập nhật hành trình'}</strong>
        <div class="timeline__detail">${detail || 'Đã nhận dữ liệu từ GHN.'}</div>
        ${clickHint}
      </div>
    </li>
  `;
}

function messageItem(title, detail, iconName = 'alert') {
  return `
    <li class="timeline__item timeline__item--muted">
      <span class="timeline__icon" aria-hidden="true">
        <svg viewBox="0 0 24 24">${icons[iconName]}</svg>
      </span>
      <div>
        <strong>${title}</strong>
        <div class="timeline__detail">${detail}</div>
      </div>
    </li>
  `;
}

function cleanErrorMessage(msg) {
  if (!msg) return '';
  let cleaned = String(msg);
  cleaned = cleaned.replace(/^Lỗi gọi API:\s*/i, '');
  cleaned = cleaned.replace(/^[a-zA-Z0-9_]+\s*-\s*/, '');
  return cleaned.trim();
}

function renderTimelineFromEvents(events, carrier) {
  if (!events?.length) {
    timeline.innerHTML = messageItem('Chưa có lịch sử hành trình', `${carrier?.shortName || 'Hệ thống'} trả về trạng thái nhưng chưa có mảng log chi tiết.`);
    return;
  }

  timeline.innerHTML = events.map((event, index) => timelineItem(event, index)).join('');

  setActiveTimelineItem(0);

  if (lastPhoneSearchResult) {
    backBtnContainer.innerHTML = `
      <button class="track-button btn-back-to-list" style="min-height: 32px; padding: 0 12px; font-size: 12px; border-radius: 999px; background: var(--beige); color: #6f554b; border: 1px solid #efd2c8; cursor: pointer; font-weight: 800; display: inline-flex; align-items: center; gap: 4px; white-space: nowrap;">
        ← Quay lại
      </button>
    `;
    const backBtn = backBtnContainer.querySelector('.btn-back-to-list');
    if (backBtn) {
      backBtn.addEventListener('click', (e) => {
        e.preventDefault();
        backBtnContainer.innerHTML = '';
        input.value = lastPhoneSearchResult.phone;
        statusIcon.dataset.state = 'success';
        statusTitle.textContent = `Tìm thấy ${lastPhoneSearchResult.orders.length} đơn hàng`;
        statusCode.textContent = `SĐT: ${lastPhoneSearchResult.phone}`;
        renderPhoneOrders(lastPhoneSearchResult.orders);
        helperText.innerHTML = `Đã tìm kiếm thành công danh sách đơn hàng cho SĐT ${lastPhoneSearchResult.phone}.`;
      });
    }
  } else {
    backBtnContainer.innerHTML = '';
  }
}

function renderReadyState(carrier) {
  renderIdleMinimap();
  backBtnContainer.innerHTML = '';
  statusIcon.dataset.state = 'success';
  statusTitle.textContent = `Sẵn sàng tra cứu`;
  statusCode.textContent = `Mã: ${carrier.code}`;
  timeline.innerHTML = messageItem(
    'Đã nhận mã tra cứu',
    'Bấm Tra cứu để lấy trạng thái giao hàng theo thời gian thực.',
    'check',
  );
}

function renderUnknownState(carrier) {
  renderIdleMinimap();
  backBtnContainer.innerHTML = '';
  statusIcon.dataset.state = 'warning';
  statusTitle.textContent = 'Mã chưa hợp lệ';
  statusCode.textContent = carrier.code ? `Mã: ${carrier.code}` : 'Nhập mã để tra cứu';
  timeline.innerHTML = messageItem(
    'Mã không hợp lệ',
    'Vui lòng nhập mã vận đơn hoặc số điện thoại hợp lệ.',
  );
}

function renderPhoneOrders(orders) {
  renderIdleMinimap();
  if (!orders || orders.length === 0) {
    timeline.innerHTML = messageItem(
      'Không tìm thấy đơn hàng',
      'Không tìm thấy đơn hàng nào liên kết với số điện thoại này trong cơ sở dữ liệu.',
      'alert'
    );
    return;
  }

  timeline.innerHTML = orders.map((order) => {
    const codeToUse = order.client_order_code || order.order_code;
    const trackingBtnHtml = codeToUse
      ? `<button class="track-button phone-order-track-btn" data-code="${codeToUse}" style="margin-top: 10px; min-height: 32px; padding: 0 14px; font-size: 12px; border-radius: 999px; background: var(--ink); color: var(--white); border: 0; cursor: pointer; font-weight: 800; display: inline-flex; align-items: center; justify-content: center; gap: 4px;">Theo dõi hành trình</button>`
      : '';
    const codStr = order.cod_amount ? `${Number(order.cod_amount).toLocaleString('vi-VN')}đ` : '0đ';
    const feeStr = order.total_fee ? `${Number(order.total_fee).toLocaleString('vi-VN')}đ` : '0đ';
    const orderTitle = order.client_order_code
      ? `${order.client_order_code} (${order.order_code})`
      : order.order_code;

    return `
      <li class="timeline__item phone-order-card" style="display: block; padding: 14px; background: #fff8f5; border: 1px solid #efd2c8; border-radius: 18px; margin-bottom: 12px; box-shadow: 0 2px 4px rgba(82, 51, 42, 0.04);">
        <div style="display: flex; justify-content: space-between; align-items: center; margin-bottom: 6px; flex-wrap: wrap; gap: 8px;">
          <strong style="font-size: 14px; color: var(--ink); margin-bottom: 0;">${orderTitle}</strong>
          <span class="code-pill" style="font-size: 11px; padding: 4px 8px; background: var(--beige); color: #6f554b; max-width: none; flex: 0 0 auto;">${order.status}</span>
        </div>
        <div style="font-size: 12px; color: var(--muted); line-height: 1.5; margin-bottom: 4px;">
          <div><b>Người nhận:</b> ${order.to_name || 'Chưa cập nhật'}</div>
          <div><b>Địa chỉ:</b> ${order.to_address || 'Chưa cập nhật'}</div>
          <div><b>Ngày đặt:</b> ${order.order_date || 'Chưa cập nhật'}</div>
          <div style="margin-top: 4px; display: flex; flex-wrap: wrap; gap: 12px;">
            <span><b>Thu hộ (COD):</b> ${codStr}</span>
            <span><b>Tổng phí:</b> ${feeStr}</span>
          </div>
        </div>
        ${trackingBtnHtml}
      </li>
    `;
  }).join('');

  // Attach event listener to all "Theo dõi hành trình" buttons
  const buttons = timeline.querySelectorAll('.phone-order-track-btn');
  buttons.forEach(btn => {
    btn.addEventListener('click', (e) => {
      e.preventDefault();
      const code = btn.getAttribute('data-code');
      trackCurrentCode(code, { reuseLastCaptcha: true });
    });
  });
}

function renderIdleTrackingState() {
  backBtnContainer.innerHTML = '';
  statusIcon.dataset.state = 'success';
  statusTitle.textContent = 'Sẵn sàng tra cứu';
  statusCode.textContent = 'Nhập mã để tra cứu';
  timeline.innerHTML = [
    messageItem(
      'Nhập mã vận đơn',
      'Điền mã vận đơn hoặc số điện thoại để hiển thị trạng thái đơn hàng theo thời gian thực.',
      'check',
    ),
    messageItem(
      'Theo dõi hành trình',
      'Khu vực này sẽ hiển thị các mốc vận chuyển, ghi chú giao hàng và trạng thái cập nhật mới nhất.',
      'truck',
    ),
  ].join('');
}

async function renderApiResult(result) {
  const carrier = result.carrier;
  const preparedResult = result?.type === 'live'
    ? {
        ...result,
        events: prepareVisibleTimelineEvents(result),
      }
    : result;

  if (preparedResult.ok && preparedResult.type === 'phone') {
    activeResultCode = cleanLookupCode(preparedResult.phone || preparedResult.code);
    lastPhoneSearchResult = preparedResult;
    backBtnContainer.innerHTML = '';
    statusIcon.dataset.state = 'success';
    statusTitle.textContent = `Tìm thấy ${preparedResult.orders.length} đơn hàng`;
    statusCode.textContent = `SĐT: ${preparedResult.phone}`;
    renderPhoneOrders(preparedResult.orders);
    helperText.innerHTML = `Đã tìm kiếm thành công danh sách đơn hàng cho SĐT ${preparedResult.phone}.`;
    return;
  }

  const isLive = preparedResult.ok && preparedResult.type === 'live';
  activeResultCode = cleanLookupCode(preparedResult.clientOrderCode || preparedResult.code);

  statusIcon.dataset.state = isLive ? 'success' : 'warning';
  statusTitle.textContent = isLive ? `Mã đơn ${preparedResult.clientOrderCode || preparedResult.code}` : preparedResult.status || 'Chưa lấy được dữ liệu';
  statusCode.textContent = isLive ? '' : `Mã: ${preparedResult.code}`;
  
  if (!preparedResult.ok && preparedResult.events) {
    preparedResult.events.forEach(evt => {
      evt.detail = cleanErrorMessage(evt.detail);
    });
  }

  renderTimelineFromEvents(preparedResult.events, carrier);
  await renderRoadJourneyMap(preparedResult);

  const cleanMsg = cleanErrorMessage(preparedResult.message);
  helperText.innerHTML = isLive
    ? `${cleanMsg || 'Đã lấy dữ liệu hành trình.'}`
    : `${cleanMsg || 'Chưa thể lấy dữ liệu.'}${preparedResult.lookupUrl ? ` · <a href="${preparedResult.lookupUrl}" target="_blank" rel="noreferrer">Tra cứu bên ngoài</a>` : ''}`;
}

function updateDetection(rawCode) {
  const carrier = detectCarrier(cleanLookupCode(rawCode));
  const hasCode = carrier.code.length > 0;
  const isDetected = carrier.confidence === 'high';
  const cleanCode = cleanLookupCode(carrier.code);
  const shouldPreserveCurrentResult = hasCode && activeResultCode && (
    cleanCode === activeResultCode ||
    (lastPhoneSearchResult && cleanCode === cleanLookupCode(lastPhoneSearchResult.phone))
  );

  helperText.textContent =
    isDetected
      ? `Đã nhận mã ${carrier.code}.`
      : hasCode
        ? 'Mã chưa hợp lệ. Vui lòng nhập mã vận đơn hoặc số điện thoại.'
        : 'Nhập mã vận đơn hoặc số điện thoại để tra cứu trạng thái.';

  resultGrid.hidden = false;
  detectAlert.hidden = !hasCode || isDetected;

  if (shouldPreserveCurrentResult) {
    return carrier;
  }

  if (!hasCode) {
    activeResultCode = '';
    lastPhoneSearchResult = null;
    renderIdleTrackingState();
    renderIdleMinimap();
  }

  if (hasCode) {
    if (isDetected) {
      renderReadyState(carrier);
    } else {
      renderUnknownState(carrier);
    }
  }

  return carrier;
}

function askJntPhone() {
  return new Promise((resolve) => {
    const modal = document.getElementById('jnt-modal');
    const phoneInput = document.getElementById('jnt-phone-input');
    const cancelBtn = document.getElementById('jnt-modal-cancel');
    const confirmBtn = document.getElementById('jnt-modal-confirm');

    phoneInput.value = '';
    phoneInput.style.borderColor = '';
    modal.hidden = false;
    phoneInput.focus();

    function cleanUp() {
      modal.hidden = true;
      cancelBtn.removeEventListener('click', onCancel);
      confirmBtn.removeEventListener('click', onConfirm);
      phoneInput.removeEventListener('keydown', onKeyDown);
      phoneInput.removeEventListener('input', onInput);
    }

    function onCancel() {
      cleanUp();
      resolve(null);
    }

    function onConfirm() {
      const val = phoneInput.value.trim();
      if (/^\d{4}$/.test(val)) {
        cleanUp();
        resolve(val);
      } else {
        phoneInput.style.borderColor = 'var(--rose)';
        phoneInput.animate([
          { transform: 'translateX(-5px)' },
          { transform: 'translateX(5px)' },
          { transform: 'translateX(-5px)' },
          { transform: 'translateX(0)' }
        ], { duration: 150 });
      }
    }

    function onKeyDown(e) {
      if (e.key === 'Enter') {
        onConfirm();
      } else if (e.key === 'Escape') {
        onCancel();
      }
    }

    function onInput() {
      phoneInput.style.borderColor = '';
    }

    cancelBtn.addEventListener('click', onCancel);
    confirmBtn.addEventListener('click', onConfirm);
    phoneInput.addEventListener('keydown', onKeyDown);
    phoneInput.addEventListener('input', onInput);
  });
}

async function fetchCaptcha() {
  const url = new URL('/api/captcha/generate', apiBaseUrl());
  const response = await fetch(url);
  const data = await response.json().catch(() => null);

  if (!response.ok || !data?.svg || !data?.timestamp || !data?.token) {
    throw new Error(data?.message || data?.errorMessage || 'Không tải được mã xác minh.');
  }

  return data;
}

async function createLocalCaptcha() {
  const answer = Array.from({ length: 4 }, () => Math.floor(Math.random() * 10)).join('');
  const timestamp = Date.now();
  const source = `${answer}:${timestamp}:${CLIENT_CAPTCHA_SALT}`;
  const bytes = new TextEncoder().encode(source);
  const digest = await crypto.subtle.digest('SHA-256', bytes);
  const token = `client:${Array.from(new Uint8Array(digest)).map((byte) => byte.toString(16).padStart(2, '0')).join('')}`;
  const width = 180;
  const height = 60;
  let svg = `<svg width="${width}" height="${height}" viewBox="0 0 ${width} ${height}" xmlns="http://www.w3.org/2000/svg" style="background:#fff8f5;border:1px solid #efd2c8;border-radius:10px;display:block;width:180px;height:60px;box-shadow:inset 0 1px 3px rgba(0,0,0,0.05);">`;

  for (let i = 0; i < 5; i++) {
    const x1 = Math.random() * width;
    const y1 = Math.random() * height;
    const x2 = Math.random() * width;
    const y2 = Math.random() * height;
    svg += `<line x1="${x1.toFixed(1)}" y1="${y1.toFixed(1)}" x2="${x2.toFixed(1)}" y2="${y2.toFixed(1)}" stroke="#e2c6ba" stroke-width="2" opacity="0.55"/>`;
  }

  for (let i = 0; i < 28; i++) {
    const cx = Math.random() * width;
    const cy = Math.random() * height;
    const r = 1 + Math.random();
    svg += `<circle cx="${cx.toFixed(1)}" cy="${cy.toFixed(1)}" r="${r.toFixed(1)}" fill="#8b6f65" opacity="0.32"/>`;
  }

  for (let i = 0; i < answer.length; i++) {
    const fontSize = 35 + Math.random() * 6;
    const x = 25 + i * 36 + Math.random() * 5;
    const y = 42 + Math.random() * 5;
    const rotate = -12 + Math.random() * 24;
    svg += `<text x="${x.toFixed(1)}" y="${y.toFixed(1)}" font-family="'Be Vietnam Pro','Inter',sans-serif" font-size="${fontSize.toFixed(1)}" font-weight="800" fill="#8b6f65" transform="rotate(${rotate.toFixed(1)} ${x.toFixed(1)} ${y.toFixed(1)})">${answer[i]}</text>`;
  }

  return { svg: `${svg}</svg>`, timestamp, token };
}

function askCaptcha() {
  return new Promise(async (resolve) => {
    const modal = document.getElementById('captcha-modal');
    const imgContainer = document.getElementById('captcha-image-container');
    const refreshBtn = document.getElementById('captcha-refresh-btn');
    const inputField = document.getElementById('captcha-input');
    const cancelBtn = document.getElementById('captcha-modal-cancel');
    const confirmBtn = document.getElementById('captcha-modal-confirm');

    inputField.value = '';
    inputField.style.borderColor = '';

    const errorMsgEl = document.getElementById('captcha-error-msg');
    errorMsgEl.textContent = '';
    errorMsgEl.style.display = 'none';

    let currentCaptcha = null;

    async function loadNewCaptcha() {
      try {
        imgContainer.innerHTML = 'Đang tải...';
        currentCaptcha = await createLocalCaptcha();
        imgContainer.innerHTML = currentCaptcha.svg;
        inputField.value = '';
        inputField.focus();
      } catch (err) {
        imgContainer.innerHTML = '<span style="font-size:12px;color:var(--rose);font-weight:700;text-align:center;padding:8px;">Lỗi tải mã</span>';
        errorMsgEl.textContent = err.message || 'Không tải được mã xác minh.';
        errorMsgEl.style.display = 'block';
      }
    }

    modal.hidden = false;
    await loadNewCaptcha();

    function cleanUp() {
      modal.hidden = true;
      cancelBtn.removeEventListener('click', onCancel);
      confirmBtn.removeEventListener('click', onConfirm);
      refreshBtn.removeEventListener('click', onRefresh);
      inputField.removeEventListener('keydown', onKeyDown);
      inputField.removeEventListener('input', onInput);
    }

    function onCancel() {
      cleanUp();
      resolve(null);
    }

    function onRefresh(e) {
      e.preventDefault();
      loadNewCaptcha();
    }

    function onConfirm() {
      const val = inputField.value.replace(/\D+/g, '');
      if (/^\d{4}$/.test(val) && currentCaptcha) {
        cleanUp();
        resolve({
          answer: val,
          timestamp: currentCaptcha.timestamp,
          token: currentCaptcha.token
        });
      } else {
        inputField.style.borderColor = 'var(--rose)';
        inputField.animate([
          { transform: 'translateX(-5px)' },
          { transform: 'translateX(5px)' },
          { transform: 'translateX(-5px)' },
          { transform: 'translateX(0)' }
        ], { duration: 150 });
      }
    }

    function onKeyDown(e) {
      if (e.key === 'Enter') {
        onConfirm();
      } else if (e.key === 'Escape') {
        onCancel();
      }
    }

    function onInput() {
      inputField.style.borderColor = '';
    }

    cancelBtn.addEventListener('click', onCancel);
    confirmBtn.addEventListener('click', onConfirm);
    refreshBtn.addEventListener('click', onRefresh);
    inputField.addEventListener('keydown', onKeyDown);
    inputField.addEventListener('input', onInput);
  });
}

async function trackCurrentCode(codeOverride = '', options = {}) {
  const hasOverride = cleanLookupCode(codeOverride).length > 0;
  if (!hasOverride) syncCleanInputValue();

  const lookupCode = hasOverride ? cleanLookupCode(codeOverride) : cleanLookupCode(input.value);
  const carrier = updateDetection(lookupCode);

  if (carrier.confidence !== 'high') return;

  let finalCode = lookupCode;

  if (lastPhoneSearchResult) {
    const cleanCode = cleanLookupCode(finalCode);
    const isSamePhone = cleanCode === cleanLookupCode(lastPhoneSearchResult.phone);
    const isRelatedOrder = lastPhoneSearchResult.orders.some(o => 
      cleanLookupCode(o.order_code) === cleanCode ||
      cleanLookupCode(o.client_order_code) === cleanCode
    );
    if (!isSamePhone && !isRelatedOrder) {
      lastPhoneSearchResult = null;
    }
  }

  if (carrier.id === 'jnt') {
    const hasSuffix = /^(\d{12})[:|-](\d{4})$/.test(cleanLookupCode(finalCode));
    if (!hasSuffix) {
      const suffix = await askJntPhone();
      if (!suffix) return; // cancel query
      finalCode = `${carrier.code}:${suffix}`;
      if (!hasOverride) input.value = finalCode;
      updateDetection(finalCode);
    }
  }

  const shouldReuseCaptcha = Boolean(options.reuseLastCaptcha && lastCaptchaProof);
  const captchaResult = shouldReuseCaptcha ? lastCaptchaProof : await askCaptcha();
  if (!captchaResult) return; // cancelled
  lastCaptchaProof = captchaResult;

  trackButton.disabled = true;
  trackButton.setAttribute('aria-busy', 'true');
  helperText.textContent = `Đang gọi ${carrier.shortName} API...`;
  timeline.innerHTML = messageItem(`Đang kiểm tra ${carrier.shortName}`, 'Vui lòng chờ trong giây lát.', 'truck');

  try {
    const url = new URL('/api/track', apiBaseUrl());
    url.searchParams.set('code', finalCode);
    url.searchParams.set('captchaAnswer', captchaResult.answer);
    url.searchParams.set('captchaTimestamp', captchaResult.timestamp);
    url.searchParams.set('captchaToken', captchaResult.token);

    const response = await fetch(url);
    const result = await response.json();

    if (!response.ok && result.type === 'captcha_error') {
      // Show inline error inside captcha modal instead of alert()
      const errorMsg = result.message || 'Mã bảo mật không chính xác. Vui lòng thử lại.';
      const captchaModal = document.getElementById('captcha-modal');
      const captchaErrorEl = document.getElementById('captcha-error-msg');
      const captchaInput = document.getElementById('captcha-input');

      captchaErrorEl.textContent = errorMsg;
      captchaErrorEl.style.display = 'block';
      captchaInput.value = '';
      captchaInput.style.borderColor = 'var(--rose)';

      // Re-trigger captcha flow to reload image and let user retry
      lastCaptchaProof = null;
      setTimeout(() => trackCurrentCode(finalCode), 100);
      return;
    }

    await renderApiResult(result);
  } catch (error) {
    const isLocal = window.location.hostname === 'localhost' || window.location.hostname === '127.0.0.1' || window.location.protocol === 'file:';
    statusIcon.dataset.state = 'warning';
    if (isLocal) {
      statusTitle.textContent = 'Không kết nối được API local';
      helperText.textContent = 'Hãy chạy server local bằng lệnh: node server.mjs, sau đó mở http://localhost:3000/index.html.';
      timeline.innerHTML = messageItem('Không kết nối được API local', error.message);
    } else {
      statusTitle.textContent = 'Không kết nối được máy chủ';
      helperText.textContent = 'Vui lòng kiểm tra lại kết nối mạng hoặc cấu hình serverless của Netlify.';
      timeline.innerHTML = messageItem('Không kết nối được máy chủ', error.message);
    }
  } finally {
    trackButton.disabled = false;
    trackButton.removeAttribute('aria-busy');
  }
}

// Leaflet Map State Variables
let leafletMap = null;
let truckMarker = null;
let destinationMarker = null;
let originMarker = null;
let checkpointMarkers = [];
let segmentPolylines = [];
let currentRouteModel = null;
let animFrameId = null;
let userLocation = null;
let fullRoutePolyline = null;
let completedRoutePolyline = null;
let remainingRoutePolyline = null;

function hideMinimap() {
  const minimapCard = document.querySelector('.minimap-card');
  if (minimapCard) minimapCard.style.display = 'flex';
  if (animFrameId) {
    cancelAnimationFrame(animFrameId);
    animFrameId = null;
  }
  if (leafletMap) {
    try {
      leafletMap.remove();
    } catch (error) {}
    leafletMap = null;
  }
  truckMarker = null;
  destinationMarker = null;
  originMarker = null;
  checkpointMarkers = [];
  segmentPolylines = [];
  currentRouteModel = null;
}

function renderIdleMinimap() {
  hideMinimap();
  const container = document.getElementById('leaflet-map-container');
  if (!container) return;

  container.innerHTML = `
    <div class="minimap-placeholder">
      <div class="minimap-placeholder__icon" aria-hidden="true">
        <svg viewBox="0 0 24 24"><path d="M12 21s7-4.4 7-11a7 7 0 0 0-14 0c0 6.6 7 11 7 11z"></path><circle cx="12" cy="10" r="2"></circle></svg>
      </div>
      <strong>Bản đồ hành trình sẽ hiển thị ở đây</strong>
      <span>Nhập mã vận đơn và bấm Tra cứu để xem vị trí hiện tại cùng lộ trình di chuyển của đơn hàng.</span>
    </div>
  `;
}

function getMarkerIconType(title) {
  const lowercaseTitle = String(title || '').toLowerCase();
  if (lowercaseTitle.includes('kho') || lowercaseTitle.includes('phân loại') || lowercaseTitle.includes('storing') || lowercaseTitle.includes('sorting')) {
    return 'warehouse';
  }
  if (lowercaseTitle.includes('thành công') || lowercaseTitle.includes('delivered') || lowercaseTitle.includes('trả hàng thành công') || lowercaseTitle.includes('returned')) {
    return 'check';
  }
  if (lowercaseTitle.includes('khởi tạo') || lowercaseTitle.includes('hàng') || lowercaseTitle.includes('box')) {
    return 'box';
  }
  return 'truck';
}

function createMapModelIcon({ markup, size = 56, anchorX, anchorY = 48 }) {
  return L.divIcon({
    html: markup,
    className: '',
    iconSize: [size, size],
    iconAnchor: [anchorX ?? size / 2, anchorY],
    popupAnchor: [0, -anchorY + 8]
  });
}

function createTruckModelIcon() {
  return createMapModelIcon({
    markup: `
      <div class="map-model map-model--truck map-truck-icon">
        <span class="map-model__shadow"></span>
        <div class="map-model__vehicle">
          <span class="map-model__vehicle-trailer"></span>
          <span class="map-model__vehicle-cab"></span>
          <span class="map-model__vehicle-window-band"></span>
          <span class="map-model__vehicle-bumper-accent"></span>
          <span class="map-model__vehicle-light map-model__vehicle-light--left"></span>
          <span class="map-model__vehicle-light map-model__vehicle-light--right"></span>
          <span class="map-model__wheel map-model__wheel--rear"></span>
          <span class="map-model__wheel map-model__wheel--front"></span>
        </div>
      </div>
    `,
    size: 50,
    anchorX: 25,
    anchorY: 44,
  });
}

function createRecipientModelIcon() {
  return createMapModelIcon({
    markup: `
      <div class="map-model map-model--recipient map-recipient-icon">
        <span class="map-model__shadow"></span>
        <div class="map-model__avatar">
          <span class="map-model__avatar-bob"></span>
          <span class="map-model__avatar-face"></span>
          <span class="map-model__avatar-fringe"></span>
          <span class="map-model__avatar-eye map-model__avatar-eye--left"></span>
          <span class="map-model__avatar-eye map-model__avatar-eye--right"></span>
          <span class="map-model__avatar-mouth"></span>
          <span class="map-model__avatar-torso"></span>
          <span class="map-model__avatar-arm map-model__avatar-arm--left"></span>
          <span class="map-model__avatar-arm map-model__avatar-arm--right"></span>
          <span class="map-model__avatar-legs"></span>
          <span class="map-model__avatar-shoes"></span>
        </div>
      </div>
    `,
    size: 50,
    anchorX: 24,
    anchorY: 44,
  });
}

function createStatusModelIcon({ modelClass, accentClass, svgMarkup }) {
  return createMapModelIcon({
    markup: `
      <div class="map-model map-model--status ${modelClass} ${accentClass}">
        <span class="map-model__shadow"></span>
        <div class="map-model__badge">
          <span class="map-model__badge-gloss"></span>
          <svg viewBox="0 0 24 24" aria-hidden="true">${svgMarkup}</svg>
        </div>
      </div>
    `,
    size: 42,
    anchorX: 21,
    anchorY: 37,
  });
}

function snapRouteEndpoints(points, start, end) {
  const latLngs = points.length ? [...points] : [[start.lat, start.lng], [end.lat, end.lng]];
  latLngs[0] = [start.lat, start.lng];
  latLngs[latLngs.length - 1] = [end.lat, end.lng];
  return latLngs;
}

function getDisplayDestinationPoint(journey) {
  if (!journey?.destination) return null;
  if (!journey.isNearDestination || !journey.current) return journey.destination;

  return {
    lat: journey.destination.lat - 0.00055,
    lng: journey.destination.lng + 0.00075,
  };
}

function fitMapToJourney(map, route, journey, displayDestination) {
  if (!map || !journey?.routeStart || !displayDestination) return;

  let isNearUser = false;
  if (userLocation) {
    const dist = getDistanceInKm(
      userLocation.lat,
      userLocation.lng,
      journey.destination.lat,
      journey.destination.lng,
    );
    if (dist <= 20) {
      isNearUser = true;
      map.setView([displayDestination.lat, displayDestination.lng], journey.isNearDestination ? 16 : 15);
    }
  }

  if (isNearUser) return;

  if (journey.isNearDestination) {
    const centerLat = (journey.routeStart.lat + displayDestination.lat) / 2;
    const centerLng = (journey.routeStart.lng + displayDestination.lng) / 2;
    map.setView([centerLat, centerLng], 15);
    return;
  }

  try {
    map.fitBounds(route.getBounds(), {
      padding: [40, 40],
      maxZoom: 14
    });
  } catch (e) {
    console.warn('Error fitting bounds, fallback to Vietnam center:', e);
    map.setView([16.047079, 108.206230], 6);
  }
}

async function renderRoadJourneyMapLegacy(result) {
  const container = document.getElementById('leaflet-map-container');
  const minimapCard = document.querySelector('.minimap-card');
  if (!container || !minimapCard) return;

  if (!result || !result.ok || result.type !== 'live' || !result.events?.length) {
    renderIdleMinimap();
    return;
  }

  minimapCard.style.display = 'flex';

  if (animFrameId) {
    cancelAnimationFrame(animFrameId);
    animFrameId = null;
  }

  if (typeof L === 'undefined') {
    container.innerHTML = '<div style="padding: 20px; text-align: center; color: var(--muted); font-size: 13px; font-weight: 500;">Đang tải thư viện bản đồ... Vui lòng thử lại sau giây lát.</div>';
    return;
  }

  if (leafletMap) {
    try {
      leafletMap.remove();
    } catch (e) {
      console.warn('Error removing map:', e);
    }
    leafletMap = null;
  }

  container.innerHTML = '<div id="minimap-coordinates-info" style="position: absolute; bottom: 10px; left: 10px; z-index: 1000; padding: 6px 12px; background: rgba(255, 255, 255, 0.85); backdrop-filter: blur(4px); border-radius: 8px; font-size: 11px; border: 1px solid var(--line); font-weight: 500; pointer-events: none; color: var(--ink);">Cuộn để thu phóng · Kéo để di chuyển</div>';

  mapTruckIcon = createTruckModelIcon();

  mapWarehouseIcon = createStatusModelIcon({
    modelClass: 'map-warehouse-model',
    accentClass: 'map-warehouse-icon',
    svgMarkup: icons.warehouse,
  });

  mapCheckIcon = createStatusModelIcon({
    modelClass: 'map-check-model',
    accentClass: 'map-check-icon',
    svgMarkup: icons.check,
  });

  mapBoxIcon = createStatusModelIcon({
    modelClass: 'map-box-model',
    accentClass: 'map-box-icon',
    svgMarkup: icons.box,
  });

  const journey = buildMapJourney(
    result,
    { lat: 21.0285, lng: 105.8542 },
    { lat: 10.8231, lng: 106.6297 },
  );

  if (!journey.current || !journey.destination) {
    renderIdleMinimap();
    return;
  }

  leafletMap = L.map(container, {
    zoomControl: false,
    attributionControl: false
  });

  leafletMap.setView([16.047079, 108.206230], 6);

  L.tileLayer('https://{s}.tile.openstreetmap.org/{z}/{x}/{y}.png', {
    maxZoom: 19
  }).addTo(leafletMap);

  L.control.zoom({
    position: 'bottomright'
  }).addTo(leafletMap);

  const recipientIcon = createRecipientModelIcon();
  const displayDestination = getDisplayDestinationPoint(journey);

  destinationMarker = L.marker([displayDestination.lat, displayDestination.lng], { icon: recipientIcon }).addTo(leafletMap);
  destinationMarker.bindPopup('<b>Vị trí người đặt (Điểm nhận)</b>');

  const currentIconType = getMarkerIconType(journey.currentTitle);
  let currentIcon = mapTruckIcon;
  if (currentIconType === 'warehouse') currentIcon = mapWarehouseIcon;
  else if (currentIconType === 'check') currentIcon = mapCheckIcon;
  else if (currentIconType === 'box') currentIcon = mapBoxIcon;

  truckMarker = L.marker([journey.routeStart.lat, journey.routeStart.lng], { icon: currentIcon, zIndexOffset: 1000 }).addTo(leafletMap);
  truckMarker.bindPopup('<b>Vị trí gửi hàng (Hiện tại)</b>');

  const routeLatLngs = snapRouteEndpoints(
    await fetchRoadRoute(fetch, journey.routeStart, journey.routeEnd),
    journey.routeStart,
    displayDestination,
  );

  routePolyline = L.polyline(routeLatLngs, {
    color: '#3b82f6',
    weight: 5,
    opacity: 0.9,
    lineJoin: 'round',
    lineCap: 'round'
  }).addTo(leafletMap);

  fitMapToJourney(leafletMap, routePolyline, journey, displayDestination);

  setTimeout(() => {
    if (leafletMap) {
      try {
        leafletMap.invalidateSize();
      } catch (e) {}
    }
  }, 250);
}

async function render3DMinimapLegacy(result) {
  const container = document.getElementById('leaflet-map-container');
  const minimapCard = document.querySelector('.minimap-card');
  if (!container || !minimapCard) return;

  // Hide the card if the result is invalid or not live
  if (!result || !result.ok || result.type !== 'live' || !result.events?.length) {
    renderIdleMinimap();
    return;
  }

  // Display the card
  minimapCard.style.display = 'flex';

  // Stop previous animation loop
  if (animFrameId) {
    cancelAnimationFrame(animFrameId);
    animFrameId = null;
  }

  // Check if Leaflet is loaded
  if (typeof L === 'undefined') {
    container.innerHTML = '<div style="padding: 20px; text-align: center; color: var(--muted); font-size: 13px; font-weight: 500;">Đang tải thư viện bản đồ... Vui lòng thử lại sau giây lát.</div>';
    return;
  }

  // Clean up previous map instance if any
  if (leafletMap) {
    try {
      leafletMap.remove();
    } catch (e) {
      console.warn('Error removing map:', e);
    }
    leafletMap = null;
  }
  container.innerHTML = '<div id="minimap-coordinates-info" style="position: absolute; bottom: 10px; left: 10px; z-index: 1000; padding: 6px 12px; background: rgba(255, 255, 255, 0.85); backdrop-filter: blur(4px); border-radius: 8px; font-size: 11px; border: 1px solid var(--line); font-weight: 500; pointer-events: none; color: var(--ink);">Cuộn để thu phóng · Kéo để di chuyển</div>';

  // Initialize Custom Marker Icons
  mapTruckIcon = L.divIcon({
    html: `<div class="map-truck-icon" style="display:flex;align-items:center;justify-content:center;width:32px;height:32px;background:var(--ink);border-radius:50%;border:2px solid var(--white);box-shadow:0 3px 6px rgba(0,0,0,0.16);color:var(--white);"><svg viewBox="0 0 24 24" style="width:16px;height:16px;stroke:currentColor;fill:none;stroke-width:2.2;">${icons.truck}</svg></div>`,
    className: '',
    iconSize: [32, 32],
    iconAnchor: [16, 16]
  });

  mapWarehouseIcon = L.divIcon({
    html: `<div class="map-warehouse-icon" style="display:flex;align-items:center;justify-content:center;width:32px;height:32px;background:#8b6f65;border-radius:50%;border:2px solid var(--white);box-shadow:0 3px 6px rgba(0,0,0,0.16);color:var(--white);"><svg viewBox="0 0 24 24" style="width:16px;height:16px;stroke:currentColor;fill:none;stroke-width:2.2;">${icons.warehouse}</svg></div>`,
    className: '',
    iconSize: [32, 32],
    iconAnchor: [16, 16]
  });

  mapCheckIcon = L.divIcon({
    html: `<div class="map-check-icon" style="display:flex;align-items:center;justify-content:center;width:32px;height:32px;background:var(--green);border-radius:50%;border:2px solid var(--white);box-shadow:0 3px 6px rgba(0,0,0,0.16);color:var(--white);"><svg viewBox="0 0 24 24" style="width:16px;height:16px;stroke:currentColor;fill:none;stroke-width:2.2;">${icons.check}</svg></div>`,
    className: '',
    iconSize: [32, 32],
    iconAnchor: [16, 16]
  });

  mapBoxIcon = L.divIcon({
    html: `<div class="map-box-icon" style="display:flex;align-items:center;justify-content:center;width:32px;height:32px;background:#c39f91;border-radius:50%;border:2px solid var(--white);box-shadow:0 3px 6px rgba(0,0,0,0.16);color:var(--white);"><svg viewBox="0 0 24 24" style="width:16px;height:16px;stroke:currentColor;fill:none;stroke-width:2.2;">${icons.box}</svg></div>`,
    className: '',
    iconSize: [32, 32],
    iconAnchor: [16, 16]
  });

  // Chronological events
  const fallbackOrigin = { lat: 21.0285, lng: 105.8542 };

  const fallbackDestination = { lat: 10.8231, lng: 106.6297 };
  const journey = buildMapJourney(result, fallbackOrigin, fallbackDestination);

  if (!journey.current || !journey.destination) {
    renderIdleMinimap();
    return;
  }

  let startLat = journey.current.lat;
  let startLng = journey.current.lng;
  let endLat = journey.destination.lat;
  let endLng = journey.destination.lng;

  points.push({ lat: startLat, lng: startLng, name: 'Điểm gửi hàng' });

  // Add coordinates from events
  chronoEvents.forEach((evt) => {
    if (evt.lat && evt.lng) {
      points.push({ lat: evt.lat, lng: evt.lng, name: evt.title });
    }
  });

  // Generate simulated points if no intermediate GPS data is present
  const realIntermediates = points.length - 1;
  if (realIntermediates === 0 && chronoEvents.length > 0) {
    chronoEvents.forEach((evt, idx) => {
      const t = (idx + 1) / (chronoEvents.length + 1);
      const lat = startLat + (endLat - startLat) * t;
      const lng = startLng + (endLng - startLng) * t + Math.sin(t * Math.PI) * 0.12;
      points.push({ lat, lng, name: evt.title });
      evt.lat = lat;
      evt.lng = lng;
    });
  }

  points.push({ lat: endLat, lng: endLng, name: 'Điểm nhận hàng' });

  // Initialize Leaflet Map
  leafletMap = L.map(container, {
    zoomControl: false,
    attributionControl: false
  });

  // Center map on Vietnam initially
  leafletMap.setView([16.047079, 108.206230], 6);

  // Add standard OpenStreetMap tiles
  L.tileLayer('https://{s}.tile.openstreetmap.org/{z}/{x}/{y}.png', {
    maxZoom: 19
  }).addTo(leafletMap);

  // Add Zoom control at bottom right
  L.control.zoom({
    position: 'bottomright'
  }).addTo(leafletMap);

  // Define Custom Icons
  const originIcon = L.divIcon({
    html: `<div class="map-origin-icon" style="display:flex;align-items:center;justify-content:center;width:28px;height:28px;background:var(--green);border-radius:50%;border:2px solid var(--white);box-shadow:0 3px 6px rgba(0,0,0,0.16);color:var(--white);"><svg viewBox="0 0 24 24" style="width:14px;height:14px;stroke:currentColor;fill:none;stroke-width:2.5;"><path d="M3 9l9-5 9 5-9 5z"></path><path d="M3 15l9 5 9-5"></path></svg></div>`,
    className: '',
    iconSize: [28, 28],
    iconAnchor: [14, 14]
  });

  const recipientIcon = L.divIcon({
    html: `<div class="map-recipient-icon" style="display:flex;align-items:center;justify-content:center;width:28px;height:28px;background:var(--rose);border-radius:50%;border:2px solid var(--white);box-shadow:0 3px 6px rgba(0,0,0,0.16);color:var(--white);"><svg viewBox="0 0 24 24" style="width:14px;height:14px;stroke:currentColor;fill:none;stroke-width:2.5;"><path d="M20 21v-2a4 4 0 0 0-4-4H8a4 4 0 0 0-4 4v2"></path><circle cx="12" cy="7" r="4"></circle></svg></div>`,
    className: '',
    iconSize: [28, 28],
    iconAnchor: [14, 14]
  });

  const waypointIcon = L.divIcon({
    html: `<div class="map-waypoint-icon" style="width:12px;height:12px;background:var(--muted);border-radius:50%;border:2px solid var(--white);box-shadow:0 2px 4px rgba(0,0,0,0.12);"></div>`,
    className: '',
    iconSize: [12, 12],
    iconAnchor: [6, 6]
  });

  // Plot Destination (Recipient/Buyer)
  destinationMarker = L.marker([endLat, endLng], { icon: recipientIcon }).addTo(leafletMap);
  destinationMarker.bindPopup('<b>Vị trí người đặt (Điểm nhận)</b>');

  // Setup Moving Truck Marker (represents the current package / sender position)
  // We initialize it at the oldest event position (or start position) so it animates towards the target (latest event) on load
  const startEvent = { lat: startLat, lng: startLng, title: journey.currentTitle };
  animCurrentLat = startEvent.lat || startLat;
  animCurrentLng = startEvent.lng || startLng;

  const startIconType = getMarkerIconType(startEvent.title);
  let startIcon = mapTruckIcon;
  if (startIconType === 'warehouse') startIcon = mapWarehouseIcon;
  else if (startIconType === 'check') startIcon = mapCheckIcon;
  else if (startIconType === 'box') startIcon = mapBoxIcon;

  truckMarker = L.marker([animCurrentLat, animCurrentLng], { icon: startIcon, zIndexOffset: 1000 }).addTo(leafletMap);
  truckMarker.bindPopup('<b>Vị trí gửi hàng (Hiện tại)</b>');

  // Draw Journey Path (Polyline) as a straight solid line from current package position to destination
  routePolyline = L.polyline([
    [animCurrentLat, animCurrentLng],
    [endLat, endLng]
  ], {
    color: '#3b82f6',
    weight: 5,
    opacity: 0.9,
    lineJoin: 'round'
  }).addTo(leafletMap);

  const targetEvent = { lat: startLat, lng: startLng, title: journey.currentTitle };
  animTargetLat = targetEvent.lat || endLat;
  animTargetLng = targetEvent.lng || endLng;

  const targetIconType = getMarkerIconType(targetEvent.title);
  let targetIcon = mapTruckIcon;
  if (targetIconType === 'warehouse') targetIcon = mapWarehouseIcon;
  else if (targetIconType === 'check') targetIcon = mapCheckIcon;
  else if (targetIconType === 'box') targetIcon = mapBoxIcon;

  truckMarker.setIcon(targetIcon);

  // Zoom logic based on user proximity
  let isNearUser = false;
  if (userLocation) {
    const dist = getDistanceInKm(userLocation.lat, userLocation.lng, endLat, endLng);
    if (dist <= 20) { // If order destination is within 20km of the user
      isNearUser = true;
      leafletMap.setView([endLat, endLng], 15); // Zoom close to the destination
    }
  }

  if (!isNearUser) {
    // Fit bounds to show the entire route with padding
    try {
      leafletMap.fitBounds(routePolyline.getBounds(), {
        padding: [40, 40],
        maxZoom: 14
      });
    } catch (e) {
      console.warn('Error fitting bounds, fallback to Vietnam center:', e);
      leafletMap.setView([16.047079, 108.206230], 6);
    }
  }

  // Animation Loop for Smooth Truck Movement & Polyline Start Point Update
  function tick() {
    animFrameId = requestAnimationFrame(tick);

    const dLat = animTargetLat - animCurrentLat;
    const dLng = animTargetLng - animCurrentLng;

    if (Math.abs(dLat) > 0.00001 || Math.abs(dLng) > 0.00001) {
      animCurrentLat += dLat * 0.08;
      animCurrentLng += dLng * 0.08;
      truckMarker.setLatLng([animCurrentLat, animCurrentLng]);
    } else {
      animCurrentLat = animTargetLat;
      animCurrentLng = animTargetLng;
      truckMarker.setLatLng([animTargetLat, animTargetLng]);
    }

    if (routePolyline) {
      routePolyline.setLatLngs([
        [animCurrentLat, animCurrentLng],
        [endLat, endLng]
      ]);
    }
  }
  tick();

  // Handle map resize triggers
  setTimeout(() => {
    if (leafletMap) {
      try {
        leafletMap.invalidateSize();
      } catch (e) {}
    }
  }, 250);
}

function setActiveTimelineItem(index) {
  const items = timeline.querySelectorAll('[data-timeline-event]');
  items.forEach((item) => {
    item.classList.toggle('active-event', Number(item.dataset.timelineIndex) === Number(index));
  });
}

function createEmojiMarkerIcon({ emoji, className }) {
  return L.divIcon({
    html: `<span class="map-emoji-marker ${className}">${emoji}</span>`,
    className: 'map-emoji-marker-wrap',
    iconSize: [42, 42],
    iconAnchor: [21, 21],
    popupAnchor: [0, -18],
  });
}

function createDeliveredRecipientIcon() {
  return L.divIcon({
    html: `<span class="map-emoji-marker map-emoji-marker--recipient map-emoji-marker--recipient-delivered"><span class="map-emoji-marker__duo"><span>🤵‍♂️</span><span>📦</span></span></span>`,
    className: 'map-emoji-marker-wrap',
    iconSize: [54, 42],
    iconAnchor: [27, 21],
    popupAnchor: [0, -18],
  });
}

function createCheckpointIcon(status = 'upcoming') {
  return L.divIcon({
    html: `<span class="map-checkpoint-dot map-checkpoint-dot--${status}"></span>`,
    className: 'map-checkpoint-dot-wrap',
    iconSize: [16, 16],
    iconAnchor: [8, 8],
  });
}

function pointsSignature(points) {
  return points
    .map((point) => {
      if (Array.isArray(point)) {
        const [lat, lng] = point;
        return `${Number(lat).toFixed(5)},${Number(lng).toFixed(5)}`;
      }

      return `${Number(point.lat).toFixed(5)},${Number(point.lng).toFixed(5)}`;
    })
    .join('|');
}

function normalizeStatusText(value) {
  return String(value || '')
    .normalize('NFD')
    .replace(/\p{Diacritic}/gu, '')
    .toLowerCase();
}

function isDeliveredResult(result, journey) {
  const candidates = [
    result?.status,
    result?.events?.[0]?.title,
    journey?.currentCheckpoint?.title,
  ]
    .filter(Boolean)
    .map(normalizeStatusText);

  return candidates.some((text) =>
    text.includes('giao thanh cong') ||
    text.includes('da tra') ||
    text.includes('delivered') ||
    text.includes('returned')
  );
}

function fitMarkerViewport(map, markerDisplayState) {
  if (!map || !markerDisplayState) return;

  const focusPoints = buildViewportFocusPoints(markerDisplayState);
  if (!focusPoints.length) return;

  if (focusPoints.length === 1 || markerDisplayState.hasVisualSeparation) {
    map.fitBounds(L.latLngBounds(focusPoints), {
      padding: [72, 72],
      maxZoom: 17,
    });
    return;
  }

  map.fitBounds(L.latLngBounds(focusPoints), {
    padding: [56, 56],
    maxZoom: 15,
  });
}

function getRouteLineStyle(kind) {
  if (kind === 'completed') {
    return { color: '#b79f95', weight: 6, opacity: 0.35 };
  }
  if (kind === 'remaining') {
    return { color: '#d89a83', weight: 6, opacity: 0.9 };
  }
  return { color: '#e7cfc4', weight: 7, opacity: 0.95 };
}

function getCheckpointVisualState(stepIndex) {
  if (!currentRouteModel?.manager) return 'upcoming';
  if (stepIndex < currentRouteModel.manager.activeStepIndex) return 'completed';
  if (stepIndex === currentRouteModel.manager.activeStepIndex) return 'active';
  return 'upcoming';
}

function createRouteStepMarkerIcon(step) {
  if (step.phase === 'order_created') {
    return createEmojiMarkerIcon({ emoji: '🚚📦', className: 'map-emoji-marker--truck map-emoji-marker--origin' });
  }

  if (step.phase === 'delivered') {
    return createDeliveredRecipientIcon();
  }

  return createCheckpointIcon(getCheckpointVisualState(step.stepIndex));
}

function buildStepPopup(step) {
  const detail = [step.time, step.detail].filter(Boolean).join(' · ');
  if (step.phase === 'delivered') {
    const cod = currentRouteModel?.result?.cod_amount
      ? `<br>COD: ${Number(currentRouteModel.result.cod_amount).toLocaleString('vi-VN')}đ`
      : '';
    return `<b>Giao thành công</b><br>${detail || 'Đơn hàng đã được giao thành công.'}${cod}`;
  }

  return `<b>${step.title}</b><br>${detail || 'Bấm để xem vị trí trên bản đồ.'}`;
}

function findTimelineIndexForStep(stepIndex) {
  return currentRouteModel?.timelineSteps?.findIndex((step) => step.stepIndex === stepIndex) ?? -1;
}

function updateTimelineState(stepIndex) {
  const items = Array.from(timeline.querySelectorAll('[data-timeline-event]'));
  const activeTimelineIndex = currentRouteModel.timelineSteps.findIndex((step) => step.stepIndex === stepIndex);

  items.forEach((item) => {
    const itemIndex = Number(item.dataset.timelineIndex);
    item.classList.toggle('active-event', itemIndex === activeTimelineIndex);
    item.classList.toggle('timeline__item--past', itemIndex > activeTimelineIndex);
    item.classList.toggle('timeline__item--current', itemIndex === activeTimelineIndex);
    item.classList.toggle('timeline__item--future', itemIndex < activeTimelineIndex);
  });

  const activeItem = items.find((item) => Number(item.dataset.timelineIndex) === activeTimelineIndex);
  activeItem?.scrollIntoView({ block: 'nearest', behavior: 'smooth' });
}

function updateCheckpointMarkerStates() {
  for (const entry of checkpointMarkers) {
    entry.marker.setIcon(createRouteStepMarkerIcon(entry.step));
  }
}

function updateRoutePolylines(stepIndex) {
  if (!currentRouteModel?.manager) return;
  const routePaths = currentRouteModel.manager.updateCompletedPath(stepIndex);

  if (fullRoutePolyline) fullRoutePolyline.setLatLngs(routePaths.full);
  if (completedRoutePolyline) completedRoutePolyline.setLatLngs(routePaths.completed);
  if (remainingRoutePolyline) remainingRoutePolyline.setLatLngs(routePaths.remaining);
}

function animateMarkerTo(marker, targetPoint, options = {}) {
  const { duration = 1200, onFrame = null, onDone = null } = options;
  if (!marker || !targetPoint) {
    onDone?.();
    return;
  }

  if (animFrameId) {
    cancelAnimationFrame(animFrameId);
    animFrameId = null;
  }

  const start = marker.getLatLng();
  const startLat = start.lat;
  const startLng = start.lng;
  const targetLat = targetPoint.lat;
  const targetLng = targetPoint.lng;
  const startedAt = performance.now();

  const tick = (now) => {
    const progress = Math.min(1, (now - startedAt) / duration);
    const eased = 1 - ((1 - progress) ** 3);
    const nextLat = startLat + ((targetLat - startLat) * eased);
    const nextLng = startLng + ((targetLng - startLng) * eased);
    marker.setLatLng([nextLat, nextLng]);
    onFrame?.({ lat: nextLat, lng: nextLng }, progress);

    if (progress < 1) {
      animFrameId = requestAnimationFrame(tick);
      return;
    }

    animFrameId = null;
    onDone?.();
  };

  animFrameId = requestAnimationFrame(tick);
}

function applyRouteFocus(routeModel, focusedTimelineIndex = null) {
  if (!leafletMap || !routeModel?.manager) return;

  const targetTimelineIndex = focusedTimelineIndex ?? 0;
  const targetTimelineStep = routeModel.timelineSteps[targetTimelineIndex];
  if (!targetTimelineStep) return;

  const moveState = routeModel.manager.moveVehicleToStep(targetTimelineStep.stepIndex);
  const markerState = routeModel.manager.updateMarkerStates(targetTimelineStep.stepIndex);

  updateTimelineState(targetTimelineStep.stepIndex);
  updateCheckpointMarkerStates();
  updateRoutePolylines(targetTimelineStep.stepIndex);

  const applyDisplayState = (animatedPoint = null) => {
    const displayState = buildMarkerDisplayState(
      animatedPoint || moveState.truckPoint,
      markerState.recipientPoint,
      { delivered: markerState.delivered },
    );

    if (destinationMarker && displayState.recipientDisplayPoint) {
      destinationMarker.setLatLng([
        displayState.recipientDisplayPoint.lat,
        displayState.recipientDisplayPoint.lng,
      ]);
    }

    fitMarkerViewport(leafletMap, {
      ...displayState,
      originDisplayPoint: routeModel.originPoint,
    });
  };

  if (destinationMarker) {
    destinationMarker.setIcon(
      markerState.delivered
        ? createDeliveredRecipientIcon()
        : createEmojiMarkerIcon({ emoji: '🤵‍♂️', className: 'map-emoji-marker--recipient' }),
    );
  }

  if (truckMarker) {
    truckMarker.setIcon(createEmojiMarkerIcon({
      emoji: markerState.truckEmoji,
      className: 'map-emoji-marker--truck',
    }));

    animateMarkerTo(truckMarker, markerState.truckDisplayPoint, {
      duration: 1200,
      onFrame: (point) => applyDisplayState(point),
      onDone: () => applyDisplayState(markerState.truckDisplayPoint),
    });
  }

  const checkpointEntry = checkpointMarkers.find((entry) => entry.timelineIndex === targetTimelineIndex);
  if (checkpointEntry) {
    checkpointEntry.marker.openPopup();
    return;
  }

  if (targetTimelineStep.phase === 'order_created') {
    originMarker?.openPopup();
    return;
  }

  if (targetTimelineStep.phase === 'delivered') {
    destinationMarker?.openPopup();
  }
}

function focusTimelineCheckpoint(index) {
  if (!leafletMap || !currentRouteModel) return;
  applyRouteFocus(currentRouteModel, index);
}

function bindTimelineMapFocus() {
  const items = timeline.querySelectorAll('[data-timeline-event][data-lat][data-lng]');
  items.forEach((item) => {
    item.addEventListener('click', () => {
      focusTimelineCheckpoint(Number(item.dataset.timelineIndex));
    });
  });
}

async function renderSegmentedJourney(journey) {
  const manager = createTrackingRouteManager(currentRouteModel.result, {
    fallbackOrigin: journey.origin,
    fallbackDestination: journey.destination,
  });
  currentRouteModel.manager = manager;
  currentRouteModel.timelineSteps = manager.timelineSteps;
  currentRouteModel.originPoint = manager.model.origin;

  const routeSegments = [];
  for (let index = 0; index < manager.model.routePoints.length - 1; index += 1) {
    const from = manager.model.routePoints[index];
    const to = manager.model.routePoints[index + 1];
    const routePoints = snapRouteEndpoints(
      await fetchRoadRoute(fetch, from, to),
      from,
      to,
    );
    routeSegments.push(...routePoints.map((point) => Array.isArray(point) ? point : [point.lat, point.lng]));
  }

  const dedupedRoute = [];
  for (const point of routeSegments) {
    const last = dedupedRoute[dedupedRoute.length - 1];
    if (!last || last[0] !== point[0] || last[1] !== point[1]) {
      dedupedRoute.push(point);
    }
  }

  fullRoutePolyline = L.polyline(dedupedRoute, {
    ...getRouteLineStyle('base'),
    lineJoin: 'round',
    lineCap: 'round',
  }).addTo(leafletMap);

  completedRoutePolyline = L.polyline([], {
    ...getRouteLineStyle('completed'),
    lineJoin: 'round',
    lineCap: 'round',
  }).addTo(leafletMap);

  remainingRoutePolyline = L.polyline([], {
    ...getRouteLineStyle('remaining'),
    lineJoin: 'round',
    lineCap: 'round',
  }).addTo(leafletMap);

  checkpointMarkers = manager.timelineSteps
    .filter((step) => step.phase !== 'order_created' && step.phase !== 'delivered')
    .map((step, visualIndex) => {
      const timelineIndex = manager.timelineSteps.findIndex((entry) => entry.stepIndex === step.stepIndex);
      const marker = L.marker([step.point.lat, step.point.lng], {
        icon: createRouteStepMarkerIcon(step),
        zIndexOffset: 300 + visualIndex,
      }).addTo(leafletMap);

      marker.bindPopup(buildStepPopup(step));
      marker.on('click', () => focusTimelineCheckpoint(timelineIndex));

      return { timelineIndex, marker, step };
    });

  const orderCreatedStep = manager.timelineSteps.find((step) => step.phase === 'order_created');
  if (orderCreatedStep && originMarker) {
    originMarker.on('click', () => {
      focusTimelineCheckpoint(findTimelineIndexForStep(orderCreatedStep.stepIndex));
      originMarker.openPopup();
    });
  }

  const deliveredStep = manager.timelineSteps.find((step) => step.phase === 'delivered');
  if (deliveredStep && destinationMarker) {
    destinationMarker.bindPopup(buildStepPopup(deliveredStep));
    destinationMarker.on('click', () => {
      focusTimelineCheckpoint(findTimelineIndexForStep(deliveredStep.stepIndex));
      destinationMarker.openPopup();
    });
  }
}

function fitSegmentedJourney(map) {
  if (!map || !currentRouteModel?.manager) return;
  const markerState = currentRouteModel.manager.updateMarkerStates(currentRouteModel.manager.activeStepIndex);
  fitMarkerViewport(map, {
    truckDisplayPoint: markerState.truckDisplayPoint,
    recipientDisplayPoint: markerState.recipientDisplayPoint,
    originDisplayPoint: currentRouteModel.originPoint,
    hasVisualSeparation: markerState.hasVisualSeparation,
  });
}

async function renderRoadJourneyMap(result) {
  const container = document.getElementById('leaflet-map-container');
  const minimapCard = document.querySelector('.minimap-card');
  if (!container || !minimapCard) return;

  if (!result || !result.ok || result.type !== 'live' || !result.events?.length) {
    renderIdleMinimap();
    return;
  }

  minimapCard.style.display = 'flex';

  if (typeof L === 'undefined') {
    container.innerHTML = '<div style="padding: 20px; text-align: center; color: var(--muted); font-size: 13px; font-weight: 500;">Dang tai thu vien ban do... Vui long thu lai sau giay lat.</div>';
    return;
  }

  hideMinimap();
  container.innerHTML = '<div id="minimap-coordinates-info" style="position: absolute; bottom: 10px; left: 10px; z-index: 1000; padding: 6px 12px; background: rgba(255, 255, 255, 0.85); backdrop-filter: blur(4px); border-radius: 8px; font-size: 11px; border: 1px solid var(--line); font-weight: 500; pointer-events: none; color: var(--ink);">Cuộn để thu phóng · Kéo để di chuyển</div>';

  const journey = buildMapJourney(
    result,
    { lat: 21.0285, lng: 105.8542 },
    { lat: 10.8231, lng: 106.6297 },
  );

  if (!journey.current || !journey.destination) {
    renderIdleMinimap();
    return;
  }

  leafletMap = L.map(container, {
    zoomControl: false,
    attributionControl: false,
  });

  leafletMap.setView([16.047079, 108.206230], 6);

  L.tileLayer('https://{s}.tile.openstreetmap.org/{z}/{x}/{y}.png', {
    maxZoom: 19,
  }).addTo(leafletMap);

  L.control.zoom({
    position: 'bottomright',
  }).addTo(leafletMap);

  const truckIcon = createEmojiMarkerIcon({ emoji: '🚚📦', className: 'map-emoji-marker--truck' });
  const deliveredTruckIcon = createEmojiMarkerIcon({ emoji: '🚚', className: 'map-emoji-marker--truck' });
  const recipientIcon = createEmojiMarkerIcon({ emoji: '🤵‍♂️', className: 'map-emoji-marker--recipient' });
  const deliveredRecipientIcon = createDeliveredRecipientIcon();
  const isDeliveredJourney = isDeliveredResult(result, journey);

  currentRouteModel = {
    result,
    journey,
    manager: null,
    timelineSteps: [],
    originPoint: journey.origin,
  };

  const markerDisplayState = buildMarkerDisplayState(journey.current, journey.destination, { delivered: isDeliveredJourney });

  originMarker = L.marker([journey.origin.lat, journey.origin.lng], {
    icon: createEmojiMarkerIcon({ emoji: '🚚📦', className: 'map-emoji-marker--truck map-emoji-marker--origin' }),
    zIndexOffset: 200,
  }).addTo(leafletMap);
  originMarker.bindPopup('<b>Kho gửi hàng</b>');

  destinationMarker = L.marker([markerDisplayState.recipientDisplayPoint.lat, markerDisplayState.recipientDisplayPoint.lng], {
    icon: isDeliveredJourney ? deliveredRecipientIcon : recipientIcon,
    zIndexOffset: 500,
  }).addTo(leafletMap);
  destinationMarker.bindPopup(isDeliveredJourney ? '<b>✓ Người nhận đã nhận hàng</b>' : '<b>Vị trí người nhận</b>');

  truckMarker = markerDisplayState.truckDisplayPoint
    ? L.marker([markerDisplayState.truckDisplayPoint.lat, markerDisplayState.truckDisplayPoint.lng], {
        icon: isDeliveredJourney ? deliveredTruckIcon : truckIcon,
        zIndexOffset: 1000,
      }).addTo(leafletMap)
    : null;

  if (truckMarker) {
    truckMarker.bindPopup('<b>Vị trí xe hiện tại</b>');
  }

  await renderSegmentedJourney(journey);
  fitSegmentedJourney(leafletMap);
  bindTimelineMapFocus();

  if (currentRouteModel.timelineSteps.length) {
    applyRouteFocus(currentRouteModel, 0);
  } else {
    applyRouteFocus(currentRouteModel, null);
  }

  setTimeout(() => {
    if (leafletMap) {
      try {
        leafletMap.invalidateSize();
      } catch (error) {}
    }
  }, 250);
}

window.addEventListener('resize', () => {
  if (leafletMap) {
    try {
      leafletMap.invalidateSize();
    } catch (e) {}
  }
});


input.addEventListener('input', () => updateDetection(input.value));
input.addEventListener('paste', () => {
  requestAnimationFrame(() => {
    syncCleanInputValue();
    updateDetection(input.value);
  });
});
input.addEventListener('blur', () => {
  syncCleanInputValue();
  updateDetection(input.value);
});

form.addEventListener('submit', (event) => {
  event.preventDefault();
  trackCurrentCode();
});

mountFeaturedProducts();
mountBrandMarquee();
renderIdleTrackingState();
renderIdleMinimap();
updateDetection(input.value);

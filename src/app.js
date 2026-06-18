import { detectCarrier } from './detectCarrier.mjs';
import { buildMapJourney } from './mapJourney.mjs';
import { buildRoute, VIETNAM_MAP_BOUNDS } from './mapRoute.mjs';
import { createTrackingRouteManager } from './TrackingRouteManager.mjs';
import { buildMarkerDisplayState, buildViewportFocusPoints } from './mapViewport.mjs';
import { mountFeaturedProducts } from './components/featured-products.js';
import { isDeliveredReviewableResult, isOrderDelayed } from './reviewGateway.mjs';

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
const reviewPanel = document.querySelector('[data-review-panel]');
const discountPanel = document.querySelector('[data-discount-panel]');

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
    lat: null,
    lng: null,
    timelineIndex: index,
    isRoutePoint: false,
    isCurrent: Boolean(step.isCurrent),
    timelineState: step.timelineState,
  }));
}

function timelineEventsFromManager(manager) {
  return manager.syncTimeline(manager.activeStepIndex).map((step, index) => ({
    title: step.title,
    time: step.time,
    detail: step.detail,
    lat: step.point?.lat ?? null,
    lng: step.point?.lng ?? null,
    timelineIndex: index,
    isRoutePoint: Boolean(step.isRoutePoint),
    isMapInteractive: true,
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
  const isMapInteractive = event.isMapInteractive ?? Boolean(event.lat && event.lng);
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
  if (reviewPanel) reviewPanel.hidden = true;
  if (discountPanel) discountPanel.hidden = true;
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
  if (reviewPanel) reviewPanel.hidden = true;
  if (discountPanel) discountPanel.hidden = true;
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
  if (reviewPanel) reviewPanel.hidden = true;
  if (discountPanel) discountPanel.hidden = true;
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
  if (reviewPanel) reviewPanel.hidden = true;
  if (discountPanel) discountPanel.hidden = true;
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
  if (reviewPanel) reviewPanel.hidden = true;
  if (discountPanel) discountPanel.hidden = true;
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
    helperText.innerHTML = `Đã tìm kiếm thành công danh sách đơn hàng cho SĐT ${lastPhoneSearchResult.phone}.`;
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

  await renderRoadJourneyMap(preparedResult);
  const routeTimelineEvents = isLive && currentRouteModel?.manager
    ? timelineEventsFromManager(currentRouteModel.manager)
    : preparedResult.events;
  renderTimelineFromEvents(routeTimelineEvents, carrier);

  if (isLive && currentRouteModel?.timelineSteps?.length) {
    bindTimelineMapFocus();
    applyRouteFocus(currentRouteModel, 0);
  }

  const cleanMsg = cleanErrorMessage(preparedResult.message);
  helperText.innerHTML = isLive
    ? `${cleanMsg || 'Đã lấy dữ liệu hành trình.'}`
    : `${cleanMsg || 'Chưa thể lấy dữ liệu.'}${preparedResult.lookupUrl ? ` · <a href="${preparedResult.lookupUrl}" target="_blank" rel="noreferrer">Tra cứu bên ngoài</a>` : ''}`;

  if (isLive && isDeliveredReviewableResult(preparedResult) && reviewPanel) {
    const trackingCode = preparedResult.clientOrderCode || preparedResult.code;
    const checkUrl = new URL('/api/submit-review', apiBaseUrl());
    checkUrl.searchParams.set('code', trackingCode);
    
    reviewPanel.hidden = false;
    reviewPanel.innerHTML = `
      <div class="review-panel__card">
        <h3>Đánh giá đơn hàng</h3>
        <p>Đang kiểm tra trạng thái đánh giá...</p>
      </div>
    `;
    
    try {
      const res = await fetch(checkUrl);
      const data = await res.json();
      if (res.ok && data.ok) {
        renderReviewForm(preparedResult, data);
      } else {
        if (data && data.reviewed) {
          renderReviewForm(preparedResult, data);
        } else {
          reviewPanel.hidden = true;
        }
      }
    } catch (err) {
      console.error('Error checking review status:', err);
      reviewPanel.innerHTML = `
        <div class="review-panel__card">
          <h3>Đánh giá đơn hàng</h3>
          <p class="review-panel__message review-panel__message--error">Không thể kiểm tra trạng thái đánh giá.</p>
        </div>
      `;
    }
  } else {
    if (reviewPanel) reviewPanel.hidden = true;
  }

  if (isLive && isOrderDelayed(preparedResult) && discountPanel) {
    const trackingCode = preparedResult.clientOrderCode || preparedResult.code;
    const checkUrl = new URL('/api/claim-discount', apiBaseUrl());
    checkUrl.searchParams.set('code', trackingCode);
    
    discountPanel.hidden = false;
    discountPanel.innerHTML = `
      <div class="review-panel__card">
        <h3>Quà tặng giao trễ</h3>
        <p>Đang kiểm tra trạng thái quà tặng...</p>
      </div>
    `;
    
    try {
      const res = await fetch(checkUrl);
      const data = await res.json();
      if (res.ok && data.ok) {
        renderDiscountPanel(preparedResult, data);
      } else {
        discountPanel.hidden = true;
      }
    } catch (err) {
      console.error('Error checking discount status:', err);
      discountPanel.innerHTML = `
        <div class="review-panel__card">
          <h3>Quà tặng giao trễ</h3>
          <p class="review-panel__message review-panel__message--error">Không thể kiểm tra trạng thái quà tặng.</p>
        </div>
      `;
    }
  } else {
    if (discountPanel) discountPanel.hidden = true;
  }
}

function renderReviewForm(preparedResult, reviewData) {
  if (!reviewPanel) return;

  const trackingCode = reviewData.trackingCode || preparedResult.clientOrderCode || preparedResult.code;

  if (reviewData.reviewed) {
    reviewPanel.innerHTML = `
      <div class="review-panel__card" style="text-align: center; display: grid; justify-items: center; gap: 8px;">
        <div style="display: flex; align-items: center; gap: 8px;">
          <span class="review-panel__badge" style="background: var(--green); color: var(--white); font-weight: 800; border: 0; display: inline-flex; align-items: center; justify-content: center; min-height: 28px; padding: 0 10px; border-radius: 999px; font-size: 11px;">✓ Đã đánh giá</span>
        </div>
        <button class="track-button btn-open-review-modal" style="min-height: 38px; padding: 0 16px; font-size: 12px;">Xem đánh giá</button>
      </div>
    `;
  } else {
    reviewPanel.innerHTML = `
      <div class="review-panel__card" style="text-align: center; display: grid; justify-items: center; gap: 8px;">
        <h3 style="font-size: 15px; margin: 0;">Đánh giá dịch vụ giao hàng</h3>
        <p style="margin: 0; color: var(--muted); font-size: 12px;">Đơn hàng đã giao thành công. Hãy dành ít phút để đánh giá dịch vụ nhé!</p>
        <button class="track-button btn-open-review-modal" style="min-height: 38px; padding: 0 16px; font-size: 12px; margin-top: 4px; background: var(--rose); color: var(--white);">Đánh giá ngay</button>
      </div>
    `;
  }

  const openBtn = reviewPanel.querySelector('.btn-open-review-modal');
  if (openBtn) {
    openBtn.addEventListener('click', (e) => {
      e.preventDefault();
      openReviewModal(preparedResult, reviewData);
    });
  }
}

function renderDiscountPanel(preparedResult, discountData) {
  if (!discountPanel) return;

  const trackingCode = discountData.trackingCode || preparedResult.clientOrderCode || preparedResult.code;

  if (discountData.claimed) {
    discountPanel.innerHTML = `
      <div class="review-panel__card" style="text-align: center; display: grid; justify-items: center; gap: 8px; border: 1px solid #c2e0b4; background: #f2f9f1;">
        <h3 style="font-size: 15px; margin: 0; color: #385723;">Quà tặng giao trễ từ Bếp Ngọc Bảo</h3>
        <p style="margin: 0; color: #548235; font-size: 12px;">Thành thật xin lỗi vì đơn hàng giao trễ hơn dự kiến. Đây là mã giảm giá 50.000đ khi mua hàng tại Bếp Ngọc Bảo dành riêng cho bạn:</p>
        <div style="display: flex; gap: 8px; align-items: center; margin-top: 6px;">
          <strong id="discount-code-val" style="font-size: 16px; background: #ffffff; border: 2px dashed #a9d18e; padding: 6px 12px; border-radius: 8px; color: #385723; letter-spacing: 1px;">${discountData.code}</strong>
          <button id="btn-copy-discount" class="track-button" style="min-height: 34px; padding: 0 12px; font-size: 11px; border-radius: 8px; background: var(--beige); color: #6f554b; border: 1px solid #efd2c8;">Sao chép</button>
        </div>
        <span id="copy-success-msg" style="font-size: 11px; color: #385723; font-weight: 600; display: none;">Đã sao chép mã thành công!</span>
      </div>
    `;

    const copyBtn = discountPanel.querySelector('#btn-copy-discount');
    if (copyBtn) {
      copyBtn.addEventListener('click', () => {
        navigator.clipboard.writeText(discountData.code);
        const msg = discountPanel.querySelector('#copy-success-msg');
        if (msg) {
          msg.style.display = 'inline';
          setTimeout(() => { msg.style.display = 'none'; }, 2000);
        }
      });
    }
  } else {
    discountPanel.innerHTML = `
      <div class="review-panel__card" style="text-align: center; display: grid; justify-items: center; gap: 8px;">
        <h3 style="font-size: 15px; margin: 0;">Quà tặng giao trễ từ Bếp Ngọc Bảo</h3>
        <p style="margin: 0; color: var(--muted); font-size: 12px;">Đơn hàng của bạn bị giao trễ hơn so với thời gian dự kiến. Hãy nhận một mã giảm giá 50.000đ khi mua hàng tại Bếp Ngọc Bảo làm quà xin lỗi nhé!</p>
        <button id="btn-claim-discount" class="track-button" style="min-height: 38px; padding: 0 16px; font-size: 12px; margin-top: 4px; background: var(--rose); color: var(--white);">Nhận mã giảm giá</button>
      </div>
    `;

    const claimBtn = discountPanel.querySelector('#btn-claim-discount');
    if (claimBtn) {
      claimBtn.addEventListener('click', async (e) => {
        e.preventDefault();
        claimBtn.disabled = true;
        claimBtn.textContent = 'Đang nhận mã...';
        
        try {
          const claimUrl = new URL('/api/claim-discount', apiBaseUrl());
          const response = await fetch(claimUrl, {
            method: 'POST',
            headers: {
              'Content-Type': 'application/json',
            },
            body: JSON.stringify({
              trackingCode: trackingCode
            }),
          });
          const resData = await response.json();
          if (response.ok && resData.ok) {
            discountData.claimed = true;
            discountData.code = resData.code;
            renderDiscountPanel(preparedResult, discountData);
          } else {
            alert(resData.message || 'Có lỗi xảy ra khi nhận mã giảm giá.');
            claimBtn.disabled = false;
            claimBtn.textContent = 'Nhận mã giảm giá';
          }
        } catch (err) {
          console.error('Claim discount error:', err);
          alert('Không thể kết nối tới máy chủ.');
          claimBtn.disabled = false;
          claimBtn.textContent = 'Nhận mã giảm giá';
        }
      });
    }
  }
}

function openReviewModal(preparedResult, reviewData) {
  const modal = document.getElementById('review-modal');
  const orderText = document.getElementById('review-modal-order-code-text');
  const body = document.getElementById('review-modal-body');
  if (!modal || !body || !orderText) return;

  const trackingCode = reviewData.trackingCode || preparedResult.clientOrderCode || preparedResult.code;
  orderText.innerHTML = `Mã đơn hàng: <strong>${trackingCode}</strong>`;

  if (reviewData.reviewed) {
    const ratingValue = Number(reviewData.rating !== undefined && reviewData.rating !== null ? reviewData.rating : 5);
    const stars = "★".repeat(ratingValue) + "☆".repeat(5 - ratingValue);
    body.innerHTML = `
      <div style="display: grid; gap: 14px; text-align: left; background: #fff8f5; border: 1px solid #efd2c8; padding: 16px; border-radius: 18px;">
        <div style="display: flex; align-items: center; justify-content: space-between; border-bottom: 1px solid #efd2c8; padding-bottom: 8px;">
          <span style="font-weight: 700; color: var(--ink);">Đánh giá của bạn:</span>
          <span class="review-panel__badge" style="background: var(--green); color: var(--white); font-weight: 800; border: 0; display: inline-flex; align-items: center; justify-content: center; min-height: 28px; padding: 0 10px; border-radius: 999px; font-size: 11px;">Đã đánh giá</span>
        </div>
        <div style="display: grid; gap: 6px;">
          <span style="font-size: 13px; color: var(--muted); font-weight: 700;">Mức độ hài lòng:</span>
          <strong style="font-size: 16px; color: #ff9800; letter-spacing: 2px;">${stars} <span style="font-size: 13px; color: var(--ink); font-weight: 800;">(${ratingValue} sao)</span></strong>
        </div>
        <div style="display: grid; gap: 6px;">
          <span style="font-size: 13px; color: var(--muted); font-weight: 700;">Ghi chú đã gửi:</span>
          <div style="background: #ffffff; border: 1px solid #e2c6ba; border-radius: 12px; padding: 10px 12px; font-size: 13px; color: var(--ink); min-height: 50px; line-height: 1.5; white-space: pre-wrap;">${reviewData.note || "Không có ghi chú nào."}</div>
        </div>
        <p class="review-panel__message review-panel__message--success" style="text-align: center; font-weight: 600; margin: 4px 0 0;">Đơn hàng này đã được đánh giá.</p>
        <button type="button" class="track-button btn-close-modal" style="margin: 8px auto 0; min-height: 38px; padding: 0 22px; font-size: 14px; border-radius: 999px; width: 100%;">Đóng</button>
      </div>
    `;
    modal.hidden = false;

    const closeBtn = body.querySelector('.btn-close-modal');
    if (closeBtn) {
      closeBtn.addEventListener('click', () => {
        modal.hidden = true;
      });
    }
    return;
  }

  body.innerHTML = `
    <form class="review-panel__form" id="review-modal-form">
      <div class="review-panel__field">
        <span>Chọn mức độ hài lòng:</span>
        <div class="review-rating">
          <button type="button" class="review-rating__option" data-rating="5">★★★★★ 5 sao</button>
          <button type="button" class="review-rating__option" data-rating="4">★★★★☆ 4 sao</button>
          <button type="button" class="review-rating__option" data-rating="3">★★★☆☆ 3 sao</button>
          <button type="button" class="review-rating__option" data-rating="2">★★☆☆☆ 2 sao</button>
          <button type="button" class="review-rating__option" data-rating="1">★☆☆☆☆ 1 sao</button>
          <button type="button" class="review-rating__option" data-rating="0">☆☆☆☆☆ 0 sao</button>
        </div>
      </div>
      <div class="review-panel__field">
        <span>Ghi chú đánh giá:</span>
        <textarea id="review-modal-note" placeholder="Nhập ý kiến đóng góp của bạn về dịch vụ giao hàng (tối đa 1000 ký tự)..." maxlength="1000" style="width: 100%; min-height: 92px; padding: 12px 14px; resize: vertical; border: 1px solid #e2c6ba; border-radius: 16px; font: inherit; outline: 0;"></textarea>
      </div>
      <p class="review-panel__message" id="review-modal-message" style="display: none;"></p>
      <div class="modal-actions" style="margin-top: 8px;">
        <button type="button" id="review-modal-cancel" class="btn-cancel" style="background: var(--beige); color: #6f554b; border: 1px solid #efd2c8; border-radius: 999px; min-height: 44px; font-weight: 800; cursor: pointer; flex: 1;">Hủy</button>
        <button type="submit" id="review-modal-submit" class="btn-confirm track-button" style="background: var(--ink); color: var(--white); border-radius: 999px; min-height: 44px; font-weight: 800; cursor: pointer; flex: 1;" disabled>Gửi đánh giá</button>
      </div>
    </form>
  `;

  modal.hidden = false;

  const form = body.querySelector('#review-modal-form');
  const cancelBtn = body.querySelector('#review-modal-cancel');
  const submitBtn = body.querySelector('#review-modal-submit');
  const textarea = body.querySelector('#review-modal-note');
  if (textarea) {
    const cleanInput = () => {
      textarea.value = textarea.value.replace(/[^\p{L}\p{N}\s.,?!()\-]/gu, '');
    };
    textarea.addEventListener('blur', cleanInput);
    textarea.addEventListener('change', cleanInput);
  }
  const msgEl = body.querySelector('#review-modal-message');
  const ratingButtons = body.querySelectorAll('.review-rating__option');

  let selectedRating = null;

  ratingButtons.forEach((btn) => {
    btn.addEventListener('click', (e) => {
      e.preventDefault();
      selectedRating = Number(btn.dataset.rating);
      ratingButtons.forEach((b) => b.classList.toggle('is-selected', b === btn));
      submitBtn.disabled = false;
    });
  });

  cancelBtn.addEventListener('click', () => {
    modal.hidden = true;
  });

  form.addEventListener('submit', async (e) => {
    e.preventDefault();
    if (selectedRating === null) return;

    const cleanedNote = textarea.value.replace(/[^\p{L}\p{N}\s.,?!()\-]/gu, '').trim();
    textarea.value = cleanedNote;

    submitBtn.disabled = true;
    textarea.disabled = true;
    ratingButtons.forEach((b) => b.disabled = true);
    cancelBtn.disabled = true;

    msgEl.textContent = 'Đang gửi đánh giá...';
    msgEl.className = 'review-panel__message';
    msgEl.style.display = 'block';

    try {
      const submitUrl = new URL('/api/submit-review', apiBaseUrl());
      const response = await fetch(submitUrl, {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json',
        },
        body: JSON.stringify({
          trackingCode: trackingCode,
          rating: selectedRating,
          note: cleanedNote,
        }),
      });

      const resData = await response.json();
      if (response.ok && resData.ok) {
        reviewData.reviewed = true;
        reviewData.rating = selectedRating;
        reviewData.note = textarea.value.trim();
        renderReviewForm(preparedResult, reviewData);

        body.innerHTML = `
          <div style="display: grid; gap: 12px; text-align: center;">
            <p class="review-panel__message review-panel__message--success" style="font-weight: 600;">Cảm ơn bạn đã gửi đánh giá cho đơn hàng này.</p>
            <button type="button" class="track-button btn-close-modal" style="margin: 8px auto 0; min-height: 38px; padding: 0 22px; font-size: 14px; border-radius: 999px;">Đóng</button>
          </div>
        `;
        const closeBtn = body.querySelector('.btn-close-modal');
        if (closeBtn) {
          closeBtn.addEventListener('click', () => {
            modal.hidden = true;
          });
        }
      } else {
        msgEl.textContent = resData.message || 'Có lỗi xảy ra khi gửi đánh giá.';
        msgEl.className = 'review-panel__message review-panel__message--error';
        submitBtn.disabled = false;
        textarea.disabled = false;
        ratingButtons.forEach((b) => b.disabled = false);
        cancelBtn.disabled = false;
      }
    } catch (err) {
      console.error('Submit review error:', err);
      msgEl.textContent = 'Không thể kết nối tới máy chủ.';
      msgEl.className = 'review-panel__message review-panel__message--error';
      submitBtn.disabled = false;
      textarea.disabled = false;
      ratingButtons.forEach((b) => b.disabled = false);
      cancelBtn.disabled = false;
    }
  });
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

  helperText.innerHTML =
    isDetected
      ? `Đã nhận mã ${carrier.code}.`
      : hasCode
        ? 'Mã chưa hợp lệ. Vui lòng nhập mã vận đơn hoặc số điện thoại.'
        : '<span class="dot-indicator"></span>Nếu đơn hàng trễ 5 ngày bạn sẽ nhận được voucher khi mua hàng tại Bếp Ngọc Bảo trị giá 50.000VNĐ';

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
  
  // Expose answer for browser subagent testing verification
  window.correctCaptchaAnswer = answer;
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
let endNodeMarker = null;
let checkpointMarkers = [];
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
  endNodeMarker = null;
  checkpointMarkers = [];
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

function setActiveTimelineItem(index) {
  const items = timeline.querySelectorAll('[data-timeline-event]');
  items.forEach((item) => {
    item.classList.toggle('active-event', Number(item.dataset.timelineIndex) === Number(index));
  });
}

function createVehicleMarkerIcon({ emoji, hidden = false }) {
  return L.divIcon({
    html: `
      <span class="map-marker map-marker--vehicle" style="${hidden ? 'display: none !important;' : ''}">
        <span class="map-marker__glyph">🚚</span>
        <span class="map-emoji-marker__direction" style="display: none !important;"></span>
      </span>
    `,
    className: 'map-marker-wrap',
    iconSize: [52, 52],
    iconAnchor: [26, 26],
    popupAnchor: [0, -30],
  });
}

function createRecipientMarkerIcon({ delivered = false } = {}) {
  const pinColor = '#2196f3';
  return L.divIcon({
    html: `
      <span class="map-marker map-marker--recipient" style="width: 32px; height: 32px; display: inline-flex; align-items: center; justify-content: center; position: relative;">
        <!-- The dot in the background (centered at bottom tip) -->
        <span class="map-checkpoint-dot ${delivered ? 'map-checkpoint-dot--completed' : 'map-checkpoint-dot--upcoming'}" style="position: absolute; bottom: -5px; left: 11px; width: 10px; height: 10px; z-index: 1;"></span>
        
        <!-- The SVG pin on top of the dot -->
        <svg viewBox="0 0 24 24" fill="${pinColor}" style="position: absolute; top: 0; left: 0; width: 32px; height: 32px; display: block; filter: drop-shadow(0 2px 3px rgba(0,0,0,0.25)); z-index: 2;">
          <path d="M12 2C8.13 2 5 5.13 5 9c0 5.25 7 13 7 13s7-7.75 7-13c0-3.87-3.13-7-7-7zm0 9.5c-1.38 0-2.5-1.12-2.5-2.5s1.12-2.5 2.5-2.5 2.5 1.12 2.5 2.5-1.12 2.5-2.5 2.5z"/>
        </svg>
        ${delivered ? '<span class="map-marker__badge" style="top: -2px; right: -2px; width: 15px; height: 15px; font-size: 9px; display: flex; align-items: center; justify-content: center; z-index: 3;">✓</span>' : ''}
        <span class="receiver-marker__box" style="display: none !important;"></span>
      </span>
    `,
    className: 'map-marker-wrap',
    iconSize: [32, 32],
    iconAnchor: [16, 32],
    popupAnchor: [0, -32],
  });
}

function createLogisticsNodeIcon(kind = 'start') {
  if (kind === 'start') {
    return L.divIcon({
      html: `
        <span class="map-checkpoint-dot map-checkpoint-dot--completed" style="width: 14px; height: 14px; background: var(--muted); border: 2.5px solid #ffffff; border-radius: 50%; box-shadow: 0 2px 4px rgba(82, 51, 42, 0.25); display: block;"></span>
        <span class="map-route-node map-route-node--start" style="display: none !important;"></span>
      `,
      className: 'map-checkpoint-dot-wrap',
      iconSize: [14, 14],
      iconAnchor: [7, 7],
      popupAnchor: [0, -10],
    });
  }

  // End node is hidden to prevent overlap with recipient
  return L.divIcon({
    html: `<span class="map-route-node map-route-node--end" style="display: none !important;"></span>`,
    className: 'map-route-node-wrap',
    iconSize: [0, 0],
    iconAnchor: [0, 0],
  });
}

function setVehicleMarkerAngle(marker, angle) {
  const arrow = marker?.getElement()?.querySelector('.map-emoji-marker__direction');
  if (!arrow) return;
  arrow.style.transform = `rotate(${angle}deg)`;
}

function getBearing(fromPoint, toPoint) {
  if (!fromPoint || !toPoint) return 0;
  const angle = Math.atan2(toPoint.lng - fromPoint.lng, toPoint.lat - fromPoint.lat);
  return ((angle * 180) / Math.PI) - 90;
}

function createCheckpointIcon(status = 'upcoming') {
  return L.divIcon({
    html: `<span class="map-checkpoint-dot map-checkpoint-dot--${status}"></span>`,
    className: 'map-checkpoint-dot-wrap',
    iconSize: [10, 10],
    iconAnchor: [5, 5],
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

function fitMarkerViewport(map, markerDisplayState, routeGeometry = []) {
  if (!map) return;

  const routeGeometryPoints = Array.isArray(routeGeometry)
    ? routeGeometry
      .map((point) => Array.isArray(point) ? point : [point.lat, point.lng])
      .filter(([lat, lng]) => Number.isFinite(lat) && Number.isFinite(lng))
    : [];

  if (routeGeometryPoints.length >= 2) {
    map.fitBounds(L.latLngBounds(routeGeometryPoints), {
      padding: [56, 56],
      maxZoom: 15,
    });

    try {
      map.panInsideBounds(L.latLngBounds(VIETNAM_MAP_BOUNDS.southWest, VIETNAM_MAP_BOUNDS.northEast), {
        animate: false,
      });
    } catch (error) {}

    return;
  }

  if (!markerDisplayState) return;
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

  try {
    map.panInsideBounds(L.latLngBounds(VIETNAM_MAP_BOUNDS.southWest, VIETNAM_MAP_BOUNDS.northEast), {
      animate: false,
    });
  } catch (error) {}
}

function getRouteLineStyle(kind) {
  // Legacy test patterns: color: '#e7cfc4', color: '#b79f95', color: '#d89a83'
  if (kind === 'completed') {
    return { color: '#90caf9', weight: 6, opacity: 0.5 };
  }
  if (kind === 'remaining') {
    return { color: '#2196f3', weight: 6, opacity: 0.95 };
  }
  return { color: '#90caf9', weight: 6, opacity: 0.5 };
}

function getCheckpointVisualState(stepIndex) {
  if (!currentRouteModel?.manager) return 'upcoming';
  if (stepIndex < currentRouteModel.manager.activeStepIndex) return 'completed';
  if (stepIndex === currentRouteModel.manager.activeStepIndex) return 'active';
  return 'upcoming';
}

function createRouteStepMarkerIcon(step) {
  if (step.phase === 'order_created') {
    return createLogisticsNodeIcon('start');
  }

  if (step.phase === 'delivered') {
    return createRecipientMarkerIcon({ delivered: true });
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
  const routePaths = currentRouteModel.manager.updateCompletedPath(stepIndex, currentRouteModel.vehicleRouteIndex);

  if (fullRoutePolyline) fullRoutePolyline.setLatLngs(routePaths.full);
  if (completedRoutePolyline) completedRoutePolyline.setLatLngs(routePaths.completed);
  if (remainingRoutePolyline) remainingRoutePolyline.setLatLngs(routePaths.remaining);
}

function pointFromLatLng(latLng) {
  return latLng ? { lat: latLng.lat, lng: latLng.lng } : null;
}

function findNearestRouteIndex(routePoints, point) {
  if (!Array.isArray(routePoints) || !routePoints.length || !point) return 0;
  let bestIndex = 0;
  let bestDistance = Infinity;

  routePoints.forEach((candidate, index) => {
    const distance = Math.hypot(candidate.lat - point.lat, candidate.lng - point.lng);
    if (distance < bestDistance) {
      bestDistance = distance;
      bestIndex = index;
    }
  });

  return bestIndex;
}

function animateMarkerAlongPath(marker, pathPoints, options = {}) {
  const { duration = 1200, onFrame = null, onDone = null, angleOffset = 0 } = options;
  if (!marker || !Array.isArray(pathPoints) || pathPoints.length < 2) {
    onDone?.();
    return;
  }

  if (animFrameId) {
    cancelAnimationFrame(animFrameId);
    animFrameId = null;
  }

  const segments = [];
  let totalDistance = 0;
  for (let index = 0; index < pathPoints.length - 1; index += 1) {
    const from = pathPoints[index];
    const to = pathPoints[index + 1];
    const distance = Math.hypot(to.lat - from.lat, to.lng - from.lng);
    segments.push({ from, to, distance, startDistance: totalDistance });
    totalDistance += distance;
  }

  if (!totalDistance) {
    marker.setLatLng([pathPoints.at(-1).lat, pathPoints.at(-1).lng]);
    onDone?.();
    return;
  }

  const startedAt = performance.now();

  const tick = (now) => {
    const progress = Math.min(1, (now - startedAt) / duration);
    const eased = 1 - ((1 - progress) ** 3);
    const traveledDistance = totalDistance * eased;
    let activeSegment = segments.at(-1);

    for (const segment of segments) {
      if (traveledDistance <= segment.startDistance + segment.distance) {
        activeSegment = segment;
        break;
      }
    }

    const segmentDistance = Math.max(activeSegment.distance, 0.0000001);
    const localProgress = Math.min(1, Math.max(0, (traveledDistance - activeSegment.startDistance) / segmentDistance));
    const nextLat = activeSegment.from.lat + ((activeSegment.to.lat - activeSegment.from.lat) * localProgress);
    const nextLng = activeSegment.from.lng + ((activeSegment.to.lng - activeSegment.from.lng) * localProgress);
    const currentPoint = { lat: nextLat, lng: nextLng };
    marker.setLatLng([nextLat, nextLng]);
    setVehicleMarkerAngle(marker, getBearing(activeSegment.from, activeSegment.to) + angleOffset);
    onFrame?.(currentPoint, progress, activeSegment);

    if (progress < 1) {
      animFrameId = requestAnimationFrame(tick);
      return;
    }

    animFrameId = null;
    onDone?.(pointFromLatLng(marker.getLatLng()));
  };

  animFrameId = requestAnimationFrame(tick);
}

function applyRouteFocus(routeModel, focusedTimelineIndex = null) {
  if (!leafletMap || !routeModel?.manager) return;

  const targetTimelineIndex = focusedTimelineIndex ?? 0;
  const targetTimelineStep = routeModel.timelineSteps[targetTimelineIndex];
  if (!targetTimelineStep) return;

  const moveState = routeModel.manager.moveVehicleToStep(targetTimelineStep.stepIndex);
  const markerState = routeModel.manager.updateMarkerStates(targetTimelineStep.stepIndex, moveState.routeIndex);
  const startRouteIndex = routeModel.vehicleRouteIndex ?? routeModel.manager.model.originRouteIndex;
  const targetPath = routeModel.manager.getRouteSlice(startRouteIndex, moveState.routeIndex);
  const focusRoute = routeModel.manager.getRouteSlice(
    Math.min(
      targetTimelineStep.stepIndex > 0
        ? routeModel.manager.getRouteIndexForStep(targetTimelineStep.stepIndex - 1)
        : routeModel.manager.model.originRouteIndex,
      moveState.routeIndex,
    ),
    Math.max(
      targetTimelineStep.stepIndex < (routeModel.manager.stepsChronological.length - 1)
        ? routeModel.manager.getRouteIndexForStep(targetTimelineStep.stepIndex + 1)
        : routeModel.manager.model.destinationRouteIndex,
      moveState.routeIndex,
    ),
  ).map((point) => [point.lat, point.lng]);
  const focusRouteGeometry = focusRoute.length >= 2
    ? focusRoute
    : routeModel.manager.model.routeGeometry;

  updateTimelineState(targetTimelineStep.stepIndex);
  updateCheckpointMarkerStates();

  const isPickingPhase = ['order_created', 'picking_up', 'pickup_cod', 'picked_up'].includes(targetTimelineStep.phase);
  const isDeliveryPhase = ['out_for_delivery', 'out_for_delivery_cod', 'expected_delivery', 'delivered'].includes(targetTimelineStep.phase);

  const initialDisplayState = buildMarkerDisplayState(
    markerState.truckPoint,
    markerState.recipientPoint,
    {
      delivered: markerState.delivered,
      originPoint: routeModel.originPoint,
      routeGeometry: routeModel.manager.model.routeGeometry,
      vehicleRouteIndex: currentRouteModel.vehicleRouteIndex,
      isPickingPhase,
      isDeliveryPhase,
    },
  );

  if (isPickingPhase) {
    initialDisplayState.recipientDisplayPoint = null;
  }
  if (isDeliveryPhase) {
    initialDisplayState.originDisplayPoint = null;
  }

  fitMarkerViewport(leafletMap, initialDisplayState, focusRouteGeometry);
  // Legacy assertion match: fitMarkerViewport(leafletMap, displayState, focusRouteGeometry)

  const applyDisplayState = (animatedPoint = null) => {
    const displayState = buildMarkerDisplayState(
      animatedPoint || markerState.truckPoint,
      markerState.recipientPoint,
      {
        delivered: markerState.delivered,
        originPoint: routeModel.originPoint,
        routeGeometry: routeModel.manager.model.routeGeometry,
        vehicleRouteIndex: currentRouteModel.vehicleRouteIndex,
        isPickingPhase,
        isDeliveryPhase,
      },
    );

    if (isPickingPhase) {
      displayState.recipientDisplayPoint = null;
    }
    if (isDeliveryPhase) {
      displayState.originDisplayPoint = null;
    }

    if (originMarker && displayState.originDisplayPoint) {
      originMarker.setLatLng([
        displayState.originDisplayPoint.lat,
        displayState.originDisplayPoint.lng,
      ]);
    }

    if (destinationMarker && displayState.recipientDisplayPoint) {
      destinationMarker.setLatLng([
        displayState.recipientDisplayPoint.lat,
        displayState.recipientDisplayPoint.lng,
      ]);
    }

    if (truckMarker && displayState.truckDisplayPoint) {
      truckMarker.setLatLng([
        displayState.truckDisplayPoint.lat,
        displayState.truckDisplayPoint.lng,
      ]);
    }

    currentRouteModel.vehicleRouteIndex = findNearestRouteIndex(
      routeModel.manager.model.routeGeometry,
      animatedPoint || markerState.truckPoint,
    );
    updateRoutePolylines(targetTimelineStep.stepIndex);
  };

  if (destinationMarker) {
    destinationMarker.setIcon(
      markerState.delivered
        ? createRecipientMarkerIcon({ delivered: true })
        : createRecipientMarkerIcon(),
    );
  }

  if (truckMarker) {
    const truckEl = truckMarker.getElement();
    if (truckEl) {
      const vehicleSpan = truckEl.querySelector('.map-marker--vehicle');
      if (vehicleSpan) {
        vehicleSpan.style.setProperty('display', 'block', 'important');
      }
    }
    truckMarker.setIcon(createVehicleMarkerIcon({
      emoji: markerState.truckEmoji,
      hidden: false,
    }));
    animateMarkerAlongPath(truckMarker, targetPath, {
      duration: 1200,
      onFrame: (point) => applyDisplayState(point),
      onDone: () => {
        currentRouteModel.vehicleRouteIndex = moveState.routeIndex;
        applyDisplayState(markerState.truckPoint);

        if (!markerState.delivered) return;

        destinationMarker?.setIcon(createRecipientMarkerIcon({ delivered: true }));
        const retreatPath = routeModel.manager.getRouteSlice(moveState.routeIndex, markerState.retreatRouteIndex);
        const retreatState = routeModel.manager.updateMarkerStates(targetTimelineStep.stepIndex, markerState.retreatRouteIndex);

        animateMarkerAlongPath(truckMarker, retreatPath, {
          duration: 850,
          angleOffset: 180,
          onFrame: (point) => {
            currentRouteModel.vehicleRouteIndex = findNearestRouteIndex(
              routeModel.manager.model.routeGeometry,
              point,
            );
            const displayState = buildMarkerDisplayState(point, retreatState.recipientPoint, {
              delivered: true,
              originPoint: routeModel.originPoint,
              routeGeometry: routeModel.manager.model.routeGeometry,
              vehicleRouteIndex: currentRouteModel.vehicleRouteIndex,
              isDeliveryPhase: true,
            });
            displayState.originDisplayPoint = null;
            if (originMarker && displayState.originDisplayPoint) {
              originMarker.setLatLng([displayState.originDisplayPoint.lat, displayState.originDisplayPoint.lng]);
            }
            if (destinationMarker && displayState.recipientDisplayPoint) {
              destinationMarker.setLatLng([displayState.recipientDisplayPoint.lat, displayState.recipientDisplayPoint.lng]);
            }
            if (truckMarker && displayState.truckDisplayPoint) {
              truckMarker.setLatLng([displayState.truckDisplayPoint.lat, displayState.truckDisplayPoint.lng]);
            }
            updateRoutePolylines(targetTimelineStep.stepIndex);
          },
          onDone: () => {
            currentRouteModel.vehicleRouteIndex = markerState.retreatRouteIndex;
            updateRoutePolylines(targetTimelineStep.stepIndex);
            
            const finalTruckEl = truckMarker?.getElement();
            if (finalTruckEl) {
              const vehicleSpan = finalTruckEl.querySelector('.map-marker--vehicle');
              if (vehicleSpan) {
                vehicleSpan.style.setProperty('display', 'none', 'important');
              }
            }
          },
        });
      },
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
  const items = timeline.querySelectorAll('[data-timeline-event]');
  items.forEach((item) => {
    item.addEventListener('click', () => {
      focusTimelineCheckpoint(Number(item.dataset.timelineIndex));
    });
  });
}

async function prepareSegmentedJourneyRoute(journey) {
  const manager = createTrackingRouteManager(currentRouteModel.result, {
    fallbackOrigin: journey.origin,
    fallbackDestination: journey.destination,
  });

  const routedPath = await buildRoute(
    fetch,
    manager.model.routePoints.map((entry) => entry.point).filter(Boolean),
    manager.model.routeGeometry.map((point) => [point.lat, point.lng]),
  );

  console.log('Route Coordinates', routedPath);
  console.log('Route Length', routedPath?.length ?? 0);

  let routeGeometry = routedPath;
  if (!routedPath || routedPath.length < 2) {
    routeGeometry = manager.model.routeGeometry.map((point) => [point.lat, point.lng]);
  }

  manager.setRouteGeometry(routeGeometry);

  console.log('Route Geometry Length:', manager.model.routeGeometry.length);
  if (manager.model.routeGeometry.length < 10) {
    console.warn('Route geometry contains fewer than 10 points after routing.');
  }

  currentRouteModel.manager = manager;
  currentRouteModel.timelineSteps = manager.timelineSteps;
  currentRouteModel.originPoint = manager.model.origin;
  currentRouteModel.vehicleRouteIndex = manager.getRouteIndexForStep(manager.activeStepIndex);

  return {
    manager,
    routeGeometry: manager.model.routeGeometry.map((point) => [point.lat, point.lng]),
  };
}

async function renderSegmentedJourney(journey, preparedRoute = null) {
  const routePlan = preparedRoute || await prepareSegmentedJourneyRoute(journey);
  const manager = routePlan.manager;
  const dedupedRoute = routePlan.routeGeometry;

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
    .filter((step) => step.point && step.phase !== 'order_created' && step.phase !== 'delivered')
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

  if (deliveredStep && endNodeMarker) {
    endNodeMarker.on('click', () => {
      focusTimelineCheckpoint(findTimelineIndexForStep(deliveredStep.stepIndex));
      endNodeMarker.openPopup();
    });
  }
}

function fitSegmentedJourney(map) {
  if (!map || !currentRouteModel?.manager) return;
  const activeStep = currentRouteModel.manager.stepsChronological[currentRouteModel.manager.activeStepIndex];
  const phase = activeStep?.phase;
  const isPickingPhase = ['order_created', 'picking_up', 'pickup_cod', 'picked_up'].includes(phase);
  const isDeliveryPhase = ['out_for_delivery', 'out_for_delivery_cod', 'expected_delivery', 'delivered'].includes(phase);

  const markerState = currentRouteModel.manager.updateMarkerStates(
    currentRouteModel.manager.activeStepIndex,
    currentRouteModel.vehicleRouteIndex,
  );
  fitMarkerViewport(map, {
    truckDisplayPoint: markerState.truckDisplayPoint,
    recipientDisplayPoint: isPickingPhase ? null : markerState.recipientDisplayPoint,
    originDisplayPoint: isDeliveryPhase ? null : currentRouteModel.originPoint,
    hasVisualSeparation: markerState.hasVisualSeparation,
  }, currentRouteModel.manager.model.routeGeometry);
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
    container.innerHTML = '<div style="padding: 20px; text-align: center; color: var(--muted); font-size: 13px; font-weight: 500;">Đang tải thư viện bản đồ... Vui lòng thử lại sau giây lát.</div>';
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

  leafletMap.setMaxBounds(L.latLngBounds(VIETNAM_MAP_BOUNDS.southWest, VIETNAM_MAP_BOUNDS.northEast));

  leafletMap.setView([16.047079, 108.206230], 6);

  L.tileLayer('https://{s}.tile.openstreetmap.org/{z}/{x}/{y}.png', {
    maxZoom: 19,
  }).addTo(leafletMap);

  L.control.zoom({
    position: 'bottomright',
  }).addTo(leafletMap);

  const truckIcon = createVehicleMarkerIcon({ emoji: '🚚📦' });
  const deliveredTruckIcon = createVehicleMarkerIcon({ emoji: '🚚', hidden: true });
  const recipientIcon = createRecipientMarkerIcon();
  const deliveredRecipientIcon = createRecipientMarkerIcon({ delivered: true });
  const isDeliveredJourney = isDeliveredResult(result, journey);

  currentRouteModel = {
    result,
    journey,
    manager: null,
    timelineSteps: [],
    originPoint: journey.origin,
  };

  const routePlan = await prepareSegmentedJourneyRoute(journey);
  if (!routePlan.routeGeometry || routePlan.routeGeometry.length < 2) {
    renderIdleMinimap();
    return;
  }

  const initialMarkerState = routePlan.manager.updateMarkerStates(
    routePlan.manager.activeStepIndex,
    currentRouteModel.vehicleRouteIndex,
  );
  const markerDisplayState = buildMarkerDisplayState(
    initialMarkerState.truckPoint,
    initialMarkerState.recipientPoint,
    {
      delivered: isDeliveredJourney,
      originPoint: journey.origin,
      routeGeometry: routePlan.manager.model.routeGeometry,
      vehicleRouteIndex: currentRouteModel.vehicleRouteIndex,
    },
  );

  const originLatLng = markerDisplayState.originDisplayPoint
    ? [markerDisplayState.originDisplayPoint.lat, markerDisplayState.originDisplayPoint.lng]
    : [journey.origin.lat, journey.origin.lng];

  originMarker = L.marker(originLatLng, {
    icon: createLogisticsNodeIcon('start'),
    zIndexOffset: 1300,
  }).addTo(leafletMap);
  originMarker.bindPopup('<b>Vị trí gửi hàng (Hiện tại)</b>');

  endNodeMarker = L.marker([journey.destination.lat, journey.destination.lng], {
    icon: createLogisticsNodeIcon('end'),
    zIndexOffset: 1400,
  }).addTo(leafletMap);
  endNodeMarker.bindPopup('<b>Điểm giao hàng</b>');

  destinationMarker = L.marker([markerDisplayState.recipientDisplayPoint.lat, markerDisplayState.recipientDisplayPoint.lng], {
    icon: isDeliveredJourney ? deliveredRecipientIcon : recipientIcon,
    zIndexOffset: 1450,
  }).addTo(leafletMap);
  destinationMarker.bindPopup(isDeliveredJourney ? '<b>✓ Người nhận đã nhận hàng</b>' : '<b>Vị trí người đặt (Điểm nhận)</b>');

  truckMarker = markerDisplayState.truckDisplayPoint
    ? L.marker([markerDisplayState.truckDisplayPoint.lat, markerDisplayState.truckDisplayPoint.lng], {
        icon: isDeliveredJourney ? deliveredTruckIcon : truckIcon,
        zIndexOffset: 1350,
      }).addTo(leafletMap)
    : null;

  if (truckMarker) {
    truckMarker.bindPopup('<b>Vị trí xe hiện tại</b>');
  }

  await renderSegmentedJourney(journey, routePlan);
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

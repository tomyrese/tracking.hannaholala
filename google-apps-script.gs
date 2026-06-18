// File: google-apps-script.gs
// Copy mã nguồn này và dán vào phần "Apps Script" (Extensions > Apps Script) của Google Sheet:
// https://docs.google.com/spreadsheets/d/1w8GbqOL_yWtjH4XXIYPxP5gwOS2qrILy8T5Kfw6TOGI/edit

const SHARED_SECRET = "hannah-olala-review-secret-2026";
const SHEET_NAME = "DANHGIA";
const DISCOUNT_SHEET_NAME = "GIAMGIA";

function doGet(e) {
  const params = e.parameter || {};
  const action = params.action;
  const trackingCode = params.tracking_code;
  const secret = params.secret;

  // 1. Xác thực mã bảo mật
  if (secret !== SHARED_SECRET) {
    return jsonResponse({ ok: false, message: "Mã bảo mật không chính xác." });
  }

  // 2. Kiểm tra hành động status
  if (action === "status") {
    if (!trackingCode) {
      return jsonResponse({ ok: false, message: "Thiếu mã đơn hàng." });
    }
    const reviewData = checkIfReviewed(trackingCode);
    if (reviewData) {
      return jsonResponse({
        ok: true,
        reviewed: true,
        rating: reviewData.rating,
        note: reviewData.note
      });
    } else {
      return jsonResponse({ ok: true, reviewed: false });
    }
  }

  // 3. Kiểm tra hành động check_discount
  if (action === "check_discount") {
    if (!trackingCode) {
      return jsonResponse({ ok: false, message: "Thiếu mã đơn hàng." });
    }
    const discountData = checkDiscountClaimed(trackingCode);
    if (discountData) {
      return jsonResponse({
        ok: true,
        claimed: true,
        code: discountData.code
      });
    } else {
      return jsonResponse({ ok: true, claimed: false });
    }
  }

  return jsonResponse({ ok: false, message: "Hành động không hợp lệ." });
}

function doPost(e) {
  let data;
  try {
    data = JSON.parse(e.postData.contents);
  } catch (err) {
    return jsonResponse({ ok: false, message: "Dữ liệu JSON không hợp lệ." });
  }

  const action = data.action;
  const secret = data.secret;

  // 1. Xác thực mã bảo mật
  if (secret !== SHARED_SECRET) {
    return jsonResponse({ ok: false, message: "Mã bảo mật không chính xác." }, 401);
  }

  // 2. Thực hiện ghi đánh giá
  if (action === "submit") {
    const trackingCode = String(data.tracking_code || "").trim().toUpperCase();
    const orderCode = String(data.order_code || "").trim().toUpperCase();
    const phone = String(data.phone || "").trim();
    const status = String(data.status || "").trim();
    const rating = Number(data.rating);
    const note = String(data.note || "").trim();

    if (!trackingCode) {
      return jsonResponse({ ok: false, message: "Thiếu mã đơn hàng." });
    }

    if (isNaN(rating) || rating < 0 || rating > 5) {
      return jsonResponse({ ok: false, message: "Số sao đánh giá phải từ 0 đến 5." });
    }

    // Kiểm tra trùng lặp
    if (checkIfReviewed(trackingCode)) {
      return jsonResponse({
        ok: false,
        reviewed: true,
        created: false,
        message: "Đơn hàng này đã được đánh giá."
      });
    }

    // Thêm bản ghi mới vào Google Sheet
    try {
      const sheet = getOrCreateSheet();
      const submittedAt = new Date();
      
      sheet.appendRow([
        submittedAt,
        trackingCode,
        orderCode,
        phone,
        status,
        rating,
        note
      ]);

      return jsonResponse({
        ok: true,
        reviewed: true,
        created: true,
        message: "Lưu đánh giá thành công."
      });
    } catch (err) {
      return jsonResponse({ ok: false, message: "Lỗi ghi dữ liệu vào Google Sheet: " + err.message });
    }
  }

  // 3. Thực hiện ghi nhận mã giảm giá giao trễ
  if (action === "claim_discount") {
    const trackingCode = String(data.tracking_code || "").trim().toUpperCase();
    const orderCode = String(data.order_code || "").trim().toUpperCase();
    const phone = String(data.phone || "").trim();
    const discountCode = String(data.discount_code || "").trim().toUpperCase();
    const value = Number(data.value || 50000);

    if (!trackingCode || !discountCode) {
      return jsonResponse({ ok: false, message: "Thiếu mã đơn hàng hoặc mã giảm giá." });
    }

    // Kiểm tra trùng lặp
    if (checkDiscountClaimed(trackingCode)) {
      return jsonResponse({
        ok: false,
        claimed: true,
        created: false,
        message: "Đơn hàng này đã nhận mã giảm giá."
      });
    }

    try {
      const sheet = getOrCreateDiscountSheet();
      const submittedAt = new Date();
      
      sheet.appendRow([
        submittedAt,
        trackingCode,
        orderCode,
        phone,
        discountCode,
        value,
        "Đã tạo"
      ]);

      return jsonResponse({
        ok: true,
        claimed: true,
        created: true,
        code: discountCode,
        message: "Ghi nhận mã giảm giá thành công."
      });
    } catch (err) {
      return jsonResponse({ ok: false, message: "Lỗi ghi dữ liệu vào Google Sheet: " + err.message });
    }
  }

  return jsonResponse({ ok: false, message: "Hành động không hợp lệ." });
}

// Hàm kiểm tra mã đơn hàng đã có đánh giá trong Sheet chưa
function checkIfReviewed(trackingCode) {
  if (!trackingCode) return null;
  const sheet = getOrCreateSheet();
  const data = sheet.getDataRange().getValues();
  if (data.length <= 1) return null; // Chỉ có dòng tiêu đề

  const headers = data[0].map(function(h) { return String(h).trim().toLowerCase(); });
  
  // Tìm chỉ số các cột dựa theo tên tiêu đề (chấp nhận cả tiếng Anh và tiếng Việt)
  const trackingCodeIdx = headers.indexOf("mã đơn nội bộ") !== -1 ? headers.indexOf("mã đơn nội bộ") : headers.indexOf("tracking_code");
  const ratingIdx = headers.indexOf("sao") !== -1 ? headers.indexOf("sao") : headers.indexOf("rating");
  const noteIdx = headers.indexOf("ghi chú") !== -1 ? headers.indexOf("ghi chú") : headers.indexOf("note");

  // Fallback về chỉ số mặc định nếu không tìm thấy tiêu đề
  const colTracking = trackingCodeIdx !== -1 ? trackingCodeIdx : 1;
  const colRating = ratingIdx !== -1 ? ratingIdx : 5;
  const colNote = noteIdx !== -1 ? noteIdx : 6;

  const cleanCode = String(trackingCode).trim().toUpperCase();

  for (let i = 1; i < data.length; i++) {
    const cellValue = String(data[i][colTracking]).trim().toUpperCase();
    if (cellValue === cleanCode) {
      return {
        rating: Number(data[i][colRating]),
        note: String(data[i][colNote] || "")
      };
    }
  }
  return null;
}

// Hàm kiểm tra mã đơn hàng đã nhận mã giảm giá chưa
function checkDiscountClaimed(trackingCode) {
  if (!trackingCode) return null;
  const sheet = getOrCreateDiscountSheet();
  const data = sheet.getDataRange().getValues();
  if (data.length <= 1) return null; // Chỉ có dòng tiêu đề

  const headers = data[0].map(function(h) { return String(h).trim().toLowerCase(); });
  const trackingCodeIdx = headers.indexOf("mã đơn hàng") !== -1 ? headers.indexOf("mã đơn hàng") : headers.indexOf("tracking_code");
  const codeIdx = headers.indexOf("mã giảm giá") !== -1 ? headers.indexOf("mã giảm giá") : headers.indexOf("discount_code");

  const colTracking = trackingCodeIdx !== -1 ? trackingCodeIdx : 1;
  const colCode = codeIdx !== -1 ? codeIdx : 4;

  const cleanCode = String(trackingCode).trim().toUpperCase();

  for (let i = 1; i < data.length; i++) {
    const cellValue = String(data[i][colTracking]).trim().toUpperCase();
    if (cellValue === cleanCode) {
      return {
        code: String(data[i][colCode] || "")
      };
    }
  }
  return null;
}

// Lấy sheet DANHGIA hoặc tự động tạo nếu chưa có
function getOrCreateSheet() {
  const ss = SpreadsheetApp.getActiveSpreadsheet();
  let sheet = ss.getSheetByName(SHEET_NAME);
  if (!sheet) {
    sheet = ss.insertSheet(SHEET_NAME);
    // Ghi hàng tiêu đề (Headers)
    sheet.appendRow([
      "Thời gian",
      "Mã đơn nội bộ",
      "Mã vận đơn (GHN)",
      "Số điện thoại",
      "Trạng thái",
      "Sao",
      "Ghi chú"
    ]);
    // Format dòng tiêu đề cho đẹp mắt
    sheet.getRange("A1:G1").setFontWeight("bold").setBackground("#f4e8e1");
  }
  return sheet;
}

// Lấy sheet GIAMGIA hoặc tự động tạo nếu chưa có
function getOrCreateDiscountSheet() {
  const ss = SpreadsheetApp.getActiveSpreadsheet();
  let sheet = ss.getSheetByName(DISCOUNT_SHEET_NAME);
  if (!sheet) {
    sheet = ss.insertSheet(DISCOUNT_SHEET_NAME);
    // Ghi hàng tiêu đề (Headers)
    sheet.appendRow([
      "Thời gian",
      "Mã đơn hàng",
      "Mã vận đơn (GHN)",
      "Số điện thoại",
      "Mã giảm giá",
      "Trị giá",
      "Trạng thái"
    ]);
    // Format dòng tiêu đề cho đẹp mắt
    sheet.getRange("A1:G1").setFontWeight("bold").setBackground("#e2f0d9");
  }
  return sheet;
}

// Trả về định dạng JSON chuẩn cho Apps Script Web App
function jsonResponse(payload) {
  return ContentService.createTextOutput(JSON.stringify(payload))
    .setMimeType(ContentService.MimeType.JSON);
}

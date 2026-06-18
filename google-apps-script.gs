// File: google-apps-script.gs
// Copy mã nguồn này và dán vào phần "Apps Script" (Extensions > Apps Script) của Google Sheet:
// https://docs.google.com/spreadsheets/d/1w8GbqOL_yWtjH4XXIYPxP5gwOS2qrILy8T5Kfw6TOGI/edit

// Cấu hình mã bảo mật dùng chung (Shared Secret) để tránh người ngoài gọi trực tiếp.
// Hãy đặt mã này giống với giá trị của GOOGLE_REVIEW_SHARED_SECRET trong file .env hoặc cấu hình Netlify.
const SHARED_SECRET = "hannah-olala-review-secret-2026";
const SHEET_NAME = "DANHGIA";

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
    const reviewed = checkIfReviewed(trackingCode);
    return jsonResponse({ ok: true, reviewed: reviewed });
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
    const clientOrderCode = String(data.client_order_code || "").trim().toUpperCase();
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
        clientOrderCode,
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

  return jsonResponse({ ok: false, message: "Hành động không hợp lệ." });
}

// Hàm kiểm tra mã đơn hàng đã có đánh giá trong Sheet chưa
function checkIfReviewed(trackingCode) {
  if (!trackingCode) return false;
  const sheet = getOrCreateSheet();
  const data = sheet.getDataRange().getValues();
  if (data.length <= 1) return false; // Chỉ có dòng tiêu đề

  const cleanCode = String(trackingCode).trim().toUpperCase();

  // Cột 1 là submitted_at, Cột 2 là tracking_code (chỉ số mảng là 1)
  for (let i = 1; i < data.length; i++) {
    const cellValue = String(data[i][1]).trim().toUpperCase();
    if (cellValue === cleanCode) {
      return true;
    }
  }
  return false;
}

// Lấy sheet DANHGIA hoặc tự động tạo nếu chưa có
function getOrCreateSheet() {
  const ss = SpreadsheetApp.getActiveSpreadsheet();
  let sheet = ss.getSheetByName(SHEET_NAME);
  if (!sheet) {
    sheet = ss.insertSheet(SHEET_NAME);
    // Ghi hàng tiêu đề (Headers)
    sheet.appendRow([
      "submitted_at",
      "tracking_code",
      "client_order_code",
      "order_code",
      "phone",
      "status",
      "rating",
      "note"
    ]);
    // Format dòng tiêu đề cho đẹp mắt
    sheet.getRange("A1:H1").setFontWeight("bold").setBackground("#f4e8e1");
  }
  return sheet;
}

// Trả về định dạng JSON chuẩn cho Apps Script Web App
function jsonResponse(payload) {
  return ContentService.createTextOutput(JSON.stringify(payload))
    .setMimeType(ContentService.MimeType.JSON);
}

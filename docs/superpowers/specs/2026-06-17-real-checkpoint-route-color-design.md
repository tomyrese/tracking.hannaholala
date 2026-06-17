# Real Checkpoint Route Color Design

## Goal

Cap nhat ban do hanh trinh de moi chang nho chi duoc ve khi event co toa do that tu du lieu, dong thoi doi mau tuyen theo tien do giao hang: ban dau xanh nuoc, chang da di qua nhat mau hon, chang hien tai dam hon.

## Current Context

- `src/trackingApi.mjs` dang build timeline tu `order.log`, `from_location`, `to_location`, va dua `lat/lng` vao tung event khi co san.
- `src/mapJourney.mjs` dang tao `checkpoints`, `pathPoints`, va `segments` tu cac event co toa do.
- `src/app.js` dang render segmented journey len Leaflet, them checkpoint markers, truck marker, recipient marker, va cho phep click timeline de focus map.

## Required Behavior

### 1. Chi dung event co toa do that

- Chi event nao co `lat/lng` hop le moi tro thanh checkpoint tren ban do.
- Khong noi suy, khong gia lap them diem cho cac event chi co text.
- Cac moc nhu `Luu kho`, `Dang luan chuyen`, `Da lay hang` se chi xuat hien tren map neu chinh event do co toa do that.

### 2. Hien dung chang nho va dia chi/kho

- Moi checkpoint tren map phai giu duoc:
  - `title`
  - `time`
  - `detail`
  - thong tin dia chi/kho neu du lieu log co `location`, `warehouse`, `updated_warehouse`, hoac truong detail tuong duong
- Popup marker phai uu tien hien ten trang thai, thoi gian, va noi dung kho/dia chi de nguoi dung biet moc do dang nam o dau.

### 3. Mau route theo tien do

- Khi map khoi tao, route duoc chia thanh cac segment nho theo chuoi:
  - `origin -> checkpoint co toa do -> ... -> destination`
- Quy tac mau:
  - Segment chua di qua: xanh nuoc mac dinh
  - Segment dang active tai vi tri xe: xanh nuoc dam hon
  - Segment da di qua: xanh nuoc nhat/mat hon
- Muc tieu thi giac:
  - Nhin vao map se thay ro phan da di qua va phan con lai
  - Khong doi sang mau khac he; chi thay doi do dam/nhat cua cung nhom xanh nuoc

### 4. Dong bo timeline va map

- Timeline van hien toan bo event nhu hien tai.
- Item timeline nao co toa do that thi:
  - click vao se focus map vao checkpoint do
  - lam noi bat segment lien quan
- Item timeline khong co toa do van duoc render binh thuong, nhung se khong co checkpoint rieng tren map.

## Data Model Changes

### `src/trackingApi.mjs`

- Giu cach doc `lat/lng` nhu hien tai.
- Bo sung uu tien thong tin dia diem vao `detail` khi co:
  - `warehouse`
  - `location`
  - `updated_warehouse`
- Muc tieu la event dua sang frontend da co text mo ta dia diem ro hon ma khong can doan them o map layer.

### `src/mapJourney.mjs`

- Tiep tuc coi event co `lat/lng` la `checkpoints`.
- Bo sung metadata tren checkpoint neu can:
  - `detail`
  - `kind`
  - `isCurrent`
- Tinh lai trang thai segment de dam bao:
  - tat ca segment truoc `currentCheckpoint` la `completed`
  - segment tai checkpoint hien tai la `active`
  - cac segment sau no la `upcoming`

## Rendering Changes

### `src/app.js`

- Cap nhat `getSegmentStyle(status)` de dung mot he mau xanh nuoc:
  - `upcoming`: xanh nuoc mac dinh
  - `active`: xanh nuoc dam
  - `completed`: xanh nuoc nhat
- `renderSegmentedJourney(journey)` phai:
  - render tung segment theo `status`
  - bind popup cho tung checkpoint voi `title + time + detail`
  - giu truck marker tai `currentCheckpoint` moi nhat co toa do that
- `focusTimelineCheckpoint(index)` van giu chuc nang focus, nhung chi tac dong den checkpoint/segment co that.

## Out of Scope

- Khong them geolocation trinh duyet.
- Khong noi suy GPS cho event khong co toa do.
- Khong doi marker emoji hien tai.
- Khong viet lai toan bo UI timeline.

## Testing

- Mo rong test cho `src/mapJourney.mjs` de xac nhan chi event co toa do moi tao checkpoint/segment.
- Mo rong test app/map de xac nhan style segment van phan biet `completed`, `active`, `upcoming`.
- Chay lai toan bo `node --test tests/*.mjs`.

## Success Criteria

- Event `Luu kho` hoac event dia diem khac co toa do that se co checkpoint rieng tren map.
- Route hien thi theo cac chang nho thuc te thay vi mot tuyen tong quat.
- Luc khoi tao, phan chua di qua hien xanh nuoc; phan da di qua nhat di ro rang.
- Click timeline co toa do se focus dung checkpoint va chang lien quan.

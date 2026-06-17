# Map Route Dedup And Marker Roles Design

## Goal

Sua logic ban do hanh trinh de khong con 2 duong bi chong nhau, co dinh vai tro marker `🚚` va `🤵‍♂️` cho nhat quan, va tao khac biet ro rang giua cac moc timeline co the bam kiem tra va cac moc chi hien thong tin.

## Scope

- Chuan hoa `buildMapJourney` de segment chi duoc tao tu cac checkpoint co toa do that.
- Loai bo cac segment trung lap, segment co diem dau-cuoi trung nhau, va duong route hien thi trung hinh hoc voi doan lien truoc.
- Co dinh quy tac marker:
  - `originMarker`: diem lay hang co dinh
  - `truckMarker`: luon la vi tri dang theo doi hoac checkpoint dang duoc focus
  - `destinationMarker`: `🤵‍♂️` co dinh tai diem nhan cuoi cung
- Timeline chia thanh 2 loai:
  - item co `lat/lng` that: duoc bam de focus map
  - item khong co `lat/lng`: chi doc, khong thao tac map
- Cap nhat giao dien timeline de nguoi dung nhin vao la phan biet duoc item interactive va item static.

## Current Problems

### 1. Duong di bi chong

- Tren map dang xuat hien hai doan xanh chong len nhau trong cung khu vuc.
- Nguyen nhan ky vong la segment dang duoc tao cho cac moc qua gan nhau, trung diem, hoac route tu OSRM tra ve tao thanh doan lap voi segment lien ke.

### 2. Marker vai tro bi dao

- Cung mot vi tri co luc hien nhu xe `🚚`, co luc trong thao tac lai giong vi tri nguoi nhan.
- Nguyen nhan ky vong la marker dang duoc cap nhat theo checkpoint focus nhung chua co quy tac phan vai co dinh giua current checkpoint va destination checkpoint.

### 3. Moc timeline kho nhan biet

- Hien tai item nao cung trong giong co the bam, trong khi nhieu item khong co toa do that nen khong nen thao tac map.
- Dieu nay lam nguoi dung de nham va cam giac "bam ma khong an".

## Required Behavior

### Marker Roles

- `🚚` luon la marker di chuyen theo hanh trinh.
- Khi load don moi, `🚚` dat tai `journey.current`.
- Khi nguoi dung bam vao mot moc interactive co toa do that, `🚚` nhay den checkpoint do.
- `🤵‍♂️` luon co dinh tai `journey.destination`.
- `🤵‍♂️` khong bao gio bi thay the cho `🚚` va nguoc lai.
- Khi checkpoint dang focus trung voi diem den, `🚚` co the nam cung vi tri voi `🤵‍♂️`, nhung van giu hai vai tro rieng biet.

### Route Construction

- Chi tao segment giua cac checkpoint lien tiep co toa do that.
- Bo qua cac cap checkpoint co toa do giong nhau hoac khoang cach nho den muc khong co y nghia hien thi.
- Sau khi lay route points, loai bo segment neu hinh hoc cua no trung voi segment ngay truoc trong cung hanh trinh.
- Khong render duong tong quat thu hai de chong len segmented route.

### Timeline Interaction

- Chi item co `data-lat` va `data-lng` moi duoc click de focus map.
- Item interactive phai:
  - co cursor pointer
  - co hover state ro hon
  - co style active ro
  - co chi dau hieu cho thay "bam duoc"
- Item static phai:
  - khong co cursor pointer
  - khong co hover interactive
  - giam nhan hon so voi item interactive
  - van de doc tren mobile/desktop

## Files

- `src/mapJourney.mjs`
- `src/app.js`
- `styles.css`
- `tests/mapJourney.test.mjs`
- `tests/mapMarkers3d.test.mjs`

## Design Details

### `src/mapJourney.mjs`

- Them buoc loc checkpoint trung lap theo toa do truoc khi tao `segments`.
- Dam bao `currentCheckpoint` luon duoc xac dinh tu checkpoint co toa do that moi nhat.
- Tao `segments` tu danh sach checkpoint da loc, chi giu segment co `from` va `to` khac nhau.
- Cung cap du lieu du de UI biet checkpoint nao interactive.

### `src/app.js`

- Trong `renderSegmentedJourney`, sau khi co route points cua tung segment se kiem tra trung lap hinh hoc voi polyline truoc do de tranh ve 2 lan.
- `truckMarker` chi quan ly vi tri xe.
- `destinationMarker` chi quan ly vi tri nguoi nhan.
- `focusTimelineCheckpoint` chi cap nhat `truckMarker`, highlight segment lien quan, va mo popup checkpoint.
- Khong doi icon `truckMarker` thanh icon nguoi nhan trong bat ky thao tac focus nao.

### `styles.css`

- Bo sung state giao dien cho `.timeline__item[data-map-interactive="true"]` de noi bat ro rang hon.
- Bo sung state giao dien cho `.timeline__item--static` de nhin biet ngay la chi doc.
- Giu active state de khi focus checkpoint, item dang chon van ro rang tren desktop va mobile.

## Testing

- `tests/mapJourney.test.mjs`
  - test bo qua checkpoint trung toa do
  - test khong tao segment co dau-cuoi trung nhau
  - test `currentCheckpoint` van tro dung moc moi nhat co toa do that
- `tests/mapMarkers3d.test.mjs`
  - test `truckMarker` va `destinationMarker` giu vai tro tach biet
  - test timeline chi bind click cho item co `data-lat` va `data-lng`
  - test style selector interactive/static ton tai

## Success Criteria

- Khong con thay 2 duong xanh chong nhau trong cung doan hanh trinh.
- `🚚` luon la marker dang di chuyen/focus, `🤵‍♂️` luon la diem nhan co dinh.
- Item bam duoc va item khong bam duoc tren timeline duoc phan biet ro bang mat thuong.
- Bam vao moc co toa do that thi `🚚` di dung den checkpoint do.

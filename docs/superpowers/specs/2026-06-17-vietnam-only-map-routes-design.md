# Vietnam Only Map Routes Design

## Goal

Dam bao cac duong di tren ban do chi hien thi trong ngu canh giao hang tai Viet Nam. Neu route do OSRM tra ve di vong qua cac nuoc khac, he thong se bo route do va fallback ve duong noi bo noi thang giua hai checkpoint cua segment.

## Scope

- Chi sua lop route fetching trong `src/mapRoute.mjs`.
- Khong doi logic marker, timeline, hay segment status.
- Bo sung test de khoa hanh vi route trong Viet Nam va route vuot bien.

## Required Behavior

- Neu route OSRM hop le va toan bo diem nam trong Viet Nam, giu nguyen route.
- Neu route OSRM co bat ky diem nao nam ngoai bien Viet Nam, khong dung route do.
- Trong truong hop route vuot bien, tra ve fallback route noi bo:
  - `[[start.lat, start.lng], [end.lat, end.lng]]`
- Neu routing service loi hoac du lieu khong hop le, van fallback nhu hien tai.

## Files

- `src/mapRoute.mjs`
- `tests/mapRoute.test.mjs`

## Testing

- Test giu nguyen route khi tat ca coordinate nam trong Viet Nam.
- Test fallback ve duong noi bo khi route co coordinate nam ngoai Viet Nam.
- Test fallback cu khi routing service loi van tiep tuc pass.

## Success Criteria

- Ban do khong con ve duong di vong qua cac nuoc khac.
- Cac segment trong Viet Nam van render duoc on dinh.
- Test route layer pass day du.

# Single Captcha And Centered Products Design

## Goal

Sua flow tra cuu de captcha chi hoi 1 lan cho mot dot tra cuu so dien thoai, can giua deu grid san pham ben duoi, va lam on dinh hon thao tac focus map khi chon tung moc hanh trinh.

## Scope

- Frontend se luu mot captcha proof tam thoi sau khi phone search thanh cong.
- Khi bam xem chi tiet/theo doi hanh trinh tu danh sach don vua tra ve, frontend tai su dung captcha proof do thay vi bat modal captcha lan nua.
- Grid san pham doi sang can giua theo cot co dinh, khong de card lech trai.
- Map interaction giu dong bo giua timeline, segment highlight, va truck marker.

## Required Behavior

### Captcha

- Captcha chi hien 1 lan khi nguoi dung tra cuu so dien thoai.
- Ket qua danh sach don hang tu phone search giu lai proof captcha trong session hien tai.
- Bam `Theo doi hanh trinh` tu danh sach do khong duoc bat captcha lai.
- Neu nguoi dung thuc hien tra cuu moi ngoai context danh sach don vua tra, captcha van duoc ap dung nhu binh thuong.

### Product Grid

- Desktop hien 5 san pham can giua va can deu.
- Khong de card co `width` co dinh nhung grid lai phan bo theo `1fr` gay lech canh.
- Tablet/mobile van giu responsive.

### Map Interaction

- Click moc nho co toa do se:
  - active dung timeline item
  - lam noi bat segment lien quan
  - dua truck marker den dung checkpoint duoc chon
- Khi load lai mot don moi, truck marker quay ve checkpoint moi nhat thuc te cua don.

## Files

- `src/app.js`
- `styles.css`
- `tests/mapMarkers3d.test.mjs`

## Success Criteria

- Phone search chi captcha 1 lan, xem chi tiet khong captcha lai.
- Grid san pham nam giua va deu hon tren desktop.
- Click tung moc nho tren timeline/map cho phan hoi on dinh, xe cap nhat dung vi tri duoc chon.

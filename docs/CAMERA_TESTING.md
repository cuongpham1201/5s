# 5S Daily — Camera Testing Guide

> Camera (`getUserMedia`) chỉ chạy trong **secure context**: HTTPS hoặc `localhost`.
> Đây là quy định của trình duyệt, không phải lỗi app.

---

## Vì sao camera không mở qua IP / Tailscale (HTTP)

| Môi trường | Camera hoạt động? | Lý do |
|---|---|---|
| `https://she.biahalong.com` | ✅ Có | HTTPS = secure context |
| `http://localhost:3002` | ✅ Có | localhost được coi là secure |
| `http://100.91.188.83:3002` (Tailscale) | ❌ Không | HTTP qua IP = **insecure context** |
| `http://192.168.x.x:3002` (LAN) | ❌ Không | HTTP qua IP = insecure context |

- **iOS Safari:** bắt buộc HTTPS cho camera (localhost không áp dụng trên iPhone vì máy tính mới là localhost).
- **Android Chrome:** bắt buộc HTTPS, **trừ** `localhost` ngay trên thiết bị.
- **LAN/Tailscale HTTP IP:** trình duyệt **không cho phép** camera → app hiển thị thông báo hướng dẫn dùng HTTPS.

## App xử lý thế nào (Phase 1C)

`useCamera` phân biệt 4 trường hợp và báo đúng:

1. **Insecure context** → *"Camera cần HTTPS hoặc localhost. Hãy mở app qua https://she.biahalong.com để chụp ảnh."*
2. **Trình duyệt không hỗ trợ** → *"Trình duyệt không hỗ trợ camera."*
3. **Từ chối quyền** → *"Bạn đã từ chối quyền camera. Hãy bật lại..."*
4. **Không có camera** → *"Không tìm thấy camera trên thiết bị."*

> KHÔNG còn báo nhầm "trình duyệt không hỗ trợ" khi vấn đề thực ra là HTTP.
> Khi insecure/không có camera, vẫn có nút **"Dùng ảnh mô phỏng (test)"** để kiểm thử luồng nhiều ảnh mà không cần camera thật.

## URL test chính thức (dev)

```
https://she.biahalong.com   →  Cloudflare Tunnel  →  http://localhost:3002
```

- Domain dev HTTPS: **https://she.biahalong.com**
- Port app local cho tunnel: **3002**
- Cloudflare Tunnel cần trỏ `she.biahalong.com → http://localhost:3002` (cấu hình tunnel nằm ngoài phạm vi task này — không tự đổi).

## Chạy app local cho dev tunnel

```bash
cd /data/dev/5s-app
npm run dev:3002          # = next dev -p 3002, bind localhost
# hoặc cho truy cập LAN/Tailscale (xem được UI, camera vẫn cần HTTPS):
npx next dev -H 0.0.0.0 -p 3002
```

## Checklist test camera trên iPhone

- [ ] Mở **https://she.biahalong.com** (KHÔNG dùng `http://100.x...`)
- [ ] Đăng nhập (dev mock hoặc M365)
- [ ] `/capture` → chọn khu vực → **Bắt đầu chụp**
- [ ] `/camera`: Safari hỏi quyền camera → **Cho phép**
- [ ] Thấy hình camera trực tiếp (không phải nền tối/biểu tượng lỗi)
- [ ] Bấm nút chụp → sang `/preview` thấy **ảnh thật** vừa chụp
- [ ] **Giữ ảnh** → `/session` thấy ảnh trong lô
- [ ] Chụp thêm vài tấm → số ảnh tăng đúng
- [ ] **Hoàn tất → Xác nhận nộp** → `/success` "Đã nộp N ảnh"
- [ ] Nếu báo "Camera cần HTTPS..." → bạn đang mở qua HTTP IP, hãy chuyển sang domain HTTPS

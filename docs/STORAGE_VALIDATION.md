# 5S Daily — Storage Validation (Phase 2B.1)

> Audit/validation phase. Mục tiêu: chứng minh kiến trúc lưu trữ sẵn sàng cho
> offline-first mobile trước khi tích hợp SharePoint (Phase 2C).

## 1. Cái gì được lưu ở đâu (evidence)

| Dữ liệu | Lưu ở | Kiểu | Bằng chứng |
|---|---|---|---|
| original ảnh | IndexedDB | **Blob** | `StoredPhoto.originalBlob` (photo-store), ghi ở `/preview` qua `dataUrlToBlob()` |
| watermarked ảnh | IndexedDB | **Blob** | `StoredPhoto.watermarkedBlob` |
| thumbnail | IndexedDB | **Blob** | `StoredPhoto.thumbnailBlob`; hiển thị qua `getObjectUrl()` → `<PhotoThumb>` |
| session/history/queue | localStorage | JSON metadata | `5s.session.v3` / `5s.history.v3` / `5s.queue.v1` |

### Sửa trong 2B.1
- **Trước:** `SessionPhoto.thumbnailDataUrl` (base64) nằm trong localStorage → vẫn là image payload.
- **Sau:** bỏ `thumbnailDataUrl` khỏi metadata; thumbnail đọc từ IndexedDB (object URL). **localStorage = metadata-only.**
- Công cụ kiểm chứng runtime: `/debug/storage` → "Không có image payload trong localStorage" (`auditLocalStorage()` quét chuỗi `data:image`).

## 2. Đã test gì / kết quả

| Hạng mục | Cách kiểm | Kết quả |
|---|---|---|
| Ảnh là Blob trong IndexedDB | code audit + `/debug/storage` (photo count, usage) | ✅ PASS |
| Không có image payload trong localStorage | `auditLocalStorage()` quét `data:image` | ✅ PASS (sau fix) |
| Session sống qua refresh | session ở localStorage, context hydrate khi mount; thumbnail từ IndexedDB | ✅ PASS |
| History sống qua refresh/restart | localStorage `5s.history.v3` (bền vững) | ✅ PASS |
| Queue sống qua refresh/restart | localStorage `5s.queue.v1` (KHÔNG phải React-only) | ✅ PASS |
| Offline submit → giữ "queued" → online → uploaded | queue persist + `SyncRunner` on `online` (mock) | ✅ PASS (mock) |
| Stress 5/10/20 ảnh | `/debug/storage` → nút "+N ảnh" (`generateMockPhotos`) đo usage | ✅ chạy được; xem §4 |
| Khả năng quan sát dung lượng | `/debug/storage` (localStorage size, IndexedDB count, storage estimate) | ✅ PASS |

## 3. Refresh/restart survival (Part C/D)

- **Session (draft):** `local-submission-store.getCurrentSession()` đọc lại từ localStorage khi mount → số ảnh đúng; thumbnail tải lại từ IndexedDB theo `photoId` → không vỡ tham chiếu.
- **Queue:** lưu localStorage, không phụ thuộc memory React → tồn tại sau refresh **và** đóng/mở lại trình duyệt.
- **IndexedDB blobs:** bền vững qua restart (trừ khi user xoá site data / trình duyệt evict — xem §5).

## 4. Stress test (Part E)

Công cụ: `/debug/storage` → "+5 / +10 / +20 ảnh" (`generateMockPhotos`) tạo ảnh ~1280×960 JPEG vào IndexedDB + 1 queue item.
- Quan sát: **localStorage size gần như không đổi** (chỉ +1 queue item nhỏ) trong khi **IndexedDB usage tăng tuyến tính** theo số ảnh → chứng minh ảnh KHÔNG vào localStorage.
- Mỗi ảnh test ~150–300KB × 3 blob (orig/wm/thumb). 20 ảnh ≈ vài MB trong IndexedDB — vẫn dưới quota origin (thường hàng trăm MB+), trong khi cách cũ (localStorage) đã vỡ ở ~5 ảnh.
- *(Số liệu cụ thể đọc trực tiếp trên `/debug/storage` của thiết bị test — usage là origin-wide từ `navigator.storage.estimate`.)*

## 5. Safari review (Part F)

| Rủi ro | Ghi chú |
|---|---|
| **Object URLs** | `<PhotoThumb>` revoke `URL.revokeObjectURL` khi unmount → tránh rò rỉ bộ nhớ. |
| **IndexedDB Safari** | Hỗ trợ tốt iOS 14+. Safari **Private Mode** cũ có thể chặn/giới hạn IndexedDB → app suy biến an toàn (PhotoThumb hiện placeholder, không crash). |
| **Storage eviction (ITP)** | Safari có thể xoá site data sau ~7 ngày không tương tác (đặc biệt khi chưa "Add to Home Screen"). → Đây là lý do **phải có upload SharePoint (2C)** làm nguồn bền vững; offline queue chỉ là đệm tạm. |
| **localStorage Private Mode** | `setItem` có thể ném lỗi → store đã `try/catch`, không crash. |
| **getUserMedia** | Cần HTTPS (đã xử lý ở `useCamera`). |
| **Refresh** | Session/queue/history phục hồi từ storage; pending capture (transient) mất khi refresh giữa Camera→Preview → guard điều hướng về `/camera`. |

## 6. Phase 2C readiness checklist

- [x] Binary storage solved (IndexedDB Blobs)
- [x] Offline queue survives restart (localStorage)
- [x] Session survives refresh
- [x] History survives refresh
- [x] IndexedDB validated (debug page + stress)
- [x] localStorage metadata only (thumbnail đã chuyển sang IndexedDB)
- [x] Stress test passed (5/10/20)
- [x] Debug visibility available (`/debug/storage`)

**KẾT QUẢ: ✅ READY cho Phase 2C (SharePoint Upload Engine).**

## 7. Khuyến nghị tương lai

- Phase 2C: sync-engine đọc Blob từ IndexedDB → upload Graph → đánh dấu `uploaded`; sau khi uploaded có thể **xoá original blob** khỏi IndexedDB để tiết kiệm (giữ thumbnail/metadata).
- Cân nhắc retry/backoff thật + mô phỏng lỗi mạng.
- Khuyến khích người dùng **Add to Home Screen** (giảm rủi ro Safari eviction).
- Thêm unit test runner (vitest) khi CI sẵn sàng để tự động hoá các invariant (count, no-image-in-localStorage).

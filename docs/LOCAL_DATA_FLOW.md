# 5S Daily — Local Data Flow (Phase 2A)

> Toàn bộ luồng dữ liệu **chạy cục bộ trên thiết bị**. CHƯA upload SharePoint
> (Phase 2C), CHƯA backend. localStorage là lưu trữ tạm — **không phải** lưu trữ
> cuối cho ảnh.

## Thành phần

| Lớp | File | Vai trò |
|---|---|---|
| Types | `src/types/submission.ts` | `SubmissionSession`, `SessionPhoto`, `CompletedSubmission`, `WatermarkMetadata`, `GeoLocationSnapshot`, `UploadStatus`, `PendingCapture` |
| Store | `src/lib/submissions/local-submission-store.ts` | localStorage (SSR-safe): get/save/clear session, add/remove photo, complete, list/get history |
| Metadata | `src/lib/submissions/metadata.ts` | `buildWatermarkMetadata()` (time/date/weekday/gps) |
| Watermark | `src/lib/watermark/*` | Canvas ghép watermark |
| GPS | `src/hooks/useGeolocation.ts` | snapshot GPS, timeout 5s, không chặn nộp |
| Camera | `src/hooks/useCamera.ts` | getUserMedia + capture frame + secure-context |
| State | `src/features/capture/session-context.tsx` | React mirror trên store + pending capture |

## Luồng

```
/capture   startSession()  → lưu SubmissionSession (draft) vào localStorage
   ↓
/camera    chụp frame thật (capture()) hoặc ảnh mô phỏng + GPS snapshot
           → setPendingCapture({ originalDataUrl, geo, capturedAt })
   ↓
/preview   buildWatermarkMetadata → generateWatermarkedImage (Canvas)
           hiển thị ảnh watermarked
           ├─ Chụp lại → bỏ pending → /camera
           └─ Giữ ảnh  → addPhoto(SessionPhoto{original+watermarked+geo+meta}) → /session
   ↓
/session   review lô ảnh (thumbnail = watermarkedDataUrl), xoá, chụp thêm
           Hoàn tất → Xác nhận nộp → completeSession()
                       → tạo CompletedSubmission(status="local-only")
                       → lưu vào history (localStorage), xoá draft
   ↓
/success   hiển thị CompletedSubmission (số ảnh, thời gian nộp)
/history   list CompletedSubmission từ store
```

## Lưu trữ & quota

- **Draft session:** giữ `originalDataUrl` + `watermarkedDataUrl` (đã downscale ~1280px, JPEG 0.72).
- **History (đã nộp):** strip `originalDataUrl` (rỗng), giữ `watermarkedDataUrl` cho thumbnail.
- Ghi history có **chống vượt quota**: nếu `setItem` lỗi → bỏ bớt entry cũ nhất; cuối cùng giữ metadata-only.

> ⚠️ **localStorage không phải lưu trữ cuối cho ảnh** (quota ~5MB, base64 nặng).
> **Phase 2B nên chuyển sang IndexedDB** để có hàng đợi offline bền vững, lưu
> original full-res + retry upload. **Phase 2C** mới upload SharePoint
> (header `5SSubmissions` + lines `5SSubmissionPhotos`).

## Xử lý lỗi (không crash, tiếng Việt)

| Tình huống | Hành vi |
|---|---|
| Không có quyền camera | Thông báo + nút "Thử lại" + "Dùng ảnh mô phỏng" |
| Insecure context (HTTP IP) | "Camera cần HTTPS hoặc localhost…" + ảnh mô phỏng |
| GPS bị từ chối/không có | Badge "Không lấy được GPS (vẫn nộp được)"; nộp bình thường |
| localStorage không khả dụng | Ghi/đọc trả về an toàn (no-op), app vẫn chạy trong phiên |
| Lỗi xử lý ảnh (watermark) | Preview hiển thị lỗi, nút Giữ ảnh bị khoá, có thể Chụp lại |
| Session trống | /session hiện empty state, "Hoàn tất" bị khoá |
| Refresh giữa phiên | Draft hydrate lại từ localStorage; pending capture (transient) mất → quay về /camera |

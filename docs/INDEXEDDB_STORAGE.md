# 5S Daily — IndexedDB Photo Storage (Phase 2B)

## Vì sao localStorage không đủ

- localStorage quota ~**5MB**/origin, **đồng bộ**, chỉ chứa **string**.
- Ảnh base64 rất nặng: ~3MB/ảnh × 5 ảnh ≈ **15MB → vượt quota**.
- Khi `setItem` vượt quota, nó **ném lỗi/âm thầm thất bại** → đây chính là **gốc bug đếm ảnh** (xem RUN_REPORT Phase 2A.1): React state có 2 ảnh nhưng localStorage chỉ lưu được 1 → success/history hiển thị sai số.

## Chiến lược mới

| Dữ liệu | Lưu ở | Lý do |
|---|---|---|
| Metadata (`SubmissionSession`, `CompletedSubmission`, `QueueItem`, thumbnail nhỏ) | **localStorage** | Nhỏ, truy cập nhanh, đồng bộ |
| Ảnh (`originalBlob`, `watermarkedBlob`, `thumbnailBlob`) | **IndexedDB** | Quota lớn (hàng trăm MB+), lưu Blob nhị phân |

> IndexedDB **không** lưu React state / session object / UI tạm — chỉ binary ảnh.

## Module

| File | Vai trò |
|---|---|
| `src/lib/storage/indexeddb.ts` | Mở DB `5s-daily`, store `photos` (keyPath `photoId`, index `by_submission`), helper transaction. SSR-safe. |
| `src/lib/storage/photo-store.ts` | put/get/delete photo, deleteBySubmission, countPhotos, getStorageUsage, clearAllPhotos |
| `src/lib/storage/storage-types.ts` | `StoredPhoto`, `StorageUsage` |
| `src/lib/storage/image-utils.ts` | `dataUrlToBlob`, `makeThumbnailDataUrl` |

## Mô hình ảnh (StoredPhoto)

```ts
StoredPhoto { photoId, submissionId, originalBlob, watermarkedBlob, thumbnailBlob, createdAt, status }
```

- `submissionId` = `sessionId` (gom ảnh theo lần gửi; index `by_submission`).
- Ghi ở bước **/preview → Giữ ảnh** (sau khi watermark); metadata (kèm `thumbnailDataUrl` nhỏ) vào session localStorage.
- Xoá ảnh / huỷ session → xoá blob tương ứng trong IndexedDB.

## SSR-safe

Mọi hàm kiểm tra `typeof window`/`indexedDB`; trên server trả default an toàn (no-op / 0 / null), không bao giờ chạm IndexedDB khi render server.

## Liên hệ Phase sau

- **2C (SharePoint Upload):** sync-engine đọc `StoredPhoto` từ IndexedDB → PUT `original`/`watermarked` lên Document Library → ghi `5SSubmissions` (header) + `5SSubmissionPhotos` (lines). Hiện chỉ **mock** (không network).

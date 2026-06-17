# 5S Daily — Offline Queue & Sync (Phase 2B)

> Kiến trúc hàng đợi offline-first, **mock** (chưa network/SharePoint). Chuẩn bị cho Phase 2C.

## Mục tiêu

App phải dùng được khi **offline**: vẫn chụp → watermark → nộp. Lần gửi vào hàng đợi `queued`, **chờ online** rồi (sẽ) upload. Phase 2B chỉ dựng **state machine + mock upload**, không gọi mạng.

## State machine

```
draft → ready → queued → uploading → uploaded
                  │            └──(lỗi)──→ failed → (retry) → uploading
                  └──(huỷ)──→ cancelled
```

`QueueStatus = "draft" | "ready" | "queued" | "uploading" | "uploaded" | "failed" | "cancelled"`

## QueueItem

```ts
QueueItem { queueId, submissionId, createdAt, lastAttemptAt?, attemptCount, status }
```

Lưu ở **localStorage** (`5s.queue.v1`) — chỉ metadata nhỏ; ảnh ở IndexedDB.

## Module

| File | Vai trò |
|---|---|
| `src/lib/queue/queue-types.ts` | `QueueItem`, `QueueStatus`, `QueueSummary` |
| `src/lib/storage/queue-store.ts` | Đọc/ghi queue localStorage; phát sự kiện `5s-queue-changed` |
| `src/lib/queue/offline-queue.ts` | enqueueSubmission / updateStatus / getSummary / remove / clear |
| `src/lib/queue/sync-engine.ts` | `processQueue()` — **MOCK** upload: queued → uploading → uploaded (delay 500ms, không network) |
| `src/components/system/SyncRunner.tsx` | Chạy `processQueue()` khi mount (nếu online) + sự kiện `online` |
| `src/hooks/useOnlineStatus.ts` | `navigator.onLine` + sự kiện online/offline |
| `src/hooks/useQueue.ts` | View phản ứng theo `5s-queue-changed` (items + summary) |

## Luồng (mock)

```
completeSession()  → tạo CompletedSubmission (history)
                   → enqueueSubmission(submissionId)  → QueueItem status="queued"
                   → processQueue() nếu online        → uploading → uploaded
Offline: giữ "queued"; khi "online" → SyncRunner gọi processQueue() → uploaded
```

## UI hiển thị

- **Home:** thẻ trạng thái — "✓ Đã đồng bộ" / "⚠ N lần gửi đang chờ đồng bộ" / "❌ N lần gửi lỗi" + 🟢/🔴 online.
- **Banner offline:** dải đỏ trên cùng khi mất mạng.
- **History:** mỗi lần gửi có badge "Đã đồng bộ / Đang chờ đồng bộ / Đang đồng bộ… / Lỗi đồng bộ".
- **/debug/storage** (dev): session, history, queue, số ảnh IndexedDB, dung lượng + nút clear.

## Phase 2C (tương lai)

Thay `mockUploadOne()` bằng upload thật: đọc blob từ IndexedDB (`photo-store`), Graph PUT lên SharePoint Document Library, ghi `5SSubmissions` + `5SSubmissionPhotos`, retry/backoff theo `attemptCount`, đánh dấu `uploaded` hoặc `failed`.

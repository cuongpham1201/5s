# Ban5S — Frontend ↔ SharePoint Field Mapping (Phase 2C.1)

> Đối chiếu model frontend hiện tại (Phase 2A/2B) với schema SharePoint (BAN5S_SCHEMA.md).
> Frontend types: `src/types/submission.ts`, `src/lib/storage/storage-types.ts`, `src/lib/queue/queue-types.ts`.
> SharePoint types: `src/types/sharepoint.ts`.
>
> **Cấu trúc (2C.1A):** Document Library **"5S"** chứa 3 thư mục THẬT `img` /
> `ListConfig` / `ListData`. Ảnh → `5S/img/...`. Dữ liệu có cấu trúc → Lists cấp
> site `Config_*`/`Data_*` (nhóm logic về ListConfig/ListData).

## Entity mapping

| Frontend | SharePoint | Ghi chú |
|---|---|---|
| `SubmissionSession` (draft) | — | chỉ tồn tại cục bộ; KHÔNG ghi SharePoint |
| `CompletedSubmission` | `Data_Submissions` (1 dòng) | nguồn để tạo header |
| `SessionPhoto` (metadata) + `StoredPhoto` (blob IndexedDB) | `Data_SubmissionPhotos` (1 dòng/ảnh) + file trong `img` | blob → upload `img`, URL → line |
| `QueueItem` | `Data_SyncLogs` (+ cột `Data_Submissions.SyncStatus`) | log mỗi lần thử |
| `DEPARTMENTS` (mock) | `Config_Departments` | thay mock bằng đọc list |
| `AREAS` (mock) | `Config_Areas` | |
| `ROLE_WHITELIST` (mock) | `Config_RoleMapping` | |
| (Settings runtime) | `Config_Settings` | deadline, timezone... |

## Field mapping — CompletedSubmission → Data_Submissions

| Frontend (`CompletedSubmission`) | SharePoint (`SubmissionRecord`) |
|---|---|
| `submissionId` | `SubmissionId` (+ `Title`) |
| `departmentCode` | `DepartmentCode` |
| `areaCode` | `AreaCode` |
| `areaName` | `AreaName` |
| `reporterName` | `ReporterName` |
| `reporterEmail` | `ReporterEmail` |
| `photoCount` | `PhotoCount` |
| `submittedAt` (ISO) → ngày | `SubmissionDate` (date, giờ VN) |
| `submittedAt` | `SubmittedAt` |
| (ảnh đầu) `latitude/longitude/address` | `Latitude/Longitude/Address` |
| `status` (`local-only`...) → | `Status` = complete/partial/flagged |
| (từ queue) | `SyncStatus` = queued/uploading/uploaded/failed |

## Field mapping — SessionPhoto/StoredPhoto → Data_SubmissionPhotos

| Frontend | SharePoint (`SubmissionPhotoRecord`) |
|---|---|
| `photoId` | `PhotoId` (+ `Title`) |
| `submissionId` | `SubmissionId` |
| (thứ tự) | `SeqNo` |
| `StoredPhoto.originalBlob` → upload | `OriginalPhotoUrl` |
| `StoredPhoto.watermarkedBlob` → upload | `WatermarkedPhotoUrl` |
| `capturedAt` | `CaptureTime` |
| `latitude/longitude/address` | `Latitude/Longitude/Address` |

## Field mapping — QueueItem → Data_SyncLogs

| Frontend (`QueueItem`) | SharePoint (`SyncLogRecord`) |
|---|---|
| `queueId` | `QueueId` (+ `Title`) |
| `submissionId` | `SubmissionId` |
| `status` | `Status` |
| `attemptCount` | `AttemptCount` |
| (lỗi) | `Message` |
| `lastAttemptAt` / now | `Timestamp` |

## Mismatches / cần xử lý ở Phase 2C.2

1. **`UploadStatus` vs `SyncStatus`:** frontend dùng `local-only/pending-upload/uploading/uploaded/failed`; SharePoint `SyncStatus` = `queued/uploading/uploaded/failed`. → cần hàm map (`local-only`→`queued`).
2. **`SubmissionId` format:** frontend hiện `sub-<epoch>` (sessionId). SharePoint muốn `SUB-YYYYMMDD-####`. → cấp/format lại khi upload (giữ map epoch↔SUB id, hoặc đổi cách sinh id ở client).
3. **`SubmissionDate`:** frontend chưa lưu tách ngày; suy từ `submittedAt` theo giờ VN khi map.
4. **GPS ở header:** frontend GPS ở từng ảnh; header lấy đại diện (ảnh đầu) — cần quyết định (ảnh đầu vs none).
5. **Reverse geocoding:** `Address` hiện "Chưa xác định địa chỉ"; chưa có địa chỉ thật.
6. **Tên list cũ:** SHAREPOINT_SCHEMA.md (Phase 0) dùng `5SSubmissions/5SSubmissionPhotos/...`; **schema cuối cùng** dùng tên Ban5S (`Data_*`, `Config_*`). Doc Phase 0 giữ làm lịch sử; BAN5S_SCHEMA.md là nguồn chuẩn.

> Các mismatch trên **không chặn** provisioning; chúng là việc của Upload Engine (2C.2) ở tầng mapping.

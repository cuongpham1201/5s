# Ban5S — Graph Integration Plan (Phase 2C.1 → 2C.2)

> Kế hoạch dùng Microsoft Graph cho upload + ghi metadata + sync. 2C.1 chỉ dựng
> foundation READ-ONLY (`src/lib/sharepoint/`). Phần WRITE/upload là **2C.2**.

## Auth (app-only, client credentials)
- App registration với Graph application permission **`Sites.Selected`** (grant trên site Ban5S).
- Env: `GRAPH_CLIENT_ID`, `GRAPH_CLIENT_SECRET`, `GRAPH_TENANT_ID`.
- Token endpoint: `POST https://login.microsoftonline.com/{tenant}/oauth2/v2.0/token` scope `https://graph.microsoft.com/.default`.
- `getAppOnlyToken()` (graph-client.ts) hiện ném 501 — 2C.2 cài MSAL `ConfidentialClientApplication`.
- Token chỉ ở **server (BFF)**, không lộ client (đúng SECURITY_MODEL).

## Phase 2C.2A — Reality check BẮT BUỘC trước khi upload
Engine phải xác minh cấu trúc đã tồn tại trước khi ghi bất cứ gì:
```
GET /sites/{hostname}:{/sites/Ban5S}             → siteId           (siteLookupPath)
GET /sites/{siteId}/drives?$select=id,name       → tìm drive "5S"   (resolveLibraryDrive)
GET /drives/{driveId}/root/children?$select=name → verify có: img, ListConfig, ListData
                                                   (listLibraryRootChildren / verifyExpectedFolders)
GET /sites/{siteId}/lists?$select=id,name        → verify/tạo Config_* & Data_*  (findListId)
```
- Nếu thiếu thư mục `img`/`ListConfig`/`ListData` → **DỪNG**, báo người dùng (không tự tạo trùng/đổi tên).
- Chỉ khi health check PASS mới chạy upload.

## Resolve (foundation read-only đã có)
- `resolveLibraryDrive(client, siteId)` → drive của Document Library **"5S"** (img là **thư mục** bên trong, KHÔNG phải drive).
- `verifyExpectedFolders(client, driveId)` → {present, missing} cho img/ListConfig/ListData.
- `findListId(client, siteId, "Data_Submissions")` → listId.

## Upload flow (2C.2) — cho mỗi lần gửi (N ảnh)
```
1. Tạo header item:
   POST /sites/{siteId}/lists/{Data_Submissions}/items
   { fields: { Title, SubmissionId, DepartmentCode, ... SyncStatus: "uploading" } }

2. Đảm bảo cây thư mục trong drive "5S": img/2026/06/PMKT/SUB-...  (ensure-folder)
   (driveId = drive của library "5S"; img là thư mục gốc đã tồn tại)

3. Với mỗi ảnh (đọc Blob từ IndexedDB photo-store); đường dẫn = imgFilePath(...):
   - ≤4MB:  PUT  /drives/{driveId}/root:/img/2026/06/PMKT/SUB-XXXX/original-01.jpg:/content
            PUT  /drives/{driveId}/root:/img/2026/06/PMKT/SUB-XXXX/watermarked-01.jpg:/content
   - >4MB:  createUploadSession (chunked)
   - POST line: /lists/{Data_SubmissionPhotos}/items
            { fields: { Title:PhotoId, SubmissionId, SeqNo, OriginalPhotoUrl, WatermarkedPhotoUrl, CaptureTime, ... } }

4. PATCH header: { PhotoCount, SyncStatus: "uploaded", Status: "complete" }
5. POST /lists/{Data_SyncLogs}/items  { QueueId, SubmissionId, Status:"uploaded", AttemptCount, Timestamp }
```

## Sync strategy
- Thay `mockUploadOne()` (sync-engine.ts) bằng `uploadSubmission(submissionId)` thật.
- Đọc queue (`offline-queue`) → mỗi item: set `uploading` → upload → `uploaded`/`failed` (+ ghi SyncLogs).
- Retry/backoff theo `attemptCount`; tôn trọng `Retry-After` (throttling).
- Idempotency: `SubmissionId`/`PhotoId` unique-indexed; PUT ghi đè cùng tên file → retry an toàn.
- Sau `uploaded`: cân nhắc xóa `originalBlob` khỏi IndexedDB để tiết kiệm (giữ thumbnail/metadata).

## Dọn dẹp / đối soát
- Job đối soát `img` ↔ `Data_SubmissionPhotos` để bắt file mồ côi (metadata fail sau khi file đã lên) — future.

## Ranh giới 2C.1 (đã làm) vs 2C.2 (chưa)
| 2C.1 (foundation) | 2C.2 (engine) |
|---|---|
| URL builders, read-only GET wrapper, mappers, types, config | token app-only thật, create item, upload file, PATCH, SyncLogs, retry |
| `getAppOnlyToken()` = 501 stub | MSAL client-credentials |
| Không mutation | Mutations + upload |

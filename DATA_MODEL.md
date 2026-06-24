# 5S Daily — Data Model, Dashboard & Reporting (Phase 0)

> Metadata schema chi tiết + công thức KPI + mô hình báo cáo.

---

## 1. Quy ước

- Nguồn sự thật metadata: list **`5SSubmissions`**.
- Khóa nghiệp vụ: `SubmissionID` (ULID sinh client).
- Múi giờ chuẩn: **Asia/Ho_Chi_Minh (UTC+7)** — mọi tính toán "ngày" theo giờ VN, không theo UTC (tránh lệch ngày lúc nửa đêm).

---

## 2. Metadata Schema — mô hình **1 Submission = N Photos** (Phase 1C)

> **Thay đổi quan trọng (Phase 1C):** trước đây 1 submission = 1 ảnh. Nay **1 lần gửi (submission) chứa N ảnh**. Model chuẩn hóa thành **header–lines**: bảng header `5SSubmissions` (1 dòng/lần gửi) + bảng lines `5SSubmissionPhotos` (1 dòng/ảnh), nối bằng `SubmissionID`. Lý do: người dùng chụp nhiều khu vực/góc trong 1 phiên rồi nộp một lần; tách lines giúp đếm ảnh, lọc theo khu vực, và anti-fraud theo từng ảnh.

### 2a. `5SSubmissions` (HEADER — 1 dòng / lần gửi)

| # | Field | Type | Required | Indexed | Searchable | Mô tả |
|---|-------|------|:---:|:---:|:---:|-------|
| 1 | **SubmissionID** | Text (ULID) | ✅ | ✅ (unique) | ✅ | Khóa nghiệp vụ, idempotency |
| 2 | **Department** | Lookup/Text | ✅ | ✅ | ✅ | Mã đơn vị (PMKT...) — readonly từ user |
| 3 | **Reporter** | Text | ✅ | ➖ | ✅ | Tên người chụp (display) |
| 4 | **ReporterEmail** | Text | ✅ | ✅ | ✅ | Định danh user M365 |
| 5 | **SubmittedAt** | DateTime | ✅ | ✅ | ➖ | Thời điểm bấm "Xác nhận nộp" (client) |
| 6 | **SubmissionDate** | Date | ✅ | ✅ | ➖ | Ngày (giờ VN) — **cột tính KPI chính** |
| 7 | **PhotoCount** | Number | ✅ | ➖ | ➖ | Số ảnh trong lần gửi (= COUNT lines) |
| 8 | **Areas** | Text | ⬜ | ➖ | ✅ | Danh sách khu vực phủ trong lần gửi (denormalized, tiện hiển thị) |
| 9 | **Source** | Choice | ✅ | ➖ | ➖ | `online` / `offline-sync` |
| 10 | **Status** | Choice | ✅ | ✅ | ➖ | `complete` / `partial` / `flagged` |
| 11 | **AppVersion** | Text | ⬜ | ➖ | ➖ | Phiên bản PWA |
| 12 | **CreatedAt** | DateTime | ✅ | ✅ | ➖ | Server timestamp khi ghi header |
| 13 | **CreatedBy** | Person | auto | ➖ | ✅ | SharePoint system field |

### 2b. `5SSubmissionPhotos` (LINES — 1 dòng / ảnh)

| # | Field | Type | Required | Indexed | Searchable | Mô tả |
|---|-------|------|:---:|:---:|:---:|-------|
| 1 | **PhotoID** | Text (ULID) | ✅ | ✅ (unique) | ➖ | Khóa ảnh, idempotency từng ảnh |
| 2 | **SubmissionID** | Lookup → 5SSubmissions | ✅ | ✅ | ➖ | Thuộc lần gửi nào (FK logic) |
| 3 | **Department** | Text | ✅ | ✅ | ✅ | Sao chép từ header (tiện query/threshold) |
| 4 | **Area** | Text | ✅ | ✅ | ✅ | Khu vực của **ảnh này** (mỗi ảnh có thể khác khu vực) |
| 5 | **SubmissionDate** | Date | ✅ | ✅ | ➖ | Sao chép từ header (filter KPI) |
| 6 | **PhotoTime** | DateTime | ✅ | ✅ | ➖ | Thời điểm chụp ảnh (client) |
| 7 | **SeqNo** | Number | ✅ | ➖ | ➖ | Thứ tự ảnh trong lần gửi (1..N) |
| 8 | **Latitude** | Number | ⬜ | ➖ | ➖ | null nếu GPS lỗi |
| 9 | **Longitude** | Number | ⬜ | ➖ | ➖ | null nếu GPS lỗi |
| 10 | **Address** | Text | ⬜ | ➖ | ✅ | Reverse-geocode; null nếu offline |
| 11 | **GeoStatus** | Choice | ✅ | ➖ | ➖ | `ok` / `unavailable` / `denied` |
| 12 | **OriginalPhotoUrl** | Text/URL | ✅ | ➖ | ➖ | Đường dẫn original.jpg |
| 13 | **WatermarkedPhotoUrl** | Text/URL | ✅ | ➖ | ➖ | Đường dẫn watermarked.jpg |
| 14 | **ContentHash** | Text | ⬜ | ✅ | ➖ | SHA-256 ảnh gốc — chống ảnh trùng (anti-fraud) |
| 15 | **DeviceInfo** | Text | ⬜ | ➖ | ➖ | UA/model (debug & fraud) |
| 16 | **CreatedAt** | DateTime | ✅ | ✅ | ➖ | Server timestamp khi ghi line |

### 2.1 Lưu ý thiết kế

- **Header–lines, nối bằng `SubmissionID`:** ràng buộc giữ ở tầng app (BFF) — không có FK cứng trong SharePoint. Ghi header trước, rồi N lines; `PhotoCount` đối soát với số lines.
- **`Area` ở line, không ở header:** mỗi ảnh có thể thuộc khu vực khác nhau trong cùng lần gửi → phục vụ "phủ đủ khu vực" (§3.4) và lọc Gallery theo Area.
- **Denormalize có chủ đích:** `Department`, `SubmissionDate` copy xuống line để query/threshold trên list lines mà không phải join header.
- **`SubmissionDate` tách khỏi thời gian:** KPI tính theo *ngày* (giờ VN), cột Date indexed để filter nhanh.
- **`PhotoTime` (client) vs `CreatedAt` (server):** chênh lệch lớn = tín hiệu ảnh cũ / sync trễ (anti-fraud).
- **`ContentHash`** ở line: phát hiện ảnh trùng từng tấm. MVP chỉ tính & lưu.
- **`GeoStatus`** tách khỏi lat/lng để phân biệt "0,0 hợp lệ" với "không có GPS".

### 2.2 Indexing strategy (5000-view-threshold)

- `5SSubmissions` indexed: `SubmissionID`, `Department`, `ReporterEmail`, `SubmittedAt`, `SubmissionDate`, `Status`, `CreatedAt`.
- `5SSubmissionPhotos` indexed: `PhotoID`, `SubmissionID`, `Department`, `Area`, `SubmissionDate`, `PhotoTime`, `ContentHash`, `CreatedAt`.
→ Lines tăng nhanh hơn (N ảnh/lần) nên **bắt buộc** filter theo cột indexed (`Department`/`SubmissionDate`) và cân nhắc archive theo năm sớm hơn.

---

### 2c. Frontend data model (Phase 2A — local, chưa upload)

Nguồn type chuẩn: **`src/types/submission.ts`**. Lưu cục bộ qua
`src/lib/submissions/local-submission-store.ts` (localStorage, SSR-safe).

**Tách lưu trữ (Phase 2B):** metadata ở **localStorage**, ảnh nhị phân ở **IndexedDB**.

```ts
// localStorage (metadata-only — KHÔNG image payload, Phase 2B.1)
SessionPhoto { photoId, submissionId, capturedAt,
  watermarkMetadata, latitude, longitude, address, status: "draft"|"ready" }
SubmissionSession { sessionId, ...header, photos: SessionPhoto[] }       // sessionId = submissionId
CompletedSubmission { submissionId, ...header, submittedAt, photoCount, photos, status: UploadStatus }
QueueItem { queueId, submissionId, createdAt, lastAttemptAt?, attemptCount, status: QueueStatus }

// IndexedDB (nặng) — src/lib/storage/photo-store.ts
StoredPhoto { photoId, submissionId, originalBlob, watermarkedBlob, thumbnailBlob, createdAt, status }

WatermarkMetadata { time, date, weekday, address, department, area, reporter, gps, verifiedText }
GeoLocationSnapshot { latitude, longitude, accuracy, capturedAt, status, address }
UploadStatus = "local-only" | "pending-upload" | "uploading" | "uploaded" | "failed"
QueueStatus  = "draft" | "ready" | "queued" | "uploading" | "uploaded" | "failed" | "cancelled"
```

- **Bug đếm ảnh (Phase 2A.1) đã sửa:** trước đây data URL nặng được nhồi vào localStorage → vượt quota → save thất bại âm thầm → số ảnh lệch. Nay ảnh ở IndexedDB, session metadata nhỏ → `photoCount = photos.length` đáng tin. Xem RUN_REPORT.
- **Watermark ghép thật** (Canvas) ở `/preview`; blob `original`+`watermarked`+`thumbnail` ghi IndexedDB. Thumbnail hiển thị qua object URL (`<PhotoThumb>`), **không** lưu base64 trong localStorage (Phase 2B.1 — localStorage metadata-only).
- `completeSession()` → `CompletedSubmission(status="local-only")` + tạo `QueueItem(queued)`; mock sync → `uploaded`. **Chưa** ghi SharePoint thật.
- **Ánh xạ backend (2C):** `CompletedSubmission` → 1 header list **`Data_Submissions`**; mỗi `SessionPhoto`/`StoredPhoto` → 1 line **`Data_SubmissionPhotos`** + 2 file trong Document Library **"5S"** thư mục `img/YYYY/MM/Dept/SubmissionId/`. Schema chuẩn: `docs/sharepoint/BAN5S_SCHEMA.md` (đã sửa 2C.1A: img/ListConfig/ListData là **thư mục thật** trong library "5S").

### 2d. Config_Departments = org-synced snapshot (Phase 2C.2C)

`Config_Departments` **KHÔNG** phải dữ liệu nhập tay/mock cố định. Nó là **bản chụp đồng bộ** từ nguồn tổ chức hiện tại ("OG hiện tại") do business/admin cung cấp.

- **Khóa chính:** `DepartmentCode`. **Tên hiển thị:** `DepartmentName`. Giữ `IsActive`, `SortOrder`.
- **Sync = upsert theo `DepartmentCode`:** tồn tại → cập nhật name/metadata; mới → tạo; **thiếu trong nguồn → đặt `IsActive=false` (KHÔNG xoá).**
- Nguồn cấu hình qua env `ORG_DEPARTMENT_SOURCE` (`graph` = Entra users' `department`; `mock` = fallback dev). Code: `src/lib/sharepoint/org-source.ts` + `importDepartmentsFromOrgSource()`.
- Endpoint: `POST /api/admin/sharepoint/import-departments`. Mock seed (`seed-config`) **chỉ chạy ở dev**.

## 3. Dashboard Data Model — công thức KPI

### 3.1 Khái niệm nền

- **Expected Units (E):** số đơn vị `IsActive=true` trong `5SDepartments`.
- **Submitted Units hôm nay:** số đơn vị *distinct* có ≥1 **lần gửi** (`5SSubmissions`) với `SubmissionDate = today`. (Một lần gửi nay chứa N ảnh — vẫn tính 1 đơn vị "đã gửi".)
- **Working Day:** ngày tính kỳ vọng. Mặc định loại trừ cuối tuần + ngày lễ (cấu hình trong `5SSettings`). → quan trọng cho mẫu số Completion.

### 3.2 Today Completion

```
TodayCompletion = SubmittedUnitsToday / ExpectedUnits
SubmittedUnitsToday = COUNT(DISTINCT Department WHERE SubmissionDate = today AND Status != 'flagged')
MissingUnitsToday   = Departments(active) \ SubmittedUnitsToday   (phép trừ tập hợp)
```

### 3.3 Weekly / Monthly Completion (theo đơn vị)

Định nghĩa theo **đơn vị × ngày làm việc**:

```
ExpectedDays(unit, period)  = số working-day trong kỳ (đơn vị active suốt kỳ)
SubmittedDays(unit, period) = COUNT(DISTINCT SubmissionDate WHERE Department=unit AND date ∈ period)
CompletionRate(unit, period) = SubmittedDays / ExpectedDays      (0..1 → %)
```

Tổng hợp toàn công ty:
```
OverallCompletion(period) = Σ SubmittedDays(unit) / Σ ExpectedDays(unit)   (trên mọi unit active)
```

> Lưu ý: completion tính theo **ngày có gửi**, KHÔNG theo số ảnh. Gửi 1 hay 5 ảnh trong ngày đều tính "đã hoàn thành ngày đó" (trừ khi sau này yêu cầu "đủ mọi khu vực" — xem biến thể bên dưới).

### 3.4 Biến thể "đủ khu vực" (partial day) — phục vụ Calendar Heatmap

Heatmap có 3 trạng thái (xanh/cam/đỏ). Cần khái niệm "đủ":
```
RequiredAreas(unit)  = COUNT(5SAreas WHERE Department=unit AND IsActive)
CoveredAreas(unit,d) = COUNT(DISTINCT Area in 5SSubmissionPhotos WHERE Department=unit AND SubmissionDate=d)

DayStatus(unit, d):
  - 'ok'      nếu CoveredAreas >= RequiredAreas (hoặc >=1 nếu không cấu hình required)
  - 'partial' nếu 0 < CoveredAreas < RequiredAreas
  - 'miss'    nếu CoveredAreas = 0  và d là working-day  và d <= today
  - 'weekend' nếu d là cuối tuần/lễ
  - 'future'  nếu d > today
```

> **Câu hỏi mở:** "hoàn thành" = gửi ≥1 ảnh/ngày, hay = phủ đủ mọi khu vực active? Ảnh hưởng trực tiếp công thức. Xem RISKS_AND_DECISIONS.md. MVP đề xuất: **≥1 ảnh/ngày = ok**, partial/required là tính năng bật được qua `5SSettings`.

### 3.5 Missing Units (Pending)

```
PendingToday = [ unit ∈ ExpectedUnits | DayStatus(unit, today) ∈ {miss} ]
+ kèm: lastSubmissionDate(unit), photoCountToday(unit)
```

### 3.6 Top Units (Ranking, theo tháng)

```
Rank theo CompletionRate(unit, month) DESC,
  tie-break: PhotoCount(unit, month) DESC, rồi SubmittedDays DESC
PhotoCount(unit, period) = COUNT(rows in 5SSubmissionPhotos WHERE Department=unit AND date ∈ period)
                         = Σ PhotoCount(header) cho các lần gửi 'complete' trong kỳ
```

### 3.7 Calendar Heatmap data shape

```
{
  period: "2026-06",
  days: ["01".."30"],              // kèm cờ isWorkingDay
  units: [
    { code:"PMKT", cells: [ {day:"01", status:"ok"}, ... {day:"15", status:"miss"} ] },
    ...
  ]
}
```
Tính bằng cách group submissions theo (Department, SubmissionDate, distinct Area) rồi map qua `DayStatus`.

### 3.8 Caching

- KPI hôm nay: cache server TTL ngắn (vd 60s) + invalidate khi có submission mới của ngày đó.
- Heatmap/tháng: cache theo (period) TTL vài phút; tháng quá khứ gần như bất biến → cache dài.

---

## 4. Reporting Model — Excel Export (§9)

### 4.1 Báo cáo tháng theo đơn vị (sheet chính)

| Department | Department Name | Expected Days | Submitted Days | Completion Rate | Photo Count | Missing Days |
|---|---|---|---|---|---|---|
| PMKT | Phòng Marketing | 22 | 21 | 95.5% | 198 | 12/06 |
| PXHL | PX Hơi lạnh | 22 | 16 | 72.7% | 131 | 09,10,14,15/06 |
| ... | | | | | | |
| **TỔNG** | | Σ | Σ | **Overall %** | Σ | |

### 4.2 Sheet phụ (đề xuất, có thể bổ sung)

- **Daily Detail:** từng submission (SubmissionID, Department, Area, Reporter, PhotoTime, GeoStatus, Status, link ảnh).
- **Missing Matrix:** ma trận đơn vị × ngày (giống heatmap, dạng ✓/✗) để in ra dán bảng.
- **Summary:** Overall completion, tổng ảnh, top/bottom đơn vị.

### 4.3 Kỹ thuật

- Sinh phía **server** (BFF) bằng thư viện xlsx (vd `exceljs`) → trả file `.xlsx`.
- Tham số: `month`, optional `department`.
- Dữ liệu lấy từ aggregation đã dùng cho dashboard (tái sử dụng, nhất quán số liệu).
- Ghi `5SAuditLog` action=`EXPORT`.
- Định dạng số %, freeze header, tô màu Completion (<70% đỏ, 70–90% cam, ≥90% xanh) để khớp ngôn ngữ dashboard.

### 4.4 PDF (future)
Báo cáo có ảnh đại diện/đơn vị — Phase sau, không MVP.

---

## 5. API surface (định hướng cho Phase 1, chưa implement)

| Endpoint | Method | Mô tả |
|---|---|---|
| `/api/me` | GET | Profile + Department + Role (từ token + 5SUserMap) |
| `/api/areas?department=` | GET | Danh sách khu vực động |
| `/api/submissions` | POST | Tạo submission (metadata) sau khi upload ảnh |
| `/api/submissions/upload` | POST/PUT | Lấy upload session / nhận blob → SharePoint |
| `/api/submissions/me?range=` | GET | Lịch sử cá nhân/đơn vị |
| `/api/dashboard/today` | GET | KPI hôm nay |
| `/api/dashboard/heatmap?month=` | GET | Dữ liệu heatmap |
| `/api/dashboard/ranking?month=` | GET | Xếp hạng |
| `/api/units/:code` | GET | Unit Detail |
| `/api/photos?filters` | GET | Gallery (phân trang) |
| `/api/export?month=` | GET | Xuất Excel |

> Tất cả endpoint qua Auth.js session + RBAC (xem SECURITY_MODEL.md). Đây là *thiết kế*, không phải code.

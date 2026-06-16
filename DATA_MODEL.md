# 5S Daily — Data Model, Dashboard & Reporting (Phase 0)

> Metadata schema chi tiết + công thức KPI + mô hình báo cáo.

---

## 1. Quy ước

- Nguồn sự thật metadata: list **`5SSubmissions`**.
- Khóa nghiệp vụ: `SubmissionID` (ULID sinh client).
- Múi giờ chuẩn: **Asia/Ho_Chi_Minh (UTC+7)** — mọi tính toán "ngày" theo giờ VN, không theo UTC (tránh lệch ngày lúc nửa đêm).

---

## 2. Metadata Schema — `5SSubmissions`

| # | Field | Type | Required | Indexed | Searchable | Mô tả |
|---|-------|------|:---:|:---:|:---:|-------|
| 1 | **SubmissionID** | Text (ULID) | ✅ | ✅ (unique) | ✅ | Khóa nghiệp vụ, idempotency |
| 2 | **Department** | Lookup/Text | ✅ | ✅ | ✅ | Mã đơn vị (PMKT...) — readonly từ user |
| 3 | **Area** | Text | ✅ | ➖ | ✅ | Khu vực chụp |
| 4 | **Reporter** | Text | ✅ | ➖ | ✅ | Tên người chụp (display) |
| 5 | **ReporterEmail** | Text | ✅ | ✅ | ✅ | Định danh user M365 |
| 6 | **PhotoTime** | DateTime | ✅ | ✅ | ➖ | Thời điểm chụp (client) |
| 7 | **SubmissionDate** | Date | ✅ | ✅ | ➖ | Ngày (theo giờ VN) — **cột tính KPI chính** |
| 8 | **Latitude** | Number | ⬜ | ➖ | ➖ | Có thể null nếu GPS lỗi |
| 9 | **Longitude** | Number | ⬜ | ➖ | ➖ | Có thể null |
| 10 | **Address** | Text | ⬜ | ➖ | ✅ | Reverse-geocode; null nếu offline |
| 11 | **GeoStatus** | Choice | ✅ | ➖ | ➖ | `ok` / `unavailable` / `denied` |
| 12 | **OriginalPhotoUrl** | Text/URL | ✅ | ➖ | ➖ | Đường dẫn original.jpg |
| 13 | **WatermarkedPhotoUrl** | Text/URL | ✅ | ➖ | ➖ | Đường dẫn watermarked.jpg |
| 14 | **DeviceInfo** | Text | ⬜ | ➖ | ➖ | UA/model (hỗ trợ debug & fraud) |
| 15 | **AppVersion** | Text | ⬜ | ➖ | ➖ | Phiên bản PWA |
| 16 | **Source** | Choice | ✅ | ➖ | ➖ | `online` / `offline-sync` |
| 17 | **Status** | Choice | ✅ | ✅ | ➖ | `complete` / `partial` / `flagged` |
| 18 | **ContentHash** | Text | ⬜ | ✅ | ➖ | SHA-256 ảnh gốc — chống ảnh trùng (anti-fraud) |
| 19 | **CreatedAt** | DateTime | ✅ | ✅ | ➖ | Server timestamp khi ghi item |
| 20 | **CreatedBy** | Person | auto | ➖ | ✅ | SharePoint system field |

### 2.1 Lưu ý thiết kế

- **`SubmissionDate` tách khỏi `PhotoTime`:** KPI tính theo *ngày*; tách ra cột Date riêng (indexed) để filter nhanh, không phải xử lý datetime từng query. Tính ở server theo giờ VN.
- **`PhotoTime` (client) vs `CreatedAt` (server):** chênh lệch lớn = tín hiệu ảnh cũ / đồng bộ trễ (anti-fraud + minh bạch offline).
- **`ContentHash`:** SHA-256 của ảnh gốc, indexed → phát hiện gửi trùng ảnh (xem RISKS anti-fraud). MVP có thể chỉ tính & lưu, chưa chặn.
- **`GeoStatus`:** tách khỏi lat/lng để phân biệt "0,0 hợp lệ" với "không có GPS".
- **Không lưu PII thừa:** chỉ tên + email công ty; không số điện thoại/dữ liệu nhạy cảm.

### 2.2 Indexing strategy (do giới hạn 5000-view-threshold)

Cột **indexed bắt buộc**: `SubmissionID`, `Department`, `ReporterEmail`, `PhotoTime`, `SubmissionDate`, `Status`, `ContentHash`, `CreatedAt`.
→ Mọi query dashboard phải filter trước hết trên `Department` và/hoặc `SubmissionDate`.

---

## 3. Dashboard Data Model — công thức KPI

### 3.1 Khái niệm nền

- **Expected Units (E):** số đơn vị `IsActive=true` trong `5SDepartments`.
- **Submitted Units hôm nay:** số đơn vị *distinct* có ≥1 submission với `SubmissionDate = today`.
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
CoveredAreas(unit,d) = COUNT(DISTINCT Area WHERE Department=unit AND SubmissionDate=d)

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
PhotoCount(unit, period) = COUNT(submissions WHERE Department=unit AND date ∈ period AND Status='complete')
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

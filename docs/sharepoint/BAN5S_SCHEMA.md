# Ban5S — Final SharePoint Schema (Phase 2C.1)

> Site: **https://biahalong.sharepoint.com/sites/Ban5S**
> Containers (đã chốt, không thêm mới): **ListConfig**, **ListData**, **img**.
>
> **Quyết định/giả định:** SharePoint **lists không lồng nhau** (flat tại site).
> Vì vậy `ListConfig`/`ListData` được hiện thực bằng **tiền tố internal name**
> (`Config_*` / `Data_*`) — đóng vai trò namespace logic. `img` là **Document
> Library** thật (hỗ trợ folder). Nếu tổ chức muốn cách khác (vd 1 list gộp),
> xem Open Question trong BAN5S_PROVISION_PLAN.md.

Quy ước chung:
- Mọi list có cột hệ thống **Title** (bắt buộc). Với mỗi list, Title = khóa nghiệp vụ (đặt = mã/khóa để dễ đọc); cột canonical vẫn được khai báo riêng và indexed.
- Kiểu cột SharePoint: Text = "Single line of text", Note = "Multiple lines", Number, YesNo, DateTime, Choice, URL.
- Múi giờ tính ngày: Asia/Ho_Chi_Minh.

---

## ListConfig (cấu hình)

### Config_Departments — "Departments"
| Internal Name | Display | Type | Required | Indexed | Notes |
|---|---|---|:---:|:---:|---|
| Title | Title | Text | ✅ | ✅(unique) | = DepartmentCode (đặt cho dễ đọc) |
| DepartmentCode | Department Code | Text | ✅ | ✅(unique) | PMKT, PXHL... (canonical) |
| DepartmentName | Department Name | Text | ✅ | ➖ | |
| DepartmentManager | Manager | Text | ⬜ | ➖ | tên/email người phụ trách |
| DepartmentEmail | Email | Text | ⬜ | ➖ | nhận nhắc nhở (future) |
| IsActive | Active | YesNo | ✅ | ✅ | mặc định Yes; lọc Expected Units |
| SortOrder | Sort Order | Number | ⬜ | ➖ | thứ tự hiển thị |

### Config_Areas — "Areas"
| Internal Name | Display | Type | Required | Indexed | Notes |
|---|---|---|:---:|:---:|---|
| Title | Title | Text | ✅ | ✅ | = AreaCode |
| AreaCode | Area Code | Text | ✅ | ✅ | duy nhất trong 1 department |
| AreaName | Area Name | Text | ✅ | ➖ | |
| DepartmentCode | Department Code | Text | ✅ | ✅ | FK → Departments |
| IsActive | Active | YesNo | ✅ | ➖ | |
| SortOrder | Sort Order | Number | ⬜ | ➖ | |

### Config_Settings — "Settings"
| Internal Name | Display | Type | Required | Indexed | Notes |
|---|---|---|:---:|:---:|---|
| Title | Title | Text | ✅ | ✅(unique) | = Key |
| Key | Key | Text | ✅ | ✅ | vd deadlineHour, timezone, geofenceRadius |
| Value | Value | Text | ✅ | ➖ | |
| Description | Description | Note | ⬜ | ➖ | |

### Config_RoleMapping — "RoleMapping"
| Internal Name | Display | Type | Required | Indexed | Notes |
|---|---|---|:---:|:---:|---|
| Title | Title | Text | ✅ | ✅(unique) | = Email |
| Email | Email | Text | ✅ | ✅ | định danh M365 |
| Role | Role | Choice | ✅ | ✅ | employee / environment / admin |
| DepartmentCode | Department Code | Text | ⬜ | ✅ | đơn vị của user |
| IsActive | Active | YesNo | ✅ | ➖ | |

---

## ListData (nghiệp vụ)

### Data_Submissions — "Submissions" (HEADER, 1 dòng/lần gửi)
| Internal Name | Display | Type | Required | Indexed | Notes |
|---|---|---|:---:|:---:|---|
| Title | Title | Text | ✅ | ✅(unique) | = SubmissionId |
| SubmissionId | Submission Id | Text | ✅ | ✅(unique) | SUB-YYYYMMDD-#### (idempotency) |
| DepartmentCode | Department Code | Text | ✅ | ✅ | |
| AreaCode | Area Code | Text | ✅ | ✅ | |
| AreaName | Area Name | Text | ✅ | ➖ | denormalized |
| ReporterName | Reporter Name | Text | ✅ | ➖ | |
| ReporterEmail | Reporter Email | Text | ✅ | ✅ | |
| PhotoCount | Photo Count | Number | ✅ | ➖ | = số line |
| SubmissionDate | Submission Date | DateTime (date) | ✅ | ✅ | **cột KPI chính** |
| SubmittedAt | Submitted At | DateTime | ✅ | ✅ | |
| Latitude | Latitude | Number | ⬜ | ➖ | đại diện (ảnh đầu) |
| Longitude | Longitude | Number | ⬜ | ➖ | |
| Address | Address | Text | ⬜ | ➖ | |
| Status | Status | Choice | ✅ | ✅ | complete / partial / flagged |
| SyncStatus | Sync Status | Choice | ✅ | ✅ | queued / uploading / uploaded / failed |

### Data_SubmissionPhotos — "SubmissionPhotos" (LINES, 1 dòng/ảnh)
| Internal Name | Display | Type | Required | Indexed | Notes |
|---|---|---|:---:|:---:|---|
| Title | Title | Text | ✅ | ✅(unique) | = PhotoId |
| PhotoId | Photo Id | Text | ✅ | ✅(unique) | idempotency từng ảnh |
| SubmissionId | Submission Id | Text | ✅ | ✅ | FK → Submissions |
| SeqNo | Seq No | Number | ✅ | ➖ | 1..N |
| OriginalPhotoUrl | Original Url | URL | ✅ | ➖ | trỏ vào img |
| WatermarkedPhotoUrl | Watermarked Url | URL | ✅ | ➖ | trỏ vào img |
| CaptureTime | Capture Time | DateTime | ✅ | ✅ | thời điểm chụp |
| Latitude | Latitude | Number | ⬜ | ➖ | |
| Longitude | Longitude | Number | ⬜ | ➖ | |
| Address | Address | Text | ⬜ | ➖ | |

### Data_SyncLogs — "SyncLogs"
| Internal Name | Display | Type | Required | Indexed | Notes |
|---|---|---|:---:|:---:|---|
| Title | Title | Text | ✅ | ✅ | = QueueId |
| QueueId | Queue Id | Text | ✅ | ✅ | |
| SubmissionId | Submission Id | Text | ✅ | ✅ | |
| Status | Status | Choice | ✅ | ✅ | queued/uploading/uploaded/failed/cancelled |
| AttemptCount | Attempt Count | Number | ✅ | ➖ | |
| Message | Message | Note | ⬜ | ➖ | lỗi/chi tiết |
| Timestamp | Timestamp | DateTime | ✅ | ✅ | |

---

## img (Document Library) — cấu trúc thư mục

```
img/
└── 2026/                         ← YYYY
    └── 06/                       ← MM
        └── PMKT/                 ← DepartmentCode
            └── SUB-20260617-0001/   ← SubmissionId (1 thư mục/lần gửi)
                ├── original-01.jpg
                ├── watermarked-01.jpg
                ├── original-02.jpg
                └── watermarked-02.jpg
```

**Naming rules:**
- File: `original-{NN}.jpg` / `watermarked-{NN}.jpg`, `NN` = SeqNo 2 chữ số (01..NN).
- `SubmissionId` = `SUB-YYYYMMDD-####` (#### = số thứ tự trong ngày, cấp khi nộp).
- URL ghi vào `OriginalPhotoUrl`/`WatermarkedPhotoUrl` của line tương ứng.

**Collision rules:**
- Đường dẫn tất định theo (YYYY,MM,DepartmentCode,SubmissionId,SeqNo) → không trùng nếu SubmissionId duy nhất.
- Upload idempotent: nếu file đã tồn tại (retry) → ghi đè cùng tên (PUT replace), không tạo bản sao.
- `SubmissionId` cấp client (ULID/đếm ngày) đảm bảo unique; va chạm #### xử lý bằng kiểm tra trước khi cấp (Phase 2C.2).

**Retention (giả định):**
- Giữ `watermarked` lâu dài (hiển thị/báo cáo). `original` giữ ≥ 12 tháng làm bằng chứng, sau đó cân nhắc archive (quyết định khi có số liệu thật).
- Xóa ảnh phải ghi `Data_SyncLogs` + audit (Phase sau).

---

## Giới hạn SharePoint cần lưu ý
- **5000 item view threshold:** `Data_Submissions`/`Data_SubmissionPhotos` lớn nhanh → query luôn filter theo cột **indexed** (`DepartmentCode`, `SubmissionDate`); cân nhắc archive theo năm.
- **File > 4MB:** dùng **upload session** (chunked) của Graph; ảnh đã nén client (~<2MB) nên đa số PUT thẳng.
- **Throttling Graph:** batch, `$select`/`$filter`, tôn trọng `Retry-After`.

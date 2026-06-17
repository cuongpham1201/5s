# Ban5S — Provisioning Plan (Phase 2C.1)

> Cách tạo các list/library + cột + index trên site Ban5S. **Chưa thực thi** ở
> 2C.1 (design only). Đủ chi tiết cho người/worker tương lai provision mà không
> phải nghĩ lại schema. Nguồn cột: `BAN5S_SCHEMA.md`.

## Site & cấu trúc đã tồn tại (KHÔNG tạo lại)
- Site: `https://biahalong.sharepoint.com/sites/Ban5S`
- Document Library: **5S** (đã tồn tại)
- Thư mục THẬT trong "5S" (đã tồn tại): **img**, **ListConfig**, **ListData**

## Thứ tự provision (verify-first)
1. **Verify site tồn tại:** `https://biahalong.sharepoint.com/sites/Ban5S`.
2. **Verify Document Library "5S" tồn tại.**
3. **Verify 3 thư mục tồn tại** trong "5S": `img`, `ListConfig`, `ListData`.
   - ⚠️ **KHÔNG xoá, KHÔNG đổi tên, KHÔNG tạo trùng tên chữ thường, KHÔNG tạo thư viện ảnh khác.**
4. **Tạo hoặc verify 7 List cấp site:** `Config_Departments`, `Config_Areas`, `Config_Settings`, `Config_RoleMapping`, `Data_Submissions`, `Data_SubmissionPhotos`, `Data_SyncLogs`.
5. Tạo **indexed columns** (cột Indexed ✅ trong BAN5S_SCHEMA.md) — TRƯỚC khi list vượt 5000 item.
6. Dùng thư mục **`5S/img`** làm đường dẫn upload ảnh.
7. Dùng **`5S/ListConfig`** / **`5S/ListData`** làm nơi tổ chức artifact/seed/export/log (không phải nơi chứa List).
8. Seed Config (Departments/Areas/RoleMapping/Settings) — **bằng tay hoặc script riêng**, KHÔNG trong app.

> **Vì sao List không nằm trong thư mục:** SharePoint List là tài nguyên cấp site, không lồng được vào thư mục thư viện. Do đó List dùng tiền tố `Config_`/`Data_` để map logic về nhóm ListConfig/ListData; còn thư mục ListConfig/ListData chứa **artifact/export/log** liên quan.

## Hai cách provision (chọn 1 ở 2C.2)

### A. PnP PowerShell (khuyến nghị cho one-off)
```powershell
Connect-PnPOnline -Url "https://biahalong.sharepoint.com/sites/Ban5S" -Interactive
# Ví dụ 1 list:
New-PnPList -Title "Departments" -Template GenericList -Url "Lists/Config_Departments"
Add-PnPField -List "Config_Departments" -DisplayName "Department Code" -InternalName "DepartmentCode" -Type Text -AddToDefaultView
Add-PnPField -List "Config_Departments" -DisplayName "Active" -InternalName "IsActive" -Type Boolean
# ... lặp theo BAN5S_SCHEMA.md; set indexed:
Set-PnPField -List "Config_Departments" -Identity "DepartmentCode" -Values @{Indexed=$true}
```

### B. Microsoft Graph (app-only) — khớp service layer của app
```
POST /sites/{siteId}/lists
{ "displayName": "Departments",
  "list": { "template": "genericList" },
  "columns": [ {"name":"DepartmentCode","text":{}}, {"name":"IsActive","boolean":{}}, ... ] }
```
> Lưu ý: Graph tạo internal name theo displayName; để có internal name chính xác (`Config_*`) nên dùng PnP, hoặc đặt displayName = internal mong muốn rồi chỉnh.

## Choice column values
- `Config_RoleMapping.Role`: employee, environment, admin
- `Data_Submissions.Status`: complete, partial, flagged
- `Data_Submissions.SyncStatus`: queued, uploading, uploaded, failed
- `Data_SyncLogs.Status`: queued, uploading, uploaded, failed, cancelled

## Index checklist (bắt buộc trước khi nhiều dữ liệu)
- Departments: DepartmentCode, IsActive
- Areas: AreaCode, DepartmentCode
- Settings: Key
- RoleMapping: Email, Role, DepartmentCode
- Submissions: SubmissionId, DepartmentCode, AreaCode, ReporterEmail, SubmissionDate, SubmittedAt, Status, SyncStatus
- SubmissionPhotos: PhotoId, SubmissionId, CaptureTime
- SyncLogs: QueueId, SubmissionId, Status, Timestamp

## Quyền (app registration cho app-only)
- Graph application permission **`Sites.Selected`** + grant trên **site Ban5S** (least privilege; KHÔNG `Sites.ReadWrite.All`).
- Lưu `GRAPH_CLIENT_ID/SECRET/TENANT_ID` ở env host (ngoài git).

## Đã chốt (không còn open question)
- `img` / `ListConfig` / `ListData` là **thư mục THẬT** trong thư viện "5S" — giữ nguyên, chỉ dùng.
- 7 List cấp site (`Config_*`/`Data_*`) là nơi chứa **dữ liệu có cấu trúc**; thư mục ListConfig/ListData chứa **artifact/export/log**. Không gộp, không thay thế thư mục.

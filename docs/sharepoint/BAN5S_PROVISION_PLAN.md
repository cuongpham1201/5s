# Ban5S — Provisioning Plan (Phase 2C.1)

> Cách tạo các list/library + cột + index trên site Ban5S. **Chưa thực thi** ở
> 2C.1 (design only). Đủ chi tiết cho người/worker tương lai provision mà không
> phải nghĩ lại schema. Nguồn cột: `BAN5S_SCHEMA.md`.

## Site
`https://biahalong.sharepoint.com/sites/Ban5S`

## Containers cần có
- **img** — Document Library (đã/để chứa ảnh; bật versioning tùy chọn).
- 7 List (namespace bằng tiền tố): `Config_Departments`, `Config_Areas`, `Config_Settings`, `Config_RoleMapping`, `Data_Submissions`, `Data_SubmissionPhotos`, `Data_SyncLogs`.

## Thứ tự provision
1. Library `img` (nếu chưa có).
2. Config lists (Departments → Areas → Settings → RoleMapping).
3. Data lists (Submissions → SubmissionPhotos → SyncLogs).
4. Tạo **indexed columns** (xem cột Indexed ✅ trong BAN5S_SCHEMA.md) — tạo index TRƯỚC khi list vượt 5000 item.
5. Seed Config (Departments/Areas/RoleMapping/Settings) — **bằng tay hoặc script riêng**, KHÔNG trong app.

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

## Open question
- Nếu tổ chức KHÔNG muốn 7 list mà muốn đúng "2 container" (ListConfig/ListData) là **2 list gộp**: bất khả thi với cột cấu trúc khác nhau cho từng entity → khuyến nghị giữ 7 list namespaced. Cần xác nhận của Admin SharePoint trước khi provision thật.

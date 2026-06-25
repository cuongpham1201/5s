# 5S Daily — Environment Setup

> Cấu hình biến môi trường. **KHÔNG commit secret thật** — `.env*` đã gitignore.
> Copy `.env.example` → `.env.local` và điền giá trị thật khi triển khai.

---

## Required (bắt buộc để login M365 thật)

| Biến | Mô tả | Lấy ở đâu |
|---|---|---|
| `AUTH_SECRET` | Khóa mã hóa session/JWT của Auth.js | `npx auth secret` (random 32+ bytes) |
| `AUTH_AZURE_AD_CLIENT_ID` | Application (client) ID của App Registration | Entra admin center → App registrations |
| `AUTH_AZURE_AD_CLIENT_SECRET` | Client secret của App Registration | Entra → Certificates & secrets |
| `AUTH_AZURE_AD_TENANT_ID` | Directory (tenant) ID | Entra → Overview |
| `GRAPH_CLIENT_ID` | Client ID dùng cho Graph **app-only** (Phase 2 — SharePoint) | Có thể trùng app trên, hoặc app riêng |
| `GRAPH_CLIENT_SECRET` | Secret cho Graph app-only | Entra → Certificates & secrets |
| `GRAPH_TENANT_ID` | Tenant ID cho Graph app-only | Entra → Overview |

> **Phase 1B chỉ cần `AUTH_*`** (login + đọc `/me` bằng delegated token, scope `User.Read`).
> `GRAPH_*` (app-only) là **chuẩn bị cho Phase 2** (đọc/ghi SharePoint), chưa dùng bây giờ.

## Optional

| Biến | Mô tả | Mặc định |
|---|---|---|
| `NEXTAUTH_URL` | URL gốc của app (callback OAuth) | `http://localhost:3000` (dev) |
| `SHAREPOINT_SITE_URL` | URL site SharePoint chứa Library/List 5S | — (Phase 2) |
| `NEXT_PUBLIC_ALLOW_DEV_LOGIN` | Bật đăng nhập thử (dev mock) khi chưa có Entra | `true` (dev) → đặt `false` ở production |

## Future (thiết kế trước, chưa dùng)

| Biến | Mô tả |
|---|---|
| `TEAMS_WEBHOOK_URL` / `TEAMS_*` | Gửi thông báo Teams (Phase 5) |
| `SMTP_HOST` / `SMTP_PORT` / `SMTP_USER` / `SMTP_PASS` / `SMTP_FROM` | Gửi email nhắc nhở (Phase 5) |

---

## App Registration (Entra) — checklist để bật login thật (Phase 1B → staging)

> ⚠️ Các bước này cần **quyền tạo App Registration** trong tenant. Nếu tenant yêu cầu
> **admin consent** cho scope, hãy dừng và xin phê duyệt — KHÔNG tự cấp.

1. Entra admin center → **App registrations** → New registration.
2. Redirect URI (Web): `https://<staging-domain>/api/auth/callback/microsoft-entra-id`
   (dev: `http://localhost:3000/api/auth/callback/microsoft-entra-id`).
3. **API permissions** → Microsoft Graph → Delegated → `User.Read`, `openid`, `profile`, `email`, `offline_access`.
   - `User.Read` thường **không cần admin consent**. Nếu tenant cấu hình bắt buộc consent → STOP, xin admin.
4. **Certificates & secrets** → tạo client secret → copy vào `AUTH_AZURE_AD_CLIENT_SECRET`.
5. Copy Application ID / Tenant ID vào `.env.local`.
6. Đặt `NEXT_PUBLIC_ALLOW_DEV_LOGIN=false` ở môi trường thật để ẩn dev login.

## Ví dụ `.env.local` (giá trị giả)

```dotenv
AUTH_SECRET="<random-32-bytes>"
NEXTAUTH_URL="http://localhost:3000"

AUTH_AZURE_AD_CLIENT_ID=""
AUTH_AZURE_AD_CLIENT_SECRET=""
AUTH_AZURE_AD_TENANT_ID=""

# Phase 2 (SharePoint app-only) — để trống ở Phase 1B
GRAPH_CLIENT_ID=""
GRAPH_CLIENT_SECRET=""
GRAPH_TENANT_ID=""

NEXT_PUBLIC_ALLOW_DEV_LOGIN="true"
```

## Hành vi theo cấu hình

| Trạng thái env | Hành vi đăng nhập |
|---|---|
| `AUTH_AZURE_AD_CLIENT_ID` + `_SECRET` có | Hiện nút **Đăng nhập với Microsoft 365**; `/api/me` đọc Graph thật |
| Thiếu Entra + `NEXT_PUBLIC_ALLOW_DEV_LOGIN=true` | Chỉ có **Dev mock login**; `/api/me` trả hồ sơ mock từ session |
| Có cả hai | Hiện cả hai (tiện test) |

## SSO (Microsoft 365) — cấu hình bắt buộc

**Entra App Registration → Redirect URI (Web):**
```
https://she.biahalong.com/api/auth/callback/microsoft-entra-id
```
**Delegated permissions:** `User.Read`, `openid`, `profile`, `email`, `offline_access`.

**Env (product/staging):**
```dotenv
AUTH_SECRET=<random 32+ bytes: npx auth secret>
AUTH_URL=https://she.biahalong.com
NEXTAUTH_URL=https://she.biahalong.com
AUTH_TRUST_HOST=true
AUTH_AZURE_AD_CLIENT_ID=<app client id>
AUTH_AZURE_AD_CLIENT_SECRET=<app client secret>
AUTH_AZURE_AD_TENANT_ID=<tenant id>
NEXT_PUBLIC_ALLOW_DEV_LOGIN=false   # product: tắt dev login
```
- Dev login panel chỉ hiện khi `NEXT_PUBLIC_ALLOW_DEV_LOGIN=true` (dev). Product đặt `false`.
- `/api/me` trả `{ displayName, email, departmentRaw, departmentCode, departmentName,
  departmentResolved, departmentSource, departmentWarning, jobTitle, officeLocation,
  employeeId, id, source }` (`source` = `microsoft-entra-id` | `dev`).
- **Department source = Graph /me `.department`**, resolve qua **Config_Departments**
  (đồng bộ từ org). Null/không khớp → chặn nộp ở capture + cảnh báo. Debug:
  `GET /api/debug/me`, `/admin/department-debug` (dev/admin).
- **Config_Departments sync:** `ORG_DEPARTMENT_SOURCE=graph` + `POST /api/admin/sharepoint/import-departments`
  (cần app permission **User.Read.All** + admin consent). Quét `users.department`,
  bỏ null, gom theo mã (`org-codes.ts` `OFFICIAL_DEPARTMENTS` + mã suy diễn),
  upsert theo `DepartmentCode`, thiếu→IsActive=false (không xoá).
  Lưu ý: **resolution KHÔNG cần** `ORG_DEPARTMENT_SOURCE` (chỉ cần Config đã có dữ liệu);
  biến này chỉ dùng khi chạy import.
- **Lọc nguồn:** chỉ user `accountEnabled=true` + `userType=Member` + `@biahalong.com` + có department.
- **deactivateMissing=false** mặc định (chỉ deactivate khi `?deactivateMissing=true`).
- Báo cáo: `GET /api/admin/sharepoint/departments?includeInactive=true` (active/inactive/duplicates).
  `POST /api/admin/sharepoint/departments/cleanup-inactive-duplicates` = **report-only, không xoá**.

## Phase 2C.2 — SSO + Graph app-only (đã wire)

- **SSO redirect URI (QUAN TRỌNG):** provider Auth.js v5 là **`microsoft-entra-id`**, nên Redirect URI phải đăng ký đúng:
  `https://she.biahalong.com/api/auth/callback/microsoft-entra-id`
  (KHÔNG phải `/callback/azure-ad`). Delegated scope: `openid profile email offline_access User.Read`.
- **Graph app-only** (`getAppOnlyToken`, client-credentials, scope `.default`): hiện cần application permission **`Sites.ReadWrite.All`** (đã admin-consent) để tạo list + ghi item. **Hardening tương lai:** chuyển sang **`Sites.Selected`** chỉ cấp trên site Ban5S.
- `AUTH_SECRET` phải là chuỗi ngẫu nhiên thật (`npx auth secret`) — KHÔNG để placeholder.
- Health check: `GET /api/admin/sharepoint/health` · Provision: `POST /api/admin/sharepoint/provision` · Seed: `POST /api/admin/sharepoint/seed-config` (đều gated dev/admin).

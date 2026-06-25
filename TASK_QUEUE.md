# 5S Daily — Task Queue (for Autonomous Worker)

> Hàng đợi công việc có thứ tự & phụ thuộc, để một worker tự động (hoặc người) thực thi tuần tự.
> Trạng thái: `TODO` · `DOING` · `DONE` · `BLOCKED`. Phase 0 đã DONE.

---

## Phase 0 — Architecture (DONE)

| ID | Task | Status | Output |
|---|---|---|---|
| P0-1 | Business analysis (roles, workflows, KPI) | DONE | ARCHITECTURE.md §1 |
| P0-2 | High-level architecture & deployment | DONE | ARCHITECTURE.md §2 |
| P0-3 | SharePoint storage design | DONE | SHAREPOINT_SCHEMA.md |
| P0-4 | Metadata schema | DONE | DATA_MODEL.md §2 |
| P0-5 | Dashboard data model & formulas | DONE | DATA_MODEL.md §3 |
| P0-6 | Reporting model | DONE | DATA_MODEL.md §4 |
| P0-7 | Security model & RBAC | DONE | SECURITY_MODEL.md |
| P0-8 | Watermark / Upload / Offline design | DONE | ARCHITECTURE.md §3–5 |
| P0-9 | Notification model | DONE | ARCHITECTURE.md §6 |
| P0-10 | Anti-fraud design | DONE | RISKS_AND_DECISIONS.md §3 |
| P0-11 | Roadmap | DONE | ROADMAP.md |
| P0-12 | Risks/Decisions/Assumptions/Open Q | DONE | RISKS_AND_DECISIONS.md |

---

## Phase 1A — Auth · PWA · Camera · UI Port (DONE)

| ID | Task | Depends | Status |
|---|---|---|---|
| P1-1 | Init Next.js 14 + TS + Tailwind, cấu trúc `src/` | — | DONE |
| P1-2 | Cấu hình Auth.js (NextAuth v5) + Entra ID provider (+ dev mock) | P1-1 | DONE |
| P1-3 | Route guard middleware + session/role/department trên `/me` | P1-2 | DONE |
| P1-4 | PWA: manifest + service worker + offline page + install prompt + icons | P1-1 | DONE |
| P1-5 | Port prototype → React: Home/Capture/Preview/Success/History + Admin (Dashboard/Pending/Ranking/Gallery/Calendar) | P1-1 | DONE |
| P1-6 | Camera thật (`getUserMedia`, flip trước/sau) | P1-5 | DONE |
| P1-7 | Quality gate: tsc + lint + build PASS; smoke test routes | P1-1..6 | DONE |

> **Lưu ý:** P1-3 dùng session (`auth()` + `useSession`) thay cho `/api/me` riêng — phù hợp Phase 1A (chưa Graph). Verify PM2 + Cloudflare Tunnel (P1-7 gốc) chuyển sang Phase 1B vì cần môi trường thật.

## Phase 1B — Microsoft 365 Integration Foundation (DONE)

| ID | Task | Status |
|---|---|---|
| P1B-1 | Review auth hiện tại (v5, Entra, jwt, trustHost) | DONE |
| P1B-2 | `docs/ENVIRONMENT_SETUP.md` (Required/Optional/Future env) | DONE |
| P1B-3 | Graph foundation `src/lib/graph/` (client, types, user — GET /me) | DONE |
| P1B-4 | `GET /api/me` (Graph thật khi có token, mock fallback dev) | DONE |
| P1B-5 | `/me` Profile Card đọc dữ liệu thật + fallback đẹp | DONE |
| P1B-6 | `src/lib/department-mapping.ts` (Entra dept → mã 5S, config-based) | DONE |
| P1B-7 | `src/lib/auth/roles.ts` + `permissions.ts` (whitelist + RBAC matrix) | DONE |
| P1B-8 | Staging readiness: `ecosystem.config.js`, `deployment/*` | DONE |
| P1B-9 | Quality gate: tsc + lint + build PASS; smoke /api/me | DONE |

> **Blocker (documented, không STOP build):** login Microsoft 365 *thật* chỉ kích hoạt khi có App Registration + `AUTH_AZURE_AD_*` (Phase staging). Code đã sẵn sàng; phiên này chạy bằng dev mock.

## Phase 1C — Multi-photo Submission Refactor (DONE)

| ID | Task | Status |
|---|---|---|
| P1C-1 | Data model header–lines: `5SSubmissions` + `5SSubmissionPhotos` (DATA_MODEL §2a/2b) | DONE |
| P1C-2 | Cập nhật ARCHITECTURE (flow multi-photo, upload N ảnh) + SHAREPOINT (folder N ảnh, list lines) | DONE |
| P1C-3 | Client session store `session-context.tsx` (in-memory + sessionStorage) | DONE |
| P1C-4 | Route mới `/session` (Session Gallery: list, xoá, chụp thêm, tổng số, xác nhận nộp) | DONE |
| P1C-5 | Cập nhật UI Capture/Camera/Preview/Success/History theo flow N ảnh | DONE |
| P1C-6 | Quality gate tsc + lint + build PASS | DONE |

> Không upload / SharePoint / Graph / watermark trong 1C — chỉ UX + data-model + state client.

## Phase 1C-ext — Mobile real-device + Camera HTTPS + dev 3002 (DONE)

| ID | Task | Status |
|---|---|---|
| P1Cx-A | Bỏ khung iPhone giả/status bar giả → AppShell production full-viewport, safe-area, desktop max-width, dev-preview behind flag | DONE |
| P1Cx-B | Camera secure-context: phân biệt insecure/unsupported/denied/no-device + message HTTPS; `makeSimulatedPhoto`; capture frame thật | DONE |
| P1Cx-C | Script `dev:3002`; docs `CAMERA_TESTING.md` (HTTPS/tunnel/she.biahalong.com) | DONE |
| P1Cx-D | Multi-photo theo type `SubmissionSession`/`SessionPhoto` (localStorage) + history mock; flow Capture(Bắt đầu chụp)→Camera→Preview(Giữ ảnh)→/session→Xác nhận nộp→Success | DONE |
| P1Cx-E | Quality gate tsc + lint + build PASS | DONE |

> Vẫn local/mock: chưa watermark (Phase 2A), chưa SharePoint/Graph (2B), chưa upload (2C).

## Phase 2A — Local data flow + Watermark engine (DONE)

| ID | Task | Status |
|---|---|---|
| P2A-A | Types `src/types/submission.ts` (SubmissionSession/SessionPhoto/CompletedSubmission/WatermarkMetadata/GeoLocationSnapshot/UploadStatus/PendingCapture) | DONE |
| P2A-B | Local store `lib/submissions/local-submission-store.ts` (SSR-safe, quota-aware) + `metadata.ts` | DONE |
| P2A-C | `hooks/useGeolocation.ts` (timeout 5s, non-blocking, status) | DONE |
| P2A-D | Watermark engine `lib/watermark/*` (Canvas, bottom-left, scale font, JPEG quality) | DONE |
| P2A-E | Tích hợp Camera→Preview(watermark)→Session→Success→History dùng store + ảnh thật | DONE |
| P2A-F | Error handling (camera/insecure/GPS/storage/image/empty/refresh) — friendly VI, no crash | DONE |
| P2A-G | Docs: WATERMARK_ENGINE.md, LOCAL_DATA_FLOW.md + cập nhật DATA_MODEL/ARCHITECTURE/ROADMAP/TASK_QUEUE/RUN_REPORT | DONE |
| P2A-H | Quality gate tsc + lint + build PASS | DONE |

> Vẫn local-only: chưa IndexedDB (2B), chưa SharePoint upload (2C).

## Phase 2A.1 + 2B — Photo-count fix + IndexedDB + Offline queue (DONE)

| ID | Task | Status |
|---|---|---|
| P2A1 | Fix bug đếm ảnh (gốc: localStorage quota khi nhồi data URL) → ảnh sang IndexedDB, metadata nhỏ, count đáng tin | DONE |
| P2B-IDB | `lib/storage/` indexeddb.ts/photo-store.ts/storage-types.ts/queue-store.ts/image-utils.ts | DONE |
| P2B-Q | `lib/queue/` queue-types.ts/offline-queue.ts/sync-engine.ts (mock upload, no network) | DONE |
| P2B-ON | `hooks/useOnlineStatus.ts` + `useQueue.ts` + SyncRunner + OfflineBanner | DONE |
| P2B-HOME | Home queue-status card (đã đồng bộ / đang chờ / lỗi + online) | DONE |
| P2B-HIST | History badge trạng thái đồng bộ | DONE |
| P2B-DBG | `/debug/storage` (dev-only): session/history/queue/IndexedDB count/usage + clear buttons | DONE |
| P2B-DOC | docs INDEXEDDB_STORAGE.md + OFFLINE_QUEUE.md + cập nhật ARCHITECTURE/DATA_MODEL/ROADMAP/TASK_QUEUE/RUN_REPORT | DONE |
| P2B-QG | Quality gate tsc + lint + build PASS | DONE |

> Sync là **mock** (không network/SharePoint). Upload thật = **Phase 2C**.

## Phase 2B.1 — Storage validation & stress test (DONE)

| ID | Task | Status |
|---|---|---|
| P2B1-A | Audit storage; phát hiện thumbnail base64 còn trong localStorage → **fix**: chuyển thumbnail sang IndexedDB, hiển thị qua object URL (`PhotoThumb`); localStorage metadata-only | DONE |
| P2B1-B | Mở rộng `/debug/storage`: PASS/WARNING indicators, localStorage size, IndexedDB count/usage, counts | DONE |
| P2B1-C | Validate session/refresh survival (đọc lại localStorage + thumbnail từ IndexedDB) | DONE |
| P2B1-D | Validate queue/session/history persist qua refresh + restart (localStorage bền vững) | DONE |
| P2B1-E | Stress tool `stress-test.ts` + nút +5/+10/+20 ảnh trong debug | DONE |
| P2B1-F | `storage-audit.ts` + Safari review + `docs/STORAGE_VALIDATION.md` | DONE |
| P2B1-G | Phase 2C readiness checklist → **READY** | DONE |
| P2B1-QG | Quality gate tsc + lint + build PASS | DONE |

## Phase 2C.1 — SharePoint data foundation & schema (DONE — design only)

| ID | Task | Status |
|---|---|---|
| P2C1-A | Architecture review + field mapping frontend↔SharePoint (BAN5S_FIELD_MAPPING.md); flag SHAREPOINT_SCHEMA Phase 0 superseded | DONE |
| P2C1-B | Final schema Ban5S: Config_* (Departments/Areas/Settings/RoleMapping) + Data_* (Submissions/SubmissionPhotos/SyncLogs) | DONE |
| P2C1-C | img library folder structure + naming/collision/retention rules | DONE |
| P2C1-D | Types `src/types/sharepoint.ts` (strict, no any) | DONE |
| P2C1-E | Graph foundation `src/lib/sharepoint/` (config/types/client/site-context/list-helpers) — READ-ONLY, no mutations | DONE |
| P2C1-F | Provisioning package `docs/sharepoint/` (SCHEMA/FIELD_MAPPING/PROVISION_PLAN/GRAPH_PLAN) | DONE |
| P2C1-G | Readiness review → **READY cho 2C.2** | DONE |
| P2C1-QG | Quality gate tsc + lint + build PASS | DONE |

> Không upload/write/seed/provision thật trong 2C.1. `getAppOnlyToken()` = 501 stub.

## Phase 2C.1A — Ban5S structure correction & realignment (DONE)

| ID | Task | Status |
|---|---|---|
| P2C1A-A | Sửa docs: ListConfig/ListData/img là **thư mục THẬT** trong Document Library "5S" (bỏ wording "namespace giả định / flat / open question / optional") | DONE |
| P2C1A-B | Document model nguồn-sự-thật: library "5S" + 3 folder + Lists cấp site `Config_*`/`Data_*` (nói rõ SP không lồng List vào folder) | DONE |
| P2C1A-C | Code: `sharePointConfig` (documentLibraryName "5S", folders, lists); `site-context` resolve drive "5S" + verify folders + img path | DONE |
| P2C1A-D | Provisioning plan: verify site/library/folders tồn tại; không xoá/đổi tên/tạo trùng | DONE |
| P2C1A-E | Graph plan: reality check (GET drives → "5S" → root children → verify img/ListConfig/ListData → lists) trước upload | DONE |
| P2C1A-QG | Quality gate tsc + lint + build PASS (fix `*/`-trong-comment, 2 vòng) | DONE |

## Phase 2C.2 — Graph health + SSO + SharePoint DB foundation (DONE — code; provision chưa chạy prod)

| ID | Task | Status |
|---|---|---|
| P2C2-A | `getAppOnlyToken()` thật (client-credentials) + Graph client post/patch | DONE (token verified) |
| P2C2-B | Health service + `GET /api/admin/sharepoint/health` + UI `/admin/sharepoint-health` | DONE |
| P2C2-C | Provision service + `POST /provision` (tạo list/cột/index) | DONE (chưa chạy prod) |
| P2C2-D | Seed config service + `POST /seed-config` (idempotent) | DONE (chưa chạy prod) |
| P2C2-E | config-service / submission-service (read + create item; KHÔNG upload) | DONE |
| P2C2-F | SSO Entra wired; redirect URI `/api/auth/callback/microsoft-entra-id`; AUTH_SECRET set | DONE |
| P2C2-G | Docs: GRAPH_PLAN/PROVISION_PLAN/ENVIRONMENT_SETUP/ROADMAP/TASK_QUEUE/RUN_REPORT | DONE |
| P2C2-QG | tsc + lint + build PASS | DONE |

> **BLOCKER (provision/seed chưa chạy):** reality check thấy library "5S" chỉ có thư mục `Img`; lists hiện là `5S_Config`/`5S_Submissions` (khác `Config_*`/`Data_*`). Cần user quyết định trước khi tạo list → tránh trùng/đụng dữ liệu. Không upload ảnh / không sync queue ở phase này.

## Phase 2C.2B — Provision attempt (kiến trúc đã chốt; BLOCKED bởi quyền)

| ID | Task | Status |
|---|---|---|
| P2C2B-A | Health cập nhật: thư mục `Img` (hoa); bỏ qua legacy `5S_Config`/`5S_Submissions` (đã xoá) | DONE |
| P2C2B-B | Verify site/library/Img qua health | DONE (FOUND) |
| P2C2B-C | Chạy `POST /provision` tạo 7 list | **BLOCKED — 403 accessDenied** |
| P2C2B-D | Seed Departments/Areas | BLOCKED (chờ list) |
| P2C2B-E | Verify SSO provider (microsoft-entra-id) | DONE |
| P2C2B-QG | tsc + lint + build PASS | DONE |

> **BLOCKER:** token app-only có `Sites.ReadWrite.All` nhưng tạo list/column bị 403 — cần admin cấp `Sites.Manage.All`/`Sites.FullControl.All` (hoặc grant role manage cho app trên site Ban5S khi dùng Sites.Selected). Sau khi cấp → chạy lại provision + seed (code idempotent đã sẵn).

## Department Mapping Fix (DONE)

| ID | Task | Status |
|---|---|---|
| DM-A | `/api/debug/me` (raw Graph fields, dev/admin) | DONE |
| DM-B | `department-service.ts`: listActiveDepartments + resolveDepartmentFromGraphValue (code→name accent-insensitive→alias) | DONE |
| DM-C | `/api/me` mở rộng: departmentRaw/Code/Name/Resolved/Source/Warning | DONE |
| DM-D | `/me` + `/capture` hiển thị raw + 5S + cảnh báo; capture chặn nộp khi chưa resolve | DONE |
| DM-E | `/admin/department-debug` + `GET /api/admin/sharepoint/departments` | DONE |
| DM-F | Docs (DATA_MODEL/ENVIRONMENT_SETUP/RUN_REPORT/TASK_QUEUE) | DONE |
| DM-QG | tsc + lint + build PASS | DONE |

> Root cause cần xác nhận từ thiết bị user qua `/api/debug/me` (department NULL vs giá trị không khớp Config). Code đã robust cho cả 4 case. Không đổi schema, không xoá data.

## Phase 2C.3+ (TODO)
Upload Engine (upload `5S/img` + ghi header/lines + nối offline queue + retry), dashboard data thật, Excel, notifications. Đồng bộ Config_Departments từ org (cần User.Read.All).

---

## Quy ước thực thi
- Worker chỉ làm task `TODO` có **mọi dependency = DONE**.
- Trước khi bắt đầu một phase code, **đọc AGENT_RULES.md và STOP_CONDITIONS.md**.
- Mỗi task hoàn thành: cập nhật status + ghi output path tại đây.
- **Phase 0 KHÔNG chuyển sang Phase 1 nếu chưa có phê duyệt của con người** (xem STOP_CONDITIONS).

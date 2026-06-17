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

## Phase 2+ (TODO — chờ phê duyệt)
SharePoint thật (Library + `5SSubmissions`/`5SSubmissionPhotos`), Graph app-only, watermark ghép ảnh, upload N ảnh/lần gửi + offline queue, dashboard data thật, Excel, notifications. Xem ROADMAP Phase 2–6.

---

## Quy ước thực thi
- Worker chỉ làm task `TODO` có **mọi dependency = DONE**.
- Trước khi bắt đầu một phase code, **đọc AGENT_RULES.md và STOP_CONDITIONS.md**.
- Mỗi task hoàn thành: cập nhật status + ghi output path tại đây.
- **Phase 0 KHÔNG chuyển sang Phase 1 nếu chưa có phê duyệt của con người** (xem STOP_CONDITIONS).

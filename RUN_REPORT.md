# 5S Daily — Phase 0 Run Report

> Báo cáo kết thúc phiên Phase 0 (Architecture & Technical Design).
> Ngày: 2026-06-16 · Phạm vi: **chỉ phân tích kiến trúc, không code.**

---

## 1. Các file đã tạo

| File | Nội dung |
|---|---|
| `ROADMAP.md` | Lộ trình 6 phase + DoD từng phase |
| `ARCHITECTURE.md` | Business analysis, kiến trúc tổng thể, watermark, upload flow, offline, notification |
| `SHAREPOINT_SCHEMA.md` | Document Library + 6 List, phân tích ưu/nhược |
| `DATA_MODEL.md` | Metadata schema, công thức KPI, reporting, API surface |
| `SECURITY_MODEL.md` | Auth (Auth.js + Entra), RBAC matrix, data protection |
| `RISKS_AND_DECISIONS.md` | ADR, risks, anti-fraud, assumptions, open questions |
| `TASK_QUEUE.md` | Hàng đợi công việc Phase 0 (DONE) + Phase 1 (TODO) |
| `AGENT_RULES.md` | Quy tắc cho autonomous worker |
| `STOP_CONDITIONS.md` | Điều kiện dừng |
| `RUN_REPORT.md` | Báo cáo này |

Đầu vào đã có sẵn (không tạo mới ở phase này): prototype UX trong `design/` (11 màn + ds.css).

## 2. Tóm tắt kiến trúc

- **Client PWA** (Next.js + TS + Tailwind): offline-first, camera, **watermark client-side (Canvas)**, IndexedDB queue.
- **BFF** (Next.js Route Handlers): Auth.js + Entra OIDC, RBAC, tổng hợp KPI, sinh Excel; là lớp duy nhất chạm Graph.
- **Storage SharePoint**: Library `5SPhotos` (cây `YYYY/MM/Department/SubmissionID` lưu `original` + `watermarked`) tách khỏi List `5SSubmissions` (metadata), nối bằng `SubmissionID`. Thêm `5SDepartments/5SAreas/5SUserMap/5SSettings/5SAuditLog`.
- **Auth/Access**: App-only + **Sites.Selected** (least privilege); session cookie HTTP-only; RBAC enforce ở BFF.
- **Hosting**: Ubuntu homelab → PM2 → Cloudflare Tunnel.
- **KPI**: Completion = SubmittedDays / ExpectedDays (theo đơn vị × working-day, giờ VN); heatmap 3 trạng thái ok/partial/miss.

## 3. Các quyết định quan trọng (xem ADR đầy đủ trong RISKS §1)

- AD-01 Watermark **client-side** cho MVP (offline + WYSIWYG); server verify để tương lai.
- AD-02 Lưu **cả ảnh gốc + watermarked** (bằng chứng + tái tạo được).
- AD-03 **Tách metadata (List) khỏi ảnh (Library)** nối bằng SubmissionID.
- AD-04 **App-only + Sites.Selected** thay vì quyền toàn tenant.
- AD-05 Kiến trúc **BFF** giấu token, RBAC tập trung.
- AD-06 **SubmissionID (ULID) sinh client** làm khóa idempotent.
- AD-07 Completion MVP = **≥1 ảnh/ngày** (đủ-khu-vực là tùy chọn cấu hình).
- AD-08 Mọi tính "ngày" theo **Asia/Ho_Chi_Minh**.
- AD-09 Department **readonly** từ 5SUserMap.
- AD-10 **GPS không bắt buộc** — không chặn gửi khi lỗi.

## 4. Các rủi ro (xem RISKS §2 đầy đủ)

Nổi bật: iOS PWA hạn chế (R-01), SharePoint 5000-threshold & throttling (R-02), homelab downtime (R-03), mất mạng/upload (R-04), GPS nhà xưởng (R-05), token hết hạn (R-06), ảnh lớn (R-07), lộ secret (R-08), file mồ côi (R-09), nhân viên ngại bỏ Zalo (R-10).

## 5. Các giả định (xem RISKS §4)

A-01 mọi NV có M365; A-02 SharePoint Online; A-03 gửi theo working-day; A-04 KPI theo **đơn vị**; A-05 hoàn thành = ≥1 ảnh/ngày (MVP); A-06 ~≤18k submission/tháng; A-07 homelab nội bộ; A-08 UTC+7/tiếng Việt; A-09 watermark đã chốt; A-10 admin duy trì danh mục.

## 6. Các câu hỏi còn mở (xem RISKS §5)

Quan trọng nhất phải chốt sớm:
- **Q-01** "Hoàn thành" = ≥1 ảnh hay đủ mọi khu vực? (trước Phase 3)
- **Q-02** thuộc tính `department` Entra có khớp mã 5S? (quyết định giữ/bỏ 5SUserMap, trước Phase 2)
- **Q-03** giờ hạn gửi mỗi ngày? **Q-04** lịch working-day/nghỉ lễ? (trước Phase 3)
- **Q-07** App-only vs On-Behalf-Of? (trước Phase 2)
- Còn lại: Q-05 (employee xem ảnh đồng nghiệp?), Q-06 (retention), Q-08 (geofence MVP?), Q-09 (song song Zalo bao lâu), Q-10 (số đơn vị/khu vực thật).

> Không câu hỏi nào chặn việc bắt đầu Phase 1.

## 7. Cấu trúc thư mục đề xuất

```
/data/dev/5s-app
├── ARCHITECTURE.md            ┐
├── SHAREPOINT_SCHEMA.md       │
├── DATA_MODEL.md              │ Phase 0 — tài liệu kiến trúc (file này nhóm)
├── SECURITY_MODEL.md          │
├── RISKS_AND_DECISIONS.md     │
├── ROADMAP.md                 │
├── TASK_QUEUE.md              │ điều phối worker
├── AGENT_RULES.md             │
├── STOP_CONDITIONS.md         │
├── RUN_REPORT.md              ┘
│
├── design/                    ← prototype UX đã duyệt (đầu vào, không sửa)
│   ├── ds.css
│   ├── Home/Capture/Camera/Preview/Success/History.html
│   ├── Dashboard/Pending/Ranking/Gallery/Calendar.html
│   └── assets/
│
└── (Phase 1 sẽ thêm — CHƯA tạo)
    ├── app/                   ← Next.js App Router
    │   ├── (employee)/ (admin)/ api/
    ├── components/  lib/  (auth, graph, watermark, kpi)
    ├── public/ (manifest, sw, icons)
    ├── package.json  tsconfig.json  tailwind.config.ts
    └── .env (ngoài git)
```

## 8. Git status

```
$ git status
fatal: not a git repository (or any parent up to mount point /)
```

`/data/dev/5s-app` **chưa phải git repository**. Theo yêu cầu phiên này: **KHÔNG commit, KHÔNG push** — đã tuân thủ (không có gì để commit, không khởi tạo git). Khi sang Phase 1 có thể `git init` để quản lý phiên bản.

## 9. Khuyến nghị cho Phase 1

1. **Chốt trước khi/đồng thời code:** Q-02 & Q-07 (Auth & department mapping) vì ảnh hưởng `/api/me` và cấu hình Entra.
2. **Bắt đầu hẹp:** Auth.js + Entra OIDC + route guard + PWA shell + chuyển prototype Home/Capture/Camera/Preview thành component — **chưa nối SharePoint** (mock `/api/me`, watermark render local).
3. **Test iOS Safari sớm** (R-01) ngay khi có PWA shell — rủi ro nền tảng lớn nhất.
4. **Dựng cấu trúc thư mục** theo §7 và xác lập convention (lib/auth, lib/graph, lib/watermark, lib/kpi) để Phase 2–3 cắm vào.
5. **Verify hạ tầng**: chạy được qua PM2 + Cloudflare Tunnel với 1 trang đăng nhập thật trước khi xây tiếp.
6. Giữ **offline-first** là ràng buộc thiết kế từ đầu (đừng bolt-on sau).

---

**Trạng thái phiên:** Phase 0 HOÀN THÀNH. Kích hoạt **Stop Condition §1** — dừng tại đây, chờ phê duyệt để mở Phase 1. Không code, không tạo Next.js, không commit, không push.

---
---

# 5S Daily — Phase 1A Run Report (Foundation)

> Ngày: 2026-06-16 · Branch: `feature/phase1-foundation`
> Phạm vi: Auth + PWA + UI Port + Camera. **Chưa** SharePoint/watermark/dashboard thật/notification/Excel.

## Preflight
- Current dir: `/data/dev/5s-app`
- Git: chưa phải repo → đã `git init` + tạo branch `feature/phase1-foundation`
- Node: v20.20.2 · NPM: 10.8.2

## 1. Files created (chính)
- **Config:** `package.json`, `tsconfig.json`, `next.config.mjs`, `postcss.config.mjs`, `tailwind.config.ts`, `.eslintrc.json`, `.gitignore`, `.env.example`, `.env.local`, `next-env.d.ts`
- **Auth:** `src/auth.ts`, `src/app/api/auth/[...nextauth]/route.ts`, `src/middleware.ts`
- **App shell/styles:** `src/app/layout.tsx`, `src/app/globals.css`
- **Providers/PWA:** `src/components/providers/Providers.tsx`, `src/components/pwa/PwaRegister.tsx`, `src/components/pwa/InstallPrompt.tsx`, `public/manifest.webmanifest`, `public/sw.js`, `public/icons/icon-192.svg`, `public/icons/icon-512.svg`, `src/app/offline/page.tsx`
- **Design system:** `src/components/ui/{Button,Card,StatusBadge}.tsx`, `src/components/layout/{AppShell,BottomNav,AdminShell}.tsx`
- **Employee routes:** `src/app/{page,capture,camera,preview,success,history,me,signin}/...`
- **Admin routes:** `src/app/admin/{page,pending,ranking,gallery,calendar}/page.tsx`
- **Domain:** `src/types/index.ts`, `src/lib/mock-data.ts`, `src/hooks/useCamera.ts`

## 2. Files modified
- `.gitignore` (mở rộng từ stub `node_modules`), `package.json` (bump Next 14.2.5 → 14.2.35 vá lỗi bảo mật), `next-env.d.ts` (Next tự cập nhật)
- `TASK_QUEUE.md`, `RUN_REPORT.md` (file này), `ROADMAP.md` (cập nhật trạng thái Phase 1)

## 3–5. Quality gate
| Gate | Lệnh | Kết quả |
|---|---|---|
| TypeScript | `npx tsc --noEmit` | ✅ PASS (0 lỗi) |
| Lint | `npm run lint` | ✅ PASS (no warnings/errors) |
| Build | `npm run build` | ✅ PASS (17 routes) |

> Số vòng sửa: build/lint/tsc **PASS ngay vòng 1**. Có **1 sửa cấu hình runtime** (thêm `trustHost: true` cho Auth.js v5 — bắt buộc khi chạy sau reverse proxy/Cloudflare Tunnel) phát hiện qua smoke test, đã vá trong giới hạn cho phép.

## 6. Routes completed (17)
`/` · `/capture` · `/camera` · `/preview` · `/success` · `/history` · `/me` · `/signin` · `/offline` · `/admin` · `/admin/pending` · `/admin/ranking` · `/admin/gallery` · `/admin/calendar` · `/api/auth/[...nextauth]` · middleware route-guard.

## 7. Screens completed
Employee: Home, Capture (Department readonly + Area chips), Camera (getUserMedia thật + flip), Preview (watermark mẫu), Success, History, Me, Sign-in, Offline.
Admin: Dashboard (KPI + chart CSS), Pending, Ranking (podium + bảng), Gallery (grid), Calendar (heatmap). Tất cả dùng mock data, không API.

## Smoke test (production `next start`)
- `/` → **307 → /signin** (middleware bảo vệ route) ✅
- `/signin` → **200** ✅ · `/manifest.webmanifest` → 200 ✅
- `/api/auth/providers` → trả provider `dev` (Entra ẩn vì chưa cấu hình) ✅ · 0 auth error ✅

## 8. Outstanding issues
- Icons PWA là **SVG placeholder** (chưa PNG 192/512 thật) — Lighthouse có thể cảnh báo nhẹ; thay ở Phase 1B.
- Lighthouse PWA chưa chạy tự động trong sandbox (không có Chrome headless); manifest + SW + offline + installable đã thỏa điều kiện cơ bản.
- Đăng nhập M365 thật chưa kích hoạt (cần Entra App ở Phase 1B); hiện dùng **dev mock login** (gated `NEXT_PUBLIC_ALLOW_DEV_LOGIN`).
- `next@14.2.x` vẫn còn advisory nhỏ ở một số phiên bản — đã dùng bản vá mới nhất 14.2.35.

## 9. Git status & 10. Commit hash
Xem phần cuối báo cáo (in sau khi commit local). **Không push, không deploy** — đúng giới hạn Phase 1A.

**Trạng thái phiên:** Phase 1A HOÀN THÀNH — build/lint/tsc PASS, login skeleton + PWA + UI port + camera hoạt động, chưa đụng SharePoint. **Dừng, chờ mở Phase 1B.**

---
---

# 5S Daily — Phase 1B Run Report (Microsoft 365 Integration Foundation)

> Ngày: 2026-06-16 · Branch: `feature/phase1-foundation` · Base: `0ea53da`
> Phạm vi: login M365 thật (wired) + Graph foundation + `/api/me` + department mapping + RBAC foundation + staging docs. **Chưa** SharePoint/List/Library/watermark/upload/dashboard backend.

## Preflight (BƯỚC 0)
- Branch `feature/phase1-foundation` · working tree **sạch** (không STOP) · HEAD `0ea53da` (đúng base) · Node v20.20.2 · npm 10.8.2.

## BƯỚC 1 — Auth review
Xác nhận: Auth.js **v5** (beta.20) · **MicrosoftEntraID** provider (env-gated) + dev Credentials · session **jwt** · **trustHost: true** · pages.signIn `/signin`.

## 1. Files created
- `docs/ENVIRONMENT_SETUP.md`
- `src/lib/graph/{graph-client.ts, graph-types.ts, graph-user.ts}`
- `src/app/api/me/route.ts`
- `src/lib/department-mapping.ts`
- `src/lib/auth/{roles.ts, permissions.ts}`
- `ecosystem.config.js`, `deployment/{DEPLOYMENT.md, STAGING_CHECKLIST.md}`

## 2. Files modified
- `src/auth.ts` (env naming `AUTH_AZURE_AD_*`, Graph scope `User.Read`, capture access_token vào JWT, derive role + 5S department từ profile)
- `src/middleware.ts` (giữ nguyên route-guard)
- `src/app/me/page.tsx` (đọc `/api/me`, hiển thị dữ liệu thật + badge nguồn)
- `.env.example`, `.env.local` (đổi sang `AUTH_AZURE_AD_*` + `GRAPH_*`)
- `TASK_QUEUE.md`, `ROADMAP.md`, `RUN_REPORT.md`

## 3. Graph foundation status
✅ Hoàn thành ở mức foundation: `createGraphClient(accessToken)` (fetch wrapper, no SDK), `getMe()` gọi `GET /me?$select=...`, chuẩn hóa → `MeProfile`. Chỉ user profile, **không** endpoint SharePoint. Access token đọc server-side từ JWT (không lộ ra client).

## 4. Auth status
✅ Login Microsoft 365 **đã wire đầy đủ** (provider Entra + scope + token capture). Kích hoạt thật cần `AUTH_AZURE_AD_*` (App Registration) — chưa có trong phiên này nên chạy bằng **dev mock**. Không yêu cầu admin consent (scope `User.Read` mức thấp).

## 5. /api/me result
Đã verify end-to-end qua dev session:
```json
{"displayName":"tran thi b","email":"tran.thi.b@biahalong.com","entraDepartment":null,
 "department":null,"jobTitle":"Ban Môi trường đời sống","officeLocation":null,
 "employeeId":null,"source":"mock"}
```
Đủ field theo spec (displayName/email/department/jobTitle/officeLocation/employeeId), field thiếu = null. Không auth → 307 (middleware guard) + 401 fallback trong route.

## 6. Department mapping status
✅ `department-mapping.ts`: config object (code/name/aliases) + `mapEntraDepartment()` (khớp code → alias → contains). Mock mapping cho 6 đơn vị. Dùng trong `auth.ts` (jwt) và `graph-user.ts`. Không hardcode trong component. Cập nhật giá trị thật ở Phase 2.

## 7. Build result — ✅ PASS
`npm run build` → 17 routes (thêm `/api/me`).

## 8. Lint result — ✅ PASS (no warnings/errors).

## 9. TypeScript result — ✅ PASS (0 lỗi).
> Vòng sửa: lint/build PASS ngay; **tsc fail rồi fix trong 2 vòng** — đều cùng 1 chỗ: typing của `getToken` (next-auth/jwt beta.20 yêu cầu `secret`+`salt`; `process.env.AUTH_SECRET` là `string|undefined`). Đã cấp `secret`+`salt`(=cookie name) + narrow `accessToken`. Trong ngưỡng cho phép.

## 10. Outstanding blockers
- 🚧 **Login M365 thật chưa kích hoạt** — cần App Registration + `AUTH_AZURE_AD_*` (staging). KHÔNG yêu cầu secret/admin consent trong phiên này (đúng STOP condition). Đã ghi checklist ở `deployment/STAGING_CHECKLIST.md`.
- ⚠️ Department mapping dùng **mock aliases** — cần đối chiếu chuỗi `department` thật của tenant (Open Q-02).
- ⚠️ Role whitelist là **mock email** — Phase 2 thay bằng Entra group / 5SUserMap.
- ℹ️ `/api/me` bị middleware redirect (307) khi chưa auth thay vì 401 JSON — chấp nhận ở foundation (trang `/me` gọi có cookie nên 200).

## 11. Git status & 12. Commit hash
Xem cuối báo cáo (in sau commit local). **Không push, không deploy.**

**Trạng thái phiên:** Phase 1B HOÀN THÀNH — Graph foundation + `/api/me` + profile card + department mapping + RBAC foundation + staging docs; build/lint/tsc PASS; chưa đụng SharePoint. **Dừng, chờ mở Phase 2 (SharePoint + Upload + Watermark).**

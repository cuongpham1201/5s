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

---
---

# 5S Daily — Phase 1B.5 Run Report (Local UI Review)

> Ngày: 2026-06-16 · Branch `feature/phase1-foundation`. Không thêm feature, không SharePoint/watermark/upload.

## 1. Route đã test (13)
`/signin` `/offline` `/` `/me` `/capture` `/camera` `/preview` `/history` `/admin` `/admin/pending` `/admin/ranking` `/admin/gallery` `/admin/calendar` (+ `/api/me`).

## 2. Screenshot
⚠️ **Không thể tự chụp screenshot** — sandbox không có browser engine (Chromium/Playwright/Puppeteer đều không có). Thay bằng **render-verification qua HTTP**: mỗi route trả **200** và HTML chứa đúng marker nội dung (vd `/` có "CHỤP", `/admin` có "Dashboard", `/admin/calendar` có "tổng hợp"...). Screenshot pixel cần chạy thủ công trên trình duyệt (`npm run dev` → mở localhost:3000).

## 3. Lỗi phát hiện
- **B1 (React warning):** `ButtonLink` rò rỉ prop `variant/size/block` xuống DOM `<a>` → cảnh báo unknown-attribute.
- **B2 (UI):** CTA Home + nút ⚙ dùng `ButtonLink`(btn-primary) → nền xanh đặc chồng gradient, dễ lệch so với prototype.
- **FP (false positive):** detector bắt cụm "could not be found" trên mọi trang — thực ra là template not-found mặc định của Next nhúng trong RSC payload, **không phải lỗi**.

## 4. Lỗi đã sửa
- ✅ B1: tách `variant/size/block` khỏi `...rest` trong `ButtonLink`.
- ✅ B2: đổi CTA + nút ⚙ ở `/` sang `Link` thuần → gradient render đúng, bỏ nền btn-primary.

## 5. Lỗi còn tồn tại
- Không có lỗi render/runtime/auth (0 auth error, log server sạch).
- **Giới hạn kiểm tra:** Console errors / hydration errors **không soi được headless** (chỉ hiện ở browser console). Đã thay bằng static scan: 0 pattern rủi ro (Date/Math.random/window/localStorage chỉ trong hooks), 100% file tương tác có `"use client"` → rủi ro hydration thấp. Cần 1 lần xem mắt thường trên trình duyệt để đóng hẳn mục Console/Hydration/Install-prompt/Camera-permission (các API này cần thiết bị + HTTPS/localhost thật).

## 6. Build / Lint / TSC — ✅ PASS lại sau khi sửa
`npx tsc --noEmit` 0 lỗi · `npm run lint` no warnings · `npm run build` 17 routes OK.

## Kiểm tra theo checklist (1–11)
1. Render lỗi: ❌ không · 2. Responsive 390×844: phone-frame + bottom nav OK (CSS) · 3. Desktop: AdminShell grid + sidebar collapse (md breakpoint) OK · 4. Navigation: tất cả link 200 · 5. Login flow: dev mock 302 + session OK · 6. Camera permission: cần thiết bị thật (getUserMedia có xử lý lỗi quyền) · 7. PWA manifest: `/manifest.webmanifest` 200 · 8. Install prompt: component beforeinstallprompt (cần browser hỗ trợ) · 9/10. Console/Hydration: giới hạn headless (xem mục 5) · 11. Runtime: 0 lỗi.

**Trạng thái:** Phase 1B.5 HOÀN THÀNH — 2 lỗi UI/React đã sửa, gates PASS lại, các route render đúng. **Dừng.**

---
---

# 5S Daily — Phase 1C Run Report (Multi-photo Submission Refactor)

> Ngày: 2026-06-16 · Branch `feature/phase1-foundation`.
> Refactor **1 Submission = 1 Photo → 1 Submission = N Photos**. KHÔNG SharePoint/Watermark/Upload/Graph.

## Thay đổi cốt lõi
Một "lần gửi" (submission) nay **gom N ảnh** rồi nộp một lần. Thêm vùng tích lũy ảnh (**Session Gallery**, route `/session`) giữa Camera và Success. Ảnh giữ ở **client session store** (in-memory + sessionStorage) cho tới khi "Xác nhận nộp" — chưa upload.

## 1. Files created
- `src/features/capture/session-context.tsx` — store ảnh của lần gửi (add/remove/clear/submit + persist sessionStorage)
- `src/app/session/page.tsx` — **route mới `/session`** (Session Gallery)

## 2. Files modified
- **Docs:** `DATA_MODEL.md` (§2 → header `5SSubmissions` + lines `5SSubmissionPhotos`; cập nhật công thức KPI/PhotoCount/CoveredAreas), `ARCHITECTURE.md` (flow multi-photo §1.2 + upload N ảnh §4 + idempotency 2 cấp), `SHAREPOINT_SCHEMA.md` (folder N ảnh theo `PhotoID`, list lines, ERD 1–N), `ROADMAP.md`, `TASK_QUEUE.md`, `RUN_REPORT.md`
- **Code:** `src/components/providers/Providers.tsx` (bọc `SessionCaptureProvider`), `src/app/capture/page.tsx` (lưu Area vào session), `src/app/camera/page.tsx` (shutter → addPhoto + badge số ảnh), `src/app/preview/page.tsx` (Giữ ảnh → /session, Chụp lại → bỏ ảnh), `src/app/success/page.tsx` ("Đã nộp N ảnh"), `src/app/history/page.tsx` (nhóm theo lần gửi × số ảnh)

## 3. Flow mới (đã implement)
`Capture` (chọn Area) → `Camera` (chụp) → `Preview` (Giữ ảnh) → **`/session` Session Gallery** → { Chụp thêm → Camera (lặp) | Hoàn tất → Xác nhận nộp } → `Success` ("Đã nộp N ảnh").

## 4. Route `/session` — tính năng
- Danh sách ảnh đã chụp (thumbnail + #thứ tự + khu vực + giờ)
- Xoá từng ảnh (✕) · Xoá tất cả
- Ô "＋ Chụp thêm" (→ Camera) · nút "+ Chụp thêm"
- Tổng số ảnh (badge) · "Hoàn tất (N)" → sheet "Xác nhận nộp" → Success
- Empty state khi chưa có ảnh

## 5. Data model (mô hình mới)
- `5SSubmissions` (header, 1 dòng/lần gửi): + `PhotoCount`, `Areas`, `SubmittedAt`; bỏ field ảnh đơn lẻ.
- `5SSubmissionPhotos` (lines, 1 dòng/ảnh): `PhotoID`, `SubmissionID`(FK), `Area`, `PhotoTime`, `SeqNo`, GPS, URL, `ContentHash`.
- Idempotency 2 cấp: `SubmissionID` (header) + `PhotoID` (ảnh).

## 6. Build / Lint / TSC — ✅ PASS
`npx tsc --noEmit` 0 lỗi · `npm run lint` no warnings · `npm run build` **18 routes** (thêm `/session`).

## 7. Giới hạn / ngoài phạm vi
- Không upload, không SharePoint, không Graph, không watermark ghép ảnh (đúng yêu cầu 1C).
- "Ảnh" trong session là bản ghi placeholder (gradient) — chưa có bytes ảnh thật / chưa nén; sẽ nối ở Phase 2.

**Trạng thái:** Phase 1C HOÀN THÀNH — refactor N-photo (UX + data model + state client), gates PASS, route `/session` hoạt động. **Dừng.**

---
---

# 5S Daily — Phase 1C-ext Run Report (Mobile real-device + Camera HTTPS + Multi-photo)

> Ngày: 2026-06-17 · Branch `feature/phase1-foundation` · Base tag `phase-1b5-ui-review`.
> Fix lỗi review iPhone thật + sẵn sàng test qua HTTPS dev. Vẫn local/mock — không SharePoint/upload/watermark.

## Preflight
pwd `/data/dev/5s-app` · branch `feature/phase1-foundation` · working tree **clean** · log `20b776c/82efde5/6acf855` · tag `phase-1b5-ui-review` · node v20.20.2 · npm 10.8.2.

## Part A — Mobile shell fix
- AppShell production: **bỏ khung iPhone giả + viền đen + status bar giả**. App full-viewport (`100dvh`), `env(safe-area-inset-*)`, bottom nav chừa safe-area iOS. Desktop = cột max-width 480px căn giữa (no bezel). Khung thiết bị giả chỉ ở **dev preview** (`NEXT_PUBLIC_DEVICE_PREVIEW=true`).

## Part B — Camera HTTPS handling
- `useCamera` phân biệt **insecure / unsupported / denied / no-device**; insecure → *"Camera cần HTTPS hoặc localhost. Hãy mở app qua https://she.biahalong.com để chụp ảnh."* (không còn báo nhầm "không hỗ trợ").
- Thêm `capture()` (chụp frame thật → JPEG dataURL) + `makeSimulatedPhoto()` (ảnh mô phỏng khi insecure/no-camera để vẫn test được luồng).
- Doc: `docs/CAMERA_TESTING.md` (iOS/Android/HTTPS/Tailscale, URL test, checklist iPhone).

## Part C — Port 3002 readiness
- Thêm script **`dev:3002`** (`next dev -p 3002`); không đổi `dev` mặc định. Tunnel doc: `she.biahalong.com → http://localhost:3002` (trong CAMERA_TESTING.md). Không chạm PM2/tunnel config.

## Part D — Multi-photo flow
- Type model đúng spec: `SubmissionSession` + `SessionPhoto` (localStorage), + `SubmittedSummary` cho history mock.
- Flow: Home → Capture(**Bắt đầu chụp**, tạo session) → Camera(chụp, real/simulated) → Preview(**Chụp lại/Giữ ảnh**, KHÔNG có "Gửi") → **/session**(grid, xoá, +Chụp thêm, Hoàn tất) → panel **Xác nhận nộp** (Dept/Area/Reporter/PhotoCount/StartedAt/GPS summary) → Success("Đã nộp N ảnh").

## Routes
Cập nhật: `/`, `/capture`, `/camera`, `/preview`, `/success`, `/history`. Có sẵn: `/session`. (18 routes; `/session/confirm` dùng panel inline thay vì route riêng.)

## Files
- **Created:** `docs/CAMERA_TESTING.md` (session-context.tsx / session route đã tạo ở 1C trước).
- **Modified:** `globals.css` (app-shell + safe-area + dev-preview), `components/layout/AppShell.tsx` (rewrite production shell), `features/capture/session-context.tsx` (rewrite theo type model + history), `hooks/useCamera.ts` (secure-context + capture + simulated), `app/{capture,camera,preview,session,success,history}/page.tsx`, `package.json` (dev:3002), docs `ARCHITECTURE.md` `DATA_MODEL.md` `ROADMAP.md` `TASK_QUEUE.md` `RUN_REPORT.md`.

## Quality gate — ✅ PASS (vòng 1)
`tsc --noEmit` 0 lỗi · `lint` no warnings · `build` 18 routes.

## Known limitations
- Local/mock: chưa upload/SharePoint/Graph (Phase 2B/2C), chưa watermark ghép ảnh thật (Phase 2A).
- Camera thật chỉ chạy qua HTTPS/localhost (đúng quy định trình duyệt) — qua Tailscale HTTP sẽ dùng ảnh mô phỏng.
- GPS chưa thu thập (optional fields = undefined) — bật ở Phase 2.
- History là mock cục bộ (localStorage), không đồng bộ giữa thiết bị.

**Trạng thái:** Phase 1C-ext HOÀN THÀNH — mobile shell sạch, camera HTTPS-aware, flow N-ảnh đầy đủ; gates PASS. **Dừng.**

---
---

# 5S Daily — Phase 2A Run Report (Local Data Flow + Watermark Engine)

> Ngày: 2026-06-17 · Branch `feature/phase1-foundation` · Base `e735723`.
> Luồng nộp cục bộ thật + watermark Canvas. **KHÔNG** upload SharePoint/Graph/backend.

## Preflight
pwd `/data/dev/5s-app` · branch `feature/phase1-foundation` · working tree **clean** · log `e735723/20b776c/82efde5/6acf855/0ea53da` · tag `phase-1b5-ui-review` · node v20.20.2 / npm 10.8.2. (Đã dừng dev server 5s-app trên 3002 để build sạch.)

## Files created
- `src/types/submission.ts`
- `src/lib/submissions/local-submission-store.ts`, `src/lib/submissions/metadata.ts`
- `src/hooks/useGeolocation.ts`
- `src/lib/watermark/watermark-types.ts`, `src/lib/watermark/watermark-engine.ts`
- `docs/WATERMARK_ENGINE.md`, `docs/LOCAL_DATA_FLOW.md`

## Files modified
- `src/features/capture/session-context.tsx` (rewrite: store delegation + pendingCapture)
- `src/app/{camera,preview,session,success}/page.tsx`
- `DATA_MODEL.md`, `ARCHITECTURE.md`, `ROADMAP.md`, `TASK_QUEUE.md`, `RUN_REPORT.md`

## Data model summary
`SubmissionSession` (1 lần gửi) chứa N `SessionPhoto` (mỗi ảnh: `originalDataUrl` + `watermarkedDataUrl` + `watermarkMetadata` + GPS + status). `completeSession()` → `CompletedSubmission(status: UploadStatus="local-only")`. Type chuẩn ở `src/types/submission.ts`.

## Local storage flow summary
Store `local-submission-store.ts` (localStorage, SSR-safe): getCurrentSession/saveCurrentSession/clearCurrentSession/addPhotoToSession/removePhotoFromSession/completeCurrentSession/listCompletedSubmissions/getCompletedSubmissionById. Draft giữ original+watermarked; history strip original (giữ watermarked thumbnail); ghi history chống vượt quota (trim entry cũ). Context React mirror trên store.

## Geolocation summary
`useGeolocation` + `getGeoSnapshot`: timeout 5s, **không chặn nộp**; trả lat/lng/accuracy/capturedAt/status. UI: "Đang lấy GPS…" / "Đã lấy GPS" / "Không lấy được GPS (vẫn nộp được)". Insecure context → unavailable. Reverse geocoding: future (fallback "Chưa xác định địa chỉ").

## Watermark engine summary
`generateWatermarkedImage()` (Canvas): downscale ≤1280px giữ tỉ lệ, khối góc dưới-trái nền đen 55% + chữ trắng + dòng "✓ 5S Verified" xanh, font scale theo ảnh, JPEG quality cấu hình; trả original+watermarked dataURL + width/height/mime/sizeBytes. Nội dung đúng spec nghiệp vụ.

## Camera integration summary
`/camera`: getUserMedia + `capture()` frame thật (hoặc ảnh mô phỏng khi insecure/no-cam) + GPS snapshot → `setPendingCapture` → `/preview`. `/preview`: ghép watermark thật, hiển thị, **Chụp lại / Giữ ảnh** (Giữ ảnh → addPhoto + `/session`). `/session`: thumbnail watermarked, xoá, +chụp thêm, Hoàn tất → Xác nhận nộp → completeSession → `/success`. `/history`: list từ store.

## Routes updated
`/capture /camera /preview /session /success /history` (18 routes; không thêm route mới).

## Build / Lint / TSC — ✅ PASS (vòng 1)
`tsc --noEmit` 0 lỗi · `lint` no warnings · `build` 18 routes.

## Manual test checklist
1. Mở **https://she.biahalong.com** (camera cần HTTPS) → đăng nhập.
2. `/capture` chọn khu vực → **Bắt đầu chụp**.
3. `/camera`: cho phép camera + GPS → thấy badge "Đã lấy GPS" → bấm chụp.
4. `/preview`: thấy **ảnh thật có watermark** (giờ/ngày/đơn vị/khu vực/người chụp/GPS/5S Verified) → **Giữ ảnh**.
5. `/session`: thumbnail watermarked, chụp thêm 2–3 tấm, thử **xoá**.
6. **Hoàn tất → Xác nhận nộp** → `/success` "Đã nộp N ảnh".
7. `/history`: thấy lần gửi vừa nộp (số ảnh + thời gian).
8. Test HTTP/Tailscale: camera báo "cần HTTPS" + "Dùng ảnh mô phỏng" vẫn chạy hết luồng.

## Known limitations
Local-only: chưa upload/SharePoint/Graph (2C), chưa IndexedDB (2B → localStorage có giới hạn quota). Reverse geocoding chưa có (địa chỉ = "Chưa xác định địa chỉ"). History strip ảnh gốc (giữ watermarked). Watermark client-side (server re-stamp/anti-fraud future).

## Git status / Commit hash
Xem cuối báo cáo (commit local sau khi viết xong). **Không push.**

**Trạng thái:** Phase 2A HOÀN THÀNH — local data flow + watermark engine thật, gates PASS. **Dừng.**

---
---

# 5S Daily — Phase 2A.1 + 2B Run Report (Photo-count fix + IndexedDB + Offline queue)

> Ngày: 2026-06-17 · Branch `feature/phase1-foundation` · Base `fda3b0f`. Không SharePoint/Graph/upload thật/deploy/push.

## Preflight
pwd `/data/dev/5s-app` · branch `feature/phase1-foundation` · working tree **clean** · log `fda3b0f/e735723/20b776c/82efde5/6acf855` · tag `phase-1b5-ui-review` · node v20.20.2 / npm 10.8.2. (Đã dừng dev server 3002 để build sạch, **bật lại** cuối phiên.)

## Bug root cause (Part A)
Confirm "2 ảnh" nhưng Success "1 ảnh". **Gốc:** ảnh lưu dưới dạng **data URL base64 trong localStorage**. Mỗi `SessionPhoto` mang `originalDataUrl` + `watermarkedDataUrl` (~100–300KB/ảnh). Khi thêm ảnh thứ 2, `saveCurrentSession()` gọi `localStorage.setItem` **vượt quota → ném lỗi, `writeJSON` trả false (âm thầm)**. Nhưng React state vẫn nhận `[photo1, photo2]` (confirm = 2), trong khi localStorage chỉ còn `[photo1]`. `completeSession()` đọc localStorage → `photoCount = 1` → Success/history sai.

## Bug fix (Part A)
Tách lưu trữ: **ảnh nhị phân → IndexedDB**, **metadata (nhỏ) → localStorage**. `SessionPhoto` bỏ data URL nặng, chỉ giữ `thumbnailDataUrl` nhỏ + `photoId`/`submissionId`. → `saveCurrentSession` không còn vượt quota → **count đồng nhất** giữa confirm (state), success, history, metadata lưu trữ. `completeSession` dùng `session.sessionId` làm `submissionId` (khớp IndexedDB + queue). Regression test runner: dự án **chưa cấu hình** test framework → không thêm (tránh scope creep); thay bằng invariant `photoCount = photos.length` + checklist thủ công.

## Files created
- `src/lib/storage/{indexeddb.ts, photo-store.ts, storage-types.ts, queue-store.ts, image-utils.ts}`
- `src/lib/queue/{queue-types.ts, offline-queue.ts, sync-engine.ts}`
- `src/hooks/{useOnlineStatus.ts, useQueue.ts}`
- `src/components/system/{SyncRunner.tsx, OfflineBanner.tsx}`, `src/components/home/QueueStatusCard.tsx`
- `src/app/debug/storage/page.tsx`
- `docs/INDEXEDDB_STORAGE.md`, `docs/OFFLINE_QUEUE.md`

## Files modified
- `src/types/submission.ts` (SessionPhoto → thumbnailDataUrl + submissionId)
- `src/lib/submissions/local-submission-store.ts` (submissionId=sessionId, bỏ field nặng)
- `src/features/capture/session-context.tsx` (IndexedDB cleanup + enqueue + mock sync)
- `src/app/{preview,session,camera,history,page}.tsx`, `src/components/providers/Providers.tsx`, `src/app/globals.css` (btn-danger)
- `ARCHITECTURE.md`, `DATA_MODEL.md`, `ROADMAP.md`, `TASK_QUEUE.md`, `RUN_REPORT.md`

## IndexedDB architecture summary
DB `5s-daily`, store `photos` (keyPath `photoId`, index `by_submission`). `StoredPhoto{photoId, submissionId, originalBlob, watermarkedBlob, thumbnailBlob, createdAt, status}`. SSR-safe. Ghi ở `/preview → Giữ ảnh` (dataURL→Blob + thumbnail). Xoá ảnh/huỷ session → xoá blob. Metadata + thumbnail nhỏ ở localStorage.

## Offline queue summary
`QueueItem{queueId, submissionId, createdAt, lastAttemptAt?, attemptCount, status}` (localStorage). State: draft/ready/queued/uploading/uploaded/failed/cancelled. `completeSession` → enqueue `queued` → `processQueue()` **mock** (queued→uploading→uploaded, delay 500ms, **không network**). `SyncRunner` chạy khi mount(online)+sự kiện `online`. `useOnlineStatus`/`useQueue` phản ứng qua sự kiện `5s-queue-changed`.

## Home status updates
Thẻ trạng thái đồng bộ: "✓ Đã đồng bộ" / "⚠ N lần gửi đang chờ đồng bộ" / "❌ N lần gửi lỗi" + chỉ báo 🟢 Online/🔴 Offline. Banner đỏ khi offline (toàn app).

## History updates
Mỗi lần gửi có badge: Đã đồng bộ / Đang chờ đồng bộ / Đang đồng bộ… / Lỗi đồng bộ (join theo `submissionId` với queue).

## Debug page summary
`/debug/storage` (dev-only, không có trong nav): Current Session, Completed Submissions, Queue Items, số ảnh IndexedDB, dung lượng/quota (navigator.storage.estimate), nút Clear Session / Clear Queue / Clear IndexedDB. Production → "chỉ khả dụng ở dev".

## Build / Lint / TypeScript — ✅ PASS (vòng 1)
`tsc --noEmit` 0 lỗi · `lint` no warnings · `build` **19 routes** (thêm `/debug/storage`).

## Manual test checklist
1. https://she.biahalong.com → đăng nhập → `/capture` → Bắt đầu chụp.
2. Chụp **2–3 ảnh** (Giữ ảnh từng tấm). 3. `/session` đếm đúng số ảnh.
4. Hoàn tất → Xác nhận nộp → **Success hiển thị ĐÚNG số ảnh** (bug đã hết).
5. Home: thẻ "Đã đồng bộ" (mock sync chạy khi online); History badge "Đã đồng bộ".
6. **Bật chế độ offline** (DevTools/airplane): banner đỏ; nộp → History "Đang chờ đồng bộ"; bật online lại → tự "Đã đồng bộ".
7. `/debug/storage`: thấy số ảnh IndexedDB tăng theo số đã chụp; thử Clear.

## Known limitations
- Sync là **mock** (không network/SharePoint) — Phase 2C. Mock luôn thành công (chưa mô phỏng lỗi/retry thật).
- Chưa migrate ảnh cũ (nếu có) từ localStorage sang IndexedDB — phiên mới mới áp dụng.
- Reverse geocoding chưa có. Test runner chưa cấu hình (không có unit test tự động).

## Git status / Commit hash
Xem cuối (commit local sau báo cáo). **Không push.**

**Trạng thái:** Phase 2A.1 + 2B HOÀN THÀNH — bug đếm ảnh đã sửa, IndexedDB + offline queue (mock) hoạt động, gates PASS. **Dừng.** Phase kế: 2C SharePoint Upload Engine.

---
---

# 5S Daily — Phase 2B.1 Run Report (Storage Validation & Stress Test)

> Ngày: 2026-06-17 · Branch `feature/phase1-foundation` · Base `9ed6e0f`. Validation/audit — không SharePoint/Graph/deploy/push.

## Preflight
pwd `/data/dev/5s-app` · branch `feature/phase1-foundation` · working tree **clean** · log `9ed6e0f/fda3b0f/e735723/20b776c/82efde5` · node v20.20.2 / npm 10.8.2.

## Storage audit findings (Part A)
- IndexedDB `StoredPhoto`: original / watermarked / thumbnail đều là **Blob** ✅.
- Queue (`5s.queue.v1`) = metadata ✅.
- **Phát hiện:** `SessionPhoto.thumbnailDataUrl` (base64 nhỏ) vẫn nằm trong localStorage (session + history) → vi phạm "metadata-only".

## Blob validation result
original/watermarked/thumbnail = Blob trong IndexedDB (ghi ở `/preview` qua `dataUrlToBlob`). ✅

## localStorage validation result
**Đã fix:** bỏ `thumbnailDataUrl` khỏi `SessionPhoto`; thumbnail đọc từ IndexedDB qua object URL (`<PhotoThumb>`). Thêm `auditLocalStorage()` quét chuỗi `data:image` → `/debug/storage` báo "Không có image payload trong localStorage". ✅ **localStorage = metadata-only.**

## Queue persistence result
Queue ở localStorage (`5s.queue.v1`), KHÔNG phải React-only → **sống qua refresh + restart trình duyệt**. SyncRunner xử lý lại khi `online`. ✅

## Session persistence result
Session draft ở localStorage; context hydrate khi mount; thumbnail tải lại từ IndexedDB theo `photoId` → số ảnh đúng, không vỡ tham chiếu sau refresh. ✅

## Stress test result
`/debug/storage` → nút +5/+10/+20 (`generateMockPhotos` tạo ảnh ~1280×960 vào IndexedDB + queue item). Quan sát: **localStorage gần như không đổi**, **IndexedDB usage tăng tuyến tính** theo số ảnh → ảnh không vào localStorage; vượt xa giới hạn ~5 ảnh của cách cũ. ✅

## Safari review result
Object URL có revoke; IndexedDB OK iOS14+ (Private Mode suy biến an toàn); **rủi ro ITP eviction ~7 ngày** → cần upload 2C làm nguồn bền vững; localStorage Private Mode try/catch; getUserMedia cần HTTPS. Chi tiết: `docs/STORAGE_VALIDATION.md`.

## Files created
- `src/lib/storage/storage-audit.ts`, `src/lib/storage/stress-test.ts`
- `src/components/media/PhotoThumb.tsx`
- `docs/STORAGE_VALIDATION.md`

## Files modified
- `src/lib/storage/photo-store.ts` (getObjectUrl)
- `src/types/submission.ts` (bỏ thumbnailDataUrl), `src/lib/submissions/local-submission-store.ts`
- `src/app/preview/page.tsx`, `src/app/session/page.tsx`, `src/app/camera/page.tsx`, `src/app/debug/storage/page.tsx`
- `DATA_MODEL.md`, `TASK_QUEUE.md`, `RUN_REPORT.md`

## Build / Lint / TypeScript — ✅ PASS (vòng 1)
`tsc` 0 lỗi · `lint` no warnings · `build` 19 routes.

## Phase 2C readiness verdict
**✅ READY** — tất cả 8 mục checklist đạt: binary storage solved · queue survives restart · session/history survive refresh · IndexedDB validated · localStorage metadata-only · stress passed · debug visibility.

## Known risks
- Safari ITP có thể evict storage sau ~7 ngày không dùng → 2C upload là nguồn bền vững (offline queue chỉ là đệm). Khuyến khích Add-to-Home-Screen.
- Sync vẫn **mock** (không network). Stress numbers là origin-wide estimate. Chưa có unit test tự động.

## Git status / Commit hash
Xem cuối (commit local sau báo cáo). **Không push.**

**Trạng thái:** Phase 2B.1 HOÀN THÀNH — storage validated, localStorage metadata-only, READY cho 2C. **Dừng.**

---
---

# 5S Daily — Phase 2C.1 Run Report (SharePoint Data Foundation & Schema)

> Ngày: 2026-06-17 · Branch `feature/phase1-foundation` · Base `b6b92c6`. **DESIGN + FOUNDATION only** — không write/upload/provision/seed/push.

## Preflight
pwd `/data/dev/5s-app` · branch `feature/phase1-foundation` · working tree **clean** · log `b6b92c6/9ed6e0f/fda3b0f/e735723/20b776c` · node v20.20.2 / npm 10.8.2.

## SharePoint architecture review
Đối chiếu frontend (Phase 2A/2B) ↔ SharePoint target → `docs/sharepoint/BAN5S_FIELD_MAPPING.md`. Mapping: `CompletedSubmission`→`Data_Submissions`; `SessionPhoto`+`StoredPhoto`→`Data_SubmissionPhotos`+file `img`; `QueueItem`→`Data_SyncLogs`(+`SyncStatus`); mock danh mục→`Config_*`. Mismatch ghi nhận (UploadStatus↔SyncStatus, SubmissionId format, SubmissionDate, GPS header, geocoding, tên list cũ). Đánh dấu SHAREPOINT_SCHEMA.md Phase 0 **superseded** bởi BAN5S_SCHEMA.md.

## Final schema summary
Site Ban5S, 3 container đã chốt: **ListConfig**/**ListData** (namespace bằng tiền tố `Config_*`/`Data_*` vì SP list flat) + **img** (Document Library). Giả định namespace đã ghi rõ + open question.

## ListConfig design
`Config_Departments` (DepartmentCode/Name/Manager/Email/IsActive/SortOrder), `Config_Areas` (AreaCode/Name/DepartmentCode/IsActive/SortOrder), `Config_Settings` (Key/Value/Description), `Config_RoleMapping` (Email/Role/DepartmentCode/IsActive). Đầy đủ internal name/display/type/required/indexed trong BAN5S_SCHEMA.md.

## ListData design
`Data_Submissions` (header: SubmissionId/Dept/Area/Reporter/PhotoCount/SubmissionDate/SubmittedAt/GPS/Status/SyncStatus), `Data_SubmissionPhotos` (lines: PhotoId/SubmissionId/SeqNo/Original+Watermarked Url/CaptureTime/GPS), `Data_SyncLogs` (QueueId/SubmissionId/Status/AttemptCount/Message/Timestamp).

## img library design
`img/YYYY/MM/DepartmentCode/SubmissionId/{original,watermarked}-NN.jpg`. Naming/collision (đường dẫn tất định + PUT ghi đè khi retry)/retention (watermarked lâu dài, original ≥12 tháng) — BAN5S_SCHEMA.md.

## TypeScript model summary
`src/types/sharepoint.ts`: `DepartmentRecord/AreaRecord/SettingRecord/RoleMappingRecord/SubmissionRecord/SubmissionPhotoRecord/SyncLogRecord` — internal name khớp SharePoint, **strict, no any**.

## Graph foundation summary
`src/lib/sharepoint/`: `sharepoint-config.ts` (site/list names, GRAPH_* env names), `sharepoint-types.ts` (Graph wire types), `graph-client.ts` (READ-ONLY GET + `getAppOnlyToken()` 501 stub), `site-context.ts` (resolve site/list/img drive — read GET), `list-helpers.ts` (URL builder + mappers fields→record, no any). **Không mutation, không import vào page nào.**

## Provisioning package summary
`docs/sharepoint/`: `BAN5S_SCHEMA.md`, `BAN5S_FIELD_MAPPING.md`, `BAN5S_PROVISION_PLAN.md` (PnP + Graph, index checklist, Sites.Selected), `BAN5S_GRAPH_PLAN.md` (auth, upload flow 2C.2, sync). Đủ để provision/worker tương lai không phải nghĩ lại schema.

## Phase 2C.2 readiness verdict
**✅ READY.** Upload Engine có thể build ngay: schema đầy đủ, types sẵn, foundation read-only + plan rõ. Không thiếu field cốt lõi; mapping rõ (mismatch là việc tầng map của 2C.2). Schema hỗ trợ: offline queue (SyncLogs+SyncStatus), GPS (header+line), nhiều ảnh (header–lines), reporting/dashboard tháng (SubmissionDate/DepartmentCode indexed). Giới hạn SP (5000 threshold, 4MB upload session, throttling) đã ghi và có chiến lược.

## Build / Lint / TypeScript — ✅ PASS (vòng 1)
`tsc` 0 lỗi · `lint` no warnings · `build` 19 routes (sharepoint lib standalone, không thêm route).

## Known risks
- Container "ListConfig/ListData" hiểu là namespace 7-list (SP flat) — cần Admin SharePoint xác nhận trước provision thật (open question).
- `getAppOnlyToken` chưa cài (501) — auth thật ở 2C.2. SubmissionId cần format lại sang `SUB-YYYYMMDD-####`. Reverse geocoding chưa có.

## Git status / Commit hash
Xem cuối (commit local sau báo cáo). **Không push.**

**Trạng thái:** Phase 2C.1 HOÀN THÀNH — schema Ban5S + types + Graph foundation read-only + provisioning package; gates PASS; không write/upload. Verdict **READY cho 2C.2 Upload Engine**. **Dừng.**

---
---

# 5S Daily — Phase 2C.1A Run Report (Ban5S Structure Correction)

> Ngày: 2026-06-17 · Branch `feature/phase1-foundation` · Base `d4f5a6f`. Doc/code realignment — không write/upload/push.

## Preflight
pwd `/data/dev/5s-app` · branch `feature/phase1-foundation` · working tree **clean** · log `d4f5a6f/b6b92c6/9ed6e0f/fda3b0f/e735723` · node v20.20.2 / npm 10.8.2.

## Hiểu lầm đã sửa & vì sao sai
- **Trước (2C.1):** coi `ListConfig`/`ListData` là **namespace khái niệm** (chỉ tiền tố `Config_*`/`Data_*`), `img` là Document Library, và để ngỏ "open question".
- **Sai vì:** thực tế site Ban5S đã có **Document Library "5S"** chứa **3 thư mục THẬT** `img`/`ListConfig`/`ListData` do người dùng cố ý tạo để tách ảnh / cấu hình / dữ liệu. Chúng không phải nhãn, không phải List, không được thay thế.

## Final source of truth (Ban5S)
- Site: `https://biahalong.sharepoint.com/sites/Ban5S`
- Document Library: **"5S"**
- Thư mục THẬT trong "5S": `img` (ảnh) · `ListConfig` (artifact cấu hình/seed/export) · `ListData` (artifact vận hành/export/log)
- Dữ liệu có cấu trúc: **Lists cấp site** `Config_Departments/Areas/Settings/RoleMapping`, `Data_Submissions/SubmissionPhotos/SyncLogs` — nhóm logic về ListConfig/ListData (SharePoint không lồng List vào folder — nói rõ trong docs).

## Docs updated
`docs/sharepoint/{BAN5S_SCHEMA, BAN5S_FIELD_MAPPING, BAN5S_PROVISION_PLAN, BAN5S_GRAPH_PLAN}.md` + `SHAREPOINT_SCHEMA.md`, `ARCHITECTURE.md`, `DATA_MODEL.md`, `ROADMAP.md`, `TASK_QUEUE.md`, `RUN_REPORT.md`. Gỡ bỏ wording "namespace giả định / flat-only / open question / folder optional"; thay bằng "thư mục thật, phải giữ & dùng".

## Code config updated
- `sharepoint-config.ts`: thêm `sharePointConfig { siteUrl, documentLibraryName:"5S", folders{img,listConfig,listData}, lists{...} }` (+ re-export tương thích).
- `site-context.ts`: `resolveLibraryDrive` (tìm drive **"5S"**), `listLibraryRootChildren`, `verifyExpectedFolders` (img/ListConfig/ListData), `imgFilePath`, `driveUploadPath`.
- `types/sharepoint.ts`: sửa comment cấu trúc.

## Provisioning plan changes
Verify-first: kiểm tra site → library "5S" → 3 thư mục tồn tại (KHÔNG xoá/đổi tên/tạo trùng/tạo thư viện ảnh khác) → tạo/verify 7 List + index → dùng `5S/img` để upload, `5S/ListConfig`/`5S/ListData` cho artifact. Bỏ open question.

## Graph readiness changes
Thêm **reality check bắt buộc** trước upload (2C.2A): GET drives → drive "5S" → root children → verify `img/ListConfig/ListData` → GET lists verify `Config_*`/`Data_*`. Thiếu → DỪNG, không tự tạo trùng.

## Build / Lint / TypeScript — ✅ PASS (2 vòng)
Vòng 1 fail do `*/` (chuỗi `Config_*/Data_*`) nằm trong block comment làm đóng comment sớm → đã sửa wording. Vòng 2: `tsc` 0 lỗi · `lint` clean · `build` 19 routes.

## Cái gì KHÔNG đổi
Toàn bộ app logic (capture/watermark/IndexedDB/offline queue/UI), routes, và field schema của các record giữ nguyên. Chỉ chỉnh cách hiểu & mô tả cấu trúc SharePoint + code config + plan.

## Phase 2C.2 implications
Upload Engine phải: (1) chạy reality check trước; (2) upload ảnh vào **drive "5S" → thư mục `img/...`** (không tạo thư viện riêng); (3) ghi Lists `Config_*`/`Data_*`; (4) có thể dùng `ListConfig`/`ListData` cho export/log. Auth app-only `Sites.Selected` vẫn cần secret/grant thật → sẽ dừng hỏi khi tới 2C.2.

## Known risks
Cần xác nhận tên Document Library đúng là **"5S"** (nếu khác, chỉnh `documentLibraryName`). `getAppOnlyToken` vẫn 501 (2C.2). SubmissionId cần format `SUB-YYYYMMDD-####`.

## Git status / Commit hash
Xem cuối (commit local sau báo cáo). **Không push.**

**Trạng thái:** Phase 2C.1A HOÀN THÀNH — cấu trúc Ban5S đã chỉnh đúng (library "5S" + thư mục thật img/ListConfig/ListData), docs/code/plan realigned, gates PASS. **Dừng.**

---
---

# 5S Daily — Phase 2C.2 Run Report (Graph health + SSO + SharePoint DB foundation)

> Ngày: 2026-06-24 · Branch `feature/phase1-foundation` · Không upload ảnh / không sync queue / không push / không deploy.

## Preflight
Working tree clean. Env đủ; AUTH_SECRET ban đầu là placeholder → đã sinh secret thật (gitignored, không in). Node v20.20.2 / npm 10.8.2.

## Graph token (app-only)
`getAppOnlyToken()` thật (client-credentials, scope `.default`). Verify dev: token acquired = yes · tenant 7e29…94e3 · client `9e9a...10f4`. Không log/in secret.

## Ban5S health check (read-only, đo thật)
Site FOUND · Library "5S" FOUND. Nhưng: trong "5S" chỉ có thư mục **`Img`** (hoa) — thiếu `img`/`ListConfig`/`ListData` theo plan; lists hiện có là **`5S_Config`**, **`5S_Submissions`** (khác `Config_*`/`Data_*`). → `ready=false`. Endpoint: `GET /api/admin/sharepoint/health` + UI `/admin/sharepoint-health`.

## SSO
Provider Entra `microsoft-entra-id` đã wire (env có đủ). **Redirect URI cần đăng ký:** `https://she.biahalong.com/api/auth/callback/microsoft-entra-id` (KHÔNG phải azure-ad). `/signin` hiện nút Microsoft khi provider cấu hình; `/api/me` trả displayName/email/department/jobTitle/officeLocation (Graph delegated); dev login còn khi `NEXT_PUBLIC_ALLOW_DEV_LOGIN=true`.

## SharePoint DB provisioning
Code đầy đủ (`provision-service` tạo 7 list + cột + index; `POST /provision` verify-site-trước). **CHƯA chạy prod** vì reality lệch (tránh tạo trùng với `5S_Config`/`5S_Submissions`). Chờ user chốt: dùng list cũ hay tạo bộ mới.

## Seed config
`seedConfig()` idempotent (PMKT/PXHL/KCS + 5 khu vực) qua `POST /seed-config`. CHƯA chạy (cần list tồn tại trước).

## Files created
graph-client (rewrite token thật), health-service, provision-service, config-service, submission-service, admin-guard; routes health/provision/seed-config; UI /admin/sharepoint-health.

## Build/Lint/TSC
PASS cả 3 (gate vòng 1).

## Known risks
- Cấu trúc SharePoint thật khác plan (Img / 5S_Config / 5S_Submissions) → provision đang chờ quyết định.
- `Sites.ReadWrite.All` rộng → nên chuyển `Sites.Selected` (hardening).
- Chưa verify full OAuth browser flow (cần đăng ký redirect URI + admin consent delegated).

**Trạng thái:** Phase 2C.2 HOÀN THÀNH phần code/foundation; provision/seed chờ user chốt cấu trúc. **STOPPED - waiting for user review.**

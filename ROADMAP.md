# 5S Daily — Future Roadmap (Phase 0 output)

> Lộ trình thực tế, chia phase giao được giá trị tăng dần. Mỗi phase có Definition of Done (DoD).
> Phase 0 (tài liệu này) = Architecture & Technical Design — **đã hoàn thành**.

---

## Tổng quan phases

| Phase | Tên | Giá trị chính | Phụ thuộc |
|---|---|---|---|
| 0 | Architecture & Design | Bản thiết kế để code | — |
| 1 | Auth + PWA Skeleton + Camera | Đăng nhập, cài app, chụp được | 0 |
| 2 | Upload + Watermark + SharePoint | Gửi ảnh thật, có metadata | 1 |
| 3 | Dashboard + Admin views | Thay tổng hợp thủ công | 2 |
| 4 | Reporting (Excel) | Báo cáo tháng tự động | 3 |
| 5 | Notifications (Teams/Email/Push) | Nhắc tự động | 3 |
| 6 | AI & Fraud Detection | Tăng độ tin cậy | 2,3 |

---

## Phase 1 — Auth · PWA · Camera
**Trạng thái:** Phase **1A DONE** (scaffold, Auth.js skeleton + dev mock, PWA, UI port, camera). Phase **1B DONE** (Graph foundation `src/lib/graph`, `/api/me`, profile card thật, department mapping, roles/permissions, env + staging docs). Phase **1C DONE** (refactor **1 Submission = N Photos** + fix thiết bị thật: bỏ khung iPhone giả → app full-viewport/safe-area; camera secure-context (HTTPS/localhost) báo đúng + ảnh mô phỏng; session store `SubmissionSession`/`SessionPhoto` (localStorage) + route `/session`; history mock cục bộ; script `dev:3002`; dev domain `https://she.biahalong.com`). Còn lại của Phase 1: verify PM2 + Cloudflare Tunnel với tenant thật (staging).

> **Tách Phase 2 cho rõ:**
> - **2A = Local data flow + Watermark engine — ✅ DONE:** capture frame thật, GPS snapshot (`useGeolocation`), watermark Canvas (`src/lib/watermark`), local store (`local-submission-store`, localStorage), types `src/types/submission.ts`, history cục bộ. Vẫn local-only.
> - **2A.1 = Fix bug đếm ảnh — ✅ DONE:** gốc do localStorage quota; chuyển ảnh sang IndexedDB → count đáng tin.
> - **2B = IndexedDB + Offline queue — ✅ DONE (mock):** ảnh ở IndexedDB (`src/lib/storage`), queue + sync-engine mock (`src/lib/queue`), online detection, Home/History/banner/`/debug/storage`. Không network.
> - **2C.1 = SharePoint Data Foundation & Schema — ✅ DONE (design/foundation):** schema cuối Ban5S (`docs/sharepoint/`), types `src/types/sharepoint.ts`, Graph foundation read-only `src/lib/sharepoint/`, field mapping, provisioning + Graph plan. Không write/upload.
> - **2C.1A = Sửa cấu trúc Ban5S — ✅ DONE:** chốt thực tế — Document Library **"5S"** có **thư mục thật** `img`/`ListConfig`/`ListData` (không phải namespace giả định/open question). Config code (`sharePointConfig`) + docs đã chỉnh; health check trước upload. Verdict: **READY cho 2C.2**.
> - **2C.2** = SharePoint Upload Engine: token app-only (MSAL), create item, upload `img`, PATCH header, SyncLogs, retry/backoff (thay `mockUploadOne`).
**Mục tiêu:** Khung app chạy được, đăng nhập M365, cài PWA, mở camera & chụp (chưa upload thật).

- Next.js + TS + Tailwind scaffold; cấu trúc thư mục (xem ARCHITECTURE).
- Auth.js + Entra ID OIDC; session cookie; route guard theo role.
- PWA: manifest, service worker, install prompt, offline app-shell.
- `/api/me`: trả profile + Department (readonly) + Role.
- Camera screen (getUserMedia / input capture), Preview tĩnh, Watermark Canvas (render local, chưa upload).
- Đưa prototype HTML/CSS thành component thực (giữ đúng UX đã duyệt).

**DoD:** đăng nhập được bằng tài khoản M365 thật; cài lên màn hình điện thoại; chụp + xem watermark; chạy qua Cloudflare Tunnel + PM2.

---

## Phase 2 — Upload · Watermark · SharePoint
**Mục tiêu:** Gửi ảnh thật lên SharePoint với metadata; offline queue hoạt động.

- Tạo Document Library + Lists thật theo SHAREPOINT_SCHEMA (gồm `5SSubmissionPhotos`).
- Graph client (App-only, Sites.Selected); ensure-folder-path; upload session.
- `/api/submissions` (init header → upload N ảnh → ghi N lines → commit) idempotent theo SubmissionID + PhotoID (mô hình 1 submission = N photos của Phase 1C).
- Offline queue (IndexedDB) + background sync + retry/backoff.
- Xử lý lỗi GPS/mạng/timeout/partial theo ARCHITECTURE §4.
- History cá nhân/đơn vị từ dữ liệu thật.

**DoD:** nhân viên gửi ảnh < 30s (mạng 4G); ảnh + metadata xuất hiện đúng trên SharePoint; gửi offline rồi tự đồng bộ khi có mạng.

---

## Phase 3 — Dashboard · Admin
**Mục tiêu:** Thay thế tổng hợp thủ công của Ban MTĐS.

- Aggregation server + cache: Today/Weekly/Monthly Completion, Missing, Ranking, Heatmap (công thức DATA_MODEL §3).
- Màn: Dashboard, Pending, Ranking, Gallery, Calendar Heatmap, Unit Detail, Photo Detail, Empty States.
- RBAC enforce + data scoping; audit export/delete.
- **Chốt Q-01, Q-03, Q-04** (định nghĩa hoàn thành, deadline, working-day) trước khi build công thức.

**DoD:** Ban MTĐS nhìn dashboard biết ngay ai chưa gửi & tỷ lệ; không còn dò Zalo thủ công.

---

## Phase 4 — Reporting (Excel)
**Mục tiêu:** Xuất báo cáo tháng tự động.

- `/api/export?month=` sinh `.xlsx` (exceljs): sheet theo đơn vị + Missing Matrix + Summary (DATA_MODEL §4).
- Tô màu theo ngưỡng completion; audit EXPORT.
- (Tùy chọn) lịch xuất tự động cuối tháng.

**DoD:** xuất 1 click ra Excel khớp số liệu dashboard, gửi lãnh đạo dùng được ngay.

---

## Phase 5 — Notifications
**Mục tiêu:** Nhắc đơn vị chưa gửi tự động.

- Scheduler (node-cron/systemd) đối chiếu Expected vs Submitted theo ngưỡng giờ.
- Teams webhook / Graph chatMessage; Email (Graph sendMail); Web Push (PWA).
- Nút "Nhắc"/"Nhắc tất cả" cho admin.
- Tham số kênh/giờ trong 5SSettings.

**DoD:** đơn vị chưa gửi nhận nhắc qua Teams/Email lúc ngưỡng giờ; admin nhắc thủ công 1 chạm.

---

## Phase 6 — AI & Fraud Detection
**Mục tiêu:** Tăng độ tin cậy dữ liệu 5S.

- Server re-stamp watermark + chữ ký số; đối chiếu EXIF.
- Geofence quanh cơ sở (auto-flag GPS bất thường).
- Phát hiện ảnh trùng/near-duplicate (hash + perceptual hash).
- (Xa hơn) AI chấm điểm 5S sơ bộ từ ảnh; phát hiện ảnh chụp-lại-màn-hình.

**DoD:** hệ thống tự flag submission đáng ngờ cho người duyệt; tỷ lệ false-positive thấp.

---

## Nguyên tắc roadmap
- Mỗi phase **giao được giá trị độc lập** (có thể dừng và vẫn dùng được).
- Không tối ưu sớm: anti-fraud tự động & notification chỉ làm sau khi luồng cốt lõi ổn định.
- Quyết định mở rộng (archive, geofence, PDF) dựa trên **số liệu thật** sau khi vận hành.

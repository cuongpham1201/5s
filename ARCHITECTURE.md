# 5S Daily — System Architecture & Technical Design (Phase 0)

> Status: **DESIGN ONLY** — no code, no project scaffolding. Input to Phase 1.
> Last updated: 2026-06-16

---

## 0. Mục tiêu

Thay thế hoàn toàn quy trình gửi ảnh 5S qua Zalo bằng một **PWA nội bộ**:

- Nhân viên: mở app → chụp → gửi (< 30 giây), ảnh tự đóng dấu (watermark) thời gian + vị trí + người chụp.
- Ban Môi trường đời sống: theo dõi real-time ai đã/chưa gửi, tỷ lệ hoàn thành, xuất báo cáo.

Tài liệu này mô tả kiến trúc đủ chi tiết để **bắt đầu code ở Phase 1**.

---

## 1. Business Analysis

### 1.1 User Roles

| Role | Mô tả | Quy mô | Thiết bị chính |
|------|-------|--------|----------------|
| **Employee** | Người chụp ảnh 5S đại diện cho 1 đơn vị | ~50–200 người | Điện thoại (PWA) |
| **Environment Team** (Ban MTĐS) | Theo dõi, đôn đốc, xuất báo cáo | 2–5 người | Desktop + đôi khi mobile |
| **Admin** | Cấu hình đơn vị/khu vực, phân quyền, vận hành | 1–2 người | Desktop |

> **Lưu ý quan hệ Employee ↔ Department:** một đơn vị (Department) thường có **nhiều nhân viên** có thể gửi ảnh, nhưng KPI tính theo **đơn vị**, không theo cá nhân. Đây là quyết định nền tảng cho toàn bộ data model (xem §8 và DATA_MODEL.md).

### 1.2 Daily Workflow (Employee)

```
Mở app (đã đăng nhập M365, session còn hiệu lực)
 → Home: thấy ngay "Hôm nay đơn vị mình đã gửi chưa"
 → Bấm CHỤP ẢNH
 → Department: readonly (lấy từ M365 profile / mapping)
 → Chọn Area (danh sách động theo Department)
 → Camera (fullscreen) → chụp
 → Preview: xem watermark thật + GPS + địa chỉ
 → Gửi → (watermark + upload + ghi metadata) → Success
 → (tùy chọn) Chụp tiếp khu vực khác
```

Mục tiêu thời gian: **< 30 giây** cho 1 lần gửi thành công ở điều kiện mạng bình thường.

### 1.3 Admin Workflow (Environment Team)

```
Đăng nhập → Dashboard (KPI hôm nay)
 ├─ Thấy Missing Units cao → mở Pending → bấm "Nhắc" đơn vị
 ├─ Mở Calendar Heatmap → nhìn 5s biết đơn vị/ngày nào thiếu
 ├─ Mở Unit Detail → xem chi tiết 1 đơn vị (lịch sử, ảnh, tỷ lệ)
 ├─ Mở Gallery → lọc Department/Area/Date → mở Photo Detail
 └─ Cuối tháng → Reporting → xuất Excel
```

### 1.4 Reporting Workflow

```
Chọn kỳ (tháng) → hệ thống tổng hợp theo Department:
Expected Days, Submitted Days, Completion Rate, Photo Count
 → Xuất Excel (.xlsx) → gửi lãnh đạo
```

### 1.5 KPI

**KPI chính (primary):**
1. **Daily Completion Rate** = đơn vị đã gửi hôm nay / đơn vị kỳ vọng.
2. **Adoption** = % đơn vị thực sự dùng app thay Zalo (mục tiêu cuối: 100%, Zalo = 0).

**KPI phụ (secondary):**
- Submitted Units / Missing Units hôm nay.
- Weekly / Monthly Completion Rate theo đơn vị.
- Photo Count (tổng & trung bình/đơn vị/ngày).
- Thời gian thao tác trung bình (đo gián tiếp qua khoảng cách open→success).
- Tỷ lệ ảnh có GPS hợp lệ (chất lượng dữ liệu).

**Success Criteria (Definition of Done cho sản phẩm):**
- ✅ Zalo được loại bỏ hoàn toàn khỏi quy trình 5S.
- ✅ Ban MTĐS không còn tổng hợp thủ công — số liệu tự động, real-time.
- ✅ ≥ 90% đơn vị gửi đúng hạn sau 1 tháng vận hành.
- ✅ Thao tác gửi < 30s ở điều kiện mạng 4G.

---

## 2. Kiến trúc tổng thể (High-level Architecture)

```
┌─────────────────────────────────────────────────────────────┐
│                        CLIENT (PWA)                          │
│  Next.js (App Router) + TypeScript + Tailwind                │
│  - Service Worker (offline cache + upload queue)             │
│  - Camera (getUserMedia / <input capture>)                   │
│  - Watermark Engine (Canvas, client-side)                    │
│  - IndexedDB (offline queue + metadata tạm)                  │
└───────────────┬─────────────────────────────────────────────┘
                │ HTTPS (Cloudflare Tunnel)
┌───────────────▼─────────────────────────────────────────────┐
│              NEXT.JS SERVER (Route Handlers / BFF)           │
│  - Auth.js (Microsoft Entra ID / M365 OIDC)                  │
│  - API: /api/submissions, /api/dashboard, /api/export ...    │
│  - Graph client (app-only hoặc on-behalf-of token)           │
│  - Tổng hợp KPI, sinh Excel, (tương lai) gửi Teams/Email     │
└───────────────┬─────────────────────────────────────────────┘
                │ Microsoft Graph API
┌───────────────▼─────────────────────────────────────────────┐
│                   MICROSOFT 365 / SHAREPOINT                 │
│  - Document Library "5SPhotos" (original + watermarked)      │
│  - Lists: 5SSubmissions, 5SDepartments, 5SAreas,             │
│           5SUserMap, 5SSettings, 5SAuditLog                  │
│  - Entra ID (Auth, groups → roles)                           │
└─────────────────────────────────────────────────────────────┘

HOSTING: Ubuntu Homelab → PM2 (Next.js process) → Cloudflare Tunnel → Internet
```

### 2.1 Vì sao BFF (Backend-for-Frontend) thay vì gọi Graph trực tiếp từ client?

- **Bảo mật token**: không lộ Graph token / app secret ra trình duyệt.
- **Kiểm soát quyền**: server áp dụng RBAC, validate, audit log tập trung.
- **Tổng hợp KPI**: tính toán/cache phía server, client chỉ nhận JSON gọn.
- **SharePoint throttling**: server gom request, cache, retry có kiểm soát.

### 2.2 Deployment topology

| Thành phần | Vị trí | Ghi chú |
|---|---|---|
| Next.js (SSR + API) | Ubuntu Homelab, chạy qua **PM2** (cluster mode) | `pm2 start`, auto-restart |
| Reverse proxy / TLS | **Cloudflare Tunnel** | Không mở port public, có WAF/HTTPS |
| Auth | **Microsoft Entra ID** (OIDC) | App registration riêng |
| Storage | **SharePoint Online** | Không tự host dữ liệu ảnh |
| Secrets | `.env` trên homelab (ngoài git) | Phase 1 mới cấu hình thật |

---

## 3. Watermark Engine (§5 của brief)

### 3.1 Input / Output

```
Input:  raw image blob (từ camera)
        + { photoTime, lat, lng, address, department, area, reporter }
Output: watermarked image blob (JPEG) — góc dưới trái, nền đen 55%, chữ trắng
        (giữ nguyên original blob để lưu song song)
```

Nội dung watermark (chuẩn đã duyệt):
```
17:20 | 15/06/2026
Thứ Hai
Lê Lợi / Hồng Gai / Quảng Ninh
Phòng ban: PMKT
Khu vực: Văn phòng
Người chụp: Nguyễn Văn A
GPS: 20.9512, 107.0834
✓ 5S Verified
```

### 3.2 Client-side vs Server-side

| Tiêu chí | Client-side (Canvas) | Server-side (sharp/canvas) |
|---|---|---|
| Tải server | Thấp ✅ | Cao (CPU homelab có hạn) ❌ |
| Offline | Hoạt động ✅ | Không thể khi mất mạng ❌ |
| WYSIWYG (preview = file) | Chính xác ✅ | Phải render 2 lần ❌ |
| Băng thông upload | Upload cả 2 ảnh → tốn hơn ⚠️ | Chỉ upload 1 ảnh gốc ✅ |
| Khó làm giả | Yếu hơn (logic ở client) ⚠️ | Mạnh hơn ✅ |
| Tính nhất quán font/layout | Phụ thuộc thiết bị ⚠️ | Đồng nhất ✅ |

### 3.3 Khuyến nghị

**MVP: Client-side (Canvas API).** Lý do: offline-first là yêu cầu cứng (nhà xưởng sóng yếu), preview phải khớp file thật, và homelab CPU nên tránh gánh render. Nén ảnh trước khi vẽ (resize cạnh dài ~1600px, JPEG quality ~0.8) để cả `original` + `watermarked` vẫn nhẹ.

**Future (anti-fraud):** thêm **server-side re-stamp / verify** — server nhận `original` + metadata, tự sinh watermark "chuẩn vàng" và so khớp, đóng dấu chữ ký số (hash + secret) vào metadata để chống chỉnh sửa. Xem RISKS_AND_DECISIONS.md.

> Quyết định kép: lưu **cả original lẫn watermarked** (xem SHAREPOINT_SCHEMA.md) để vừa hiển thị nhanh (watermarked) vừa giữ bằng chứng gốc (original) cho kiểm tra.

---

## 4. Upload Flow (§6) — Sequence

```
[User] bấm "Gửi" trên Preview
   │
   ▼
[1] Validate client: có ảnh? có Area? có thời gian? (GPS optional — xem dưới)
   │
   ▼
[2] Watermark (Canvas) → tạo watermarked blob   (đã làm sẵn ở bước Preview để WYSIWYG)
   │
   ▼
[3] Sinh SubmissionID (client UUID/ULID) + đóng gói payload + 2 blob
   │
   ├── (Online) ─────────────────────────────────────────────┐
   │                                                          ▼
   │   [4a] POST /api/submissions/init → server trả upload session
   │   [4b] PUT original.jpg → SharePoint Doc Library
   │   [4c] PUT watermarked.jpg → SharePoint Doc Library
   │   [4d] POST metadata → server tạo item trong 5SSubmissions List
   │   [4e] Server trả 201 + submission record
   │                                                          │
   └── (Offline) ─► [4'] Đẩy vào IndexedDB queue (status=PENDING)
                     Service Worker Background Sync sẽ thử lại
                                                              │
   ▼                                                          ▼
[5] UI → Success screen (online: confirmed; offline: "đã lưu, sẽ đồng bộ")
   │
   ▼
[6] Dashboard cập nhật (server invalidate cache KPI cho Department+ngày)
```

### 4.1 Xử lý lỗi & ngoại lệ

| Tình huống | Hành vi |
|---|---|
| **Lỗi GPS** (timeout > 5s / từ chối quyền / trong nhà xưởng) | KHÔNG chặn gửi. Cho gửi với `lat/lng = null`, `geoStatus = "unavailable"`. Watermark ghi "GPS: không xác định". Dashboard vẫn tính hoàn thành. |
| **Lỗi mạng khi upload** | Chuyển submission vào **offline queue** (IndexedDB), retry tự động (exponential backoff). UI báo "đang chờ đồng bộ". |
| **Timeout upload** (mạng chậm) | Mặc định 30s/blob; quá hạn → đưa vào queue, không bắt user chờ. |
| **Upload ảnh 1 thành công, ảnh 2 fail** | Submission đánh dấu `PARTIAL`; retry chỉ phần thiếu (idempotent theo SubmissionID + tên file). |
| **Metadata fail sau khi ảnh đã lên** | Có file mồ côi → job dọn dẹp định kỳ đối soát Doc Library vs List (xem STOP_CONDITIONS / future). Retry tạo metadata bằng SubmissionID (chống trùng). |
| **Token hết hạn giữa chừng** | Auth.js silent refresh; nếu fail → giữ submission ở queue, yêu cầu đăng nhập lại, không mất ảnh. |
| **Ảnh quá lớn** | Nén client trước khi vào flow (resize + quality). |

### 4.2 Idempotency

`SubmissionID` sinh ở client là khóa idempotent xuyên suốt: tên file (`{SubmissionID}_original.jpg`), item List (cột `SubmissionID` unique-indexed). Retry không tạo bản ghi trùng.

---

## 5. Offline Strategy (§7) — PWA Offline-First

### 5.1 Thành phần

- **Service Worker**: cache app shell (HTML/CSS/JS, fonts, icons) → mở app được khi offline. Chiến lược: app shell = *stale-while-revalidate*; API GET dashboard = *network-first + fallback cache*; upload = *background sync*.
- **IndexedDB**: hàng đợi submission offline (payload + blob ảnh), trạng thái `PENDING | UPLOADING | FAILED | DONE`.
- **Background Sync API** (fallback: retry khi app mở lại + khi `online` event): tự đẩy queue khi có mạng.

### 5.2 Dữ liệu lưu local vs KHÔNG lưu local

| Lưu local (IndexedDB / Cache) | KHÔNG lưu local |
|---|---|
| App shell (UI tĩnh) | Token bí mật / Graph secret (chỉ ở server) |
| Submission đang chờ gửi (ảnh + metadata) | Toàn bộ kho ảnh đơn vị khác |
| Danh mục Department/Area (cache ngắn hạn để chọn offline) | Dữ liệu KPI tổng hợp toàn công ty |
| Profile tối thiểu của user (tên, đơn vị, email) | Dữ liệu cá nhân người khác |
| Cờ trạng thái "hôm nay đã gửi" (cache, đồng bộ lại khi online) | — |

### 5.3 Nguyên tắc

- **Employee = offline-first** (chụp ở nơi sóng yếu là kịch bản chính).
- **Admin = online-first** (dashboard cần dữ liệu mới; offline chỉ xem cache gần nhất + banner "dữ liệu lúc HH:MM").
- Ảnh trong queue được nén để không phình storage trình duyệt; cảnh báo nếu queue quá lớn (vd > 20 ảnh chưa gửi).

---

## 6. Notification Model (§10) — Future

Thiết kế trước, **không làm ở MVP**.

| Kênh | Trigger | Cơ chế |
|---|---|---|
| **Teams** | Đơn vị chưa gửi sau giờ ngưỡng (vd 16:00); nút "Nhắc tất cả" của admin | Incoming Webhook vào channel Ban MTĐS, hoặc Graph `chatMessage` tới người phụ trách đơn vị |
| **Email** | Tổng kết cuối ngày cho đơn vị thiếu; báo cáo tuần/tháng | Graph `sendMail` (app-only) hoặc SMTP nội bộ |
| **Push (PWA)** | Nhắc cá nhân lúc ngưỡng giờ | Web Push (VAPID); lưu ý iOS cần ≥16.4 + đã "Add to Home Screen" |

Cron/scheduler chạy phía server (PM2 + node-cron hoặc systemd timer) đối chiếu danh sách kỳ vọng vs đã gửi → bắn nhắc. Tham số (giờ ngưỡng, kênh) đặt trong `5SSettings`.

---

## 7. Liên kết tài liệu

- Lưu trữ ảnh & List: **SHAREPOINT_SCHEMA.md**
- Metadata, công thức KPI, Excel: **DATA_MODEL.md**
- Phân quyền & Auth: **SECURITY_MODEL.md**
- Rủi ro, anti-fraud, quyết định, giả định, câu hỏi mở: **RISKS_AND_DECISIONS.md**
- Lộ trình: **ROADMAP.md**
- Điều phối worker tự động: **TASK_QUEUE.md / AGENT_RULES.md / STOP_CONDITIONS.md**

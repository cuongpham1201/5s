# 5S Daily — Security Model (Phase 0)

> Phân quyền, xác thực, bảo vệ dữ liệu. Thiết kế, không cấu hình thật.

---

## 1. Authentication

- **IdP:** Microsoft Entra ID (M365), giao thức **OIDC**.
- **Thư viện:** **Auth.js** (NextAuth) với Microsoft Entra provider.
- **Luồng:** Authorization Code + PKCE. Token lưu trong **HTTP-only secure cookie session** (không để token trong localStorage/JS).
- **Silent refresh:** dùng refresh token để gia hạn; submission đang xử lý không bị mất khi token hết hạn (đẩy vào offline queue).
- **Scope tối thiểu (least privilege):** `openid profile email` + đọc profile. Truy cập SharePoint dùng quyền phía server (xem §4).

### 1.1 Mô hình truy cập Graph/SharePoint

Hai lựa chọn — phân tích:

| Mô hình | Mô tả | Ưu | Nhược |
|---|---|---|---|
| **On-Behalf-Of (delegated)** | Server dùng token user gọi Graph | Quyền đúng theo user, audit theo user thật | Phức tạp token exchange; user phải có quyền SharePoint trực tiếp |
| **App-only (application permission)** | App có service principal riêng truy cập site 5S | Đơn giản, ổn định, không phụ thuộc quyền SP của từng user | Phải tự enforce RBAC ở tầng app; audit cần ghi actor thủ công |

**Khuyến nghị MVP: App-only** giới hạn vào **một site SharePoint duy nhất** (Sites.Selected — chỉ cấp quyền lên site 5S, không phải toàn tenant). RBAC nghiệp vụ enforce ở BFF; mọi hành động ghi `5SAuditLog` với actor = user thật từ session. Lý do: vận hành homelab đơn giản, tránh phụ thuộc cấu hình quyền SharePoint cho từng nhân viên.

> **Bảo mật quan trọng:** dùng **`Sites.Selected`** thay vì `Sites.ReadWrite.All` — app chỉ chạm được site 5S, giảm tối đa bán kính ảnh hưởng nếu lộ secret.

---

## 2. Authorization — Roles

| Role | Nguồn xác định | Đối tượng |
|---|---|---|
| **Employee** | mặc định mọi user đăng nhập hợp lệ | Nhân viên các đơn vị |
| **Environment** (Ban MTĐS) | Entra group `5S-Environment` hoặc `5SUserMap.Role` | Người theo dõi/đôn đốc |
| **Admin** | Entra group `5S-Admin` hoặc `5SUserMap.Role` | Vận hành/cấu hình |

Quy tắc: role lấy theo thứ tự ưu tiên **Entra group → 5SUserMap → mặc định Employee**. Department của employee lấy từ `5SUserMap` (readonly, không cho client chọn/đổi).

---

## 3. Permission Matrix

| Hành động | Employee | Environment | Admin |
|---|:---:|:---:|:---:|
| Đăng nhập app | ✅ | ✅ | ✅ |
| Chụp & gửi ảnh (đơn vị của mình) | ✅ | ✅ | ✅ |
| Xem lịch sử **của chính mình/đơn vị mình** | ✅ | ✅ | ✅ |
| Xem ảnh đơn vị **khác** | ❌ | ✅ | ✅ |
| Dashboard tổng hợp toàn công ty | ❌ | ✅ | ✅ |
| Pending / Ranking / Heatmap / Gallery | ❌ | ✅ | ✅ |
| Unit Detail / Photo Detail (mọi đơn vị) | ❌ | ✅ | ✅ |
| Nhắc đơn vị (notification) | ❌ | ✅ | ✅ |
| Export Excel | ❌ | ✅ | ✅ |
| Xóa / ẩn ảnh (flag) | ❌ | ⛳ flag only | ✅ |
| Sửa danh mục Department/Area | ❌ | ❌ | ✅ |
| Sửa `5SSettings` | ❌ | ❌ | ✅ |
| Phân quyền user (5SUserMap) | ❌ | ❌ | ✅ |
| Xem `5SAuditLog` | ❌ | ⛳ read | ✅ |

Ký hiệu: ✅ cho phép · ❌ cấm · ⛳ giới hạn.

### 3.1 Data scoping (enforce ở BFF)

- **Employee:** mọi query tự động filter `Department = user.department` và/hoặc `ReporterEmail = user.email`. Server **không tin** tham số department từ client.
- **Environment/Admin:** không filter scope, nhưng mọi truy cập ghi audit.
- Đường dẫn ảnh (`OriginalPhotoUrl`/`WatermarkedPhotoUrl`) chỉ trả qua endpoint proxy có kiểm tra quyền — **không** trả link SharePoint công khai/anonymous.

---

## 4. Data Protection

| Lớp | Biện pháp |
|---|---|
| Truyền tải | HTTPS bắt buộc (Cloudflare Tunnel cung cấp TLS, không mở port public) |
| Token/secret | Chỉ ở server (`.env` ngoài git); cookie session HTTP-only, SameSite=Lax, Secure |
| Ảnh | Truy cập qua BFF proxy có RBAC; không public link |
| Secrets quản lý | App secret/cert Entra xoay vòng định kỳ; lưu ngoài repo |
| Input validation | Validate & sanitize mọi payload ở server (kích thước ảnh, mime, toạ độ, độ dài text) |
| Rate limiting | Giới hạn tần suất submit/IP/user để chống lạm dụng |
| Audit | `5SAuditLog` cho export/delete/config/login admin |
| CSRF | Auth.js CSRF token cho mutation; kiểm tra Origin |
| Quyền tối thiểu | `Sites.Selected` thay vì toàn tenant |

### 4.1 Privacy

- Chỉ thu thập dữ liệu cần thiết: tên, email công ty, ảnh 5S, GPS (tùy chọn).
- GPS là **vị trí chụp công việc**, không theo dõi cá nhân ngoài giờ — chỉ lấy tại thời điểm chụp.
- Thông báo rõ cho nhân viên khi xin quyền Camera/Location (onboarding).
- Retention: cân nhắc chính sách lưu/archive ảnh (vd giữ original 12 tháng) — quyết định ở Phase sau.

---

## 5. Threat considerations (tóm tắt — chi tiết ở RISKS_AND_DECISIONS.md)

- Giả mạo ảnh cũ / GPS sai / ảnh trùng → §Anti-fraud trong RISKS.
- Lộ secret homelab → `Sites.Selected`, xoay secret, không commit `.env`.
- Truy cập trái phép cross-department → data scoping ở BFF (không tin client).
- Tấn công upload (file lớn/độc hại) → giới hạn mime/size, không thực thi file, lưu trên SharePoint (không trên web server).

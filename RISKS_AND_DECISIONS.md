# 5S Daily — Risks, Decisions, Assumptions & Open Questions (Phase 0)

---

## 1. Architecture Decisions (ADR rút gọn)

| # | Quyết định | Lựa chọn | Lý do | Đánh đổi |
|---|---|---|---|---|
| AD-01 | Watermark ở đâu | **Client-side (Canvas)** cho MVP | Offline-first, WYSIWYG, giảm tải homelab | Upload 2 ảnh tốn băng thông; khó chống giả hơn → bù bằng server verify tương lai |
| AD-02 | Lưu ảnh gốc? | **Lưu cả original + watermarked** | Bằng chứng + re-generate được | Gấp đôi dung lượng |
| AD-03 | Tách metadata khỏi ảnh | **List riêng + Library riêng**, nối bằng SubmissionID | Query/aggregation linh hoạt, tránh nhân đôi metadata | Không có FK cứng, ràng buộc ở app |
| AD-04 | Truy cập SharePoint | **App-only + Sites.Selected** | Đơn giản vận hành, least privilege | RBAC phải tự enforce ở BFF |
| AD-05 | Kiến trúc API | **BFF (Next.js Route Handlers)** | Giấu token, RBAC tập trung, gom Graph call | Thêm 1 tầng |
| AD-06 | Idempotency | **SubmissionID (ULID) sinh client** | Retry an toàn, không trùng | Phụ thuộc client sinh đúng |
| AD-07 | Đơn vị đo Completion | **Theo ngày có gửi (≥1 ảnh)** ở MVP | Đơn giản, đúng nhu cầu cốt lõi | "Đủ khu vực" là tùy chọn cấu hình sau |
| AD-08 | Múi giờ | **Asia/Ho_Chi_Minh cho mọi tính ngày** | Tránh lệch ngày nửa đêm | Phải convert nhất quán |
| AD-09 | Department của user | **Readonly từ 5SUserMap** | Dữ liệu sạch, chống chọn nhầm | Cần duy trì bảng map |
| AD-10 | GPS bắt buộc? | **Không bắt buộc** (cho gửi khi lỗi) | Nhà xưởng sóng/định vị kém, không chặn nghiệp vụ | Giảm độ tin GPS → bù bằng GeoStatus + fraud rule |

---

## 2. Risks

### 2.1 Rủi ro kỹ thuật

| # | Rủi ro | Khả năng | Tác động | Giảm thiểu |
|---|---|---|---|---|
| R-01 | iOS PWA hạn chế (camera/push/background sync) | Cao | Cao | Test sớm trên Safari; fallback `<input capture>`; push chỉ iOS≥16.4 đã add-to-home |
| R-02 | SharePoint 5000-view-threshold & throttling | Cao | Cao | Indexed columns, query có filter, cache server, batch Graph |
| R-03 | Homelab downtime (điện/mạng/PM2 crash) | Trung bình | Cao | PM2 auto-restart, healthcheck, offline queue giữ submission, Cloudflare tunnel reconnect |
| R-04 | Mất mạng khi upload | Cao | Trung bình | Offline queue + background sync + retry backoff |
| R-05 | GPS chậm/sai trong nhà xưởng | Cao | Trung bình | Timeout 5s, không chặn gửi, GeoStatus |
| R-06 | Token M365 hết hạn giữa flow | Trung bình | Trung bình | Silent refresh; queue giữ ảnh; re-login không mất dữ liệu |
| R-07 | Ảnh lớn → upload chậm / quá 30s | Trung bình | Trung bình | Nén client (resize+quality), upload session chunked |
| R-08 | Lộ app secret trên homelab | Thấp | Cao | Sites.Selected, secret ngoài git, xoay vòng |
| R-09 | File mồ côi (ảnh lên, metadata fail) | Trung bình | Thấp | Job đối soát Library↔List; retry idempotent |

### 2.2 Rủi ro nghiệp vụ/UX

| # | Rủi ro | Giảm thiểu |
|---|---|---|
| R-10 | Nhân viên ngại bỏ Zalo | UI < 30s cực đơn giản, đào tạo 1 lần, admin theo dõi adoption, có thể chạy song song ngắn hạn rồi cắt Zalo |
| R-11 | Dữ liệu rỗng ngày đầu → tưởng lỗi | Empty states rõ ràng (đã có trong UX) |
| R-12 | Đơn vị/khu vực thay đổi liên tục | Danh mục trong List, Admin tự sửa, không hardcode |
| R-13 | Định nghĩa "hoàn thành" gây tranh cãi | Làm rõ với Ban MTĐS trước Phase 3 (xem câu hỏi mở Q-01) |

---

## 3. Anti-Fraud Design (§11)

| Gian lận | Dấu hiệu | MVP | Future |
|---|---|---|---|
| **Ảnh cũ** (chụp lại màn hình, gửi lại ảnh tháng trước) | `PhotoTime` lệch xa `CreatedAt`; EXIF ngày cũ; chỉ cho chụp trực tiếp (không chọn từ thư viện ở luồng chính) | Watermark có thời gian server-verifiable; chặn chọn ảnh từ gallery ở flow chính; lưu PhotoTime + CreatedAt | Server re-stamp + chữ ký số; đọc/đối chiếu EXIF; phát hiện ảnh chụp-lại-màn-hình |
| **GPS sai/giả** | Toạ độ ngoài vùng nhà máy; GeoStatus bất thường; GPS spoofing | Lưu lat/lng + GeoStatus; hiển thị trên Photo Detail để người duyệt nhận biết | Geofence (bán kính quanh cơ sở, cấu hình 5SSettings) → tự flag; cross-check IP/Wi-Fi |
| **Ảnh trùng** (gửi lại đúng 1 ảnh nhiều lần/nhiều đơn vị) | `ContentHash` trùng | Tính & lưu SHA-256 (`ContentHash`, indexed) | Tự động flag khi trùng hash trong N ngày; cảnh báo near-duplicate (perceptual hash) |

**Nguyên tắc:** MVP **thu thập tín hiệu** (PhotoTime, CreatedAt, GeoStatus, ContentHash, lưu original) và **hiển thị để con người phán đoán**; tự động hóa phát hiện/flag để Phase 6. Tránh chặn nhầm (false positive) làm hỏng trải nghiệm < 30s.

---

## 4. Assumptions (Giả định)

- A-01: Mọi nhân viên 5S có tài khoản M365 hợp lệ và truy cập được internet qua tunnel.
- A-02: Tổ chức có SharePoint Online (không phải SP Server on-prem).
- A-03: Mỗi đơn vị gửi ảnh hằng ngày vào working-day; cuối tuần/lễ không tính kỳ vọng (cấu hình được).
- A-04: KPI tính theo **đơn vị**, không theo cá nhân; 1 đơn vị có thể nhiều người gửi.
- A-05: "Hoàn thành ngày" = có ≥1 ảnh hợp lệ trong ngày (MVP).
- A-06: Volume ~ vài trăm đến ~18k submission/tháng — trong khả năng SharePoint nếu index đúng.
- A-07: Homelab đủ ổn định cho nội bộ; không cam kết SLA mức production cloud.
- A-08: Tiếng Việt là ngôn ngữ chính; múi giờ UTC+7.
- A-09: Watermark layout/nội dung đã chốt theo UX duyệt.
- A-10: Admin sẽ duy trì danh mục Department/Area/UserMap.

---

## 5. Open Questions (Câu hỏi còn mở)

| # | Câu hỏi | Ảnh hưởng | Cần ai trả lời |
|---|---|---|---|
| Q-01 | "Hoàn thành" = ≥1 ảnh/ngày hay phủ đủ mọi khu vực active? | Công thức KPI, heatmap partial | Ban MTĐS |
| Q-02 | Thuộc tính `department` trong Entra ID có khớp mã 5S không? Nếu có thì bỏ được 5SUserMap? | Bỏ/giữ 5SUserMap | IT/Admin AD |
| Q-03 | Giờ hạn gửi mỗi ngày (deadline) là mấy giờ? | KPI/nhắc/định nghĩa "trễ" | Ban MTĐS |
| Q-04 | Ngày làm việc & lịch nghỉ lễ lấy từ đâu? | Mẫu số Expected Days | HR/Admin |
| Q-05 | Có cần employee xem được ảnh của đồng nghiệp cùng đơn vị không? | Data scoping | Ban MTĐS |
| Q-06 | Chính sách lưu trữ/retention ảnh (bao lâu, archive)? | Dung lượng SharePoint | Admin/IT |
| Q-07 | App-only hay On-Behalf-Of? (mặc định đề xuất App-only) | Auth & audit | IT Security |
| Q-08 | Có cần geofence quanh cơ sở (toạ độ/bán kính) ngay không? | Anti-fraud MVP scope | Ban MTĐS |
| Q-09 | Chạy song song Zalo + app bao lâu trước khi cắt hẳn? | Kế hoạch rollout | Quản lý dự án |
| Q-10 | Số đơn vị & khu vực thực tế (để ước lượng volume/threshold)? | Sizing | Ban MTĐS |

> Các câu hỏi này **không chặn** việc bắt đầu Phase 1 (Auth/PWA/Camera), nhưng **phải chốt Q-01,Q-03,Q-04 trước Phase 3 (Dashboard)** và Q-02,Q-07 trước Phase 2 (Upload/SharePoint thật).

# 5S Daily — SharePoint Architecture (Phase 0)

> Thiết kế lưu trữ trên SharePoint Online. Không tạo SharePoint thật ở phase này.
> Nguyên tắc: **không mặc định đúng — phân tích rồi đề xuất.**

---

## 1. Tổng quan lựa chọn lưu trữ

5S Daily cần lưu 2 loại dữ liệu khác bản chất:

1. **Ảnh (binary, lớn)** → phù hợp **Document Library**.
2. **Metadata + danh mục (structured, query nhiều)** → phù hợp **SharePoint List**.

> Có thể nhét metadata vào cột của Document Library (mỗi file 1 item có cột tùy biến). **Không chọn cách đó** vì: (a) 1 submission = 2 file (original + watermarked) → metadata bị nhân đôi/lệch; (b) query/aggregation cho dashboard trên Library kém linh hoạt hơn List; (c) tách biệt cho phép xóa/đổi ảnh mà không phá vỡ bản ghi nghiệp vụ. → **Tách Library (ảnh) khỏi List (metadata)**, liên kết bằng `SubmissionID`.

---

## 2. Document Library: `5SPhotos`

### 2.1 Cấu trúc thư mục đề xuất

```
5SPhotos/
└── 2026/                         ← YYYY
    └── 06/                       ← MM
        └── PMKT/                 ← Department (mã)
            └── 2026-06-15_{SubmissionID}/   ← 1 thư mục / submission
                ├── original.jpg
                └── watermarked.jpg
```

Quy ước:
- `SubmissionID` = ULID/UUID sinh ở client (sortable theo thời gian nếu dùng ULID).
- Thư mục submission gắn ngày để con người đọc được + máy đối soát dễ.
- Tên file cố định (`original.jpg`, `watermarked.jpg`) → đường dẫn suy ra được từ metadata, giảm phụ thuộc tra cứu.

### 2.2 Ưu / Nhược cấu trúc YYYY/MM/Department/SubmissionID

**Ưu điểm:**
- ✅ Tránh giới hạn hiệu năng "5000 item view threshold" của SharePoint: phân tán file qua nhiều folder theo năm/tháng/đơn vị → mỗi folder ít item.
- ✅ Phân quyền theo thư mục Department khả thi (nếu cần giới hạn đơn vị chỉ xem ảnh của mình).
- ✅ Con người duyệt thủ công (fallback) vẫn hiểu được; backup/retention theo tháng dễ.
- ✅ Đường dẫn tất định → dựng URL không cần search.

**Nhược điểm:**
- ⚠️ Cây thư mục sâu → thao tác Graph cần tạo folder lồng (phải xử lý "ensure path"/tạo đệ quy).
- ⚠️ Department đổi tên/sáp nhập → đường dẫn lịch sử không tự đổi (chấp nhận: path là *mã*, hiếm đổi; metadata trong List mới là nguồn sự thật).
- ⚠️ Nếu 1 đơn vị gửi cực nhiều/ngày, folder tháng vẫn có thể lớn — nhưng chia tới Department + submission-folder nên rủi ro thấp.

**Phương án thay thế đã cân nhắc & loại:**
- *Phẳng theo SubmissionID* (`5SPhotos/{SubmissionID}/...`): đơn giản nhưng đụng 5000-threshold sớm, khó phân quyền theo đơn vị → **loại**.
- *YYYY/MM/DD/...*: thêm tầng ngày làm cây quá sâu, lợi ích nhỏ → **loại** (ngày đã có trong tên folder submission + metadata).

### 2.3 Vì sao lưu cả `original` + `watermarked`

| Lý do | Chi tiết |
|---|---|
| Hiển thị | `watermarked.jpg` dùng cho Gallery/Preview/Report (đã có dấu xác thực). |
| Bằng chứng | `original.jpg` giữ ảnh gốc phục vụ kiểm tra/anti-fraud (re-stamp & verify). |
| An toàn dữ liệu | Nếu logic watermark sai, vẫn re-generate được từ original. |

Chi phí: gấp ~2 dung lượng & băng thông. Giảm thiểu bằng nén client. (Tùy chọn tương lai: chỉ giữ original > N ngày rồi archive.)

---

## 3. SharePoint Lists — phân tích & đề xuất

> Đề xuất 6 list. Mỗi list kèm lý do tồn tại; những thứ gộp được đã gộp.

### 3.1 `5SSubmissions` (cốt lõi — bắt buộc)
Mỗi item = 1 lần gửi ảnh của 1 đơn vị cho 1 khu vực tại 1 thời điểm.
→ Chi tiết cột xem **DATA_MODEL.md §2**.

- **Vì sao cần:** nguồn sự thật cho mọi KPI, dashboard, report, lịch sử.
- **Lưu ý quy mô:** 200 đơn vị × ~3 ảnh/ngày × 30 ngày ≈ 18.000 item/tháng. Vượt 5000-view-threshold → **bắt buộc indexed columns + query có filter theo cột indexed** (Department, SubmissionDate). Cân nhắc archive theo năm.

### 3.2 `5SDepartments` (danh mục — bắt buộc)
Danh sách đơn vị tham gia 5S.

| Cột | Kiểu | Ghi chú |
|---|---|---|
| Code | Text | PK nghiệp vụ: PMKT, PXHL, KCS... (indexed, unique) |
| Name | Text | Tên đầy đủ |
| IsActive | Yes/No | Đơn vị còn tham gia? (lọc Expected Units) |
| ExpectedDaily | Yes/No hoặc Number | Có phải gửi hàng ngày không / số ảnh kỳ vọng |
| ManagerEmail | Person/Text | Người nhận nhắc nhở (future notification) |
| SortOrder | Number | Thứ tự hiển thị |

- **Vì sao cần:** "Expected Units" của KPI = đơn vị `IsActive=true`. Không hardcode danh sách đơn vị trong code.

### 3.3 `5SAreas` (danh mục — bắt buộc)
Khu vực thuộc từng đơn vị (danh sách động cho màn Capture).

| Cột | Kiểu | Ghi chú |
|---|---|---|
| AreaName | Text | Văn phòng, Phòng họp, Kho POSM... |
| Department | Lookup → 5SDepartments | Khu vực thuộc đơn vị nào (indexed) |
| IsActive | Yes/No | |
| SortOrder | Number | |

- **Vì sao tách khỏi Departments:** quan hệ 1-nhiều (1 đơn vị nhiều khu vực), khu vực thay đổi độc lập. Nhúng vào Departments sẽ phải dùng multi-value khó query.

### 3.4 `5SUserMap` (mapping — **đề xuất, cân nhắc theo thực tế**)
Ánh xạ user M365 → Department + Role (vì brief yêu cầu Department lấy từ tài khoản, readonly).

| Cột | Kiểu | Ghi chú |
|---|---|---|
| UserEmail | Text | indexed, unique |
| DisplayName | Text | |
| Department | Lookup → 5SDepartments | Đơn vị mặc định của user |
| Role | Choice | Employee / Environment / Admin |

- **Phân tích — vì sao có thể KHÔNG cần list này:** nếu Entra ID đã có thuộc tính `department` chuẩn và group → role rõ ràng, ta đọc thẳng từ token/Graph, **bỏ được `5SUserMap`**. Nhưng thực tế thuộc tính `department` trong AD công ty thường **không khớp mã đơn vị 5S** (PMKT/PXHL...) → cần bảng ánh xạ. **Khuyến nghị: GIỮ `5SUserMap`** làm nguồn ánh xạ tường minh, dễ sửa không cần đụng AD. (Câu hỏi mở — xem RISKS.)

### 3.5 `5SSettings` (cấu hình — bắt buộc, nhẹ)
Key-Value cấu hình runtime, tránh hardcode.

| Cột | Kiểu | Ví dụ |
|---|---|---|
| SettingKey | Text | `submission.deadlineHour` = "18" |
| SettingValue | Text | `report.timezone` = "Asia/Ho_Chi_Minh" |
| Description | Text | `geo.timeoutMs` = "5000" |

- Ví dụ key: giờ hạn gửi, múi giờ, ngày làm việc (loại trừ cuối tuần/lễ cho Expected Days), ngưỡng nhắc, bán kính GPS hợp lệ (future).

### 3.6 `5SAuditLog` (vận hành/bảo mật — đề xuất)
Ghi nhận hành động nhạy cảm: export báo cáo, xóa ảnh, sửa danh mục, đăng nhập admin.

| Cột | Kiểu |
|---|---|
| Action | Choice (EXPORT/DELETE/CONFIG/LOGIN...) |
| Actor | Text (email) |
| Target | Text (SubmissionID / Department / ...) |
| Timestamp | DateTime |
| Detail | Multiline |

- **Vì sao cần:** dữ liệu 5S liên quan đánh giá thi đua → cần truy vết ai sửa/xóa/xuất gì. MVP có thể ghi tối thiểu (export + delete).

### 3.7 Bảng tổng hợp list

| List | Bắt buộc MVP | Vai trò |
|---|---|---|
| 5SSubmissions | ✅ | Bản ghi nghiệp vụ chính |
| 5SDepartments | ✅ | Danh mục đơn vị + Expected |
| 5SAreas | ✅ | Danh mục khu vực động |
| 5SUserMap | ✅ (khuyến nghị) | Map user → đơn vị/role |
| 5SSettings | ✅ | Cấu hình runtime |
| 5SAuditLog | ⛳ (tối thiểu MVP) | Truy vết hành động nhạy cảm |

---

## 4. Quan hệ dữ liệu (ERD rút gọn)

```
5SDepartments (Code) 1───* 5SAreas (Department lookup)
5SDepartments (Code) 1───* 5SSubmissions (Department)
5SDepartments (Code) 1───* 5SUserMap (Department)
5SSubmissions (SubmissionID) 1───1 [folder trong 5SPhotos: original + watermarked]
5SUserMap (UserEmail) 1───* 5SSubmissions (ReporterEmail)
```

`SubmissionID` là cầu nối giữa **List (metadata)** và **Library (ảnh)** — không có khóa ngoại cứng trong SharePoint, ràng buộc được giữ ở tầng ứng dụng (BFF).

---

## 5. Cân nhắc hiệu năng & giới hạn SharePoint

- **5000 item view threshold:** luôn query 5SSubmissions có filter trên cột **indexed** (Department, SubmissionDate). Dashboard tổng hợp nên cache phía server theo (ngày, đơn vị).
- **Throttling Graph:** gom request, dùng `$select`/`$filter`, batch khi có thể, retry tôn trọng `Retry-After`.
- **Upload lớn:** file > 4MB dùng **upload session** của Graph (chunked). Đã nén client nên đa số < 4MB.
- **Archive:** cân nhắc tách 5SSubmissions theo năm (vd `5SSubmissions_2026`) nếu volume lớn — quyết định ở Phase 3 dựa số liệu thật.

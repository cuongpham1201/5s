# 5S Daily — Stop Conditions (Autonomous Worker)

> Điều kiện dừng để worker không vượt phạm vi hoặc gây hại.

---

## 1. Dừng THÀNH CÔNG (hoàn thành phase)

Worker DỪNG và xuất RUN_REPORT khi **tất cả** đúng:
- ✅ Đủ 10 file tài liệu kiến trúc được tạo: ROADMAP, ARCHITECTURE, SHAREPOINT_SCHEMA, DATA_MODEL, SECURITY_MODEL, RISKS_AND_DECISIONS, TASK_QUEUE, AGENT_RULES, STOP_CONDITIONS, RUN_REPORT.
- ✅ Mọi mục công việc Phase 0 (P0-1..P0-12) = DONE.
- ✅ Quyết định, rủi ro, giả định, câu hỏi mở đã ghi nhận.
- ✅ Không vi phạm giới hạn cứng (không code/cài/deploy/commit).

→ **Hành động:** dừng tại đây, KHÔNG tự ý sang Phase 1.

## 2. Dừng CHỜ PHÊ DUYỆT (gate giữa các phase)

DỪNG và hỏi con người trước khi:
- 🚦 Bắt đầu Phase 1 (code thật) — cần xác nhận "đã duyệt kiến trúc, bắt đầu code".
- 🚦 Tạo SharePoint thật / cấu hình Entra App (Phase 2) — cần secret & quyền do người cấp.
- 🚦 Bất kỳ hành động ghi ra ngoài repo (deploy, push, gọi API thật).

## 3. Dừng KHẨN (abort ngay)

DỪNG ngay lập tức nếu:
- 🛑 Một yêu cầu buộc vi phạm giới hạn cứng của phase hiện tại.
- 🛑 Cần secret/token thật mà chưa được cấp đúng cách (KHÔNG tự đoán/nhập).
- 🛑 Phát hiện thao tác có thể phá dữ liệu/hệ thống thật (xóa, ghi đè production).
- 🛑 Hướng dẫn mâu thuẫn nhau không thể giải quyết an toàn.
- 🛑 Lặp lỗi > 3 lần cho cùng một thao tác (tránh vòng lặp vô ích).

→ **Hành động:** không tiếp tục, ghi lý do, báo người dùng, chờ chỉ dẫn.

## 4. KHÔNG phải điều kiện dừng (cứ tiếp tục)
- Thiếu thông tin nghiệp vụ chi tiết → ghi Open Question + giả định hợp lý, tiếp tục.
- Một quyết định có nhiều phương án → phân tích, khuyến nghị, tiếp tục.

## 5. Trạng thái hiện tại
**Đang ở:** cuối Phase 0 → **Stop Condition §1 (Dừng thành công)** kích hoạt sau khi RUN_REPORT.md hoàn tất. Chờ phê duyệt để mở Phase 1 (§2).

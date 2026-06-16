# 5S Daily — Agent Rules (Autonomous Worker)

> Quy tắc ràng buộc cho bất kỳ worker tự động nào làm việc trong repo này.

---

## 1. Phạm vi & giới hạn cứng (áp dụng cho Phase 0)

KHÔNG được, trong phiên Phase 0:
- ❌ Code Next.js / tạo project / scaffold app.
- ❌ Cài package (`npm/yarn/pnpm install`).
- ❌ Deploy, chạy server, mở port.
- ❌ Tạo SharePoint thật / gọi Graph thật.
- ❌ Sửa production / hệ thống thật.
- ❌ Yêu cầu hoặc nhập secret/token thật.
- ❌ `git commit` / `git push`.

CHỈ được:
- ✅ Phân tích & viết tài liệu kiến trúc (Markdown) trong `/data/dev/5s-app`.
- ✅ Đọc các tài liệu/prototype hiện có làm đầu vào.

## 2. Nguyên tắc làm việc

1. **Đầu vào là UX đã duyệt** — không thiết kế thêm UI, không sửa UX. Chỉ dùng làm input.
2. **Không mặc định là đúng** — với mọi đề xuất kiến trúc, phân tích phương án rồi mới khuyến nghị (ghi đánh đổi).
3. **Truy vết quyết định** — quyết định quan trọng ghi vào RISKS_AND_DECISIONS.md (dạng ADR).
4. **Giả định & câu hỏi mở phải tường minh** — không "âm thầm" giả định; ghi vào RISKS.
5. **Least privilege & security-by-default** — mọi thiết kế ưu tiên an toàn (Sites.Selected, BFF, no client secret).
6. **Idempotent & resumable** — thiết kế dữ liệu/flow chịu được retry.
7. **Không phình phạm vi** — bám đúng mục tiêu phase; không chi tiết hóa phase xa.
8. **Tiếng Việt** cho nội dung tài liệu (thuật ngữ kỹ thuật giữ nguyên tiếng Anh).

## 3. Định dạng đầu ra
- Mỗi tài liệu là 1 file `.md` ở root `/data/dev/5s-app`.
- Có heading rõ ràng, bảng cho so sánh/quyết định, sơ đồ ASCII khi cần.
- Liên kết chéo giữa các tài liệu (tránh lặp nội dung).

## 4. Khi gặp điều không chắc
- Nếu thiếu thông tin nghiệp vụ → ghi **Open Question** (RISKS §5), tiếp tục với giả định hợp lý đã ghi rõ. KHÔNG bịa số liệu thật.
- Nếu một yêu cầu mâu thuẫn giới hạn cứng → **dừng** và báo (xem STOP_CONDITIONS).

## 5. Chuyển phase
- Hết Phase 0 → **STOP**, xuất RUN_REPORT.md, chờ con người phê duyệt mới sang Phase 1.
- Mỗi lần sang phase mới: đọc lại AGENT_RULES + STOP_CONDITIONS (giới hạn cứng thay đổi theo phase — vd Phase 1 mới được code/cài package).

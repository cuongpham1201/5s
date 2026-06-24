# 5S Daily — Agent Rules (Autonomous Worker)

> Quy tắc ràng buộc cho bất kỳ worker tự động nào làm việc trong repo này.

---

## 0. Workspace & Deployment Workflow (LUÔN áp dụng — ưu tiên cao nhất)

Hai workspace tách biệt:
- **DEV (code ở đây):** `/data/dev/5s-app`
- **PRODUCT/STAGING runtime:** `/data/homelab/apps/5s-app/5s`

Quy tắc cứng:
- Claude **CHỈ code trong `/data/dev/5s-app`**. **KHÔNG** sửa code trực tiếp trong product folder.
- Product **chỉ nhận code qua `git pull`** từ GitHub. **PM2 chạy từ product folder.**
- Cloudflare `she.biahalong.com` → product PM2 **port 3002**.

**Trước MỌI task code:**
- verify `pwd` = `/data/dev/5s-app`
- báo `git status` clean / dirty (dirty → báo, không tự ý ghi đè)
- **KHÔNG bao giờ code trong product folder**

**Trước MỌI task deploy:**
- verify `pwd` = `/data/homelab/apps/5s-app/5s`
- chỉ `git pull` — **KHÔNG sửa file thủ công** (trừ `.env.local` khi được yêu cầu rõ)

**Deploy flow (7 bước):**
1. code/build/test ở dev → 2. commit ở dev → 3. push GitHub → 4. pull ở product →
5. `npm install` → 6. `npm run build` → 7. `pm2 restart 5s-app --update-env`.

(Chi tiết: `deployment/DEPLOYMENT.md`.)

---

## 1. Phạm vi & giới hạn cứng (lịch sử — Phase 0)
> Mục này mô tả giới hạn của **Phase 0** (design-only). Các phase sau (1A+) đã mở
> dần (code/cài package/commit/Graph thật...) — đọc đúng phase hiện tại. §0 ở trên
> luôn áp dụng bất kể phase.

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

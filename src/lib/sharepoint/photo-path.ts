/**
 * PARSER đường dẫn ảnh 5S dùng chung (P9.5 — gộp 2 bản trùng ở report-service
 * + photo-stats). CHỈ đọc — cấu trúc thư mục/tên file khi GHI không đổi.
 *
 * Layout hỗ trợ (cả hai đang tồn tại trên SharePoint):
 *   mới: Img/<Dept>/<YYYY-MM-DD>/<Sub>/file
 *   cũ : Img/<Dept>/<YYYY>/<MM>/<DD>/<Sub>/file
 * Trả null khi không khớp (caller tự fallback header/CaptureTime).
 */
export function parsePhotoPath(path: string): { dept: string; dateKey: string } | null {
  const parts = path.split("/");
  if (parts[0] !== "Img" || parts.length < 4) return null;
  const dept = parts[1];
  if (/^\d{4}-\d{2}-\d{2}$/.test(parts[2])) return { dept, dateKey: parts[2] };
  if (/^\d{4}$/.test(parts[2]) && /^\d{2}$/.test(parts[3]) && /^\d{2}$/.test(parts[4] ?? "")) {
    return { dept, dateKey: `${parts[2]}-${parts[3]}-${parts[4]}` };
  }
  return null;
}

/**
 * CONTROLLED CLIENT DATA RESET (Phase Reset / pre-UAT).
 *
 * Trước go-live UAT, mọi thiết bị đang chạy bản test có thể còn ảnh chờ + queue
 * lỗi + draft/history cache cũ trong IndexedDB/localStorage — server không xóa
 * tập trung được. Cơ chế: bump LOCAL_DATA_VERSION; khi app mở thấy phiên bản dữ
 * liệu local < hiện tại → coi là "cần reset". ClientResetGate hỏi người dùng,
 * và queue KHÔNG được tự retry cho tới khi reset xong (tránh ảnh test trồi lên).
 *
 * KHÔNG đụng session Microsoft (cookie next-auth) — chỉ xóa dữ liệu 5S local.
 */
import { clearAllPhotos } from "./photo-store";

/** Tăng số này mỗi đợt cần buộc thiết bị xóa dữ liệu local cũ. */
export const LOCAL_DATA_VERSION = 2;
const VERSION_KEY = "5s.dataVersion";

/** Các key localStorage nghiệp vụ 5S (KHÔNG gồm sidebar preference / phiên đăng nhập). */
const BUSINESS_KEYS = [
  "5s.queue.v1",       // retry queue
  "5s.session.v3",     // phiên chụp đang dở
  "5s.history.v3",     // lịch sử local
  "5s.uploadResult.v1",
  "5s.uplog.v1",       // upload debug ring
  "5s.lastCompletedId",
];

function hasWindow(): boolean {
  return typeof window !== "undefined" && typeof window.localStorage !== "undefined";
}

function storedVersion(): number {
  if (!hasWindow()) return LOCAL_DATA_VERSION; // SSR: coi như đã mới, không chặn
  const raw = window.localStorage.getItem(VERSION_KEY);
  return raw == null ? 0 : Number(raw) || 0;
}

/** Thiết bị còn dữ liệu local phiên bản cũ → cần hỏi reset. */
export function isLocalResetPending(): boolean {
  return storedVersion() < LOCAL_DATA_VERSION;
}

/** Đánh dấu đã ở phiên bản hiện tại (gọi sau khi reset xong hoặc cài mới sạch). */
export function markLocalDataCurrent(): void {
  if (hasWindow()) window.localStorage.setItem(VERSION_KEY, String(LOCAL_DATA_VERSION));
}

/**
 * Xóa toàn bộ dữ liệu 5S local (ảnh IndexedDB + queue + draft/history/cache),
 * GIỮ session Microsoft và preference giao diện. Idempotent.
 */
export async function resetLocalData(): Promise<{ photos: boolean; keys: number }> {
  let photosOk = false;
  try { await clearAllPhotos(); photosOk = true; } catch { /* store có thể chưa tạo */ }
  let cleared = 0;
  if (hasWindow()) {
    for (const k of BUSINESS_KEYS) {
      if (window.localStorage.getItem(k) != null) { window.localStorage.removeItem(k); cleared++; }
    }
    window.dispatchEvent(new Event("5s-queue-changed"));
  }
  markLocalDataCurrent();
  return { photos: photosOk, keys: cleared };
}

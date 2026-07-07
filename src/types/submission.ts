/**
 * Submission domain types (Phase 2A — local data flow).
 *
 * Model: 1 Submission = N Photos. These types are the single source of truth for
 * the client capture flow and the local store. They are shaped to map cleanly
 * onto the SharePoint header–lines schema later (Phase 2C), but NO upload happens
 * yet — everything is local (localStorage; IndexedDB recommended in Phase 2B).
 */

/** Lifecycle of a submission relative to the (future) SharePoint backend. */
export type UploadStatus =
  | "local-only" // saved on device, not yet uploaded (Phase 2A default)
  | "pending-upload"
  | "uploading"
  | "uploaded"
  | "failed";

export type PhotoStatus = "draft" | "ready";

export type GeoStatus = "pending" | "ok" | "denied" | "unavailable" | "timeout";

/** Loại bản ghi: báo cáo hàng ngày (mặc định) hoặc Thực hành 3S (M1/HD-01). */
export type SubmissionType = "daily" | "3s";
/** Thẻ S theo HD-01 (chỉ dùng cho Thực hành 3S). */
export type STag = "S1" | "S2" | "S3";
/** Loại ảnh 3S: hiện trạng tốt / vi phạm / cặp trước–sau. */
export type PhotoKind = "good" | "violation" | "before" | "after";

/** A point-in-time GPS reading captured at shutter time. Never blocks submit. */
export interface GeoLocationSnapshot {
  latitude: number | null;
  longitude: number | null;
  accuracy: number | null;
  capturedAt: string | null; // ISO
  status: GeoStatus;
  address: string; // reverse-geocode later; fallback "Chưa xác định địa chỉ"
}

/** Exactly the lines drawn onto the watermark (business-required content). */
export interface WatermarkMetadata {
  time: string; // HH:mm
  date: string; // dd/MM/yyyy
  weekday: string; // "Thứ Hai" ...
  address: string;
  department: string;
  area: string;
  /** Optional 5S check item(s) — drawn as "Hạng mục: ..." when present. */
  checkItem?: string;
  reporter: string;
  gps: string; // "20.9512, 107.0834" or "Không xác định"
  verifiedText: string; // "✓ 5S Verified"
}

export interface SessionPhoto {
  photoId: string;
  /** Owning submission id (= sessionId; IndexedDB index key). */
  submissionId: string;
  capturedAt: string; // ISO
  watermarkMetadata: WatermarkMetadata;
  latitude: number | null;
  longitude: number | null;
  address: string;
  status: PhotoStatus;
  // --- Thực hành 3S (per-photo tags; undefined cho ảnh daily) ---
  sTag?: STag;
  photoKind?: PhotoKind;
  violationNote?: string;
  /** Người vi phạm được TAG từ danh bạ (CAPA sẽ giao đích danh người này). */
  violatorEmail?: string;
  violatorName?: string;
  /** Local photoId của ảnh "trước" khi ảnh này là "sau" (ghép cặp). */
  linkedPhotoId?: string;
  // NOTE (Phase 2B.1): NO image payload here. All binaries (original /
  // watermarked / thumbnail) live in IndexedDB (photo-store) keyed by photoId.
  // localStorage holds metadata only.
}

/** The in-progress submission being captured (draft). */
export interface SubmissionSession {
  sessionId: string;
  departmentCode: string;
  departmentName?: string;
  areaCode: string;
  areaName: string;
  /** Optional selected 5S check item(s) for this session (Phase 2C.3 prep). */
  checkItemCode?: string;
  checkItemName?: string;
  reporterName: string;
  reporterEmail: string;
  /** "3s" cho phiên Thực hành 3S; undefined/"daily" cho báo cáo hàng ngày. */
  submissionType?: SubmissionType;
  startedAt: string; // ISO
  photos: SessionPhoto[];
}

/** A finalized submission saved to local history. */
export interface CompletedSubmission {
  submissionId: string;
  departmentCode: string;
  departmentName?: string;
  areaCode: string;
  areaName: string;
  checkItemCode?: string;
  checkItemName?: string;
  reporterName: string;
  reporterEmail: string;
  submissionType?: SubmissionType;
  startedAt: string; // ISO
  submittedAt: string; // ISO
  photoCount: number;
  photos: SessionPhoto[];
  status: UploadStatus;
}

/** Transient capture awaiting watermark + keep/retake decision on /preview. */
export interface PendingCapture {
  originalDataUrl: string;
  geo: GeoLocationSnapshot;
  capturedAt: string; // ISO
}

/**
 * SharePoint (Ban5S) domain records — Phase 2C.1 (design/foundation only).
 *
 * Field names match the SharePoint column **internal names** defined in
 * docs/sharepoint/BAN5S_SCHEMA.md. These are the shapes the Upload Engine
 * (Phase 2C.2) will read/write. Strict typing, no `any`.
 *
 * Site: https://biahalong.sharepoint.com/sites/Ban5S
 * Library "5S" with REAL folders: img / ListConfig / ListData.
 * Structured data lives in site-level Lists (Config_ and Data_ prefixed) grouped
 * logically to ListConfig/ListData (SharePoint cannot nest Lists inside folders).
 */

export type AppRole = "employee" | "environment" | "admin";
export type SubmissionStatus = "complete" | "partial" | "flagged";
export type SyncStatus = "queued" | "uploading" | "uploaded" | "failed";
export type SyncLogStatus = "queued" | "uploading" | "uploaded" | "failed" | "cancelled";

// ---- ListConfig ----

export interface DepartmentRecord {
  DepartmentCode: string; // also the list item Title
  DepartmentName: string;
  DepartmentManager: string | null;
  DepartmentEmail: string | null;
  IsActive: boolean;
  SortOrder: number;
}

export interface AreaRecord {
  AreaCode: string; // Title
  AreaName: string;
  DepartmentCode: string;
  IsActive: boolean;
  SortOrder: number;
}

export interface CheckItemRecord {
  CheckItemCode: string; // Title; business key
  CheckItemName: string;
  /** Blank = applies regardless of department. */
  DepartmentCode: string | null;
  /** Blank = applies to the whole department (or globally if DepartmentCode also blank). */
  AreaCode: string | null;
  SortOrder: number;
  IsActive: boolean;
  Description: string | null;
}

export interface UserAreaPermissionRecord {
  Email: string; // Title
  DisplayName: string | null;
  DepartmentCode: string | null;
  AreaCode: string;
  IsActive: boolean;
  CreatedAt: string | null; // ISO datetime
  UpdatedAt: string | null; // ISO datetime
}

export interface SettingRecord {
  Key: string; // Title
  Value: string;
  Description: string | null;
}

export interface RoleMappingRecord {
  Email: string; // Title
  Role: AppRole;
  DepartmentCode: string | null;
  IsActive: boolean;
}

// ---- ListData ----

export interface SubmissionRecord {
  SubmissionId: string; // Title; business key (e.g. SUB-20260617-0001)
  DepartmentCode: string;
  AreaCode: string;
  AreaName: string;
  ReporterName: string;
  ReporterEmail: string;
  PhotoCount: number;
  SubmissionDate: string; // ISO date (Asia/Ho_Chi_Minh day)
  SubmittedAt: string; // ISO datetime
  Latitude: number | null;
  Longitude: number | null;
  Address: string | null;
  Status: SubmissionStatus;
  SyncStatus: SyncStatus;
  /** "3s" = Thực hành 3S; ""/"daily" = báo cáo hàng ngày. */
  SubmissionType?: string;
}

export interface SubmissionPhotoRecord {
  PhotoId: string; // Title
  SubmissionId: string; // links to SubmissionRecord.SubmissionId
  SeqNo: number;
  OriginalPhotoUrl: string;
  WatermarkedPhotoUrl: string;
  CaptureTime: string; // ISO datetime
  Latitude: number | null;
  Longitude: number | null;
  Address: string | null;
  IsDeleted: boolean;
  DeletedAt: string | null;
  DeletedBy: string | null;
  DeleteReason: string | null;
  // --- Thực hành 3S ---
  STag: string | null;
  PhotoKind: string | null;
  ViolationNote: string | null;
  LinkedPhotoId: string | null;
}

export interface SyncLogRecord {
  QueueId: string; // Title
  SubmissionId: string;
  Status: SyncLogStatus;
  AttemptCount: number;
  Message: string | null;
  Timestamp: string; // ISO datetime
}

export interface UserProfileRecord {
  Email: string; // Title; key (lowercased compare)
  DisplayName: string | null;
  DepartmentRaw: string | null; // raw Graph department value last seen
  DepartmentCode: string | null; // resolved 5S code
  DepartmentName: string | null;
  JobTitle: string | null;
  OfficeLocation: string | null;
  LastDepartmentSync: string | null; // ISO datetime of last resolve
  LastLogin: string | null; // ISO datetime
  IsActive: boolean;
}

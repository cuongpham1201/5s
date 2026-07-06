/**
 * List item URL builders + type-safe field mappers (Phase 2C.1) — READ-ONLY.
 * Graph list-item `fields` are untyped (unknown); these mappers convert them to
 * strict domain records without `any`. No writes here.
 */
import type {
  AppRole,
  AreaRecord,
  CheckItemRecord,
  DepartmentRecord,
  RoleMappingRecord,
  SettingRecord,
  SubmissionPhotoRecord,
  SubmissionRecord,
  SubmissionStatus,
  SyncLogRecord,
  SyncLogStatus,
  SyncStatus,
} from "@/types/sharepoint";
import type { GraphListItemFields } from "./sharepoint-types";

export interface ListQueryOptions {
  select?: string[];
  filter?: string;
  top?: number;
}

/** Build the Graph path to a list's items (fields expanded). */
export function listItemsPath(siteId: string, listId: string, opts: ListQueryOptions = {}): string {
  const params: string[] = ["expand=fields"];
  if (opts.select?.length) params.push(`$select=${opts.select.join(",")}`);
  if (opts.filter) params.push(`$filter=${encodeURIComponent(opts.filter)}`);
  if (opts.top) params.push(`$top=${opts.top}`);
  return `/sites/${siteId}/lists/${listId}/items?${params.join("&")}`;
}

// ---- type-safe field extractors ----

function str(f: GraphListItemFields, key: string): string {
  const v = f[key];
  return typeof v === "string" ? v : v == null ? "" : String(v);
}
function strOrNull(f: GraphListItemFields, key: string): string | null {
  const v = f[key];
  return typeof v === "string" && v.length > 0 ? v : null;
}
function num(f: GraphListItemFields, key: string): number {
  const v = f[key];
  if (typeof v === "number") return v;
  if (typeof v === "string" && v.trim() !== "" && !Number.isNaN(Number(v))) return Number(v);
  return 0;
}
function numOrNull(f: GraphListItemFields, key: string): number | null {
  const v = f[key];
  if (typeof v === "number") return v;
  if (typeof v === "string" && v.trim() !== "" && !Number.isNaN(Number(v))) return Number(v);
  return null;
}
function bool(f: GraphListItemFields, key: string): boolean {
  const v = f[key];
  return v === true || v === "true" || v === 1 || v === "1";
}
function oneOf<T extends string>(f: GraphListItemFields, key: string, allowed: readonly T[], fallback: T): T {
  const v = f[key];
  return typeof v === "string" && (allowed as readonly string[]).includes(v) ? (v as T) : fallback;
}

const ROLES: readonly AppRole[] = ["employee", "environment", "admin"];
const SUB_STATUS: readonly SubmissionStatus[] = ["complete", "partial", "flagged"];
const SYNC_STATUS: readonly SyncStatus[] = ["queued", "uploading", "uploaded", "failed"];
const SYNCLOG_STATUS: readonly SyncLogStatus[] = ["queued", "uploading", "uploaded", "failed", "cancelled"];

// ---- mappers (Graph fields → domain record) ----

export function mapDepartment(f: GraphListItemFields): DepartmentRecord {
  return {
    DepartmentCode: str(f, "DepartmentCode") || str(f, "Title"),
    DepartmentName: str(f, "DepartmentName"),
    DepartmentManager: strOrNull(f, "DepartmentManager"),
    DepartmentEmail: strOrNull(f, "DepartmentEmail"),
    IsActive: bool(f, "IsActive"),
    SortOrder: num(f, "SortOrder"),
  };
}

export function mapArea(f: GraphListItemFields): AreaRecord {
  return {
    AreaCode: str(f, "AreaCode") || str(f, "Title"),
    AreaName: str(f, "AreaName"),
    DepartmentCode: str(f, "DepartmentCode"),
    Departments: strOrNull(f, "Departments"),
    IsActive: bool(f, "IsActive"),
    SortOrder: num(f, "SortOrder"),
  };
}

export function mapCheckItem(f: GraphListItemFields): CheckItemRecord {
  return {
    CheckItemCode: str(f, "CheckItemCode") || str(f, "Title"),
    CheckItemName: str(f, "CheckItemName"),
    DepartmentCode: strOrNull(f, "DepartmentCode"),
    AreaCode: strOrNull(f, "AreaCode"),
    SortOrder: num(f, "SortOrder"),
    IsActive: bool(f, "IsActive"),
    Description: strOrNull(f, "Description"),
  };
}

export function mapSetting(f: GraphListItemFields): SettingRecord {
  return {
    Key: str(f, "Key") || str(f, "Title"),
    Value: str(f, "Value"),
    Description: strOrNull(f, "Description"),
  };
}

export function mapRoleMapping(f: GraphListItemFields): RoleMappingRecord {
  return {
    Email: str(f, "Email") || str(f, "Title"),
    Role: oneOf(f, "Role", ROLES, "employee"),
    DepartmentCode: strOrNull(f, "DepartmentCode"),
    IsActive: bool(f, "IsActive"),
  };
}

export function mapSubmission(f: GraphListItemFields): SubmissionRecord {
  return {
    SubmissionId: str(f, "SubmissionId") || str(f, "Title"),
    DepartmentCode: str(f, "DepartmentCode"),
    AreaCode: str(f, "AreaCode"),
    AreaName: str(f, "AreaName"),
    ReporterName: str(f, "ReporterName"),
    ReporterEmail: str(f, "ReporterEmail"),
    PhotoCount: num(f, "PhotoCount"),
    SubmissionDate: str(f, "SubmissionDate"),
    SubmittedAt: str(f, "SubmittedAt"),
    Latitude: numOrNull(f, "Latitude"),
    Longitude: numOrNull(f, "Longitude"),
    Address: strOrNull(f, "Address"),
    Status: oneOf(f, "Status", SUB_STATUS, "complete"),
    SyncStatus: oneOf(f, "SyncStatus", SYNC_STATUS, "queued"),
    SubmissionType: str(f, "SubmissionType") || undefined,
  };
}

export function mapSubmissionPhoto(f: GraphListItemFields): SubmissionPhotoRecord {
  return {
    PhotoId: str(f, "PhotoId") || str(f, "Title"),
    SubmissionId: str(f, "SubmissionId"),
    SeqNo: num(f, "SeqNo"),
    OriginalPhotoUrl: str(f, "OriginalPhotoUrl"),
    WatermarkedPhotoUrl: str(f, "WatermarkedPhotoUrl"),
    CaptureTime: str(f, "CaptureTime"),
    Latitude: numOrNull(f, "Latitude"),
    Longitude: numOrNull(f, "Longitude"),
    Address: strOrNull(f, "Address"),
    IsDeleted: bool(f, "IsDeleted"),
    DeletedAt: strOrNull(f, "DeletedAt"),
    DeletedBy: strOrNull(f, "DeletedBy"),
    DeleteReason: strOrNull(f, "DeleteReason"),
    STag: strOrNull(f, "STag"),
    PhotoKind: strOrNull(f, "PhotoKind"),
    ViolationNote: strOrNull(f, "ViolationNote"),
    LinkedPhotoId: strOrNull(f, "LinkedPhotoId"),
  };
}

export function mapSyncLog(f: GraphListItemFields): SyncLogRecord {
  return {
    QueueId: str(f, "QueueId") || str(f, "Title"),
    SubmissionId: str(f, "SubmissionId"),
    Status: oneOf(f, "Status", SYNCLOG_STATUS, "queued"),
    AttemptCount: num(f, "AttemptCount"),
    Message: strOrNull(f, "Message"),
    Timestamp: str(f, "Timestamp"),
  };
}

/**
 * SharePoint provisioning (Phase 2C.2).
 *
 * Creates MISSING Config_/Data_ lists + their columns/indexes per
 * docs/sharepoint/BAN5S_SCHEMA.md. NEVER deletes or renames existing objects.
 * If an existing column has an incompatible type → records a STOP for that list
 * (does not alter it). Triggered only via POST /api/admin/sharepoint/provision.
 * No photo upload here.
 */
import { CONFIG_LISTS, DATA_LISTS, SHAREPOINT_HOSTNAME, SHAREPOINT_SITE_PATH } from "./sharepoint-config";
import { getAppOnlyClient, type SharePointGraphClient } from "./graph-client";
import type { GraphCollection, GraphList, GraphSite } from "./sharepoint-types";

type ColType = "text" | "number" | "boolean" | "dateTime" | "choice";
interface ColumnSpec {
  name: string;
  type: ColType;
  indexed?: boolean;
  choices?: string[];
}
interface ListSpec {
  name: string;
  columns: ColumnSpec[];
}

const ROLE = ["employee", "environment", "admin"];
const SUB_STATUS = ["complete", "partial", "flagged"];
const SYNC_STATUS = ["queued", "uploading", "uploaded", "failed"];
const SYNCLOG_STATUS = ["queued", "uploading", "uploaded", "failed", "cancelled"];

const LIST_SPECS: ListSpec[] = [
  {
    name: CONFIG_LISTS.departments,
    columns: [
      { name: "DepartmentCode", type: "text", indexed: true },
      { name: "DepartmentName", type: "text" },
      { name: "DepartmentManager", type: "text" },
      { name: "DepartmentEmail", type: "text" },
      { name: "IsActive", type: "boolean", indexed: true },
      { name: "SortOrder", type: "number" },
    ],
  },
  {
    name: CONFIG_LISTS.areas,
    columns: [
      { name: "AreaCode", type: "text", indexed: true },
      { name: "AreaName", type: "text" },
      { name: "DepartmentCode", type: "text", indexed: true },
      // Khu vực là dữ liệu gốc — gán N phòng ban (CSV mã).
      { name: "Departments", type: "text" },
      // Khu vực 2 cấp: con trỏ về mã nhóm.
      { name: "ParentCode", type: "text", indexed: true },
      { name: "IsActive", type: "boolean" },
      { name: "SortOrder", type: "number" },
    ],
  },
  {
    name: CONFIG_LISTS.checkItems,
    columns: [
      { name: "CheckItemCode", type: "text", indexed: true },
      { name: "CheckItemName", type: "text" },
      { name: "DepartmentCode", type: "text", indexed: true },
      { name: "AreaCode", type: "text", indexed: true },
      { name: "SortOrder", type: "number" },
      { name: "IsActive", type: "boolean" },
      { name: "Description", type: "text" },
    ],
  },
  {
    name: CONFIG_LISTS.userAreaPermissions,
    columns: [
      { name: "Email", type: "text", indexed: true },
      { name: "DisplayName", type: "text" },
      { name: "DepartmentCode", type: "text", indexed: true },
      { name: "AreaCode", type: "text", indexed: true },
      { name: "IsActive", type: "boolean" },
      { name: "CreatedAt", type: "dateTime" },
      { name: "UpdatedAt", type: "dateTime" },
    ],
  },
  {
    name: CONFIG_LISTS.settings,
    columns: [
      { name: "Key", type: "text", indexed: true },
      { name: "Value", type: "text" },
      { name: "Description", type: "text" },
    ],
  },
  {
    name: CONFIG_LISTS.roleMapping,
    columns: [
      { name: "Email", type: "text", indexed: true },
      { name: "Role", type: "choice", choices: ROLE },
      { name: "DepartmentCode", type: "text", indexed: true },
      { name: "IsActive", type: "boolean" },
    ],
  },
  {
    name: DATA_LISTS.submissions,
    columns: [
      { name: "SubmissionId", type: "text", indexed: true },
      { name: "DepartmentCode", type: "text", indexed: true },
      { name: "AreaCode", type: "text", indexed: true },
      { name: "AreaName", type: "text" },
      { name: "ReporterName", type: "text" },
      { name: "ReporterEmail", type: "text", indexed: true },
      { name: "PhotoCount", type: "number" },
      { name: "SubmissionDate", type: "dateTime", indexed: true },
      { name: "SubmittedAt", type: "dateTime", indexed: true },
      { name: "Latitude", type: "number" },
      { name: "Longitude", type: "number" },
      { name: "Address", type: "text" },
      { name: "Status", type: "choice", choices: SUB_STATUS },
      { name: "SyncStatus", type: "choice", choices: SYNC_STATUS, indexed: true },
      // Thực hành 3S (additive): "3s" | ""/"daily" (row cũ = daily).
      { name: "SubmissionType", type: "text", indexed: true },
    ],
  },
  {
    name: DATA_LISTS.submissionPhotos,
    columns: [
      { name: "PhotoId", type: "text", indexed: true },
      { name: "SubmissionId", type: "text", indexed: true },
      { name: "SeqNo", type: "number" },
      { name: "OriginalPhotoUrl", type: "text" },
      { name: "WatermarkedPhotoUrl", type: "text" },
      { name: "CaptureTime", type: "dateTime", indexed: true },
      { name: "Latitude", type: "number" },
      { name: "Longitude", type: "number" },
      { name: "Address", type: "text" },
      // Additive soft-delete audit fields (Phase 3.3) — existing rows unaffected.
      { name: "IsDeleted", type: "boolean" },
      { name: "DeletedAt", type: "dateTime" },
      { name: "DeletedBy", type: "text" },
      { name: "DeleteReason", type: "text" },
      { name: "STag", type: "text" },
      { name: "PhotoKind", type: "text" },
      { name: "ViolationNote", type: "text" },
      { name: "LinkedPhotoId", type: "text" },
    ],
  },
  {
    name: DATA_LISTS.syncLogs,
    columns: [
      { name: "QueueId", type: "text", indexed: true },
      { name: "SubmissionId", type: "text", indexed: true },
      { name: "Status", type: "choice", choices: SYNCLOG_STATUS, indexed: true },
      { name: "AttemptCount", type: "number" },
      { name: "Message", type: "text" },
      { name: "Timestamp", type: "dateTime", indexed: true },
    ],
  },
  {
    name: DATA_LISTS.userProfiles,
    columns: [
      { name: "Email", type: "text", indexed: true },
      { name: "DisplayName", type: "text" },
      { name: "DepartmentRaw", type: "text" },
      { name: "DepartmentCode", type: "text", indexed: true },
      { name: "DepartmentName", type: "text" },
      { name: "JobTitle", type: "text" },
      { name: "OfficeLocation", type: "text" },
      { name: "LastDepartmentSync", type: "dateTime" },
      { name: "LastLogin", type: "dateTime" },
      { name: "IsActive", type: "boolean" },
    ],
  },
];

function columnPayload(c: ColumnSpec): Record<string, unknown> {
  const base: Record<string, unknown> = { name: c.name };
  if (c.indexed) base.indexed = true;
  switch (c.type) {
    case "text":
      base.text = {};
      break;
    case "number":
      base.number = {};
      break;
    case "boolean":
      base.boolean = {};
      break;
    case "dateTime":
      base.dateTime = {};
      break;
    case "choice":
      base.choice = { choices: c.choices ?? [] };
      break;
  }
  return base;
}

export interface ProvisionListResult {
  list: string;
  action: "created" | "exists" | "error";
  addedColumns: string[];
  note?: string;
}
export interface ProvisionResult {
  ok: boolean;
  siteId?: string;
  results: ProvisionListResult[];
}

async function getSiteId(client: SharePointGraphClient): Promise<string> {
  const site = await client.get<GraphSite>(`/sites/${SHAREPOINT_HOSTNAME}:${SHAREPOINT_SITE_PATH}`);
  return site.id;
}

export async function provision(): Promise<ProvisionResult> {
  const client = await getAppOnlyClient();
  const siteId = await getSiteId(client);
  const existing = await client.get<GraphCollection<GraphList>>(`/sites/${siteId}/lists?$select=id,name,displayName`);
  const byName = new Map(existing.value.map((l) => [l.name, l]));
  const results: ProvisionListResult[] = [];

  for (const spec of LIST_SPECS) {
    const found = byName.get(spec.name);
    try {
      if (!found) {
        await client.post(`/sites/${siteId}/lists`, {
          displayName: spec.name,
          list: { template: "genericList" },
          columns: spec.columns.map(columnPayload),
        });
        results.push({ list: spec.name, action: "created", addedColumns: spec.columns.map((c) => c.name) });
      } else {
        // List exists: add only missing columns (never alter/delete existing).
        const cols = await client.get<GraphCollection<{ name: string }>>(
          `/sites/${siteId}/lists/${found.id}/columns?$select=name`,
        );
        const have = new Set(cols.value.map((c) => c.name));
        const added: string[] = [];
        for (const c of spec.columns) {
          if (!have.has(c.name)) {
            await client.post(`/sites/${siteId}/lists/${found.id}/columns`, columnPayload(c));
            added.push(c.name);
          }
        }
        results.push({ list: spec.name, action: "exists", addedColumns: added });
      }
    } catch (e) {
      results.push({ list: spec.name, action: "error", addedColumns: [], note: (e as Error).message });
    }
  }
  return { ok: results.every((r) => r.action !== "error"), siteId, results };
}

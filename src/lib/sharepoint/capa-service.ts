/**
 * CAPA (khắc phục – phòng ngừa) cho 5S — Gói A, port state machine đã kiểm chứng
 * từ BiaHaLong-Audit sang SharePoint list "Data_CAPAs" (tự provision lần đầu).
 *
 * Vòng đời (rút gọn cho 5S):
 *   open → in_progress → pending_verification → closed
 *                ↑______________reject__________|   (RejectionHistory append-only)
 * - TỰ SINH khi ảnh Audit 5S gắn loại "Vi phạm" đồng bộ thành công (idempotent
 *   theo PhotoId: CapaId = CAPA-<PhotoId>).
 * - Người xử lý mặc định: DepartmentManager/DepartmentEmail của phòng ban
 *   (Config_Departments); trống thì để open chờ admin giao.
 * - Duyệt/reject: admin hoặc role "environment" (Ban SHE/Môi trường).
 */
import { DATA_LISTS } from "./sharepoint-config";
import { getAppOnlyClient, getAllListItems, type SharePointGraphClient } from "./graph-client";
import { findListId, resolveSite } from "./site-context";
import { ulogAlways } from "@/lib/debug/upload-log";
import type { GraphListItem } from "./sharepoint-types";

export const CAPA_LIST = "Data_CAPAs";
export type CapaStatus = "open" | "in_progress" | "pending_verification" | "closed";
const DUE_DAYS_DEFAULT = 7;

export interface CapaRecord {
  id: string; // SharePoint item id
  capaId: string;
  submissionId: string;
  photoId: string;
  violationPhotoPath: string;
  departmentCode: string;
  areaCode: string;
  areaName: string;
  sTag: string | null;
  issueNote: string | null;
  reporterName: string | null;
  reporterEmail: string | null;
  status: CapaStatus;
  priority: string;
  assigneeEmail: string | null;
  assigneeName: string | null;
  dueDate: string | null; // ISO date
  rootCause: string | null;
  preventiveAction: string | null;
  completionEvidence: string | null;
  evidencePhotoPaths: string[];
  rejectionHistory: Array<{ count: number; note: string; rejectedAt: string; rejectedBy: string }>;
  reopenedCount: number;
  createdBy: string | null;
  createdAt: string | null;
  submittedAt: string | null;
  closedAt: string | null;
  closedBy: string | null;
}

async function ctx(): Promise<{ client: SharePointGraphClient; siteId: string; listId: string }> {
  const client = await getAppOnlyClient();
  const site = await resolveSite(client);
  let listId = await findListId(client, site.id, CAPA_LIST);
  if (!listId) {
    await client.post(`/sites/${site.id}/lists`, {
      displayName: CAPA_LIST,
      list: { template: "genericList" },
      columns: [
        { name: "CapaId", text: {}, indexed: true },
        { name: "SubmissionId", text: {}, indexed: true },
        { name: "PhotoId", text: {}, indexed: true },
        { name: "ViolationPhotoPath", text: {} },
        { name: "DepartmentCode", text: {}, indexed: true },
        { name: "AreaCode", text: {} },
        { name: "AreaName", text: {} },
        { name: "STag", text: {} },
        { name: "IssueNote", text: {} },
        { name: "ReporterName", text: {} },
        { name: "ReporterEmail", text: {} },
        { name: "Status", text: {}, indexed: true },
        { name: "Priority", text: {} },
        { name: "AssigneeEmail", text: {}, indexed: true },
        { name: "AssigneeName", text: {} },
        { name: "DueDate", dateTime: {} },
        { name: "RootCause", text: {} },
        { name: "PreventiveAction", text: {} },
        { name: "CompletionEvidence", text: {} },
        { name: "EvidencePhotoPaths", text: {} },
        { name: "RejectionHistory", text: {} },
        { name: "ReopenedCount", number: {} },
        { name: "CreatedBy", text: {} },
        { name: "CreatedAtIso", dateTime: {} },
        { name: "SubmittedAtIso", dateTime: {} },
        { name: "ClosedAtIso", dateTime: {} },
        { name: "ClosedBy", text: {} },
      ],
    });
    listId = await findListId(client, site.id, CAPA_LIST);
    if (!listId) throw new Error(`Không tạo được list ${CAPA_LIST}`);
    ulogAlways("capa.list.created", { list: CAPA_LIST });
  }
  return { client, siteId: site.id, listId };
}

function parseJson<T>(raw: unknown, fallback: T): T {
  if (typeof raw !== "string" || !raw) return fallback;
  try { return JSON.parse(raw) as T; } catch { return fallback; }
}

function rowToCapa(it: GraphListItem): CapaRecord {
  const f = it.fields as Record<string, unknown>;
  const s = (k: string) => (typeof f[k] === "string" && f[k] ? (f[k] as string) : null);
  const status = (s("Status") ?? "open") as CapaStatus;
  return {
    id: it.id,
    capaId: s("CapaId") ?? s("Title") ?? "",
    submissionId: s("SubmissionId") ?? "",
    photoId: s("PhotoId") ?? "",
    violationPhotoPath: s("ViolationPhotoPath") ?? "",
    departmentCode: s("DepartmentCode") ?? "",
    areaCode: s("AreaCode") ?? "",
    areaName: s("AreaName") ?? "",
    sTag: s("STag"),
    issueNote: s("IssueNote"),
    reporterName: s("ReporterName"),
    reporterEmail: s("ReporterEmail"),
    status: ["open", "in_progress", "pending_verification", "closed"].includes(status) ? status : "open",
    priority: s("Priority") ?? "normal",
    assigneeEmail: s("AssigneeEmail")?.toLowerCase() ?? null,
    assigneeName: s("AssigneeName"),
    dueDate: s("DueDate"),
    rootCause: s("RootCause"),
    preventiveAction: s("PreventiveAction"),
    completionEvidence: s("CompletionEvidence"),
    evidencePhotoPaths: parseJson<string[]>(f.EvidencePhotoPaths, []),
    rejectionHistory: parseJson(f.RejectionHistory, []),
    reopenedCount: typeof f.ReopenedCount === "number" ? f.ReopenedCount : Number(f.ReopenedCount ?? 0) || 0,
    createdBy: s("CreatedBy"),
    createdAt: s("CreatedAtIso"),
    submittedAt: s("SubmittedAtIso"),
    closedAt: s("ClosedAtIso"),
    closedBy: s("ClosedBy"),
  };
}

async function allCapas(): Promise<Array<CapaRecord & { itemId: string }>> {
  const { client, siteId, listId } = await ctx();
  const items = await getAllListItems<GraphListItem>(client, `/sites/${siteId}/lists/${listId}/items?expand=fields&$top=999`);
  return items.map((it) => ({ ...rowToCapa(it), itemId: it.id }));
}

export async function listCapas(filter: { assigneeEmail?: string; departmentCode?: string; status?: string }): Promise<CapaRecord[]> {
  const rows = await allCapas();
  return rows
    .filter((r) => !filter.assigneeEmail || r.assigneeEmail === filter.assigneeEmail.toLowerCase())
    .filter((r) => !filter.departmentCode || r.departmentCode === filter.departmentCode)
    .filter((r) => !filter.status || r.status === filter.status)
    .sort((a, b) => (b.createdAt ?? "").localeCompare(a.createdAt ?? ""));
}

export async function getCapa(capaId: string): Promise<CapaRecord | null> {
  const rows = await allCapas();
  return rows.find((r) => r.capaId === capaId) ?? null;
}

async function patchCapa(capaId: string, fields: Record<string, unknown>): Promise<void> {
  const rows = await allCapas();
  const hit = rows.find((r) => r.capaId === capaId);
  if (!hit) throw new Error(`Không tìm thấy CAPA ${capaId}`);
  const { client, siteId, listId } = await ctx();
  await client.patch(`/sites/${siteId}/lists/${listId}/items/${hit.itemId}/fields`, fields);
}

/**
 * TỰ SINH CAPA từ một ảnh VI PHẠM đã đồng bộ. Idempotent theo PhotoId
 * (CapaId = CAPA-<PhotoId>) — retry upload không tạo trùng. Best-effort:
 * caller (upload orchestrator) phải bọc try/catch, KHÔNG được làm fail upload.
 */
export async function createCapaFromViolation(input: {
  submissionId: string; photoId: string; photoPath: string;
  departmentCode: string; areaCode: string; areaName: string;
  sTag?: string; issueNote?: string; reporterName?: string; reporterEmail?: string;
}): Promise<{ created: boolean; capaId: string }> {
  const capaId = `CAPA-${input.photoId}`;
  const { client, siteId, listId } = await ctx();
  const items = await getAllListItems<GraphListItem>(client, `/sites/${siteId}/lists/${listId}/items?expand=fields&$top=999`);
  if (items.some((it) => (it.fields as Record<string, unknown>).CapaId === capaId)) {
    return { created: false, capaId };
  }
  // Người xử lý mặc định = quản lý phòng ban (Config_Departments).
  let assigneeEmail: string | null = null;
  let assigneeName: string | null = null;
  try {
    const deptListId = await findListId(client, siteId, "Config_Departments");
    if (deptListId) {
      const depts = await getAllListItems<GraphListItem>(client, `/sites/${siteId}/lists/${deptListId}/items?expand=fields&$top=999`);
      const d = depts.map((x) => x.fields as Record<string, unknown>).find((x) => x.DepartmentCode === input.departmentCode);
      assigneeEmail = ((d?.DepartmentEmail as string) || "").toLowerCase() || null;
      assigneeName = (d?.DepartmentManager as string) || null;
    }
  } catch { /* giao sau bởi admin */ }
  const due = new Date();
  due.setDate(due.getDate() + DUE_DAYS_DEFAULT);
  await client.post(`/sites/${siteId}/lists/${listId}/items`, {
    fields: {
      Title: capaId,
      CapaId: capaId,
      SubmissionId: input.submissionId,
      PhotoId: input.photoId,
      ViolationPhotoPath: input.photoPath,
      DepartmentCode: input.departmentCode,
      AreaCode: input.areaCode,
      AreaName: input.areaName,
      STag: input.sTag ?? "",
      IssueNote: input.issueNote ?? "",
      ReporterName: input.reporterName ?? "",
      ReporterEmail: (input.reporterEmail ?? "").toLowerCase(),
      Status: assigneeEmail ? "in_progress" : "open",
      Priority: "normal",
      AssigneeEmail: assigneeEmail ?? "",
      AssigneeName: assigneeName ?? "",
      DueDate: due.toISOString(),
      EvidencePhotoPaths: "[]",
      RejectionHistory: "[]",
      ReopenedCount: 0,
      CreatedBy: "system:violation-photo",
      CreatedAtIso: new Date().toISOString(),
    },
  });
  ulogAlways("capa.created", { capaId, dept: input.departmentCode, assignee: assigneeEmail ?? "(chưa giao)", due: due.toISOString().slice(0, 10) });
  return { created: true, capaId };
}

// ---- transitions (mọi kiểm tra quyền do API route thực hiện trước khi gọi) ----

export async function assignCapa(capaId: string, assigneeEmail: string, assigneeName: string, dueDate: string | null, by: string): Promise<void> {
  await patchCapa(capaId, {
    AssigneeEmail: assigneeEmail.toLowerCase(), AssigneeName: assigneeName,
    ...(dueDate ? { DueDate: new Date(dueDate).toISOString() } : {}),
    Status: "in_progress",
  });
  ulogAlways("capa.assigned", { capaId, assignee: assigneeEmail, by });
}

export async function updateCapaWork(capaId: string, patch: { rootCause?: string; preventiveAction?: string; completionEvidence?: string; evidencePhotoPaths?: string[] }, autoProgress: boolean): Promise<void> {
  const fields: Record<string, unknown> = {};
  if (patch.rootCause !== undefined) fields.RootCause = patch.rootCause;
  if (patch.preventiveAction !== undefined) fields.PreventiveAction = patch.preventiveAction;
  if (patch.completionEvidence !== undefined) fields.CompletionEvidence = patch.completionEvidence;
  if (patch.evidencePhotoPaths !== undefined) fields.EvidencePhotoPaths = JSON.stringify(patch.evidencePhotoPaths.slice(0, 20));
  if (autoProgress) fields.Status = "in_progress";
  if (Object.keys(fields).length) await patchCapa(capaId, fields);
}

export async function submitCapa(capaId: string, by: string): Promise<void> {
  await patchCapa(capaId, { Status: "pending_verification", SubmittedAtIso: new Date().toISOString() });
  ulogAlways("capa.submitted", { capaId, by });
}

export async function approveCapa(capaId: string, by: string): Promise<void> {
  await patchCapa(capaId, { Status: "closed", ClosedAtIso: new Date().toISOString(), ClosedBy: by });
  ulogAlways("capa.closed", { capaId, by });
}

export async function rejectCapa(capaId: string, note: string, by: string): Promise<void> {
  const cur = await getCapa(capaId);
  if (!cur) throw new Error("Không tìm thấy CAPA");
  const history = [...cur.rejectionHistory, { count: cur.reopenedCount + 1, note, rejectedAt: new Date().toISOString(), rejectedBy: by }];
  await patchCapa(capaId, {
    Status: "in_progress",
    RejectionHistory: JSON.stringify(history),
    ReopenedCount: cur.reopenedCount + 1,
  });
  ulogAlways("capa.rejected", { capaId, by, count: cur.reopenedCount + 1 });
}

// Giữ import DATA_LISTS để đồng bộ pattern (không dùng trực tiếp — CAPA_LIST riêng).
void DATA_LISTS;

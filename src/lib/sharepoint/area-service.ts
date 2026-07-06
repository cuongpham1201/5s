/**
 * Area service (Config_Areas) — app-only Graph.
 * READ for user-facing pages; admin WRITE (create/update/soft-delete/upsert)
 * triggered only via protected admin endpoints. Soft delete = IsActive=false;
 * never hard-deletes a row.
 */
import { CONFIG_LISTS } from "./sharepoint-config";
import { getAppOnlyClient, type SharePointGraphClient , getAllListItems } from "./graph-client";
import { findListId, resolveSite } from "./site-context";
import { mapArea } from "./list-helpers";
import { listActiveDepartments } from "./department-service";
import { normalizeText } from "./org-codes";
import type { GraphCollection, GraphListItem } from "./sharepoint-types";
import type { AreaRecord } from "@/types/sharepoint";

export interface AreaOption {
  code: string;
  name: string;
  /** Legacy owner (mô hình cũ). */
  departmentCode: string;
  /** Mô hình mới: TẤT CẢ phòng ban được gán khu vực này. */
  departments: string[];
  /** Khu vực CON: mã nhóm cha; null = nhóm/độc lập. */
  parentCode: string | null;
  /** Con có Departments RIÊNG (không kế thừa nhóm). */
  hasOwnDepartments?: boolean;
  sortOrder: number;
}

/** Phòng ban hiệu lực của một khu vực: CSV Departments; trống → [DepartmentCode]. */
function effectiveDepts(rec: AreaRecord): string[] {
  const csv = (rec.Departments ?? "").split(",").map((x) => x.trim()).filter(Boolean);
  if (csv.length > 0) return [...new Set(csv)];
  return rec.DepartmentCode ? [rec.DepartmentCode] : [];
}

/** Admin view row (includes id + IsActive). */
export interface AreaAdminRow extends AreaOption {
  id: string;
  isActive: boolean;
}

export interface AreaInput {
  code: string;
  name: string;
  departmentCode: string;
  /** Danh sách mã phòng ban được gán (ghi vào cột Departments dạng CSV). */
  departments?: string[];
  /** Mã nhóm cha (khu vực con). */
  parentCode?: string | null;
  sortOrder?: number;
  isActive?: boolean;
}

async function ctx(): Promise<{ client: SharePointGraphClient; siteId: string; listId: string | null }> {
  const client = await getAppOnlyClient();
  const site = await resolveSite(client);
  const listId = await findListId(client, site.id, CONFIG_LISTS.areas);
  return { client, siteId: site.id, listId };
}

async function readAreaItems(
  client: SharePointGraphClient,
  siteId: string,
  listId: string,
): Promise<GraphListItem[]> {
  return getAllListItems<GraphListItem>(
    client,
    `/sites/${siteId}/lists/${listId}/items?expand=fields&$top=999`,
  ); // paginated
}

async function readAreas(): Promise<AreaRecord[]> {
  const { client, siteId, listId } = await ctx();
  if (!listId) return [];
  const items = await readAreaItems(client, siteId, listId);
  return items.map((it) => mapArea(it.fields));
}

// ---- READ (user-facing) ----

export async function listActiveAreas(): Promise<AreaOption[]> {
  const areas = await readAreas();
  const byCode = new Map(areas.map((a) => [a.AreaCode, a]));
  return areas
    .filter((a) => a.AreaCode && a.IsActive)
    .map((a) => {
      const own = (a.Departments ?? "").trim().length > 0;
      // Khu vực CON không gán riêng → KẾ THỪA phòng ban của nhóm cha.
      const parent = a.ParentCode ? byCode.get(a.ParentCode) : undefined;
      const departments = own || !parent ? effectiveDepts(a) : effectiveDepts(parent);
      return {
        code: a.AreaCode, name: a.AreaName, departmentCode: a.DepartmentCode,
        departments, parentCode: a.ParentCode ?? null, hasOwnDepartments: own,
        sortOrder: a.SortOrder,
      };
    })
    .sort((x, y) => x.sortOrder - y.sortOrder || x.name.localeCompare(y.name, "vi"));
}

export async function listAreasByDepartmentCode(
  departmentCode: string,
  includeInactive = false,
): Promise<AreaOption[]> {
  // Khu vực áp dụng cho phòng X = Departments (kế thừa nhóm với khu con) chứa X.
  const all = await listActiveAreas();
  const mine = all.filter((a) => a.departments.includes(departmentCode));
  if (!includeInactive) return mine.sort((x, y) => x.sortOrder - y.sortOrder);
  return mine; // admin path dùng listAllAreasAdmin cho inactive
}

/** Map of DepartmentCode -> count of ACTIVE areas (for the admin selector). */
export async function countAreasByDepartment(): Promise<Record<string, number>> {
  const areas = await readAreas();
  const counts: Record<string, number> = {};
  for (const a of areas) {
    if (!a.AreaCode || !a.IsActive) continue;
    for (const d of effectiveDepts(a)) counts[d] = (counts[d] ?? 0) + 1;
  }
  return counts;
}

export async function getAreaByCode(code: string): Promise<AreaOption | null> {
  const all = await listActiveAreas();
  return all.find((a) => a.code === code) ?? null;
}

/**
 * Generate an AreaCode from a department + area name:
 *   <DepartmentCode>_<NORMALIZED_NAME>  e.g. TCKS_VAN_PHONG, TCKS_KHO_HO_SO
 * Accent-insensitive, uppercased, non-alphanumeric collapsed to single "_".
 */
export function generateAreaCode(departmentCode: string, areaName: string): string {
  const slug = normalizeText(areaName)
    .toUpperCase()
    .replace(/[^A-Z0-9]+/g, "_")
    .replace(/^_+|_+$/g, "");
  return `${departmentCode}_${slug || "KHU_VUC"}`;
}

/**
 * Create an area for a department from a user-supplied name (idempotent).
 * Generates the AreaCode server-side and upserts (restores if previously hidden).
 * Returns the resulting area option.
 */
export async function createAreaForDepartment(
  departmentCode: string,
  areaName: string,
  sortOrder?: number,
): Promise<{ action: "created" | "updated" | "restored"; area: AreaOption }> {
  const code = generateAreaCode(departmentCode, areaName);
  const res = await upsertAreaByCode({
    code,
    name: areaName.trim(),
    departmentCode,
    departments: [departmentCode],
    sortOrder: sortOrder ?? 0,
    isActive: true,
  });
  return {
    action: res.action,
    area: { code, name: areaName.trim(), departmentCode, departments: [departmentCode], parentCode: null, sortOrder: sortOrder ?? 0 },
  };
}

/** Mã khu vực GỐC (không gắn phòng ban): KV_<slug tên>. */
export function generateMasterAreaCode(areaName: string): string {
  const slug = normalizeText(areaName)
    .toUpperCase()
    .replace(/[^A-Z0-9]+/g, "_")
    .replace(/^_+|_+$/g, "");
  return `KV_${slug || "KHU_VUC"}`;
}

/** Tạo khu vực GỐC gán N phòng ban (idempotent theo mã; khôi phục nếu bị ẩn). */
export async function createMasterArea(
  areaName: string,
  departments: string[],
): Promise<{ action: "created" | "updated" | "restored"; code: string }> {
  const code = generateMasterAreaCode(areaName);
  return upsertAreaByCode({
    code,
    name: areaName.trim(),
    departmentCode: departments[0] ?? "",
    departments,
    sortOrder: 0,
    isActive: true,
  });
}

/** Chuẩn hóa tên để gộp: bỏ dấu, thường hóa, gọn khoảng trắng. */
function normName(s: string): string {
  return normalizeText(s).toLowerCase().replace(/\s+/g, " ").trim();
}

export interface NormalizeResult {
  groups: Array<{ name: string; master: string; departments: string[]; hidden: string[] }>;
}

/**
 * GỘP các khu vực ACTIVE trùng tên (chuẩn hóa):
 *  - mỗi nhóm ≥2 khu vực cùng tên → upsert 1 khu vực GỐC KV_<slug> với
 *    Departments = HỢP các phòng ban của cả nhóm
 *  - ẨN (IsActive=false) các bản trùng còn lại — KHÔNG xóa, ảnh cũ giữ nguyên
 *    (báo cáo theo khu vực gộp theo TÊN nên lịch sử tự về chung một dòng).
 * Idempotent: chạy lại không đổi gì thêm.
 */
export async function normalizeDuplicateAreas(): Promise<NormalizeResult> {
  const { client, siteId, listId } = await ctx();
  if (!listId) throw new Error("Chưa có list Config_Areas.");
  const items = await readAreaItems(client, siteId, listId);
  const rows = items
    .map((it) => ({ id: it.id, rec: mapArea(it.fields) }))
    .filter((x) => x.rec.AreaCode && x.rec.IsActive);
  const groups = new Map<string, typeof rows>();
  for (const r of rows) {
    const k = normName(r.rec.AreaName);
    if (!k) continue;
    const g = groups.get(k) ?? [];
    g.push(r);
    groups.set(k, g);
  }
  const out: NormalizeResult["groups"] = [];
  for (const members of groups.values()) {
    if (members.length < 2) continue;
    const displayName = members[0].rec.AreaName.trim();
    const masterCode = generateMasterAreaCode(displayName);
    const deptUnion = new Set<string>();
    for (const m of members) for (const d of effectiveDepts(m.rec)) deptUnion.add(d);
    await upsertAreaByCode({
      code: masterCode,
      name: displayName,
      departmentCode: [...deptUnion][0] ?? "",
      departments: [...deptUnion],
      sortOrder: 0,
      isActive: true,
    });
    const hidden: string[] = [];
    for (const m of members) {
      if (m.rec.AreaCode === masterCode) continue;
      await client.patch(`/sites/${siteId}/lists/${listId}/items/${m.id}/fields`, { IsActive: false });
      hidden.push(m.rec.AreaCode);
    }
    out.push({ name: displayName, master: masterCode, departments: [...deptUnion], hidden });
  }
  return { groups: out };
}

/** Tạo khu vực CON trong một nhóm (mã <parent>_<slug>, idempotent). */
export async function createChildArea(
  parentCode: string,
  childName: string,
): Promise<{ action: "created" | "updated" | "restored"; code: string }> {
  const slug = normalizeText(childName).toUpperCase().replace(/[^A-Z0-9]+/g, "_").replace(/^_+|_+$/g, "");
  const code = `${parentCode}_${slug || "KHU_CON"}`;
  return upsertAreaByCode({
    code,
    name: childName.trim(),
    departmentCode: "",
    departments: [], // trống = KẾ THỪA phòng ban của nhóm
    parentCode,
    sortOrder: 0,
    isActive: true,
  });
}

/** Map mã khu vực → TÊN NHÓM (con → tên cha; nhóm/độc lập → tên chính nó).
 *  Gồm cả khu vực đã ẩn để ảnh lịch sử vẫn quy đúng nhóm. */
export async function areaGroupNameMap(): Promise<Map<string, string>> {
  const areas = await readAreas();
  const byCode = new Map(areas.map((a) => [a.AreaCode, a]));
  const out = new Map<string, string>();
  for (const a of areas) {
    if (!a.AreaCode) continue;
    const parent = a.ParentCode ? byCode.get(a.ParentCode) : undefined;
    out.set(a.AreaCode, (parent?.AreaName ?? a.AreaName).trim());
  }
  return out;
}

// ---- ADMIN (read all + write) ----

/** All areas incl. inactive, with item id — for admin management. */
export async function listAllAreasAdmin(): Promise<AreaAdminRow[]> {
  const { client, siteId, listId } = await ctx();
  if (!listId) return [];
  const items = await readAreaItems(client, siteId, listId);
  return items
    .map((it) => ({ it, rec: mapArea(it.fields) }))
    .filter(({ rec }) => rec.AreaCode)
    .map(({ it, rec }) => ({
      id: it.id,
      code: rec.AreaCode,
      name: rec.AreaName,
      departmentCode: rec.DepartmentCode,
      departments: effectiveDepts(rec),
      parentCode: rec.ParentCode ?? null,
      hasOwnDepartments: (rec.Departments ?? "").trim().length > 0,
      sortOrder: rec.SortOrder,
      isActive: rec.IsActive,
    }))
    .sort((a, b) => a.name.localeCompare(b.name, "vi") || a.sortOrder - b.sortOrder);
}

export async function createArea(input: AreaInput): Promise<AreaAdminRow> {
  const { client, siteId, listId } = await ctx();
  if (!listId) throw new Error("Chưa có list Config_Areas — chạy provision trước.");
  const created = await client.post<GraphListItem>(`/sites/${siteId}/lists/${listId}/items`, {
    fields: {
      Title: input.code,
      AreaCode: input.code,
      AreaName: input.name,
      DepartmentCode: input.departmentCode,
      Departments: (input.departments ?? (input.departmentCode ? [input.departmentCode] : [])).join(","),
      ParentCode: input.parentCode ?? "",
      IsActive: input.isActive ?? true,
      SortOrder: input.sortOrder ?? 0,
    },
  });
  return {
    id: created.id,
    code: input.code,
    name: input.name,
    departmentCode: input.departmentCode,
    departments: input.departments ?? (input.departmentCode ? [input.departmentCode] : []),
    parentCode: input.parentCode ?? null,
    sortOrder: input.sortOrder ?? 0,
    isActive: input.isActive ?? true,
  };
}

export async function updateArea(id: string, input: Partial<AreaInput>): Promise<void> {
  const { client, siteId, listId } = await ctx();
  if (!listId) throw new Error("Chưa có list Config_Areas — chạy provision trước.");
  const fields: Record<string, unknown> = {};
  if (input.name !== undefined) fields.AreaName = input.name;
  if (input.departmentCode !== undefined) fields.DepartmentCode = input.departmentCode;
  if (input.departments !== undefined) fields.Departments = [...new Set(input.departments.map((x) => x.trim()).filter(Boolean))].join(",");
  if (input.parentCode !== undefined) fields.ParentCode = input.parentCode ?? "";
  if (input.sortOrder !== undefined) fields.SortOrder = input.sortOrder;
  if (input.isActive !== undefined) fields.IsActive = input.isActive;
  if (Object.keys(fields).length === 0) return;
  await client.patch(`/sites/${siteId}/lists/${listId}/items/${id}/fields`, fields);
}

/** All areas (incl. inactive) for one department, with id + isActive — admin. */
export async function listAreasByDepartmentAdmin(
  departmentCode: string,
  includeInactive = true,
): Promise<AreaAdminRow[]> {
  const all = await listAllAreasAdmin();
  return all
    .filter((a) => a.departments.includes(departmentCode))
    .filter((a) => (includeInactive ? true : a.isActive))
    .sort((x, y) => Number(y.isActive) - Number(x.isActive) || x.sortOrder - y.sortOrder);
}

/**
 * Số lần khu vực đã được dùng (Data_Submissions.AreaCode) — chốt an toàn cho
 * xóa vĩnh viễn: khu vực ĐÃ CÓ ẢNH thì chỉ được Ẩn, không được xóa.
 */
export async function countAreaUsage(areaCode: string): Promise<number> {
  const { getSubmissions } = await import("./submission-service");
  const subs = await getSubmissions(999).catch(() => []);
  return subs.filter((x) => x.AreaCode === areaCode).length;
}

/**
 * HARD delete — chỉ cho khu vực CHƯA từng có lần gửi nào (usage = 0).
 * Khu vực đã dùng: ném lỗi hướng dẫn dùng "Ẩn" (soft delete) thay thế.
 */
export async function hardDeleteArea(id: string, areaCode: string): Promise<void> {
  const used = await countAreaUsage(areaCode);
  if (used > 0) {
    throw new Error(`Khu vực đã có ${used} lần gửi ảnh — không thể xóa vĩnh viễn. Hãy dùng "Ẩn khu vực" (dữ liệu cũ được giữ nguyên).`);
  }
  const { client, siteId, listId } = await ctx();
  if (!listId) throw new Error("Chưa có list Config_Areas.");
  await client.del(`/sites/${siteId}/lists/${listId}/items/${id}`);
}

/** Soft delete — sets IsActive=false (never removes the row). */
export async function deactivateArea(id: string): Promise<void> {
  const { client, siteId, listId } = await ctx();
  if (!listId) throw new Error("Chưa có list Config_Areas — chạy provision trước.");
  await client.patch(`/sites/${siteId}/lists/${listId}/items/${id}/fields`, { IsActive: false });
}

/** Restore a soft-deleted area — sets IsActive=true. */
export async function restoreArea(id: string): Promise<void> {
  const { client, siteId, listId } = await ctx();
  if (!listId) throw new Error("Chưa có list Config_Areas — chạy provision trước.");
  await client.patch(`/sites/${siteId}/lists/${listId}/items/${id}/fields`, { IsActive: true });
}

/**
 * Idempotent upsert by AreaCode:
 *  - new code        -> create
 *  - existing active -> update fields
 *  - existing inactive -> update fields + reactivate (IsActive=true)
 * Never creates a duplicate AreaCode. Default reactivates unless isActive=false given.
 */
export async function upsertAreaByCode(
  input: AreaInput,
): Promise<{ action: "created" | "updated" | "restored"; code: string }> {
  const { client, siteId, listId } = await ctx();
  if (!listId) throw new Error("Chưa có list Config_Areas — chạy provision trước.");
  const items = await readAreaItems(client, siteId, listId);
  const found = items.find((it) => mapArea(it.fields).AreaCode === input.code);
  if (!found) {
    await createArea({ ...input, isActive: input.isActive ?? true });
    return { action: "created", code: input.code };
  }
  const rec = mapArea(found.fields);
  const isActive = input.isActive ?? true;
  await updateArea(found.id, { ...input, isActive });
  return { action: !rec.IsActive && isActive ? "restored" : "updated", code: input.code };
}

export interface SeedAreasResult {
  departmentCode?: string;
  created: string[];
  updated: string[];
  restored: string[];
  note?: string;
}

function emptySeed(departmentCode?: string): SeedAreasResult {
  return { departmentCode, created: [], updated: [], restored: [] };
}
function collect(out: SeedAreasResult, r: { action: "created" | "updated" | "restored"; code: string }) {
  if (r.action === "created") out.created.push(r.code);
  else if (r.action === "restored") out.restored.push(r.code);
  else out.updated.push(r.code);
}

/** The default sample area set created per department. */
export const DEFAULT_AREA_SET: ReadonlyArray<{ suffix: string; name: string }> = [
  { suffix: "OFFICE", name: "Văn phòng" },
  { suffix: "MEETING", name: "Phòng họp" },
  { suffix: "STORAGE", name: "Kho / Khu lưu trữ" },
  { suffix: "COMMON", name: "Khu vực chung" },
];

/** Create just the "Văn phòng" area for one department (idempotent/reactivate). */
export async function seedOfficeAreaForDepartment(departmentCode: string): Promise<SeedAreasResult> {
  const out = emptySeed(departmentCode);
  const r = await upsertAreaByCode({
    code: `${departmentCode}_OFFICE`,
    name: "Văn phòng",
    departmentCode,
    sortOrder: 0,
  });
  collect(out, r);
  return out;
}

/** Create the default sample area set (OFFICE/MEETING/STORAGE/COMMON) for one department. */
export async function seedDefaultAreasForDepartment(departmentCode: string): Promise<SeedAreasResult> {
  const out = emptySeed(departmentCode);
  let sort = 0;
  for (const a of DEFAULT_AREA_SET) {
    const r = await upsertAreaByCode({
      code: `${departmentCode}_${a.suffix}`,
      name: a.name,
      departmentCode,
      sortOrder: sort++,
    });
    collect(out, r);
  }
  return out;
}

/**
 * Bulk: create `${DeptCode}_OFFICE` for every ACTIVE department that currently
 * has NO active area. Idempotent (reactivates an inactive OFFICE if present).
 */
export async function seedOfficeAreaForMissingDepartments(): Promise<SeedAreasResult> {
  const out = emptySeed();
  const [departments, counts] = await Promise.all([listActiveDepartments(), countAreasByDepartment()]);
  for (const d of departments) {
    if ((counts[d.code] ?? 0) > 0) continue; // already has an active area
    const r = await upsertAreaByCode({ code: `${d.code}_OFFICE`, name: "Văn phòng", departmentCode: d.code, sortOrder: 0 });
    collect(out, r);
  }
  return out;
}

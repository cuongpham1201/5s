/**
 * Config list access (Phase 2C.2): read Config_* lists + an idempotent seed.
 * Triggered via admin endpoints. No photo upload. Never duplicates existing rows.
 */
import { CONFIG_LISTS } from "./sharepoint-config";
import { getAppOnlyClient, type SharePointGraphClient } from "./graph-client";
import { findListId, resolveSite } from "./site-context";
import { mapArea, mapDepartment } from "./list-helpers";
import type { GraphCollection, GraphListItem } from "./sharepoint-types";
import type { AreaRecord, DepartmentRecord } from "@/types/sharepoint";
import { AREAS, DEPARTMENTS } from "@/lib/mock-data";

async function ctx(): Promise<{ client: SharePointGraphClient; siteId: string }> {
  const client = await getAppOnlyClient();
  const site = await resolveSite(client);
  return { client, siteId: site.id };
}

async function readItems(client: SharePointGraphClient, siteId: string, listName: string) {
  const listId = await findListId(client, siteId, listName);
  if (!listId) return { listId: null as string | null, items: [] as GraphListItem[] };
  const res = await client.get<GraphCollection<GraphListItem>>(
    `/sites/${siteId}/lists/${listId}/items?expand=fields&$top=999`,
  );
  return { listId, items: res.value };
}

export async function getDepartments(): Promise<DepartmentRecord[]> {
  const { client, siteId } = await ctx();
  const { items } = await readItems(client, siteId, CONFIG_LISTS.departments);
  return items.map((it) => mapDepartment(it.fields));
}

export async function getAreas(): Promise<AreaRecord[]> {
  const { client, siteId } = await ctx();
  const { items } = await readItems(client, siteId, CONFIG_LISTS.areas);
  return items.map((it) => mapArea(it.fields));
}

export interface SeedResult {
  departments: { created: string[]; skipped: string[] };
  areas: { created: string[]; skipped: string[] };
  note?: string;
}

const SEED_DEPT_CODES = ["PMKT", "PXHL", "KCS"];
const SEED_AREA_NAMES = ["Văn phòng", "Phòng họp", "Kho POSM", "Xưởng 1", "Xưởng 2"];

/** Seed minimum departments + areas. Idempotent: only inserts missing keys. */
export async function seedConfig(): Promise<SeedResult> {
  const { client, siteId } = await ctx();
  const out: SeedResult = { departments: { created: [], skipped: [] }, areas: { created: [], skipped: [] } };

  const deptList = await findListId(client, siteId, CONFIG_LISTS.departments);
  const areaList = await findListId(client, siteId, CONFIG_LISTS.areas);
  if (!deptList || !areaList) {
    out.note = "Chưa có list Config_Departments/Config_Areas — chạy provision trước.";
    return out;
  }

  const existingDepts = await readItems(client, siteId, CONFIG_LISTS.departments);
  const haveDept = new Set(existingDepts.items.map((it) => mapDepartment(it.fields).DepartmentCode));
  for (const code of SEED_DEPT_CODES) {
    if (haveDept.has(code)) { out.departments.skipped.push(code); continue; }
    const d = DEPARTMENTS.find((x) => x.code === code);
    await client.post(`/sites/${siteId}/lists/${deptList}/items`, {
      fields: { Title: code, DepartmentCode: code, DepartmentName: d?.name ?? code, IsActive: true, SortOrder: 0 },
    });
    out.departments.created.push(code);
  }

  const existingAreas = await readItems(client, siteId, CONFIG_LISTS.areas);
  const haveArea = new Set(existingAreas.items.map((it) => mapArea(it.fields).AreaName));
  for (const areaName of SEED_AREA_NAMES) {
    if (haveArea.has(areaName)) { out.areas.skipped.push(areaName); continue; }
    const a = AREAS.find((x) => x.name === areaName);
    const areaCode = a?.id ?? areaName.toLowerCase().replace(/\s+/g, "-");
    await client.post(`/sites/${siteId}/lists/${areaList}/items`, {
      fields: {
        Title: areaCode,
        AreaCode: areaCode,
        AreaName: areaName,
        DepartmentCode: a?.department ?? "",
        IsActive: true,
        SortOrder: 0,
      },
    });
    out.areas.created.push(areaName);
  }
  return out;
}

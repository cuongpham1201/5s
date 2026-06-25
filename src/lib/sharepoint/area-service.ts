/**
 * Area read service (Config_Areas) — app-only Graph, read-only.
 */
import { CONFIG_LISTS } from "./sharepoint-config";
import { getAppOnlyClient } from "./graph-client";
import { findListId, resolveSite } from "./site-context";
import { mapArea } from "./list-helpers";
import type { GraphCollection, GraphListItem } from "./sharepoint-types";
import type { AreaRecord } from "@/types/sharepoint";

export interface AreaOption {
  code: string;
  name: string;
  departmentCode: string;
  sortOrder: number;
}

async function readAreas(): Promise<AreaRecord[]> {
  const client = await getAppOnlyClient();
  const site = await resolveSite(client);
  const listId = await findListId(client, site.id, CONFIG_LISTS.areas);
  if (!listId) return [];
  const res = await client.get<GraphCollection<GraphListItem>>(
    `/sites/${site.id}/lists/${listId}/items?expand=fields&$top=999`,
  );
  return res.value.map((it) => mapArea(it.fields));
}

export async function listActiveAreas(): Promise<AreaOption[]> {
  const areas = await readAreas();
  return areas
    .filter((a) => a.AreaCode && a.IsActive)
    .map((a) => ({ code: a.AreaCode, name: a.AreaName, departmentCode: a.DepartmentCode, sortOrder: a.SortOrder }));
}

export async function listAreasByDepartmentCode(departmentCode: string): Promise<AreaOption[]> {
  const all = await listActiveAreas();
  return all.filter((a) => a.departmentCode === departmentCode).sort((x, y) => x.sortOrder - y.sortOrder);
}

export async function getAreaByCode(code: string): Promise<AreaOption | null> {
  const all = await listActiveAreas();
  return all.find((a) => a.code === code) ?? null;
}

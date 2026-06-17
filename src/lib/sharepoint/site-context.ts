/**
 * Site/list/drive lookup helpers (Phase 2C.1) — READ-ONLY URL builders + GETs.
 * No mutations. Not imported by runtime pages.
 */
import {
  IMG_LIBRARY,
  SHAREPOINT_HOSTNAME,
  SHAREPOINT_SITE_PATH,
} from "./sharepoint-config";
import type { SharePointGraphClient } from "./graph-client";
import type { GraphCollection, GraphDrive, GraphList, GraphSite } from "./sharepoint-types";

/** Graph path to resolve the Ban5S site by hostname + server-relative path. */
export function siteLookupPath(): string {
  return `/sites/${SHAREPOINT_HOSTNAME}:${SHAREPOINT_SITE_PATH}`;
}

/** Resolve the site (read-only). */
export async function resolveSite(client: SharePointGraphClient): Promise<GraphSite> {
  return client.get<GraphSite>(siteLookupPath());
}

/** List all lists on the site (read-only) — used to find a list id by name. */
export async function listLists(client: SharePointGraphClient, siteId: string): Promise<GraphList[]> {
  const res = await client.get<GraphCollection<GraphList>>(`/sites/${siteId}/lists?$select=id,name,displayName`);
  return res.value;
}

/** Find a list id by its internal name (read-only). */
export async function findListId(
  client: SharePointGraphClient,
  siteId: string,
  internalName: string,
): Promise<string | null> {
  const lists = await listLists(client, siteId);
  return lists.find((l) => l.name === internalName)?.id ?? null;
}

/** Resolve the img document library drive (read-only). */
export async function resolveImgDrive(
  client: SharePointGraphClient,
  siteId: string,
): Promise<GraphDrive | null> {
  const res = await client.get<GraphCollection<GraphDrive>>(`/sites/${siteId}/drives?$select=id,name,webUrl`);
  return res.value.find((d) => d.name === IMG_LIBRARY) ?? null;
}

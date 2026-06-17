/**
 * Site / library / list / folder lookup helpers (Phase 2C.1A) — READ-ONLY.
 *
 * Reflects the corrected structure: a Document Library "5S" containing the real
 * folders img / ListConfig / ListData. No mutations. Not imported by runtime
 * pages. The Upload Engine (2C.2) reuses these for its health check + paths.
 */
import {
  DOCUMENT_LIBRARY,
  FOLDERS,
  SHAREPOINT_HOSTNAME,
  SHAREPOINT_SITE_PATH,
} from "./sharepoint-config";
import type { SharePointGraphClient } from "./graph-client";
import type { GraphCollection, GraphDrive, GraphList, GraphSite } from "./sharepoint-types";

/** Graph path to resolve the Ban5S site by hostname + server-relative path. */
export function siteLookupPath(): string {
  return `/sites/${SHAREPOINT_HOSTNAME}:${SHAREPOINT_SITE_PATH}`;
}

export async function resolveSite(client: SharePointGraphClient): Promise<GraphSite> {
  return client.get<GraphSite>(siteLookupPath());
}

/** All document libraries (drives) on the site (read-only). */
export async function listDrives(client: SharePointGraphClient, siteId: string): Promise<GraphDrive[]> {
  const res = await client.get<GraphCollection<GraphDrive>>(
    `/sites/${siteId}/drives?$select=id,name,webUrl`,
  );
  return res.value;
}

/** Resolve the "5S" document library drive (NOT a folder — img is a folder inside it). */
export async function resolveLibraryDrive(
  client: SharePointGraphClient,
  siteId: string,
): Promise<GraphDrive | null> {
  const drives = await listDrives(client, siteId);
  return drives.find((d) => d.name === DOCUMENT_LIBRARY) ?? null;
}

/** Names of the top-level children under the "5S" library root (read-only). */
export async function listLibraryRootChildren(
  client: SharePointGraphClient,
  driveId: string,
): Promise<string[]> {
  const res = await client.get<GraphCollection<{ name: string }>>(
    `/drives/${driveId}/root/children?$select=name`,
  );
  return res.value.map((c) => c.name);
}

/** Verify the expected real folders (img/ListConfig/ListData) exist under "5S". */
export async function verifyExpectedFolders(
  client: SharePointGraphClient,
  driveId: string,
): Promise<{ present: string[]; missing: string[] }> {
  const expected = [FOLDERS.img, FOLDERS.listConfig, FOLDERS.listData];
  const children = await listLibraryRootChildren(client, driveId);
  return {
    present: expected.filter((f) => children.includes(f)),
    missing: expected.filter((f) => !children.includes(f)),
  };
}

/** All site-level lists (read-only) — used to find Config_ and Data_ list ids. */
export async function listLists(client: SharePointGraphClient, siteId: string): Promise<GraphList[]> {
  const res = await client.get<GraphCollection<GraphList>>(
    `/sites/${siteId}/lists?$select=id,name,displayName`,
  );
  return res.value;
}

export async function findListId(
  client: SharePointGraphClient,
  siteId: string,
  internalName: string,
): Promise<string | null> {
  const lists = await listLists(client, siteId);
  return lists.find((l) => l.name === internalName)?.id ?? null;
}

/**
 * Build the path (within the "5S" drive) to a photo file under the img folder:
 *   img/YYYY/MM/DepartmentCode/SubmissionId/<fileName>
 * Returned for the Upload Engine (2C.2); not used to mutate here.
 */
export function imgFilePath(args: {
  year: string;
  month: string;
  departmentCode: string;
  submissionId: string;
  fileName: string;
}): string {
  return `${FOLDERS.img}/${args.year}/${args.month}/${args.departmentCode}/${args.submissionId}/${args.fileName}`;
}

/** Graph content path to upload a file into the "5S" drive (Phase 2C.2 will PUT here). */
export function driveUploadPath(driveId: string, relativePath: string): string {
  return `/drives/${driveId}/root:/${relativePath}:/content`;
}

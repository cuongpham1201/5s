/**
 * Ban5S reality / health check (Phase 2C.2) — READ-ONLY.
 * Verifies site, the "5S" document library, the expected folders, and the
 * expected Config_/Data_ lists. Never mutates. Never returns secrets.
 */
import {
  CONFIG_LISTS,
  DATA_LISTS,
  DOCUMENT_LIBRARY,
  FOLDERS,
  GRAPH_ENV,
  SHAREPOINT_HOSTNAME,
  SHAREPOINT_SITE_PATH,
} from "./sharepoint-config";
import { getAppOnlyToken, createSharePointGraphClient, maskClientId } from "./graph-client";
import type { GraphCollection, GraphDrive, GraphList, GraphSite } from "./sharepoint-types";

type State = "FOUND" | "MISSING" | "ERROR";

export interface HealthResult {
  site: State;
  library: State;
  folders: Record<string, State>;
  lists: Record<string, State>;
  ready: boolean;
  diagnostics: {
    tokenAcquired: "yes" | "no";
    tenant: string;
    clientIdMasked: string;
    drives: string[];
    libraryRootChildren: string[];
    siteLists: string[];
    note?: string;
  };
}

// READY depends on: Site + Library + Img folder + Config/Data lists.
// ListConfig/ListData are intentionally NOT checked (artifact folders, not required).
const EXPECTED_FOLDERS = [FOLDERS.img];
const EXPECTED_LISTS = [...Object.values(CONFIG_LISTS), ...Object.values(DATA_LISTS)];

export async function checkHealth(): Promise<HealthResult> {
  const result: HealthResult = {
    site: "ERROR",
    library: "ERROR",
    folders: Object.fromEntries(EXPECTED_FOLDERS.map((f) => [f, "ERROR" as State])),
    lists: Object.fromEntries(EXPECTED_LISTS.map((l) => [l, "ERROR" as State])),
    ready: false,
    diagnostics: {
      tokenAcquired: "no",
      tenant: process.env[GRAPH_ENV.tenantId] ?? "",
      clientIdMasked: maskClientId(process.env[GRAPH_ENV.clientId]),
      drives: [],
      libraryRootChildren: [],
      siteLists: [],
    },
  };

  let token: string;
  try {
    token = await getAppOnlyToken();
    result.diagnostics.tokenAcquired = "yes";
  } catch (e) {
    result.diagnostics.note = (e as Error).message;
    return result;
  }
  const client = createSharePointGraphClient(token);

  // Site
  let siteId: string;
  try {
    const site = await client.get<GraphSite>(`/sites/${SHAREPOINT_HOSTNAME}:${SHAREPOINT_SITE_PATH}`);
    siteId = site.id;
    result.site = "FOUND";
  } catch (e) {
    result.site = "ERROR";
    result.diagnostics.note = (e as Error).message;
    return result;
  }

  // Library (drive named "5S")
  let libDrive: GraphDrive | undefined;
  try {
    const drives = await client.get<GraphCollection<GraphDrive>>(`/sites/${siteId}/drives?$select=id,name`);
    result.diagnostics.drives = drives.value.map((d) => d.name);
    libDrive = drives.value.find((d) => d.name === DOCUMENT_LIBRARY);
    result.library = libDrive ? "FOUND" : "MISSING";
  } catch {
    result.library = "ERROR";
  }

  // Folders inside the library (case-insensitive match; record actual names)
  if (libDrive) {
    try {
      const children = await client.get<GraphCollection<{ name: string }>>(
        `/drives/${libDrive.id}/root/children?$select=name`,
      );
      const names = children.value.map((c) => c.name);
      result.diagnostics.libraryRootChildren = names;
      const lower = names.map((n) => n.toLowerCase());
      for (const f of EXPECTED_FOLDERS) result.folders[f] = lower.includes(f.toLowerCase()) ? "FOUND" : "MISSING";
    } catch {
      for (const f of EXPECTED_FOLDERS) result.folders[f] = "ERROR";
    }
  } else {
    for (const f of EXPECTED_FOLDERS) result.folders[f] = "MISSING";
  }

  // Lists (site-level)
  try {
    const lists = await client.get<GraphCollection<GraphList>>(`/sites/${siteId}/lists?$select=name,displayName`);
    const names = lists.value.flatMap((l) => [l.name, l.displayName].filter(Boolean) as string[]);
    result.diagnostics.siteLists = lists.value.map((l) => l.name);
    for (const l of EXPECTED_LISTS) result.lists[l] = names.includes(l) ? "FOUND" : "MISSING";
  } catch {
    for (const l of EXPECTED_LISTS) result.lists[l] = "ERROR";
  }

  const foldersOk = EXPECTED_FOLDERS.every((f) => result.folders[f] === "FOUND");
  const listsOk = EXPECTED_LISTS.every((l) => result.lists[l] === "FOUND");
  result.ready = result.site === "FOUND" && result.library === "FOUND" && foldersOk && listsOk;
  return result;
}

/** Site + library reachable (enough to allow provisioning to attempt). */
export function canProvision(h: HealthResult): boolean {
  return h.site === "FOUND" && h.library === "FOUND";
}

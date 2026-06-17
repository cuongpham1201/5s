/**
 * SharePoint (Ban5S) configuration constants — Phase 2C.1.
 * No secrets here; env var NAMES only (filled at deploy, Phase 2C.2).
 */

export const SHAREPOINT_HOSTNAME = "biahalong.sharepoint.com";
export const SHAREPOINT_SITE_PATH = "/sites/Ban5S";

/** Document library for photos (real folder-capable container). */
export const IMG_LIBRARY = "img";

/**
 * ListConfig / ListData are logical namespaces (SharePoint lists are flat),
 * realized as list internal-name prefixes. See docs/sharepoint/BAN5S_SCHEMA.md.
 */
export const CONFIG_LISTS = {
  departments: "Config_Departments",
  areas: "Config_Areas",
  settings: "Config_Settings",
  roleMapping: "Config_RoleMapping",
} as const;

export const DATA_LISTS = {
  submissions: "Data_Submissions",
  submissionPhotos: "Data_SubmissionPhotos",
  syncLogs: "Data_SyncLogs",
} as const;

export const GRAPH_BASE = "https://graph.microsoft.com/v1.0";

/** Env var NAMES for app-only Graph access (values provided at deploy). */
export const GRAPH_ENV = {
  clientId: "GRAPH_CLIENT_ID",
  clientSecret: "GRAPH_CLIENT_SECRET",
  tenantId: "GRAPH_TENANT_ID",
} as const;

export type ConfigListKey = keyof typeof CONFIG_LISTS;
export type DataListKey = keyof typeof DATA_LISTS;

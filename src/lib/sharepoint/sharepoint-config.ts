/**
 * SharePoint (Ban5S) configuration — Phase 2C.1A (corrected structure).
 * No secrets here; env var NAMES only (filled at deploy, Phase 2C.2).
 *
 * SOURCE OF TRUTH (existing, do NOT recreate/rename):
 *   Site:    https://biahalong.sharepoint.com/sites/Ban5S
 *   Library: "5S" (Document Library)
 *   Folder (REAL, already exists in the 5S library):
 *     5S/Img         → image files
 *
 * Structured data lives in site-level SharePoint **Lists** (SharePoint cannot
 * nest Lists inside library folders), named with Config_/Data_ prefixes.
 */

export const SHAREPOINT_HOSTNAME = "biahalong.sharepoint.com";
export const SHAREPOINT_SITE_PATH = "/sites/Ban5S";

export const sharePointConfig = {
  siteUrl: "https://biahalong.sharepoint.com/sites/Ban5S",
  hostname: SHAREPOINT_HOSTNAME,
  sitePath: SHAREPOINT_SITE_PATH,
  /** The Document Library that holds the real folders below. */
  documentLibraryName: "5S",
  /** REAL existing folders inside the "5S" library (note: "Img" is capitalized).
   *  Only "Img" is used by the app; structured data lives in site-level Lists. */
  folders: {
    img: "Img",
  },
  /** Site-level structured Lists (grouped logically by Config_/Data_ prefix). */
  lists: {
    departments: "Config_Departments",
    areas: "Config_Areas",
    checkItems: "Config_CheckItems",
    userAreaPermissions: "Config_UserAreaPermissions",
    settings: "Config_Settings",
    roleMapping: "Config_RoleMapping",
    submissions: "Data_Submissions",
    submissionPhotos: "Data_SubmissionPhotos",
    syncLogs: "Data_SyncLogs",
    userProfiles: "Data_UserProfiles",
  },
} as const;

/** Convenience re-exports. */
export const DOCUMENT_LIBRARY = sharePointConfig.documentLibraryName; // "5S"
export const FOLDERS = sharePointConfig.folders;
export const CONFIG_LISTS = {
  departments: sharePointConfig.lists.departments,
  areas: sharePointConfig.lists.areas,
  checkItems: sharePointConfig.lists.checkItems,
  userAreaPermissions: sharePointConfig.lists.userAreaPermissions,
  settings: sharePointConfig.lists.settings,
  roleMapping: sharePointConfig.lists.roleMapping,
} as const;
export const DATA_LISTS = {
  submissions: sharePointConfig.lists.submissions,
  submissionPhotos: sharePointConfig.lists.submissionPhotos,
  syncLogs: sharePointConfig.lists.syncLogs,
  userProfiles: sharePointConfig.lists.userProfiles,
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

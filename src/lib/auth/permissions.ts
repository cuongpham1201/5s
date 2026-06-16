/**
 * Permission model (Phase 1B foundation) — mirrors SECURITY_MODEL.md §3.
 *
 * Pure, declarative capability checks keyed by role. No SharePoint/DB calls.
 * The BFF (Phase 2) will call `can()` to enforce access; the UI uses it to
 * show/hide admin navigation.
 */

import type { AppRole } from "./roles";

export type Permission =
  | "submit:photo" // chụp & gửi ảnh
  | "view:own-history" // xem lịch sử của mình/đơn vị mình
  | "view:all-photos" // xem ảnh mọi đơn vị
  | "view:dashboard" // dashboard tổng hợp
  | "remind:units" // nhắc đơn vị
  | "export:report" // xuất Excel
  | "flag:photo" // gắn cờ ảnh nghi vấn
  | "delete:photo" // xóa ảnh
  | "manage:catalog" // sửa Department/Area
  | "manage:settings" // sửa 5SSettings
  | "manage:users" // phân quyền user
  | "view:audit"; // xem audit log

const MATRIX: Record<AppRole, Permission[]> = {
  employee: ["submit:photo", "view:own-history"],
  environment: [
    "submit:photo",
    "view:own-history",
    "view:all-photos",
    "view:dashboard",
    "remind:units",
    "export:report",
    "flag:photo",
    "view:audit",
  ],
  admin: [
    "submit:photo",
    "view:own-history",
    "view:all-photos",
    "view:dashboard",
    "remind:units",
    "export:report",
    "flag:photo",
    "delete:photo",
    "manage:catalog",
    "manage:settings",
    "manage:users",
    "view:audit",
  ],
};

/** Does this role have the given permission? */
export function can(role: AppRole | undefined, permission: Permission): boolean {
  if (!role) return false;
  return MATRIX[role]?.includes(permission) ?? false;
}

/** All permissions granted to a role (useful for debugging / UI gating). */
export function permissionsFor(role: AppRole | undefined): Permission[] {
  if (!role) return [];
  return MATRIX[role] ?? [];
}

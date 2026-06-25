import { NextResponse } from "next/server";
import { listAllDepartments } from "@/lib/sharepoint/department-service";
import { normalizeText } from "@/lib/sharepoint/org-codes";
import { denyIfNotAdmin } from "@/lib/sharepoint/admin-guard";

export const dynamic = "force-dynamic";

/**
 * POST /api/admin/sharepoint/departments/cleanup-inactive-duplicates
 * REPORT ONLY — never deletes. Lists inactive rows that duplicate an ACTIVE
 * department (same normalized name), so an admin can remove them manually.
 */
export async function POST() {
  const denied = await denyIfNotAdmin();
  if (denied) return denied;
  try {
    const all = await listAllDepartments();
    const activeByName = new Set(all.filter((d) => d.isActive).map((d) => normalizeText(d.name)));
    const inactiveDuplicates = all
      .filter((d) => !d.isActive && activeByName.has(normalizeText(d.name)))
      .map((d) => ({ code: d.code, name: d.name }));
    return NextResponse.json({
      action: "report-only",
      deleted: 0,
      note: "Không xoá gì. Đây là danh sách bản inactive trùng tên với phòng ban đang active — admin có thể xoá thủ công trên SharePoint nếu muốn.",
      inactiveDuplicates,
    });
  } catch (e) {
    return NextResponse.json({ error: (e as Error).message }, { status: 500 });
  }
}

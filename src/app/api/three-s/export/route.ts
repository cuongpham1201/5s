import { NextResponse, type NextRequest } from "next/server";
import * as XLSX from "xlsx";
import { resolveRequestUser } from "@/lib/auth/request-department";
import { isAdmin } from "@/lib/auth/admin";
import { listThreeSLog } from "@/lib/sharepoint/three-s-service";
import { vnDateKey } from "@/lib/sharepoint/report-service";

export const dynamic = "force-dynamic";

const KIND_VI: Record<string, string> = { good: "Hiện trạng tốt", violation: "Vi phạm", before: "Trước", after: "Sau" };

/** GET /api/three-s/export?month=YYYY-MM[&departmentCode=X] — Sổ 3S (.xlsx, BM-HD.01-05). */
export async function GET(req: NextRequest) {
  const me = await resolveRequestUser(req);
  if (!me?.email) return NextResponse.json({ error: "unauthorized" }, { status: 401 });
  const sp = req.nextUrl.searchParams;
  const month = /^\d{4}-\d{2}$/.test(sp.get("month") ?? "") ? (sp.get("month") as string) : vnDateKey().slice(0, 7);
  const admin = await isAdmin(me.email);
  const dept = admin ? (sp.get("departmentCode") || null) : me.departmentCode ?? "__none__";
  const rows = await listThreeSLog(month, dept === "" ? null : dept);

  const head = ["Ngày", "Giờ", "Phòng ban", "Khu vực", "Người thực hiện", "Thẻ S", "Loại ảnh", "Ghi chú vi phạm", "Mã ảnh", "Ghép cặp với", "Đường dẫn ảnh"];
  const body = rows.map((r) => [
    r.dateKey, r.time, r.departmentCode, r.areaName, r.reporterName,
    r.sTag ?? "", KIND_VI[r.photoKind ?? ""] ?? r.photoKind ?? "", r.violationNote ?? "",
    r.photoId, r.linkedPhotoId ?? "", r.photoPath,
  ]);
  const ws = XLSX.utils.aoa_to_sheet([
    [`SỔ THEO DÕI TRIỂN KHAI 3S (BM-HD.01-05) · Tháng ${month}${dept ? ` · ${dept}` : " · Toàn công ty"}`],
    [],
    head,
    ...body,
  ]);
  ws["!cols"] = [{ wch: 11 }, { wch: 6 }, { wch: 9 }, { wch: 20 }, { wch: 20 }, { wch: 7 }, { wch: 14 }, { wch: 28 }, { wch: 22 }, { wch: 22 }, { wch: 46 }];
  const wb = XLSX.utils.book_new();
  XLSX.utils.book_append_sheet(wb, ws, "So 3S");
  const buf = XLSX.write(wb, { type: "buffer", bookType: "xlsx" }) as Buffer;
  return new NextResponse(new Uint8Array(buf), {
    status: 200,
    headers: {
      "Content-Type": "application/vnd.openxmlformats-officedocument.spreadsheetml.sheet",
      "Content-Disposition": `attachment; filename="5S_So3S_${month}${dept ? `_${encodeURIComponent(dept)}` : ""}.xlsx"`,
      "Cache-Control": "no-store",
    },
  });
}

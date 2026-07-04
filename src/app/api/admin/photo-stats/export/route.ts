import { type NextRequest, NextResponse } from "next/server";
import * as XLSX from "xlsx";
import { denyIfNotAdmin } from "@/lib/sharepoint/admin-guard";
import { aggregatePhotoStats, parseStatParams } from "@/lib/sharepoint/photo-stats";

export const dynamic = "force-dynamic";

/**
 * GET /api/admin/photo-stats/export?from&to&group — .xlsx download.
 * Sheet 1 "Tong hop": dept × period matrix. Sheet 2 "Chi tiet khu vuc":
 * dept + area × period. Real photo counts (Data_SubmissionPhotos, non-deleted).
 */
export async function GET(req: NextRequest) {
  const denied = await denyIfNotAdmin();
  if (denied) return denied;
  const { from, to, group, type } = parseStatParams(req.nextUrl.searchParams);
  const stats = await aggregatePhotoStats(from, to, group, type);

  const groupLabel = group === "day" ? "Ngày" : group === "week" ? "Tuần" : "Tháng";
  const wb = XLSX.utils.book_new();

  // Sheet 1 — department × period
  const head1 = ["Mã PB", "Phòng ban", ...stats.buckets, "Tổng"];
  const rows1 = stats.rows.map((r) => [r.code, r.name, ...stats.buckets.map((b) => r.byBucket[b] ?? 0), r.total]);
  const total1 = ["", "TỔNG CỘNG", ...stats.buckets.map((b) => stats.byBucketTotal[b] ?? 0), stats.grandTotal];
  const ws1 = XLSX.utils.aoa_to_sheet([
    [`THỐNG KÊ ẢNH 5S THEO ${groupLabel.toUpperCase()} · ${stats.from} → ${stats.to}`],
    [],
    head1,
    ...rows1,
    total1,
  ]);
  ws1["!cols"] = [{ wch: 8 }, { wch: 34 }, ...stats.buckets.map(() => ({ wch: 11 })), { wch: 8 }];
  XLSX.utils.book_append_sheet(wb, ws1, "Tong hop");

  // Sheet 2 — department + area × period
  const head2 = ["Mã PB", "Phòng ban", "Khu vực", ...stats.buckets, "Tổng"];
  const rows2 = stats.rows.flatMap((r) =>
    r.areas.map((a) => [r.code, r.name, a.area, ...stats.buckets.map((b) => a.byBucket[b] ?? 0), a.total]),
  );
  const ws2 = XLSX.utils.aoa_to_sheet([head2, ...rows2]);
  ws2["!cols"] = [{ wch: 8 }, { wch: 30 }, { wch: 22 }, ...stats.buckets.map(() => ({ wch: 11 })), { wch: 8 }];
  XLSX.utils.book_append_sheet(wb, ws2, "Chi tiet khu vuc");

  const buf = XLSX.write(wb, { type: "buffer", bookType: "xlsx" }) as Buffer;
  const fname = `5S_ThongKeAnh_${group}_${stats.from}_${stats.to}.xlsx`;
  return new NextResponse(new Uint8Array(buf), {
    status: 200,
    headers: {
      "Content-Type": "application/vnd.openxmlformats-officedocument.spreadsheetml.sheet",
      "Content-Disposition": `attachment; filename="${fname}"`,
      "Cache-Control": "no-store",
    },
  });
}

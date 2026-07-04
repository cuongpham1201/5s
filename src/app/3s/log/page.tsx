"use client";

import Link from "next/link";
import { useCallback, useEffect, useState } from "react";
import { AppShell } from "@/components/layout/AppShell";
import { PhotoViewerModal, type ViewerPhoto } from "@/components/media/PhotoViewerModal";

interface Row {
  dateKey: string; time: string; submissionId: string; seqNo: number; photoId: string;
  departmentCode: string; areaName: string; reporterName: string;
  sTag: string | null; photoKind: string | null; violationNote: string | null;
  linkedPhotoId: string | null; photoPath: string;
}
interface Dept { code: string; name: string }

const KIND_VI: Record<string, { label: string; cls: string }> = {
  good: { label: "Tốt", cls: "bg-success-bg text-success" },
  violation: { label: "Vi phạm", cls: "bg-danger-bg text-danger" },
  before: { label: "Trước", cls: "bg-warning-bg text-warning" },
  after: { label: "Sau", cls: "bg-info-bg text-info" },
};

/** Sổ theo dõi 3S điện tử (BM-HD.01-05). */
export default function ThreeSLogPage() {
  const [month, setMonth] = useState("");
  const [dept, setDept] = useState("");
  const [isAdmin, setIsAdmin] = useState(false);
  const [depts, setDepts] = useState<Dept[]>([]);
  const [rows, setRows] = useState<Row[]>([]);
  const [loading, setLoading] = useState(true);
  const [viewer, setViewer] = useState<number | null>(null);

  const load = useCallback(async (m: string, d: string) => {
    setLoading(true);
    try {
      const p = new URLSearchParams();
      if (m) p.set("month", m);
      if (d) p.set("departmentCode", d);
      const r = await fetch(`/api/three-s/log?${p.toString()}`);
      const j = r.ok ? await r.json() : null;
      setRows(j?.rows ?? []);
      setIsAdmin(!!j?.isAdmin);
      if (j?.month && !m) setMonth(j.month);
    } finally { setLoading(false); }
  }, []);

  useEffect(() => {
    void load("", "");
    fetch("/api/config/departments").then((r) => (r.ok ? r.json() : null)).then((d) => setDepts(d?.departments ?? [])).catch(() => {});
  }, [load]);

  const exportUrl = () => {
    const p = new URLSearchParams();
    if (month) p.set("month", month);
    if (dept) p.set("departmentCode", dept);
    return `/api/three-s/export?${p.toString()}`;
  };

  const violations = rows.filter((r) => r.photoKind === "violation").length;

  // Bấm vào dòng/ảnh → mở xem ảnh full ngay tại sổ (không phải mò qua Gallery).
  const viewerPhotos: ViewerPhoto[] = rows.map((r) => ({
    watermarkedPath: r.photoPath,
    departmentCode: r.departmentCode,
    areaName: `${r.areaName}${r.sTag ? ` · ${r.sTag}` : ""}${r.violationNote ? ` · ⚠ ${r.violationNote}` : ""}`,
    reporterName: r.reporterName,
    submittedAt: `${r.dateKey}T${r.time || "00:00"}:00`,
    submissionId: r.submissionId,
  }));

  return (
    <AppShell>
      <div className="flex items-center gap-3 px-4 pt-3 pb-2">
        <Link href="/3s" className="w-9 h-9 rounded-pill grid place-items-center text-lg bg-surface">←</Link>
        <div>
          <div className="text-[17px] font-bold leading-tight">Sổ theo dõi 3S</div>
          <div className="text-[12px] text-ink-muted">BM-HD.01-05 · nguồn: ảnh Audit 5S đã đồng bộ</div>
        </div>
        <a href={exportUrl()} className="ml-auto btn btn-primary !min-h-9 text-[13px]">⬇ Xuất Excel</a>
      </div>

      <div className="px-4 pb-2 flex flex-wrap items-center gap-2">
        <input type="month" value={month} onChange={(e) => { setMonth(e.target.value); void load(e.target.value, dept); }}
          className="rounded-md border border-line px-2.5 py-1.5 text-[13px]" />
        {isAdmin && (
          <select value={dept} onChange={(e) => { setDept(e.target.value); void load(month, e.target.value); }}
            className="rounded-md border border-line px-2.5 py-1.5 text-[13px] bg-white">
            <option value="">Tất cả phòng ban</option>
            {depts.map((d) => <option key={d.code} value={d.code}>{d.code} · {d.name}</option>)}
          </select>
        )}
        {!loading && (
          <span className="text-[12.5px] text-ink-muted ml-auto">
            {rows.length} ảnh{violations > 0 && <> · <b className="text-danger">{violations} vi phạm</b></>}
          </span>
        )}
      </div>

      <div className="px-4 pb-8">
        {loading ? (
          <div className="text-ink-muted text-[13px] p-4">Đang tải…</div>
        ) : rows.length === 0 ? (
          <div className="card-flat p-8 text-center text-ink-muted text-[13px]">Chưa có bản ghi 3S trong tháng này.</div>
        ) : (
          <div className="flex flex-col gap-2">
            {rows.map((r, i) => {
              const kind = KIND_VI[r.photoKind ?? ""] ?? { label: r.photoKind ?? "—", cls: "bg-surface text-ink-muted" };
              return (
                <button key={`${r.photoId}`} onClick={() => setViewer(i)} className="card-flat p-2.5 flex items-center gap-3 text-left w-full active:bg-surface-2">
                  {/* eslint-disable-next-line @next/next/no-img-element */}
                  <img src={`/api/photo?path=${encodeURIComponent(r.photoPath)}`} alt="" loading="lazy"
                    className="w-[64px] h-[64px] rounded-md object-cover bg-surface flex-none" />
                  <div className="flex-1 min-w-0 text-[12.5px]">
                    <div className="flex items-center gap-1.5 flex-wrap">
                      <span className="font-bold">{r.sTag ?? "—"}</span>
                      <span className={`text-[10.5px] font-bold px-1.5 py-0.5 rounded-pill ${kind.cls}`}>{kind.label}</span>
                      {r.linkedPhotoId && <span className="text-[10.5px] text-ink-muted">↔ cặp {r.linkedPhotoId.slice(-6)}</span>}
                    </div>
                    <div className="text-ink-muted truncate mt-0.5">{r.dateKey} {r.time} · {r.departmentCode} · {r.areaName}</div>
                    <div className="text-ink-muted truncate">{r.reporterName}</div>
                    {r.violationNote && <div className="text-danger truncate mt-0.5">⚠ {r.violationNote}</div>}
                  </div>
                  <span className="text-ink-disabled text-lg flex-none">›</span>
                </button>
              );
            })}
          </div>
        )}
      </div>
      {viewer != null && <PhotoViewerModal photos={viewerPhotos} index={viewer} onClose={() => setViewer(null)} onIndexChange={setViewer} />}
    </AppShell>
  );
}

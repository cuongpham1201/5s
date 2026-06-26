"use client";

import Link from "next/link";
import { useEffect, useMemo, useState } from "react";
import { AppShell } from "@/components/layout/AppShell";
import { AppHeader } from "@/components/layout/AppHeader";
import { Icon } from "@/components/ui/Icon";
import { Thumb } from "@/components/media/Thumb";
import { PhotoViewerModal, type ViewerPhoto } from "@/components/media/PhotoViewerModal";
import type { TodaySummary } from "@/lib/sharepoint/report-service";

interface Dept { code: string; name: string }
interface PhotoItem { submissionId: string; seqNo: number; watermarkedPath: string; departmentCode: string; areaName: string; reporterName?: string; submittedAt: string }

function hhmm(iso?: string): string {
  if (!iso) return "";
  const d = new Date(iso);
  return Number.isNaN(d.getTime()) ? "" : `${String(d.getHours()).padStart(2, "0")}:${String(d.getMinutes()).padStart(2, "0")}`;
}

export default function OverviewPage() {
  const [depts, setDepts] = useState<Dept[]>([]);
  const [today, setToday] = useState<TodaySummary | null>(null);
  const [photos, setPhotos] = useState<PhotoItem[]>([]);
  const [loading, setLoading] = useState(true);
  const [q, setQ] = useState("");
  const [viewer, setViewer] = useState<{ list: ViewerPhoto[]; index: number } | null>(null);

  useEffect(() => {
    let active = true;
    Promise.all([
      fetch("/api/config/departments").then((r) => (r.ok ? r.json() : null)),
      fetch("/api/reports/today").then((r) => (r.ok ? r.json() : null)),
      fetch("/api/photos?limit=200").then((r) => (r.ok ? r.json() : null)),
    ]).then(([d, t, p]) => {
      if (!active) return;
      setDepts(d?.departments ?? []);
      setToday(t);
      setPhotos(p?.photos ?? []);
      setLoading(false);
    });
    return () => { active = false; };
  }, []);

  const submitted = new Set(today?.submittedDepartmentCodes ?? []);
  const todayKey = today?.date ?? "";
  const expected = depts.length;
  const submittedCount = today?.submittedDepartments ?? 0;
  const pct = Math.round((today?.completionRate ?? 0) * 100);

  // Aggregate photos per department (one fetch, no extra SharePoint round-trips).
  const byDept = useMemo(() => {
    const m = new Map<string, { todayCount: number; last: string; latest: PhotoItem | null }>();
    for (const p of photos) {
      const cur = m.get(p.departmentCode) ?? { todayCount: 0, last: "", latest: null };
      const isToday = (p.submittedAt || "").slice(0, 10) === todayKey;
      if (isToday) cur.todayCount += 1;
      if ((p.submittedAt || "") > cur.last) { cur.last = p.submittedAt; cur.latest = p; }
      m.set(p.departmentCode, cur);
    }
    return m;
  }, [photos, todayKey]);

  const list = useMemo(() => {
    const term = q.trim().toLowerCase();
    return depts
      .filter((d) => !term || d.code.toLowerCase().includes(term) || d.name.toLowerCase().includes(term))
      .map((d) => ({ ...d, shot: submitted.has(d.code), agg: byDept.get(d.code) }))
      .sort((a, b) => (a.shot !== b.shot ? (a.shot ? 1 : -1) : a.code.localeCompare(b.code)));
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [q, depts, today, byDept]);

  const openThumb = (p: PhotoItem | null | undefined, name: string) => {
    if (!p) return;
    setViewer({ list: [{ watermarkedPath: p.watermarkedPath, departmentCode: p.departmentCode, departmentName: name, areaName: p.areaName, reporterName: p.reporterName, submittedAt: p.submittedAt, submissionId: p.submissionId }], index: 0 });
  };

  return (
    <AppShell>
      <AppHeader title="Toàn cảnh hôm nay" subtitle={today?.date ?? ""} showHome />
      <div className="px-4 pb-6 flex flex-col gap-4">
        <div className="card p-4 flex items-center gap-4">
          <div className="text-[26px] font-extrabold leading-none">{loading ? "…" : submittedCount}<span className="text-ink-muted text-[15px] font-bold"> / {expected}</span></div>
          <div className="flex-1">
            <div className="text-[12.5px] text-ink-muted mb-1.5">phòng ban đã chụp · {pct}%</div>
            <div className="h-2 rounded-pill bg-surface overflow-hidden"><i className="block h-full rounded-pill bg-success" style={{ width: `${pct}%` }} /></div>
          </div>
        </div>

        <div className="flex items-center gap-2.5 rounded-[14px] bg-white border border-line px-3.5 h-12 shadow-e2">
          <Icon name="search" size={18} className="text-ink-muted" />
          <input value={q} onChange={(e) => setQ(e.target.value)} placeholder="Tìm phòng ban…" className="flex-1 bg-transparent outline-none text-[15px] placeholder:text-ink-disabled" />
          {q && <button onClick={() => setQ("")} className="text-ink-muted" aria-label="Xoá"><Icon name="x" size={16} /></button>}
        </div>

        {loading ? (
          <div className="text-ink-muted text-[14px] px-1">Đang tải…</div>
        ) : expected === 0 ? (
          <div className="card-flat p-8 text-center text-ink-muted text-[13px]">Chưa có phòng ban trong Config_Departments.</div>
        ) : (
          <div className="grid grid-cols-1 lg:grid-cols-2 gap-2.5">
            {list.map((d) => (
              <div key={d.code} className="card-flat p-3 flex items-center gap-3">
                {d.agg?.latest ? (
                  <button onClick={() => openThumb(d.agg!.latest, d.name)} className="w-14 h-14 rounded-[12px] overflow-hidden flex-none" aria-label="Xem ảnh mới nhất">
                    <Thumb path={d.agg.latest.watermarkedPath} className="w-full h-full rounded-[12px]" />
                  </button>
                ) : (
                  <span className="w-14 h-14 rounded-[12px] bg-surface grid place-items-center flex-none text-ink-disabled text-[10px] text-center">Chưa<br />có ảnh</span>
                )}
                <Link href={`/department/${encodeURIComponent(d.code)}`} className="flex-1 min-w-0">
                  <span className="flex items-center gap-2">
                    <span className={`w-2 h-2 rounded-full flex-none ${d.shot ? "bg-success" : "bg-danger"}`} />
                    <span className="font-bold text-[15px] leading-tight">{d.code}</span>
                  </span>
                  <span className="block text-[12px] text-ink-muted truncate">{d.name}</span>
                  <span className="block text-[11.5px] text-ink-muted mt-0.5">
                    {d.agg?.todayCount ? `${d.agg.todayCount} ảnh hôm nay` : "Chưa có ảnh hôm nay"}{d.agg?.last ? ` · cuối ${hhmm(d.agg.last)}` : ""}
                  </span>
                </Link>
                <Icon name="chevronRight" size={16} className="text-ink-disabled flex-none" />
              </div>
            ))}
            {list.length === 0 && <div className="px-4 py-6 text-center text-ink-muted text-[14px]">Không tìm thấy.</div>}
          </div>
        )}
      </div>
      {viewer && <PhotoViewerModal photos={viewer.list} index={viewer.index} onClose={() => setViewer(null)} onIndexChange={(i) => setViewer((v) => v && { ...v, index: i })} />}
    </AppShell>
  );
}

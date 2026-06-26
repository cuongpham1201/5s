"use client";

import Link from "next/link";
import { useEffect, useMemo, useState } from "react";
import { AppShell } from "@/components/layout/AppShell";
import { AppHeader } from "@/components/layout/AppHeader";
import { Thumb } from "@/components/media/Thumb";
import { PhotoViewerModal, type ViewerPhoto } from "@/components/media/PhotoViewerModal";

interface GalleryPhoto {
  submissionId: string;
  seqNo: number;
  watermarkedPath: string;
  departmentCode: string;
  areaName: string;
  reporterName?: string;
  submittedAt: string;
}

function fmt(iso?: string): string {
  if (!iso) return "—";
  const d = new Date(iso);
  if (Number.isNaN(d.getTime())) return iso;
  const p = (n: number) => String(n).padStart(2, "0");
  return `${p(d.getDate())}/${p(d.getMonth() + 1)} ${p(d.getHours())}:${p(d.getMinutes())}`;
}

export default function GalleryPage() {
  const [photos, setPhotos] = useState<GalleryPhoto[]>([]);
  const [loading, setLoading] = useState(true);
  const [viewer, setViewer] = useState<number | null>(null);
  const [dept, setDept] = useState("");
  const [deptName, setDeptName] = useState("");
  const [date, setDate] = useState("");
  const [area, setArea] = useState("");
  const [reporter, setReporter] = useState("");
  const [search, setSearch] = useState("");

  useEffect(() => {
    const sp = new URLSearchParams(window.location.search);
    const d = sp.get("departmentCode") ?? "";
    const dt = sp.get("date") ?? "";
    setDept(d); setDate(dt);
    if (d) {
      fetch("/api/config/departments").then((r) => (r.ok ? r.json() : null))
        .then((j) => setDeptName((j?.departments ?? []).find((x: { code: string; name: string }) => x.code === d)?.name ?? ""));
    }
    const url = d ? `/api/photos?limit=300&departmentCode=${encodeURIComponent(d)}` : "/api/photos?limit=200";
    fetch(url).then((r) => (r.ok ? r.json() : null)).then((j) => setPhotos(j?.photos ?? [])).finally(() => setLoading(false));
  }, []);

  const areaOptions = useMemo(() => [...new Set(photos.map((p) => p.areaName).filter(Boolean))].sort(), [photos]);
  const reporterOptions = useMemo(() => [...new Set(photos.map((p) => p.reporterName ?? "").filter(Boolean))].sort(), [photos]);

  const shown = useMemo(() => {
    const t = search.trim().toLowerCase();
    return photos.filter((p) => {
      if (date && (p.submittedAt || "").slice(0, 10) !== date) return false;
      if (area && p.areaName !== area) return false;
      if (reporter && (p.reporterName ?? "") !== reporter) return false;
      if (t && !(`${p.departmentCode} ${p.areaName} ${p.reporterName ?? ""}`.toLowerCase().includes(t))) return false;
      return true;
    });
  }, [photos, date, area, reporter, search]);

  const viewerPhotos: ViewerPhoto[] = shown.map((g) => ({
    watermarkedPath: g.watermarkedPath, departmentCode: g.departmentCode, departmentName: dept === g.departmentCode ? deptName : undefined,
    areaName: g.areaName, reporterName: g.reporterName, submittedAt: g.submittedAt, submissionId: g.submissionId,
  }));

  const title = dept ? `Ảnh 5S — ${dept}${deptName ? " · " + deptName : ""}` : "Gallery 5S";
  const hasFilter = !!(dept || date || area || reporter || search);

  return (
    <AppShell>
      <AppHeader title={title} subtitle={`${shown.length} ảnh`} showHome />
      <div className="px-4 pb-6">
        {/* Filters */}
        <div className="flex flex-wrap gap-2 mb-3">
          <input value={search} onChange={(e) => setSearch(e.target.value)} placeholder="Tìm phòng ban / khu vực / người chụp…" className="flex-1 min-w-[180px] rounded-md border border-line px-3 py-2 text-[14px]" />
          <select value={area} onChange={(e) => setArea(e.target.value)} className="rounded-md border border-line-strong px-2.5 py-2 text-[13px] bg-white">
            <option value="">Khu vực: tất cả</option>
            {areaOptions.map((a) => <option key={a} value={a}>{a}</option>)}
          </select>
          <select value={reporter} onChange={(e) => setReporter(e.target.value)} className="rounded-md border border-line-strong px-2.5 py-2 text-[13px] bg-white">
            <option value="">Người chụp: tất cả</option>
            {reporterOptions.map((r) => <option key={r} value={r}>{r}</option>)}
          </select>
          <input type="date" value={date} onChange={(e) => setDate(e.target.value)} className="rounded-md border border-line-strong px-2.5 py-2 text-[13px] bg-white" />
          {hasFilter && (
            <Link href="/gallery" onClick={() => { setDept(""); setDeptName(""); setDate(""); setArea(""); setReporter(""); setSearch(""); }} className="px-3 py-2 text-[13px] font-semibold text-primary-600">✕ Bỏ lọc</Link>
          )}
        </div>

        {loading ? (
          <div className="grid grid-cols-2 sm:grid-cols-3 lg:grid-cols-5 xl:grid-cols-6 gap-2.5">
            {Array.from({ length: 12 }).map((_, i) => <div key={i} className="aspect-square rounded-md bg-line/40 animate-pulse" />)}
          </div>
        ) : shown.length === 0 ? (
          <div className="card-flat p-10 text-center text-ink-muted text-[13px]">Không có ảnh phù hợp bộ lọc.</div>
        ) : (
          <div className="grid grid-cols-2 sm:grid-cols-4 lg:grid-cols-5 xl:grid-cols-6 gap-2.5">
            {shown.map((g, i) => (
              <button key={`${g.submissionId}-${g.seqNo}`} onClick={() => setViewer(i)} className="relative aspect-square rounded-lg overflow-hidden shadow-e2 text-left group">
                <Thumb path={g.watermarkedPath} alt={g.areaName} className="w-full h-full rounded-lg" />
                <div className="absolute inset-x-0 bottom-0 bg-gradient-to-t from-black/75 to-transparent text-white text-[10.5px] font-semibold px-2 pt-5 pb-1.5 pointer-events-none">
                  {g.departmentCode} · {g.areaName}
                  <span className="block font-normal opacity-90">{fmt(g.submittedAt)}</span>
                </div>
              </button>
            ))}
          </div>
        )}
      </div>
      {viewer != null && <PhotoViewerModal photos={viewerPhotos} index={viewer} onClose={() => setViewer(null)} onIndexChange={setViewer} />}
    </AppShell>
  );
}

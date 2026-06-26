"use client";

import Link from "next/link";
import { useEffect, useMemo, useState } from "react";
import { AppShell } from "@/components/layout/AppShell";
import { AppHeader } from "@/components/layout/AppHeader";
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
  const [failed, setFailed] = useState<Set<string>>(new Set());
  const [viewer, setViewer] = useState<number | null>(null);
  const [dept, setDept] = useState<string>("");
  const [deptName, setDeptName] = useState<string>("");
  const [date, setDate] = useState<string>("");

  useEffect(() => {
    // Read filters from the URL (client-only — avoids useSearchParams Suspense).
    const sp = new URLSearchParams(window.location.search);
    const d = sp.get("departmentCode") ?? "";
    const dt = sp.get("date") ?? "";
    setDept(d);
    setDate(dt);
    if (d) {
      fetch("/api/config/departments")
        .then((r) => (r.ok ? r.json() : null))
        .then((j) => setDeptName((j?.departments ?? []).find((x: { code: string; name: string }) => x.code === d)?.name ?? ""));
    }
    const url = d ? `/api/photos?limit=200&departmentCode=${encodeURIComponent(d)}` : "/api/photos?limit=120";
    fetch(url)
      .then((r) => (r.ok ? r.json() : null))
      .then((j) => setPhotos(j?.photos ?? []))
      .finally(() => setLoading(false));
  }, []);

  const shown = useMemo(() => {
    if (!date) return photos;
    return photos.filter((p) => (p.submittedAt || "").slice(0, 10) === date);
  }, [photos, date]);

  const viewerPhotos: ViewerPhoto[] = shown.map((g) => ({
    watermarkedPath: g.watermarkedPath,
    departmentCode: g.departmentCode,
    departmentName: dept === g.departmentCode ? deptName : undefined,
    areaName: g.areaName,
    reporterName: g.reporterName,
    submittedAt: g.submittedAt,
    submissionId: g.submissionId,
  }));

  const markFailed = (key: string) => setFailed((p) => new Set(p).add(key));
  const title = dept ? `Ảnh 5S — ${dept}${deptName ? " · " + deptName : ""}` : "Gallery 5S";

  return (
    <AppShell>
      <AppHeader title={title} subtitle={date ? `Ngày ${date}` : "Ảnh đã đồng bộ toàn công ty"} showHome />
      <div className="px-4 pb-6">
        {dept && (
          <div className="mb-3 flex items-center gap-2 text-[13px]">
            <span className="px-2.5 h-7 rounded-pill grid place-items-center bg-primary-100 text-primary-700 font-semibold">{dept}{date ? ` · ${date}` : ""}</span>
            <Link href="/gallery" className="text-primary-600 font-semibold">✕ Bỏ lọc</Link>
          </div>
        )}
        {loading ? (
          <div className="text-ink-muted text-[14px] px-1">Đang tải…</div>
        ) : shown.length === 0 ? (
          <div className="card-flat p-8 text-center text-ink-muted text-[13px]">Chưa có ảnh nào{dept ? ` cho ${dept}` : ""}.</div>
        ) : (
          <div className="grid grid-cols-2 sm:grid-cols-3 lg:grid-cols-5 xl:grid-cols-6 gap-2.5">
            {shown.map((g, i) => {
              const key = `${g.submissionId}-${g.seqNo}`;
              return (
                <button key={key} onClick={() => setViewer(i)} className="relative aspect-square rounded-md overflow-hidden shadow-e2 bg-surface text-left">
                  {failed.has(key) ? (
                    <div className="w-full h-full grid place-items-center text-center text-ink-muted p-2">
                      <span className="text-[11px] leading-tight">🖼️<br />Ảnh lỗi /<br />không tải được</span>
                    </div>
                  ) : (
                    // eslint-disable-next-line @next/next/no-img-element
                    <img src={`/api/photo?path=${encodeURIComponent(g.watermarkedPath)}`} alt={g.areaName} loading="lazy" onError={() => markFailed(key)} className="w-full h-full object-cover" />
                  )}
                  <div className="absolute inset-x-0 bottom-0 bg-gradient-to-t from-black/70 to-transparent text-white text-[10.5px] font-semibold px-2 pt-4 pb-1.5">
                    {g.departmentCode} · {g.areaName}
                    <span className="block font-normal opacity-90">{fmt(g.submittedAt)}</span>
                  </div>
                </button>
              );
            })}
          </div>
        )}
      </div>
      {viewer != null && (
        <PhotoViewerModal photos={viewerPhotos} index={viewer} onClose={() => setViewer(null)} onIndexChange={setViewer} />
      )}
    </AppShell>
  );
}

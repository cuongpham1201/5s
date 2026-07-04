"use client";

import Link from "next/link";
import { useEffect, useMemo, useState } from "react";
import { useParams } from "next/navigation";
import { AppShell } from "@/components/layout/AppShell";
import { AppHeader } from "@/components/layout/AppHeader";
import { Thumb } from "@/components/media/Thumb";
import { PhotoViewerModal, type ViewerPhoto } from "@/components/media/PhotoViewerModal";
import type { TodaySummary } from "@/lib/sharepoint/report-service";

interface Dept { code: string; name: string }
interface Area { code: string; name: string }
interface PhotoItem { submissionId: string; seqNo: number; watermarkedPath: string; departmentCode: string; areaName: string; reporterName?: string; submittedAt: string }

function hhmm(iso?: string): string {
  if (!iso) return "";
  const d = new Date(iso);
  return Number.isNaN(d.getTime()) ? "" : `${String(d.getHours()).padStart(2, "0")}:${String(d.getMinutes()).padStart(2, "0")}`;
}

export default function DepartmentPage() {
  const params = useParams();
  const code = decodeURIComponent(String(params.departmentCode ?? ""));
  const [name, setName] = useState("");
  const [areas, setAreas] = useState<Area[]>([]);
  const [today, setToday] = useState<TodaySummary | null>(null);
  const [photos, setPhotos] = useState<PhotoItem[]>([]);
  const [loading, setLoading] = useState(true);
  const [viewer, setViewer] = useState<number | null>(null);

  useEffect(() => {
    if (!code) return;
    let active = true;
    Promise.all([
      fetch("/api/config/departments").then((r) => (r.ok ? r.json() : null)),
      fetch(`/api/config/areas?departmentCode=${encodeURIComponent(code)}`).then((r) => (r.ok ? r.json() : null)),
      fetch("/api/reports/today").then((r) => (r.ok ? r.json() : null)),
      fetch(`/api/photos?limit=200&type=daily&departmentCode=${encodeURIComponent(code)}`).then((r) => (r.ok ? r.json() : null)),
    ]).then(([d, a, t, p]) => {
      if (!active) return;
      setName((d?.departments ?? []).find((x: Dept) => x.code === code)?.name ?? "");
      setAreas(a?.areas ?? []);
      setToday(t);
      setPhotos(p?.photos ?? []);
      setLoading(false);
    });
    return () => { active = false; };
  }, [code]);

  const todayKey = today?.date ?? "";
  const shot = (today?.submittedDepartmentCodes ?? []).includes(code);
  const todayPhotos = useMemo(() => photos.filter((p) => (p.submittedAt || "").slice(0, 10) === todayKey), [photos, todayKey]);
  const lastTime = photos[0]?.submittedAt;

  const viewerPhotos: ViewerPhoto[] = photos.map((p) => ({
    watermarkedPath: p.watermarkedPath, departmentCode: code, departmentName: name, areaName: p.areaName, reporterName: p.reporterName, submittedAt: p.submittedAt, submissionId: p.submissionId,
  }));

  return (
    <AppShell>
      <AppHeader title={code || "Phòng ban"} subtitle={name} showHome />
      <div className="px-4 pb-6 flex flex-col gap-4">
        <div className="card flex items-center gap-3">
          <span className={`w-11 h-11 rounded-[14px] grid place-items-center flex-none ${shot ? "bg-success-bg text-success" : "bg-danger-bg text-danger"}`}>{shot ? "✓" : "•"}</span>
          <div className="flex-1 min-w-0">
            <div className="text-[15px] font-bold leading-tight">{shot ? "Đã chụp hôm nay" : "Chưa chụp hôm nay"}</div>
            <div className="text-[12.5px] text-ink-muted mt-0.5">{todayPhotos.length} ảnh hôm nay · {photos.length} ảnh tổng{lastTime ? ` · cuối ${hhmm(lastTime)}` : ""}</div>
          </div>
          <Link href={`/gallery?departmentCode=${encodeURIComponent(code)}`} className="btn btn-secondary !min-h-9 text-[13px]">Gallery</Link>
        </div>

        <section>
          <div className="text-[14px] font-bold mb-2">Khu vực ({areas.length})</div>
          {areas.length === 0 ? (
            <div className="text-[13px] text-ink-muted">Chưa có khu vực.</div>
          ) : (
            <div className="flex flex-wrap gap-1.5">
              {areas.map((a) => <span key={a.code} className="px-3 h-8 rounded-pill grid place-items-center text-[12.5px] font-semibold bg-surface text-ink">{a.name}</span>)}
            </div>
          )}
        </section>

        <section>
          <div className="flex items-center justify-between mb-2">
            <span className="text-[14px] font-bold">Ảnh gần đây</span>
            <Link href={`/gallery?departmentCode=${encodeURIComponent(code)}`} className="text-[13px] font-semibold text-primary-600">Xem tất cả →</Link>
          </div>
          {loading ? (
            <div className="text-ink-muted text-[14px]">Đang tải…</div>
          ) : photos.length === 0 ? (
            <div className="card-flat p-8 text-center text-ink-muted text-[13px]">Chưa có ảnh nào.</div>
          ) : (
            <div className="grid grid-cols-3 sm:grid-cols-4 lg:grid-cols-6 gap-2.5">
              {photos.slice(0, 24).map((p, i) => (
                <button key={`${p.submissionId}-${p.seqNo}`} onClick={() => setViewer(i)} className="aspect-square rounded-md overflow-hidden shadow-e2">
                  <Thumb path={p.watermarkedPath} alt={p.areaName} className="w-full h-full rounded-md" />
                </button>
              ))}
            </div>
          )}
        </section>
      </div>
      {viewer != null && <PhotoViewerModal photos={viewerPhotos} index={viewer} onClose={() => setViewer(null)} onIndexChange={setViewer} />}
    </AppShell>
  );
}

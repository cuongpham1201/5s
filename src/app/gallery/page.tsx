"use client";

import { useEffect, useState } from "react";
import { AppShell } from "@/components/layout/AppShell";
import { AppHeader } from "@/components/layout/AppHeader";

interface GalleryPhoto {
  submissionId: string;
  seqNo: number;
  watermarkedPath: string;
  departmentCode: string;
  areaName: string;
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

  useEffect(() => {
    fetch("/api/photos?limit=120")
      .then((r) => (r.ok ? r.json() : null))
      .then((d) => setPhotos(d?.photos ?? []))
      .finally(() => setLoading(false));
  }, []);

  return (
    <AppShell>
      <AppHeader title="Gallery 5S" subtitle="Ảnh đã đồng bộ toàn công ty" />
      <div className="px-4 pb-6">
        {loading ? (
          <div className="text-ink-muted text-[14px] px-1">Đang tải…</div>
        ) : photos.length === 0 ? (
          <div className="card-flat p-8 text-center text-ink-muted text-[13px]">Chưa có ảnh nào.</div>
        ) : (
          <div className="grid grid-cols-2 sm:grid-cols-3 gap-2.5">
            {photos.map((g) => (
              <div key={`${g.submissionId}-${g.seqNo}`} className="relative aspect-square rounded-md overflow-hidden shadow-e2 bg-surface">
                {/* eslint-disable-next-line @next/next/no-img-element */}
                <img src={`/api/photo?path=${encodeURIComponent(g.watermarkedPath)}`} alt={g.areaName} loading="lazy" className="w-full h-full object-cover" />
                <div className="absolute inset-x-0 bottom-0 bg-gradient-to-t from-black/70 to-transparent text-white text-[10.5px] font-semibold px-2 pt-4 pb-1.5">
                  {g.departmentCode} · {g.areaName}
                  <span className="block font-normal opacity-90">{fmt(g.submittedAt)}</span>
                </div>
              </div>
            ))}
          </div>
        )}
      </div>
    </AppShell>
  );
}

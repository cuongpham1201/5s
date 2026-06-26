"use client";

import { useEffect, useState } from "react";
import { AdminShell } from "@/components/layout/AdminShell";

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
    fetch("/api/admin/photos?limit=120")
      .then((r) => (r.ok ? r.json() : null))
      .then((d) => setPhotos(d?.photos ?? []))
      .finally(() => setLoading(false));
  }, []);

  return (
    <AdminShell title="Thư viện ảnh" subtitle="Ảnh 5S đã đồng bộ từ SharePoint">
      {loading ? (
        <div className="bg-white rounded-lg border border-line shadow-e2 p-8 text-center text-ink-muted text-[14px]">Đang tải…</div>
      ) : photos.length === 0 ? (
        <div className="bg-white rounded-lg border border-line shadow-e2 p-10 text-center">
          <div className="text-[15px] font-semibold text-ink">Chưa có ảnh nào.</div>
          <div className="text-[13px] text-ink-muted mt-1">Ảnh sẽ hiển thị khi có lần gửi 5S được đồng bộ.</div>
        </div>
      ) : (
        <div className="grid grid-cols-2 sm:grid-cols-3 lg:grid-cols-5 gap-3.5">
          {photos.map((g) => (
            <div key={`${g.submissionId}-${g.seqNo}`} className="relative aspect-square rounded-md overflow-hidden shadow-e2 bg-surface">
              {/* eslint-disable-next-line @next/next/no-img-element */}
              <img src={`/api/photo?path=${encodeURIComponent(g.watermarkedPath)}`} alt={g.areaName} loading="lazy" className="w-full h-full object-cover" />
              <div className="absolute inset-x-0 bottom-0 bg-gradient-to-t from-black/70 to-transparent text-white text-[11px] font-semibold px-2.5 pt-4 pb-2">
                {g.departmentCode} · {g.areaName}
                <span className="block font-normal text-[10px] opacity-90">{fmt(g.submittedAt)}</span>
              </div>
            </div>
          ))}
        </div>
      )}
    </AdminShell>
  );
}

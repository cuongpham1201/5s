"use client";

import { useEffect, useState } from "react";
import { AdminShell } from "@/components/layout/AdminShell";

interface Latest { submissionId: string; departmentCode: string; areaName: string; photoCount: number; submittedAt: string }

function fmt(iso?: string): string {
  if (!iso) return "—";
  const d = new Date(iso);
  if (Number.isNaN(d.getTime())) return iso;
  const p = (n: number) => String(n).padStart(2, "0");
  return `${p(d.getDate())}/${p(d.getMonth() + 1)} ${p(d.getHours())}:${p(d.getMinutes())}`;
}

export default function GalleryPage() {
  const [latest, setLatest] = useState<Latest[]>([]);
  const [loading, setLoading] = useState(true);

  useEffect(() => {
    fetch("/api/admin/dashboard")
      .then((r) => (r.ok ? r.json() : null))
      .then((d) => setLatest(d?.latest ?? []))
      .finally(() => setLoading(false));
  }, []);

  return (
    <AdminShell title="Thư viện ảnh" subtitle="Các lần gửi gần đây">
      {loading ? (
        <div className="bg-white rounded-lg border border-line shadow-e2 p-8 text-center text-ink-muted text-[14px]">Đang tải…</div>
      ) : latest.length === 0 ? (
        <div className="bg-white rounded-lg border border-line shadow-e2 p-10 text-center">
          <div className="text-[15px] font-semibold text-ink">Chưa có ảnh nào.</div>
          <div className="text-[13px] text-ink-muted mt-1">Ảnh sẽ hiển thị khi có lần gửi 5S.</div>
        </div>
      ) : (
        <div className="bg-white rounded-lg border border-line shadow-e2">
          {latest.map((g) => (
            <div key={g.submissionId} className="flex items-center gap-3.5 px-5 py-3.5 border-b border-line last:border-0">
              <div className="flex-1 min-w-0">
                <div className="font-semibold">{g.departmentCode} · {g.areaName}</div>
                <div className="text-[13px] text-ink-muted">{fmt(g.submittedAt)} · {g.photoCount} ảnh</div>
              </div>
            </div>
          ))}
        </div>
      )}
    </AdminShell>
  );
}

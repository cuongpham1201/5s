"use client";

import { useEffect, useState } from "react";
import { AppShell } from "@/components/layout/AppShell";
import { AppHeader } from "@/components/layout/AppHeader";
import { StatusBadge } from "@/components/ui/StatusBadge";
import { MockPhoto } from "@/components/ui/MockPhoto";
import type { LatestSubmission } from "@/lib/sharepoint/report-service";

function photoSrc(path: string | null): string | null {
  return path ? `/api/photo?path=${encodeURIComponent(path)}` : null;
}

function fmt(iso?: string): string {
  if (!iso) return "—";
  const d = new Date(iso);
  if (Number.isNaN(d.getTime())) return iso;
  const p = (n: number) => String(n).padStart(2, "0");
  return `${p(d.getDate())}/${p(d.getMonth() + 1)}/${d.getFullYear()} ${p(d.getHours())}:${p(d.getMinutes())}`;
}

function syncTone(s: string): "success" | "warning" | "danger" | "neutral" {
  return s === "uploaded" ? "success" : s === "failed" ? "danger" : s === "uploading" ? "warning" : "neutral";
}
function syncLabel(s: string): string {
  return s === "uploaded" ? "Đã đồng bộ" : s === "failed" ? "Lỗi đồng bộ" : s === "uploading" ? "Đang đồng bộ" : "Chờ đồng bộ";
}

export default function HistoryPage() {
  const [subs, setSubs] = useState<LatestSubmission[] | null>(null);
  const [loading, setLoading] = useState(true);

  useEffect(() => {
    let active = true;
    fetch("/api/history/mine")
      .then((r) => (r.ok ? r.json() : null))
      .then((d) => active && setSubs(d?.submissions ?? []))
      .finally(() => active && setLoading(false));
    return () => {
      active = false;
    };
  }, []);

  return (
    <AppShell>
      <AppHeader title="Lịch sử của tôi" subtitle="Các lần gửi của bạn" />
      <div className="px-4 pb-6">
        {loading ? (
          <div className="text-ink-muted text-[14px] px-1">Đang tải…</div>
        ) : !subs || subs.length === 0 ? (
          <div className="card-flat p-8 text-center text-ink-muted">
            <div className="text-[15px] font-semibold text-ink">Bạn chưa có lần gửi nào.</div>
            <div className="text-[13px] mt-1">Chụp ảnh 5S để bắt đầu.</div>
          </div>
        ) : (
          <div className="flex flex-col gap-2.5">
            {subs.map((s) => (
              <div key={s.submissionId} className="card-flat p-3 flex items-center gap-3">
                {photoSrc(s.thumbnailPath) ? (
                  // eslint-disable-next-line @next/next/no-img-element
                  <img src={photoSrc(s.thumbnailPath)!} alt="" className="w-12 h-12 flex-none rounded-[10px] object-cover bg-surface" />
                ) : (
                  <MockPhoto className="w-12 h-12 flex-none" rounded="10px" />
                )}
                <div className="flex-1 min-w-0">
                  <div className="font-semibold text-[15px]">{s.departmentCode} · {s.areaName}</div>
                  <div className="text-[12px] text-ink-muted">{fmt(s.submittedAt)} · {s.photoCount} ảnh</div>
                </div>
                <StatusBadge tone={syncTone(s.syncStatus)}>{syncLabel(s.syncStatus)}</StatusBadge>
              </div>
            ))}
          </div>
        )}
      </div>
    </AppShell>
  );
}

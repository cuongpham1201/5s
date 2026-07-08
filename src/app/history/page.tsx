"use client";

import { useEffect, useMemo, useState } from "react";
import { AppShell } from "@/components/layout/AppShell";
import { AppHeader } from "@/components/layout/AppHeader";
import { StatusBadge } from "@/components/ui/StatusBadge";
import { MockPhoto } from "@/components/ui/MockPhoto";
import { PhotoViewerModal, type ViewerPhoto } from "@/components/media/PhotoViewerModal";
import { processQueue } from "@/lib/queue/sync-engine";
import { getQueue } from "@/lib/queue/offline-queue";
import { SyncErrorDetail } from "@/components/system/SyncErrorDetail";
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
  const [viewer, setViewer] = useState<number | null>(null);
  const [retrying, setRetrying] = useState(false);
  const [openDetail, setOpenDetail] = useState<string | null>(null);

  const load = () => fetch("/api/history/mine").then((r) => (r.ok ? r.json() : null)).then((d) => setSubs(d?.submissions ?? []));

  useEffect(() => {
    let active = true;
    fetch("/api/history/mine")
      .then((r) => (r.ok ? r.json() : null))
      .then((d) => active && setSubs(d?.submissions ?? []))
      .finally(() => active && setLoading(false));
    return () => { active = false; };
  }, []);

  const unsynced = (subs ?? []).filter((s) => s.syncStatus === "failed" || s.syncStatus === "uploading" || s.syncStatus === "queued").length;
  const [retryMsg, setRetryMsg] = useState<string | null>(null);
  const retry = async () => {
    setRetrying(true);
    setRetryMsg(null);
    try {
      // Honest retry: only items that are not flagged unrecoverable (local blob
      // gone) can be re-sent. processQueue({manual}) recovers stuck "uploading"
      // items and resets attempt counts; if nothing is recoverable, say so.
      const q = getQueue();
      const recoverable = q.filter((it) => !it.unrecoverable && (it.status === "queued" || it.status === "failed" || it.status === "uploading"));
      if (recoverable.length === 0) {
        setRetryMsg(q.some((it) => it.unrecoverable)
          ? "Một số lần gửi không thể đồng bộ lại (ảnh cục bộ đã mất). Vui lòng chụp lại."
          : "Không còn lần gửi nào cần đồng bộ.");
        return;
      }
      await processQueue({ manual: true });
      await load();
    } finally { setRetrying(false); }
  };

  // Only submissions with a watermarked thumbnail can be viewed full.
  const viewable = useMemo(() => (subs ?? []).filter((s) => s.thumbnailPath), [subs]);
  const viewerPhotos: ViewerPhoto[] = viewable.map((s) => ({
    watermarkedPath: s.thumbnailPath as string,
    departmentCode: s.departmentCode,
    areaName: s.areaName,
    reporterName: s.reporterName,
    submittedAt: s.submittedAt,
    submissionId: s.submissionId,
  }));
  const openViewer = (submissionId: string) => {
    const idx = viewable.findIndex((s) => s.submissionId === submissionId);
    if (idx >= 0) setViewer(idx);
  };

  return (
    <AppShell>
      <AppHeader title="Lịch sử của tôi" subtitle="Các lần gửi của bạn" showHome />
      <div className="px-4 pb-6">
        {unsynced > 0 && (
          <div className="mb-3 flex items-center gap-2.5 rounded-md bg-warning-bg text-warning px-3.5 py-2.5">
            <span className="flex-1 text-[13px] font-medium">{unsynced} lần gửi chưa đồng bộ xong.</span>
            <button onClick={retry} disabled={retrying} className="text-[13px] font-semibold underline">{retrying ? "Đang thử…" : "Thử đồng bộ lại"}</button>
          </div>
        )}
        {retryMsg && <div className="mb-3 rounded-md bg-info-bg text-info px-3.5 py-2.5 text-[13px] font-medium">{retryMsg}</div>}
        {loading ? (
          <div className="text-ink-muted text-[14px] px-1">Đang tải…</div>
        ) : !subs || subs.length === 0 ? (
          <div className="card-flat p-8 text-center text-ink-muted">
            <div className="text-[15px] font-semibold text-ink">Bạn chưa có lần gửi nào.</div>
            <div className="text-[13px] mt-1">Chụp ảnh 5S để bắt đầu.</div>
          </div>
        ) : (
          <div className="grid grid-cols-2 sm:grid-cols-3 lg:grid-cols-4 gap-3">
            {subs.map((s) => {
              const failed = s.syncStatus === "failed" || s.syncStatus === "uploading" || s.syncStatus === "queued";
              return (
                <div key={s.submissionId} className="card-flat p-0 overflow-hidden flex flex-col">
                  {photoSrc(s.thumbnailPath) ? (
                    <button onClick={() => openViewer(s.submissionId)} className="relative block w-full aspect-[4/3] bg-surface" aria-label="Xem ảnh">
                      {/* eslint-disable-next-line @next/next/no-img-element */}
                      <img src={photoSrc(s.thumbnailPath)!} alt="" loading="lazy" className="w-full h-full object-cover" />
                      {s.photoCount > 1 && (
                        <span className="absolute top-1.5 right-1.5 rounded-pill bg-black/60 text-white text-[11px] font-semibold px-1.5 py-0.5">{s.photoCount}</span>
                      )}
                    </button>
                  ) : (
                    <MockPhoto className="w-full aspect-[4/3]" rounded="0" />
                  )}
                  <div className="p-2.5 flex flex-col gap-1.5 flex-1">
                    <div className="font-semibold text-[13.5px] leading-tight truncate">{s.departmentCode} · {s.areaName}</div>
                    <div className="text-[11.5px] text-ink-muted">{fmt(s.submittedAt)}</div>
                    <div className="mt-auto"><StatusBadge tone={syncTone(s.syncStatus)}>{syncLabel(s.syncStatus)}</StatusBadge></div>
                    {failed && (
                      <button onClick={() => setOpenDetail(openDetail === s.submissionId ? null : s.submissionId)} className="text-left text-[11.5px] font-semibold text-primary-600">
                        {openDetail === s.submissionId ? "Ẩn chi tiết lỗi" : "Chi tiết lỗi"}
                      </button>
                    )}
                    {failed && openDetail === s.submissionId && <SyncErrorDetail submissionId={s.submissionId} />}
                  </div>
                </div>
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

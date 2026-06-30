"use client";

import { useCallback, useEffect, useState } from "react";
import { AppShell } from "@/components/layout/AppShell";
import { AppHeader } from "@/components/layout/AppHeader";
import { getQueue } from "@/lib/queue/offline-queue";
import { processQueue } from "@/lib/queue/sync-engine";
import { listCompletedSubmissions } from "@/lib/submissions/local-submission-store";
import { listPhotosBySubmission } from "@/lib/storage/photo-store";
import { AdminOnly } from "@/components/system/AdminOnly";
import type { QueueItem } from "@/lib/queue/queue-types";

export default function DebugSyncPage() {
  return <AdminOnly><DebugSyncInner /></AdminOnly>;
}

interface Row {
  submissionId: string;
  status: string;
  attempts: number;
  lastError?: string;
  updatedAt?: string;
  sessionPhotos: number;
  idbPhotos: number;
  bytes: { seq: number; original: number; watermarked: number; thumb: number; oType: string; wType: string }[];
  canBuildFormData: boolean;
}

function DebugSyncInner() {
  const [rows, setRows] = useState<Row[]>([]);
  const [loading, setLoading] = useState(true);
  const [busy, setBusy] = useState(false);

  const scan = useCallback(async () => {
    setLoading(true);
    const queue = getQueue();
    const completed = listCompletedSubmissions();
    const ids = Array.from(new Set([...queue.map((q) => q.submissionId), ...completed.map((c) => c.submissionId)]));
    const qById = new Map<string, QueueItem>(queue.map((q) => [q.submissionId, q]));
    const cById = new Map(completed.map((c) => [c.submissionId, c]));
    const out: Row[] = [];
    for (const id of ids) {
      const q = qById.get(id);
      const c = cById.get(id);
      const stored = await listPhotosBySubmission(id);
      const bytes = stored.map((p, i) => ({
        seq: i + 1,
        original: p.originalBlob?.size ?? 0,
        watermarked: p.watermarkedBlob?.size ?? 0,
        thumb: p.thumbnailBlob?.size ?? 0,
        oType: p.originalBlob?.type ?? "",
        wType: p.watermarkedBlob?.type ?? "",
      }));
      const canBuild = stored.some((p) => (p.originalBlob?.size ?? 0) > 0 && (p.watermarkedBlob?.size ?? 0) > 0);
      out.push({
        submissionId: id,
        status: q?.status ?? (c ? c.status : "—"),
        attempts: q?.attemptCount ?? 0,
        lastError: q?.lastError,
        updatedAt: q?.updatedAt ?? q?.lastAttemptAt,
        sessionPhotos: c?.photos.length ?? 0,
        idbPhotos: stored.length,
        bytes,
        canBuildFormData: canBuild,
      });
    }
    out.sort((a, b) => (b.updatedAt ?? "").localeCompare(a.updatedAt ?? ""));
    setRows(out);
    setLoading(false);
  }, []);

  useEffect(() => { void scan(); }, [scan]);

  const forceSync = async () => { setBusy(true); try { await processQueue({ manual: true }); await scan(); } finally { setBusy(false); } };

  return (
    <AppShell>
      <AppHeader title="Debug đồng bộ" subtitle="Local queue + IndexedDB (chỉ thiết bị này)" showHome />
      <div className="px-4 pb-6">
        <div className="flex gap-2 mb-3">
          <button onClick={scan} className="btn btn-secondary !min-h-10">Quét lại</button>
          <button onClick={forceSync} disabled={busy} className="btn btn-primary !min-h-10">{busy ? "Đang đồng bộ…" : "Ép đồng bộ"}</button>
        </div>
        {loading ? (
          <div className="text-ink-muted text-[14px]">Đang quét…</div>
        ) : rows.length === 0 ? (
          <div className="card-flat p-8 text-center text-ink-muted text-[13px]">Không có dữ liệu cục bộ (queue + IndexedDB trống).</div>
        ) : (
          <div className="flex flex-col gap-2.5">
            {rows.map((r) => (
              <div key={r.submissionId} className="card-flat p-3 text-[12.5px]">
                <div className="flex items-center justify-between gap-2">
                  <span className="font-mono text-[11px] break-all">{r.submissionId}</span>
                  <span className={`text-[11px] font-bold px-2 h-6 rounded-pill grid place-items-center ${r.status === "uploaded" ? "bg-success-bg text-success" : r.status === "failed" ? "bg-danger-bg text-danger" : "bg-warning-bg text-warning"}`}>{r.status}</span>
                </div>
                <div className="mt-1 grid grid-cols-2 gap-x-4 gap-y-0.5 text-ink-muted">
                  <div>attempts: <b className="text-ink">{r.attempts}</b></div>
                  <div>updatedAt: <b className="text-ink">{r.updatedAt ?? "—"}</b></div>
                  <div>session photos: <b className="text-ink">{r.sessionPhotos}</b></div>
                  <div>IndexedDB photos: <b className="text-ink">{r.idbPhotos}</b></div>
                  <div>canBuildFormData: <b className={r.canBuildFormData ? "text-success" : "text-danger"}>{String(r.canBuildFormData)}</b></div>
                </div>
                {r.bytes.length > 0 && (
                  <div className="mt-1 font-mono text-[11px] text-ink-muted">
                    {r.bytes.map((b) => <div key={b.seq}>#{b.seq} orig {b.original}B/{b.oType || "?"} · wm {b.watermarked}B/{b.wType || "?"} · thumb {b.thumb}B</div>)}
                  </div>
                )}
                {r.lastError && <div className="mt-1.5 rounded bg-danger-bg text-danger px-2 py-1.5 break-words"><b>lastError:</b> {r.lastError}</div>}
              </div>
            ))}
          </div>
        )}
      </div>
    </AppShell>
  );
}

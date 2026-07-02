"use client";

import { useEffect, useState } from "react";
import { findBySubmission } from "@/lib/queue/offline-queue";
import { getCompletedSubmissionById } from "@/lib/submissions/local-submission-store";
import { listPhotosBySubmission } from "@/lib/storage/photo-store";

interface Detail {
  status: string; attempts: number; lastError?: string; updatedAt?: string;
  sessionPhotos: number; idbPhotos: number;
  bytes: { seq: number; original: number; watermarked: number }[];
}

/** Lazy local-sync diagnostics for one submission (no secrets). */
export function SyncErrorDetail({ submissionId }: { submissionId: string }) {
  const [d, setD] = useState<Detail | null>(null);

  useEffect(() => {
    let active = true;
    (async () => {
      const q = findBySubmission(submissionId);
      const c = getCompletedSubmissionById(submissionId);
      const stored = await listPhotosBySubmission(submissionId);
      if (!active) return;
      setD({
        status: q?.status ?? (c?.status ?? "—"),
        attempts: q?.attemptCount ?? 0,
        lastError: q?.lastError,
        updatedAt: q?.updatedAt ?? q?.lastAttemptAt,
        sessionPhotos: c?.photos.length ?? 0,
        idbPhotos: stored.length,
        bytes: stored.map((p, i) => ({ seq: i + 1, original: p.originalBuffer?.byteLength ?? p.originalBlob?.size ?? 0, watermarked: p.watermarkedBuffer?.byteLength ?? p.watermarkedBlob?.size ?? 0 })),
      });
    })();
    return () => { active = false; };
  }, [submissionId]);

  if (!d) return <div className="mt-2 text-[12px] text-ink-muted">Đang tải chi tiết…</div>;
  return (
    <div className="mt-2 rounded-md bg-surface p-2.5 text-[12px] text-ink-muted">
      <div className="font-mono text-[11px] break-all">{submissionId}</div>
      <div className="grid grid-cols-2 gap-x-3 gap-y-0.5 mt-1">
        <div>queue: <b className="text-ink">{d.status}</b></div>
        <div>attempts: <b className="text-ink">{d.attempts}</b></div>
        <div>session photos: <b className="text-ink">{d.sessionPhotos}</b></div>
        <div>local blobs: <b className="text-ink">{d.idbPhotos}</b></div>
        {d.updatedAt && <div className="col-span-2">updatedAt: <b className="text-ink">{d.updatedAt}</b></div>}
      </div>
      {d.bytes.length > 0 && (
        <div className="mt-1 font-mono text-[11px]">{d.bytes.map((b) => <div key={b.seq}>#{b.seq} orig {b.original}B · wm {b.watermarked}B</div>)}</div>
      )}
      {d.idbPhotos === 0 && <div className="mt-1 text-danger">Không còn ảnh cục bộ — phải chụp lại.</div>}
      {d.lastError && <div className="mt-1.5 rounded bg-danger-bg text-danger px-2 py-1.5 break-words"><b>lastError:</b> {d.lastError}</div>}
    </div>
  );
}

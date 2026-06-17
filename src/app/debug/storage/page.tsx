"use client";

import { useCallback, useEffect, useState } from "react";
import Link from "next/link";
import { AppShell } from "@/components/layout/AppShell";
import { Card, InfoRow } from "@/components/ui/Card";
import {
  clearCurrentSession,
  getCurrentSession,
  listCompletedSubmissions,
} from "@/lib/submissions/local-submission-store";
import { clearQueue, getQueue } from "@/lib/queue/offline-queue";
import { clearAllPhotos, getStorageUsage } from "@/lib/storage/photo-store";
import type { CompletedSubmission, SubmissionSession } from "@/types/submission";
import type { QueueItem } from "@/lib/queue/queue-types";
import type { StorageUsage } from "@/lib/storage/storage-types";

const IS_DEV = process.env.NODE_ENV !== "production";

function fmtBytes(n: number): string {
  if (!n) return "0";
  const u = ["B", "KB", "MB", "GB"];
  const i = Math.min(u.length - 1, Math.floor(Math.log(n) / Math.log(1024)));
  return `${(n / Math.pow(1024, i)).toFixed(1)} ${u[i]}`;
}

export default function DebugStoragePage() {
  const [session, setSession] = useState<SubmissionSession | null>(null);
  const [history, setHistory] = useState<CompletedSubmission[]>([]);
  const [queue, setQueue] = useState<QueueItem[]>([]);
  const [usage, setUsage] = useState<StorageUsage>({ usageBytes: 0, quotaBytes: 0, photoCount: 0 });

  const refresh = useCallback(async () => {
    if (!IS_DEV) return;
    setSession(getCurrentSession());
    setHistory(listCompletedSubmissions());
    setQueue(getQueue());
    setUsage(await getStorageUsage());
  }, []);

  useEffect(() => {
    void refresh();
  }, [refresh]);

  if (!IS_DEV) {
    return (
      <AppShell showNav={false}>
        <div className="flex-1 grid place-items-center text-center p-8">
          <p className="text-ink-muted">Trang debug chỉ khả dụng ở chế độ phát triển.</p>
        </div>
      </AppShell>
    );
  }

  return (
    <AppShell showNav={false}>
      <div className="flex items-center gap-3 px-5 pt-3 pb-3">
        <Link href="/" className="w-10 h-10 rounded-pill grid place-items-center text-xl bg-surface">
          ←
        </Link>
        <div className="text-[18px] font-semibold">Debug · Storage</div>
        <button onClick={() => void refresh()} className="ml-auto btn btn-ghost !min-h-9">
          ↻ Làm mới
        </button>
      </div>

      <div className="flex-1 px-5 pb-8 overflow-y-auto">
        <Card>
          <InfoRow label="IndexedDB photos" value={`${usage.photoCount} ảnh`} />
          <InfoRow label="Storage usage" value={fmtBytes(usage.usageBytes)} />
          <InfoRow label="Storage quota" value={usage.quotaBytes ? fmtBytes(usage.quotaBytes) : "—"} />
        </Card>

        <div className="text-[13px] font-semibold text-ink-muted mt-5 mb-2">Current Session</div>
        <Card>
          {session ? (
            <>
              <InfoRow label="sessionId" value={session.sessionId} />
              <InfoRow label="Đơn vị · Khu vực" value={`${session.departmentCode} · ${session.areaName}`} />
              <InfoRow label="Số ảnh (draft)" value={`${session.photos.length}`} />
            </>
          ) : (
            <div className="text-ink-muted text-[14px]">Không có session đang soạn.</div>
          )}
        </Card>

        <div className="text-[13px] font-semibold text-ink-muted mt-5 mb-2">
          Completed Submissions ({history.length})
        </div>
        <Card>
          {history.length === 0 ? (
            <div className="text-ink-muted text-[14px]">Trống.</div>
          ) : (
            history.slice(0, 10).map((h) => (
              <InfoRow key={h.submissionId} label={`${h.departmentCode} · ${h.areaName}`} value={`${h.photoCount} ảnh`} />
            ))
          )}
        </Card>

        <div className="text-[13px] font-semibold text-ink-muted mt-5 mb-2">
          Queue Items ({queue.length})
        </div>
        <Card>
          {queue.length === 0 ? (
            <div className="text-ink-muted text-[14px]">Trống.</div>
          ) : (
            queue.slice(0, 10).map((q) => (
              <InfoRow key={q.queueId} label={q.submissionId} value={`${q.status} · thử ${q.attemptCount}`} />
            ))
          )}
        </Card>

        <div className="flex flex-col gap-2.5 mt-6">
          <button
            className="btn btn-secondary"
            onClick={async () => {
              clearCurrentSession();
              await refresh();
            }}
          >
            Clear Session
          </button>
          <button
            className="btn btn-secondary"
            onClick={async () => {
              clearQueue();
              await refresh();
            }}
          >
            Clear Queue
          </button>
          <button
            className="btn btn-danger"
            onClick={async () => {
              await clearAllPhotos();
              await refresh();
            }}
          >
            Clear IndexedDB (ảnh)
          </button>
        </div>
        <p className="text-[12px] text-ink-disabled mt-4 text-center">
          Trang dev-only — không xuất hiện trong điều hướng production.
        </p>
      </div>
    </AppShell>
  );
}

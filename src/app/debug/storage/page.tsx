"use client";

import { useCallback, useEffect, useState, type ReactNode } from "react";
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
import { auditLocalStorage, type LocalStorageAudit } from "@/lib/storage/storage-audit";
import { generateMockPhotos } from "@/lib/storage/stress-test";
import type { CompletedSubmission, SubmissionSession } from "@/types/submission";
import type { QueueItem } from "@/lib/queue/queue-types";
import type { StorageUsage } from "@/lib/storage/storage-types";
import { AdminOnly } from "@/components/system/AdminOnly";

const IS_DEV = process.env.NODE_ENV !== "production";

export default function DebugStoragePage() {
  return <AdminOnly><DebugStorageInner /></AdminOnly>;
}

function fmtBytes(n: number): string {
  if (!n) return "0";
  const u = ["B", "KB", "MB", "GB"];
  const i = Math.min(u.length - 1, Math.floor(Math.log(n) / Math.log(1024)));
  return `${(n / Math.pow(1024, i)).toFixed(1)} ${u[i]}`;
}

function Indicator({ ok, warn, children }: { ok?: boolean; warn?: boolean; children: ReactNode }) {
  const sym = warn ? "⚠" : ok ? "✓" : "✗";
  const cls = warn ? "text-warning" : ok ? "text-success" : "text-danger";
  return (
    <div className={`flex items-start gap-2 text-[14px] font-semibold ${cls}`}>
      <span>{sym}</span>
      <span className="text-ink">{children}</span>
    </div>
  );
}

function DebugStorageInner() {
  const [session, setSession] = useState<SubmissionSession | null>(null);
  const [history, setHistory] = useState<CompletedSubmission[]>([]);
  const [queue, setQueue] = useState<QueueItem[]>([]);
  const [usage, setUsage] = useState<StorageUsage>({ usageBytes: 0, quotaBytes: 0, photoCount: 0 });
  const [ls, setLs] = useState<LocalStorageAudit>({ available: false, totalBytes: 0, keys: [], imagePayloads: [] });
  const [busy, setBusy] = useState(false);

  const refresh = useCallback(async () => {
    if (!IS_DEV) return;
    setSession(getCurrentSession());
    setHistory(listCompletedSubmissions());
    setQueue(getQueue());
    setUsage(await getStorageUsage());
    setLs(auditLocalStorage());
  }, []);

  useEffect(() => {
    void refresh();
  }, [refresh]);

  const runStress = async (n: number) => {
    setBusy(true);
    try {
      await generateMockPhotos(n);
      await refresh();
    } finally {
      setBusy(false);
    }
  };

  if (!IS_DEV) {
    return (
      <AppShell showNav={false}>
        <div className="flex-1 grid place-items-center text-center p-8">
          <p className="text-ink-muted">Trang debug chỉ khả dụng ở chế độ phát triển.</p>
        </div>
      </AppShell>
    );
  }

  const pending = queue.filter((q) => q.status === "queued" || q.status === "uploading").length;
  const failed = queue.filter((q) => q.status === "failed").length;
  const noImagePayloads = ls.imagePayloads.length === 0;

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
        {/* Audit indicators */}
        <div className="text-[13px] font-semibold text-ink-muted mb-2">Kết quả kiểm tra</div>
        <Card>
          <div className="flex flex-col gap-2.5">
            <Indicator ok={usage.photoCount >= 0}>Ảnh lưu trong IndexedDB ({usage.photoCount} ảnh)</Indicator>
            <Indicator ok={noImagePayloads}>
              {noImagePayloads
                ? "Không có image payload trong localStorage"
                : `Có ${ls.imagePayloads.length} key chứa image payload trong localStorage`}
            </Indicator>
            {pending > 0 ? (
              <Indicator warn>{pending} lần gửi đang chờ đồng bộ</Indicator>
            ) : (
              <Indicator ok>Không có lần gửi đang chờ</Indicator>
            )}
            {failed > 0 && <Indicator>{failed} lần gửi lỗi đồng bộ</Indicator>}
          </div>
        </Card>

        {/* Sizes */}
        <div className="text-[13px] font-semibold text-ink-muted mt-5 mb-2">Dung lượng</div>
        <Card>
          <InfoRow label="localStorage (ước tính)" value={fmtBytes(ls.totalBytes)} />
          <InfoRow label="IndexedDB photos" value={`${usage.photoCount} ảnh`} />
          <InfoRow label="Storage usage (origin)" value={fmtBytes(usage.usageBytes)} />
          <InfoRow label="Storage quota" value={usage.quotaBytes ? fmtBytes(usage.quotaBytes) : "—"} />
        </Card>

        {/* Counts */}
        <div className="text-[13px] font-semibold text-ink-muted mt-5 mb-2">Bản ghi</div>
        <Card>
          <InfoRow label="Session (draft)" value={session ? `${session.photos.length} ảnh` : "không có"} />
          <InfoRow label="Completed submissions" value={`${history.length}`} />
          <InfoRow label="Queue items" value={`${queue.length}`} />
        </Card>

        {/* localStorage keys */}
        <div className="text-[13px] font-semibold text-ink-muted mt-5 mb-2">localStorage keys</div>
        <Card>
          {ls.keys.length === 0 ? (
            <div className="text-ink-muted text-[14px]">Trống.</div>
          ) : (
            ls.keys.slice(0, 12).map((k) => <InfoRow key={k.key} label={k.key} value={fmtBytes(k.bytes)} />)
          )}
        </Card>

        {/* Stress test */}
        <div className="text-[13px] font-semibold text-ink-muted mt-5 mb-2">Stress test (dev)</div>
        <Card>
          <p className="text-[13px] text-ink-muted mb-3">
            Tạo ảnh mô phỏng vào IndexedDB để đo tăng trưởng dung lượng + hàng đợi.
          </p>
          <div className="flex gap-2.5">
            {[5, 10, 20].map((n) => (
              <button
                key={n}
                disabled={busy}
                onClick={() => void runStress(n)}
                className={`btn btn-secondary flex-1 ${busy ? "opacity-50 pointer-events-none" : ""}`}
              >
                +{n} ảnh
              </button>
            ))}
          </div>
          {busy && <div className="text-ink-muted text-[13px] mt-3 text-center">Đang tạo ảnh test…</div>}
        </Card>

        {/* Clear actions */}
        <div className="flex flex-col gap-2.5 mt-6">
          <button className="btn btn-secondary" onClick={async () => { clearCurrentSession(); await refresh(); }}>
            Clear Session
          </button>
          <button className="btn btn-secondary" onClick={async () => { clearQueue(); await refresh(); }}>
            Clear Queue
          </button>
          <button className="btn btn-danger" onClick={async () => { await clearAllPhotos(); await refresh(); }}>
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

"use client";

import Link from "next/link";
import { useEffect, useState } from "react";
import { AppShell } from "@/components/layout/AppShell";
import { Card, InfoRow } from "@/components/ui/Card";
import { useSessionCapture } from "@/features/capture/session-context";
import { findBySubmission } from "@/lib/queue/offline-queue";
import { processQueue } from "@/lib/queue/sync-engine";
import { getCompletedSubmissionById, getUploadResult, listCompletedSubmissions, type StoredUploadResult } from "@/lib/submissions/local-submission-store";
import type { CompletedSubmission } from "@/types/submission";
import type { QueueStatus } from "@/lib/queue/queue-types";

function fmt(iso?: string): string {
  if (!iso) return "—";
  const d = new Date(iso);
  const p = (n: number) => String(n).padStart(2, "0");
  return `${p(d.getHours())}:${p(d.getMinutes())} · ${p(d.getDate())}/${p(d.getMonth() + 1)}/${d.getFullYear()}`;
}

const STATUS_UI: Record<string, { icon: string; title: string; cls: string; note: string }> = {
  uploaded: { icon: "✓", title: "Đã nộp và đồng bộ thành công", cls: "bg-success-bg text-success", note: "Ảnh đã được lưu lên SharePoint." },
  uploading: { icon: "↻", title: "Đang đồng bộ SharePoint…", cls: "bg-info-bg text-info", note: "Vui lòng giữ kết nối mạng." },
  failed: { icon: "!", title: "Đồng bộ lỗi, sẽ thử lại", cls: "bg-danger-bg text-danger", note: "Ảnh vẫn được lưu trên máy để gửi lại." },
  queued: { icon: "⏳", title: "Đã lưu và chờ đồng bộ", cls: "bg-warning-bg text-warning", note: "Sẽ tự đồng bộ khi có mạng." },
};

export default function SuccessPage() {
  const { lastCompleted } = useSessionCapture();
  const [s, setS] = useState<CompletedSubmission | null>(lastCompleted);
  const [status, setStatus] = useState<QueueStatus>("queued");
  const [result, setResult] = useState<StoredUploadResult | null>(null);
  const [retrying, setRetrying] = useState(false);

  // lastCompleted lives only in memory; on a PWA reload it's null. Recover the
  // record from local history (by stored id, else newest) so the success page
  // never shows "— / 0 ảnh" for a real submission.
  useEffect(() => {
    if (lastCompleted) { setS(lastCompleted); return; }
    let id: string | null = null;
    try { id = window.localStorage.getItem("5s.lastCompletedId"); } catch { /* ignore */ }
    const recovered = (id && getCompletedSubmissionById(id)) || listCompletedSubmissions()[0] || null;
    setS(recovered);
  }, [lastCompleted]);

  useEffect(() => {
    if (!s) return;
    const tick = () => {
      const q = findBySubmission(s.submissionId);
      if (q) setStatus(q.status);
      setResult(getUploadResult(s.submissionId));
    };
    tick();
    const iv = setInterval(tick, 1500);
    const stop = setTimeout(() => clearInterval(iv), 45000);
    return () => { clearInterval(iv); clearTimeout(stop); };
  }, [s]);

  const retry = async () => {
    setRetrying(true);
    try { await processQueue({ manual: true }); } finally { setRetrying(false); }
  };

  const ui = STATUS_UI[status] ?? STATUS_UI.queued;

  return (
    <AppShell showNav={false}>
      <div className="flex-1 flex flex-col items-center justify-center text-center p-8 gap-2">
        <div className={`w-[120px] h-[120px] rounded-pill grid place-items-center text-[64px] mb-3 ${ui.cls}`}>
          {ui.icon}
        </div>
        <div className="text-[24px] font-bold">{ui.title}</div>
        <p className="text-ink-muted">
          {s ? <>Đã nộp <b>{s.photoCount} ảnh</b> cho lần gửi này. {ui.note}</> : "Lần gửi của bạn đã được lưu."}
        </p>

        <Card className="mt-6 w-full text-left">
          <InfoRow label="Đơn vị" value={s?.departmentCode ?? "—"} />
          <InfoRow label="Khu vực" value={s?.areaName ?? "—"} />
          {s?.checkItemName && <InfoRow label="Hạng mục" value={s.checkItemName} />}
          <InfoRow label="Số ảnh" value={`${s?.photoCount ?? 0} ảnh`} />
          {result && <InfoRow label="Đã gửi thành công" value={`${result.uploadedPhotoCount} ảnh`} />}
          {result && result.failedPhotoCount > 0 && <InfoRow label="Ảnh lỗi" value={`${result.failedPhotoCount} ảnh`} />}
          <InfoRow label="Thời gian nộp" value={fmt(s?.submittedAt)} />
          <InfoRow label="Đồng bộ" value={ui.title} />
        </Card>

        {result && result.errors.length > 0 && (
          <div className="mt-3 w-full rounded-md bg-danger-bg text-danger px-3.5 py-2.5 text-left text-[13px]">
            <div className="font-semibold mb-1">Chi tiết ảnh lỗi:</div>
            <ul className="list-disc pl-5 space-y-0.5">
              {result.errors.map((e, i) => (
                <li key={i}>Ảnh #{e.seqNo}: {e.message} <span className="opacity-70">({e.errorCode})</span></li>
              ))}
            </ul>
          </div>
        )}

        <div className="w-full flex flex-col gap-3 mt-8">
          {status === "failed" && (
            <button onClick={retry} disabled={retrying} className="btn btn-secondary btn-block">
              {retrying ? "Đang thử lại…" : "↻ Thử đồng bộ lại"}
            </button>
          )}
          <Link href="/capture" className="btn btn-primary btn-lg btn-block">+ Chụp phiên mới</Link>
          <div className="flex gap-3">
            <Link href="/dashboard" className="btn btn-secondary btn-block flex-1">Về trang chủ</Link>
            <Link href="/history" className="btn btn-ghost btn-block flex-1">Xem lịch sử</Link>
          </div>
        </div>
      </div>
    </AppShell>
  );
}

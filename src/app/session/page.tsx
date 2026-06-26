"use client";

import Link from "next/link";
import { useRouter } from "next/navigation";
import { useEffect, useState } from "react";
import { AppShell } from "@/components/layout/AppShell";
import { InfoRow } from "@/components/ui/Card";
import { PhotoThumb } from "@/components/media/PhotoThumb";
import { useSessionCapture } from "@/features/capture/session-context";
import * as store from "@/lib/submissions/local-submission-store";

function fmt(iso: string): string {
  const d = new Date(iso);
  const p = (n: number) => String(n).padStart(2, "0");
  return `${p(d.getHours())}:${p(d.getMinutes())} · ${p(d.getDate())}/${p(d.getMonth() + 1)}/${d.getFullYear()}`;
}

export default function SessionPage() {
  const router = useRouter();
  const { hydrated, session, removePhoto, clearSession, completeSession } = useSessionCapture();
  const [confirming, setConfirming] = useState(false);

  // Temporary capture-flow diagnostics (no secrets).
  useEffect(() => {
    if (!hydrated) return;
    console.warn("[5s-debug]", "session.mount", {
      hydrated,
      hasSession: !!session,
      sessionId: session?.sessionId ?? null,
      photoCount: session?.photos.length ?? 0,
      lsSessionExists: !!store.getCurrentSession(),
      lsCompletedCount: store.listCompletedSubmissions().length,
    });
  }, [hydrated, session]);

  if (!hydrated) {
    return (
      <AppShell showNav={false}>
        <div className="flex-1 grid place-items-center text-ink-muted text-[14px]">Đang tải phiên chụp…</div>
      </AppShell>
    );
  }

  if (!session) {
    return (
      <AppShell showNav={false}>
        <div className="flex-1 flex flex-col items-center justify-center text-center px-8 gap-2">
          <div className="text-6xl mb-1">📷</div>
          <div className="text-[18px] font-semibold">Chưa có lần gửi nào</div>
          <p className="text-ink-muted">Bắt đầu một lần gửi mới để chụp ảnh.</p>
          <Link href="/capture" className="btn btn-primary btn-lg mt-4">
            Bắt đầu chụp
          </Link>
        </div>
      </AppShell>
    );
  }

  const photos = session.photos;
  const withGps = photos.filter((p) => p.latitude != null).length;

  const submit = () => {
    const completed = completeSession();
    if (completed) router.push("/success");
  };

  return (
    <AppShell showNav={false}>
      <div className="flex items-center gap-3 px-5 pt-3 pb-3">
        <Link href="/" className="w-10 h-10 rounded-pill grid place-items-center text-xl bg-surface">
          ←
        </Link>
        <div className="flex-1">
          <div className="text-[18px] font-semibold">Xem lại lần gửi</div>
          <div className="text-[13px] text-ink-muted">
            {session.departmentCode} · {session.areaName} · {session.reporterName}
          </div>
        </div>
        <span className="badge badge-info">{photos.length} ảnh</span>
      </div>

      {photos.length === 0 ? (
        <div className="flex-1 flex flex-col items-center justify-center text-center px-8 gap-2">
          <div className="text-6xl mb-1">🖼️</div>
          <div className="text-[18px] font-semibold">Chưa có ảnh trong lần gửi</div>
          <p className="text-ink-muted">Chụp ảnh đầu tiên để thêm vào lần gửi này.</p>
          <Link href="/camera" className="btn btn-primary btn-lg mt-4">
            Chụp ảnh
          </Link>
        </div>
      ) : (
        <>
          <div className="flex-1 px-5 pb-4 overflow-y-auto">
            <div className="grid grid-cols-2 gap-3">
              {photos.map((p, i) => (
                <div key={p.photoId} className="relative rounded-md overflow-hidden shadow-e2 bg-surface">
                  <PhotoThumb photoId={p.photoId} alt={`Ảnh ${i + 1}`} className="aspect-square w-full object-cover" />
                  <span className="absolute left-1.5 top-1.5 bg-black/50 text-white text-[10px] px-1.5 py-0.5 rounded">
                    #{i + 1}
                  </span>
                  <button
                    onClick={() => removePhoto(p.photoId)}
                    aria-label="Xoá ảnh"
                    className="absolute right-1.5 top-1.5 w-7 h-7 rounded-pill grid place-items-center bg-black/55 text-white text-sm active:scale-90"
                  >
                    ✕
                  </button>
                </div>
              ))}

              <Link
                href="/camera"
                className="aspect-square rounded-md border-[1.5px] border-dashed border-line-strong grid place-items-center text-center text-ink-muted"
              >
                <span>
                  <span className="block text-3xl">＋</span>
                  <span className="text-[13px] font-semibold">Chụp thêm</span>
                </span>
              </Link>
            </div>

            <button onClick={clearSession} className="mt-4 w-full text-center text-[13px] font-semibold text-danger py-2">
              Huỷ lần gửi & bắt đầu lại
            </button>
          </div>

          <div className="px-5 py-4 pb-[calc(16px+env(safe-area-inset-bottom))] border-t border-line flex gap-2.5">
            <Link href="/camera" className="btn btn-secondary btn-lg flex-1">
              + Chụp thêm
            </Link>
            <button
              onClick={() => setConfirming(true)}
              disabled={photos.length === 0}
              className={`btn btn-primary btn-lg flex-1 ${photos.length === 0 ? "opacity-50 pointer-events-none" : ""}`}
            >
              Hoàn tất ({photos.length})
            </button>
          </div>
        </>
      )}

      {confirming && (
        <div className="absolute inset-0 z-50 flex flex-col justify-end bg-black/40" onClick={() => setConfirming(false)}>
          <div
            className="bg-white rounded-t-xl p-5 pb-[calc(20px+env(safe-area-inset-bottom))]"
            onClick={(e) => e.stopPropagation()}
          >
            <div className="text-[18px] font-semibold mb-2">Xác nhận nộp</div>
            <div className="card-flat px-4">
              <InfoRow label="Phòng ban" value={`${session.departmentCode}${session.departmentName ? " · " + session.departmentName : ""}`} />
              <InfoRow label="Khu vực" value={session.areaName} />
              <InfoRow label="Người chụp" value={session.reporterName} />
              <InfoRow label="Số ảnh" value={`${photos.length} ảnh`} />
              <InfoRow label="Bắt đầu lúc" value={fmt(session.startedAt)} />
              <InfoRow label="GPS" value={withGps > 0 ? `${withGps}/${photos.length} ảnh có GPS` : "Chưa có GPS"} />
            </div>
            <div className="flex gap-2.5 mt-5">
              <button onClick={() => setConfirming(false)} className="btn btn-secondary btn-lg flex-1">
                Quay lại
              </button>
              <button onClick={submit} className="btn btn-primary btn-lg flex-1">
                ✓ Xác nhận nộp
              </button>
            </div>
          </div>
        </div>
      )}
    </AppShell>
  );
}

"use client";

import { useRouter } from "next/navigation";
import { useEffect, useState } from "react";
import { AppShell } from "@/components/layout/AppShell";
import { Card, InfoRow } from "@/components/ui/Card";
import { useSessionCapture } from "@/features/capture/session-context";
import { generateWatermarkedImage } from "@/lib/watermark/watermark-engine";
import { buildWatermarkMetadata } from "@/lib/submissions/metadata";
import type { SessionPhoto, WatermarkMetadata } from "@/types/submission";

export default function PreviewPage() {
  const router = useRouter();
  const { session, pendingCapture, addPhoto, setPendingCapture } = useSessionCapture();

  const [watermarkedUrl, setWatermarkedUrl] = useState<string | null>(null);
  const [originalUrl, setOriginalUrl] = useState<string | null>(null);
  const [meta, setMeta] = useState<WatermarkMetadata | null>(null);
  const [busy, setBusy] = useState(true);
  const [error, setError] = useState<string | null>(null);

  // Guard: missing session/pending → restart appropriately.
  useEffect(() => {
    if (!session) router.replace("/capture");
    else if (!pendingCapture) router.replace("/camera");
  }, [session, pendingCapture, router]);

  // Generate the watermarked image once.
  useEffect(() => {
    if (!session || !pendingCapture) return;
    let active = true;
    setBusy(true);
    setError(null);
    const when = new Date(pendingCapture.capturedAt);
    const m = buildWatermarkMetadata(session, pendingCapture.geo, when);
    generateWatermarkedImage({ source: pendingCapture.originalDataUrl, metadata: m })
      .then((res) => {
        if (!active) return;
        setMeta(m);
        setOriginalUrl(res.originalDataUrl);
        setWatermarkedUrl(res.watermarkedDataUrl);
      })
      .catch((e) => active && setError((e as Error)?.message ?? "Lỗi xử lý ảnh."))
      .finally(() => active && setBusy(false));
    return () => {
      active = false;
    };
  }, [session, pendingCapture]);

  if (!session || !pendingCapture) return null;

  const retake = () => {
    setPendingCapture(null);
    router.push("/camera");
  };

  const keep = () => {
    if (!watermarkedUrl || !originalUrl || !meta) return;
    const photo: SessionPhoto = {
      photoId: `p-${Date.now()}`,
      originalDataUrl: originalUrl,
      watermarkedDataUrl: watermarkedUrl,
      capturedAt: pendingCapture.capturedAt,
      watermarkMetadata: meta,
      latitude: pendingCapture.geo.latitude,
      longitude: pendingCapture.geo.longitude,
      address: pendingCapture.geo.address,
      status: "ready",
    };
    addPhoto(photo);
    setPendingCapture(null);
    router.push("/session");
  };

  const gpsLabel =
    pendingCapture.geo.status === "ok"
      ? `${meta?.gps ?? ""}`
      : "Không xác định (vẫn nộp được)";

  return (
    <AppShell showNav={false}>
      <div className="flex items-center gap-3 px-5 pt-3 pb-3">
        <button onClick={retake} className="w-10 h-10 rounded-pill grid place-items-center text-xl bg-surface">
          ←
        </button>
        <div className="text-[18px] font-semibold">Xem lại ảnh</div>
        <span className="ml-auto badge badge-neutral">Đã có {session.photos.length} ảnh</span>
      </div>

      <div className="flex-1 px-5 overflow-y-auto">
        <div className="relative rounded-md overflow-hidden shadow-e4 bg-surface aspect-[3/4] grid place-items-center">
          {busy && <div className="text-ink-muted text-sm">Đang tạo watermark…</div>}
          {error && <div className="text-danger text-sm px-6 text-center">{error}</div>}
          {!busy && !error && watermarkedUrl && (
            // eslint-disable-next-line @next/next/no-img-element
            <img src={watermarkedUrl} alt="Ảnh có watermark" className="w-full h-full object-cover" />
          )}
        </div>

        <Card className="mt-4">
          <InfoRow label="📍 Địa chỉ" value={pendingCapture.geo.address} />
          <InfoRow label="🛰 GPS" value={gpsLabel} />
          <InfoRow label="🕒 Thời gian" value={meta ? `${meta.time} · ${meta.date}` : "—"} />
        </Card>
        <p className="text-[12px] text-ink-disabled mt-3 text-center">
          Watermark được ghép thật bằng Canvas. Giữ ảnh để thêm vào lô gửi. (Chưa upload — Phase 2C)
        </p>
      </div>

      <div className="px-5 py-4 pb-[calc(16px+env(safe-area-inset-bottom))] border-t border-line flex gap-2.5">
        <button onClick={retake} className="btn btn-secondary btn-lg flex-1">
          ↺ Chụp lại
        </button>
        <button
          onClick={keep}
          disabled={busy || !!error || !watermarkedUrl}
          className={`btn btn-primary btn-lg flex-1 ${busy || error || !watermarkedUrl ? "opacity-50 pointer-events-none" : ""}`}
        >
          ✓ Giữ ảnh
        </button>
      </div>
    </AppShell>
  );
}

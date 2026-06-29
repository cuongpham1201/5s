"use client";

import { useRouter } from "next/navigation";
import { useEffect, useState } from "react";
import { AppShell } from "@/components/layout/AppShell";
import { Card, InfoRow } from "@/components/ui/Card";
import { useSessionCapture } from "@/features/capture/session-context";
import { generateWatermarkedImage } from "@/lib/watermark/watermark-engine";
import { buildWatermarkMetadata } from "@/lib/submissions/metadata";
import { dataUrlToBlob, makeThumbnailDataUrl } from "@/lib/storage/image-utils";
import { putPhoto, getPhoto, listPhotosBySubmission } from "@/lib/storage/photo-store";
import * as store from "@/lib/submissions/local-submission-store";
import { clog as dbg, ctrace } from "@/lib/debug/capture-debug";
import { CaptureDebugPanel } from "@/components/system/CaptureDebugPanel";
import type { SessionPhoto, WatermarkMetadata } from "@/types/submission";

export default function PreviewPage() {
  const router = useRouter();
  const { hydrated, session, pendingCapture, addPhoto, setPendingCapture } = useSessionCapture();

  const [watermarkedUrl, setWatermarkedUrl] = useState<string | null>(null);
  const [originalUrl, setOriginalUrl] = useState<string | null>(null);
  const [meta, setMeta] = useState<WatermarkMetadata | null>(null);
  const [busy, setBusy] = useState(true);
  const [saving, setSaving] = useState(false);
  const [error, setError] = useState<string | null>(null);

  // Guard: missing session/pending → restart appropriately. Wait for hydration
  // so we don't bounce away during the pre-hydration null window.
  useEffect(() => {
    if (!hydrated) return;
    if (!session) {
      dbg("preview.guard:redirect", { reason: "no-session", hydrated, session: null, hasPending: !!pendingCapture, currentRoute: "/preview", lsSession: store.getCurrentSession()?.sessionId ?? null });
      router.replace("/capture");
    } else if (!pendingCapture) {
      dbg("preview.guard:redirect", { reason: "no-pendingCapture", hydrated, sessionId: session.sessionId, photoCount: session.photos.length, currentRoute: "/preview" });
      router.replace("/camera");
    }
  }, [hydrated, session, pendingCapture, router]);

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

  const keep = async () => {
    ctrace("preview.keep:begin", { sessionId: session.sessionId, photoCount: session.photos.length, hasPending: !!pendingCapture, originalDataUrlLen: originalUrl?.length ?? 0, watermarkedDataUrlLen: watermarkedUrl?.length ?? 0 });
    if (!watermarkedUrl || !originalUrl || !meta || saving) return;
    setSaving(true);
    try {
      const photoId = `p-${Date.now()}`;
      const submissionId = session.sessionId;
      const thumbnailDataUrl = await makeThumbnailDataUrl(watermarkedUrl);
      // Heavy binaries → IndexedDB (NOT localStorage).
      const [originalBlob, watermarkedBlob, thumbnailBlob] = await Promise.all([
        dataUrlToBlob(originalUrl),
        dataUrlToBlob(watermarkedUrl),
        dataUrlToBlob(thumbnailDataUrl),
      ]);
      ctrace("preview.blob", { photoId, originalBytes: originalBlob.size, originalType: originalBlob.type, watermarkedBytes: watermarkedBlob.size, watermarkedType: watermarkedBlob.type, thumbBytes: thumbnailBlob.size });
      dbg("preview.putPhoto:before", { photoId, submissionId, originalBytes: originalBlob.size, watermarkedBytes: watermarkedBlob.size, thumbBytes: thumbnailBlob.size });
      // Guard: a 0-byte blob means image decoding failed on this device — fail loud
      // instead of saving an empty photo that would later error at sync.
      if (originalBlob.size === 0 || watermarkedBlob.size === 0) {
        dbg("preview.blob:empty", { originalBytes: originalBlob.size, watermarkedBytes: watermarkedBlob.size });
        setError("Không xử lý được ảnh trên thiết bị này. Vui lòng thử lại hoặc cập nhật trình duyệt.");
        setSaving(false);
        return;
      }
      const saved = await putPhoto({
        photoId,
        submissionId,
        originalBlob,
        watermarkedBlob,
        thumbnailBlob,
        createdAt: new Date().toISOString(),
        status: "ready",
      });
      dbg("preview.putPhoto:after", { photoId, saved });
      if (!saved) {
        dbg("preview.putPhoto:failed", { error: "IndexedDB unavailable" });
        setError("Không lưu được ảnh trên thiết bị (bộ nhớ trình duyệt bị chặn). Vui lòng thử lại hoặc dùng trình duyệt khác.");
        setSaving(false);
        return;
      }
      // READBACK VERIFY (point 5): confirm the blob is actually persisted & non-empty
      // on THIS device before adding it to the session. Catches iOS "write OK but
      // read-back empty" so we never build a 0-photo submission.
      const rb = await getPhoto(photoId);
      ctrace("preview.putPhoto:readback", { photoId, found: !!rb, originalBytes: rb?.originalBlob?.size ?? 0, watermarkedBytes: rb?.watermarkedBlob?.size ?? 0 });
      if (!rb || (rb.originalBlob?.size ?? 0) === 0 || (rb.watermarkedBlob?.size ?? 0) === 0) {
        ctrace("preview.readback:empty", { photoId });
        setError("Thiết bị không lưu được ảnh (bộ nhớ trình duyệt). Vui lòng thử lại, đóng bớt tab hoặc dùng trình duyệt khác.");
        setSaving(false);
        return;
      }
      // Light metadata ONLY (no image payload) → session in localStorage.
      const photo: SessionPhoto = {
        photoId,
        submissionId,
        capturedAt: pendingCapture.capturedAt,
        watermarkMetadata: meta,
        latitude: pendingCapture.geo.latitude,
        longitude: pendingCapture.geo.longitude,
        address: pendingCapture.geo.address,
        status: "ready",
      };
      ctrace("preview.addPhoto:before", { sessionId: submissionId, currentPhotos: session.photos.length, newPhotoId: photoId });
      addPhoto(photo);
      const persisted = store.getCurrentSession();
      const idbCount = (await listPhotosBySubmission(submissionId)).length;
      ctrace("preview.addPhoto:after", { persistedPhotos: persisted?.photos.length ?? null, lsSessionId: persisted?.sessionId ?? null, idbPhotoCount: idbCount });
      // Guard: if the session did NOT actually gain the photo, do not navigate forward.
      if (!persisted || persisted.photos.length === 0) {
        ctrace("preview.session:notSaved", { sessionId: submissionId });
        setError("Không lưu được vào phiên chụp trên thiết bị này. Vui lòng thử lại.");
        setSaving(false);
        return;
      }
      // NOTE: do NOT clear pendingCapture here. Doing so re-fires the route guard
      // above (`!pendingCapture → replace("/camera")`) while still mounted on
      // /preview, which overrides this push and bounces the user out of the flow.
      // pendingCapture is reset by the next startSession / overwritten by the next
      // camera shot; /session does not read it.
      dbg("preview.navigate", { target: "/session", sessionId: submissionId, photoCount: persisted?.photos.length ?? null });
      router.push("/session");
    } catch (e) {
      dbg("preview.keep:error", { message: (e as Error)?.message ?? "unknown" });
      setError((e as Error)?.message ?? "Không lưu được ảnh.");
      setSaving(false);
    }
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
          disabled={busy || saving || !!error || !watermarkedUrl}
          className={`btn btn-primary btn-lg flex-1 ${busy || saving || error || !watermarkedUrl ? "opacity-50 pointer-events-none" : ""}`}
        >
          {saving ? "Đang lưu…" : "✓ Giữ ảnh"}
        </button>
      </div>
      <CaptureDebugPanel where="preview" />
    </AppShell>
  );
}

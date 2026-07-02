"use client";

import { useRouter } from "next/navigation";
import { useEffect, useState } from "react";
import { AppShell } from "@/components/layout/AppShell";
import { Card, InfoRow } from "@/components/ui/Card";
import { useSessionCapture } from "@/features/capture/session-context";
import { generateWatermarkedImage } from "@/lib/watermark/watermark-engine";
import { buildWatermarkMetadata } from "@/lib/submissions/metadata";
import { dataUrlToBlob, getDataUrlDims, makeThumbnailDataUrl } from "@/lib/storage/image-utils";
import { putPhoto, getPhoto, listPhotosBySubmission, sha256Hex } from "@/lib/storage/photo-store";
import { ulog } from "@/lib/debug/upload-log";
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
      // Transient Blobs only (camera→canvas→blob→arrayBuffer). RAW BYTES go to
      // IndexedDB — WebKit detaches persisted Blob references ("The object can
      // not be found here."), so Blob objects must NEVER be persisted.
      const [originalBlob, watermarkedBlob, thumbnailBlob] = await Promise.all([
        dataUrlToBlob(originalUrl),
        dataUrlToBlob(watermarkedUrl),
        dataUrlToBlob(thumbnailDataUrl),
      ]);
      const [originalBuffer, watermarkedBuffer, thumbnailBuffer] = await Promise.all([
        originalBlob.arrayBuffer(),
        watermarkedBlob.arrayBuffer(),
        thumbnailBlob.arrayBuffer(),
      ]);
      const { width, height } = await getDataUrlDims(watermarkedUrl);
      // Independent per-asset hashes — verified separately so a corrupted
      // thumbnail can never invalidate the original image.
      const [originalHash, watermarkedHash, thumbnailHash] = await Promise.all([
        sha256Hex([originalBuffer]),
        sha256Hex([watermarkedBuffer]),
        sha256Hex([thumbnailBuffer]),
      ]);
      ctrace("preview.blob", { photoId, originalBytes: originalBuffer.byteLength, watermarkedBytes: watermarkedBuffer.byteLength, thumbBytes: thumbnailBuffer.byteLength, width, height });
      ulog("photo.saved.bytes", { photoId, submissionId, originalBytes: originalBuffer.byteLength, watermarkedBytes: watermarkedBuffer.byteLength, thumbBytes: thumbnailBuffer.byteLength, width, height });
      ulog("photo.saved.hash", { photoId, original: originalHash.slice(0, 12), watermarked: watermarkedHash.slice(0, 12), thumbnail: thumbnailHash.slice(0, 12) });
      // Guard: 0 bytes means image decoding failed on this device — fail loud
      // instead of saving an empty photo that would later error at sync.
      if (originalBuffer.byteLength === 0 || watermarkedBuffer.byteLength === 0) {
        dbg("preview.blob:empty", { originalBytes: originalBuffer.byteLength, watermarkedBytes: watermarkedBuffer.byteLength });
        setError("Không xử lý được ảnh trên thiết bị này. Vui lòng thử lại hoặc cập nhật trình duyệt.");
        setSaving(false);
        return;
      }
      const saved = await putPhoto({
        photoId,
        submissionId,
        originalBuffer,
        watermarkedBuffer,
        thumbnailBuffer,
        mimeType: watermarkedBlob.type || originalBlob.type || "image/jpeg",
        size: originalBuffer.byteLength + watermarkedBuffer.byteLength,
        originalHash,
        watermarkedHash,
        thumbnailHash,
        width,
        height,
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
      // READBACK VERIFY: read the record back and verify BYTE LENGTHS + per-asset
      // SHA-256 (original and watermarked INDEPENDENTLY) before adding it to the
      // session — guarantees the bytes are readable on THIS device at save time.
      const rb = await getPhoto(photoId);
      const rbO = rb?.originalBuffer?.byteLength ?? 0;
      const rbW = rb?.watermarkedBuffer?.byteLength ?? 0;
      const rbOHash = rb?.originalBuffer ? await sha256Hex([rb.originalBuffer]) : "";
      const rbWHash = rb?.watermarkedBuffer ? await sha256Hex([rb.watermarkedBuffer]) : "";
      const hashOk = (!originalHash || rbOHash === originalHash) && (!watermarkedHash || rbWHash === watermarkedHash);
      ulog("photo.read.bytes", { photoId, originalBytes: rbO, watermarkedBytes: rbW, phase: "save-verify" });
      ulog(hashOk ? "photo.hash.ok" : "photo.hash.failed", { photoId, phase: "save-verify", originalOk: !originalHash || rbOHash === originalHash, watermarkedOk: !watermarkedHash || rbWHash === watermarkedHash });
      ctrace("preview.putPhoto:readback", { photoId, found: !!rb, originalBytes: rbO, watermarkedBytes: rbW, hashOk });
      if (!rb || rbO === 0 || rbW === 0 || !hashOk) {
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

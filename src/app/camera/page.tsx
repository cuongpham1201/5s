"use client";

import Link from "next/link";
import { useRouter } from "next/navigation";
import { useEffect, useState } from "react";
import { AppShell } from "@/components/layout/AppShell";
import { Icon } from "@/components/ui/Icon";
import { useCamera, makeSimulatedPhoto } from "@/hooks/useCamera";
import { useGeolocation } from "@/hooks/useGeolocation";
import { useSessionCapture } from "@/features/capture/session-context";
import { PhotoThumb } from "@/components/media/PhotoThumb";
import { ctrace } from "@/lib/debug/capture-debug";

export default function CameraPage() {
  const router = useRouter();
  const { videoRef, ready, errorKind, errorMessage, start, flip, capture } = useCamera();
  const { snapshot } = useGeolocation(true);
  const { hydrated, session, setPendingCapture } = useSessionCapture();
  const [flash, setFlash] = useState(false);
  const [busy, setBusy] = useState(false);

  // Only redirect once the local store has been read — never during the
  // pre-hydration null window (that caused the /camera → /capture loop).
  useEffect(() => {
    if (hydrated && !session) {
      if (process.env.NODE_ENV !== "production") console.warn("[camera] no active session after hydration → /capture");
      router.replace("/capture");
    }
  }, [hydrated, session, router]);

  useEffect(() => {
    if (session) void start();
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [session]);

  if (!hydrated) {
    return (
      <AppShell showNav={false}>
        <div className="flex-1 grid place-items-center text-ink-muted text-[14px]">Đang tải phiên chụp…</div>
      </AppShell>
    );
  }
  if (!session) return null;

  const label = `${session.departmentCode} · ${session.areaName}`;
  const count = session.photos.length;

  const shoot = () => {
    if (busy) return;
    // Logic chụp GIỮ NGUYÊN — chỉ thêm hiệu ứng flash + trạng thái "đang xử lý".
    const real = capture();
    const originalDataUrl = real ?? makeSimulatedPhoto(count + 1, label);
    const mime = originalDataUrl.slice(5, originalDataUrl.indexOf(";") > 0 ? originalDataUrl.indexOf(";") : 20);
    ctrace("camera.capture", { sessionId: session.sessionId, real: !!real, originalDataUrlLen: originalDataUrl.length, mime });
    setPendingCapture({ originalDataUrl, geo: snapshot, capturedAt: new Date().toISOString() });
    setFlash(true);
    setBusy(true);
    setTimeout(() => router.push("/preview"), 180); // để flash + loader hiện thoáng qua
  };

  const gps =
    snapshot.status === "ok"
      ? { text: "Đã lấy GPS", cls: "bg-[#0E700E]/85" }
      : snapshot.status === "pending"
        ? { text: "Đang lấy GPS…", cls: "bg-black/55" }
        : { text: "Không lấy được GPS (vẫn nộp được)", cls: "bg-[#BC4B09]/85" };

  return (
    <AppShell showNav={false}>
      <div className="relative flex-1 min-h-0 overflow-hidden text-white bg-[radial-gradient(120%_80%_at_50%_40%,#2b2f36,#111316)]">
        <video
          ref={videoRef}
          playsInline
          muted
          autoPlay
          className={`absolute inset-0 w-full h-full object-cover ${ready ? "opacity-100" : "opacity-0"}`}
        />

        <div
          className="absolute top-0 left-0 right-0 z-10 flex items-center justify-between p-4"
          style={{ paddingTop: "calc(16px + env(safe-area-inset-top))" }}
        >
          <Link href="/capture" className="w-11 h-11 rounded-pill grid place-items-center bg-black/45 backdrop-blur active:scale-95 transition-transform" aria-label="Hủy">
            <Icon name="x" size={22} />
          </Link>
          <span className="badge bg-black/45 text-white">{label}</span>
          <span className="w-11 h-11 rounded-pill grid place-items-center bg-black/30 backdrop-blur text-white/70" aria-hidden>
            <Icon name="camera" size={20} />
          </span>
        </div>

        {/* GPS + photo count */}
        <div
          className="absolute right-4 z-10 flex flex-col items-end gap-2"
          style={{ top: "calc(70px + env(safe-area-inset-top))" }}
        >
          <span className={`badge text-white inline-flex items-center gap-1 ${gps.cls}`}>
            <Icon name="mapPin" size={13} /> {gps.text}
          </span>
          {count > 0 && (
            <Link href="/session" className="badge bg-black/55 text-white inline-flex items-center gap-1">
              <Icon name="image" size={13} /> {count} ảnh · Xem
            </Link>
          )}
        </div>

        <div className="absolute inset-x-6 top-[130px] bottom-[200px] border-2 border-dashed border-white/35 rounded-lg pointer-events-none" />

        {/* Flash trắng khi chụp */}
        {flash && <div className="absolute inset-0 z-30 bg-white animate-[fadeOut_180ms_ease-out_forwards] pointer-events-none" />}

        {/* Overlay đang xử lý */}
        {busy && (
          <div className="absolute inset-0 z-20 grid place-items-center bg-black/40 backdrop-blur-[1px]">
            <div className="flex flex-col items-center gap-2">
              <Icon name="refresh" size={30} className="animate-spin text-white" />
              <span className="text-[13px] text-white/90">Đang xử lý ảnh…</span>
            </div>
          </div>
        )}

        {!ready && !errorKind && (
          <div className="absolute inset-0 grid place-items-center opacity-55"><Icon name="camera" size={56} /></div>
        )}

        {errorKind && (
          <div className="absolute inset-0 grid place-items-center p-8 text-center">
            <div className="max-w-[300px]">
              <div className="grid place-items-center mb-3"><Icon name={errorKind === "insecure" ? "key" : "alert"} size={44} /></div>
              <p className="text-[15px] leading-relaxed opacity-95">{errorMessage}</p>
              <div className="flex flex-col gap-2 mt-5">
                {errorKind !== "insecure" && (
                  <button className="btn btn-secondary" onClick={() => start()}>
                    Thử lại
                  </button>
                )}
                <button className="btn btn-primary" onClick={shoot}>
                  Dùng ảnh mô phỏng (test)
                </button>
              </div>
            </div>
          </div>
        )}

        <div className="absolute left-0 right-0 bottom-0 z-10 h-[150px] flex items-center justify-around pb-[calc(18px+env(safe-area-inset-bottom))] bg-gradient-to-t from-black/60 to-transparent">
          {count > 0 ? (
            <Link href="/session" className="w-12 h-12 rounded-[10px] overflow-hidden border-2 border-white/50">
              <PhotoThumb photoId={session.photos[count - 1].photoId} alt="ảnh gần nhất" className="w-full h-full object-cover" />
            </Link>
          ) : (
            <div className="w-12 h-12 rounded-[10px] border-2 border-white/30" />
          )}
          <button
            onClick={shoot}
            disabled={busy}
            className="w-[76px] h-[76px] rounded-pill bg-white border-[5px] border-white/45 shadow-[0_0_0_2px_rgba(0,0,0,.25)] active:scale-95 transition-transform disabled:opacity-70"
            aria-label="Chụp"
          />
          <button onClick={flip} className="w-[54px] h-[54px] rounded-pill grid place-items-center bg-white/15 active:scale-95 transition-transform" aria-label="Đổi camera">
            <Icon name="refresh" size={22} />
          </button>
        </div>
      </div>
    </AppShell>
  );
}

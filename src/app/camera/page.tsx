"use client";

import Link from "next/link";
import { useRouter } from "next/navigation";
import { useEffect } from "react";
import { AppShell } from "@/components/layout/AppShell";
import { useCamera, makeSimulatedPhoto } from "@/hooks/useCamera";
import { useSessionCapture } from "@/features/capture/session-context";
import { CURRENT_USER } from "@/lib/mock-data";

export default function CameraPage() {
  const router = useRouter();
  const { videoRef, ready, errorKind, errorMessage, start, flip, capture } = useCamera();
  const { session, addPhoto } = useSessionCapture();

  // No active session → restart from /capture.
  useEffect(() => {
    if (!session) router.replace("/capture");
  }, [session, router]);

  useEffect(() => {
    void start();
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  if (!session) return null;

  const label = `${session.departmentCode} · ${session.areaName}`;
  const count = session.photos.length;

  // Shutter: use a real frame when available, else a simulated image so the
  // multi-photo flow stays testable over HTTP/Tailscale.
  const shoot = () => {
    const real = capture();
    const localUrl = real ?? makeSimulatedPhoto(count + 1, label);
    addPhoto({ localUrl });
    router.push("/preview");
  };

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

        {/* Top controls (safe-area aware) */}
        <div
          className="absolute top-0 left-0 right-0 z-10 flex items-center justify-between p-4"
          style={{ paddingTop: "calc(16px + env(safe-area-inset-top))" }}
        >
          <Link href="/capture" className="w-11 h-11 rounded-pill grid place-items-center text-xl bg-black/45 backdrop-blur">
            ✕
          </Link>
          <span className="badge bg-black/45 text-white">{label}</span>
          <button className="w-11 h-11 rounded-pill grid place-items-center text-xl bg-black/45 backdrop-blur" aria-label="Flash">
            ⚡
          </button>
        </div>

        {count > 0 && (
          <Link href="/session" className="absolute top-[72px] right-4 z-10 badge bg-black/55 text-white" style={{ top: "calc(72px + env(safe-area-inset-top))" }}>
            📸 {count} ảnh · Xem
          </Link>
        )}

        <div className="absolute inset-x-6 top-[120px] bottom-[200px] border-2 border-dashed border-white/35 rounded-lg pointer-events-none" />

        {!ready && !errorKind && (
          <div className="absolute inset-0 grid place-items-center text-6xl opacity-55">📷</div>
        )}

        {/* Secure-context / permission / device errors */}
        {errorKind && (
          <div className="absolute inset-0 grid place-items-center p-8 text-center">
            <div className="max-w-[300px]">
              <div className="text-5xl mb-3">{errorKind === "insecure" ? "🔒" : "🚫"}</div>
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

        {/* Live watermark sample */}
        <div className="absolute left-[18px] bottom-[140px] z-10 max-w-[230px] rounded-sm bg-black/45 px-2.5 py-2 text-[11px] leading-[1.5] backdrop-blur opacity-85">
          17:20 | 15/06/2026 · Thứ Hai
          <br />
          Lê Lợi / Hồng Gai / Quảng Ninh
          <br />
          {label} · {session.reporterName}
          <br />
          GPS: 20.9512, 107.0834 · ✓ 5S Verified
        </div>

        {/* Bottom controls */}
        <div className="absolute left-0 right-0 bottom-0 z-10 h-[150px] flex items-center justify-around pb-[calc(18px+env(safe-area-inset-bottom))] bg-gradient-to-t from-black/60 to-transparent">
          {count > 0 ? (
            <Link
              href="/session"
              className="w-12 h-12 rounded-[10px] overflow-hidden border-2 border-white/50 grid place-items-center"
            >
              {/* eslint-disable-next-line @next/next/no-img-element */}
              <img src={session.photos[count - 1].localUrl} alt="ảnh gần nhất" className="w-full h-full object-cover" />
            </Link>
          ) : (
            <div className="w-12 h-12 rounded-[10px] border-2 border-white/30" />
          )}
          <button
            onClick={shoot}
            className="w-[76px] h-[76px] rounded-pill bg-white border-[5px] border-white/45 shadow-[0_0_0_2px_rgba(0,0,0,.25)] active:scale-95 transition-transform"
            aria-label="Chụp"
          />
          <button
            onClick={flip}
            className="w-[54px] h-[54px] rounded-pill grid place-items-center text-[22px] bg-white/15"
            aria-label="Đổi camera"
          >
            🔄
          </button>
        </div>
      </div>
    </AppShell>
  );
}

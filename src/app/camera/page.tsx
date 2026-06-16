"use client";

import Link from "next/link";
import { useEffect } from "react";
import { AppShell } from "@/components/layout/AppShell";
import { useCamera } from "@/hooks/useCamera";

export default function CameraPage() {
  const { videoRef, ready, error, start, flip } = useCamera();

  // Auto-start the camera on mount (real getUserMedia).
  useEffect(() => {
    void start();
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  return (
    <AppShell showNav={false} showStatusBar={false}>
      <div className="relative flex-1 min-h-0 overflow-hidden text-white bg-[radial-gradient(120%_80%_at_50%_40%,#2b2f36,#111316)]">
        {/* Live video */}
        <video
          ref={videoRef}
          playsInline
          muted
          autoPlay
          className={`absolute inset-0 w-full h-full object-cover ${ready ? "opacity-100" : "opacity-0"}`}
        />

        {/* Top controls */}
        <div className="absolute top-0 left-0 right-0 z-10 flex items-center justify-between p-4">
          <Link href="/capture" className="w-11 h-11 rounded-pill grid place-items-center text-xl bg-black/45 backdrop-blur">
            ✕
          </Link>
          <span className="badge bg-black/45 text-white">PMKT · Văn phòng</span>
          <button className="w-11 h-11 rounded-pill grid place-items-center text-xl bg-black/45 backdrop-blur" aria-label="Flash">
            ⚡
          </button>
        </div>

        {/* Framing guide / status */}
        <div className="absolute inset-x-6 top-[70px] bottom-[200px] border-2 border-dashed border-white/35 rounded-lg pointer-events-none" />
        {!ready && !error && (
          <div className="absolute inset-0 grid place-items-center text-6xl opacity-55">📷</div>
        )}
        {error && (
          <div className="absolute inset-0 grid place-items-center p-8 text-center">
            <div>
              <div className="text-5xl mb-3">🚫</div>
              <p className="text-sm opacity-90">{error}</p>
              <button className="btn btn-secondary mt-4" onClick={() => start()}>
                Thử lại
              </button>
            </div>
          </div>
        )}

        {/* Blurred watermark preview */}
        <div className="absolute left-[18px] bottom-[140px] z-10 max-w-[230px] rounded-sm bg-black/45 px-2.5 py-2 text-[11px] leading-[1.5] backdrop-blur opacity-85">
          17:20 | 15/06/2026 · Thứ Hai
          <br />
          Lê Lợi / Hồng Gai / Quảng Ninh
          <br />
          PMKT · Văn phòng · Nguyễn Văn A
          <br />
          GPS: 20.9512, 107.0834 · ✓ 5S Verified
        </div>

        {/* Bottom controls (thumb-reach) */}
        <div className="absolute left-0 right-0 bottom-0 z-10 h-[150px] flex items-center justify-around pb-[18px] bg-gradient-to-t from-black/60 to-transparent">
          <div className="w-12 h-12 rounded-[10px] overflow-hidden border-2 border-white/50 bg-gradient-to-br from-[#cdd7e0] to-[#8fa0b0]" />
          {/* Shutter — Phase 1A navigates to preview (no real capture yet) */}
          <Link
            href="/preview"
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

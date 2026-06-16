"use client";

import { useRouter } from "next/navigation";
import { useEffect } from "react";
import { AppShell } from "@/components/layout/AppShell";
import { Card, InfoRow } from "@/components/ui/Card";
import { CURRENT_USER } from "@/lib/mock-data";
import { useSessionCapture } from "@/features/capture/session-context";

export default function PreviewPage() {
  const router = useRouter();
  const { photos, area, removePhoto } = useSessionCapture();
  const latest = photos[photos.length - 1];

  // No photo to preview (e.g. direct navigation / reload after submit) → restart.
  useEffect(() => {
    if (!latest) router.replace("/capture");
  }, [latest, router]);
  if (!latest) return null;

  const retake = () => {
    removePhoto(latest.id);
    router.push("/camera");
  };

  return (
    <AppShell showNav={false}>
      <div className="flex items-center gap-3 px-5 pt-2 pb-3">
        <button onClick={retake} className="w-10 h-10 rounded-pill grid place-items-center text-xl bg-surface">
          ←
        </button>
        <div className="text-[18px] font-semibold">Xem lại ảnh</div>
        <span className="ml-auto badge badge-neutral">Ảnh {photos.length}</span>
      </div>

      <div className="flex-1 px-5">
        <div className="relative rounded-md overflow-hidden shadow-e4">
          <div
            className="w-full aspect-[3/4] relative"
            style={{ background: `linear-gradient(135deg, hsl(${latest.hue} 30% 78%), hsl(${latest.hue} 28% 55%) 70%, hsl(${latest.hue} 30% 42%))` }}
          >
            <span className="absolute inset-0 grid place-items-center text-[90px] font-extrabold text-white/25">
              5S
            </span>
            <div className="absolute left-3 bottom-3 max-w-[86%] rounded-sm bg-black/55 text-white px-3.5 py-3 text-[12px] leading-[1.55] backdrop-blur">
              <div className="font-bold text-[13px]">{latest.capturedAt} | 15/06/2026</div>
              <div>Thứ Hai</div>
              <div>Lê Lợi / Hồng Gai / Quảng Ninh</div>
              <div>Phòng ban: {CURRENT_USER.department}</div>
              <div>Khu vực: {area ?? latest.area}</div>
              <div>Người chụp: {CURRENT_USER.name}</div>
              <div>GPS: 20.9512, 107.0834</div>
              <div className="inline-flex items-center gap-1.5 mt-1.5 font-bold text-[#6FE26F]">
                ✓ 5S Verified
              </div>
            </div>
          </div>
        </div>

        <Card className="mt-4">
          <InfoRow label="📍 Địa chỉ" value="Lê Lợi, Hồng Gai, Quảng Ninh" />
          <InfoRow label="🛰 GPS" value="20.9512, 107.0834" />
          <InfoRow label="🕒 Thời gian" value={`${latest.capturedAt} · 15/06/2026`} />
        </Card>
        <p className="text-[12px] text-ink-disabled mt-3 text-center">
          Giữ ảnh để thêm vào lần gửi — bạn có thể chụp thêm trước khi nộp. (Phase 1C: chưa upload)
        </p>
      </div>

      <div className="px-5 py-4 border-t border-line flex gap-2.5">
        <button onClick={retake} className="btn btn-secondary btn-lg flex-1">
          ↺ Chụp lại
        </button>
        <button onClick={() => router.push("/session")} className="btn btn-primary btn-lg flex-1">
          ✓ Giữ ảnh
        </button>
      </div>
    </AppShell>
  );
}

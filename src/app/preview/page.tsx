"use client";

import { useRouter } from "next/navigation";
import { useEffect } from "react";
import { AppShell } from "@/components/layout/AppShell";
import { Card, InfoRow } from "@/components/ui/Card";
import { useSessionCapture } from "@/features/capture/session-context";

function hhmm(iso: string): string {
  const d = new Date(iso);
  return `${String(d.getHours()).padStart(2, "0")}:${String(d.getMinutes()).padStart(2, "0")}`;
}

export default function PreviewPage() {
  const router = useRouter();
  const { session, removePhoto } = useSessionCapture();
  const latest = session?.photos[session.photos.length - 1];

  useEffect(() => {
    if (!session) router.replace("/capture");
    else if (!latest) router.replace("/camera");
  }, [session, latest, router]);
  if (!session || !latest) return null;

  const retake = () => {
    removePhoto(latest.photoId);
    router.push("/camera");
  };

  return (
    <AppShell showNav={false}>
      <div className="flex items-center gap-3 px-5 pt-3 pb-3">
        <button onClick={retake} className="w-10 h-10 rounded-pill grid place-items-center text-xl bg-surface">
          ←
        </button>
        <div className="text-[18px] font-semibold">Xem lại ảnh</div>
        <span className="ml-auto badge badge-neutral">Ảnh {session.photos.length}</span>
      </div>

      <div className="flex-1 px-5 overflow-y-auto">
        <div className="relative rounded-md overflow-hidden shadow-e4">
          {/* eslint-disable-next-line @next/next/no-img-element */}
          <img src={latest.localUrl} alt="Ảnh vừa chụp" className="w-full aspect-[3/4] object-cover" />
          <div className="absolute left-3 bottom-3 max-w-[86%] rounded-sm bg-black/55 text-white px-3.5 py-3 text-[12px] leading-[1.55] backdrop-blur">
            <div className="font-bold text-[13px]">{hhmm(latest.capturedAt)} | 15/06/2026</div>
            <div>Thứ Hai</div>
            <div>Lê Lợi / Hồng Gai / Quảng Ninh</div>
            <div>Phòng ban: {session.departmentCode}</div>
            <div>Khu vực: {session.areaName}</div>
            <div>Người chụp: {session.reporterName}</div>
            <div>GPS: 20.9512, 107.0834</div>
            <div className="inline-flex items-center gap-1.5 mt-1.5 font-bold text-[#6FE26F]">✓ 5S Verified</div>
          </div>
        </div>

        <Card className="mt-4">
          <InfoRow label="📍 Địa chỉ" value="Lê Lợi, Hồng Gai, Quảng Ninh" />
          <InfoRow label="🛰 GPS" value="20.9512, 107.0834" />
          <InfoRow label="🕒 Thời gian" value={`${hhmm(latest.capturedAt)} · 15/06/2026`} />
        </Card>
        <p className="text-[12px] text-ink-disabled mt-3 text-center">
          Giữ ảnh để thêm vào lô gửi — bạn có thể chụp thêm rồi mới nộp. (Watermark/GPS thật ở Phase 2)
        </p>
      </div>

      <div className="px-5 py-4 pb-[calc(16px+env(safe-area-inset-bottom))] border-t border-line flex gap-2.5">
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

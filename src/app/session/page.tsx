"use client";

import Link from "next/link";
import { useRouter } from "next/navigation";
import { useState } from "react";
import { AppShell } from "@/components/layout/AppShell";
import { CURRENT_USER } from "@/lib/mock-data";
import { useSessionCapture } from "@/features/capture/session-context";

export default function SessionPage() {
  const router = useRouter();
  const { photos, area, removePhoto, clearSession, submitSession } = useSessionCapture();
  const [confirming, setConfirming] = useState(false);

  const submit = () => {
    submitSession();
    router.push("/success");
  };

  return (
    <AppShell showNav={false}>
      <div className="flex items-center gap-3 px-5 pt-2 pb-3">
        <Link href="/" className="w-10 h-10 rounded-pill grid place-items-center text-xl bg-surface">
          ←
        </Link>
        <div className="flex-1">
          <div className="text-[18px] font-semibold">Ảnh trong lần gửi</div>
          <div className="text-[13px] text-ink-muted">
            {CURRENT_USER.department}
            {area ? ` · ${area}` : ""}
          </div>
        </div>
        <span className="badge badge-info">{photos.length} ảnh</span>
      </div>

      {photos.length === 0 ? (
        <div className="flex-1 flex flex-col items-center justify-center text-center px-8 gap-2">
          <div className="text-6xl mb-1">📷</div>
          <div className="text-[18px] font-semibold">Chưa có ảnh nào</div>
          <p className="text-ink-muted">Bắt đầu chụp để thêm ảnh vào lần gửi này.</p>
          <Link href="/capture" className="btn btn-primary btn-lg mt-4">
            Chụp ảnh
          </Link>
        </div>
      ) : (
        <>
          <div className="flex-1 px-5 pb-4 overflow-y-auto">
            <div className="grid grid-cols-2 gap-3">
              {photos.map((p, i) => (
                <div key={p.id} className="relative rounded-md overflow-hidden shadow-e2">
                  <div
                    className="aspect-square relative"
                    style={{ background: `linear-gradient(135deg, hsl(${p.hue} 32% 76%), hsl(${p.hue} 28% 52%))` }}
                  >
                    <span className="absolute left-1.5 top-1.5 bg-black/50 text-white text-[10px] px-1.5 py-0.5 rounded">
                      #{i + 1}
                    </span>
                    <button
                      onClick={() => removePhoto(p.id)}
                      aria-label="Xoá ảnh"
                      className="absolute right-1.5 top-1.5 w-7 h-7 rounded-pill grid place-items-center bg-black/55 text-white text-sm active:scale-90"
                    >
                      ✕
                    </button>
                    <div className="absolute inset-x-0 bottom-0 bg-gradient-to-t from-black/65 to-transparent text-white text-[11px] font-semibold px-2 pt-4 pb-1.5">
                      {p.area} · {p.capturedAt}
                    </div>
                  </div>
                </div>
              ))}

              {/* Add-more tile */}
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

            <button
              onClick={clearSession}
              className="mt-4 w-full text-center text-[13px] font-semibold text-danger py-2"
            >
              Xoá tất cả & bắt đầu lại
            </button>
          </div>

          <div className="px-5 py-4 border-t border-line flex gap-2.5">
            <Link href="/camera" className="btn btn-secondary btn-lg flex-1">
              + Chụp thêm
            </Link>
            <button onClick={() => setConfirming(true)} className="btn btn-primary btn-lg flex-1">
              Hoàn tất ({photos.length})
            </button>
          </div>
        </>
      )}

      {/* Confirm submit sheet */}
      {confirming && (
        <div className="absolute inset-0 z-50 flex flex-col justify-end bg-black/40" onClick={() => setConfirming(false)}>
          <div className="bg-white rounded-t-xl p-5" onClick={(e) => e.stopPropagation()}>
            <div className="text-[18px] font-semibold">Xác nhận nộp</div>
            <p className="text-ink-muted mt-1">
              Gửi <b>{photos.length} ảnh</b> cho {CURRENT_USER.department}
              {area ? ` · ${area}` : ""}? Bạn không thể chỉnh sau khi nộp.
            </p>
            <div className="flex gap-2.5 mt-5">
              <button onClick={() => setConfirming(false)} className="btn btn-secondary btn-lg flex-1">
                Huỷ
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

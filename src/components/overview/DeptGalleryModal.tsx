"use client";

import { deptGalleryToday, findDept } from "@/lib/mock-overview";

/** Bottom-sheet gallery for a department's photos today (like opening a Zalo post). */
export function DeptGalleryModal({ code, onClose }: { code: string | null; onClose: () => void }) {
  if (!code) return null;
  const dept = findDept(code);
  const photos = deptGalleryToday(code);

  return (
    <div className="absolute inset-0 z-50 flex flex-col justify-end bg-black/40" onClick={onClose}>
      <div
        className="bg-white rounded-t-xl p-5 pb-[calc(20px+env(safe-area-inset-bottom))] max-h-[80%] overflow-y-auto"
        onClick={(e) => e.stopPropagation()}
      >
        <div className="flex items-center justify-between mb-1">
          <div className="text-[18px] font-semibold">
            {dept?.code} · <span className="text-ink-muted font-normal text-[14px]">{dept?.name}</span>
          </div>
          <button onClick={onClose} className="w-9 h-9 rounded-pill grid place-items-center bg-surface text-lg">
            ✕
          </button>
        </div>
        <div className="text-[13px] text-ink-muted mb-4">
          {dept?.shotToday ? `Đã chụp · ${photos.length} ảnh · ${dept?.lastTime}` : "Chưa chụp hôm nay"}
        </div>

        {photos.length === 0 ? (
          <div className="text-center text-ink-muted py-10">
            <div className="text-5xl mb-2">📷</div>
            Chưa có ảnh hôm nay
          </div>
        ) : (
          <div className="grid grid-cols-2 gap-3">
            {photos.map((p) => (
              <div key={p.id} className="relative rounded-md overflow-hidden shadow-e2">
                <div
                  className="aspect-square relative"
                  style={{ background: `linear-gradient(135deg, hsl(${p.hue} 34% 74%), hsl(${p.hue} 30% 50%))` }}
                >
                  <span className="absolute inset-0 grid place-items-center text-[42px] font-extrabold text-white/25">5S</span>
                  <div className="absolute inset-x-0 bottom-0 bg-gradient-to-t from-black/65 to-transparent text-white text-[11px] font-semibold px-2 pt-4 pb-1.5">
                    {dept?.code} · {p.time}
                  </div>
                </div>
              </div>
            ))}
          </div>
        )}
      </div>
    </div>
  );
}

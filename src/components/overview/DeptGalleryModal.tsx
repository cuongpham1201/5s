"use client";

import { Icon } from "@/components/ui/Icon";
import { MockPhoto } from "@/components/ui/MockPhoto";
import { deptGalleryToday, findDept } from "@/lib/mock-overview";

/** Bottom-sheet gallery for a department's photos today (like opening a Zalo post). */
export function DeptGalleryModal({ code, onClose }: { code: string | null; onClose: () => void }) {
  if (!code) return null;
  const dept = findDept(code);
  const photos = deptGalleryToday(code);

  return (
    <div className="absolute inset-0 z-50 flex flex-col justify-end bg-black/40 backdrop-blur-[1px]" onClick={onClose}>
      <div
        className="bg-white rounded-t-[24px] p-5 pb-[calc(20px+env(safe-area-inset-bottom))] max-h-[82%] overflow-y-auto"
        onClick={(e) => e.stopPropagation()}
      >
        <div className="mx-auto mb-3 w-10 h-1.5 rounded-pill bg-border" />
        <div className="flex items-center justify-between mb-1">
          <div className="text-[17px] font-bold">
            {dept?.code} <span className="text-ink-muted font-medium text-[14px]">· {dept?.name}</span>
          </div>
          <button onClick={onClose} className="w-9 h-9 rounded-pill grid place-items-center bg-surface text-ink-muted">
            <Icon name="x" size={18} />
          </button>
        </div>
        <div className="text-[13px] text-ink-muted mb-4">
          {dept?.shotToday ? `Đã chụp · ${photos.length} ảnh · ${dept?.lastTime}` : "Chưa chụp hôm nay"}
        </div>

        {photos.length === 0 ? (
          <div className="text-center text-ink-muted py-10 flex flex-col items-center gap-2">
            <Icon name="camera" size={34} className="text-ink-disabled" />
            Chưa có ảnh hôm nay
          </div>
        ) : (
          <div className="grid grid-cols-2 gap-3">
            {photos.map((p) => (
              <MockPhoto key={p.id} hue={p.hue} className="aspect-square">
                <div className="absolute inset-x-0 bottom-0 bg-gradient-to-t from-black/65 to-transparent px-2.5 pt-5 pb-2 text-white text-[11px] font-semibold">
                  {dept?.code} · {p.time}
                </div>
              </MockPhoto>
            ))}
          </div>
        )}
      </div>
    </div>
  );
}

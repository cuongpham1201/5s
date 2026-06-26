"use client";

import { useEffect, useState } from "react";

export interface ViewerPhoto {
  watermarkedPath: string;
  departmentCode?: string;
  departmentName?: string;
  areaName?: string;
  checkItemName?: string;
  reporterName?: string;
  submittedAt?: string;
  submissionId?: string;
  photoId?: string;
  isDeleted?: boolean;
}

function fmt(iso?: string): string {
  if (!iso) return "—";
  const d = new Date(iso);
  if (Number.isNaN(d.getTime())) return iso;
  const p = (n: number) => String(n).padStart(2, "0");
  return `${p(d.getDate())}/${p(d.getMonth() + 1)}/${d.getFullYear()} ${p(d.getHours())}:${p(d.getMinutes())}`;
}
const proxy = (path: string) => `/api/photo?path=${encodeURIComponent(path)}`;

/**
 * Full-screen photo viewer. Works on desktop + mobile. Requires login (the
 * image proxy is authenticated). Admin actions are opt-in via props.
 */
export function PhotoViewerModal({
  photos,
  index,
  onClose,
  onIndexChange,
  adminMode = false,
  onDelete,
  onRestore,
}: {
  photos: ViewerPhoto[];
  index: number;
  onClose: () => void;
  onIndexChange: (i: number) => void;
  adminMode?: boolean;
  onDelete?: (p: ViewerPhoto) => void;
  onRestore?: (p: ViewerPhoto) => void;
}) {
  const [errored, setErrored] = useState(false);
  const p = photos[index];

  useEffect(() => { setErrored(false); }, [index]);

  useEffect(() => {
    const onKey = (e: KeyboardEvent) => {
      if (e.key === "Escape") onClose();
      else if (e.key === "ArrowLeft" && index > 0) onIndexChange(index - 1);
      else if (e.key === "ArrowRight" && index < photos.length - 1) onIndexChange(index + 1);
    };
    window.addEventListener("keydown", onKey);
    return () => window.removeEventListener("keydown", onKey);
  }, [index, photos.length, onClose, onIndexChange]);

  if (!p) return null;
  const hasPrev = index > 0;
  const hasNext = index < photos.length - 1;

  return (
    <div className="fixed inset-0 z-[300] bg-black/85 flex flex-col" role="dialog" aria-modal>
      {/* top bar */}
      <div className="flex items-center justify-between gap-3 px-4 py-3 text-white" style={{ paddingTop: "calc(10px + env(safe-area-inset-top))" }}>
        <div className="text-[13px] opacity-80">{index + 1} / {photos.length}</div>
        <div className="flex items-center gap-2">
          <a href={proxy(p.watermarkedPath)} download className="text-[13px] font-semibold px-3 py-1.5 rounded-pill bg-white/15 hover:bg-white/25">⬇ Tải</a>
          <button onClick={onClose} aria-label="Đóng" className="w-9 h-9 rounded-pill grid place-items-center bg-white/15 hover:bg-white/25 text-lg">✕</button>
        </div>
      </div>

      {/* image */}
      <div className="flex-1 min-h-0 relative grid place-items-center px-2">
        {errored ? (
          <div className="text-center text-white/80">
            <div className="text-5xl mb-2">🖼️</div>
            <div className="text-[14px]">Ảnh lỗi / không tải được</div>
          </div>
        ) : (
          // eslint-disable-next-line @next/next/no-img-element
          <img src={proxy(p.watermarkedPath)} alt={p.areaName ?? "Ảnh 5S"} onError={() => setErrored(true)} className="max-h-full max-w-full object-contain" />
        )}
        {hasPrev && (
          <button onClick={() => onIndexChange(index - 1)} aria-label="Trước" className="absolute left-2 top-1/2 -translate-y-1/2 w-11 h-11 rounded-pill grid place-items-center bg-white/15 hover:bg-white/30 text-white text-2xl">‹</button>
        )}
        {hasNext && (
          <button onClick={() => onIndexChange(index + 1)} aria-label="Sau" className="absolute right-2 top-1/2 -translate-y-1/2 w-11 h-11 rounded-pill grid place-items-center bg-white/15 hover:bg-white/30 text-white text-2xl">›</button>
        )}
      </div>

      {/* metadata */}
      <div className="bg-white px-4 py-3 pb-[calc(12px+env(safe-area-inset-bottom))] text-[13px]">
        <div className="font-bold text-[15px]">
          {p.departmentCode ?? "—"}{p.departmentName ? ` · ${p.departmentName}` : ""}
          {p.isDeleted && <span className="ml-2 text-[11px] font-bold px-2 h-5 rounded-pill bg-danger-bg text-danger">Đã xoá</span>}
        </div>
        <div className="grid grid-cols-2 gap-x-4 gap-y-0.5 mt-1.5 text-ink-muted">
          {p.areaName && <div>Khu vực: <span className="text-ink">{p.areaName}</span></div>}
          {p.checkItemName && <div>Hạng mục: <span className="text-ink">{p.checkItemName}</span></div>}
          {p.reporterName && <div>Người chụp: <span className="text-ink">{p.reporterName}</span></div>}
          <div>Lúc: <span className="text-ink">{fmt(p.submittedAt)}</span></div>
          {p.submissionId && <div className="col-span-2 font-mono text-[11px]">{p.submissionId}</div>}
        </div>
        {adminMode && (
          <div className="flex gap-2 mt-3">
            {!p.isDeleted ? (
              <button onClick={() => onDelete?.(p)} className="btn btn-secondary !min-h-9 text-danger">🗑 Xoá / ẩn ảnh</button>
            ) : (
              <button onClick={() => onRestore?.(p)} className="btn btn-secondary !min-h-9 text-success">↺ Khôi phục</button>
            )}
          </div>
        )}
      </div>
    </div>
  );
}

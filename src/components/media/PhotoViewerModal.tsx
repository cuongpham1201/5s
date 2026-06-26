"use client";

import { useCallback, useEffect, useRef, useState } from "react";

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
 * Full-screen photo viewer: wheel/double-tap/pinch zoom, drag-to-pan, swipe + ←/→
 * navigation, ESC to close, prev/next preload. Images load ONLY via /api/photo
 * (never a direct SharePoint link). Admin actions are opt-in via props.
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
  const [scale, setScale] = useState(1);
  const [tx, setTx] = useState(0);
  const [ty, setTy] = useState(0);
  const gesture = useRef<{ pointers: Map<number, { x: number; y: number }>; startDist: number; startScale: number; lastX: number; lastY: number; downX: number; downTime: number; lastTap: number }>(
    { pointers: new Map(), startDist: 0, startScale: 1, lastX: 0, lastY: 0, downX: 0, downTime: 0, lastTap: 0 },
  );

  const p = photos[index];
  const hasPrev = index > 0;
  const hasNext = index < photos.length - 1;

  const reset = useCallback(() => { setScale(1); setTx(0); setTy(0); }, []);
  useEffect(() => { setErrored(false); reset(); }, [index, reset]);

  // Preload neighbours.
  useEffect(() => {
    [index - 1, index + 1].forEach((i) => {
      const ph = photos[i];
      if (ph) { const img = new Image(); img.src = proxy(ph.watermarkedPath); }
    });
  }, [index, photos]);

  useEffect(() => {
    const onKey = (e: KeyboardEvent) => {
      if (e.key === "Escape") onClose();
      else if (e.key === "ArrowLeft" && hasPrev) onIndexChange(index - 1);
      else if (e.key === "ArrowRight" && hasNext) onIndexChange(index + 1);
    };
    window.addEventListener("keydown", onKey);
    return () => window.removeEventListener("keydown", onKey);
  }, [index, hasPrev, hasNext, onClose, onIndexChange]);

  if (!p) return null;

  const clampScale = (s: number) => Math.min(5, Math.max(1, s));

  const onWheel = (e: React.WheelEvent) => {
    e.preventDefault();
    setScale((s) => {
      const next = clampScale(s - e.deltaY * 0.0015 * s);
      if (next === 1) { setTx(0); setTy(0); }
      return next;
    });
  };

  const toggleZoom = () => {
    if (scale > 1) reset();
    else setScale(2.5);
  };

  const dist = (a: { x: number; y: number }, b: { x: number; y: number }) => Math.hypot(a.x - b.x, a.y - b.y);

  const onPointerDown = (e: React.PointerEvent) => {
    (e.target as Element).setPointerCapture?.(e.pointerId);
    const g = gesture.current;
    g.pointers.set(e.pointerId, { x: e.clientX, y: e.clientY });
    g.lastX = e.clientX; g.lastY = e.clientY;
    g.downX = e.clientX; g.downTime = Date.now();
    if (g.pointers.size === 2) {
      const [a, b] = [...g.pointers.values()];
      g.startDist = dist(a, b);
      g.startScale = scale;
    }
  };

  const onPointerMove = (e: React.PointerEvent) => {
    const g = gesture.current;
    if (!g.pointers.has(e.pointerId)) return;
    g.pointers.set(e.pointerId, { x: e.clientX, y: e.clientY });
    if (g.pointers.size === 2) {
      const [a, b] = [...g.pointers.values()];
      const d = dist(a, b);
      if (g.startDist > 0) setScale(clampScale(g.startScale * (d / g.startDist)));
      return;
    }
    if (scale > 1) {
      setTx((x) => x + (e.clientX - g.lastX));
      setTy((y) => y + (e.clientY - g.lastY));
      g.lastX = e.clientX; g.lastY = e.clientY;
    }
  };

  const onPointerUp = (e: React.PointerEvent) => {
    const g = gesture.current;
    const wasSingle = g.pointers.size === 1;
    g.pointers.delete(e.pointerId);
    if (g.pointers.size < 2) g.startDist = 0;

    const now = Date.now();
    const dx = e.clientX - g.downX;
    const dt = now - g.downTime;
    // double-tap zoom
    if (wasSingle && Math.abs(dx) < 10 && dt < 250) {
      if (now - g.lastTap < 300) { toggleZoom(); g.lastTap = 0; return; }
      g.lastTap = now;
    }
    // swipe navigation (only when not zoomed)
    if (scale === 1 && wasSingle && dt < 500 && Math.abs(dx) > 60) {
      if (dx > 0 && hasPrev) onIndexChange(index - 1);
      else if (dx < 0 && hasNext) onIndexChange(index + 1);
    }
  };

  return (
    <div className="fixed inset-0 z-[300] bg-black/90 flex flex-col select-none" role="dialog" aria-modal>
      <div className="flex items-center justify-between gap-3 px-4 py-3 text-white" style={{ paddingTop: "calc(10px + env(safe-area-inset-top))" }}>
        <div className="text-[13px] opacity-80">{index + 1} / {photos.length}{scale > 1 ? ` · ${Math.round(scale * 100)}%` : ""}</div>
        <div className="flex items-center gap-2">
          {scale > 1 && <button onClick={reset} className="text-[13px] font-semibold px-3 py-1.5 rounded-pill bg-white/15 hover:bg-white/25">Thu nhỏ</button>}
          <a href={proxy(p.watermarkedPath)} download className="text-[13px] font-semibold px-3 py-1.5 rounded-pill bg-white/15 hover:bg-white/25">⬇ Tải</a>
          <button onClick={onClose} aria-label="Đóng" className="w-9 h-9 rounded-pill grid place-items-center bg-white/15 hover:bg-white/25 text-lg">✕</button>
        </div>
      </div>

      <div
        className="flex-1 min-h-0 relative overflow-hidden grid place-items-center px-2 touch-none"
        onWheel={onWheel}
        onPointerDown={onPointerDown}
        onPointerMove={onPointerMove}
        onPointerUp={onPointerUp}
        onPointerCancel={onPointerUp}
      >
        {errored ? (
          <div className="text-center text-white/80"><div className="text-5xl mb-2">🖼️</div><div className="text-[14px]">Ảnh lỗi / không tải được</div></div>
        ) : (
          // eslint-disable-next-line @next/next/no-img-element
          <img
            src={proxy(p.watermarkedPath)}
            alt={p.areaName ?? "Ảnh 5S"}
            draggable={false}
            onError={() => setErrored(true)}
            style={{ transform: `translate(${tx}px, ${ty}px) scale(${scale})`, transition: gesture.current.pointers.size ? "none" : "transform 0.12s", cursor: scale > 1 ? "grab" : "zoom-in" }}
            className="max-h-full max-w-full object-contain"
          />
        )}
        {hasPrev && scale === 1 && <button onClick={() => onIndexChange(index - 1)} aria-label="Trước" className="absolute left-2 top-1/2 -translate-y-1/2 w-11 h-11 rounded-pill grid place-items-center bg-white/15 hover:bg-white/30 text-white text-2xl">‹</button>}
        {hasNext && scale === 1 && <button onClick={() => onIndexChange(index + 1)} aria-label="Sau" className="absolute right-2 top-1/2 -translate-y-1/2 w-11 h-11 rounded-pill grid place-items-center bg-white/15 hover:bg-white/30 text-white text-2xl">›</button>}
      </div>

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

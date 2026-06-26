"use client";

import { useState } from "react";

/**
 * Lazy thumbnail via the authenticated photo proxy. Shows a shimmer skeleton
 * while loading, fades in on load, and renders a clean placeholder on error
 * (never the broken-image icon). Native lazy-loading (IntersectionObserver).
 */
export function Thumb({ path, alt = "", className = "" }: { path: string; alt?: string; className?: string }) {
  const [state, setState] = useState<"loading" | "ok" | "error">("loading");
  const src = `/api/photo?path=${encodeURIComponent(path)}`;
  return (
    <span className={`relative block bg-surface overflow-hidden ${className}`}>
      {state === "loading" && <span className="absolute inset-0 animate-pulse bg-line/50" aria-hidden />}
      {state === "error" ? (
        <span className="absolute inset-0 grid place-items-center text-center text-ink-muted">
          <span className="text-[11px] leading-tight">🖼️<br />Ảnh lỗi</span>
        </span>
      ) : (
        // eslint-disable-next-line @next/next/no-img-element
        <img
          src={src}
          alt={alt}
          loading="lazy"
          onLoad={() => setState("ok")}
          onError={() => setState("error")}
          className={`w-full h-full object-cover transition-opacity duration-300 ${state === "ok" ? "opacity-100" : "opacity-0"}`}
        />
      )}
    </span>
  );
}

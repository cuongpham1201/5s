"use client";

import { useState } from "react";

const MAX_RETRY = 2;

/**
 * Lazy thumbnail via the authenticated photo proxy. Uses the SAME canonical
 * source as the viewer (/api/photo?path=…). On a transient load failure it
 * retries (with cache-bust) up to MAX_RETRY before showing a clean placeholder,
 * so a momentary proxy hiccup no longer permanently shows "Ảnh lỗi" while the
 * viewer opens the same image fine.
 */
export function Thumb({ path, alt = "", className = "" }: { path: string; alt?: string; className?: string }) {
  const [state, setState] = useState<"loading" | "ok" | "error">("loading");
  const [tries, setTries] = useState(0);
  const base = `/api/photo?path=${encodeURIComponent(path)}`;
  const src = tries > 0 ? `${base}&r=${tries}` : base;

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
          key={src}
          src={src}
          alt={alt}
          loading="lazy"
          onLoad={() => setState("ok")}
          onError={() => {
            if (tries < MAX_RETRY) { setTries((t) => t + 1); setState("loading"); }
            else setState("error");
          }}
          className={`w-full h-full object-cover transition-opacity duration-300 ${state === "ok" ? "opacity-100" : "opacity-0"}`}
        />
      )}
    </span>
  );
}

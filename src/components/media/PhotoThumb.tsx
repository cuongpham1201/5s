"use client";

import { useEffect, useState } from "react";
import { getObjectUrl, type PhotoKind } from "@/lib/storage/photo-store";

/**
 * Renders a photo thumbnail loaded from IndexedDB (object URL). Keeps NO image
 * payload in localStorage — the photoId metadata resolves to a Blob in IDB.
 * Revokes the object URL on unmount/change.
 */
export function PhotoThumb({
  photoId,
  kind = "thumbnail",
  alt = "ảnh",
  className = "",
}: {
  photoId: string;
  kind?: PhotoKind;
  alt?: string;
  className?: string;
}) {
  const [url, setUrl] = useState<string | null>(null);

  useEffect(() => {
    let active = true;
    let created: string | null = null;
    getObjectUrl(photoId, kind).then((u) => {
      if (!active) {
        if (u) URL.revokeObjectURL(u);
        return;
      }
      created = u;
      setUrl(u);
    });
    return () => {
      active = false;
      if (created) URL.revokeObjectURL(created);
    };
  }, [photoId, kind]);

  if (!url) return <div className={`bg-surface animate-pulse ${className}`} aria-label={alt} />;
  // eslint-disable-next-line @next/next/no-img-element
  return <img src={url} alt={alt} className={className} />;
}

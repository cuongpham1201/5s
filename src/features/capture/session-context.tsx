"use client";

import {
  createContext,
  useCallback,
  useContext,
  useEffect,
  useState,
  type ReactNode,
} from "react";

/**
 * Capture session store (Phase 1C — multi-photo submission).
 *
 * Holds the photos captured for ONE submission before it is "nộp" (submitted).
 * Lives in memory (client) + sessionStorage so it survives navigation and
 * accidental reloads. NO upload / SharePoint / watermark here — a "photo" is a
 * lightweight client record; real image bytes + watermark + upload come later.
 *
 * Model: 1 submission = N photos (see DATA_MODEL.md §2/§2bis).
 */
export interface CapturedPhoto {
  id: string;
  area: string;
  capturedAt: string; // "HH:MM" display time (local, set in a client handler)
  /** Placeholder hue so each mock thumbnail looks distinct. */
  hue: number;
}

interface SessionCaptureValue {
  area: string | null;
  photos: CapturedPhoto[];
  lastSubmittedCount: number | null;
  setArea: (area: string) => void;
  addPhoto: () => void;
  removePhoto: (id: string) => void;
  clearSession: () => void;
  /** Finalize the submission: returns the photo count, then clears the session. */
  submitSession: () => number;
}

const SessionCaptureContext = createContext<SessionCaptureValue | null>(null);
const STORAGE_KEY = "5s.capture.session";

export function SessionCaptureProvider({ children }: { children: ReactNode }) {
  const [area, setAreaState] = useState<string | null>(null);
  const [photos, setPhotos] = useState<CapturedPhoto[]>([]);
  const [lastSubmittedCount, setLastSubmittedCount] = useState<number | null>(null);

  // Hydrate from sessionStorage on the client only (avoids SSR hydration mismatch).
  useEffect(() => {
    try {
      const raw = sessionStorage.getItem(STORAGE_KEY);
      if (raw) {
        const data = JSON.parse(raw) as { area?: string | null; photos?: CapturedPhoto[] };
        setAreaState(data.area ?? null);
        setPhotos(Array.isArray(data.photos) ? data.photos : []);
      }
    } catch {
      /* ignore corrupt storage */
    }
  }, []);

  // Persist on change.
  useEffect(() => {
    try {
      sessionStorage.setItem(STORAGE_KEY, JSON.stringify({ area, photos }));
    } catch {
      /* storage may be unavailable (private mode) — non-fatal */
    }
  }, [area, photos]);

  const setArea = useCallback((a: string) => setAreaState(a), []);

  const addPhoto = useCallback(() => {
    setPhotos((prev) => {
      const now = new Date();
      const hh = String(now.getHours()).padStart(2, "0");
      const mm = String(now.getMinutes()).padStart(2, "0");
      const id = `${now.getTime()}-${prev.length + 1}`;
      const hue = (prev.length * 47 + 200) % 360;
      return [...prev, { id, area: area ?? "—", capturedAt: `${hh}:${mm}`, hue }];
    });
  }, [area]);

  const removePhoto = useCallback((id: string) => {
    setPhotos((prev) => prev.filter((p) => p.id !== id));
  }, []);

  const clearSession = useCallback(() => {
    setPhotos([]);
    setAreaState(null);
  }, []);

  const submitSession = useCallback(() => {
    let count = 0;
    setPhotos((prev) => {
      count = prev.length;
      return [];
    });
    setAreaState(null);
    setLastSubmittedCount(count);
    return count;
  }, []);

  return (
    <SessionCaptureContext.Provider
      value={{
        area,
        photos,
        lastSubmittedCount,
        setArea,
        addPhoto,
        removePhoto,
        clearSession,
        submitSession,
      }}
    >
      {children}
    </SessionCaptureContext.Provider>
  );
}

export function useSessionCapture(): SessionCaptureValue {
  const ctx = useContext(SessionCaptureContext);
  if (!ctx) {
    throw new Error("useSessionCapture must be used within SessionCaptureProvider");
  }
  return ctx;
}

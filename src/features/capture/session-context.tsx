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
 * Capture session store (Phase 1C — multi-photo submission, local/mock only).
 *
 * Model: 1 SubmissionSession = N SessionPhoto. Draft session + a mock submitted
 * history are persisted in localStorage. NO SharePoint / upload / watermark here
 * (those are future Phase 2A watermark / Phase 2C upload).
 */

export interface SessionPhoto {
  photoId: string;
  localUrl: string; // data URL (real captured frame or simulated placeholder)
  capturedAt: string; // ISO timestamp
  latitude?: number;
  longitude?: number;
  address?: string;
  status: "draft" | "ready";
}

export interface SubmissionSession {
  sessionId: string;
  departmentCode: string;
  departmentName?: string;
  areaCode: string;
  areaName: string;
  reporterName: string;
  reporterEmail: string;
  startedAt: string; // ISO
  photos: SessionPhoto[];
}

export interface SubmittedSummary {
  sessionId: string;
  departmentCode: string;
  departmentName?: string;
  areaName: string;
  reporterName: string;
  photoCount: number;
  startedAt: string;
  submittedAt: string; // ISO
}

interface StartArgs {
  departmentCode: string;
  departmentName?: string;
  areaCode: string;
  areaName: string;
  reporterName: string;
  reporterEmail: string;
}

interface AddPhotoArgs {
  localUrl: string;
  latitude?: number;
  longitude?: number;
  address?: string;
}

interface SessionCaptureValue {
  session: SubmissionSession | null;
  history: SubmittedSummary[];
  lastSubmitted: SubmittedSummary | null;
  startSession: (args: StartArgs) => void;
  addPhoto: (photo: AddPhotoArgs) => void;
  removePhoto: (photoId: string) => void;
  clearSession: () => void;
  submitSession: () => SubmittedSummary | null;
}

const SessionCaptureContext = createContext<SessionCaptureValue | null>(null);
const SESSION_KEY = "5s.session.v2";
const HISTORY_KEY = "5s.history.v2";

function nowIso(): string {
  return new Date().toISOString();
}

export function SessionCaptureProvider({ children }: { children: ReactNode }) {
  const [session, setSession] = useState<SubmissionSession | null>(null);
  const [history, setHistory] = useState<SubmittedSummary[]>([]);
  const [lastSubmitted, setLastSubmitted] = useState<SubmittedSummary | null>(null);

  // Hydrate from localStorage (client only).
  useEffect(() => {
    try {
      const s = localStorage.getItem(SESSION_KEY);
      if (s) setSession(JSON.parse(s) as SubmissionSession);
      const h = localStorage.getItem(HISTORY_KEY);
      if (h) setHistory(JSON.parse(h) as SubmittedSummary[]);
    } catch {
      /* ignore corrupt storage */
    }
  }, []);

  // Persist session.
  useEffect(() => {
    try {
      if (session) localStorage.setItem(SESSION_KEY, JSON.stringify(session));
      else localStorage.removeItem(SESSION_KEY);
    } catch {
      /* storage may be unavailable / quota exceeded — non-fatal */
    }
  }, [session]);

  // Persist history.
  useEffect(() => {
    try {
      localStorage.setItem(HISTORY_KEY, JSON.stringify(history));
    } catch {
      /* non-fatal */
    }
  }, [history]);

  const startSession = useCallback((args: StartArgs) => {
    setSession({
      sessionId: `s-${Date.now()}`,
      ...args,
      startedAt: nowIso(),
      photos: [],
    });
  }, []);

  const addPhoto = useCallback((photo: AddPhotoArgs) => {
    setSession((prev) => {
      if (!prev) return prev;
      const seq = prev.photos.length + 1;
      const next: SessionPhoto = {
        photoId: `p-${Date.now()}-${seq}`,
        localUrl: photo.localUrl,
        capturedAt: nowIso(),
        latitude: photo.latitude,
        longitude: photo.longitude,
        address: photo.address,
        status: "ready",
      };
      return { ...prev, photos: [...prev.photos, next] };
    });
  }, []);

  const removePhoto = useCallback((photoId: string) => {
    setSession((prev) =>
      prev ? { ...prev, photos: prev.photos.filter((p) => p.photoId !== photoId) } : prev,
    );
  }, []);

  const clearSession = useCallback(() => setSession(null), []);

  const submitSession = useCallback((): SubmittedSummary | null => {
    let summary: SubmittedSummary | null = null;
    setSession((prev) => {
      if (!prev || prev.photos.length === 0) return prev;
      summary = {
        sessionId: prev.sessionId,
        departmentCode: prev.departmentCode,
        departmentName: prev.departmentName,
        areaName: prev.areaName,
        reporterName: prev.reporterName,
        photoCount: prev.photos.length,
        startedAt: prev.startedAt,
        submittedAt: nowIso(),
      };
      return null; // clear draft after submit
    });
    if (summary) {
      setLastSubmitted(summary);
      setHistory((prev) => [summary as SubmittedSummary, ...prev]);
    }
    return summary;
  }, []);

  return (
    <SessionCaptureContext.Provider
      value={{
        session,
        history,
        lastSubmitted,
        startSession,
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
  if (!ctx) throw new Error("useSessionCapture must be used within SessionCaptureProvider");
  return ctx;
}

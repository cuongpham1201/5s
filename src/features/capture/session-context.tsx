"use client";

import {
  createContext,
  useCallback,
  useContext,
  useEffect,
  useState,
  type ReactNode,
} from "react";
import type {
  CompletedSubmission,
  PendingCapture,
  SessionPhoto,
  SubmissionSession,
} from "@/types/submission";
import * as store from "@/lib/submissions/local-submission-store";

/**
 * Capture session context (Phase 2A) — React state mirror over the local store.
 * The store (localStorage) is the persistence authority; this context exposes a
 * reactive view + a transient pending capture awaiting watermark on /preview.
 * NO upload / SharePoint here.
 */

interface StartArgs {
  departmentCode: string;
  departmentName?: string;
  areaCode: string;
  areaName: string;
  reporterName: string;
  reporterEmail: string;
}

interface SessionCaptureValue {
  session: SubmissionSession | null;
  history: CompletedSubmission[];
  lastCompleted: CompletedSubmission | null;
  pendingCapture: PendingCapture | null;
  startSession: (args: StartArgs) => void;
  setPendingCapture: (p: PendingCapture | null) => void;
  addPhoto: (photo: SessionPhoto) => void;
  removePhoto: (photoId: string) => void;
  clearSession: () => void;
  completeSession: () => CompletedSubmission | null;
}

const Ctx = createContext<SessionCaptureValue | null>(null);

export function SessionCaptureProvider({ children }: { children: ReactNode }) {
  const [session, setSession] = useState<SubmissionSession | null>(null);
  const [history, setHistory] = useState<CompletedSubmission[]>([]);
  const [lastCompleted, setLastCompleted] = useState<CompletedSubmission | null>(null);
  const [pendingCapture, setPendingCapture] = useState<PendingCapture | null>(null);

  // Hydrate from the local store (client only).
  useEffect(() => {
    setSession(store.getCurrentSession());
    setHistory(store.listCompletedSubmissions());
  }, []);

  const startSession = useCallback((args: StartArgs) => {
    const next: SubmissionSession = {
      sessionId: `s-${Date.now()}`,
      ...args,
      startedAt: new Date().toISOString(),
      photos: [],
    };
    store.saveCurrentSession(next);
    setSession(next);
    setPendingCapture(null);
  }, []);

  const addPhoto = useCallback((photo: SessionPhoto) => {
    const updated = store.addPhotoToSession(photo);
    if (updated) setSession(updated);
  }, []);

  const removePhoto = useCallback((photoId: string) => {
    const updated = store.removePhotoFromSession(photoId);
    setSession(updated);
  }, []);

  const clearSession = useCallback(() => {
    store.clearCurrentSession();
    setSession(null);
    setPendingCapture(null);
  }, []);

  const completeSession = useCallback((): CompletedSubmission | null => {
    const completed = store.completeCurrentSession();
    if (completed) {
      setSession(null);
      setPendingCapture(null);
      setHistory(store.listCompletedSubmissions());
      setLastCompleted(completed);
    }
    return completed;
  }, []);

  return (
    <Ctx.Provider
      value={{
        session,
        history,
        lastCompleted,
        pendingCapture,
        startSession,
        setPendingCapture,
        addPhoto,
        removePhoto,
        clearSession,
        completeSession,
      }}
    >
      {children}
    </Ctx.Provider>
  );
}

export function useSessionCapture(): SessionCaptureValue {
  const ctx = useContext(Ctx);
  if (!ctx) throw new Error("useSessionCapture must be used within SessionCaptureProvider");
  return ctx;
}

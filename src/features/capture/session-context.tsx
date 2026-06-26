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
import { deletePhoto, deletePhotosBySubmission } from "@/lib/storage/photo-store";
import { enqueueSubmission } from "@/lib/queue/offline-queue";
import { processQueue } from "@/lib/queue/sync-engine";
import { generateSubmissionId } from "@/lib/submissions/submission-id";

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
  checkItemCode?: string;
  checkItemName?: string;
  reporterName: string;
  reporterEmail: string;
}

interface SessionCaptureValue {
  /** True once the local store has been read on the client (guards avoid redirecting before this). */
  hydrated: boolean;
  session: SubmissionSession | null;
  history: CompletedSubmission[];
  lastCompleted: CompletedSubmission | null;
  pendingCapture: PendingCapture | null;
  startSession: (args: StartArgs) => SubmissionSession;
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
  const [hydrated, setHydrated] = useState(false);

  // Hydrate from the local store (client only). `hydrated` flips true AFTER this
  // so route guards never redirect during the null window on a fresh/refresh load.
  useEffect(() => {
    setSession(store.getCurrentSession());
    setHistory(store.listCompletedSubmissions());
    setHydrated(true);
  }, []);

  const startSession = useCallback((args: StartArgs): SubmissionSession => {
    const next: SubmissionSession = {
      // sessionId doubles as the submissionId (IndexedDB grouping key, queue key,
      // SharePoint folder name, and Data_Submissions business key).
      sessionId: generateSubmissionId(),
      ...args,
      startedAt: new Date().toISOString(),
      photos: [],
    };
    // Persist to localStorage FIRST (synchronous) so a fresh load of /camera can
    // re-hydrate the session even if React state didn't carry across navigation.
    const saved = store.saveCurrentSession(next);
    if (!saved && process.env.NODE_ENV !== "production") {
      console.warn("[capture] saveCurrentSession returned false (localStorage quota/unavailable).");
    }
    setSession(next);
    setPendingCapture(null);
    return next;
  }, []);

  const addPhoto = useCallback((photo: SessionPhoto) => {
    const updated = store.addPhotoToSession(photo);
    if (updated) setSession(updated);
  }, []);

  const removePhoto = useCallback((photoId: string) => {
    const updated = store.removePhotoFromSession(photoId);
    setSession(updated);
    void deletePhoto(photoId); // drop the binary from IndexedDB too
  }, []);

  const clearSession = useCallback(() => {
    const current = store.getCurrentSession();
    store.clearCurrentSession();
    setSession(null);
    setPendingCapture(null);
    if (current) void deletePhotosBySubmission(current.sessionId);
  }, []);

  const completeSession = useCallback((): CompletedSubmission | null => {
    const completed = store.completeCurrentSession();
    if (completed) {
      setSession(null);
      setPendingCapture(null);
      setHistory(store.listCompletedSubmissions());
      setLastCompleted(completed);
      // Create an offline queue item, then mock-sync if online (no network/SharePoint).
      enqueueSubmission(completed.submissionId);
      void processQueue();
    }
    return completed;
  }, []);

  return (
    <Ctx.Provider
      value={{
        hydrated,
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

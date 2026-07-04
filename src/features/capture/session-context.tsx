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
import { clog, ctrace } from "@/lib/debug/capture-debug";

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
  /** "3s" cho phiên Thực hành 3S (mặc định daily). */
  submissionType?: "daily" | "3s";
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
    clog("ctx.hydrate:begin", {});
    const loaded = store.getCurrentSession();
    setSession(loaded);
    setHistory(store.listCompletedSubmissions());
    setHydrated(true);
    clog("ctx.hydrate:end", { loadedSessionId: loaded?.sessionId ?? null, loadedPhotoCount: loaded?.photos.length ?? 0 });
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
    clog("ctx.startSession", { sessionId: next.sessionId, savedToLocalStorage: saved, areaCode: next.areaCode, checkItemCode: next.checkItemCode ?? null });
    setSession(next);
    setPendingCapture(null);
    return next;
  }, []);

  const addPhoto = useCallback((photo: SessionPhoto) => {
    const updated = store.addPhotoToSession(photo);
    clog("ctx.addPhoto", { photoId: photo.photoId, ok: !!updated, newPhotoCount: updated?.photos.length ?? null });
    if (updated) setSession(updated);
  }, []);

  const removePhoto = useCallback((photoId: string) => {
    const updated = store.removePhotoFromSession(photoId);
    setSession(updated);
    void deletePhoto(photoId); // drop the binary from IndexedDB too
  }, []);

  const clearSession = useCallback(() => {
    const current = store.getCurrentSession();
    clog("ctx.clearSession", { sessionId: current?.sessionId ?? null });
    store.clearCurrentSession();
    setSession(null);
    setPendingCapture(null);
    if (current) void deletePhotosBySubmission(current.sessionId);
  }, []);

  const completeSession = useCallback((): CompletedSubmission | null => {
    const before = store.getCurrentSession();
    ctrace("ctx.completeSession:before", { sessionId: before?.sessionId ?? null, photoCount: before?.photos.length ?? 0 });
    // Hard guard: never create a completed/queued record with 0 photos.
    if (!before || before.photos.length === 0) {
      ctrace("ctx.completeSession:empty-blocked", { sessionId: before?.sessionId ?? null });
      return null;
    }
    const completed = store.completeCurrentSession();
    ctrace("ctx.completeSession:after", { submissionId: completed?.submissionId ?? null, photoCount: completed?.photoCount ?? 0 });
    if (completed && completed.photoCount > 0) {
      setSession(null);
      setPendingCapture(null);
      setHistory(store.listCompletedSubmissions());
      setLastCompleted(completed);
      // Persist last-completed id so the success page survives a PWA reload.
      try { window.localStorage.setItem("5s.lastCompletedId", completed.submissionId); } catch { /* ignore */ }
      const q = enqueueSubmission(completed.submissionId);
      ctrace("ctx.completeSession:queued", { submissionId: completed.submissionId, queueId: q.queueId, status: q.status });
      void processQueue();
      return completed;
    }
    return null;
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

"use client";

import { useEffect, useState } from "react";
import { useSessionCapture } from "@/features/capture/session-context";
import { listPhotosBySubmission } from "@/lib/storage/photo-store";
import { getCurrentSession } from "@/lib/submissions/local-submission-store";
import { captureDebugEnabled, getCaptureDebugState } from "@/lib/debug/capture-debug";

/**
 * Temporary on-screen capture diagnostics. Rendered only when
 * NEXT_PUBLIC_CAPTURE_DEBUG=true (inlined at build). Hidden otherwise.
 */
export function CaptureDebugPanel({ where }: { where: string }) {
  const { hydrated, session, pendingCapture } = useSessionCapture();
  const [idbCount, setIdbCount] = useState<number | null>(null);
  const [lsExists, setLsExists] = useState(false);
  const [dbg, setDbg] = useState(getCaptureDebugState());

  useEffect(() => {
    if (!captureDebugEnabled()) return;
    let active = true;
    const tick = async () => {
      if (!active) return;
      setDbg(getCaptureDebugState());
      setLsExists(!!getCurrentSession());
      if (session?.sessionId) {
        const n = (await listPhotosBySubmission(session.sessionId)).length;
        if (active) setIdbCount(n);
      } else {
        setIdbCount(null);
      }
    };
    void tick();
    const iv = setInterval(tick, 1000);
    return () => { active = false; clearInterval(iv); };
  }, [session?.sessionId]);

  if (!captureDebugEnabled()) return null;

  const Row = ({ k, v }: { k: string; v: string }) => (
    <div className="flex justify-between gap-3">
      <span className="opacity-70">{k}</span>
      <span className="font-mono text-right break-all">{v}</span>
    </div>
  );

  return (
    <div className="fixed bottom-2 left-2 right-2 z-[200] rounded-lg bg-black/85 text-white text-[11px] leading-tight p-3 shadow-e4 max-h-[45vh] overflow-y-auto pointer-events-auto">
      <div className="font-bold mb-1.5">🐞 5S_CAPTURE_DEBUG · {where}</div>
      <Row k="hydrated" v={String(hydrated)} />
      <Row k="sessionId" v={session?.sessionId ?? "—"} />
      <Row k="session photos" v={String(session?.photos.length ?? 0)} />
      <Row k="pendingCapture" v={pendingCapture ? "yes" : "no"} />
      <Row k="IndexedDB photos" v={idbCount == null ? "—" : String(idbCount)} />
      <Row k="localStorage session" v={lsExists ? "yes" : "no"} />
      <Row k="last action" v={dbg.lastAction ? `${dbg.lastAction}${dbg.lastActionAt ? " @" + dbg.lastActionAt.slice(11, 19) : ""}` : "—"} />
      <Row k="last error" v={dbg.lastError ?? "—"} />
    </div>
  );
}

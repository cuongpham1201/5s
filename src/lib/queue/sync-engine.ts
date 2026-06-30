/**
 * Sync engine (Phase 3.0) — REAL upload to SharePoint via /api/sync/submission.
 *
 * For each queued/failed submission it reads the completed metadata
 * (localStorage) + photo blobs (IndexedDB), posts them as multipart/form-data to
 * the server sync endpoint (which holds the app-only Graph token), and updates
 * queue + local-history status. On success the local blobs are dropped (the
 * photos now live in SharePoint and read pages load them via the proxy); on
 * failure the blobs are kept for a later retry. Online-gated, reentrancy-guarded.
 */
import { getQueue, updateStatus, findBySubmission } from "./offline-queue";
import { getCompletedSubmissionById, setSubmissionUploadStatus } from "@/lib/submissions/local-submission-store";
import { listPhotosBySubmission, deletePhotosBySubmission } from "@/lib/storage/photo-store";
import { trace } from "@/lib/debug/trace";
import type { StoredPhoto } from "@/lib/storage/storage-types";
import type { CompletedSubmission, SessionPhoto } from "@/types/submission";

let running = false;

/** Max upload attempts before an item stays terminally "failed" (no infinite retry). */
const MAX_ATTEMPTS = 5;

const qlog = (action: string, data: Record<string, unknown>) => trace("[5S_SYNC_TRACE]", action, data);

function isOffline(): boolean {
  return typeof navigator !== "undefined" && navigator.onLine === false;
}

const UPLOAD_TIMEOUT_MS = 120_000;

interface PayloadItem { seq: number; original: Blob; watermarked: Blob; name: { o: string; w: string } }
interface Payload { meta: Record<string, unknown>; items: PayloadItem[]; totalBytes: number }

/** Collect the ordered photo pairs + meta for a submission. null if no usable blobs. */
async function collectPayload(sub: CompletedSubmission, attemptCount: number, queueId: string): Promise<Payload | null> {
  qlog("buildForm:start", { submissionId: sub.submissionId, sessionPhotos: sub.photos?.length ?? 0 });
  const stored = await listPhotosBySubmission(sub.submissionId);
  qlog("buildForm", { submissionId: sub.submissionId, idbPhotos: stored.length });
  if (stored.length === 0) { qlog("buildForm:no-blobs", { submissionId: sub.submissionId }); return null; }
  const byId = new Map<string, StoredPhoto>(stored.map((p) => [p.photoId, p]));
  const ordered: SessionPhoto[] = sub.photos?.length
    ? sub.photos.filter((p) => byId.has(p.photoId))
    : stored.map((s) => ({ photoId: s.photoId, submissionId: s.submissionId, capturedAt: s.createdAt, watermarkMetadata: undefined as never, latitude: null, longitude: null, address: "", status: "ready" }));

  const items: PayloadItem[] = [];
  const metaPhotos: Array<{ seqNo: number; capturedAt: string; latitude: number | null; longitude: number | null; address: string | null }> = [];
  let seq = 0; let totalBytes = 0;
  for (const sp of ordered) {
    const blob = byId.get(sp.photoId);
    if (!blob || (blob.originalBlob?.size ?? 0) === 0 || (blob.watermarkedBlob?.size ?? 0) === 0) continue;
    seq += 1;
    qlog("buildForm:photo", { submissionId: sub.submissionId, seq, photoId: sp.photoId, originalBytes: blob.originalBlob.size, originalType: blob.originalBlob.type, watermarkedBytes: blob.watermarkedBlob.size, watermarkedType: blob.watermarkedBlob.type });
    items.push({ seq, original: blob.originalBlob, watermarked: blob.watermarkedBlob, name: { o: `original-${String(seq).padStart(2, "0")}.jpg`, w: `watermarked-${String(seq).padStart(2, "0")}.jpg` } });
    totalBytes += blob.originalBlob.size + blob.watermarkedBlob.size;
    metaPhotos.push({ seqNo: seq, capturedAt: sp.capturedAt ?? blob.createdAt, latitude: sp.latitude ?? null, longitude: sp.longitude ?? null, address: sp.address ?? null });
  }
  if (items.length === 0) { qlog("buildForm:no-matching-blobs", { submissionId: sub.submissionId, stored: stored.length }); return null; }

  const first = ordered[0];
  const meta = {
    submissionId: sub.submissionId, departmentCode: sub.departmentCode, areaCode: sub.areaCode, areaName: sub.areaName,
    reporterName: sub.reporterName, reporterEmail: sub.reporterEmail, submittedAt: sub.submittedAt, queueId, attemptCount,
    latitude: first?.latitude ?? null, longitude: first?.longitude ?? null, address: first?.address ?? null, photos: metaPhotos,
  };
  qlog("buildForm:ready", { submissionId: sub.submissionId, photos: items.length, totalBytes });
  return { meta, items, totalBytes };
}

/** iOS Safari is more reliable with File than raw Blob in multipart. */
function toFile(blob: Blob, name: string): File {
  return new File([blob], name, { type: blob.type || "image/jpeg", lastModified: Date.now() });
}

function buildFormData(p: Payload): FormData {
  const form = new FormData();
  form.append("meta", JSON.stringify(p.meta));
  for (const it of p.items) {
    form.append(`original_${it.seq}`, toFile(it.original, it.name.o), it.name.o);
    form.append(`watermarked_${it.seq}`, toFile(it.watermarked, it.name.w), it.name.w);
  }
  return form;
}

/** Bytes → base64 (chunked btoa; safe for large arrays without arg-limit overflow). */
function bytesToBase64(bytes: Uint8Array): string {
  let bin = "";
  const CH = 0x8000;
  for (let i = 0; i < bytes.length; i += CH) {
    bin += String.fromCharCode(...bytes.subarray(i, i + CH));
  }
  return btoa(bin);
}

/**
 * Blob → base64. PRIMARY path is blob.arrayBuffer() (reliable in iOS/Teams WebView);
 * FileReader is only a last-resort fallback (it was the cause of "FileReader failed").
 */
async function blobToBase64(blob: Blob): Promise<{ base64: string; method: string }> {
  try {
    const buf = await blob.arrayBuffer();
    return { base64: bytesToBase64(new Uint8Array(buf)), method: "arrayBuffer" };
  } catch (e1) {
    qlog("base64.arrayBuffer:failed", { size: blob.size, message: (e1 as Error)?.message });
    try {
      const b64 = await new Promise<string>((resolve, reject) => {
        const fr = new FileReader();
        fr.onload = () => { const s = String(fr.result); resolve(s.slice(s.indexOf(",") + 1)); };
        fr.onerror = () => reject(new Error("FileReader failed"));
        fr.readAsDataURL(blob);
      });
      return { base64: b64, method: "filereader" };
    } catch (e2) {
      throw new Error(`BASE64_FAILED: ${(e2 as Error)?.message ?? "encode error"} (size=${blob.size})`);
    }
  }
}

async function buildJsonBody(p: Payload): Promise<string> {
  const files: Record<string, { filename: string; mime: string; base64: string }> = {};
  let method = "";
  for (const it of p.items) {
    const o = await blobToBase64(it.original);
    const w = await blobToBase64(it.watermarked);
    method = w.method;
    files[`original_${it.seq}`] = { filename: it.name.o, mime: it.original.type || "image/jpeg", base64: o.base64 };
    files[`watermarked_${it.seq}`] = { filename: it.name.w, mime: it.watermarked.type || "image/jpeg", base64: w.base64 };
  }
  qlog("upload.fallback:encode", { submissionId: String(p.meta.submissionId), method, totalBytes: p.totalBytes, env: envDetail() });
  return JSON.stringify({ meta: p.meta, files });
}

function fetchWithTimeout(url: string, init: RequestInit): Promise<Response> {
  const ctrl = new AbortController();
  const t = setTimeout(() => ctrl.abort(), UPLOAD_TIMEOUT_MS);
  return fetch(url, { ...init, signal: ctrl.signal }).finally(() => clearTimeout(t));
}

function envDetail(): string {
  const nav = typeof navigator !== "undefined" ? navigator : ({} as Navigator);
  const ua = nav.userAgent ?? "";
  const standalone = (typeof window !== "undefined" && window.matchMedia?.("(display-mode: standalone)").matches) || (nav as unknown as { standalone?: boolean }).standalone === true;
  const ios = /iPhone|iPad|iPod/i.test(ua);
  const safari = /Safari/i.test(ua) && !/CriOS|FxiOS|Chrome|Edg/i.test(ua);
  const teams = /Teams|MSTeams/i.test(ua);
  return `online=${typeof navigator !== "undefined" ? navigator.onLine : "?"} vis=${typeof document !== "undefined" ? document.visibilityState : "?"} pwa=${standalone} ios=${ios} safari=${safari} teams=${teams}`;
}

/** Parse a sync response; throw a structured error on HTTP/app failure. */
async function handleResponse(res: Response, submissionId: string, mode: string, t0: number): Promise<void> {
  const body = (await res.json().catch(() => ({}))) as { ok?: boolean; errorCode?: string; message?: string; error?: string };
  if (!res.ok || body.ok === false) {
    const msg = body.message ?? body.error ?? `HTTP ${res.status}`;
    qlog(`upload.${mode}:response`, { submissionId, ok: false, status: res.status, errorCode: body.errorCode, message: msg, durationMs: Date.now() - t0 });
    throw new Error(`${body.errorCode ?? "HTTP_" + res.status}: ${msg}`);
  }
  qlog(`upload.${mode}:response`, { submissionId, ok: true, status: res.status, durationMs: Date.now() - t0 });
}

/**
 * Upload one submission. Tries multipart first; if the fetch THROWS (network /
 * "Load failed" — common on iOS PWA) it falls back to the JSON/base64 endpoint.
 * A normal HTTP error from the server is NOT retried via fallback.
 */
async function uploadOne(submissionId: string, attemptCount: number, queueId: string): Promise<void> {
  const t0 = Date.now();
  const sub = getCompletedSubmissionById(submissionId);
  if (!sub) throw new Error("Không tìm thấy dữ liệu lần gửi cục bộ.");
  const payload = await collectPayload(sub, attemptCount, queueId);
  if (!payload) throw new Error("Không tìm thấy ảnh cục bộ để tải lên (blob trống/mất).");

  qlog("upload.request.detail", {
    url: "/api/sync/submission", method: "POST", photoCount: payload.items.length, totalBytes: payload.totalBytes, hasFormData: true,
    files: payload.items.flatMap((it) => [{ key: `original_${it.seq}`, name: it.name.o, size: it.original.size, type: it.original.type }, { key: `watermarked_${it.seq}`, name: it.name.w, size: it.watermarked.size, type: it.watermarked.type }]),
  });

  let res: Response;
  try {
    res = await fetchWithTimeout("/api/sync/submission", { method: "POST", body: buildFormData(payload) });
  } catch (e) {
    // fetch threw → transport failure (never reached server) → JSON fallback.
    const err = e as Error;
    qlog("upload.error", { submissionId, name: err?.name, message: err?.message, env: envDetail(), durationMs: Date.now() - t0 });
    qlog("upload.fallback:start", { submissionId, reason: `${err?.name}: ${err?.message}` });
    try {
      const res2 = await fetchWithTimeout("/api/sync/submission-json", { method: "POST", headers: { "Content-Type": "application/json" }, body: await buildJsonBody(payload) });
      await handleResponse(res2, submissionId, "fallback", t0);
      return;
    } catch (e2) {
      const err2 = e2 as Error;
      // If fallback itself threw at fetch (not a structured server error), tag NETWORK.
      const isNet = err2?.name === "AbortError" || err2?.name === "TypeError" || /load failed|network|fetch/i.test(err2?.message ?? "");
      qlog("upload.fallback:error", { submissionId, name: err2?.name, message: err2?.message, env: envDetail() });
      if (isNet) throw new Error(`NETWORK: ${err2?.name ?? "Error"} ${err2?.message ?? ""} | ${envDetail()}`.trim());
      throw err2; // structured server error from handleResponse
    }
  }
  await handleResponse(res, submissionId, "request", t0);
}

/**
 * Process queued + retryable-failed items. Online-gated, reentrancy-guarded.
 * Items that exhausted MAX_ATTEMPTS stay terminally "failed" (never stuck/looping).
 */
export async function processQueue(): Promise<number> {
  if (running || isOffline()) return 0;
  running = true;
  let processed = 0;
  const retryable = (q: { status: string; attemptCount: number }) =>
    q.status === "queued" || (q.status === "failed" && q.attemptCount < MAX_ATTEMPTS);
  try {
    let pending = getQueue().filter(retryable);
    qlog("queue.process:start", { pending: pending.length });
    while (pending.length > 0) {
      if (isOffline()) break;
      const item = pending[0];
      updateStatus(item.queueId, "uploading", true);
      const attempt = (findBySubmission(item.submissionId)?.attemptCount ?? item.attemptCount);
      try {
        await uploadOne(item.submissionId, attempt, item.queueId);
        updateStatus(item.queueId, "uploaded");
        setSubmissionUploadStatus(item.submissionId, "uploaded");
        await deletePhotosBySubmission(item.submissionId); // photos now in SharePoint
        processed += 1;
        qlog("queue.item:uploaded", { submissionId: item.submissionId, attempt });
      } catch (e) {
        const msg = (e as Error)?.message ?? "unknown";
        updateStatus(item.queueId, "failed", false, msg);
        setSubmissionUploadStatus(item.submissionId, "failed");
        qlog("queue.item:failed", { submissionId: item.submissionId, attempt, exhausted: attempt + 1 >= MAX_ATTEMPTS, error: msg });
      }
      pending = getQueue().filter(retryable);
      // Stop if the same item is still first (avoid tight loop within one pass).
      if (pending[0]?.queueId === item.queueId) break;
    }
    qlog("queue.process:end", { processed });
  } finally {
    running = false;
  }
  return processed;
}

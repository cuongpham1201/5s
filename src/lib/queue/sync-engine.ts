/**
 * Sync engine (Phase R1) — REAL upload to SharePoint via POST /api/upload/photos.
 *
 * For each queued/failed submission it reads the completed metadata
 * (localStorage) + photo blobs (IndexedDB), posts them as multipart/form-data to
 * the single upload endpoint (which holds the app-only Graph token), and updates
 * queue + local-history status. SUCCESS = server stored ≥1 photo row
 * (uploadedPhotoCount >= 1). No JSON/base64/FileReader fallback. On success the
 * local blobs are dropped (photos now live in SharePoint, read via the proxy); on
 * failure the blobs are kept for a later retry. Online-gated, reentrancy-guarded.
 */
import { getQueue, updateStatus, findBySubmission, recoverStuckUploads, markUnrecoverable, resetFailedForRetry } from "./offline-queue";
import { getCompletedSubmissionById, setSubmissionUploadStatus, setUploadResult } from "@/lib/submissions/local-submission-store";
import { listPhotosBySubmission, deletePhotosBySubmission, deletePhoto } from "@/lib/storage/photo-store";
import { trace } from "@/lib/debug/trace";
import { ulog, shipClientLogs } from "@/lib/debug/upload-log";
import type { StoredPhoto } from "@/lib/storage/storage-types";
import type { CompletedSubmission, SessionPhoto } from "@/types/submission";

let running = false;

/** Max upload attempts before an item stays terminally "failed" (no infinite retry). */
const MAX_ATTEMPTS = 5;

/** An "uploading" item older than this was crashed mid-upload → recover it. */
const STUCK_UPLOADING_MS = 180_000; // > UPLOAD_TIMEOUT_MS (120s) + margin

// qlog: DEBUG-gated console + ALWAYS persisted to the client evidence ring —
// a failing device carries its own timeline even when the POST never lands.
const qlog = (action: string, data: Record<string, unknown>) => { trace("[5S_SYNC_TRACE]", action, data); ulog(action, data); };

function isOffline(): boolean {
  return typeof navigator !== "undefined" && navigator.onLine === false;
}

const UPLOAD_TIMEOUT_MS = 120_000;

interface PayloadItem { seq: number; photoId: string; original: Blob; watermarked: Blob; name: { o: string; w: string } }
interface Payload { meta: Record<string, unknown>; items: PayloadItem[]; totalBytes: number }

/** Result of one upload attempt (server-confirmed). */
interface UploadOutcome {
  /** photoIds whose photos the server confirmed stored (safe to drop locally). */
  uploadedPhotoIds: string[];
  /** Photos that failed server-side (blobs must be KEPT for retry). */
  failedCount: number;
}

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
  // Client's claim of the bytes it is sending per seq — echoed back by the server
  // (diag) so a truncated part is provable from the response alone (no DEBUG_LOG).
  const clientParts: Array<{ seqNo: number; originalSize: number; watermarkedSize: number }> = [];
  let totalBytes = 0;
  for (let idx = 0; idx < ordered.length; idx++) {
    const sp = ordered[idx];
    // STABLE seq: derived from the photo's position in the session order, NOT from
    // a counter over usable blobs. After a PARTIAL upload (some photos stored, some
    // failed) the uploaded blobs are dropped locally; on retry the remaining photo
    // must keep its ORIGINAL seq — a renumbered seq would overwrite the already-
    // uploaded photo's PhotoId/file (P0 data-corruption).
    const seq = idx + 1;
    const blob = byId.get(sp.photoId);
    if (!blob || (blob.originalBlob?.size ?? 0) === 0 || (blob.watermarkedBlob?.size ?? 0) === 0) continue;
    // ROOT-CAUSE FIX (Safari): a Blob read back from IndexedDB is disk-backed and
    // lazily resolved. WebKit's multipart encoder can stream such a Blob as 0
    // bytes (most often the FIRST file part) even though .size is correct, which
    // the server then rejects as BAD_FILE. Reading arrayBuffer() once and wrapping
    // the bytes in a fresh in-memory Blob removes the disk-backed handle, so every
    // part carries real bytes. Blink/Gecko (desktop) buffer eagerly → never hit this.
    const [oBuf, wBuf] = await Promise.all([blob.originalBlob.arrayBuffer(), blob.watermarkedBlob.arrayBuffer()]);
    const original = new Blob([oBuf], { type: blob.originalBlob.type || "image/jpeg" });
    const watermarked = new Blob([wBuf], { type: blob.watermarkedBlob.type || "image/jpeg" });
    qlog("buildForm:photo", { submissionId: sub.submissionId, seq, photoId: sp.photoId, originalBytes: original.size, originalType: original.type, watermarkedBytes: watermarked.size, watermarkedType: watermarked.type, materialized: true });
    items.push({ seq, photoId: sp.photoId, original, watermarked, name: { o: `original-${String(seq).padStart(2, "0")}.jpg`, w: `watermarked-${String(seq).padStart(2, "0")}.jpg` } });
    totalBytes += original.size + watermarked.size;
    metaPhotos.push({ seqNo: seq, capturedAt: sp.capturedAt ?? blob.createdAt, latitude: sp.latitude ?? null, longitude: sp.longitude ?? null, address: sp.address ?? null });
    clientParts.push({ seqNo: seq, originalSize: original.size, watermarkedSize: watermarked.size });
  }
  if (items.length === 0) { qlog("buildForm:no-matching-blobs", { submissionId: sub.submissionId, stored: stored.length }); return null; }

  const first = ordered[0];
  const meta = {
    submissionId: sub.submissionId, departmentCode: sub.departmentCode, areaCode: sub.areaCode, areaName: sub.areaName,
    reporterName: sub.reporterName, reporterEmail: sub.reporterEmail, submittedAt: sub.submittedAt, queueId, attemptCount,
    latitude: first?.latitude ?? null, longitude: first?.longitude ?? null, address: first?.address ?? null, photos: metaPhotos,
    clientParts,
    // Correlation for server-side structured logs (requestId ties client attempt ↔
    // server entry; platform tells us iOS/PWA/Safari without needing device logs).
    requestId: `r-${Date.now().toString(36)}-${Math.floor(Math.random() * 1e9).toString(36)}`,
    platform: envDetail(),
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
 * Blob → base64, iPhone-safe 3-step chain (never logs base64 content):
 *   1) blob.arrayBuffer()  2) new Response(blob).arrayBuffer()  3) FileReader.
 * Used ONLY by the JSON fallback when the multipart fetch throws on iOS Safari.
 */
async function blobToBase64(blob: Blob): Promise<string> {
  try {
    return bytesToBase64(new Uint8Array(await blob.arrayBuffer()));
  } catch (e1) {
    qlog("base64.arrayBuffer:failed", { size: blob.size, message: (e1 as Error)?.message });
  }
  try {
    return bytesToBase64(new Uint8Array(await new Response(blob).arrayBuffer()));
  } catch (e2) {
    qlog("base64.response:failed", { size: blob.size, message: (e2 as Error)?.message });
  }
  return await new Promise<string>((resolve, reject) => {
    const fr = new FileReader();
    fr.onload = () => { const s = String(fr.result); resolve(s.slice(s.indexOf(",") + 1)); };
    fr.onerror = () => reject(new Error(`BASE64_FAILED: FileReader failed (size=${blob.size})`));
    fr.readAsDataURL(blob);
  });
}

/** Build the JSON fallback body: same meta, files as base64 keyed by seq. */
async function buildJsonBody(p: Payload): Promise<string> {
  const files: Record<string, { filename: string; mime: string; base64: string }> = {};
  for (const it of p.items) {
    files[`original_${it.seq}`] = { filename: it.name.o, mime: it.original.type || "image/jpeg", base64: await blobToBase64(it.original) };
    files[`watermarked_${it.seq}`] = { filename: it.name.w, mime: it.watermarked.type || "image/jpeg", base64: await blobToBase64(it.watermarked) };
  }
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

interface UploadResponse {
  ok?: boolean;
  uploadedPhotoCount?: number;
  failedPhotoCount?: number;
  photos?: Array<{ seqNo: number }>;
  errors?: Array<{ seqNo: number; errorCode: string; message: string }>;
  errorCode?: string;
  message?: string;
}

/**
 * Upload one submission to the single primary endpoint POST /api/upload/photos
 * (multipart). NO JSON/base64/FileReader fallback. Success = server stored ≥1
 * photo row (uploadedPhotoCount >= 1). The structured result is persisted for the
 * success page. A thrown fetch (offline / "Load failed") → retryable NETWORK error.
 */
async function uploadOne(submissionId: string, attemptCount: number, queueId: string): Promise<UploadOutcome> {
  const t0 = Date.now();
  ulog("client.submit.start", { submissionId, attemptCount });
  const sub = getCompletedSubmissionById(submissionId);
  if (!sub) throw new Error("Không tìm thấy dữ liệu lần gửi cục bộ.");
  const payload = await collectPayload(sub, attemptCount, queueId);
  // No usable local blob → cannot ever succeed by retrying; mark unrecoverable
  // (UI tells the user to re-capture) instead of looping retries.
  if (!payload) throw new Error("UNRECOVERABLE_NO_BLOB: Ảnh cục bộ không còn (đã bị xoá hoặc hỏng). Vui lòng chụp lại.");
  ulog("client.blobs.ready", { submissionId, photoCount: payload.items.length, totalBytes: payload.totalBytes });

  // Build the multipart body, then PROVE what the browser actually holds for each
  // part (key, filename, size, type) right before sending — this is the client
  // half of the BAD_FILE client↔server comparison.
  const form = buildFormData(payload);
  for (const [key, v] of form.entries()) {
    if (typeof v !== "string") {
      ulog("client.formdata.entry", { submissionId, key, filename: (v as File).name ?? null, size: (v as File).size, type: (v as File).type, isBlob: v instanceof Blob });
    }
  }

  // Shared verdict: success ONLY when the server confirms ≥1 stored photo row.
  // Returns which photoIds were confirmed stored so the caller can drop ONLY
  // those blobs and keep failed photos' blobs for retry.
  const settle = async (res: Response, mode: string): Promise<UploadOutcome> => {
    const body = (await res.json().catch(() => ({}))) as UploadResponse;
    const uploaded = body.uploadedPhotoCount ?? 0;
    const failed = body.failedPhotoCount ?? (body.errors?.length ?? 0);
    setUploadResult({ submissionId, ok: !!body.ok && uploaded >= 1, uploadedPhotoCount: uploaded, failedPhotoCount: failed, errors: body.errors ?? [], at: new Date().toISOString() });
    ulog("client.upload.response", { submissionId, mode, status: res.status, ok: body.ok, uploaded, failed, durationMs: Date.now() - t0 });
    if (res.ok && body.ok && uploaded >= 1) {
      const okSeqs = new Set((body.photos ?? []).map((p) => p.seqNo));
      // If the server didn't itemize photos (older shape), treat all sent as stored.
      const uploadedPhotoIds = okSeqs.size > 0
        ? payload.items.filter((it) => okSeqs.has(it.seq)).map((it) => it.photoId)
        : payload.items.map((it) => it.photoId);
      return { uploadedPhotoIds, failedCount: failed };
    }
    const first = body.errors?.[0];
    const code = body.errorCode ?? first?.errorCode ?? `HTTP_${res.status}`;
    const msg = body.message ?? first?.message ?? `Tải lên thất bại (HTTP ${res.status}).`;
    throw new Error(`${code}: ${msg}`);
  };

  try {
    ulog("client.upload.request", { submissionId, url: "/api/upload/photos", photoCount: payload.items.length });
    const res = await fetchWithTimeout("/api/upload/photos", { method: "POST", body: form });
    return await settle(res, "multipart");
  } catch (e) {
    const err = e as Error;
    // Only a TRANSPORT throw (fetch rejected — request never completed) falls back.
    // A structured server error from settle() is rethrown untouched (no retry here).
    const isTransport = err?.name === "AbortError" || err?.name === "TypeError" || /load failed|network|fetch/i.test(err?.message ?? "");
    if (!isTransport) throw err;
    // iOS Safari: multipart fetch can throw "Load failed" even with in-memory
    // blobs. Fall back to JSON/base64 on the SAME new endpoint family — this
    // fallback existed pre-R1 and its removal broke iPhone uploads entirely.
    ulog("client.upload.fallback", { submissionId, reason: `${err?.name}: ${err?.message}`, env: envDetail() });
    let res2: Response;
    try {
      res2 = await fetchWithTimeout("/api/upload/photos-json", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: await buildJsonBody(payload),
      });
    } catch (e2) {
      const err2 = e2 as Error;
      ulog("client.upload.response", { submissionId, mode: "json", ok: false, transport: "throw", name: err2?.name, message: err2?.message, env: envDetail(), durationMs: Date.now() - t0 });
      throw new Error(`NETWORK: ${err2?.name ?? "Error"} ${err2?.message ?? ""} | ${envDetail()}`.trim());
    }
    return await settle(res2, "json");
  }
}

/**
 * Process queued + retryable-failed items. Online-gated, reentrancy-guarded.
 * Items that exhausted MAX_ATTEMPTS stay terminally "failed" (never stuck/looping).
 */
export async function processQueue(opts: { manual?: boolean } = {}): Promise<number> {
  if (running || isOffline()) return 0;
  running = true;
  let processed = 0;
  // Rescue items left "uploading" by a killed app (iOS PWA) so they retry.
  const recovered = recoverStuckUploads(STUCK_UPLOADING_MS);
  // A user-initiated retry gives terminally-failed (but recoverable) items a
  // fresh set of attempts; auto runs keep the bounded MAX_ATTEMPTS behaviour.
  const reset = opts.manual ? resetFailedForRetry() : 0;
  if (recovered || reset) qlog("queue.recover", { recovered, reset, manual: !!opts.manual });
  const retryable = (q: { status: string; attemptCount: number; unrecoverable?: boolean }) =>
    q.status === "queued" || (q.status === "failed" && !q.unrecoverable && q.attemptCount < MAX_ATTEMPTS);
  try {
    let pending = getQueue().filter(retryable);
    qlog("queue.process:start", { pending: pending.length });
    while (pending.length > 0) {
      if (isOffline()) break;
      const item = pending[0];
      updateStatus(item.queueId, "uploading", true);
      const attempt = (findBySubmission(item.submissionId)?.attemptCount ?? item.attemptCount);
      try {
        const outcome = await uploadOne(item.submissionId, attempt, item.queueId);
        if (outcome.failedCount === 0) {
          // Full success: every declared photo stored → drop all local blobs.
          updateStatus(item.queueId, "uploaded");
          setSubmissionUploadStatus(item.submissionId, "uploaded");
          await deletePhotosBySubmission(item.submissionId); // photos now in SharePoint
          processed += 1;
          qlog("queue.item:uploaded", { submissionId: item.submissionId, attempt });
          shipClientLogs("uploaded");
        } else {
          // PARTIAL success: drop ONLY the confirmed photos' blobs; keep failed
          // photos' blobs and leave the item retryable so the remaining photos
          // re-send with their ORIGINAL (stable) seq — no overwrite, no data loss.
          for (const pid of outcome.uploadedPhotoIds) await deletePhoto(pid);
          updateStatus(item.queueId, "failed", false, `Còn ${outcome.failedCount} ảnh chưa gửi được — sẽ tự thử lại.`);
          setSubmissionUploadStatus(item.submissionId, "failed");
          qlog("queue.item:partial", { submissionId: item.submissionId, attempt, uploaded: outcome.uploadedPhotoIds.length, failed: outcome.failedCount });
          shipClientLogs("partial");
        }
      } catch (e) {
        const msg = (e as Error)?.message ?? "unknown";
        setSubmissionUploadStatus(item.submissionId, "failed");
        if (msg.startsWith("UNRECOVERABLE")) {
          const clean = msg.replace(/^UNRECOVERABLE_[A-Z_]+:\s*/, "");
          markUnrecoverable(item.queueId, clean);
          qlog("queue.item:unrecoverable", { submissionId: item.submissionId, attempt, error: clean });
        } else {
          updateStatus(item.queueId, "failed", false, msg);
          qlog("queue.item:failed", { submissionId: item.submissionId, attempt, exhausted: attempt + 1 >= MAX_ATTEMPTS, error: msg });
        }
        shipClientLogs("failed");
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

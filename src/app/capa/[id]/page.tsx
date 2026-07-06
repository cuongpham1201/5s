"use client";

import Link from "next/link";
import { useParams, useRouter } from "next/navigation";
import { useCallback, useEffect, useState } from "react";
import { AppShell } from "@/components/layout/AppShell";

interface Capa {
  capaId: string; submissionId: string; photoId: string; violationPhotoPath: string;
  departmentCode: string; areaCode: string; areaName: string; sTag: string | null;
  issueNote: string | null; reporterName: string | null; status: string; priority: string;
  assigneeEmail: string | null; assigneeName: string | null; dueDate: string | null;
  rootCause: string | null; preventiveAction: string | null; completionEvidence: string | null;
  evidencePhotoPaths: string[]; rejectionHistory: Array<{ count: number; note: string; rejectedAt: string; rejectedBy: string }>;
  reopenedCount: number; createdAt: string | null; closedAt: string | null; closedBy: string | null;
}
interface EviPhoto { watermarkedPath: string; photoKind?: string | null; submittedAt: string }

const STATUS_UI: Record<string, { label: string; cls: string }> = {
  open: { label: "Chưa xử lý", cls: "bg-danger-bg text-danger" },
  in_progress: { label: "Đang xử lý", cls: "bg-warning-bg text-warning" },
  pending_verification: { label: "Chờ xác minh", cls: "bg-info-bg text-info" },
  closed: { label: "Đã đóng", cls: "bg-success-bg text-success" },
};

function fmt(iso: string | null): string {
  if (!iso) return "—";
  const d = new Date(iso);
  const p = (n: number) => String(n).padStart(2, "0");
  return Number.isNaN(d.getTime()) ? "—" : `${p(d.getDate())}/${p(d.getMonth() + 1)}/${d.getFullYear()}`;
}

export default function CapaDetailPage() {
  const params = useParams<{ id: string }>();
  const router = useRouter();
  const capaId = decodeURIComponent(params.id);
  const [capa, setCapa] = useState<Capa | null>(null);
  const [isVerifier, setIsVerifier] = useState(false);
  const [isAssignee, setIsAssignee] = useState(false);
  const [loading, setLoading] = useState(true);
  const [busy, setBusy] = useState(false);
  const [msg, setMsg] = useState<string | null>(null);
  const [err, setErr] = useState<string | null>(null);
  // form
  const [rootCause, setRootCause] = useState("");
  const [preventive, setPreventive] = useState("");
  const [evidence, setEvidence] = useState("");
  const [selPhotos, setSelPhotos] = useState<string[]>([]);
  const [myPhotos, setMyPhotos] = useState<EviPhoto[]>([]);
  const [pickerOpen, setPickerOpen] = useState(false);
  // verifier
  const [assignEmail, setAssignEmail] = useState("");
  const [rejectNote, setRejectNote] = useState("");

  const load = useCallback(async () => {
    setLoading(true);
    try {
      const r = await fetch(`/api/capas/${encodeURIComponent(capaId)}`);
      const j = r.ok ? await r.json() : null;
      if (j?.capa) {
        setCapa(j.capa); setIsVerifier(!!j.isVerifier); setIsAssignee(!!j.isAssignee);
        setRootCause(j.capa.rootCause ?? ""); setPreventive(j.capa.preventiveAction ?? "");
        setEvidence(j.capa.completionEvidence ?? ""); setSelPhotos(j.capa.evidencePhotoPaths ?? []);
      }
    } finally { setLoading(false); }
  }, [capaId]);
  useEffect(() => { void load(); }, [load]);

  const flash = (ok: string | null, e: string | null) => { setMsg(ok); setErr(e); setTimeout(() => { setMsg(null); setErr(null); }, 4000); };

  const act = async (body: Record<string, unknown>, okMsg: string) => {
    setBusy(true);
    try {
      const r = await fetch(`/api/capas/${encodeURIComponent(capaId)}`, {
        method: "PATCH", headers: { "Content-Type": "application/json" }, body: JSON.stringify(body),
      });
      const j = await r.json();
      if (!r.ok || j.error) { flash(null, j.error ?? "Lỗi"); return; }
      flash(okMsg, null);
      await load();
    } finally { setBusy(false); }
  };

  const openPicker = async () => {
    setPickerOpen(true);
    const r = await fetch("/api/photos?type=3s&limit=60");
    const j = r.ok ? await r.json() : null;
    // Ưu tiên ảnh "Sau" / "Tốt" mới nhất làm bằng chứng khắc phục.
    setMyPhotos(((j?.photos ?? []) as EviPhoto[]).filter((p) => p.photoKind === "after" || p.photoKind === "good"));
  };
  const togglePhoto = (path: string) =>
    setSelPhotos((s) => (s.includes(path) ? s.filter((x) => x !== path) : [...s, path]));

  if (loading) return <AppShell><div className="p-6 text-ink-muted text-[13px]">Đang tải…</div></AppShell>;
  if (!capa) return <AppShell><div className="p-6 text-danger text-[13px]">Không tìm thấy CAPA hoặc bạn không có quyền xem.</div></AppShell>;

  const ui = STATUS_UI[capa.status] ?? STATUS_UI.open;
  const editable = (isAssignee || isVerifier) && capa.status !== "closed" && capa.status !== "pending_verification";

  return (
    <AppShell>
      <div className="flex items-center gap-3 px-4 pt-3 pb-2">
        <button onClick={() => router.back()} className="w-9 h-9 rounded-pill grid place-items-center text-lg bg-surface">←</button>
        <div className="flex-1 min-w-0">
          <div className="text-[16px] font-bold leading-tight truncate">Khắc phục · {capa.departmentCode} · {capa.areaName}</div>
          <div className="text-[11.5px] text-ink-muted font-mono truncate">{capa.capaId}</div>
        </div>
        <span className={`text-[11px] font-bold px-2 py-1 rounded-pill flex-none ${ui.cls}`}>{ui.label}</span>
      </div>

      <div className="px-4 pb-8 flex flex-col gap-3">
        {msg && <div className="rounded-md bg-success-bg text-success px-3.5 py-2.5 text-[13px] font-medium">{msg}</div>}
        {err && <div className="rounded-md bg-danger-bg text-danger px-3.5 py-2.5 text-[13px] font-medium">{err}</div>}

        {/* Vi phạm (ảnh TRƯỚC) */}
        <div className="card-flat p-3">
          <div className="text-[13px] font-semibold text-ink-muted mb-2">⚠ Vi phạm được ghi nhận {capa.sTag ? `· ${capa.sTag}` : ""}</div>
          {/* eslint-disable-next-line @next/next/no-img-element */}
          <img src={`/api/photo?path=${encodeURIComponent(capa.violationPhotoPath)}`} alt="Ảnh vi phạm" className="w-full max-h-[320px] object-contain rounded-md bg-surface" />
          {capa.issueNote && <div className="text-danger text-[13px] font-medium mt-2">⚠ {capa.issueNote}</div>}
          <div className="text-[12px] text-ink-muted mt-1.5">
            Người ghi nhận: {capa.reporterName ?? "—"} · Tạo: {fmt(capa.createdAt)} · Hạn: <b className="text-ink">{fmt(capa.dueDate)}</b>
          </div>
          <div className="text-[12px] text-ink-muted">Người xử lý: <b className="text-ink">{capa.assigneeName || capa.assigneeEmail || "Chưa giao"}</b></div>
        </div>

        {/* Lịch sử trả lại */}
        {capa.rejectionHistory.length > 0 && (
          <div className="rounded-md bg-warning-bg p-3 text-[12.5px]">
            <div className="font-semibold text-warning mb-1">↺ Lịch sử trả lại ({capa.reopenedCount})</div>
            {capa.rejectionHistory.map((h, i) => (
              <div key={i} className="text-ink-muted">#{h.count} · {fmt(h.rejectedAt)} · {h.rejectedBy}: <span className="text-ink">{h.note}</span></div>
            ))}
          </div>
        )}

        {/* Giao việc (verifier) */}
        {isVerifier && capa.status !== "closed" && (
          <div className="card-flat p-3">
            <div className="text-[13px] font-semibold text-ink-muted mb-2">Giao / chuyển người xử lý</div>
            <div className="flex gap-2">
              <input value={assignEmail} onChange={(e) => setAssignEmail(e.target.value)} placeholder="email người xử lý"
                className="flex-1 rounded-md border border-line px-3 py-2 text-[13px]" />
              <button onClick={() => void act({ action: "assign", assigneeEmail: assignEmail, assigneeName: assignEmail }, "Đã giao việc.")}
                disabled={busy || !assignEmail.trim()} className="btn btn-secondary !min-h-9">Giao</button>
            </div>
          </div>
        )}

        {/* Phần xử lý của người được giao */}
        <div className="card-flat p-3">
          <div className="text-[13px] font-semibold text-ink-muted mb-2">Nội dung khắc phục {isAssignee ? "(của bạn)" : ""}</div>
          <label className="text-[12.5px] font-semibold">Nguyên nhân gốc <span className="text-danger">*</span></label>
          <textarea value={rootCause} onChange={(e) => setRootCause(e.target.value)} disabled={!editable} rows={2}
            className="w-full mt-1 mb-2.5 rounded-md border border-line px-3 py-2 text-[13.5px] disabled:bg-surface" />
          <label className="text-[12.5px] font-semibold">Hành động phòng ngừa tái diễn</label>
          <textarea value={preventive} onChange={(e) => setPreventive(e.target.value)} disabled={!editable} rows={2}
            className="w-full mt-1 mb-2.5 rounded-md border border-line px-3 py-2 text-[13.5px] disabled:bg-surface" />
          <label className="text-[12.5px] font-semibold">Mô tả kết quả khắc phục</label>
          <textarea value={evidence} onChange={(e) => setEvidence(e.target.value)} disabled={!editable} rows={2}
            className="w-full mt-1 mb-2.5 rounded-md border border-line px-3 py-2 text-[13.5px] disabled:bg-surface" />

          <div className="text-[12.5px] font-semibold mb-1.5">Ảnh bằng chứng (SAU khắc phục) <span className="text-danger">*</span></div>
          {selPhotos.length > 0 && (
            <div className="grid grid-cols-4 gap-2 mb-2">
              {selPhotos.map((p) => (
                <div key={p} className="relative aspect-square rounded-md overflow-hidden bg-surface">
                  {/* eslint-disable-next-line @next/next/no-img-element */}
                  <img src={`/api/photo?path=${encodeURIComponent(p)}`} alt="" className="w-full h-full object-cover" />
                  {editable && (
                    <button onClick={() => togglePhoto(p)} className="absolute top-0.5 right-0.5 w-5 h-5 rounded-pill bg-black/60 text-white text-[11px]">✕</button>
                  )}
                </div>
              ))}
            </div>
          )}
          {editable && (
            <div className="flex flex-wrap gap-2">
              <Link href={`/3s`} className="btn btn-secondary !min-h-9 text-[13px]">📷 Chụp ảnh khắc phục (Audit 5S → loại &quot;Sau&quot;)</Link>
              <button onClick={() => void openPicker()} className="btn btn-secondary !min-h-9 text-[13px]">🖼 Chọn từ ảnh 3S đã chụp</button>
            </div>
          )}

          {pickerOpen && (
            <div className="mt-3 rounded-md border border-line p-2.5">
              <div className="flex items-center justify-between mb-2">
                <span className="text-[12.5px] font-semibold text-ink-muted">Ảnh Audit 5S gần đây (loại Sau/Tốt) — bấm để chọn</span>
                <button onClick={() => setPickerOpen(false)} className="text-[12px] underline text-ink-muted">Đóng</button>
              </div>
              {myPhotos.length === 0 ? (
                <div className="text-[12.5px] text-ink-muted p-2">Chưa có ảnh phù hợp — dùng nút &quot;Chụp ảnh khắc phục&quot; trước.</div>
              ) : (
                <div className="grid grid-cols-4 gap-2">
                  {myPhotos.map((p) => {
                    const on = selPhotos.includes(p.watermarkedPath);
                    return (
                      <button key={p.watermarkedPath} onClick={() => togglePhoto(p.watermarkedPath)}
                        className={`relative aspect-square rounded-md overflow-hidden ${on ? "ring-2 ring-primary-600" : ""}`}>
                        {/* eslint-disable-next-line @next/next/no-img-element */}
                        <img src={`/api/photo?path=${encodeURIComponent(p.watermarkedPath)}`} alt="" className="w-full h-full object-cover" />
                        {on && <span className="absolute top-0.5 right-0.5 w-5 h-5 rounded-pill bg-primary-600 text-white text-[11px] grid place-items-center">✓</span>}
                      </button>
                    );
                  })}
                </div>
              )}
            </div>
          )}

          {editable && (
            <div className="flex gap-2 mt-3">
              <button onClick={() => void act({ action: "update", rootCause, preventiveAction: preventive, completionEvidence: evidence, evidencePhotoPaths: selPhotos }, "Đã lưu nháp.")}
                disabled={busy} className="btn btn-secondary flex-1">Lưu nháp</button>
              {isAssignee && (
                <button onClick={async () => {
                  await act({ action: "update", rootCause, preventiveAction: preventive, completionEvidence: evidence, evidencePhotoPaths: selPhotos }, "");
                  await act({ action: "submit" }, "Đã nộp — chờ xác minh.");
                }} disabled={busy || !rootCause.trim() || selPhotos.length === 0} className="btn btn-primary flex-1">Nộp xác minh</button>
              )}
            </div>
          )}
        </div>

        {/* Duyệt / từ chối (verifier) */}
        {isVerifier && capa.status === "pending_verification" && (
          <div className="card-flat p-3">
            <div className="text-[13px] font-semibold text-ink-muted mb-2">Xác minh kết quả</div>
            <input value={rejectNote} onChange={(e) => setRejectNote(e.target.value)} placeholder="Lý do (khi từ chối)"
              className="w-full rounded-md border border-line px-3 py-2 text-[13px] mb-2" />
            <div className="flex gap-2">
              <button onClick={() => void act({ action: "reject", note: rejectNote }, "Đã trả lại để xử lý tiếp.")} disabled={busy} className="btn btn-danger flex-1">↺ Trả lại</button>
              <button onClick={() => void act({ action: "approve" }, "Đã duyệt — CAPA đóng.")} disabled={busy || isAssignee} className="btn btn-primary flex-1">✓ Duyệt & Đóng</button>
            </div>
            {isAssignee && <p className="text-[11.5px] text-ink-muted mt-1.5">Không thể tự duyệt việc của chính mình.</p>}
          </div>
        )}

        {capa.status === "closed" && (
          <div className="rounded-md bg-success-bg text-success px-3.5 py-2.5 text-[13px] font-medium">
            ✓ Đã đóng {fmt(capa.closedAt)} bởi {capa.closedBy ?? "—"}
          </div>
        )}
      </div>
    </AppShell>
  );
}

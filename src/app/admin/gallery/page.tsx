"use client";

import { useCallback, useEffect, useState } from "react";
import { AdminShell } from "@/components/layout/AdminShell";
import { PhotoViewerModal, type ViewerPhoto } from "@/components/media/PhotoViewerModal";

interface AdminPhoto {
  photoId: string;
  submissionId: string;
  seqNo: number;
  watermarkedPath: string;
  originalPath: string;
  departmentCode: string;
  areaName: string;
  reporterName: string;
  submittedAt: string;
  isDeleted: boolean;
  deleteReason: string | null;
}

interface ValidateRow { submissionId: string; seqNo: number; path: string; canDownload: boolean; size: number; mime: string; valid: boolean; photoId?: string }

function fmt(iso?: string): string {
  if (!iso) return "—";
  const d = new Date(iso);
  if (Number.isNaN(d.getTime())) return iso;
  const p = (n: number) => String(n).padStart(2, "0");
  return `${p(d.getDate())}/${p(d.getMonth() + 1)} ${p(d.getHours())}:${p(d.getMinutes())}`;
}

export default function AdminGalleryPage() {
  const [photos, setPhotos] = useState<AdminPhoto[]>([]);
  const [loading, setLoading] = useState(true);
  const [failed, setFailed] = useState<Set<string>>(new Set());
  const [includeDeleted, setIncludeDeleted] = useState(false);
  const [viewer, setViewer] = useState<number | null>(null);
  const [msg, setMsg] = useState<string | null>(null);
  const [validating, setValidating] = useState(false);
  const [validateRows, setValidateRows] = useState<ValidateRow[] | null>(null);

  const flash = (m: string) => { setMsg(m); setTimeout(() => setMsg(null), 3500); };

  const load = useCallback(async () => {
    setLoading(true);
    try {
      const r = await fetch(`/api/admin/photos?limit=200&includeDeleted=${includeDeleted}`);
      const d = r.ok ? await r.json() : null;
      setPhotos(d?.photos ?? []);
    } finally {
      setLoading(false);
    }
  }, [includeDeleted]);

  useEffect(() => { void load(); }, [load]);

  const viewerPhotos: ViewerPhoto[] = photos.map((g) => ({
    watermarkedPath: g.watermarkedPath,
    departmentCode: g.departmentCode,
    areaName: g.areaName,
    reporterName: g.reporterName,
    submittedAt: g.submittedAt,
    submissionId: g.submissionId,
    photoId: g.photoId,
    isDeleted: g.isDeleted,
  }));

  const doDelete = async (p: ViewerPhoto, deleteFiles: boolean) => {
    if (!p.photoId) return;
    const reason = window.prompt(deleteFiles ? "Lý do XOÁ FILE ảnh (không khôi phục được):" : "Lý do ẩn ảnh:", "Ảnh lỗi/không hợp lệ");
    if (reason === null) return;
    const r = await fetch("/api/admin/photos/delete", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ photoId: p.photoId, reason, deleteFiles }),
    });
    const d = await r.json();
    flash(r.ok ? `Đã ${deleteFiles ? "xoá file + ẩn" : "ẩn"} ảnh (còn ${d.remainingPhotos ?? "?"} ảnh).` : (d.error ?? "Lỗi xoá"));
    setViewer(null);
    await load();
  };

  const doRestore = async (p: ViewerPhoto) => {
    if (!p.photoId) return;
    const r = await fetch("/api/admin/photos/restore", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ photoId: p.photoId }),
    });
    const d = await r.json();
    flash(r.ok ? "Đã khôi phục ảnh." : (d.note ?? d.error ?? "Không khôi phục được"));
    setViewer(null);
    await load();
  };

  const runValidate = async () => {
    setValidating(true);
    try {
      const r = await fetch("/api/admin/photos/validate?limit=50");
      const d = r.ok ? await r.json() : null;
      setValidateRows(d?.results ?? []);
      flash(d ? `Đã kiểm tra ${d.count}: lỗi ${d.badCount}, hợp lệ ${d.okCount}.` : "Lỗi kiểm tra");
    } finally {
      setValidating(false);
    }
  };

  const hideInvalid = async (row: ValidateRow, deleteFiles: boolean) => {
    // Find the photoId from the loaded photos by matching watermarked path.
    const match = photos.find((p) => p.watermarkedPath === row.path);
    if (!match) { flash("Không tìm thấy ảnh trong danh sách hiện tại — bật 'Hiện ảnh đã xoá' hoặc tải lại."); return; }
    const reason = deleteFiles ? "Xoá file ảnh lỗi" : "Ẩn ảnh lỗi";
    const r = await fetch("/api/admin/photos/delete", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ photoId: match.photoId, reason, deleteFiles }),
    });
    flash(r.ok ? "Đã xử lý ảnh lỗi." : "Lỗi xử lý");
    await load();
    await runValidate();
  };

  const markFailed = (key: string) => setFailed((p) => new Set(p).add(key));

  return (
    <AdminShell
      title="Thư viện ảnh"
      subtitle="Ảnh 5S đã đồng bộ · quản trị"
      actions={
        <div className="flex items-center gap-2">
          <label className="flex items-center gap-1.5 text-[13px] text-ink-muted cursor-pointer">
            <input type="checkbox" checked={includeDeleted} onChange={(e) => setIncludeDeleted(e.target.checked)} />
            Hiện ảnh đã xoá
          </label>
          <button onClick={runValidate} disabled={validating} className="btn btn-secondary !min-h-10">{validating ? "Đang kiểm tra…" : "Kiểm tra ảnh lỗi"}</button>
        </div>
      }
    >
      {msg && <div className="mb-4 text-[13px] bg-info-bg text-info px-3.5 py-2.5 rounded-md">{msg}</div>}

      {validateRows && (
        <div className="bg-white rounded-lg border border-line shadow-e2 mb-4 overflow-x-auto">
          <div className="px-5 py-3 border-b border-line flex items-center justify-between">
            <span className="text-[15px] font-semibold">Kết quả kiểm tra ({validateRows.length})</span>
            <button onClick={() => setValidateRows(null)} className="text-[13px] text-ink-muted">Đóng</button>
          </div>
          <table className="w-full border-collapse text-[13px]">
            <thead><tr className="text-left text-[12px] uppercase text-ink-muted">
              <th className="px-4 py-2 border-b border-line">Path</th><th className="px-4 py-2 border-b border-line">Tải</th>
              <th className="px-4 py-2 border-b border-line">Size</th><th className="px-4 py-2 border-b border-line">MIME</th>
              <th className="px-4 py-2 border-b border-line">Trạng thái</th><th className="px-4 py-2 border-b border-line w-52">Xử lý</th>
            </tr></thead>
            <tbody>
              {validateRows.map((row, i) => (
                <tr key={i} className={row.valid ? "" : "bg-danger-bg/40"}>
                  <td className="px-4 py-2 border-b border-line font-mono text-[11px] break-all">{row.path}</td>
                  <td className="px-4 py-2 border-b border-line">{row.canDownload ? "✓" : "✗"}</td>
                  <td className="px-4 py-2 border-b border-line">{row.size}</td>
                  <td className="px-4 py-2 border-b border-line">{row.mime}</td>
                  <td className="px-4 py-2 border-b border-line">{row.valid ? <span className="text-success font-semibold">OK</span> : <span className="text-danger font-semibold">LỖI</span>}</td>
                  <td className="px-4 py-2 border-b border-line">
                    {!row.valid && (
                      <div className="flex gap-1.5">
                        <button onClick={() => hideInvalid(row, false)} className="btn btn-ghost !min-h-8 !px-2 text-[12px] text-warning">Ẩn</button>
                        <button onClick={() => hideInvalid(row, true)} className="btn btn-ghost !min-h-8 !px-2 text-[12px] text-danger">Xoá file</button>
                      </div>
                    )}
                  </td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      )}

      {loading ? (
        <div className="bg-white rounded-lg border border-line shadow-e2 p-8 text-center text-ink-muted text-[14px]">Đang tải…</div>
      ) : photos.length === 0 ? (
        <div className="bg-white rounded-lg border border-line shadow-e2 p-10 text-center text-ink-muted text-[14px]">Chưa có ảnh nào.</div>
      ) : (
        <div className="grid grid-cols-2 sm:grid-cols-3 lg:grid-cols-5 xl:grid-cols-6 gap-3.5">
          {photos.map((g, i) => {
            const key = g.photoId;
            return (
              <button key={key} onClick={() => setViewer(i)} className={`relative aspect-square rounded-md overflow-hidden shadow-e2 bg-surface text-left ${g.isDeleted ? "opacity-50" : ""}`}>
                {failed.has(key) ? (
                  <div className="w-full h-full grid place-items-center text-center text-ink-muted p-2"><span className="text-[11px] leading-tight">🖼️<br />Ảnh lỗi</span></div>
                ) : (
                  // eslint-disable-next-line @next/next/no-img-element
                  <img src={`/api/photo?path=${encodeURIComponent(g.watermarkedPath)}`} alt={g.areaName} loading="lazy" onError={() => markFailed(key)} className="w-full h-full object-cover" />
                )}
                {g.isDeleted && <span className="absolute left-1.5 top-1.5 text-[10px] font-bold px-1.5 h-5 rounded-pill grid place-items-center bg-danger text-white">Đã xoá</span>}
                <div className="absolute inset-x-0 bottom-0 bg-gradient-to-t from-black/70 to-transparent text-white text-[11px] font-semibold px-2.5 pt-4 pb-2">
                  {g.departmentCode} · {g.areaName}
                  <span className="block font-normal text-[10px] opacity-90">{fmt(g.submittedAt)}</span>
                </div>
              </button>
            );
          })}
        </div>
      )}

      {viewer != null && (
        <PhotoViewerModal
          photos={viewerPhotos}
          index={viewer}
          onClose={() => setViewer(null)}
          onIndexChange={setViewer}
          adminMode
          onDelete={(p) => doDelete(p, window.confirm("Xoá luôn FILE ảnh khỏi SharePoint? (Không thể khôi phục)\nOK = xoá file, Cancel = chỉ ẩn") ? true : false)}
          onRestore={doRestore}
        />
      )}
    </AdminShell>
  );
}

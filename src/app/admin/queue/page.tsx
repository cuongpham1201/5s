"use client";

import { useCallback, useEffect, useState } from "react";
import { AdminShell } from "@/components/layout/AdminShell";

interface QueueRow {
  submissionId: string; departmentCode: string; reporterEmail: string; submittedAt: string;
  syncStatus: string; effectiveStatus: string; storedPhotoCount: number; actualPhotoCount: number; ageMinutes: number;
}

function fmt(iso?: string): string {
  if (!iso) return "—";
  const d = new Date(iso);
  if (Number.isNaN(d.getTime())) return iso;
  const p = (n: number) => String(n).padStart(2, "0");
  return `${p(d.getDate())}/${p(d.getMonth() + 1)} ${p(d.getHours())}:${p(d.getMinutes())}`;
}
const tone = (s: string) => s === "uploaded" ? "bg-success-bg text-success" : s === "failed" ? "bg-danger-bg text-danger" : s === "uploading" ? "bg-warning-bg text-warning" : "bg-surface text-ink-muted";

export default function AdminQueuePage() {
  const [rows, setRows] = useState<QueueRow[]>([]);
  const [loading, setLoading] = useState(true);
  const [busy, setBusy] = useState<string | null>(null);
  const [msg, setMsg] = useState<string | null>(null);

  const flash = (m: string) => { setMsg(m); setTimeout(() => setMsg(null), 3500); };
  const load = useCallback(async () => {
    setLoading(true);
    try { const r = await fetch("/api/admin/queue"); const d = r.ok ? await r.json() : null; setRows(d?.rows ?? []); }
    finally { setLoading(false); }
  }, []);
  useEffect(() => { void load(); }, [load]);

  const act = async (body: object, label: string) => {
    setBusy(label);
    try {
      const r = await fetch("/api/admin/queue", { method: "POST", headers: { "Content-Type": "application/json" }, body: JSON.stringify(body) });
      const d = await r.json();
      flash(r.ok ? `OK: ${JSON.stringify(d.reset ?? d.changed ?? d).slice(0, 80)}` : (d.error ?? "Lỗi"));
      await load();
    } finally { setBusy(null); }
  };

  const stuck = rows.filter((r) => r.effectiveStatus === "uploading" || (r.syncStatus === "uploading" && r.actualPhotoCount === 0));

  return (
    <AdminShell
      title="Hàng đợi đồng bộ"
      subtitle="Trạng thái upload Data_Submissions · công cụ debug"
      actions={
        <div className="flex gap-2">
          <button onClick={() => act({ action: "reconcile" }, "reconcile")} disabled={!!busy} className="btn btn-secondary !min-h-10">{busy === "reconcile" ? "…" : "Reconcile"}</button>
          <button onClick={() => act({ action: "reset" }, "reset")} disabled={!!busy} className="btn btn-secondary !min-h-10 text-danger">{busy === "reset" ? "…" : "Reset Processing"}</button>
          <button onClick={() => load()} className="btn btn-secondary !min-h-10">Làm mới</button>
        </div>
      }
    >
      {msg && <div className="mb-3 text-[13px] bg-info-bg text-info px-3.5 py-2.5 rounded-md break-all">{msg}</div>}
      <div className="grid grid-cols-2 lg:grid-cols-4 gap-3 mb-4">
        {[["Tổng", rows.length], ["Đã đồng bộ", rows.filter(r=>r.effectiveStatus==="uploaded").length], ["Lỗi", rows.filter(r=>r.effectiveStatus==="failed").length], ["Đang xử lý", stuck.length]].map(([k,v]) => (
          <div key={String(k)} className="bg-white rounded-lg border border-line shadow-e2 p-4"><div className="text-[12px] text-ink-muted font-semibold">{k}</div><div className="text-[24px] font-bold mt-1">{v}</div></div>
        ))}
      </div>

      <div className="bg-white rounded-lg border border-line shadow-e2 overflow-x-auto">
        <div className="px-5 py-3 border-b border-line text-[15px] font-semibold">Submissions ({rows.length})</div>
        {loading ? (
          <div className="p-6 text-center text-ink-muted text-[14px]">Đang tải…</div>
        ) : rows.length === 0 ? (
          <div className="p-8 text-center text-ink-muted text-[14px]">Chưa có submission nào.</div>
        ) : (
          <table className="w-full border-collapse text-[13px]">
            <thead><tr className="text-left text-[12px] uppercase text-ink-muted">
              <th className="px-4 py-2 border-b border-line">Submission</th><th className="px-4 py-2 border-b border-line">Phòng ban</th>
              <th className="px-4 py-2 border-b border-line">Lúc</th><th className="px-4 py-2 border-b border-line">Ảnh (lưu/thực)</th>
              <th className="px-4 py-2 border-b border-line">Stored</th><th className="px-4 py-2 border-b border-line">Hiệu lực</th>
              <th className="px-4 py-2 border-b border-line w-40">Thao tác</th>
            </tr></thead>
            <tbody>
              {rows.map((r) => (
                <tr key={r.submissionId}>
                  <td className="px-4 py-2 border-b border-line font-mono text-[11px] break-all">{r.submissionId}<div className="text-ink-muted">{r.reporterEmail}</div></td>
                  <td className="px-4 py-2 border-b border-line">{r.departmentCode}</td>
                  <td className="px-4 py-2 border-b border-line">{fmt(r.submittedAt)}<div className="text-ink-muted">{r.ageMinutes === Infinity ? "" : `${r.ageMinutes}p`}</div></td>
                  <td className="px-4 py-2 border-b border-line">{r.storedPhotoCount}/{r.actualPhotoCount}</td>
                  <td className="px-4 py-2 border-b border-line"><span className={`text-[11px] font-bold px-2 h-6 rounded-pill grid place-items-center w-fit ${tone(r.syncStatus)}`}>{r.syncStatus}</span></td>
                  <td className="px-4 py-2 border-b border-line"><span className={`text-[11px] font-bold px-2 h-6 rounded-pill grid place-items-center w-fit ${tone(r.effectiveStatus)}`}>{r.effectiveStatus}</span></td>
                  <td className="px-4 py-2 border-b border-line">
                    <div className="flex gap-1.5">
                      <button onClick={() => act({ action: "mark", submissionId: r.submissionId, status: "uploaded" }, r.submissionId)} disabled={busy === r.submissionId} className="btn btn-ghost !min-h-8 !px-2 text-[12px] text-success">→Uploaded</button>
                      <button onClick={() => act({ action: "mark", submissionId: r.submissionId, status: "failed" }, r.submissionId)} disabled={busy === r.submissionId} className="btn btn-ghost !min-h-8 !px-2 text-[12px] text-danger">→Failed</button>
                    </div>
                  </td>
                </tr>
              ))}
            </tbody>
          </table>
        )}
      </div>
    </AdminShell>
  );
}

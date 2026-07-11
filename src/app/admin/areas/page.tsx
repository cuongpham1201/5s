"use client";

import { useCallback, useEffect, useState } from "react";
import { AdminShell } from "@/components/layout/AdminShell";

interface Summary {
  totalAreaRows: number; activeAreas: number; inactiveAreas: number;
  groups: number; leaves: number; physicalCapturePoints: number;
  directApproved: number; bulkPendingReview: number; unresolvedAssignments: number;
  unresolvedDeptCodes: string[]; skippedGroupCsv: number;
  spOperationalObligations: number; pgExpectedObligations: number; baselineMatch: boolean;
}
interface ReviewRow {
  id: number; departmentCode: string; areaCode: string; areaName: string; areaActive: boolean;
  assignmentType: string; isRequired: boolean; isActive: boolean;
  source: string; reviewStatus: string; unresolvedDepartment: boolean; note: string | null;
}

const SRC_LABEL: Record<string, string> = {
  manual: "Thủ công", migrated_direct: "Migrate trực tiếp",
  migrated_bulk_csv: "Migrate hàng loạt (CSV)", migrated_inherited: "Migrate kế thừa",
};

export default function AdminAreasPage() {
  const [summary, setSummary] = useState<Summary | null>(null);
  const [rows, setRows] = useState<ReviewRow[]>([]);
  const [loading, setLoading] = useState(true);
  const [busy, setBusy] = useState<string | null>(null);
  const [msg, setMsg] = useState<{ ok: boolean; text: string } | null>(null);
  const [fSource, setFSource] = useState("");
  const [fReview, setFReview] = useState("pending_review");
  const [fUnres, setFUnres] = useState(false);
  const [sel, setSel] = useState<Set<number>>(new Set());
  const [remap, setRemap] = useState({ from: "", to: "" });

  const load = useCallback(async () => {
    setLoading(true);
    try {
      const qs = new URLSearchParams();
      if (fSource) qs.set("source", fSource);
      if (fReview) qs.set("review", fReview);
      if (fUnres) qs.set("unresolved", "1");
      const [p, r] = await Promise.all([
        fetch("/api/admin/areas/migration-preview", { cache: "no-store" }).then((x) => (x.ok ? x.json() : null)),
        fetch(`/api/admin/area-assignments/review?${qs}`, { cache: "no-store" }).then((x) => (x.ok ? x.json() : null)),
      ]);
      setSummary(p?.summary ?? null);
      setRows(r?.assignments ?? []);
      setSel(new Set());
    } finally {
      setLoading(false);
    }
  }, [fSource, fReview, fUnres]);

  useEffect(() => { void load(); }, [load]);

  const act = async (label: string, fn: () => Promise<Response>) => {
    setBusy(label); setMsg(null);
    try {
      const r = await fn();
      const d = await r.json();
      if (!r.ok || d.ok === false) setMsg({ ok: false, text: d?.error ?? (d?.errors?.length ? `${d.done} OK, ${d.errors.length} lỗi: ${d.errors[0].error}` : "Lỗi") });
      else setMsg({ ok: true, text: "Đã thực hiện." });
      await load();
    } catch (e) { setMsg({ ok: false, text: String(e) }); }
    finally { setBusy(null); }
  };

  const applyMigration = () => {
    if (!window.confirm("Import Config_Areas → PostgreSQL (idempotent, không sửa SharePoint)?")) return;
    void act("apply", () => fetch("/api/admin/areas/migration-apply", { method: "POST" }));
  };
  const single = (id: number, action: "approve" | "reject-or-deactivate") =>
    act(`${action}${id}`, () => fetch(`/api/admin/area-assignments/${id}/${action}`, { method: "POST" }));
  const bulk = (action: "approve" | "reject") => {
    if (!sel.size) return;
    if (!window.confirm(`${action === "approve" ? "Duyệt" : "Loại"} ${sel.size} assignment?`)) return;
    void act("bulk", () => fetch("/api/admin/area-assignments/bulk-review", {
      method: "POST", headers: { "content-type": "application/json" },
      body: JSON.stringify({ ids: [...sel], action }),
    }));
  };
  const doRemap = () => {
    if (!remap.from.trim() || !remap.to.trim()) return;
    void act("remap", () => fetch("/api/admin/area-assignments/remap-department", {
      method: "POST", headers: { "content-type": "application/json" },
      body: JSON.stringify({ fromCode: remap.from.trim(), toCode: remap.to.trim() }),
    }));
  };

  const stat = (label: string, value: string | number, tone = "") => (
    <div className="bg-white rounded-lg p-3.5 shadow-e2 border border-line">
      <div className="text-[11.5px] text-ink-muted font-semibold">{label}</div>
      <div className={`text-[22px] font-bold mt-0.5 tracking-tight ${tone}`}>{value}</div>
    </div>
  );

  return (
    <AdminShell
      title="Khu vực 5S — Migration review"
      subtitle="Import Config_Areas → PostgreSQL · duyệt assignment · xử lý mã phòng chưa resolve"
      actions={<button onClick={applyMigration} disabled={!!busy} className="btn btn-primary !min-h-10">{busy === "apply" ? "Đang import…" : "Import / đồng bộ lại"}</button>}
    >
      {msg && <div className={`text-[13px] mb-3 rounded-md px-3.5 py-2.5 ${msg.ok ? "bg-success-bg text-success" : "bg-danger-bg text-danger"}`}>{msg.text}</div>}

      {summary && (
        <>
          <div className="grid grid-cols-2 lg:grid-cols-5 gap-3 mb-3">
            {stat("Khu vực (rows)", `${summary.activeAreas}/${summary.totalAreaRows}`)}
            {stat("Điểm chụp vật lý", summary.physicalCapturePoints)}
            {stat("Trực tiếp (approved)", summary.directApproved, "text-success")}
            {stat("Hàng loạt (chờ duyệt)", summary.bulkPendingReview, "text-warning")}
            {stat("Unresolved", summary.unresolvedAssignments, "text-danger")}
          </div>
          <div className="text-[12.5px] text-ink-muted mb-4">
            Baseline nghĩa vụ KPI: SharePoint <b className="text-ink">{summary.spOperationalObligations}</b> ·
            PostgreSQL sau import <b className="text-ink">{summary.pgExpectedObligations}</b> ·
            {summary.baselineMatch ? <b className="text-success"> KHỚP ✓</b> : <b className="text-danger"> LỆCH ✗</b>}
            {summary.unresolvedDeptCodes.length > 0 && (
              <> · Mã phòng chưa resolve: <b className="text-danger">{summary.unresolvedDeptCodes.join(", ")}</b> (không picker/KPI — remap bên dưới rồi mới duyệt được)</>
            )}
          </div>
        </>
      )}

      {/* Remap mã phòng unresolved */}
      <div className="bg-white rounded-lg border border-line shadow-e2 p-3.5 mb-4 flex flex-wrap items-center gap-2.5">
        <span className="text-[13px] font-semibold">Remap mã phòng:</span>
        <input value={remap.from} onChange={(e) => setRemap({ ...remap, from: e.target.value })} placeholder="mã cũ (vd PMKT)" className="rounded-md border border-line-strong px-2.5 py-1.5 text-[13px] w-36" />
        <span className="text-ink-muted">→</span>
        <input value={remap.to} onChange={(e) => setRemap({ ...remap, to: e.target.value })} placeholder="mã đúng (vd MKT)" className="rounded-md border border-line-strong px-2.5 py-1.5 text-[13px] w-36" />
        <button onClick={doRemap} disabled={!!busy} className="btn btn-secondary !min-h-9">Remap (update-in-place)</button>
      </div>

      {/* Filters + bulk actions */}
      <div className="flex flex-wrap items-center gap-2 mb-3">
        <select value={fSource} onChange={(e) => setFSource(e.target.value)} className="rounded-md border border-line-strong px-2.5 py-1.5 text-[13px]">
          <option value="">Mọi nguồn</option>
          <option value="migrated_direct">Migrate trực tiếp</option>
          <option value="migrated_bulk_csv">Migrate hàng loạt</option>
          <option value="manual">Thủ công</option>
        </select>
        <select value={fReview} onChange={(e) => setFReview(e.target.value)} className="rounded-md border border-line-strong px-2.5 py-1.5 text-[13px]">
          <option value="">Mọi trạng thái</option>
          <option value="pending_review">Chờ duyệt</option>
          <option value="approved">Đã duyệt</option>
        </select>
        <label className="text-[13px] flex items-center gap-1.5"><input type="checkbox" checked={fUnres} onChange={(e) => setFUnres(e.target.checked)} /> chỉ unresolved</label>
        <span className="flex-1" />
        <button onClick={() => bulk("approve")} disabled={!sel.size || !!busy} className="btn btn-primary !min-h-9">Duyệt {sel.size || ""} đã chọn</button>
        <button onClick={() => bulk("reject")} disabled={!sel.size || !!busy} className="btn btn-secondary !min-h-9">Loại đã chọn</button>
      </div>

      <div className="bg-white rounded-lg border border-line shadow-e2 overflow-x-auto">
        {loading ? (
          <div className="p-6 text-center text-ink-muted text-[14px]">Đang tải…</div>
        ) : rows.length === 0 ? (
          <div className="p-8 text-center text-ink-muted text-[14px]">Không có assignment khớp bộ lọc (chưa import?).</div>
        ) : (
          <table className="w-full text-[13px]">
            <thead className="text-ink-muted text-left"><tr className="border-b border-line">
              <th className="px-3 py-2"><input type="checkbox" checked={sel.size === rows.length && rows.length > 0}
                onChange={(e) => setSel(e.target.checked ? new Set(rows.map((r) => r.id)) : new Set())} /></th>
              <th className="px-3 py-2 font-semibold">Phòng ban</th><th className="px-3 py-2 font-semibold">Khu vực</th>
              <th className="px-3 py-2 font-semibold">Nguồn</th><th className="px-3 py-2 font-semibold">Trạng thái</th>
              <th className="px-3 py-2 font-semibold">Thao tác</th>
            </tr></thead>
            <tbody>
              {rows.map((r) => (
                <tr key={r.id} className={`border-b border-line last:border-0 ${!r.isActive ? "opacity-50" : ""}`}>
                  <td className="px-3 py-2"><input type="checkbox" checked={sel.has(r.id)}
                    onChange={(e) => { const n = new Set(sel); if (e.target.checked) n.add(r.id); else n.delete(r.id); setSel(n); }} /></td>
                  <td className="px-3 py-2 font-semibold">
                    {r.departmentCode}
                    {r.unresolvedDepartment && <span className="ml-1.5 px-1.5 py-0.5 rounded-pill text-[10px] font-bold bg-danger-bg text-danger">unresolved</span>}
                  </td>
                  <td className="px-3 py-2">{r.areaCode} · {r.areaName}{!r.areaActive && <span className="text-ink-muted"> (khu ẩn)</span>}</td>
                  <td className="px-3 py-2">{SRC_LABEL[r.source] ?? r.source}</td>
                  <td className="px-3 py-2">
                    <span className={`px-2 py-0.5 rounded-pill text-[11px] font-bold ${!r.isActive ? "bg-surface text-ink-muted" : r.reviewStatus === "approved" ? "bg-success-bg text-success" : "bg-warning-bg text-warning"}`}>
                      {!r.isActive ? "đã loại" : r.reviewStatus === "approved" ? "đã duyệt" : "chờ duyệt"}
                    </span>
                  </td>
                  <td className="px-3 py-2">
                    <div className="flex gap-2 text-[12px] font-semibold">
                      {r.isActive && r.reviewStatus !== "approved" && !r.unresolvedDepartment && (
                        <button onClick={() => single(r.id, "approve")} disabled={!!busy} className="text-success">Duyệt</button>
                      )}
                      {r.unresolvedDepartment && <span className="text-ink-muted">remap trước</span>}
                      {r.isActive && <button onClick={() => single(r.id, "reject-or-deactivate")} disabled={!!busy} className="text-danger">Loại</button>}
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

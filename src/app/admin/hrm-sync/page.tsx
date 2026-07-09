"use client";

import { useCallback, useEffect, useState } from "react";
import { AdminShell } from "@/components/layout/AdminShell";

interface Status {
  lastFullSync: { id: number; started_at: string; finished_at: string | null; status: string } | null;
  lastAnySync: { id: number; job_type: string; started_at: string; status: string } | null;
  departments: { total: number; active: number };
  employees: { total: number; active: number; resigned: number; suspended: number; missing: number; unknown: number };
  aliases: number;
  appUsers: { total: number; active: number };
}
interface Job {
  id: number; job_type: string; status: string; started_at: string; finished_at: string | null;
  total_read: number; created_count: number; updated_count: number; deactivated_count: number; error_message: string | null;
}
interface Change { id: number; sync_job_id: number; entity_type: string; entity_code: string | null; change_type: string; created_at: string }

function fmt(iso: string | null): string {
  if (!iso) return "—";
  const d = new Date(iso);
  return Number.isNaN(d.getTime()) ? "—" : d.toLocaleString("vi-VN");
}

const CHANGE_CLS: Record<string, string> = {
  create: "bg-success-bg text-success", update: "bg-info-bg text-info",
  transfer: "bg-warning-bg text-warning", resign: "bg-danger-bg text-danger",
  missing: "bg-danger-bg text-danger", deactivate: "bg-danger-bg text-danger",
  reactivate: "bg-success-bg text-success",
};

export default function HrmSyncPage() {
  const [status, setStatus] = useState<Status | null>(null);
  const [jobs, setJobs] = useState<Job[]>([]);
  const [changes, setChanges] = useState<Change[]>([]);
  const [loading, setLoading] = useState(true);
  const [syncing, setSyncing] = useState<string | null>(null);
  const [msg, setMsg] = useState<{ ok: boolean; text: string } | null>(null);

  const load = useCallback(async () => {
    setLoading(true);
    try {
      const [s, j, c] = await Promise.all([
        fetch("/api/admin/hrm-sync/status", { cache: "no-store" }).then((r) => (r.ok ? r.json() : null)),
        fetch("/api/admin/hrm-sync/jobs?limit=15", { cache: "no-store" }).then((r) => (r.ok ? r.json() : null)),
        fetch("/api/admin/hrm-sync/changes?limit=40", { cache: "no-store" }).then((r) => (r.ok ? r.json() : null)),
      ]);
      setStatus(s?.status ?? null);
      setJobs(j?.jobs ?? []);
      setChanges(c?.changes ?? []);
    } finally {
      setLoading(false);
    }
  }, []);

  useEffect(() => { void load(); }, [load]);

  const runSync = async (type: "full" | "departments" | "employees") => {
    setSyncing(type);
    setMsg(null);
    try {
      const r = await fetch(`/api/admin/hrm-sync/${type}`, { method: "POST" });
      const d = await r.json();
      if (!r.ok || !d.ok) { setMsg({ ok: false, text: d?.error ?? "Sync lỗi." }); return; }
      const res = d.result;
      setMsg({ ok: true, text: `Sync '${type}' OK: đọc ${res.total_read}, tạo ${res.created_count}, cập nhật ${res.updated_count}, vô hiệu ${res.deactivated_count}.` });
      await load();
    } catch (e) {
      setMsg({ ok: false, text: String(e) });
    } finally {
      setSyncing(null);
    }
  };

  const stat = (label: string, value: string | number, tone = "") => (
    <div className="bg-white rounded-lg p-4 shadow-e2 border border-line">
      <div className="text-[12px] text-ink-muted font-semibold">{label}</div>
      <div className={`text-[24px] font-bold mt-1 tracking-tight ${tone}`}>{value}</div>
    </div>
  );

  const e = status?.employees;

  return (
    <AdminShell
      title="HRM Sync Monitor"
      subtitle="Đồng bộ phòng ban & nhân viên từ HRM (read-only) → ban5s_app"
      actions={
        <div className="flex gap-2">
          <button onClick={() => runSync("departments")} disabled={!!syncing} className="btn btn-secondary !min-h-10">
            {syncing === "departments" ? "Đang sync…" : "Sync phòng ban"}
          </button>
          <button onClick={() => runSync("employees")} disabled={!!syncing} className="btn btn-secondary !min-h-10">
            {syncing === "employees" ? "Đang sync…" : "Sync nhân viên"}
          </button>
          <button onClick={() => runSync("full")} disabled={!!syncing} className="btn btn-primary !min-h-10">
            {syncing === "full" ? "Đang sync…" : "Sync now (full)"}
          </button>
        </div>
      }
    >
      {msg && (
        <div className={`text-[13px] mb-4 rounded-md px-3.5 py-2.5 ${msg.ok ? "bg-success-bg text-success" : "bg-danger-bg text-danger"}`}>
          {msg.text}
        </div>
      )}

      <p className="text-[13px] text-ink-muted mb-3">
        Full sync gần nhất: <b>{fmt(status?.lastFullSync?.finished_at ?? status?.lastFullSync?.started_at ?? null)}</b>
        {status?.lastFullSync ? <> · job #{status.lastFullSync.id} ({status.lastFullSync.status})</> : " · chưa có"}
        {status?.lastAnySync && <> · gần nhất mọi loại: {status.lastAnySync.job_type} #{status.lastAnySync.id}</>}
      </p>

      {loading && !status ? (
        <div className="p-6 text-center text-ink-muted text-[14px]">Đang tải…</div>
      ) : (
        <>
          <div className="grid grid-cols-2 lg:grid-cols-4 gap-3 mb-3">
            {stat("Phòng ban", `${status?.departments.active ?? 0}/${status?.departments.total ?? 0}`)}
            {stat("Nhân viên (tổng)", e?.total ?? 0)}
            {stat("Đang làm việc", e?.active ?? 0, "text-success")}
            {stat("Alias phòng ban", status?.aliases ?? 0)}
          </div>
          <div className="grid grid-cols-2 lg:grid-cols-4 gap-3 mb-5">
            {stat("Nghỉ việc", e?.resigned ?? 0, "text-danger")}
            {stat("Tạm ngưng", e?.suspended ?? 0, "text-warning")}
            {stat("Thiếu (khỏi HRM)", e?.missing ?? 0, "text-danger")}
            {stat("Tài khoản app", `${status?.appUsers.active ?? 0}/${status?.appUsers.total ?? 0}`)}
          </div>

          <div className="bg-white rounded-lg border border-line shadow-e2 mb-5 overflow-x-auto">
            <div className="px-5 py-4 border-b border-line text-[16px] font-semibold">Sync jobs gần nhất</div>
            <table className="w-full text-[13px]">
              <thead className="text-ink-muted text-left">
                <tr className="border-b border-line">
                  <th className="px-4 py-2 font-semibold">#</th><th className="px-4 py-2 font-semibold">Loại</th>
                  <th className="px-4 py-2 font-semibold">Trạng thái</th><th className="px-4 py-2 font-semibold">Bắt đầu</th>
                  <th className="px-4 py-2 font-semibold">Đọc</th><th className="px-4 py-2 font-semibold">Tạo</th>
                  <th className="px-4 py-2 font-semibold">Cập nhật</th><th className="px-4 py-2 font-semibold">Vô hiệu</th>
                </tr>
              </thead>
              <tbody>
                {jobs.length === 0 ? (
                  <tr><td colSpan={8} className="px-4 py-6 text-center text-ink-muted">Chưa có job nào.</td></tr>
                ) : jobs.map((j) => (
                  <tr key={j.id} className="border-b border-line last:border-0">
                    <td className="px-4 py-2">{j.id}</td>
                    <td className="px-4 py-2">{j.job_type}</td>
                    <td className="px-4 py-2">
                      <span className={`px-2 py-0.5 rounded-pill text-[11px] font-bold ${j.status === "success" ? "bg-success-bg text-success" : j.status === "failed" ? "bg-danger-bg text-danger" : "bg-warning-bg text-warning"}`}>{j.status}</span>
                    </td>
                    <td className="px-4 py-2 whitespace-nowrap">{fmt(j.started_at)}</td>
                    <td className="px-4 py-2">{j.total_read}</td><td className="px-4 py-2">{j.created_count}</td>
                    <td className="px-4 py-2">{j.updated_count}</td><td className="px-4 py-2">{j.deactivated_count}</td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>

          <div className="bg-white rounded-lg border border-line shadow-e2 overflow-x-auto">
            <div className="px-5 py-4 border-b border-line text-[16px] font-semibold">Sync changes gần nhất</div>
            <table className="w-full text-[13px]">
              <thead className="text-ink-muted text-left">
                <tr className="border-b border-line">
                  <th className="px-4 py-2 font-semibold">#</th><th className="px-4 py-2 font-semibold">Job</th>
                  <th className="px-4 py-2 font-semibold">Loại</th><th className="px-4 py-2 font-semibold">Mã</th>
                  <th className="px-4 py-2 font-semibold">Thay đổi</th><th className="px-4 py-2 font-semibold">Thời gian</th>
                </tr>
              </thead>
              <tbody>
                {changes.length === 0 ? (
                  <tr><td colSpan={6} className="px-4 py-6 text-center text-ink-muted">Chưa có thay đổi nào.</td></tr>
                ) : changes.map((c) => (
                  <tr key={c.id} className="border-b border-line last:border-0">
                    <td className="px-4 py-2">{c.id}</td><td className="px-4 py-2">{c.sync_job_id}</td>
                    <td className="px-4 py-2">{c.entity_type}</td><td className="px-4 py-2 font-medium">{c.entity_code ?? "—"}</td>
                    <td className="px-4 py-2"><span className={`px-2 py-0.5 rounded-pill text-[11px] font-bold ${CHANGE_CLS[c.change_type] ?? "bg-surface text-ink-muted"}`}>{c.change_type}</span></td>
                    <td className="px-4 py-2 whitespace-nowrap">{fmt(c.created_at)}</td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        </>
      )}
    </AdminShell>
  );
}

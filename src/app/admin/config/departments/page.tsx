"use client";

import { useCallback, useEffect, useState } from "react";
import { AdminShell } from "@/components/layout/AdminShell";

interface ImportResult {
  source: string;
  deactivateMissing: boolean;
  created: string[];
  updated: string[];
  deactivated: string[];
  skipped: string[];
  stats?: {
    totalScanned: number;
    activeMembers: number;
    activeWithDepartment: number;
    distinctAll: number;
    distinctFiltered: number;
  };
  note?: string;
  error?: string;
}

interface Dept { code: string; name: string }

export default function ConfigDepartmentsPage() {
  const [depts, setDepts] = useState<Dept[]>([]);
  const [loading, setLoading] = useState(true);
  const [syncing, setSyncing] = useState(false);
  const [result, setResult] = useState<ImportResult | null>(null);
  const [lastSync, setLastSync] = useState<string | null>(null);

  const load = useCallback(async () => {
    setLoading(true);
    try {
      const r = await fetch("/api/config/departments");
      const d = r.ok ? await r.json() : null;
      setDepts(d?.departments ?? []);
    } finally {
      setLoading(false);
    }
  }, []);

  useEffect(() => { void load(); }, [load]);

  const sync = async () => {
    setSyncing(true);
    setResult(null);
    try {
      const r = await fetch("/api/admin/sharepoint/import-departments", { method: "POST" });
      const data: ImportResult = await r.json();
      setResult(data);
      const now = new Date();
      setLastSync(now.toLocaleString("vi-VN"));
    } catch (e) {
      setResult({ source: "", deactivateMissing: false, created: [], updated: [], deactivated: [], skipped: [], error: String(e) });
    } finally {
      setSyncing(false);
      void load();
    }
  };

  const stat = (label: string, value: string | number) => (
    <div className="bg-white rounded-lg p-4 shadow-e2 border border-line">
      <div className="text-[12px] text-ink-muted font-semibold">{label}</div>
      <div className="text-[24px] font-bold mt-1 tracking-tight">{value}</div>
    </div>
  );

  return (
    <AdminShell
      title="Phòng ban (Config_Departments)"
      subtitle="Đồng bộ từ Microsoft 365"
      actions={
        <button onClick={sync} disabled={syncing} className="btn btn-primary !min-h-10">
          {syncing ? "Đang đồng bộ…" : "Đồng bộ phòng ban từ Microsoft 365"}
        </button>
      }
    >
      <p className="text-[13px] text-ink-muted mb-4">
        Đồng bộ upsert theo DepartmentCode từ người dùng Microsoft 365 (chỉ thành viên đang hoạt động,
        có phòng ban). Mặc định KHÔNG vô hiệu hoá phòng ban thiếu (deactivateMissing=false).
        {lastSync && <> · Lần đồng bộ gần nhất: <b>{lastSync}</b></>}
      </p>

      {result?.stats && (
        <div className="grid grid-cols-2 lg:grid-cols-5 gap-3 mb-4">
          {stat("Tổng quét", result.stats.totalScanned)}
          {stat("Thành viên hoạt động", result.stats.activeMembers)}
          {stat("Có phòng ban", result.stats.activeWithDepartment)}
          {stat("Phòng ban (thô)", result.stats.distinctAll)}
          {stat("Phòng ban (chuẩn hoá)", result.stats.distinctFiltered)}
        </div>
      )}

      {result && (
        <div className="grid grid-cols-2 lg:grid-cols-4 gap-3 mb-4">
          {stat("Đã tạo", result.created.length)}
          {stat("Đã cập nhật", result.updated.length)}
          {stat("Đã vô hiệu hoá", result.deactivated.length)}
          {stat("Bỏ qua (không đổi)", result.skipped.length)}
        </div>
      )}

      {result?.note && <div className="text-warning text-[13px] mb-3">{result.note}</div>}
      {result?.error && <div className="text-danger text-[13px] mb-3">Lỗi: {result.error}</div>}

      <div className="bg-white rounded-lg border border-line shadow-e2">
        <div className="flex items-center justify-between px-5 py-4 border-b border-line">
          <span className="text-[16px] font-semibold">Phòng ban đang hoạt động</span>
          <span className="text-[13px] text-ink-muted">{depts.length}</span>
        </div>
        {loading ? (
          <div className="p-6 text-center text-ink-muted text-[14px]">Đang tải…</div>
        ) : depts.length === 0 ? (
          <div className="p-8 text-center text-ink-muted text-[14px]">Chưa có phòng ban. Nhấn “Đồng bộ”.</div>
        ) : (
          depts.map((d) => (
            <div key={d.code} className="flex items-center gap-3 px-5 py-3 border-b border-line last:border-0">
              <span className="badge badge-info">{d.code}</span>
              <span className="flex-1 min-w-0 truncate">{d.name}</span>
            </div>
          ))
        )}
      </div>
    </AdminShell>
  );
}

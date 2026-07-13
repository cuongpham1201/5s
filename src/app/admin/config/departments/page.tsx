"use client";

import { useCallback, useEffect, useState } from "react";
import { AdminShell } from "@/components/layout/AdminShell";

interface Dept { code: string; name: string }

export default function ConfigDepartmentsPage() {
  const [depts, setDepts] = useState<Dept[]>([]);
  const [loading, setLoading] = useState(true);
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

  return (
    <AdminShell
      title="Phòng ban (Config_Departments)"
      subtitle="Danh mục phòng ban 5S (nguồn HRM sync — quản trị tại Đồng bộ HRM)"
    >

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

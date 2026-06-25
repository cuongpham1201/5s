"use client";

import { useEffect, useState } from "react";
import { AdminShell } from "@/components/layout/AdminShell";
import { StatusBadge } from "@/components/ui/StatusBadge";

interface Dashboard {
  date: string;
  expected: number;
  missing: Array<{ code: string; name: string }>;
  missingCount: number;
}

export default function PendingPage() {
  const [d, setD] = useState<Dashboard | null>(null);
  const [loading, setLoading] = useState(true);

  useEffect(() => {
    fetch("/api/admin/dashboard").then((r) => (r.ok ? r.json() : null)).then(setD).finally(() => setLoading(false));
  }, []);

  const missing = d?.missing ?? [];

  return (
    <AdminShell title="Đơn vị chưa gửi hôm nay" subtitle={`${d?.date ?? "…"} · ${d?.missingCount ?? 0} đơn vị`}>
      <div className="bg-white rounded-lg border border-line shadow-e2">
        <div className="flex items-center justify-between px-5 py-4 border-b border-line">
          <span className="text-[16px] font-semibold">Danh sách ({d?.missingCount ?? 0})</span>
        </div>
        {loading ? (
          <div className="p-6 text-center text-ink-muted text-[14px]">Đang tải…</div>
        ) : (d?.expected ?? 0) === 0 ? (
          <div className="p-8 text-center text-ink-muted text-[14px]">Chưa có phòng ban trong Config_Departments.</div>
        ) : missing.length === 0 ? (
          <div className="p-8 text-center text-ink-muted text-[14px]">Tất cả đơn vị đã gửi hôm nay 👍</div>
        ) : (
          missing.map((u) => (
            <div key={u.code} className="flex items-center gap-3.5 px-5 py-3.5 border-b border-line last:border-0">
              <StatusBadge tone="warning">⚠ {u.code}</StatusBadge>
              <div className="flex-1 min-w-0">
                <div className="font-semibold">{u.name}</div>
                <div className="text-[13px] text-ink-muted">Chưa gửi ảnh 5S hôm nay</div>
              </div>
            </div>
          ))
        )}
      </div>
    </AdminShell>
  );
}

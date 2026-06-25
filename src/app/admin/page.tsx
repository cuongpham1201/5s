"use client";

import Link from "next/link";
import { useEffect, useState } from "react";
import { AdminShell } from "@/components/layout/AdminShell";
import { StatusBadge } from "@/components/ui/StatusBadge";

interface Dashboard {
  date: string;
  expected: number;
  submitted: number;
  missing: Array<{ code: string; name: string }>;
  missingCount: number;
  completionRate: number;
  latest: Array<{ submissionId: string; departmentCode: string; areaName: string; photoCount: number; submittedAt: string }>;
  hasData: boolean;
  error?: string;
}

export default function DashboardPage() {
  const [d, setD] = useState<Dashboard | null>(null);
  const [loading, setLoading] = useState(true);

  useEffect(() => {
    fetch("/api/admin/dashboard").then((r) => (r.ok ? r.json() : null)).then(setD).finally(() => setLoading(false));
  }, []);

  const pct = Math.round((d?.completionRate ?? 0) * 100);
  const kpis = [
    { label: "Expected Units", value: d?.expected ?? 0, cls: "bg-info-bg text-info" },
    { label: "Submitted Today", value: d?.submitted ?? 0, cls: "bg-success-bg text-success" },
    { label: "Missing Units", value: d?.missingCount ?? 0, cls: "bg-danger-bg text-danger" },
    { label: "Completion %", value: `${pct}%`, cls: "bg-warning-bg text-warning" },
  ];

  return (
    <AdminShell title="Dashboard" subtitle={`Hôm nay · ${d?.date ?? "…"}`}>
      <div className="grid grid-cols-2 lg:grid-cols-4 gap-4">
        {kpis.map((k) => (
          <div key={k.label} className="bg-white rounded-lg p-5 shadow-e2 border border-line">
            <span className="text-[13px] text-ink-muted font-semibold">{k.label}</span>
            <div className="text-[32px] font-bold mt-2 tracking-tight">{loading ? "…" : k.value}</div>
          </div>
        ))}
      </div>

      <div className="grid grid-cols-1 lg:grid-cols-[1fr_1fr] gap-[18px] mt-[18px]">
        <div className="bg-white rounded-lg border border-line shadow-e2">
          <div className="flex items-center justify-between px-5 py-4 border-b border-line">
            <span className="text-[16px] font-semibold">Chưa gửi hôm nay</span>
            <StatusBadge tone="danger">{d?.missingCount ?? 0}</StatusBadge>
          </div>
          {!loading && (d?.missing?.length ?? 0) === 0 ? (
            <div className="p-6 text-center text-ink-muted text-[14px]">{(d?.expected ?? 0) === 0 ? "Chưa có phòng ban." : "Tất cả đã gửi 👍"}</div>
          ) : (
            <div>
              {(d?.missing ?? []).slice(0, 8).map((u) => (
                <div key={u.code} className="flex items-center gap-3 px-5 py-3 border-b border-line">
                  <span className="w-2.5 h-2.5 rounded-full bg-danger" />
                  <div className="flex-1 min-w-0"><div className="font-semibold">{u.code}</div><div className="text-[13px] text-ink-muted truncate">{u.name}</div></div>
                </div>
              ))}
              <div className="p-3.5"><Link href="/admin/pending" className="btn btn-ghost btn-block">Xem tất cả →</Link></div>
            </div>
          )}
        </div>

        <div className="bg-white rounded-lg border border-line shadow-e2">
          <div className="flex items-center justify-between px-5 py-4 border-b border-line"><span className="text-[16px] font-semibold">Ảnh mới nhất</span></div>
          {!loading && (d?.latest?.length ?? 0) === 0 ? (
            <div className="p-6 text-center text-ink-muted text-[14px]">Chưa có ảnh nào.</div>
          ) : (
            (d?.latest ?? []).map((s) => (
              <div key={s.submissionId} className="flex items-center gap-3 px-5 py-3 border-b border-line">
                <div className="flex-1 min-w-0"><div className="font-semibold">{s.departmentCode} · {s.areaName}</div><div className="text-[13px] text-ink-muted">{s.photoCount} ảnh</div></div>
              </div>
            ))
          )}
        </div>
      </div>
      {d?.error && <div className="text-danger text-[13px] mt-3">Lỗi đọc dữ liệu: {d.error}</div>}
    </AdminShell>
  );
}

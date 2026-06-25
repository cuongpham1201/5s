"use client";

import { useEffect, useMemo, useState } from "react";
import { AdminShell } from "@/components/layout/AdminShell";

interface Row { code: string; name: string; days: Record<string, boolean> }
interface CalResp { month: string; rows: Row[]; hasData: boolean }

const MEDALS = ["🥇", "🥈", "🥉"];

function barColor(rate: number) {
  if (rate >= 0.75) return "from-[#0E700E] to-[#3ba83b]";
  if (rate >= 0.5) return "from-[#BC4B09] to-[#e08a3c]";
  return "from-[#B10E1C] to-[#e0606a]";
}

export default function RankingPage() {
  const [data, setData] = useState<CalResp | null>(null);
  const [loading, setLoading] = useState(true);

  useEffect(() => {
    fetch("/api/admin/calendar").then((r) => (r.ok ? r.json() : null)).then(setData).finally(() => setLoading(false));
  }, []);

  const ranking = useMemo(() => {
    const rows = data?.rows ?? [];
    return rows
      .map((r) => {
        const submittedDays = Object.values(r.days).filter(Boolean).length;
        return { code: r.code, name: r.name, submittedDays };
      })
      .sort((a, b) => b.submittedDays - a.submittedDays);
  }, [data]);

  const maxDays = ranking[0]?.submittedDays || 1;

  return (
    <AdminShell title="Bảng xếp hạng" subtitle={`Tháng ${data?.month ?? "…"} · theo số ngày đã gửi`}>
      {loading ? (
        <div className="bg-white rounded-lg border border-line shadow-e2 p-8 text-center text-ink-muted text-[14px]">Đang tải…</div>
      ) : !data?.hasData ? (
        <div className="bg-white rounded-lg border border-line shadow-e2 p-10 text-center">
          <div className="text-[15px] font-semibold text-ink">Chưa có dữ liệu để xếp hạng.</div>
          <div className="text-[13px] text-ink-muted mt-1">Bảng xếp hạng hiển thị khi có lần gửi 5S trong tháng.</div>
        </div>
      ) : (
        <div className="bg-white rounded-lg border border-line shadow-e2 overflow-x-auto">
          <div className="px-5 py-4 border-b border-line text-[16px] font-semibold">Toàn bộ đơn vị</div>
          <table className="w-full border-collapse">
            <thead>
              <tr className="text-left">
                {["#", "Đơn vị", "Số ngày đã gửi"].map((h) => (
                  <th key={h} className="px-4 py-3 text-[12px] uppercase tracking-wide text-ink-muted font-bold border-b border-line">{h}</th>
                ))}
              </tr>
            </thead>
            <tbody>
              {ranking.map((u, i) => (
                <tr key={u.code} className="hover:bg-surface-2">
                  <td className="px-4 py-3 border-b border-line">{MEDALS[i] ?? <span className="text-ink-muted font-bold">{i + 1}</span>}</td>
                  <td className="px-4 py-3 border-b border-line font-semibold">{u.code} — {u.name}</td>
                  <td className="px-4 py-3 border-b border-line">
                    <div className="flex items-center gap-3">
                      <div className="h-2 rounded-pill bg-surface overflow-hidden min-w-[120px] flex-1">
                        <i className={`block h-full rounded-pill bg-gradient-to-r ${barColor(u.submittedDays / maxDays)}`} style={{ width: `${Math.round((u.submittedDays / maxDays) * 100)}%` }} />
                      </div>
                      <b>{u.submittedDays}</b>
                    </div>
                  </td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      )}
    </AdminShell>
  );
}

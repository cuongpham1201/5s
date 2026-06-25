"use client";

import { useEffect, useMemo, useState } from "react";
import { AdminShell } from "@/components/layout/AdminShell";

interface Row { code: string; name: string; days: Record<string, boolean> }
interface CalResp { month: string; rows: Row[]; hasData: boolean }

const LEGEND = [
  { c: "bg-success", t: "Đã gửi" },
  { c: "bg-danger", t: "Chưa gửi" },
];

export default function CalendarPage() {
  const [data, setData] = useState<CalResp | null>(null);
  const [loading, setLoading] = useState(true);

  useEffect(() => {
    fetch("/api/admin/calendar").then((r) => (r.ok ? r.json() : null)).then(setData).finally(() => setLoading(false));
  }, []);

  const month = data?.month ?? "";
  const days = useMemo(() => {
    if (!month) return [];
    const [y, m] = month.split("-").map(Number);
    const n = new Date(y, m, 0).getDate();
    return Array.from({ length: n }, (_, i) => String(i + 1).padStart(2, "0"));
  }, [month]);

  const rows = data?.rows ?? [];

  return (
    <AdminShell title="Lịch tổng hợp gửi ảnh" subtitle={`Tháng ${month || "…"}`}>
      <div className="bg-white rounded-lg border border-line shadow-e2 px-5 py-3.5 mb-[18px]">
        <div className="flex flex-wrap gap-[18px] items-center text-[13px]">
          {LEGEND.map((l) => (
            <span key={l.t} className="flex items-center gap-1.5">
              <i className={`w-4 h-4 rounded-[5px] inline-block ${l.c}`} /> {l.t}
            </span>
          ))}
        </div>
      </div>

      <div className="bg-white rounded-lg border border-line shadow-e2">
        <div className="flex items-center justify-between px-5 py-4 border-b border-line">
          <span className="text-[16px] font-semibold">Trạng thái theo ngày</span>
          <span className="text-[13px] text-ink-muted">{rows.length} đơn vị</span>
        </div>
        {loading ? (
          <div className="p-8 text-center text-ink-muted text-[14px]">Đang tải…</div>
        ) : rows.length === 0 ? (
          <div className="p-8 text-center text-ink-muted text-[14px]">Chưa có phòng ban trong Config_Departments.</div>
        ) : !data?.hasData ? (
          <div className="p-10 text-center">
            <div className="text-[15px] font-semibold text-ink">Chưa có dữ liệu gửi ảnh trong tháng.</div>
            <div className="text-[13px] text-ink-muted mt-1">Ma trận sẽ hiển thị khi có lần gửi 5S.</div>
          </div>
        ) : (
          <div className="p-5 overflow-x-auto">
            <table className="border-separate" style={{ borderSpacing: "5px" }}>
              <thead>
                <tr>
                  <th className="text-left text-[13px] font-bold whitespace-nowrap px-1">Đơn vị</th>
                  {days.map((d) => (
                    <th key={d} className="text-[11px] text-ink-muted font-bold p-1 text-center">{d}</th>
                  ))}
                </tr>
              </thead>
              <tbody>
                {rows.map((row) => (
                  <tr key={row.code}>
                    <td className="text-left font-bold text-[13px] whitespace-nowrap pr-2" title={row.name}>{row.code}</td>
                    {days.map((d) => {
                      const ok = !!row.days[`${month}-${d}`];
                      return (
                        <td key={d} className="text-center">
                          <span className={`inline-grid place-items-center w-6 h-6 rounded-[5px] text-white text-[11px] ${ok ? "bg-success" : "bg-danger/70"}`}>
                            {ok ? "✓" : ""}
                          </span>
                        </td>
                      );
                    })}
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        )}
      </div>
    </AdminShell>
  );
}

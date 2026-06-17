"use client";

import { useState } from "react";
import { AppShell } from "@/components/layout/AppShell";
import { AppHeader } from "@/components/layout/AppHeader";
import { DeptGalleryModal } from "@/components/overview/DeptGalleryModal";
import { ALL_DEPARTMENTS, historyByDate, last7Days, todayKpi } from "@/lib/mock-overview";

const TABS = ["Ngày", "Tuần", "Tháng"] as const;

export default function HistoryPage() {
  const [tab, setTab] = useState<(typeof TABS)[number]>("Ngày");
  const [openDept, setOpenDept] = useState<string | null>(null);

  // Tuần: số ngày đã chụp trong 7 ngày, theo phòng ban.
  const weekly = ALL_DEPARTMENTS.map((d) => ({
    code: d.code,
    name: d.name,
    days: last7Days(d.code).filter((x) => x.ok).length,
  })).sort((a, b) => b.days - a.days);

  // Tháng (mock): tỷ lệ hoàn thành theo phòng ban.
  const monthly = ALL_DEPARTMENTS.map((d, i) => ({
    code: d.code,
    name: d.name,
    pct: Math.max(40, 100 - ((i * 7) % 55)),
  })).sort((a, b) => b.pct - a.pct);
  const top = monthly.slice(0, 3);
  const under = monthly.filter((m) => m.pct < 70);
  const kpi = todayKpi();

  return (
    <AppShell>
      <AppHeader title="Lịch sử" subtitle="Xem lại ảnh theo thời gian" />
      <div className="px-5 pb-6">
        <div className="segmented">
          {TABS.map((t) => (
            <button key={t} className={tab === t ? "is-active" : ""} onClick={() => setTab(t)}>
              {t}
            </button>
          ))}
        </div>

        {tab === "Ngày" && (
          <div className="flex flex-col gap-4 mt-4">
            {historyByDate().map((day) => (
              <div key={day.date}>
                <div className="flex items-center justify-between mb-2">
                  <span className="font-semibold">{day.date} · {day.weekday}</span>
                  <span className="badge badge-success">{day.depts.length} phòng</span>
                </div>
                <div className="flex flex-wrap gap-2">
                  {day.depts.map((code) => (
                    <button key={code} onClick={() => setOpenDept(code)} className="badge badge-neutral text-[13px]">
                      {code}
                    </button>
                  ))}
                </div>
              </div>
            ))}
          </div>
        )}

        {tab === "Tuần" && (
          <div className="card-flat mt-4 divide-y divide-line">
            {weekly.map((w) => (
              <div key={w.code} className="flex items-center gap-3 px-4 py-3">
                <span className="flex-1 min-w-0">
                  <span className="block font-semibold text-[15px]">{w.code}</span>
                  <span className="block text-[12px] text-ink-muted truncate">{w.name}</span>
                </span>
                <span className={`font-semibold ${w.days >= 6 ? "text-success" : w.days >= 4 ? "text-warning" : "text-danger"}`}>
                  {w.days}/7 ngày
                </span>
              </div>
            ))}
          </div>
        )}

        {tab === "Tháng" && (
          <div className="mt-4 flex flex-col gap-4">
            <div className="card-flat p-4">
              <div className="text-[13px] text-ink-muted">Tỷ lệ hoàn thành tháng 06/2026 (mẫu)</div>
              <div className="text-[28px] font-bold mt-1">{kpi.pct}%</div>
            </div>
            <div>
              <div className="text-[15px] font-semibold mb-2">🏆 Top phòng ban</div>
              <div className="card-flat divide-y divide-line">
                {top.map((m, i) => (
                  <div key={m.code} className="flex items-center gap-3 px-4 py-3">
                    <span className="text-[18px] w-6 text-center">{["🥇", "🥈", "🥉"][i]}</span>
                    <span className="flex-1 font-semibold">{m.code}</span>
                    <span className="font-bold text-success">{m.pct}%</span>
                  </div>
                ))}
              </div>
            </div>
            <div>
              <div className="text-[15px] font-semibold mb-2">⚠ Phòng ban chưa đạt (&lt;70%)</div>
              <div className="card-flat divide-y divide-line">
                {under.length === 0 ? (
                  <div className="px-4 py-3 text-ink-muted text-[14px]">Tất cả đều đạt 👍</div>
                ) : (
                  under.map((m) => (
                    <div key={m.code} className="flex items-center gap-3 px-4 py-3">
                      <span className="flex-1 font-semibold">{m.code}</span>
                      <span className="font-bold text-danger">{m.pct}%</span>
                    </div>
                  ))
                )}
              </div>
            </div>
          </div>
        )}
      </div>

      <DeptGalleryModal code={openDept} onClose={() => setOpenDept(null)} />
    </AppShell>
  );
}

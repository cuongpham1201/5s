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

  const weekly = ALL_DEPARTMENTS.map((d) => ({
    code: d.code,
    name: d.name,
    days: last7Days(d.code).filter((x) => x.ok).length,
  })).sort((a, b) => b.days - a.days);

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
      <div className="px-4 pb-6 flex flex-col gap-4">
        <div className="segmented">
          {TABS.map((t) => (
            <button key={t} className={tab === t ? "is-active" : ""} onClick={() => setTab(t)}>
              {t}
            </button>
          ))}
        </div>

        {tab === "Ngày" &&
          historyByDate().map((day) => (
            <div key={day.date} className="card">
              <div className="flex items-center justify-between mb-2.5">
                <div>
                  <div className="font-bold text-[14.5px]">{day.date}</div>
                  <div className="text-[12px] text-ink-muted">{day.weekday}</div>
                </div>
                <span className="text-[12px] font-semibold px-2.5 h-6 rounded-pill grid place-items-center bg-success-bg text-success">
                  {day.depts.length} phòng
                </span>
              </div>
              <div className="flex flex-wrap gap-1.5">
                {day.depts.slice(0, 8).map((code) => (
                  <button
                    key={code}
                    onClick={() => setOpenDept(code)}
                    className="px-2.5 h-7 rounded-pill text-[12px] font-semibold bg-surface text-ink"
                  >
                    {code}
                  </button>
                ))}
                {day.depts.length > 8 && (
                  <span className="px-2.5 h-7 rounded-pill grid place-items-center text-[12px] font-semibold text-ink-muted bg-surface">
                    +{day.depts.length - 8}
                  </span>
                )}
              </div>
            </div>
          ))}

        {tab === "Tuần" && (
          <div className="card-flat divide-y divide-line overflow-hidden">
            {weekly.map((w) => (
              <div key={w.code} className="flex items-center gap-3 px-4 py-2.5">
                <span className="flex-1 min-w-0">
                  <span className="block font-bold text-[15px] leading-tight">{w.code}</span>
                  <span className="block text-[12px] text-ink-muted truncate">{w.name}</span>
                </span>
                <span className="w-24 h-2 rounded-pill bg-surface overflow-hidden">
                  <i
                    className={`block h-full rounded-pill ${w.days >= 6 ? "bg-success" : w.days >= 4 ? "bg-warning" : "bg-danger"}`}
                    style={{ width: `${(w.days / 7) * 100}%` }}
                  />
                </span>
                <span className="text-[13px] font-bold w-12 text-right">{w.days}/7</span>
              </div>
            ))}
          </div>
        )}

        {tab === "Tháng" && (
          <>
            <div className="card p-5">
              <div className="text-[12.5px] text-ink-muted">Tỷ lệ hoàn thành tháng 06/2026</div>
              <div className="text-[30px] font-extrabold mt-1">{kpi.pct}%</div>
            </div>
            <div>
              <div className="text-[15px] font-bold mb-2">Top phòng ban</div>
              <div className="card-flat divide-y divide-line overflow-hidden">
                {top.map((m, i) => (
                  <div key={m.code} className="flex items-center gap-3 px-4 py-3">
                    <span className="text-[16px] w-6 text-center">{["🥇", "🥈", "🥉"][i]}</span>
                    <span className="flex-1 font-bold">{m.code}</span>
                    <span className="font-extrabold text-success">{m.pct}%</span>
                  </div>
                ))}
              </div>
            </div>
            <div>
              <div className="text-[15px] font-bold mb-2">Phòng ban chưa đạt (&lt;70%)</div>
              <div className="card-flat divide-y divide-line overflow-hidden">
                {under.length === 0 ? (
                  <div className="px-4 py-3 text-ink-muted text-[14px]">Tất cả đều đạt.</div>
                ) : (
                  under.map((m) => (
                    <div key={m.code} className="flex items-center gap-3 px-4 py-3">
                      <span className="flex-1 font-bold">{m.code}</span>
                      <span className="w-24 h-2 rounded-pill bg-surface overflow-hidden">
                        <i className="block h-full rounded-pill bg-danger" style={{ width: `${m.pct}%` }} />
                      </span>
                      <span className="font-extrabold text-danger w-12 text-right">{m.pct}%</span>
                    </div>
                  ))
                )}
              </div>
            </div>
          </>
        )}
      </div>

      <DeptGalleryModal code={openDept} onClose={() => setOpenDept(null)} />
    </AppShell>
  );
}

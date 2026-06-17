"use client";

import { useState } from "react";
import { AppShell } from "@/components/layout/AppShell";
import { AppHeader } from "@/components/layout/AppHeader";
import { DeptGalleryModal } from "@/components/overview/DeptGalleryModal";
import { MockPhoto } from "@/components/ui/MockPhoto";
import { ALL_DEPARTMENTS, findDept, historyByDate, last7Days, todayKpi } from "@/lib/mock-overview";

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
            <div key={day.date} className="card p-4">
              <div className="flex items-center justify-between mb-3">
                <div>
                  <div className="font-bold text-[15px]">{day.date}</div>
                  <div className="text-[12px] text-ink-muted">{day.weekday}</div>
                </div>
                <span className="text-[12px] font-semibold px-2.5 h-7 rounded-pill grid place-items-center bg-success-bg text-success">
                  {day.depts.length} phòng
                </span>
              </div>
              <div className="grid grid-cols-4 gap-2">
                {day.depts.slice(0, 8).map((code) => (
                  <button key={code} onClick={() => setOpenDept(code)}>
                    <MockPhoto hue={findDept(code)?.hue ?? 210} className="aspect-square">
                      <span className="absolute left-1 top-1 px-1.5 h-5 rounded-pill grid place-items-center text-[9px] font-bold bg-black/45 text-white">
                        {code}
                      </span>
                    </MockPhoto>
                  </button>
                ))}
                {day.depts.length > 8 && (
                  <div className="aspect-square rounded-[16px] bg-surface grid place-items-center text-[13px] font-bold text-ink-muted">
                    +{day.depts.length - 8}
                  </div>
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

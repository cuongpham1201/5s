"use client";

import Link from "next/link";
import { useEffect, useMemo, useState } from "react";
import { AppShell } from "@/components/layout/AppShell";
import { AppHeader } from "@/components/layout/AppHeader";
import { Icon } from "@/components/ui/Icon";
import type { TodaySummary } from "@/lib/sharepoint/report-service";

interface Dept { code: string; name: string }

export default function OverviewPage() {
  const [depts, setDepts] = useState<Dept[]>([]);
  const [today, setToday] = useState<TodaySummary | null>(null);
  const [loading, setLoading] = useState(true);
  const [q, setQ] = useState("");

  useEffect(() => {
    let active = true;
    Promise.all([
      fetch("/api/config/departments").then((r) => (r.ok ? r.json() : null)),
      fetch("/api/reports/today").then((r) => (r.ok ? r.json() : null)),
    ]).then(([d, t]) => {
      if (!active) return;
      setDepts(d?.departments ?? []);
      setToday(t);
      setLoading(false);
    });
    return () => { active = false; };
  }, []);

  const submitted = new Set(today?.submittedDepartmentCodes ?? []);
  const expected = depts.length;
  const submittedCount = today?.submittedDepartments ?? 0;
  const pct = Math.round((today?.completionRate ?? 0) * 100);

  const list = useMemo(() => {
    const term = q.trim().toLowerCase();
    return depts
      .filter((d) => !term || d.code.toLowerCase().includes(term) || d.name.toLowerCase().includes(term))
      .map((d) => ({ ...d, shot: submitted.has(d.code) }))
      .sort((a, b) => (a.shot !== b.shot ? (a.shot ? 1 : -1) : a.code.localeCompare(b.code)));
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [q, depts, today]);

  return (
    <AppShell>
      <AppHeader title="Toàn cảnh hôm nay" subtitle={today?.date ?? ""} showHome />
      <div className="px-4 pb-6 flex flex-col gap-4">
        <div className="card p-4 flex items-center gap-4">
          <div className="text-[26px] font-extrabold leading-none">
            {loading ? "…" : submittedCount}<span className="text-ink-muted text-[15px] font-bold"> / {expected}</span>
          </div>
          <div className="flex-1">
            <div className="text-[12.5px] text-ink-muted mb-1.5">phòng ban đã chụp · {pct}%</div>
            <div className="h-2 rounded-pill bg-surface overflow-hidden">
              <i className="block h-full rounded-pill bg-success" style={{ width: `${pct}%` }} />
            </div>
          </div>
        </div>

        <div className="flex items-center gap-2.5 rounded-[14px] bg-white border border-line px-3.5 h-12 shadow-e2">
          <Icon name="search" size={18} className="text-ink-muted" />
          <input value={q} onChange={(e) => setQ(e.target.value)} placeholder="Tìm phòng ban…" className="flex-1 bg-transparent outline-none text-[15px] placeholder:text-ink-disabled" />
          {q && <button onClick={() => setQ("")} className="text-ink-muted" aria-label="Xoá"><Icon name="x" size={16} /></button>}
        </div>

        {loading ? (
          <div className="text-ink-muted text-[14px] px-1">Đang tải…</div>
        ) : expected === 0 ? (
          <div className="card-flat p-8 text-center text-ink-muted text-[13px]">Chưa có phòng ban trong Config_Departments.</div>
        ) : (
          <div className="card-flat divide-y divide-line overflow-hidden">
            {list.map((d) => (
              <Link
                key={d.code}
                href={`/gallery?departmentCode=${encodeURIComponent(d.code)}${today?.date ? `&date=${today.date}` : ""}`}
                className="w-full flex items-center gap-3 px-4 py-2.5 text-left hover:bg-surface-2"
              >
                <span className={`w-2.5 h-2.5 rounded-full flex-none ${d.shot ? "bg-success" : "bg-danger"}`} />
                <span className="flex-1 min-w-0">
                  <span className="block font-bold text-[15px] leading-tight">{d.code}</span>
                  <span className="block text-[12px] text-ink-muted truncate">{d.name}</span>
                </span>
                <span className={`text-[12px] font-semibold px-2 h-6 rounded-pill grid place-items-center ${d.shot ? "bg-success-bg text-success" : "bg-danger-bg text-danger"}`}>
                  {d.shot ? "Đã chụp" : "Chưa chụp"}
                </span>
                <Icon name="chevronRight" size={16} className="text-ink-disabled flex-none" />
              </Link>
            ))}
            {list.length === 0 && <div className="px-4 py-6 text-center text-ink-muted text-[14px]">Không tìm thấy.</div>}
          </div>
        )}
      </div>
    </AppShell>
  );
}

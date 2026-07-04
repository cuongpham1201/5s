"use client";

import { Fragment, useCallback, useEffect, useState } from "react";
import { AdminShell } from "@/components/layout/AdminShell";

type Group = "day" | "week" | "month";
type SType = "all" | "daily" | "3s";
interface AreaStat { area: string; total: number; byBucket: Record<string, number> }
interface DeptStat { code: string; name: string; total: number; byBucket: Record<string, number>; areas: AreaStat[] }
interface Stats { group: Group; from: string; to: string; buckets: string[]; byBucketTotal: Record<string, number>; grandTotal: number; rows: DeptStat[] }

const GROUPS: { key: Group; label: string }[] = [
  { key: "day", label: "Ngày" },
  { key: "week", label: "Tuần" },
  { key: "month", label: "Tháng" },
];

/** Short label for chart columns (day: dd/mm, week: Wxx, month: mm/yyyy). */
function shortBucket(b: string, g: Group): string {
  if (g === "day") return `${b.slice(8, 10)}/${b.slice(5, 7)}`;
  if (g === "week") return b.slice(5);
  return `${b.slice(5, 7)}/${b.slice(0, 4)}`;
}

export default function PhotoStatsPage() {
  const [group, setGroup] = useState<Group>("day");
  const [stype, setStype] = useState<SType>("all");
  const [from, setFrom] = useState("");
  const [to, setTo] = useState("");
  const [stats, setStats] = useState<Stats | null>(null);
  const [loading, setLoading] = useState(true);
  const [open, setOpen] = useState<Set<string>>(new Set());

  const qs = useCallback((g: Group, f: string, t: string, ty: SType) => {
    const p = new URLSearchParams({ group: g, type: ty });
    if (f) p.set("from", f);
    if (t) p.set("to", t);
    return p.toString();
  }, []);

  const load = useCallback(async (g: Group, f: string, t: string, ty: SType) => {
    setLoading(true);
    try {
      const r = await fetch(`/api/admin/photo-stats?${qs(g, f, t, ty)}`);
      const j = r.ok ? ((await r.json()) as Stats) : null;
      setStats(j);
      if (j) { setFrom(j.from); setTo(j.to); }
    } finally { setLoading(false); }
  }, [qs]);

  useEffect(() => { void load("day", "", "", "all"); }, [load]);

  const pick = (g: Group) => { setGroup(g); void load(g, "", "", stype); };
  const pickType = (ty: SType) => { setStype(ty); void load(group, from, to, ty); };
  const apply = () => void load(group, from, to, stype);
  const toggle = (code: string) => setOpen((s) => { const n = new Set(s); if (n.has(code)) n.delete(code); else n.add(code); return n; });

  const maxBucket = stats ? Math.max(1, ...stats.buckets.map((b) => stats.byBucketTotal[b] ?? 0)) : 1;
  const maxDept = stats ? Math.max(1, ...stats.rows.map((r) => r.total)) : 1;

  return (
    <AdminShell
      title="Thống kê ảnh 5S"
      subtitle="Số ảnh thực tế (Data_SubmissionPhotos) theo phòng ban / khu vực"
      actions={
        <a href={`/api/admin/photo-stats/export?${qs(group, from, to, stype)}`} className="btn btn-primary !min-h-9">
          ⬇ Xuất Excel
        </a>
      }
    >
      {/* Controls */}
      <div className="bg-white rounded-lg border border-line shadow-e2 p-3.5 mb-4 flex flex-wrap items-center gap-2.5">
        <div className="flex rounded-md border border-line overflow-hidden">
          {GROUPS.map((g) => (
            <button key={g.key} onClick={() => pick(g.key)}
              className={`px-3.5 py-2 text-[13px] font-semibold ${group === g.key ? "bg-primary-600 text-white" : "bg-white text-ink"}`}>
              {g.label}
            </button>
          ))}
        </div>
        <div className="flex rounded-md border border-line overflow-hidden">
          {([["all", "Tất cả"], ["daily", "Hàng ngày"], ["3s", "Thực hành 3S"]] as [SType, string][]).map(([k, lbl]) => (
            <button key={k} onClick={() => pickType(k)}
              className={`px-3 py-2 text-[13px] font-semibold ${stype === k ? "bg-ink text-white" : "bg-white text-ink"}`}>
              {lbl}
            </button>
          ))}
        </div>
        <label className="text-[13px] text-ink-muted">Từ</label>
        <input type="date" value={from} onChange={(e) => setFrom(e.target.value)} className="rounded-md border border-line px-2.5 py-1.5 text-[13px]" />
        <label className="text-[13px] text-ink-muted">đến</label>
        <input type="date" value={to} onChange={(e) => setTo(e.target.value)} className="rounded-md border border-line px-2.5 py-1.5 text-[13px]" />
        <button onClick={apply} className="btn btn-secondary !min-h-9">Xem</button>
        {stats && <span className="ml-auto text-[13px] text-ink-muted">Tổng: <b className="text-ink">{stats.grandTotal}</b> ảnh · {stats.rows.length} phòng ban</span>}
      </div>

      {loading ? (
        <div className="text-ink-muted text-[13px] p-6">Đang tổng hợp…</div>
      ) : !stats ? (
        <div className="text-danger text-[13px] p-6">Không tải được dữ liệu.</div>
      ) : (
        <>
          {/* Chart 1 — total photos per period */}
          <div className="bg-white rounded-lg border border-line shadow-e2 p-4 mb-4">
            <div className="text-[14px] font-semibold mb-3">Tổng số ảnh theo {GROUPS.find((g) => g.key === group)?.label.toLowerCase()}</div>
            <div className="overflow-x-auto">
              <div className="flex items-end gap-1.5 h-[160px] min-w-fit pr-2">
                {stats.buckets.map((b) => {
                  const v = stats.byBucketTotal[b] ?? 0;
                  return (
                    <div key={b} className="flex flex-col items-center gap-1 w-[42px] flex-none">
                      <span className="text-[11px] font-semibold text-ink">{v || ""}</span>
                      <div className="w-[26px] rounded-t-sm bg-primary-600/90" style={{ height: `${Math.max(v ? 4 : 1, (v / maxBucket) * 120)}px` }} />
                      <span className="text-[10.5px] text-ink-muted whitespace-nowrap">{shortBucket(b, group)}</span>
                    </div>
                  );
                })}
              </div>
            </div>
          </div>

          {/* Chart 2 — ranking per department */}
          <div className="bg-white rounded-lg border border-line shadow-e2 p-4 mb-4">
            <div className="text-[14px] font-semibold mb-3">Xếp hạng phòng ban (số ảnh trong kỳ)</div>
            {stats.rows.length === 0 ? (
              <div className="text-ink-muted text-[13px]">Không có ảnh trong khoảng đã chọn.</div>
            ) : (
              <div className="flex flex-col gap-1.5">
                {stats.rows.map((r) => (
                  <div key={r.code} className="flex items-center gap-2.5">
                    <span className="w-[64px] text-[12.5px] font-bold text-right flex-none">{r.code}</span>
                    <div className="flex-1 h-[18px] bg-surface rounded-sm overflow-hidden">
                      <div className="h-full bg-primary-600/85 rounded-sm" style={{ width: `${(r.total / maxDept) * 100}%` }} />
                    </div>
                    <span className="w-[44px] text-[12.5px] font-semibold flex-none">{r.total}</span>
                  </div>
                ))}
              </div>
            )}
          </div>

          {/* Matrix — dept × period with expandable areas */}
          <div className="bg-white rounded-lg border border-line shadow-e2 overflow-hidden">
            <div className="px-5 py-4 border-b border-line text-[15px] font-semibold">Chi tiết theo phòng ban / khu vực <span className="text-ink-muted font-normal text-[12.5px]">(bấm dòng để xem khu vực)</span></div>
            <div className="overflow-x-auto">
              <table className="w-full text-[12.5px]">
                <thead className="text-left text-ink-muted">
                  <tr>
                    <th className="px-3 py-2.5 border-b border-line whitespace-nowrap">Phòng ban</th>
                    {stats.buckets.map((b) => <th key={b} className="px-2 py-2.5 border-b border-line text-center whitespace-nowrap">{shortBucket(b, group)}</th>)}
                    <th className="px-3 py-2.5 border-b border-line text-center">Tổng</th>
                  </tr>
                </thead>
                <tbody>
                  {stats.rows.map((r) => (
                    <Fragment key={r.code}>
                      <tr onClick={() => toggle(r.code)} className="cursor-pointer hover:bg-surface">
                        <td className="px-3 py-2 border-b border-line font-semibold whitespace-nowrap">{open.has(r.code) ? "▾" : "▸"} {r.code} · {r.name}</td>
                        {stats.buckets.map((b) => <td key={b} className="px-2 py-2 border-b border-line text-center">{r.byBucket[b] ?? ""}</td>)}
                        <td className="px-3 py-2 border-b border-line text-center font-bold">{r.total}</td>
                      </tr>
                      {open.has(r.code) && r.areas.map((a) => (
                        <tr key={`${r.code}|${a.area}`} className="bg-surface/60">
                          <td className="px-3 py-1.5 border-b border-line pl-8 text-ink-muted whitespace-nowrap">📍 {a.area}</td>
                          {stats.buckets.map((b) => <td key={b} className="px-2 py-1.5 border-b border-line text-center text-ink-muted">{a.byBucket[b] ?? ""}</td>)}
                          <td className="px-3 py-1.5 border-b border-line text-center text-ink-muted">{a.total}</td>
                        </tr>
                      ))}
                    </Fragment>
                  ))}
                  <tr>
                    <td className="px-3 py-2.5 font-bold">TỔNG CỘNG</td>
                    {stats.buckets.map((b) => <td key={b} className="px-2 py-2.5 text-center font-bold">{stats.byBucketTotal[b] ?? ""}</td>)}
                    <td className="px-3 py-2.5 text-center font-bold">{stats.grandTotal}</td>
                  </tr>
                </tbody>
              </table>
            </div>
          </div>
        </>
      )}
    </AdminShell>
  );
}

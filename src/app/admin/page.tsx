import Link from "next/link";
import { AdminShell } from "@/components/layout/AdminShell";
import { StatusBadge } from "@/components/ui/StatusBadge";
import { PENDING_UNITS, TODAY_KPI } from "@/lib/mock-data";

const KPIS = [
  { label: "Expected Units", value: TODAY_KPI.expectedUnits, icon: "🏭", ico: "bg-info-bg text-info", note: "Tổng đơn vị tham gia" },
  { label: "Submitted Units", value: TODAY_KPI.submittedUnits, icon: "✅", ico: "bg-success-bg text-success", note: "▲ 2 so với hôm qua", up: true },
  { label: "Missing Units", value: TODAY_KPI.missingUnits, icon: "⚠️", ico: "bg-danger-bg text-danger", note: "cần nhắc nhở", down: true },
  { label: "Completion %", value: `${Math.round(TODAY_KPI.completion * 100)}%`, icon: "📈", ico: "bg-warning-bg text-warning", note: "▲ 5% so với hôm qua", up: true },
];

const BARS = [
  { h: 62, d: "T2" }, { h: 71, d: "T3" }, { h: 68, d: "T4" }, { h: 83, d: "T5" },
  { h: 90, d: "T6" }, { h: 74, d: "T7" }, { h: 78, d: "CN" },
];

export default function DashboardPage() {
  return (
    <AdminShell
      title="Dashboard"
      subtitle="Hôm nay · Thứ Hai, 15/06/2026"
      actions={<span className="hidden sm:inline-flex items-center gap-2 rounded-md border border-line-strong bg-white px-3.5 py-2 text-sm font-semibold">📅 Hôm nay ▾</span>}
    >
      {/* KPI cards */}
      <div className="grid grid-cols-2 lg:grid-cols-4 gap-4">
        {KPIS.map((k) => (
          <div key={k.label} className="bg-white rounded-lg p-5 shadow-e2 border border-line">
            <div className="flex items-center justify-between">
              <span className="text-[13px] text-ink-muted font-semibold">{k.label}</span>
              <span className={`w-[38px] h-[38px] rounded-[10px] grid place-items-center text-lg ${k.ico}`}>{k.icon}</span>
            </div>
            <div className="text-[32px] font-bold mt-2 tracking-tight">{k.value}</div>
            <div className={`text-[12px] font-semibold mt-1 ${k.up ? "text-success" : k.down ? "text-danger" : "text-ink-muted"}`}>{k.note}</div>
          </div>
        ))}
      </div>

      {/* Chart + pending */}
      <div className="grid grid-cols-1 lg:grid-cols-[1.6fr_1fr] gap-[18px] mt-[18px]">
        <div className="bg-white rounded-lg border border-line shadow-e2">
          <div className="flex items-center justify-between px-5 py-4 border-b border-line">
            <span className="text-[16px] font-semibold">Tỷ lệ hoàn thành</span>
            <div className="segmented w-[230px]">
              <button>Ngày</button>
              <button className="is-active">Tuần</button>
              <button>Tháng</button>
            </div>
          </div>
          <div className="p-5 pb-8">
            <div className="flex items-end gap-3 h-[220px] pt-3">
              {BARS.map((b) => (
                <div key={b.d} className="flex-1 relative rounded-t-md bg-gradient-to-t from-primary-600 to-[#5aa3df]" style={{ height: `${b.h}%` }}>
                  <b className="absolute -top-5 inset-x-0 text-center text-[11px] font-bold">{b.h}%</b>
                  <span className="absolute -bottom-6 inset-x-0 text-center text-[11px] text-ink-muted">{b.d}</span>
                </div>
              ))}
            </div>
          </div>
        </div>

        <div className="bg-white rounded-lg border border-line shadow-e2">
          <div className="flex items-center justify-between px-5 py-4 border-b border-line">
            <span className="text-[16px] font-semibold">Chưa gửi hôm nay</span>
            <StatusBadge tone="danger">{PENDING_UNITS.length}</StatusBadge>
          </div>
          <div>
            {PENDING_UNITS.slice(0, 3).map((u) => (
              <div key={u.code} className="flex items-center gap-3.5 px-5 py-3.5 border-b border-line">
                <span className="w-2.5 h-2.5 rounded-full bg-warning" />
                <div className="flex-1 min-w-0">
                  <div className="font-semibold">{u.code}</div>
                  <div className="text-[13px] text-ink-muted">Lần cuối: {u.last}</div>
                </div>
                <Link href="/admin/pending" className="btn btn-secondary !min-h-9 !py-1.5 !px-3.5">Nhắc</Link>
              </div>
            ))}
            <div className="p-3.5">
              <Link href="/admin/pending" className="btn btn-ghost btn-block">Xem tất cả →</Link>
            </div>
          </div>
        </div>
      </div>
    </AdminShell>
  );
}

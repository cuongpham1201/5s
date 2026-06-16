import { AdminShell } from "@/components/layout/AdminShell";
import { RANKING } from "@/lib/mock-data";

const MEDALS = ["🥇", "🥈", "🥉"];

function barColor(rate: number) {
  if (rate >= 0.9) return "from-[#0E700E] to-[#3ba83b]";
  if (rate >= 0.75) return "from-[#0E700E] to-[#3ba83b]";
  if (rate >= 0.7) return "from-[#BC4B09] to-[#e08a3c]";
  return "from-[#B10E1C] to-[#e0606a]";
}

export default function RankingPage() {
  const podium = RANKING.slice(0, 3);
  return (
    <AdminShell
      title="Bảng xếp hạng"
      subtitle="Top đơn vị thực hiện tốt"
      actions={<span className="hidden sm:inline-flex items-center gap-2 rounded-md border border-line-strong bg-white px-3.5 py-2 text-sm font-semibold">📅 Tháng 06/2026 ▾</span>}
    >
      {/* Podium */}
      <div className="grid grid-cols-1 sm:grid-cols-3 gap-[18px]">
        {[1, 0, 2].map((idx, pos) => {
          const u = podium[idx];
          const colors = ["text-silver", "text-gold", "text-bronze"][pos];
          return (
            <div
              key={u.code}
              className={`bg-white rounded-lg border shadow-e2 text-center p-5 ${idx === 0 ? "sm:order-2 border-gold border-2 p-6" : pos === 0 ? "sm:order-1" : "sm:order-3"} border-line`}
            >
              <div className={idx === 0 ? "text-[42px]" : "text-[34px]"}>{MEDALS[idx]}</div>
              <div className="text-[18px] font-semibold mt-2">{u.code}</div>
              <div className={`text-[28px] font-bold ${colors}`}>{Math.round(u.completionRate * 100)}%</div>
              <div className="text-[13px] text-ink-muted">{u.submittedDays}/{u.expectedDays} ngày</div>
            </div>
          );
        })}
      </div>

      {/* Full table */}
      <div className="bg-white rounded-lg border border-line shadow-e2 mt-6 overflow-x-auto">
        <div className="px-5 py-4 border-b border-line text-[16px] font-semibold">Toàn bộ đơn vị</div>
        <table className="w-full border-collapse">
          <thead>
            <tr className="text-left">
              {["#", "Đơn vị", "Ngày đã gửi", "Số ảnh", "Completion Rate"].map((h) => (
                <th key={h} className="px-4 py-3 text-[12px] uppercase tracking-wide text-ink-muted font-bold border-b border-line">{h}</th>
              ))}
            </tr>
          </thead>
          <tbody>
            {RANKING.map((u, i) => (
              <tr key={u.code} className="hover:bg-surface-2">
                <td className="px-4 py-3 border-b border-line">{MEDALS[i] ?? <span className="text-ink-muted font-bold">{i + 1}</span>}</td>
                <td className="px-4 py-3 border-b border-line font-semibold">{u.code} — {u.name}</td>
                <td className="px-4 py-3 border-b border-line">{u.submittedDays}/{u.expectedDays}</td>
                <td className="px-4 py-3 border-b border-line">{u.photoCount}</td>
                <td className="px-4 py-3 border-b border-line">
                  <div className="flex items-center gap-3">
                    <div className="h-2 rounded-pill bg-surface overflow-hidden min-w-[120px] flex-1">
                      <i className={`block h-full rounded-pill bg-gradient-to-r ${barColor(u.completionRate)}`} style={{ width: `${Math.round(u.completionRate * 100)}%` }} />
                    </div>
                    <b>{Math.round(u.completionRate * 100)}%</b>
                  </div>
                </td>
              </tr>
            ))}
          </tbody>
        </table>
      </div>
    </AdminShell>
  );
}

import { AdminShell } from "@/components/layout/AdminShell";
import { HEATMAP } from "@/lib/mock-data";

const DAYS = Array.from({ length: 15 }, (_, i) => String(i + 1).padStart(2, "0"));
const CELL_TEXT: Record<string, string> = { ok: "✓", miss: "✗", partial: "!", weekend: "–", future: "" };

const LEGEND = [
  { c: "bg-success", t: "Đã gửi đủ" },
  { c: "bg-warning", t: "Gửi thiếu khu vực" },
  { c: "bg-danger", t: "Chưa gửi" },
  { c: "bg-[#eef0f3]", t: "Cuối tuần / nghỉ" },
  { c: "bg-surface", t: "Chưa tới ngày" },
];

export default function CalendarPage() {
  return (
    <AdminShell
      title="Lịch tổng hợp gửi ảnh"
      subtitle="Nhìn 5 giây — biết ngay đơn vị nào thiếu ngày nào"
      actions={<span className="hidden sm:inline-flex items-center gap-2 rounded-md border border-line-strong bg-white px-3.5 py-2 text-sm font-semibold">📅 Tháng 06/2026 ▾</span>}
    >
      {/* Legend */}
      <div className="bg-white rounded-lg border border-line shadow-e2 px-5 py-3.5 mb-[18px]">
        <div className="flex flex-wrap gap-[18px] items-center text-[13px]">
          {LEGEND.map((l) => (
            <span key={l.t} className="flex items-center gap-1.5">
              <i className={`w-4 h-4 rounded-[5px] inline-block ${l.c}`} /> {l.t}
            </span>
          ))}
        </div>
      </div>

      {/* Heatmap */}
      <div className="bg-white rounded-lg border border-line shadow-e2">
        <div className="flex items-center justify-between px-5 py-4 border-b border-line">
          <span className="text-[16px] font-semibold">Trạng thái theo ngày (01 → 15/06)</span>
          <span className="text-[13px] text-ink-muted">{HEATMAP.length} đơn vị (mẫu)</span>
        </div>
        <div className="p-5 overflow-x-auto">
          <table className="border-separate" style={{ borderSpacing: "5px" }}>
            <thead>
              <tr>
                <th className="text-left text-[13px] font-bold whitespace-nowrap px-1">Đơn vị</th>
                {DAYS.map((d) => (
                  <th key={d} className="text-[11px] text-ink-muted font-bold p-1 text-center">{d}</th>
                ))}
              </tr>
            </thead>
            <tbody>
              {HEATMAP.map((row) => (
                <tr key={row.code}>
                  <td className="text-left font-bold text-[13px] whitespace-nowrap pr-2">{row.code}</td>
                  {row.cells.map((cell) => (
                    <td key={cell.day} className="text-center">
                      <span className={`cell ${cell.status}`}>{CELL_TEXT[cell.status]}</span>
                    </td>
                  ))}
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      </div>
      <p className="text-[13px] text-ink-muted mt-4">
        Mẹo: cột dọc nhiều ô đỏ = ngày có sự cố chung. Hàng ngang nhiều đỏ = đơn vị cần nhắc nhở.
      </p>
    </AdminShell>
  );
}

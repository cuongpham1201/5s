import { AdminShell } from "@/components/layout/AdminShell";
import { StatusBadge } from "@/components/ui/StatusBadge";
import { PENDING_UNITS } from "@/lib/mock-data";

export default function PendingPage() {
  return (
    <AdminShell
      title="Đơn vị chưa gửi hôm nay"
      subtitle={`15/06/2026 · ${PENDING_UNITS.length} đơn vị`}
      actions={<button className="btn btn-primary !min-h-10">🔔 Nhắc tất cả</button>}
    >
      <div className="bg-white rounded-lg border border-line shadow-e2">
        <div className="flex items-center justify-between px-5 py-4 border-b border-line">
          <span className="text-[16px] font-semibold">Danh sách ({PENDING_UNITS.length})</span>
          <span className="hidden sm:inline-flex items-center gap-2 rounded-md border border-line-strong bg-white px-3.5 py-2 text-sm font-semibold">
            Sắp xếp: Lần cuối ▾
          </span>
        </div>
        {PENDING_UNITS.map((u) => (
          <div key={u.code} className="flex items-center gap-3.5 px-5 py-3.5 border-b border-line last:border-0">
            <StatusBadge tone="warning">⚠ {u.code}</StatusBadge>
            <div className="flex-1 min-w-0">
              <div className="font-semibold">{u.name}</div>
              <div className="text-[13px] text-ink-muted">
                Hôm nay: {u.photosToday} ảnh · Lần gửi gần nhất: {u.last}
              </div>
            </div>
            <button className="btn btn-secondary !min-h-[38px]">🔔 Nhắc</button>
          </div>
        ))}
      </div>
    </AdminShell>
  );
}

import { AdminShell } from "@/components/layout/AdminShell";
import { GALLERY_ITEMS } from "@/lib/mock-data";

export default function GalleryPage() {
  return (
    <AdminShell title="Thư viện ảnh" subtitle="1.248 ảnh · tháng 06/2026">
      {/* Filter bar */}
      <div className="flex flex-wrap gap-3 items-center mb-[18px]">
        <span className="inline-flex items-center gap-2 rounded-md border border-line-strong bg-white px-3.5 py-2 text-sm font-semibold">🏭 Department: PMKT ▾</span>
        <span className="inline-flex items-center gap-2 rounded-md border border-line-strong bg-white px-3.5 py-2 text-sm font-semibold">📍 Area: Tất cả ▾</span>
        <span className="inline-flex items-center gap-2 rounded-md border border-line-strong bg-white px-3.5 py-2 text-sm font-semibold">📅 Date: 15/06/2026 ▾</span>
        <span className="flex-1" />
        <button className="btn btn-secondary !min-h-10">⬇️ Tải về</button>
      </div>

      {/* Grid */}
      <div className="grid grid-cols-2 sm:grid-cols-3 lg:grid-cols-5 gap-3.5">
        {GALLERY_ITEMS.map((g) => (
          <div key={g.id} className="relative aspect-square rounded-md overflow-hidden shadow-e2 bg-gradient-to-br from-[#cdd7e0] to-[#8fa0b0]">
            <span className="absolute left-1.5 top-1.5 bg-black/50 text-white text-[9px] px-1.5 py-0.5 rounded">✓ 5S</span>
            <div className="absolute inset-x-0 bottom-0 bg-gradient-to-t from-black/65 to-transparent text-white text-[11px] font-semibold px-2.5 pt-4 pb-2">
              {g.area} · {g.time}
            </div>
          </div>
        ))}
      </div>
      <p className="text-[12px] text-ink-disabled mt-4">Phase 1A: ảnh là placeholder, lightbox chi tiết sẽ nối dữ liệu thật ở Phase 1B.</p>
    </AdminShell>
  );
}

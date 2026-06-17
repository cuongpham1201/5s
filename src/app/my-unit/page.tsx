"use client";

import Link from "next/link";
import { useSession } from "next-auth/react";
import { AppShell } from "@/components/layout/AppShell";
import { AppHeader } from "@/components/layout/AppHeader";
import { CURRENT_USER } from "@/lib/mock-data";
import { deptGalleryToday, findDept, last7Days } from "@/lib/mock-overview";

export default function MyUnitPage() {
  const { data } = useSession();
  const code = data?.user?.department ?? CURRENT_USER.department;
  const dept = findDept(code);
  const name = dept?.name ?? code;
  const shot = dept?.shotToday ?? false;
  const photos = deptGalleryToday(code);
  const week = last7Days(code);

  return (
    <AppShell>
      <AppHeader title="Phòng ban của tôi" subtitle={`${code} · ${name}`} />
      <div className="px-5 pb-6">
        {/* Trạng thái hôm nay */}
        <div
          className={`rounded-lg p-5 flex items-center gap-4 shadow-e4 text-white ${
            shot ? "bg-gradient-to-br from-[#0E700E] to-[#0a5c0a]" : "bg-gradient-to-br from-[#BC4B09] to-[#9c3e07]"
          }`}
        >
          <span className="w-14 h-14 rounded-pill grid place-items-center text-3xl bg-white/20">
            {shot ? "✅" : "⚠"}
          </span>
          <div>
            <div className="text-[20px] font-bold">{shot ? "Đã chụp hôm nay" : "Chưa chụp hôm nay"}</div>
            <div className="text-[13px] opacity-90">
              {shot ? `Gửi lúc ${dept?.lastTime} · ${dept?.reporter}` : "Hãy chụp ảnh 5S cho phòng ban"}
            </div>
          </div>
        </div>

        <Link href="/capture" className="btn btn-primary btn-lg btn-block mt-4">
          📷 {shot ? "Chụp thêm ảnh" : "Chụp ảnh 5S"}
        </Link>

        {/* Gallery hôm nay */}
        <div className="text-[16px] font-semibold mt-6 mb-2">Ảnh hôm nay ({photos.length})</div>
        {photos.length === 0 ? (
          <div className="card-flat p-5 text-center text-ink-muted text-[14px]">Chưa có ảnh nào hôm nay.</div>
        ) : (
          <div className="grid grid-cols-3 gap-2.5">
            {photos.map((p) => (
              <div
                key={p.id}
                className="aspect-square rounded-md relative overflow-hidden shadow-e2"
                style={{ background: `linear-gradient(135deg, hsl(${p.hue} 34% 74%), hsl(${p.hue} 30% 50%))` }}
              >
                <span className="absolute inset-0 grid place-items-center text-[28px] font-extrabold text-white/25">5S</span>
                <span className="absolute left-1 bottom-1 text-white text-[10px] font-semibold drop-shadow">{p.time}</span>
              </div>
            ))}
          </div>
        )}

        {/* Lịch sử 7 ngày */}
        <div className="text-[16px] font-semibold mt-6 mb-2">7 ngày gần nhất</div>
        <div className="card-flat divide-y divide-line">
          {week.slice().reverse().map((d) => (
            <div key={d.date} className="flex items-center justify-between px-4 py-3">
              <span className="font-semibold">{d.date}</span>
              <span className={d.ok ? "text-success" : "text-danger"}>{d.ok ? "✅ Đã chụp" : "❌ Chưa chụp"}</span>
            </div>
          ))}
        </div>
        <p className="text-[12px] text-ink-disabled mt-3 text-center">
          Chỉ hiển thị bằng chứng đã gửi — không đánh giá chất lượng.
        </p>
      </div>
    </AppShell>
  );
}

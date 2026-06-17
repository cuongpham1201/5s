"use client";

import Link from "next/link";
import { useSession } from "next-auth/react";
import { AppShell } from "@/components/layout/AppShell";
import { AppHeader } from "@/components/layout/AppHeader";
import { Icon } from "@/components/ui/Icon";
import { MockPhoto } from "@/components/ui/MockPhoto";
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
      <div className="px-4 pb-6 flex flex-col gap-5">
        {/* Trạng thái hôm nay */}
        <div
          className="rounded-[24px] p-5 flex items-center gap-4 text-white shadow-e8"
          style={{
            background: shot
              ? "linear-gradient(135deg,#22c55e,#16A34A 60%,#138a3e)"
              : "linear-gradient(135deg,#fbbf4a,#F59E0B 60%,#d4880a)",
          }}
        >
          <span className="w-14 h-14 rounded-pill grid place-items-center bg-white/20 flex-none">
            <Icon name={shot ? "check" : "alert"} size={28} strokeWidth={2.2} />
          </span>
          <div>
            <div className="text-[19px] font-bold">{shot ? "Đã chụp hôm nay" : "Chưa chụp hôm nay"}</div>
            <div className="text-[13px] opacity-90">
              {shot ? `Gửi lúc ${dept?.lastTime} · ${dept?.reporter}` : "Hãy chụp ảnh 5S cho phòng ban"}
            </div>
          </div>
        </div>

        {/* CTA */}
        <Link
          href="/capture"
          className="flex items-center gap-4 rounded-[24px] p-4 text-white shadow-cta"
          style={{ background: "linear-gradient(135deg,#22c55e,#16A34A 60%,#138a3e)" }}
        >
          <span className="w-12 h-12 rounded-pill grid place-items-center bg-white/20 flex-none">
            <Icon name="camera" size={24} strokeWidth={2} />
          </span>
          <span className="flex-1">
            <span className="block text-[17px] font-bold leading-tight">{shot ? "Chụp thêm ảnh" : "Chụp ảnh 5S"}</span>
            <span className="block text-[13px] opacity-90">Bổ sung ảnh cho hôm nay</span>
          </span>
          <Icon name="chevronRight" size={22} className="opacity-90" />
        </Link>

        {/* Gallery hôm nay */}
        <section>
          <div className="text-[15px] font-bold mb-2.5">Ảnh hôm nay ({photos.length})</div>
          {photos.length === 0 ? (
            <div className="card-flat p-6 text-center text-ink-muted text-[14px]">Chưa có ảnh nào hôm nay.</div>
          ) : (
            <div className="grid grid-cols-3 gap-2.5">
              {photos.map((p) => (
                <MockPhoto key={p.id} hue={p.hue} className="aspect-square">
                  <span className="absolute left-1.5 bottom-1.5 text-white text-[10px] font-semibold drop-shadow">{p.time}</span>
                </MockPhoto>
              ))}
            </div>
          )}
        </section>

        {/* 7 ngày — timeline chips */}
        <section>
          <div className="text-[15px] font-bold mb-2.5">7 ngày gần nhất</div>
          <div className="flex justify-between gap-1.5">
            {week.map((d) => (
              <div key={d.date} className="flex-1 flex flex-col items-center gap-1.5">
                <span
                  className={`w-9 h-9 rounded-[12px] grid place-items-center ${
                    d.ok ? "bg-success-bg text-success" : "bg-danger-bg text-danger"
                  }`}
                >
                  <Icon name={d.ok ? "check" : "x"} size={16} strokeWidth={2.4} />
                </span>
                <span className="text-[10px] text-ink-muted">{d.date.slice(0, 5)}</span>
              </div>
            ))}
          </div>
          <p className="text-[12px] text-ink-disabled mt-3 text-center">
            Chỉ hiển thị bằng chứng đã gửi — không đánh giá chất lượng.
          </p>
        </section>
      </div>
    </AppShell>
  );
}

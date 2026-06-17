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
      <div className="px-4 pb-6 flex flex-col gap-4">
        {/* Status — white card */}
        <div className="card flex items-center gap-3">
          <span
            className={`w-11 h-11 rounded-[14px] grid place-items-center flex-none ${
              shot ? "bg-success-bg text-success" : "bg-danger-bg text-danger"
            }`}
          >
            <Icon name={shot ? "check" : "alert"} size={22} strokeWidth={2.2} />
          </span>
          <div className="flex-1 min-w-0">
            <div className="text-[15px] font-bold text-ink leading-tight">
              {shot ? "Đã chụp hôm nay" : "Chưa chụp hôm nay"}
            </div>
            <div className="text-[12.5px] text-ink-muted mt-0.5 truncate">
              {shot ? `${dept?.lastTime} · ${dept?.reporter}` : "Hãy chụp ảnh 5S cho phòng ban"}
            </div>
          </div>
          {shot && (
            <span className="text-[11.5px] font-semibold px-2.5 h-6 rounded-pill grid place-items-center bg-success-bg text-success flex-none">
              Hoàn thành
            </span>
          )}
        </div>

        {/* Compact CTA */}
        <Link
          href="/capture"
          className="flex items-center gap-3 bg-white rounded-[16px] border border-line p-3 shadow-e2 active:bg-surface-2"
        >
          <span className="w-11 h-11 rounded-[14px] grid place-items-center bg-primary-100 text-primary-600 flex-none">
            <Icon name="camera" size={21} />
          </span>
          <span className="flex-1 text-[15px] font-bold text-ink">{shot ? "Chụp thêm ảnh" : "Chụp ảnh 5S"}</span>
          <Icon name="chevronRight" size={20} className="text-ink-disabled flex-none" />
        </Link>

        {/* Ảnh hôm nay */}
        <section>
          <div className="text-[15px] font-bold text-ink mb-2">Ảnh hôm nay ({photos.length})</div>
          {photos.length === 0 ? (
            <div className="card-flat p-5 text-center text-ink-muted text-[13px]">Chưa có ảnh nào hôm nay.</div>
          ) : (
            <div className="grid grid-cols-3 gap-2">
              {photos.map((p) => (
                <MockPhoto key={p.id} className="aspect-square">
                  <span className="absolute left-1.5 bottom-1.5 text-[10px] font-semibold text-ink-muted bg-white/80 px-1.5 rounded-pill">
                    {p.time}
                  </span>
                </MockPhoto>
              ))}
            </div>
          )}
        </section>

        {/* 7 ngày — mini calendar strip */}
        <section>
          <div className="text-[15px] font-bold text-ink mb-2">7 ngày gần nhất</div>
          <div className="card-flat flex justify-between px-3 py-3">
            {week.map((d) => (
              <div key={d.date} className="flex flex-col items-center gap-1.5">
                <span
                  className={`w-7 h-7 rounded-pill grid place-items-center ${
                    d.ok ? "bg-success-bg text-success" : "bg-danger-bg text-danger"
                  }`}
                >
                  <Icon name={d.ok ? "check" : "x"} size={14} strokeWidth={2.5} />
                </span>
                <span className="text-[10px] text-ink-muted">{d.date.slice(0, 5)}</span>
              </div>
            ))}
          </div>
          <p className="text-[11.5px] text-ink-disabled mt-2 text-center">
            Chỉ hiển thị bằng chứng đã gửi — không đánh giá chất lượng.
          </p>
        </section>
      </div>
    </AppShell>
  );
}

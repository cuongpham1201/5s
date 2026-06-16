import Link from "next/link";
import { auth } from "@/auth";
import { AppShell } from "@/components/layout/AppShell";
import { Card, InfoRow } from "@/components/ui/Card";
import { InstallPrompt } from "@/components/pwa/InstallPrompt";
import { CURRENT_USER } from "@/lib/mock-data";

export default async function HomePage() {
  const session = await auth();
  const name = session?.user?.name ?? CURRENT_USER.name;
  const department = session?.user?.department ?? CURRENT_USER.department;
  // Phase 1A mock: today's status is "chưa gửi".
  const submittedToday = false;

  return (
    <AppShell>
      <div className="flex items-center gap-3 px-5 pt-2 pb-3">
        <span className="w-9 h-9 rounded-pill grid place-items-center text-white text-sm font-bold bg-gradient-to-br from-[#7aa6d6] to-[#4f7fb5]">
          {name.slice(0, 2).toUpperCase()}
        </span>
        <div className="flex-1">
          <div className="text-[18px] font-semibold">Xin chào, {name} 👋</div>
          <div className="text-[13px] text-ink-muted">Thứ Hai · 15/06/2026</div>
        </div>
        <Link
          href="/me"
          aria-label="Cài đặt"
          className="w-10 h-10 rounded-pill grid place-items-center text-xl bg-surface text-ink"
        >
          ⚙
        </Link>
      </div>

      <InstallPrompt />

      <div className="px-5 pb-6">
        {/* Status card */}
        <div
          className={`rounded-lg p-5 flex items-center gap-4 shadow-e4 text-white ${
            submittedToday
              ? "bg-gradient-to-br from-[#0E700E] to-[#0a5c0a]"
              : "bg-gradient-to-br from-[#BC4B09] to-[#9c3e07]"
          }`}
        >
          <span className="w-14 h-14 rounded-pill grid place-items-center text-3xl bg-white/20">
            {submittedToday ? "✓" : "⚠"}
          </span>
          <div>
            <div className="text-[20px] font-bold">
              {submittedToday ? "Đã gửi hôm nay" : "Chưa gửi hôm nay"}
            </div>
            <div className="text-[13px] opacity-90">
              {submittedToday ? "Cảm ơn bạn!" : "Hãy chụp ảnh 5S trước 18:00"}
            </div>
          </div>
        </div>

        <Card className="mt-4">
          <InfoRow label="Đơn vị" value={department} />
          <InfoRow label="Lần gửi gần nhất" value="15/06/2026 17:20" />
          <InfoRow label="Khu vực" value="Văn phòng" />
          <InfoRow label="Tuần này" value="3 / 5 ngày" />
        </Card>

        {/* Big CTA — largest element */}
        <Link
          href="/capture"
          className="block mt-6 w-full rounded-xl text-white text-center shadow-e8 bg-gradient-to-b from-[#1480d4] via-[#0F6CBD] to-[#115EA3]"
        >
          <span className="flex flex-col items-center justify-center gap-2.5 min-h-[188px]">
            <span className="text-[54px] leading-none">📷</span>
            <span className="text-[22px] font-bold tracking-wide">CHỤP ẢNH</span>
            <span className="text-[13px] opacity-90">Gửi ảnh 5S trong dưới 30 giây</span>
          </span>
        </Link>

        <div className="flex items-center justify-between mt-6 mb-2">
          <span className="text-[16px] font-semibold">Gần đây</span>
          <a className="text-[13px] font-semibold text-primary-600" href="/history">
            Xem tất cả
          </a>
        </div>
        <div className="grid grid-cols-4 gap-2">
          {[0, 1, 2, 3].map((i) => (
            <div
              key={i}
              className="aspect-square rounded-sm bg-gradient-to-br from-[#cdd7e0] to-[#8fa0b0]"
            />
          ))}
        </div>
      </div>
    </AppShell>
  );
}

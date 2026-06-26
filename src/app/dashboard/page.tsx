"use client";

import Link from "next/link";
import { useEffect, useState } from "react";
import { AppShell } from "@/components/layout/AppShell";
import { AppHeader } from "@/components/layout/AppHeader";
import { Icon } from "@/components/ui/Icon";
import type { MeResponse } from "@/lib/graph/graph-types";

interface WhoAmI { isAdmin: boolean }

const CARDS = [
  { href: "/capture", icon: "📷", title: "Chụp ảnh", desc: "Gửi ảnh 5S mới" },
  { href: "/history", icon: "📜", title: "Lịch sử", desc: "Các lần gửi của bạn" },
  { href: "/gallery", icon: "🖼", title: "Gallery", desc: "Ảnh 5S toàn công ty" },
  { href: "/overview", icon: "📊", title: "Dashboard hôm nay", desc: "Toàn cảnh nộp ảnh hôm nay" },
  { href: "/me", icon: "👤", title: "Hồ sơ", desc: "Thông tin tài khoản & phòng ban" },
];

export default function DashboardPage() {
  const [me, setMe] = useState<MeResponse | null>(null);
  const [isAdmin, setIsAdmin] = useState(false);
  const [loading, setLoading] = useState(true);

  useEffect(() => {
    // Post-login: sync the profile once (resolve-if-changed + LastLogin), then load.
    void fetch("/api/profile/sync", { method: "POST" }).catch(() => {});
    Promise.all([
      fetch("/api/me").then((r) => (r.ok ? r.json() : null)),
      fetch("/api/admin/whoami").then((r) => (r.ok ? r.json() : null)),
    ])
      .then(([m, w]) => { setMe(m); setIsAdmin(!!(w as WhoAmI)?.isAdmin); })
      .finally(() => setLoading(false));
  }, []);

  const cards = isAdmin
    ? [...CARDS, { href: "/admin", icon: "⚙️", title: "Quản trị", desc: "Quản trị hệ thống 5S" }]
    : CARDS;

  return (
    <AppShell>
      <AppHeader />
      <div className="px-4 pb-6 flex flex-col gap-4">
        <div className="card">
          <div className="text-[12px] text-ink-muted">Xin chào</div>
          <div className="text-[20px] font-bold leading-tight mt-0.5">{loading ? "…" : me?.displayName ?? me?.email ?? "Người dùng"}</div>
          <div className="text-[13px] text-ink-muted mt-1">
            {me?.departmentResolved ? `${me.departmentCode} · ${me.departmentName}` : (loading ? "" : "Chưa xác định phòng ban")}
          </div>
          {!loading && !me?.departmentResolved && (
            <div className="mt-2 text-[12.5px] bg-warning-bg text-warning rounded-md px-3 py-2">
              {me?.departmentWarning ?? "Chưa xác định phòng ban. Liên hệ quản trị."}
            </div>
          )}
        </div>

        <div className="grid grid-cols-2 gap-3">
          {cards.map((c) => (
            <Link key={c.href} href={c.href} className="bg-white rounded-[16px] border border-line p-4 shadow-e2 active:bg-surface-2 flex flex-col gap-1.5 min-h-[104px]">
              <span className="text-[26px] leading-none">{c.icon}</span>
              <span className="text-[15px] font-bold text-ink leading-tight">{c.title}</span>
              <span className="text-[12px] text-ink-muted leading-snug">{c.desc}</span>
            </Link>
          ))}
        </div>

        <Link href="/capture" className="flex items-center gap-3 bg-white rounded-[16px] border border-line p-3 shadow-e2 active:bg-surface-2">
          <span className="w-12 h-12 rounded-[14px] grid place-items-center bg-success-bg text-success flex-none">
            <Icon name="camera" size={22} />
          </span>
          <span className="flex-1 min-w-0">
            <span className="block text-[15px] font-bold text-ink leading-tight">Chụp ảnh 5S ngay</span>
            <span className="block text-[12.5px] text-ink-muted">Phòng ban của bạn · &lt;30 giây</span>
          </span>
          <Icon name="chevronRight" size={20} className="text-ink-disabled flex-none" />
        </Link>
      </div>
    </AppShell>
  );
}

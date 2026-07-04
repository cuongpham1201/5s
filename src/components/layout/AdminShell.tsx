"use client";

import Link from "next/link";
import { usePathname } from "next/navigation";
import { useEffect, useState, type ReactNode } from "react";
import { fetchMe, subscribeMe } from "@/lib/client/me-cache";
import { displayNameFrom, initialsFrom } from "@/lib/profile/display";
import type { MeResponse } from "@/lib/graph/graph-types";

const ROLE_LABEL: Record<string, string> = {
  admin: "Quản trị viên",
  environment: "Phụ trách môi trường",
  employee: "Nhân viên",
};

const NAV = [
  { section: "Tổng quan" },
  { href: "/admin", label: "Dashboard", icon: "📊" },
  { href: "/admin/pending", label: "Chưa gửi", icon: "⚠️" },
  { href: "/admin/calendar", label: "Lịch tổng hợp", icon: "🗓️" },
  { section: "Phân tích" },
  { href: "/admin/photo-stats", label: "Thống kê ảnh", icon: "📈" },
  { href: "/admin/ranking", label: "Xếp hạng", icon: "🏆" },
  { href: "/admin/gallery", label: "Thư viện ảnh", icon: "🖼️" },
  { section: "Cấu hình" },
  { href: "/admin/config/departments", label: "Phòng ban", icon: "🏢" },
  { href: "/admin/config/areas", label: "Khu vực", icon: "📍" },
  { href: "/admin/config/check-items", label: "Hạng mục 5S", icon: "✅" },
  { href: "/admin/config/role-mapping", label: "Phân quyền", icon: "🛡️" },
  { href: "/admin/user-profiles", label: "Hồ sơ người dùng", icon: "👤" },
  { href: "/admin/local-users", label: "Tài khoản nội bộ", icon: "🔑" },
  { href: "/admin/queue", label: "Hàng đợi đồng bộ", icon: "🔄" },
  { href: "/admin/sharepoint-health", label: "SharePoint Health", icon: "🩺" },
] as const;

export function AdminShell({
  title,
  subtitle,
  actions,
  children,
}: {
  title: string;
  subtitle?: string;
  actions?: ReactNode;
  children: ReactNode;
}) {
  const pathname = usePathname();
  const [open, setOpen] = useState(false);
  const [me, setMe] = useState<MeResponse | null>(null);

  useEffect(() => {
    let active = true;
    fetchMe().then((m) => active && setMe(m));
    const unsub = subscribeMe((m) => active && setMe(m));
    return () => { active = false; unsub(); };
  }, []);

  const name = me ? displayNameFrom({ displayName: me.displayName, email: me.email }) : "…";
  const initials = me ? initialsFrom(me.displayName, me.email) : "…";
  const roleLabel = me?.role ? ROLE_LABEL[me.role] ?? me.role : "—";

  return (
    <div className="min-h-screen md:grid md:grid-cols-[248px_1fr] bg-surface-app">
      {open && (
        <div
          className="fixed inset-0 z-[70] bg-black/40 md:hidden"
          onClick={() => setOpen(false)}
          aria-hidden
        />
      )}
      <aside
        className={`bg-white border-r border-line flex flex-col p-[18px_14px] md:sticky md:top-0 md:h-screen fixed top-0 bottom-0 left-0 w-[248px] z-[80] transition-transform ${
          open ? "translate-x-0" : "-translate-x-full md:translate-x-0"
        }`}
      >
        <Link href="/dashboard" onClick={() => setOpen(false)} className="flex items-center gap-2.5 px-2 pt-1.5 pb-[18px]" aria-label="Về Dashboard">
          <div className="w-9 h-9 rounded-[10px] grid place-items-center text-white font-extrabold text-[15px] bg-gradient-to-br from-[#1480d4] to-[#115EA3]">
            5S
          </div>
          <div>
            <div className="font-bold text-[16px]">5S Daily</div>
            <div className="text-[11px] text-ink-muted">← Về Dashboard</div>
          </div>
        </Link>
        {NAV.map((n, i) =>
          "section" in n ? (
            <div key={i} className="text-[11px] font-bold text-ink-muted uppercase tracking-wide px-3 pt-3.5 pb-1.5">
              {n.section}
            </div>
          ) : (
            <Link
              key={n.href}
              href={n.href}
              onClick={() => setOpen(false)}
              className={`nav-item ${pathname === n.href ? "is-active" : ""}`}
            >
              <span className="text-[18px] w-[22px] text-center">{n.icon}</span>
              {n.label}
            </Link>
          ),
        )}
        <Link href="/me" className="mt-auto flex items-center gap-2.5 p-2.5 rounded-md bg-surface">
          <span className="w-7 h-7 rounded-pill grid place-items-center text-white text-xs font-bold bg-gradient-to-br from-[#7aa6d6] to-[#4f7fb5]">
            {initials}
          </span>
          <span className="flex-1 min-w-0">
            <span className="block text-[13px] font-semibold leading-tight truncate">{name}</span>
            <span className="block text-[13px] text-ink-muted leading-tight truncate">{roleLabel}</span>
          </span>
        </Link>
      </aside>

      <div className="flex flex-col min-w-0">
        <header className="flex items-center gap-4 px-4 md:px-7 py-4 bg-white border-b border-line sticky top-0 z-20">
          <button
            className="md:hidden w-10 h-10 rounded-sm grid place-items-center bg-surface text-lg"
            onClick={() => setOpen((v) => !v)}
            aria-label="Mở menu"
          >
            ☰
          </button>
          <div className="flex-1 min-w-0">
            <div className="text-[18px] font-semibold">{title}</div>
            {subtitle && <div className="text-[13px] text-ink-muted">{subtitle}</div>}
          </div>
          {actions}
        </header>
        <div className="p-4 md:p-7 pb-12">{children}</div>
      </div>
    </div>
  );
}

"use client";

import Link from "next/link";
import { usePathname } from "next/navigation";
import { useEffect, useState } from "react";
import { Icon, type IconName } from "@/components/ui/Icon";
import { fetchMe } from "@/lib/client/me-cache";
import type { MeResponse } from "@/lib/graph/graph-types";

const NAV: { href: string; label: string; icon: IconName }[] = [
  { href: "/dashboard", label: "Trang chủ", icon: "home" },
  { href: "/capture", label: "Chụp ảnh", icon: "camera" },
  { href: "/overview", label: "Toàn cảnh", icon: "chart" },
  { href: "/gallery", label: "Thư viện", icon: "image" },
  { href: "/history", label: "Lịch sử", icon: "clock" },
  { href: "/me", label: "Hồ sơ", icon: "user" },
];

/** Desktop-only sidebar (≥1024px). Collapsible. Mobile uses BottomNav instead. */
export function AppSidebar() {
  const pathname = usePathname();
  const [collapsed, setCollapsed] = useState(false);
  const [me, setMe] = useState<MeResponse | null>(null);
  const [isAdmin, setIsAdmin] = useState(false);

  useEffect(() => {
    fetchMe().then(setMe);
    fetch("/api/admin/whoami").then((r) => (r.ok ? r.json() : null)).then((w) => setIsAdmin(!!w?.isAdmin)).catch(() => {});
    try { setCollapsed(localStorage.getItem("5s.sidebar.collapsed") === "1"); } catch {}
  }, []);

  const toggle = () => setCollapsed((c) => { try { localStorage.setItem("5s.sidebar.collapsed", c ? "0" : "1"); } catch {} return !c; });

  const items = isAdmin ? [...NAV, { href: "/admin", label: "Quản trị", icon: "building" as IconName }] : NAV;
  const active = (href: string) => pathname === href || pathname.startsWith(href + "/");
  const initials = (me?.displayName ?? "?").trim().split(/\s+/).map((p) => p[0]).slice(-2).join("").toUpperCase() || "?";

  return (
    <aside className={`app-sidebar ${collapsed ? "is-collapsed" : ""}`}>
      <Link href="/dashboard" className="sidebar-brand" aria-label="5S Daily — Trang chủ">
        <span className="sidebar-logo">5S</span>
        {!collapsed && <span className="sidebar-brand-text"><b>5S Daily</b><i>Bia Hạ Long</i></span>}
      </Link>

      <nav className="sidebar-nav">
        {items.map((n) => (
          <Link key={n.href} href={n.href} className={`sidebar-item ${active(n.href) ? "is-active" : ""}`} title={n.label}>
            <Icon name={n.icon} size={20} strokeWidth={active(n.href) ? 2.2 : 1.8} />
            {!collapsed && <span>{n.label}</span>}
          </Link>
        ))}
      </nav>

      <div className="sidebar-foot">
        <Link href="/me" className="sidebar-profile" title={me?.displayName ?? "Hồ sơ"}>
          <span className="sidebar-avatar">{initials}</span>
          {!collapsed && (
            <span className="min-w-0">
              <span className="block text-[13px] font-semibold truncate">{me?.displayName ?? "…"}</span>
              <span className="block text-[11px] text-ink-muted truncate">{me?.departmentResolved ? me.departmentCode : "—"}</span>
            </span>
          )}
        </Link>
        <button onClick={toggle} className="sidebar-collapse" aria-label={collapsed ? "Mở rộng" : "Thu gọn"}>
          {collapsed ? "»" : "«"}
        </button>
      </div>
    </aside>
  );
}

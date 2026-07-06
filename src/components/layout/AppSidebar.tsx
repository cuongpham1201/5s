"use client";

import Link from "next/link";
import { usePathname } from "next/navigation";
import { signOut } from "next-auth/react";
import { useEffect, useState } from "react";
import { Icon, type IconName } from "@/components/ui/Icon";
import { fetchMe, subscribeMe } from "@/lib/client/me-cache";
import { displayNameFrom, initialsFrom } from "@/lib/profile/display";
import type { MeResponse } from "@/lib/graph/graph-types";

const NAV: { href: string; label: string; icon: IconName }[] = [
  { href: "/dashboard", label: "Trang chủ", icon: "home" },
  { href: "/capture", label: "Thực hành 5S", icon: "camera" },
  { href: "/3s", label: "Audit 5S", icon: "check" },
  { href: "/capa", label: "Khắc phục", icon: "alert" },
  { href: "/overview", label: "Toàn cảnh", icon: "chart" },
  { href: "/gallery", label: "Thư viện", icon: "image" },
  { href: "/history", label: "Lịch sử", icon: "clock" },
  { href: "/me", label: "Hồ sơ", icon: "user" },
];

const ROLE_LABEL: Record<string, string> = { admin: "Quản trị", environment: "Môi trường", employee: "Nhân viên" };

export function AppSidebar() {
  const pathname = usePathname();
  const [collapsed, setCollapsed] = useState(false);
  const [me, setMe] = useState<MeResponse | null>(null);
  const [isAdmin, setIsAdmin] = useState(false);
  const [menuOpen, setMenuOpen] = useState(false);
  const [refreshing, setRefreshing] = useState(false);

  useEffect(() => {
    fetchMe().then(setMe);
    const unsub = subscribeMe(setMe); // refresh when dashboard busts the cache post-sync
    fetch("/api/admin/whoami").then((r) => (r.ok ? r.json() : null)).then((w) => setIsAdmin(!!w?.isAdmin)).catch(() => {});
    try { setCollapsed(localStorage.getItem("5s.sidebar.collapsed") === "1"); } catch {}
    return () => unsub();
  }, []);

  const toggle = () => setCollapsed((c) => { try { localStorage.setItem("5s.sidebar.collapsed", c ? "0" : "1"); } catch {} return !c; });
  const refresh = async () => {
    setRefreshing(true);
    try { await fetch("/api/profile/sync", { method: "POST" }); setMe(await fetchMe(true)); } finally { setRefreshing(false); setMenuOpen(false); }
  };

  const items = isAdmin ? [...NAV, { href: "/admin", label: "Quản trị", icon: "building" as IconName }] : NAV;
  const active = (href: string) => pathname === href || pathname.startsWith(href + "/");
  const name = me ? displayNameFrom({ displayName: me.displayName, email: me.email }) : "…";
  const initials = me ? initialsFrom(me.displayName, me.email) : "…";
  const role = me?.role ? ROLE_LABEL[me.role] ?? me.role : null;

  return (
    <aside className={`app-sidebar ${collapsed ? "is-collapsed" : ""}`}>
      {/* Header */}
      <div className="sidebar-head">
        <Link href="/dashboard" className="sidebar-brand" aria-label="5S Daily — Trang chủ">
          <span className="sidebar-logo">5S</span>
          {!collapsed && <span className="sidebar-brand-text"><b>5S Daily</b><i>Bia Hạ Long</i></span>}
        </Link>
        <button onClick={toggle} className="sidebar-collapse" aria-label={collapsed ? "Mở rộng" : "Thu gọn"}>{collapsed ? "»" : "«"}</button>
      </div>

      {/* Navigation */}
      <nav className="sidebar-nav">
        {items.map((n) => (
          <Link key={n.href} href={n.href} className={`sidebar-item ${active(n.href) ? "is-active" : ""}`} title={n.label}>
            <Icon name={n.icon} size={20} strokeWidth={active(n.href) ? 2.2 : 1.8} />
            {!collapsed && <span>{n.label}</span>}
          </Link>
        ))}
      </nav>

      {/* Footer user */}
      <div className="sidebar-foot relative">
        {menuOpen && (
          <div className="sidebar-menu">
            <Link href="/me" onClick={() => setMenuOpen(false)} className="sidebar-menu-item"><Icon name="user" size={16} /> Hồ sơ</Link>
            <button onClick={refresh} disabled={refreshing} className="sidebar-menu-item"><Icon name="refresh" size={16} /> {refreshing ? "Đang làm mới…" : "Làm mới hồ sơ"}</button>
            <button onClick={() => signOut({ callbackUrl: "/signin" })} className="sidebar-menu-item text-danger"><Icon name="x" size={16} /> Đăng xuất</button>
          </div>
        )}
        <button onClick={() => setMenuOpen((o) => !o)} className="sidebar-user" aria-label="Tài khoản">
          <span className="sidebar-avatar relative">{initials}<span className="sidebar-online" /></span>
          {!collapsed && (
            <span className="min-w-0 flex-1 text-left">
              <span className="block text-[13px] font-semibold truncate">{name}</span>
              <span className="block text-[11px] text-ink-muted truncate">
                {me?.departmentResolved ? me.departmentCode : "—"}{role ? ` · ${role}` : ""}
              </span>
            </span>
          )}
          {!collapsed && <Icon name="chevronRight" size={16} className="text-ink-disabled rotate-[-90deg]" />}
        </button>
      </div>
    </aside>
  );
}

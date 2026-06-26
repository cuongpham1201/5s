"use client";

import Link from "next/link";
import { usePathname } from "next/navigation";
import { Icon, type IconName } from "@/components/ui/Icon";

const ITEMS: { href: string; label: string; icon: IconName }[] = [
  { href: "/dashboard", label: "Trang chủ", icon: "home" },
  { href: "/capture", label: "Chụp ảnh", icon: "camera" },
  { href: "/gallery", label: "Gallery", icon: "image" },
  { href: "/history", label: "Lịch sử", icon: "clock" },
  { href: "/me", label: "Hồ sơ", icon: "user" },
];

export function BottomNav() {
  const pathname = usePathname();
  return (
    <nav className="bottom-nav">
      {ITEMS.map((it) => {
        const active = pathname === it.href || pathname.startsWith(it.href + "/");
        return (
          <Link
            key={it.href}
            href={it.href}
            className="flex-1 flex flex-col items-center gap-0.5 py-1"
          >
            <span
              className={`flex items-center justify-center h-6 px-3.5 rounded-pill transition-colors ${
                active ? "bg-primary-100 text-primary-600" : "text-ink-muted"
              }`}
            >
              <Icon name={it.icon} size={22} strokeWidth={active ? 2.1 : 1.7} />
            </span>
            <span className={`text-[11px] font-medium ${active ? "text-primary-600" : "text-ink-muted"}`}>
              {it.label}
            </span>
          </Link>
        );
      })}
    </nav>
  );
}

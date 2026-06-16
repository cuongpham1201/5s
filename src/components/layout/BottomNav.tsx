"use client";

import Link from "next/link";
import { usePathname } from "next/navigation";

const ITEMS = [
  { href: "/", label: "Trang chủ", icon: "🏠" },
  { href: "/history", label: "Lịch sử", icon: "🕘" },
  { href: "/me", label: "Hồ sơ", icon: "👤" },
];

export function BottomNav() {
  const pathname = usePathname();
  return (
    <nav className="bottom-nav">
      {ITEMS.map((it) => {
        const active = pathname === it.href;
        return (
          <Link
            key={it.href}
            href={it.href}
            className={`flex-1 flex flex-col items-center gap-0.5 py-1.5 text-[11px] font-semibold ${
              active ? "text-primary-600" : "text-ink-muted"
            }`}
          >
            <span className="text-[22px] leading-none">{it.icon}</span>
            {it.label}
          </Link>
        );
      })}
    </nav>
  );
}

"use client";

import Link from "next/link";
import { usePathname } from "next/navigation";

const ITEMS = [
  { href: "/", label: "Trang chủ", icon: "🏠" },
  { href: "/my-unit", label: "Phòng ban", icon: "🏢" },
  { href: "/overview", label: "Toàn cảnh", icon: "📊" },
  { href: "/history", label: "Lịch sử", icon: "🕘" },
];

export function BottomNav() {
  const pathname = usePathname();
  return (
    <nav className="bottom-nav">
      {ITEMS.map((it) => {
        const active = it.href === "/" ? pathname === "/" : pathname.startsWith(it.href);
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

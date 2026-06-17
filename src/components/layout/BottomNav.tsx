"use client";

import Link from "next/link";
import { usePathname } from "next/navigation";
import { Icon, type IconName } from "@/components/ui/Icon";

const ITEMS: { href: string; label: string; icon: IconName }[] = [
  { href: "/", label: "Trang chủ", icon: "home" },
  { href: "/my-unit", label: "Phòng ban", icon: "building" },
  { href: "/overview", label: "Toàn cảnh", icon: "chart" },
  { href: "/history", label: "Lịch sử", icon: "clock" },
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
            className="flex-1 flex flex-col items-center gap-1 py-1.5"
          >
            <span
              className={`flex items-center justify-center h-7 px-4 rounded-pill transition-colors ${
                active ? "bg-primary-100 text-primary-600" : "text-ink-muted"
              }`}
            >
              <Icon name={it.icon} size={21} strokeWidth={active ? 2.1 : 1.8} />
            </span>
            <span className={`text-[11px] font-semibold ${active ? "text-primary-600" : "text-ink-muted"}`}>
              {it.label}
            </span>
          </Link>
        );
      })}
    </nav>
  );
}

"use client";

import Link from "next/link";
import { useSession } from "next-auth/react";
import { CURRENT_USER } from "@/lib/mock-data";

/** Lightweight app header — greeting + department + avatar (no profile tab). */
export function AppHeader({ title, subtitle }: { title?: string; subtitle?: string }) {
  const { data } = useSession();
  const name = data?.user?.name ?? CURRENT_USER.name;
  const dept = data?.user?.department ?? CURRENT_USER.department;
  const initials = name.trim().split(/\s+/).map((p) => p[0]).slice(-2).join("").toUpperCase();

  return (
    <div className="flex items-center gap-3 px-5 pt-3 pb-3">
      <div className="flex-1 min-w-0">
        {title ? (
          <div className="text-[20px] font-semibold leading-tight">{title}</div>
        ) : (
          <div className="text-[18px] font-semibold leading-tight">Xin chào, {name} 👋</div>
        )}
        <div className="text-[13px] text-ink-muted">{subtitle ?? `Phòng ban: ${dept}`}</div>
      </div>
      <Link
        href="/me"
        aria-label="Tài khoản"
        className="w-9 h-9 rounded-pill grid place-items-center text-white text-sm font-bold bg-gradient-to-br from-[#7aa6d6] to-[#4f7fb5]"
      >
        {initials || "?"}
      </Link>
    </div>
  );
}

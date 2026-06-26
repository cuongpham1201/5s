"use client";

import Link from "next/link";
import { useEffect, useState } from "react";
import { Icon } from "@/components/ui/Icon";
import type { MeResponse } from "@/lib/graph/graph-types";

/** Compact app header — avatar + greeting + resolved department (from /api/me). */
export function AppHeader({
  title,
  subtitle,
  showBell = false,
  showHome = false,
}: {
  title?: string;
  subtitle?: string;
  showBell?: boolean;
  showHome?: boolean;
}) {
  const [me, setMe] = useState<MeResponse | null>(null);

  useEffect(() => {
    let active = true;
    fetch("/api/me")
      .then((r) => (r.ok ? r.json() : null))
      .then((d) => active && setMe(d))
      .catch(() => {});
    return () => {
      active = false;
    };
  }, []);

  const name = me?.displayName ?? "…";
  const deptLine = me
    ? me.departmentResolved
      ? `${me.departmentCode} · ${me.departmentName}`
      : "Phòng ban: chưa xác định"
    : "…";
  const initials = (name === "…" ? "?" : name).trim().split(/\s+/).map((p) => p[0]).slice(-2).join("").toUpperCase() || "?";

  return (
    <div className="flex items-center gap-3 px-4 pt-3 pb-2.5">
      <Link
        href="/me"
        aria-label="Tài khoản"
        className="w-11 h-11 rounded-pill grid place-items-center text-white text-[15px] font-bold flex-none bg-primary-600"
      >
        {initials}
      </Link>
      <div className="flex-1 min-w-0">
        <div className="text-[17px] font-bold leading-tight truncate text-ink">{title ?? `Xin chào, ${name}`}</div>
        <div className="text-[13px] text-ink-muted leading-tight truncate">{subtitle ?? deptLine}</div>
      </div>
      {showHome && (
        <Link href="/dashboard" aria-label="Về Dashboard" className="h-9 px-3 rounded-pill grid place-items-center text-[13px] font-semibold text-primary-600 border border-line flex-none">
          ← Dashboard
        </Link>
      )}
      {showBell && (
        <button aria-label="Thông báo" className="w-10 h-10 rounded-pill grid place-items-center text-ink-muted border border-line flex-none">
          <Icon name="bell" size={19} />
        </button>
      )}
    </div>
  );
}

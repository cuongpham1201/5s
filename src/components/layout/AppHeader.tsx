"use client";

import Link from "next/link";
import { useSession } from "next-auth/react";
import { CURRENT_USER, DEPARTMENTS } from "@/lib/mock-data";
import { departmentName } from "@/lib/department-mapping";
import { Icon } from "@/components/ui/Icon";

/** Compact app header — avatar + greeting + department, optional bell. */
export function AppHeader({
  title,
  subtitle,
  showBell = false,
}: {
  title?: string;
  subtitle?: string;
  showBell?: boolean;
}) {
  const { data } = useSession();
  const name = data?.user?.name ?? CURRENT_USER.name;
  const dept = data?.user?.department ?? CURRENT_USER.department;
  const deptName = departmentName(dept) ?? DEPARTMENTS.find((d) => d.code === dept)?.name ?? "";
  const initials = name.trim().split(/\s+/).map((p) => p[0]).slice(-2).join("").toUpperCase();

  return (
    <div className="flex items-center gap-3 px-4 pt-3 pb-2.5">
      <Link
        href="/me"
        aria-label="Tài khoản"
        className="w-11 h-11 rounded-pill grid place-items-center text-white text-[15px] font-bold flex-none bg-primary-600"
      >
        {initials || "?"}
      </Link>
      <div className="flex-1 min-w-0">
        <div className="text-[17px] font-bold leading-tight truncate text-ink">
          {title ?? `Xin chào, ${name}`}
        </div>
        <div className="text-[13px] text-ink-muted leading-tight truncate">
          {subtitle ?? `${dept} · ${deptName}`}
        </div>
      </div>
      {showBell && (
        <button
          aria-label="Thông báo"
          className="w-10 h-10 rounded-pill grid place-items-center text-ink-muted border border-line flex-none"
        >
          <Icon name="bell" size={19} />
        </button>
      )}
    </div>
  );
}

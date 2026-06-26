"use client";

import Link from "next/link";
import { signOut } from "next-auth/react";
import { useEffect, useState } from "react";
import { AppShell } from "@/components/layout/AppShell";
import { Card, InfoRow } from "@/components/ui/Card";
import { StatusBadge } from "@/components/ui/StatusBadge";
import type { MeResponse } from "@/lib/graph/graph-types";

function initials(name?: string | null): string {
  if (!name) return "?";
  const parts = name.trim().split(/\s+/);
  return ((parts[0]?.[0] ?? "") + (parts[parts.length - 1]?.[0] ?? "")).toUpperCase() || "?";
}

export default function MePage() {
  const [profile, setProfile] = useState<MeResponse | null>(null);
  const [loading, setLoading] = useState(true);

  useEffect(() => {
    let active = true;
    fetch("/api/me")
      .then((r) => (r.ok ? r.json() : null))
      .then((data) => active && setProfile(data))
      .finally(() => active && setLoading(false));
    return () => {
      active = false;
    };
  }, []);

  const dept5s = profile?.departmentResolved
    ? `${profile.departmentCode}${profile.departmentName ? " · " + profile.departmentName : ""}`
    : "Chưa xác định";

  return (
    <AppShell>
      <div className="px-5 pt-2 pb-3 flex items-center justify-between">
        <span className="flex items-center gap-2.5">
          <Link href="/dashboard" aria-label="Về Dashboard" className="w-9 h-9 rounded-pill grid place-items-center text-lg bg-surface">←</Link>
          <span className="text-[22px] font-semibold">Hồ sơ</span>
        </span>
        {profile && (
          <StatusBadge tone={profile.source === "microsoft-entra-id" ? "success" : "neutral"}>
            {profile.source === "microsoft-entra-id" ? "Microsoft 365" : "Dev mock"}
          </StatusBadge>
        )}
      </div>

      <div className="px-5 pb-6 flex flex-col items-center">
        <span className="w-20 h-20 rounded-pill grid place-items-center text-white text-2xl font-bold bg-gradient-to-br from-[#7aa6d6] to-[#4f7fb5]">
          {loading ? "…" : initials(profile?.displayName)}
        </span>
        <div className="text-[18px] font-semibold mt-3">
          {loading ? "Đang tải hồ sơ…" : profile?.displayName ?? "Người dùng"}
        </div>
        {!loading && profile?.jobTitle && <div className="text-[13px] text-ink-muted">{profile.jobTitle}</div>}

        {profile && !profile.departmentResolved && (
          <div className="w-full mt-4 flex items-start gap-2.5 rounded-md bg-warning-bg text-warning p-3.5">
            <span className="text-lg">⚠</span>
            <span className="text-[13px] font-medium">
              {profile.departmentWarning ?? "Phòng ban chưa xác định. Vui lòng liên hệ quản trị."}
            </span>
          </div>
        )}

        <Card className="w-full mt-5">
          <InfoRow label="Tên hiển thị" value={profile?.displayName ?? "—"} />
          <InfoRow label="Email" value={profile?.email ?? "—"} />
          <InfoRow label="Phòng ban (M365)" value={profile?.departmentRaw ?? "—"} />
          <InfoRow label="Phòng ban (5S)" value={loading ? "…" : dept5s} />
          <InfoRow label="DepartmentCode" value={profile?.departmentCode ?? "—"} />
          <InfoRow label="Chức danh" value={profile?.jobTitle ?? "—"} />
          <InfoRow label="Vị trí văn phòng" value={profile?.officeLocation ?? "—"} />
          {profile?.employeeId && <InfoRow label="Mã nhân viên" value={profile.employeeId} />}
        </Card>

        <button className="btn btn-secondary btn-block mt-6" onClick={() => signOut({ callbackUrl: "/signin" })}>
          Đăng xuất
        </button>
        <p className="text-[12px] text-ink-disabled mt-4 text-center">
          {profile?.source === "microsoft-entra-id"
            ? "Hồ sơ lấy từ Microsoft 365. Phòng ban 5S khớp từ danh mục Config_Departments."
            : "Đăng nhập thử (dev). Khi đăng nhập M365 thật, hồ sơ + phòng ban lấy từ Microsoft 365."}
        </p>
      </div>
    </AppShell>
  );
}

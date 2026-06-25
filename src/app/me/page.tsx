"use client";

import { signOut } from "next-auth/react";
import { useEffect, useState } from "react";
import { AppShell } from "@/components/layout/AppShell";
import { Card, InfoRow } from "@/components/ui/Card";
import { StatusBadge } from "@/components/ui/StatusBadge";
import { departmentName } from "@/lib/department-mapping";
import type { MeProfile } from "@/lib/graph/graph-types";

function initials(name?: string | null): string {
  if (!name) return "?";
  const parts = name.trim().split(/\s+/);
  const last = parts[parts.length - 1]?.[0] ?? "";
  const first = parts[0]?.[0] ?? "";
  return (first + last).toUpperCase() || "?";
}

export default function MePage() {
  const [profile, setProfile] = useState<MeProfile | null>(null);
  const [loading, setLoading] = useState(true);

  useEffect(() => {
    let active = true;
    fetch("/api/me")
      .then((r) => (r.ok ? r.json() : null))
      .then((data) => {
        if (active) setProfile(data);
      })
      .finally(() => active && setLoading(false));
    return () => {
      active = false;
    };
  }, []);

  const deptCode = profile?.department ?? null;
  const deptLabel = deptCode
    ? `${deptCode}${departmentName(deptCode) ? " · " + departmentName(deptCode) : ""}`
    : "Chưa xác định";

  return (
    <AppShell>
      <div className="px-5 pt-2 pb-3 flex items-center justify-between">
        <span className="text-[22px] font-semibold">Hồ sơ</span>
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
        {!loading && profile?.jobTitle && (
          <div className="text-[13px] text-ink-muted">{profile.jobTitle}</div>
        )}

        <Card className="w-full mt-5">
          <InfoRow label="Tên hiển thị" value={profile?.displayName ?? "—"} />
          <InfoRow label="Email" value={profile?.email ?? "—"} />
          <InfoRow label="Phòng ban (5S)" value={loading ? "…" : deptLabel} />
          <InfoRow label="Chức danh" value={profile?.jobTitle ?? "—"} />
          <InfoRow label="Vị trí văn phòng" value={profile?.officeLocation ?? "—"} />
          <InfoRow label="Mã nhân viên" value={profile?.employeeId ?? "—"} />
        </Card>

        <button className="btn btn-secondary btn-block mt-6" onClick={() => signOut({ callbackUrl: "/signin" })}>
          Đăng xuất
        </button>
        <p className="text-[12px] text-ink-disabled mt-4 text-center">
          {profile?.source === "microsoft-entra-id"
            ? "Dữ liệu lấy trực tiếp từ Microsoft 365 (Graph /me)."
            : "Đang dùng đăng nhập thử (dev). Khi cấu hình Entra App thật, hồ sơ sẽ tự lấy từ Microsoft 365."}
        </p>
      </div>
    </AppShell>
  );
}

"use client";

import { signOut, useSession } from "next-auth/react";
import { AppShell } from "@/components/layout/AppShell";
import { Card, InfoRow } from "@/components/ui/Card";

export default function MePage() {
  const { data: session, status } = useSession();
  const user = session?.user;

  return (
    <AppShell>
      <div className="px-5 pt-2 pb-3 text-[22px] font-semibold">Hồ sơ</div>

      <div className="px-5 pb-6 flex flex-col items-center">
        <span className="w-20 h-20 rounded-pill grid place-items-center text-white text-2xl font-bold bg-gradient-to-br from-[#7aa6d6] to-[#4f7fb5]">
          {(user?.name ?? "?").slice(0, 2).toUpperCase()}
        </span>
        <div className="text-[18px] font-semibold mt-3">
          {status === "loading" ? "Đang tải…" : user?.name ?? "Khách"}
        </div>

        <Card className="w-full mt-5">
          <InfoRow label="Tên hiển thị" value={user?.name ?? "—"} />
          <InfoRow label="Email" value={user?.email ?? "—"} />
          <InfoRow label="Phòng ban" value={user?.department ?? "—"} />
          <InfoRow label="Vai trò" value={user?.role ?? "—"} />
        </Card>

        <button className="btn btn-secondary btn-block mt-6" onClick={() => signOut({ callbackUrl: "/signin" })}>
          Đăng xuất
        </button>
        <p className="text-[12px] text-ink-disabled mt-4 text-center">
          Danh tính lấy từ phiên đăng nhập (Auth.js). Phase 1B sẽ đồng bộ phòng ban thật từ M365.
        </p>
      </div>
    </AppShell>
  );
}

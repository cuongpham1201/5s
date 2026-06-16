"use client";

import { useState } from "react";
import { AppShell } from "@/components/layout/AppShell";
import { StatusBadge } from "@/components/ui/StatusBadge";

const TABS = ["Hôm nay", "Tuần", "Tháng"] as const;

export default function HistoryPage() {
  const [tab, setTab] = useState<(typeof TABS)[number]>("Hôm nay");

  return (
    <AppShell>
      <div className="px-5 pt-2 pb-3">
        <div className="text-[22px] font-semibold">Lịch sử của tôi</div>
        <div className="text-[13px] text-ink-muted">PMKT · Nguyễn Văn A</div>
      </div>

      <div className="px-5 pb-6">
        <div className="segmented">
          {TABS.map((t) => (
            <button key={t} className={tab === t ? "is-active" : ""} onClick={() => setTab(t)}>
              {t}
            </button>
          ))}
        </div>

        {/* 15/06 */}
        <div className="mt-[18px]">
          <div className="flex items-center justify-between mb-2.5">
            <div className="flex items-center gap-2">
              <span className="text-[16px] font-semibold">15/06/2026</span>
              <span className="text-[13px] text-ink-muted">Thứ Hai</span>
            </div>
            <StatusBadge tone="success">2 ảnh</StatusBadge>
          </div>
          <div className="grid grid-cols-4 gap-2">
            <div className="aspect-square rounded-sm bg-gradient-to-br from-[#cdd7e0] to-[#8fa0b0]" />
            <div className="aspect-square rounded-sm bg-gradient-to-br from-[#cdd7e0] to-[#8fa0b0]" />
          </div>
        </div>

        {/* 14/06 */}
        <div className="mt-[18px]">
          <div className="flex items-center justify-between mb-2.5">
            <div className="flex items-center gap-2">
              <span className="text-[16px] font-semibold">14/06/2026</span>
              <span className="text-[13px] text-ink-muted">Chủ Nhật</span>
            </div>
            <StatusBadge tone="success">1 ảnh</StatusBadge>
          </div>
          <div className="grid grid-cols-4 gap-2">
            <div className="aspect-square rounded-sm bg-gradient-to-br from-[#cdd7e0] to-[#8fa0b0]" />
          </div>
        </div>

        {/* 13/06 missing */}
        <div className="mt-[18px]">
          <div className="flex items-center justify-between mb-2.5">
            <div className="flex items-center gap-2">
              <span className="text-[16px] font-semibold">13/06/2026</span>
              <span className="text-[13px] text-ink-muted">Thứ Bảy</span>
            </div>
            <StatusBadge tone="danger">Không gửi</StatusBadge>
          </div>
          <div className="rounded-sm bg-danger-bg text-danger text-[14px] font-semibold grid place-items-center p-3.5">
            ⚠ Bạn chưa gửi ảnh cho ngày này
          </div>
        </div>
      </div>
    </AppShell>
  );
}

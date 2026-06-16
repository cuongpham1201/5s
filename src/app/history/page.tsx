"use client";

import { useState } from "react";
import { AppShell } from "@/components/layout/AppShell";
import { StatusBadge } from "@/components/ui/StatusBadge";

const TABS = ["Hôm nay", "Tuần", "Tháng"] as const;

// Mock submissions grouped by day (1 submission = N photos).
interface MockSubmission {
  time: string;
  area: string;
  photos: number;
  hue: number;
}
interface MockDay {
  date: string;
  weekday: string;
  submissions: MockSubmission[];
}

const DAYS: MockDay[] = [
  {
    date: "15/06/2026",
    weekday: "Thứ Hai",
    submissions: [
      { time: "17:20", area: "Văn phòng", photos: 3, hue: 210 },
      { time: "09:05", area: "Kho POSM", photos: 2, hue: 150 },
    ],
  },
  {
    date: "14/06/2026",
    weekday: "Chủ Nhật",
    submissions: [{ time: "16:40", area: "Phòng họp", photos: 1, hue: 280 }],
  },
  { date: "13/06/2026", weekday: "Thứ Bảy", submissions: [] },
];

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

        {DAYS.map((day) => {
          const totalPhotos = day.submissions.reduce((s, x) => s + x.photos, 0);
          return (
            <div key={day.date} className="mt-[18px]">
              <div className="flex items-center justify-between mb-2.5">
                <div className="flex items-center gap-2">
                  <span className="text-[16px] font-semibold">{day.date}</span>
                  <span className="text-[13px] text-ink-muted">{day.weekday}</span>
                </div>
                {day.submissions.length > 0 ? (
                  <StatusBadge tone="success">
                    {day.submissions.length} lần · {totalPhotos} ảnh
                  </StatusBadge>
                ) : (
                  <StatusBadge tone="danger">Không gửi</StatusBadge>
                )}
              </div>

              {day.submissions.length === 0 ? (
                <div className="rounded-sm bg-danger-bg text-danger text-[14px] font-semibold grid place-items-center p-3.5">
                  ⚠ Bạn chưa gửi ảnh cho ngày này
                </div>
              ) : (
                <div className="flex flex-col gap-2.5">
                  {day.submissions.map((sub, i) => (
                    <div key={i} className="card-flat p-3 flex items-center gap-3">
                      {/* thumbnails (up to 3) */}
                      <div className="flex -space-x-2">
                        {Array.from({ length: Math.min(sub.photos, 3) }).map((_, k) => (
                          <span
                            key={k}
                            className="w-10 h-10 rounded-md border-2 border-white"
                            style={{ background: `linear-gradient(135deg, hsl(${sub.hue + k * 15} 32% 74%), hsl(${sub.hue + k * 15} 28% 52%))` }}
                          />
                        ))}
                      </div>
                      <div className="flex-1 min-w-0">
                        <div className="font-semibold text-[15px]">{sub.area}</div>
                        <div className="text-[13px] text-ink-muted">Lúc {sub.time}</div>
                      </div>
                      <StatusBadge tone="neutral">{sub.photos} ảnh</StatusBadge>
                    </div>
                  ))}
                </div>
              )}
            </div>
          );
        })}
      </div>
    </AppShell>
  );
}

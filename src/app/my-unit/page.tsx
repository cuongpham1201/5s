"use client";

import Link from "next/link";
import { useEffect, useState } from "react";
import { AppShell } from "@/components/layout/AppShell";
import { AppHeader } from "@/components/layout/AppHeader";
import { Icon } from "@/components/ui/Icon";
import { MockPhoto } from "@/components/ui/MockPhoto";
import type { MeResponse } from "@/lib/graph/graph-types";
import type { LatestSubmission, TodaySummary } from "@/lib/sharepoint/report-service";

function fmt(iso?: string): string {
  if (!iso) return "—";
  const d = new Date(iso);
  if (Number.isNaN(d.getTime())) return iso;
  const p = (n: number) => String(n).padStart(2, "0");
  return `${p(d.getDate())}/${p(d.getMonth() + 1)} ${p(d.getHours())}:${p(d.getMinutes())}`;
}

export default function MyUnitPage() {
  const [me, setMe] = useState<MeResponse | null>(null);
  const [today, setToday] = useState<TodaySummary | null>(null);
  const [mine, setMine] = useState<LatestSubmission[]>([]);
  const [loading, setLoading] = useState(true);

  useEffect(() => {
    let active = true;
    Promise.all([
      fetch("/api/me").then((r) => (r.ok ? r.json() : null)),
      fetch("/api/reports/today").then((r) => (r.ok ? r.json() : null)),
      fetch("/api/history/mine").then((r) => (r.ok ? r.json() : null)),
    ]).then(([m, t, h]) => {
      if (!active) return;
      setMe(m);
      setToday(t);
      setMine(h?.submissions ?? []);
      setLoading(false);
    });
    return () => {
      active = false;
    };
  }, []);

  const resolved = !!me?.departmentResolved;
  const code = me?.departmentCode ?? null;
  const shot = !!(code && today?.submittedDepartmentCodes?.includes(code));

  return (
    <AppShell>
      <AppHeader title="Phòng ban của tôi" subtitle={resolved ? `${code} · ${me?.departmentName}` : "Chưa xác định phòng ban"} />
      <div className="px-4 pb-6 flex flex-col gap-4">
        {!loading && !resolved && (
          <div className="flex items-start gap-2.5 rounded-md bg-warning-bg text-warning p-3.5">
            <span className="text-lg">⚠</span>
            <span className="text-[13px] font-medium">{me?.departmentWarning ?? "Chưa xác định phòng ban 5S. Liên hệ quản trị."}</span>
          </div>
        )}

        <div className="card flex items-center gap-3">
          <span className={`w-11 h-11 rounded-[14px] grid place-items-center flex-none ${shot ? "bg-success-bg text-success" : "bg-danger-bg text-danger"}`}>
            <Icon name={shot ? "check" : "alert"} size={22} strokeWidth={2.2} />
          </span>
          <div className="flex-1 min-w-0">
            <div className="text-[15px] font-bold text-ink leading-tight">
              {loading ? "Đang tải…" : shot ? "Đã chụp hôm nay" : "Chưa chụp hôm nay"}
            </div>
            <div className="text-[12.5px] text-ink-muted mt-0.5 truncate">{resolved ? me?.departmentName : "—"}</div>
          </div>
          {shot && <span className="text-[11.5px] font-semibold px-2.5 h-6 rounded-pill grid place-items-center bg-success-bg text-success flex-none">Hoàn thành</span>}
        </div>

        <Link href="/capture" className="flex items-center gap-3 bg-white rounded-[16px] border border-line p-3 shadow-e2 active:bg-surface-2">
          <span className="w-11 h-11 rounded-[14px] grid place-items-center bg-primary-100 text-primary-600 flex-none">
            <Icon name="camera" size={21} />
          </span>
          <span className="flex-1 text-[15px] font-bold text-ink">{shot ? "Chụp thêm ảnh" : "Chụp ảnh 5S"}</span>
          <Icon name="chevronRight" size={20} className="text-ink-disabled flex-none" />
        </Link>

        <section>
          <div className="text-[15px] font-bold text-ink mb-2">Lần gửi gần đây của bạn</div>
          {loading ? (
            <div className="text-[13px] text-ink-muted">Đang tải…</div>
          ) : mine.length === 0 ? (
            <div className="card-flat p-6 text-center text-ink-muted text-[13px]">Bạn chưa có lần gửi nào.</div>
          ) : (
            <div className="card-flat divide-y divide-line overflow-hidden">
              {mine.slice(0, 10).map((s) => (
                <div key={s.submissionId} className="flex items-center gap-3 p-2.5">
                  <MockPhoto className="w-11 h-11 flex-none" rounded="10px" />
                  <div className="flex-1 min-w-0">
                    <div className="text-[14px] font-semibold">{s.areaName}</div>
                    <div className="text-[12px] text-ink-muted">{fmt(s.submittedAt)} · {s.photoCount} ảnh</div>
                  </div>
                </div>
              ))}
            </div>
          )}
        </section>
      </div>
    </AppShell>
  );
}

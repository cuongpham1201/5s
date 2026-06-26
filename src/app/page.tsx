"use client";

import Link from "next/link";
import { useEffect, useState } from "react";
import { AppShell } from "@/components/layout/AppShell";
import { AppHeader } from "@/components/layout/AppHeader";
import { Icon } from "@/components/ui/Icon";
import { MockPhoto } from "@/components/ui/MockPhoto";
import type { TodaySummary } from "@/lib/sharepoint/report-service";
import { getSummary } from "@/lib/queue/offline-queue";
import { processQueue } from "@/lib/queue/sync-engine";
import type { QueueSummary } from "@/lib/queue/queue-types";

function hhmm(iso?: string): string {
  if (!iso) return "";
  const d = new Date(iso);
  return Number.isNaN(d.getTime()) ? "" : `${String(d.getHours()).padStart(2, "0")}:${String(d.getMinutes()).padStart(2, "0")}`;
}

export default function HomePage() {
  const [data, setData] = useState<TodaySummary | null>(null);
  const [loading, setLoading] = useState(true);
  const [queue, setQueue] = useState<QueueSummary | null>(null);
  const [retrying, setRetrying] = useState(false);

  useEffect(() => {
    let active = true;
    fetch("/api/reports/today")
      .then((r) => (r.ok ? r.json() : null))
      .then((d) => active && setData(d))
      .finally(() => active && setLoading(false));
    return () => {
      active = false;
    };
  }, []);

  useEffect(() => {
    const tick = () => setQueue(getSummary());
    tick();
    void processQueue().then(tick); // resume any pending sync on open
    const iv = setInterval(tick, 2000);
    return () => clearInterval(iv);
  }, []);

  const retrySync = async () => {
    setRetrying(true);
    try { await processQueue(); setQueue(getSummary()); } finally { setRetrying(false); }
  };
  const pending = (queue?.uploading ?? 0) + (queue?.queued ?? 0) + (queue?.failed ?? 0);

  const expected = data?.expectedDepartments ?? 0;
  const submitted = data?.submittedDepartments ?? 0;
  const pct = Math.round((data?.completionRate ?? 0) * 100);
  const missing = data?.missingDepartments ?? [];
  const latest = data?.latestSubmissions ?? [];

  return (
    <AppShell>
      <AppHeader showBell />
      <div className="px-4 pb-6 flex flex-col gap-4">
        {/* Today summary */}
        <div className="card">
          <div className="text-[12px] text-ink-muted">Hôm nay · {data?.date ?? "…"}</div>
          <div className="flex items-end justify-between mt-2">
            <div>
              <div className="text-[34px] font-extrabold leading-none text-ink">
                {loading ? "…" : submitted}
                <span className="text-ink-disabled text-[20px] font-bold">/{expected}</span>
              </div>
              <div className="text-[12.5px] text-ink-muted mt-1">phòng ban đã chụp</div>
            </div>
            <div className="text-right">
              <div className="text-[28px] font-extrabold leading-none text-success">{pct}%</div>
              <div className="text-[12.5px] text-ink-muted mt-1">Hoàn thành</div>
            </div>
          </div>
          <div className="mt-3 h-2 rounded-pill bg-surface overflow-hidden">
            <i className="block h-full rounded-pill bg-success" style={{ width: `${pct}%` }} />
          </div>
        </div>

        {/* Sync queue status */}
        {pending > 0 && (
          <div className={`flex items-center gap-3 rounded-[14px] p-3 border ${queue?.failed ? "bg-danger-bg border-danger/30" : "bg-info-bg border-info/30"}`}>
            <span className="text-[20px]">{queue?.failed ? "⚠️" : queue?.uploading ? "↻" : "⏳"}</span>
            <span className="flex-1 min-w-0 text-[13px] font-medium text-ink">
              {queue?.uploading ? "Đang đồng bộ ảnh lên SharePoint…" : queue?.failed ? `${queue.failed} lần gửi đồng bộ lỗi, sẽ thử lại` : `${queue?.queued ?? 0} lần gửi đang chờ đồng bộ`}
            </span>
            {(queue?.failed ?? 0) > 0 && (
              <button onClick={retrySync} disabled={retrying} className="text-[12.5px] font-semibold text-primary-600 px-2 py-1">
                {retrying ? "…" : "Thử lại"}
              </button>
            )}
          </div>
        )}

        {/* CTA */}
        <Link href="/capture" className="flex items-center gap-3 bg-white rounded-[16px] border border-line p-3 shadow-e2 active:bg-surface-2">
          <span className="w-12 h-12 rounded-[14px] grid place-items-center bg-success-bg text-success flex-none">
            <Icon name="camera" size={22} />
          </span>
          <span className="flex-1 min-w-0">
            <span className="block text-[15px] font-bold text-ink leading-tight">Chụp ảnh 5S</span>
            <span className="block text-[12.5px] text-ink-muted">Gửi ảnh mới · bổ sung</span>
          </span>
          <Icon name="chevronRight" size={20} className="text-ink-disabled flex-none" />
        </Link>

        {/* Missing */}
        <section>
          <div className="flex items-center gap-2 mb-2">
            <span className="text-[15px] font-bold text-ink">Chưa chụp hôm nay</span>
            <span className="min-w-[20px] h-5 px-1.5 rounded-pill grid place-items-center text-[11px] font-bold bg-danger-bg text-danger">
              {missing.length}
            </span>
          </div>
          {missing.length === 0 ? (
            <div className="text-[13px] text-ink-muted">{loading ? "Đang tải…" : expected === 0 ? "Chưa có phòng ban (Config_Departments)." : "Tất cả phòng ban đã chụp 👍"}</div>
          ) : (
            <div className="flex flex-wrap gap-1.5">
              {missing.map((d) => (
                <span key={d.code} className="px-3 h-8 rounded-pill grid place-items-center text-[12.5px] font-semibold bg-danger-bg text-danger" title={d.name}>
                  {d.code}
                </span>
              ))}
            </div>
          )}
        </section>

        {/* Latest */}
        <section>
          <div className="flex items-center justify-between mb-2">
            <span className="text-[15px] font-bold text-ink">Ảnh mới nhất</span>
            <Link href="/overview" className="flex items-center gap-0.5 text-[13px] font-semibold text-primary-600">
              Toàn cảnh <Icon name="chevronRight" size={15} />
            </Link>
          </div>
          {latest.length === 0 ? (
            <div className="card-flat p-6 text-center text-ink-muted text-[13px]">
              {loading ? "Đang tải…" : "Chưa có ảnh nào hôm nay"}
            </div>
          ) : (
            <div className="card-flat divide-y divide-line overflow-hidden">
              {latest.map((f) => (
                <div key={f.submissionId} className="flex items-center gap-3 p-2.5">
                  {f.thumbnailPath ? (
                    // eslint-disable-next-line @next/next/no-img-element
                    <img src={`/api/photo?path=${encodeURIComponent(f.thumbnailPath)}`} alt="" className="w-14 h-14 flex-none rounded-[12px] object-cover bg-surface" />
                  ) : (
                    <MockPhoto className="w-14 h-14 flex-none" rounded="12px" />
                  )}
                  <span className="flex-1 min-w-0">
                    <span className="block text-[14px] font-semibold text-ink leading-tight">{f.departmentCode} · {f.areaName}</span>
                    <span className="block text-[12px] text-ink-muted mt-0.5">{f.photoCount} ảnh · {hhmm(f.submittedAt)}</span>
                  </span>
                </div>
              ))}
            </div>
          )}
        </section>
      </div>
    </AppShell>
  );
}

"use client";

import Link from "next/link";
import { useEffect, useMemo, useState } from "react";
import { AppShell } from "@/components/layout/AppShell";
import { AppHeader } from "@/components/layout/AppHeader";
import { Icon, type IconName } from "@/components/ui/Icon";
import { PhotoViewerModal, type ViewerPhoto } from "@/components/media/PhotoViewerModal";
import { ensureProfile, subscribeMe } from "@/lib/client/me-cache";
import { displayNameFrom } from "@/lib/profile/display";
import type { MeResponse } from "@/lib/graph/graph-types";
import type { TodaySummary, LatestSubmission } from "@/lib/sharepoint/report-service";

interface WhoAmI { isAdmin: boolean }

function hhmm(iso?: string): string {
  if (!iso) return "";
  const d = new Date(iso);
  return Number.isNaN(d.getTime()) ? "" : `${String(d.getHours()).padStart(2, "0")}:${String(d.getMinutes()).padStart(2, "0")}`;
}

const QUICK: { href: string; icon: IconName; label: string }[] = [
  { href: "/3s", icon: "check", label: "Audit 5S" },
  { href: "/gallery", icon: "image", label: "Thư viện" },
  { href: "/history", icon: "clock", label: "Lịch sử" },
  { href: "/overview", icon: "chart", label: "Toàn cảnh" },
  { href: "/me", icon: "user", label: "Hồ sơ" },
];

export default function DashboardPage() {
  const [me, setMe] = useState<MeResponse | null>(null);
  const [today, setToday] = useState<TodaySummary | null>(null);
  const [mine, setMine] = useState<LatestSubmission[]>([]);
  const [isAdmin, setIsAdmin] = useState(false);
  const [loading, setLoading] = useState(true);
  const [viewer, setViewer] = useState<number | null>(null);

  useEffect(() => {
    let active = true;
    const unsub = subscribeMe((m) => active && setMe(m)); // resume/refresh updates
    // ensureProfile = refresh + (if incomplete) force server sync + refresh again.
    (async () => {
      const [m, t, h, w] = await Promise.all([
        ensureProfile(),
        fetch("/api/reports/today").then((r) => (r.ok ? r.json() : null)),
        fetch("/api/history/mine").then((r) => (r.ok ? r.json() : null)),
        fetch("/api/admin/whoami").then((r) => (r.ok ? r.json() : null)),
      ]);
      if (!active) return;
      setMe(m); setToday(t); setMine(h?.submissions ?? []); setIsAdmin(!!(w as WhoAmI)?.isAdmin);
      setLoading(false);
    })();
    return () => { active = false; unsub(); };
  }, []);

  const pct = Math.round((today?.completionRate ?? 0) * 100);
  const todayKey = today?.date ?? "";
  const myToday = useMemo(
    () => mine.filter((s) => (s.submittedAt || "").slice(0, 10) === todayKey || (s.submittedAt && new Date(s.submittedAt).toLocaleDateString("en-CA") === todayKey)),
    [mine, todayKey],
  );
  const submittedToday = myToday.length > 0;
  const lastMine = mine[0];

  const latest = (today?.latestSubmissions ?? []).filter((s) => s.thumbnailPath).slice(0, 6);
  const viewerPhotos: ViewerPhoto[] = latest.map((s) => ({
    watermarkedPath: s.thumbnailPath as string,
    departmentCode: s.departmentCode,
    areaName: s.areaName,
    reporterName: s.reporterName,
    submittedAt: s.submittedAt,
    submissionId: s.submissionId,
  }));

  const missing = today?.missingDepartments ?? [];

  return (
    <AppShell>
      <AppHeader
        title={`Xin chào, ${me ? displayNameFrom({ displayName: me.displayName, email: me.email }) : (loading ? "…" : "bạn")}`}
        subtitle={me?.departmentResolved ? `${me.departmentCode} · ${me.departmentName}` : (loading ? "Đang đồng bộ hồ sơ…" : "Phòng ban: chưa xác định")}
      />
      <div className="px-4 pb-6 flex flex-col gap-4 lg:grid lg:grid-cols-3 lg:gap-4 lg:items-start">

        {/* My status today */}
        <div className={`card flex items-center gap-3 lg:col-span-1 ${submittedToday ? "" : ""}`}>
          <span className={`w-11 h-11 rounded-[14px] grid place-items-center flex-none ${submittedToday ? "bg-success-bg text-success" : "bg-danger-bg text-danger"}`}>
            <Icon name={submittedToday ? "check" : "alert"} size={22} strokeWidth={2.2} />
          </span>
          <div className="flex-1 min-w-0">
            <div className="text-[15px] font-bold leading-tight">{loading ? "Đang tải…" : submittedToday ? "Bạn đã gửi hôm nay" : "Bạn chưa gửi hôm nay"}</div>
            <div className="text-[12.5px] text-ink-muted mt-0.5">{lastMine ? `Gần nhất: ${hhmm(lastMine.submittedAt)} · ${lastMine.areaName}` : "Chưa có lần gửi nào"}</div>
          </div>
        </div>

        {/* Today summary */}
        <div className="card lg:col-span-1">
          <div className="text-[12px] text-ink-muted">Hôm nay · {today?.date ?? "…"}</div>
          <div className="flex items-end justify-between mt-1.5">
            <div className="text-[30px] font-extrabold leading-none">{loading ? "…" : today?.submittedDepartments ?? 0}<span className="text-ink-disabled text-[18px] font-bold">/{today?.expectedDepartments ?? 0}</span></div>
            <div className="text-[24px] font-extrabold text-success leading-none">{pct}%</div>
          </div>
          <div className="text-[12px] text-ink-muted mt-1">phòng ban đã chụp</div>
          <div className="mt-2 h-2 rounded-pill bg-surface overflow-hidden"><i className="block h-full rounded-pill bg-success" style={{ width: `${pct}%` }} /></div>
          {(today?.threeS?.photosToday ?? 0) > 0 && (
            <div className="text-[12px] text-ink-muted mt-2">
              Audit 5S hôm nay: <b className="text-ink">{today?.threeS?.photosToday}</b> ảnh
              {(today?.threeS?.violationsToday ?? 0) > 0 && <> · <b className="text-danger">{today?.threeS?.violationsToday}</b> vi phạm</>}
            </div>
          )}
        </div>

        {/* CTA */}
        <Link href="/capture" className="flex items-center gap-3 bg-white rounded-[16px] border border-line p-3 shadow-e2 active:bg-surface-2 lg:col-span-1">
          <span className="w-12 h-12 rounded-[14px] grid place-items-center bg-success-bg text-success flex-none"><Icon name="camera" size={22} /></span>
          <span className="flex-1 min-w-0"><span className="block text-[15px] font-bold leading-tight">Thực hành 5S</span><span className="block text-[12.5px] text-ink-muted">Phòng ban của bạn · &lt;30 giây</span></span>
          <Icon name="chevronRight" size={20} className="text-ink-disabled flex-none" />
        </Link>

        {/* Latest photos */}
        <section className="lg:col-span-2">
          <div className="flex items-center justify-between mb-2">
            <span className="text-[15px] font-bold">Ảnh mới nhất</span>
            <Link href="/gallery" className="text-[13px] font-semibold text-primary-600">Xem tất cả →</Link>
          </div>
          {latest.length === 0 ? (
            <div className="card-flat p-6 text-center text-ink-muted text-[13px]">{loading ? "Đang tải…" : "Chưa có ảnh nào hôm nay"}</div>
          ) : (
            <div className="grid grid-cols-3 sm:grid-cols-4 lg:grid-cols-6 gap-2.5">
              {latest.map((s, i) => (
                <button key={s.submissionId} onClick={() => setViewer(i)} className="relative aspect-square rounded-md overflow-hidden shadow-e2 bg-surface">
                  {/* eslint-disable-next-line @next/next/no-img-element */}
                  <img src={`/api/photo?path=${encodeURIComponent(s.thumbnailPath as string)}`} alt={s.areaName} loading="lazy" className="w-full h-full object-cover" />
                  <span className="absolute inset-x-0 bottom-0 bg-gradient-to-t from-black/65 to-transparent text-white text-[9.5px] font-semibold px-1.5 pt-3 pb-1 truncate">{s.departmentCode}</span>
                </button>
              ))}
            </div>
          )}
        </section>

        {/* Missing departments */}
        <section className="lg:col-span-1">
          <div className="flex items-center gap-2 mb-2">
            <span className="text-[15px] font-bold">Chưa chụp hôm nay</span>
            <span className="min-w-[20px] h-5 px-1.5 rounded-pill grid place-items-center text-[11px] font-bold bg-danger-bg text-danger">{missing.length}</span>
          </div>
          {missing.length === 0 ? (
            <div className="text-[13px] text-ink-muted">{loading ? "Đang tải…" : "Tất cả phòng ban đã chụp 👍"}</div>
          ) : (
            <div className="flex flex-wrap gap-1.5">
              {missing.slice(0, 12).map((d) => (
                <Link key={d.code} href={`/gallery?departmentCode=${encodeURIComponent(d.code)}`} className="px-3 h-8 rounded-pill grid place-items-center text-[12.5px] font-semibold bg-danger-bg text-danger" title={d.name}>{d.code}</Link>
              ))}
              {missing.length > 12 && <span className="px-2 h-8 grid place-items-center text-[12.5px] text-ink-muted">+{missing.length - 12}</span>}
            </div>
          )}
        </section>

        {/* Quick links */}
        <section className="lg:col-span-3">
          <div className="grid grid-cols-4 lg:grid-cols-8 gap-2.5">
            {QUICK.map((q) => (
              <Link key={q.href} href={q.href} className="bg-white rounded-[14px] border border-line p-3 shadow-e2 flex flex-col items-center gap-1.5 hover:border-primary-600/40 hover:shadow-md transition active:bg-surface-2">
                <Icon name={q.icon} size={22} className="text-primary-600" />
                <span className="text-[12px] font-semibold">{q.label}</span>
              </Link>
            ))}
            {isAdmin && (
              <Link href="/admin" className="bg-primary-100 rounded-[14px] border border-primary-600/30 p-3 shadow-e2 flex flex-col items-center gap-1.5 hover:shadow-md transition active:opacity-90">
                <Icon name="building" size={22} className="text-primary-700" />
                <span className="text-[12px] font-semibold text-primary-700">Quản trị</span>
              </Link>
            )}
          </div>
        </section>
      </div>
      {viewer != null && (
        <PhotoViewerModal photos={viewerPhotos} index={viewer} onClose={() => setViewer(null)} onIndexChange={setViewer} />
      )}
    </AppShell>
  );
}

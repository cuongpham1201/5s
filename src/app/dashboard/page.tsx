"use client";

import Link from "next/link";
import { useEffect, useMemo, useState } from "react";
import { AppShell } from "@/components/layout/AppShell";
import { AppHeader } from "@/components/layout/AppHeader";
import { Icon, type IconName } from "@/components/ui/Icon";
import { ModuleCard } from "@/components/ui/ModuleCard";
import { PhotoViewerModal, type ViewerPhoto } from "@/components/media/PhotoViewerModal";
import { ensureProfile, subscribeMe } from "@/lib/client/me-cache";
import { displayNameFrom } from "@/lib/profile/display";
import type { MeResponse } from "@/lib/graph/graph-types";
import type { TodaySummary, LatestSubmission } from "@/lib/sharepoint/report-service";

interface WhoAmI { isAdmin: boolean }
interface CapaLite { status: string; dueDate: string | null }

function hhmm(iso?: string): string {
  if (!iso) return "";
  const d = new Date(iso);
  return Number.isNaN(d.getTime()) ? "" : `${String(d.getHours()).padStart(2, "0")}:${String(d.getMinutes()).padStart(2, "0")}`;
}

const QUICK: { href: string; icon: IconName; label: string }[] = [
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
  const [myCapas, setMyCapas] = useState<CapaLite[]>([]);
  const [loading, setLoading] = useState(true);
  const [viewer, setViewer] = useState<number | null>(null);

  useEffect(() => {
    let active = true;
    const unsub = subscribeMe((m) => active && setMe(m)); // resume/refresh updates
    // ensureProfile = refresh + (if incomplete) force server sync + refresh again.
    (async () => {
      const [m, t, h, w, c] = await Promise.all([
        ensureProfile(),
        fetch("/api/reports/today").then((r) => (r.ok ? r.json() : null)),
        fetch("/api/history/mine").then((r) => (r.ok ? r.json() : null)),
        fetch("/api/admin/whoami").then((r) => (r.ok ? r.json() : null)),
        fetch("/api/capas?scope=mine").then((r) => (r.ok ? r.json() : null)),
      ]);
      if (!active) return;
      setMe(m); setToday(t); setMine(h?.submissions ?? []); setIsAdmin(!!(w as WhoAmI)?.isAdmin);
      setMyCapas((c?.capas ?? []) as CapaLite[]);
      setLoading(false);
    })();
    return () => { active = false; unsub(); };
  }, []);

  const capaOpen = myCapas.filter((c) => c.status !== "closed").length;
  const capaOverdue = myCapas.filter((c) => c.status !== "closed" && c.dueDate && new Date(c.dueDate).getTime() < Date.now()).length;

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
      <div className="px-4 pb-6 flex flex-col gap-4">

        {/* Module dashboard — 4 module lớn, dễ chạm */}
        <section className="grid grid-cols-1 sm:grid-cols-2 gap-3">
          <ModuleCard
            href="/capture"
            icon="camera"
            tone="success"
            title="Thực hành 5S hàng ngày"
            description="Chụp & gửi phiếu 5S cho phòng ban của bạn"
            stat={loading ? "…" : `${myToday.length} phiếu`}
            statSub={submittedToday ? `hôm nay · gần nhất ${hhmm(lastMine?.submittedAt)}` : "hôm nay · bắt đầu ngay"}
            badge={!loading && !submittedToday ? { text: "Chưa gửi", tone: "danger" } : undefined}
          />
          <ModuleCard
            href="/3s"
            icon="clipboard"
            tone="primary"
            title="Kiểm tra 5S"
            description="Audit 5S, ghi nhận điểm chưa đạt"
            stat={loading ? "…" : `${today?.threeS?.photosToday ?? 0} ảnh`}
            statSub={(today?.threeS?.violationsToday ?? 0) > 0 ? `hôm nay · ${today?.threeS?.violationsToday} vi phạm` : "hôm nay"}
          />
          <ModuleCard
            href="/capa"
            icon="alert"
            tone="warning"
            title="CAPA / Giao việc"
            description="Khắc phục điểm chưa đạt, theo dõi tiến độ"
            stat={loading ? "…" : `${capaOpen} việc`}
            statSub={capaOpen > 0 ? "chưa hoàn thành" : "đã xong hết"}
            badge={capaOverdue > 0 ? { text: `${capaOverdue} quá hạn`, tone: "danger" } : undefined}
          />
          <ModuleCard
            href="/overview"
            icon="chart"
            tone="info"
            title="Thống kê"
            description="Tiến độ chụp & tỷ lệ hoàn thành hôm nay"
            stat={loading ? "…" : `${pct}%`}
            statSub={`${today?.submittedDepartments ?? 0}/${today?.expectedDepartments ?? 0} phòng ban`}
          />
        </section>

        {/* Latest photos */}
        <section>
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
        <section>
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
        <section>
          <div className="grid grid-cols-4 lg:grid-cols-5 gap-2.5">
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

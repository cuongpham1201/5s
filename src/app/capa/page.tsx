"use client";

import Link from "next/link";
import { useCallback, useEffect, useState } from "react";
import { AppShell } from "@/components/layout/AppShell";
import { AppHeader } from "@/components/layout/AppHeader";
import { STag } from "@/components/ui/STag";

interface Capa {
  capaId: string; departmentCode: string; areaName: string; sTag: string | null;
  issueNote: string | null; status: string; priority: string; dueDate: string | null;
  assigneeName: string | null; assigneeEmail: string | null; reopenedCount: number;
  violationPhotoPath: string; createdAt: string | null;
}

const STATUS_UI: Record<string, { label: string; cls: string }> = {
  open: { label: "Chưa xử lý", cls: "bg-danger-bg text-danger" },
  in_progress: { label: "Đang xử lý", cls: "bg-warning-bg text-warning" },
  pending_verification: { label: "Chờ xác minh", cls: "bg-info-bg text-info" },
  closed: { label: "Đã đóng", cls: "bg-success-bg text-success" },
};

function fmtDate(iso: string | null): string {
  if (!iso) return "—";
  const d = new Date(iso);
  return Number.isNaN(d.getTime()) ? "—" : `${String(d.getDate()).padStart(2, "0")}/${String(d.getMonth() + 1).padStart(2, "0")}`;
}
function isOverdue(c: Capa): boolean {
  return !!c.dueDate && c.status !== "closed" && new Date(c.dueDate).getTime() < Date.now();
}

/** Việc khắc phục (CAPA) — tự sinh từ ảnh Vi phạm trong Audit 5S. */
export default function CapaListPage() {
  const [scope, setScope] = useState<"mine" | "dept" | "all">("mine");
  const [isVerifier, setIsVerifier] = useState(false);
  const [capas, setCapas] = useState<Capa[]>([]);
  const [loading, setLoading] = useState(true);

  const load = useCallback(async (s: string) => {
    setLoading(true);
    try {
      const r = await fetch(`/api/capas?scope=${s}`);
      const j = r.ok ? await r.json() : null;
      setCapas(j?.capas ?? []);
      setIsVerifier(!!j?.isVerifier);
    } finally { setLoading(false); }
  }, []);
  useEffect(() => { void load("mine"); }, [load]);

  const pick = (s: "mine" | "dept" | "all") => { setScope(s); void load(s); };
  const openCount = capas.filter((c) => c.status !== "closed").length;
  const overdueCount = capas.filter(isOverdue).length;

  return (
    <AppShell>
      <AppHeader title="Việc khắc phục" subtitle={`${openCount} đang mở${overdueCount ? ` · ${overdueCount} quá hạn` : ""}`} showHome />
      <div className="px-4 pb-6">
        <div className="flex rounded-md border border-line overflow-hidden mb-3 w-fit">
          {([["mine", "Của tôi"], ["dept", "Phòng ban"], ...(isVerifier ? [["all", "Tất cả"]] : [])] as [typeof scope, string][]).map(([k, lbl]) => (
            <button key={k} onClick={() => pick(k)}
              className={`px-4 py-2 text-[13.5px] font-semibold ${scope === k ? "bg-primary-600 text-white" : "bg-white text-ink"}`}>
              {lbl}
            </button>
          ))}
        </div>

        {loading ? (
          <div className="text-ink-muted text-[13px] p-4">Đang tải…</div>
        ) : capas.length === 0 ? (
          <div className="card-flat p-8 text-center text-ink-muted text-[13px]">
            Không có việc khắc phục nào. CAPA được tự tạo khi có ảnh <b>Vi phạm</b> trong Audit 5S.
          </div>
        ) : (
          <div className="flex flex-col gap-2.5">
            {capas.map((c) => {
              const ui = STATUS_UI[c.status] ?? STATUS_UI.open;
              const overdue = isOverdue(c);
              return (
                <Link key={c.capaId} href={`/capa/${encodeURIComponent(c.capaId)}`}
                  className={`card-flat p-3 flex items-center gap-3 active:bg-surface-2 ${overdue ? "border-[1.5px] border-danger" : ""}`}>
                  {/* eslint-disable-next-line @next/next/no-img-element */}
                  <img src={`/api/photo?path=${encodeURIComponent(c.violationPhotoPath)}`} alt="" loading="lazy"
                    className="w-[56px] h-[56px] rounded-md object-cover bg-surface flex-none" />
                  <div className="flex-1 min-w-0 text-[12.5px]">
                    <div className="flex items-center gap-1.5 flex-wrap">
                      <span className="font-bold">{c.departmentCode} · {c.areaName}</span>
                      <STag code={c.sTag} size="sm" />
                      {c.reopenedCount > 0 && <span className="text-[10.5px] font-bold text-warning">↺ {c.reopenedCount} lần trả lại</span>}
                    </div>
                    {c.issueNote && <div className="text-danger truncate mt-0.5">⚠ {c.issueNote}</div>}
                    <div className="text-ink-muted truncate mt-0.5">
                      {c.assigneeName || c.assigneeEmail || "Chưa giao"} · hạn {fmtDate(c.dueDate)}{overdue && <b className="text-danger"> (quá hạn)</b>}
                    </div>
                  </div>
                  <span className={`text-[11px] font-bold px-2 py-1 rounded-pill flex-none ${ui.cls}`}>{ui.label}</span>
                </Link>
              );
            })}
          </div>
        )}
      </div>
    </AppShell>
  );
}

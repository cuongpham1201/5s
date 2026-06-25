"use client";

import Link from "next/link";
import { useRouter } from "next/navigation";
import { useSession } from "next-auth/react";
import { useEffect, useMemo, useState } from "react";
import { AppShell } from "@/components/layout/AppShell";
import { areasForDepartment, CURRENT_USER } from "@/lib/mock-data";
import { useSessionCapture } from "@/features/capture/session-context";
import type { MeResponse } from "@/lib/graph/graph-types";

export default function CapturePage() {
  const router = useRouter();
  const { data: auth } = useSession();
  const { startSession } = useSessionCapture();

  const [me, setMe] = useState<MeResponse | null>(null);
  const [loadingMe, setLoadingMe] = useState(true);

  useEffect(() => {
    let active = true;
    fetch("/api/me")
      .then((r) => (r.ok ? r.json() : null))
      .then((d) => active && setMe(d))
      .finally(() => active && setLoadingMe(false));
    return () => {
      active = false;
    };
  }, []);

  // Department is READONLY, resolved against Config_Departments (M365 source).
  const resolved = !!me?.departmentResolved;
  const department = resolved ? me!.departmentCode! : null;
  const deptName = me?.departmentName ?? "";
  const areas = useMemo(() => (department ? areasForDepartment(department) : []), [department]);
  const [selected, setSelected] = useState<string | null>(null);
  useEffect(() => {
    if (areas.length && !selected) setSelected(areas[0].id);
  }, [areas, selected]);

  const begin = () => {
    if (!resolved || !department) return;
    const area = areas.find((a) => a.id === selected);
    if (!area) return;
    startSession({
      departmentCode: department,
      departmentName: deptName,
      areaCode: area.id,
      areaName: area.name,
      reporterName: auth?.user?.name ?? me?.displayName ?? CURRENT_USER.name,
      reporterEmail: auth?.user?.email ?? me?.email ?? CURRENT_USER.email,
    });
    router.push("/camera");
  };

  return (
    <AppShell showNav={false}>
      <div className="flex items-center gap-3 px-5 pt-3 pb-3">
        <Link href="/" className="w-10 h-10 rounded-pill grid place-items-center text-xl bg-surface">
          ←
        </Link>
        <div className="text-[18px] font-semibold">Chuẩn bị chụp</div>
      </div>

      <div className="flex-1 px-5 pb-4">
        {!loadingMe && !resolved && (
          <div className="mb-4 flex items-start gap-2.5 rounded-md bg-warning-bg text-warning p-3.5">
            <span className="text-lg">⚠</span>
            <span className="text-[13px] font-medium">
              {me?.departmentWarning ?? "Tài khoản chưa xác định được phòng ban 5S. Vui lòng liên hệ quản trị."}
            </span>
          </div>
        )}

        <label className="text-[13px] font-semibold text-ink-muted">Phòng ban</label>
        <div className="mt-2 flex items-center justify-between rounded-md bg-surface border border-line px-4 py-3.5">
          <span className="flex items-center gap-3">
            <span className="badge badge-info">{loadingMe ? "…" : department ?? "—"}</span>
            <span className="text-ink-muted text-[13px]">{deptName}</span>
          </span>
          <span className="text-ink-muted text-[14px]">🔒 Từ tài khoản</span>
        </div>

        {resolved && (
          <>
            <label className="block mt-6 text-[13px] font-semibold text-ink-muted">
              Khu vực <span className="text-danger">*</span>
            </label>
            <div className="text-[13px] text-ink-muted mt-1 mb-3">Chọn khu vực cho lần gửi này</div>
            {areas.length === 0 ? (
              <div className="rounded-md bg-surface border border-line p-3.5 text-[13px] text-ink-muted">
                Chưa có khu vực cho phòng ban này. Vui lòng liên hệ quản trị để cấu hình khu vực.
              </div>
            ) : (
              <div className="grid grid-cols-2 gap-3">
                {areas.map((a) => {
                  const isSel = selected === a.id;
                  return (
                    <button
                      key={a.id}
                      onClick={() => setSelected(a.id)}
                      className={`flex items-center gap-2.5 p-4 rounded-md border-[1.5px] text-[16px] font-semibold min-h-[60px] text-left transition-colors ${
                        isSel ? "border-primary-600 bg-primary-100 text-primary-700 shadow-e2" : "border-line bg-white"
                      }`}
                    >
                      <span className="text-[22px]">📍</span> {a.name}
                    </button>
                  );
                })}
              </div>
            )}
          </>
        )}
      </div>

      <div className="px-5 py-4 pb-[calc(16px+env(safe-area-inset-bottom))] border-t border-line">
        <button
          onClick={begin}
          disabled={!resolved || !selected}
          className={`btn btn-primary btn-lg btn-block ${!resolved || !selected ? "opacity-50 pointer-events-none" : ""}`}
        >
          📷 Bắt đầu chụp
        </button>
      </div>
    </AppShell>
  );
}

"use client";

import Link from "next/link";
import { useRouter } from "next/navigation";
import { useEffect, useMemo, useState } from "react";
import { AppShell } from "@/components/layout/AppShell";
import { useSessionCapture } from "@/features/capture/session-context";
import type { MeResponse } from "@/lib/graph/graph-types";
import type { AreaOption } from "@/lib/sharepoint/area-service";
import type { CheckItemOption } from "@/lib/sharepoint/checkitem-service";

export default function CapturePage() {
  const router = useRouter();
  const { startSession } = useSessionCapture();

  const [me, setMe] = useState<MeResponse | null>(null);
  const [areas, setAreas] = useState<AreaOption[]>([]);
  const [loading, setLoading] = useState(true);
  const [areasLoading, setAreasLoading] = useState(false);
  const [selected, setSelected] = useState<string | null>(null);

  const [checkItems, setCheckItems] = useState<CheckItemOption[]>([]);
  const [checkLoading, setCheckLoading] = useState(false);
  const [selectedChecks, setSelectedChecks] = useState<Set<string>>(new Set());

  useEffect(() => {
    let active = true;
    fetch("/api/me")
      .then((r) => (r.ok ? r.json() : null))
      .then((d) => active && setMe(d))
      .finally(() => active && setLoading(false));
    return () => { active = false; };
  }, []);

  const resolved = !!me?.departmentResolved;
  const department = resolved ? me!.departmentCode! : null;
  const deptName = me?.departmentName ?? "";

  useEffect(() => {
    if (!department) return;
    let active = true;
    setAreasLoading(true);
    fetch(`/api/config/areas?departmentCode=${encodeURIComponent(department)}`)
      .then((r) => (r.ok ? r.json() : null))
      .then((d) => {
        if (!active) return;
        const list: AreaOption[] = d?.areas ?? [];
        setAreas(list);
        setSelected(list[0]?.code ?? null);
      })
      .finally(() => active && setAreasLoading(false));
    return () => { active = false; };
  }, [department]);

  // Load applicable checklist whenever department + selected area change.
  useEffect(() => {
    if (!department || !selected) { setCheckItems([]); return; }
    let active = true;
    setCheckLoading(true);
    setSelectedChecks(new Set());
    fetch(`/api/config/check-items?departmentCode=${encodeURIComponent(department)}&areaCode=${encodeURIComponent(selected)}`)
      .then((r) => (r.ok ? r.json() : null))
      .then((d) => active && setCheckItems(d?.checkItems ?? []))
      .finally(() => active && setCheckLoading(false));
    return () => { active = false; };
  }, [department, selected]);

  const toggleCheck = (code: string) =>
    setSelectedChecks((prev) => {
      const next = new Set(prev);
      if (next.has(code)) next.delete(code); else next.add(code);
      return next;
    });

  const selectedCheckList = useMemo(
    () => checkItems.filter((c) => selectedChecks.has(c.code)),
    [checkItems, selectedChecks],
  );

  const begin = () => {
    if (!resolved || !department) return;
    const area = areas.find((a) => a.code === selected);
    if (!area) return;
    const checkItemCode = selectedCheckList.map((c) => c.code).join(",") || undefined;
    const checkItemName = selectedCheckList.map((c) => c.name).join(", ") || undefined;
    startSession({
      departmentCode: department,
      departmentName: deptName,
      areaCode: area.code,
      areaName: area.name,
      checkItemCode,
      checkItemName,
      reporterName: me?.displayName ?? "",
      reporterEmail: me?.email ?? "",
    });
    router.push("/camera");
  };

  return (
    <AppShell showNav={false}>
      <div className="flex items-center gap-3 px-5 pt-3 pb-3">
        <Link href="/" className="w-10 h-10 rounded-pill grid place-items-center text-xl bg-surface">←</Link>
        <div className="text-[18px] font-semibold">Chuẩn bị chụp</div>
      </div>

      <div className="flex-1 px-5 pb-4">
        {!loading && !resolved && (
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
            <span className="badge badge-info">{loading ? "…" : department ?? "—"}</span>
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
            {areasLoading ? (
              <div className="text-[13px] text-ink-muted">Đang tải khu vực…</div>
            ) : areas.length === 0 ? (
              <div className="flex items-start gap-2.5 rounded-md bg-warning-bg text-warning p-3.5">
                <span className="text-lg">⚠</span>
                <span className="text-[13px] font-medium">Phòng ban chưa có khu vực 5S. Vui lòng liên hệ quản trị.</span>
              </div>
            ) : (
              <div className="grid grid-cols-2 gap-3">
                {areas.map((a) => {
                  const isSel = selected === a.code;
                  return (
                    <button
                      key={a.code}
                      onClick={() => setSelected(a.code)}
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

            {/* Check item (hạng mục 5S) selection */}
            {areas.length > 0 && selected && (
              <>
                <label className="block mt-6 text-[13px] font-semibold text-ink-muted">Hạng mục 5S</label>
                {checkLoading ? (
                  <div className="text-[13px] text-ink-muted mt-2">Đang tải hạng mục…</div>
                ) : checkItems.length === 0 ? (
                  <div className="mt-2 flex items-start gap-2.5 rounded-md bg-info-bg text-info p-3.5">
                    <span className="text-lg">ℹ️</span>
                    <span className="text-[13px] font-medium">
                      Chưa cấu hình checklist 5S cho khu vực này. Bạn vẫn có thể chụp ảnh tổng quan.
                    </span>
                  </div>
                ) : (
                  <>
                    <div className="text-[13px] text-ink-muted mt-1 mb-3">
                      Chọn một hoặc nhiều hạng mục, hoặc để trống để chụp ảnh tổng quan.
                    </div>
                    <div className="flex flex-wrap gap-2.5">
                      <button
                        onClick={() => setSelectedChecks(new Set())}
                        className={`px-3.5 py-2.5 rounded-pill border-[1.5px] text-[14px] font-semibold ${
                          selectedChecks.size === 0 ? "border-primary-600 bg-primary-100 text-primary-700" : "border-line bg-white"
                        }`}
                      >
                        Ảnh tổng quan
                      </button>
                      {checkItems.map((c) => {
                        const on = selectedChecks.has(c.code);
                        return (
                          <button
                            key={c.code}
                            onClick={() => toggleCheck(c.code)}
                            className={`px-3.5 py-2.5 rounded-pill border-[1.5px] text-[14px] font-semibold ${
                              on ? "border-primary-600 bg-primary-100 text-primary-700" : "border-line bg-white"
                            }`}
                          >
                            {on ? "✓ " : ""}{c.name}
                          </button>
                        );
                      })}
                    </div>
                  </>
                )}
              </>
            )}
          </>
        )}
      </div>

      <div className="px-5 py-4 pb-[calc(16px+env(safe-area-inset-bottom))] border-t border-line">
        <button
          onClick={begin}
          disabled={!resolved || !selected || areas.length === 0}
          className={`btn btn-primary btn-lg btn-block ${!resolved || !selected || areas.length === 0 ? "opacity-50 pointer-events-none" : ""}`}
        >
          📷 Bắt đầu chụp
        </button>
      </div>
    </AppShell>
  );
}

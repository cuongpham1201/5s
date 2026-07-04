"use client";

import Link from "next/link";
import { useRouter } from "next/navigation";
import { useCallback, useEffect, useMemo, useState } from "react";
import { AppShell } from "@/components/layout/AppShell";
import { useSessionCapture } from "@/features/capture/session-context";
import { fetchMe } from "@/lib/client/me-cache";
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

  // add-area form (ADMIN ONLY — regular users must ask an admin)
  const [isAdmin, setIsAdmin] = useState(false);
  const [adding, setAdding] = useState(false);
  const [newArea, setNewArea] = useState("");
  const [savingArea, setSavingArea] = useState(false);
  const [areaError, setAreaError] = useState<string | null>(null);

  const [checkItems, setCheckItems] = useState<CheckItemOption[]>([]);
  const [checkLoading, setCheckLoading] = useState(false);
  const [selectedChecks, setSelectedChecks] = useState<Set<string>>(new Set());

  useEffect(() => {
    let active = true;
    fetchMe().then((d) => { if (active) { setMe(d); setLoading(false); } });
    fetch("/api/admin/whoami").then((r) => (r.ok ? r.json() : null)).then((w) => active && setIsAdmin(!!w?.isAdmin)).catch(() => {});
    return () => { active = false; };
  }, []);

  const department = me?.departmentResolved ? me.departmentCode ?? null : null;
  const deptName = me?.departmentName ?? "";

  // Areas are the department's areas (Config_Areas) — a label, not a permission.
  const loadAreas = useCallback(async (dept: string, selectCode?: string) => {
    setAreasLoading(true);
    try {
      const r = await fetch(`/api/config/areas?departmentCode=${encodeURIComponent(dept)}`, { cache: "no-store" });
      const d = r.ok ? await r.json() : null;
      const list: AreaOption[] = d?.areas ?? [];
      setAreas(list);
      setSelected(selectCode ?? list[0]?.code ?? null);
    } finally {
      setAreasLoading(false);
    }
  }, []);

  useEffect(() => {
    if (department) void loadAreas(department);
    else setAreas([]);
  }, [department, loadAreas]);

  const selectedArea = useMemo(() => areas.find((a) => a.code === selected) ?? null, [areas, selected]);

  // Load applicable checklist whenever the selected area changes.
  useEffect(() => {
    if (!selected || !department) { setCheckItems([]); return; }
    let active = true;
    setCheckLoading(true);
    setSelectedChecks(new Set());
    fetch(`/api/config/check-items?departmentCode=${encodeURIComponent(department)}&areaCode=${encodeURIComponent(selected)}`, { cache: "no-store" })
      .then((r) => (r.ok ? r.json() : null))
      .then((d) => active && setCheckItems(d?.checkItems ?? []))
      .finally(() => active && setCheckLoading(false));
    return () => { active = false; };
  }, [selected, department]);

  const addArea = async () => {
    const name = newArea.trim();
    if (!name) return;
    setSavingArea(true);
    setAreaError(null);
    try {
      const r = await fetch("/api/config/areas", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ areaName: name }),
      });
      const d = await r.json();
      if (!r.ok) { setAreaError(d.error ?? "Không thêm được khu vực."); return; }
      setNewArea("");
      setAdding(false);
      if (department) await loadAreas(department, d.area?.code);
    } finally {
      setSavingArea(false);
    }
  };

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
    const area = areas.find((a) => a.code === selected);
    if (!area || !department) return;
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
        <Link href="/dashboard" className="w-10 h-10 rounded-pill grid place-items-center text-xl bg-surface">←</Link>
        <div className="text-[18px] font-semibold">Chuẩn bị chụp</div>
      </div>

      <div className="flex-1 px-5 pb-4">
        {!loading && !me?.departmentResolved && (
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

        {me?.departmentResolved && (
          <>
            <div className="flex items-center justify-between mt-6 mb-1">
              <label className="text-[13px] font-semibold text-ink-muted">
                Khu vực <span className="text-danger">*</span>
              </label>
              {isAdmin && !adding && (
                <button onClick={() => { setAdding(true); setAreaError(null); }} className="text-[13px] font-semibold text-primary-600">
                  + Thêm khu vực
                </button>
              )}
            </div>
            <div className="text-[13px] text-ink-muted mb-3">Khu vực là nhãn cho watermark &amp; báo cáo</div>

            {isAdmin && adding && (
              <div className="mb-3 rounded-md border border-line bg-white p-3">
                <div className="flex gap-2.5">
                  <input
                    value={newArea}
                    onChange={(e) => setNewArea(e.target.value)}
                    onKeyDown={(e) => { if (e.key === "Enter") void addArea(); }}
                    placeholder="Tên khu vực (vd Văn phòng, Kho hồ sơ)"
                    autoFocus
                    className="flex-1 rounded-md border border-line-strong px-3 py-2 text-[14px]"
                  />
                  <button onClick={addArea} disabled={savingArea || !newArea.trim()} className="btn btn-primary !min-h-10">
                    {savingArea ? "…" : "Lưu"}
                  </button>
                  <button onClick={() => { setAdding(false); setNewArea(""); setAreaError(null); }} className="btn btn-secondary !min-h-10">Huỷ</button>
                </div>
                {areaError && <div className="text-danger text-[12.5px] mt-1.5">{areaError}</div>}
              </div>
            )}

            {areasLoading ? (
              <div className="text-[13px] text-ink-muted">Đang tải khu vực…</div>
            ) : areas.length === 0 ? (
              !adding && (
                <div className="rounded-md bg-info-bg text-info p-3.5">
                  <div className="text-[13px] font-medium">
                    {isAdmin
                      ? "Phòng ban chưa có khu vực. Bạn có thể thêm khu vực đầu tiên."
                      : "Phòng ban chưa có khu vực. Vui lòng liên hệ quản trị viên để thêm khu vực."}
                  </div>
                  {isAdmin && (
                    <button onClick={() => setAdding(true)} className="btn btn-primary !min-h-9 mt-2.5">+ Thêm khu vực đầu tiên</button>
                  )}
                </div>
              )
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
                    {/* Only REAL check items from Config_CheckItems are listed —
                        no synthetic "Ảnh tổng quan" chip. Leaving every item
                        unselected (items are toggles) = overview photo. */}
                    <div className="flex flex-wrap gap-2.5">
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
          disabled={!selected || areas.length === 0}
          className={`btn btn-primary btn-lg btn-block ${!selected || areas.length === 0 ? "opacity-50 pointer-events-none" : ""}`}
        >
          📷 Bắt đầu chụp
        </button>
      </div>
    </AppShell>
  );
}

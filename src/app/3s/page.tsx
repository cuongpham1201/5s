"use client";

import Link from "next/link";
import { useRouter } from "next/navigation";
import { useCallback, useEffect, useState } from "react";
import { AppShell } from "@/components/layout/AppShell";
import { useSessionCapture } from "@/features/capture/session-context";
import { fetchMe } from "@/lib/client/me-cache";
import type { MeResponse } from "@/lib/graph/graph-types";

interface AreaOption { code: string; name: string; parentCode?: string | null }
interface DeptOption { code: string; name: string }

/**
 * Thực hành 3S (M1 · HD-01) — LỐI VÀO RIÊNG, tách khỏi luồng "chụp ảnh hàng
 * ngày" (/capture giữ nguyên). Bản chất AUDIT: người kiểm tra đi CÁC PHÒNG BAN
 * KHÁC để chụp → chọn phòng ban cần audit (mặc định phòng của mình) rồi chọn
 * khu vực. Bản ghi lưu departmentCode = PHÒNG BỊ AUDIT; reporter = người audit.
 * Thẻ S1/S2/S3 + loại ảnh chọn cho TỪNG ẢNH ở bước xem lại. Hạ tầng dùng chung.
 */
export default function ThreeSPage() {
  const router = useRouter();
  const { startSession } = useSessionCapture();
  const [me, setMe] = useState<MeResponse | null>(null);
  const [loading, setLoading] = useState(true);
  const [departments, setDepartments] = useState<DeptOption[]>([]);
  const [selectedDept, setSelectedDept] = useState<string | null>(null);
  const [areas, setAreas] = useState<AreaOption[]>([]);
  const [areasLoading, setAreasLoading] = useState(false);
  const [selected, setSelected] = useState<string | null>(null);
  const [selectedChild, setSelectedChild] = useState<string | null>(null);

  useEffect(() => {
    let active = true;
    fetchMe().then((d) => { if (active) { setMe(d); setLoading(false); } });
    fetch("/api/config/departments", { cache: "no-store" })
      .then((r) => (r.ok ? r.json() : null))
      .then((d) => active && setDepartments((d?.departments ?? []) as DeptOption[]));
    return () => { active = false; };
  }, []);

  // Mặc định audit phòng ban của chính người dùng (có thể đổi sang phòng khác).
  useEffect(() => {
    if (!selectedDept && me?.departmentResolved && me.departmentCode) setSelectedDept(me.departmentCode);
  }, [me, selectedDept]);

  const loadAreas = useCallback(async (dept: string) => {
    setAreasLoading(true);
    setSelected(null);
    try {
      const r = await fetch(`/api/config/areas?departmentCode=${encodeURIComponent(dept)}`, { cache: "no-store" });
      const d = r.ok ? await r.json() : null;
      const list: AreaOption[] = d?.areas ?? [];
      setAreas(list);
      setSelected(list.filter((x) => !x.parentCode)[0]?.code ?? null);
    } finally { setAreasLoading(false); }
  }, []);

  useEffect(() => {
    if (selectedDept) void loadAreas(selectedDept);
    else setAreas([]);
  }, [selectedDept, loadAreas]);

  const selectedDeptName = departments.find((d) => d.code === selectedDept)?.name
    ?? (selectedDept === me?.departmentCode ? me?.departmentName : "") ?? "";
  const groups = areas.filter((a) => !a.parentCode);
  const childrenOfSelected = areas.filter((a) => a.parentCode === selected);
  useEffect(() => { setSelectedChild(areas.filter((a) => a.parentCode === selected)[0]?.code ?? null); }, [selected, areas]);

  const begin = () => {
    const group = areas.find((a) => a.code === selected);
    const child = selectedChild ? areas.find((a) => a.code === selectedChild) : null;
    const area = child
      ? { ...child, name: `${group?.name ?? ""} - ${child.name}`.replace(/^ - /, "") }
      : group;
    if (!area || !selectedDept) return;
    startSession({
      // departmentCode = PHÒNG BỊ AUDIT (không phải phòng của người chụp).
      departmentCode: selectedDept,
      departmentName: selectedDeptName,
      areaCode: area.code,
      areaName: area.name,
      // reporter = người đi audit (tài khoản đăng nhập).
      reporterName: me?.displayName ?? "",
      reporterEmail: me?.email ?? "",
      submissionType: "3s",
    });
    router.push("/camera");
  };

  return (
    <AppShell showNav={false}>
      <div className="flex items-center gap-3 px-5 pt-3 pb-3">
        <Link href="/dashboard" className="w-10 h-10 rounded-pill grid place-items-center text-xl bg-surface">←</Link>
        <div className="text-[18px] font-semibold">Audit 5S</div>
        <Link href="/3s/log" className="ml-auto text-[13px] font-semibold text-primary-600">📒 Sổ 3S</Link>
      </div>

      <div className="flex-1 px-5 overflow-y-auto">
        <div className="rounded-md bg-info-bg text-info p-3.5 mb-4">
          <div className="text-[13px] font-medium leading-relaxed">
            Ghi nhận thực hành <b>S1 Sàng lọc · S2 Sắp xếp · S3 Sạch sẽ</b> theo HD-01:
            mỗi ảnh gắn thẻ S + loại (hiện trạng tốt / vi phạm / trước–sau).
            Ảnh 3S <b>không</b> tính vào báo cáo &quot;chụp ảnh hàng ngày&quot;.
          </div>
        </div>

        {loading ? (
          <div className="text-[13px] text-ink-muted">Đang tải…</div>
        ) : departments.length === 0 ? (
          <div className="rounded-md bg-warning-bg text-warning p-3.5 text-[13px] font-medium">
            Chưa tải được danh sách phòng ban. Vui lòng thử lại hoặc liên hệ quản trị.
          </div>
        ) : (
          <>
            <label className="block text-[13px] font-semibold text-ink-muted mb-1">
              Phòng ban cần audit <span className="text-danger">*</span>
            </label>
            <div className="text-[12.5px] text-ink-muted mb-2">
              Chọn phòng ban bạn đang đi kiểm tra (mặc định phòng của bạn).
            </div>
            <select
              value={selectedDept ?? ""}
              onChange={(e) => setSelectedDept(e.target.value || null)}
              className="w-full rounded-md border-[1.5px] border-line-strong bg-white px-3 py-3 text-[15px] font-semibold mb-4"
            >
              {departments.map((d) => (
                <option key={d.code} value={d.code}>{d.code} · {d.name}</option>
              ))}
            </select>

            <label className="block text-[13px] font-semibold text-ink-muted mb-1">
              Khu vực <span className="text-danger">*</span>
            </label>
            {areasLoading ? (
              <div className="text-[13px] text-ink-muted">Đang tải khu vực…</div>
            ) : areas.length === 0 ? (
              <div className="rounded-md bg-info-bg text-info p-3.5 text-[13px] font-medium">
                Phòng ban chưa có khu vực. Vui lòng liên hệ quản trị viên.
              </div>
            ) : (
              <select
                value={selected ?? ""}
                onChange={(e) => setSelected(e.target.value || null)}
                className="w-full rounded-md border-[1.5px] border-line-strong bg-white px-3 py-3 text-[15px] font-semibold"
              >
                {groups.map((a) => (
                  <option key={a.code} value={a.code}>📍 {a.name}</option>
                ))}
              </select>
            )}
            {childrenOfSelected.length > 0 && (
              <>
                <label className="block mt-4 text-[13px] font-semibold text-ink-muted mb-2">
                  Vị trí cụ thể <span className="text-danger">*</span>
                </label>
                <select
                  value={selectedChild ?? ""}
                  onChange={(e) => setSelectedChild(e.target.value || null)}
                  className="w-full rounded-md border-[1.5px] border-line-strong bg-white px-3 py-3 text-[15px] font-semibold"
                >
                  {childrenOfSelected.map((c) => (
                    <option key={c.code} value={c.code}>📍 {c.name}</option>
                  ))}
                </select>
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
          📷 Bắt đầu Audit 5S
        </button>
      </div>
    </AppShell>
  );
}

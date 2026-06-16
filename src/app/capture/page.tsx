"use client";

import Link from "next/link";
import { useRouter } from "next/navigation";
import { useState } from "react";
import { AppShell } from "@/components/layout/AppShell";
import { areasForDepartment, CURRENT_USER, DEPARTMENTS } from "@/lib/mock-data";
import { useSessionCapture } from "@/features/capture/session-context";

export default function CapturePage() {
  const router = useRouter();
  const { area: sessionArea, photos, setArea } = useSessionCapture();

  // Department is READONLY (from M365 account) — never selectable.
  const department = CURRENT_USER.department;
  const deptName = DEPARTMENTS.find((d) => d.code === department)?.name ?? "";
  const areas = areasForDepartment(department);
  const [selected, setSelected] = useState<string | null>(
    areas.find((a) => a.name === sessionArea)?.id ?? areas[0]?.id ?? null,
  );

  const openCamera = () => {
    const areaName = areas.find((a) => a.id === selected)?.name;
    if (!areaName) return;
    setArea(areaName);
    router.push("/camera");
  };

  return (
    <AppShell showNav={false}>
      <div className="flex items-center gap-3 px-5 pt-2 pb-3">
        <Link href="/" className="w-10 h-10 rounded-pill grid place-items-center text-xl bg-surface">
          ←
        </Link>
        <div className="text-[18px] font-semibold">Chuẩn bị chụp</div>
      </div>

      <div className="flex-1 px-5 pb-4">
        {/* Department readonly */}
        <label className="text-[13px] font-semibold text-ink-muted">Phòng ban</label>
        <div className="mt-2 flex items-center justify-between rounded-md bg-surface border border-line px-4 py-3.5">
          <span className="flex items-center gap-3">
            <span className="badge badge-info">{department}</span>
            <span className="text-ink-muted text-[13px]">{deptName}</span>
          </span>
          <span className="text-ink-muted text-[14px]">🔒 Từ tài khoản</span>
        </div>

        {/* Dynamic area chips */}
        <label className="block mt-6 text-[13px] font-semibold text-ink-muted">
          Khu vực <span className="text-danger">*</span>
        </label>
        <div className="text-[13px] text-ink-muted mt-1 mb-3">Chọn khu vực bạn đang chụp</div>
        <div className="grid grid-cols-2 gap-3">
          {areas.map((a) => {
            const isSel = selected === a.id;
            return (
              <button
                key={a.id}
                onClick={() => setSelected(a.id)}
                className={`flex items-center gap-2.5 p-4 rounded-md border-[1.5px] text-[16px] font-semibold min-h-[60px] text-left transition-colors ${
                  isSel
                    ? "border-primary-600 bg-primary-100 text-primary-700 shadow-e2"
                    : "border-line bg-white"
                }`}
              >
                <span className="text-[22px]">📍</span> {a.name}
              </button>
            );
          })}
        </div>

        <div className="mt-6 flex gap-2.5 items-start rounded-lg border border-line p-3.5">
          <span className="text-lg">ℹ️</span>
          <span className="text-[13px] text-ink-muted">
            Bạn có thể chụp <b>nhiều ảnh</b> trong một lần gửi. Thời gian, GPS, người chụp tự động gắn vào ảnh.
          </span>
        </div>

        {photos.length > 0 && (
          <Link
            href="/session"
            className="mt-4 flex items-center justify-between rounded-md bg-primary-50 border border-primary-100 px-4 py-3 text-[14px] font-semibold text-primary-700"
          >
            <span>📸 Lần gửi đang có {photos.length} ảnh</span>
            <span>Xem →</span>
          </Link>
        )}
      </div>

      <div className="px-5 py-4 border-t border-line">
        <button
          onClick={openCamera}
          disabled={!selected}
          className={`btn btn-primary btn-lg btn-block ${!selected ? "opacity-50 pointer-events-none" : ""}`}
        >
          📷 Mở Camera
        </button>
      </div>
    </AppShell>
  );
}

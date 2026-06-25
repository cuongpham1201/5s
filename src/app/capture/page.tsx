"use client";

import Link from "next/link";
import { useRouter } from "next/navigation";
import { useSession } from "next-auth/react";
import { useState } from "react";
import { AppShell } from "@/components/layout/AppShell";
import { areasForDepartment, CURRENT_USER, DEPARTMENTS } from "@/lib/mock-data";
import { departmentName } from "@/lib/department-mapping";
import { useSessionCapture } from "@/features/capture/session-context";

export default function CapturePage() {
  const router = useRouter();
  const { data: auth } = useSession();
  const { session, startSession } = useSessionCapture();

  // Department is READONLY (from M365 user.department) — never selectable.
  // In dev, the mock provider supplies one; with real SSO it may be missing.
  const allowDev = process.env.NEXT_PUBLIC_ALLOW_DEV_LOGIN === "true";
  const department = auth?.user?.department ?? (allowDev ? CURRENT_USER.department : null);
  const hasDepartment = !!department;
  const deptName = department
    ? departmentName(department) ?? DEPARTMENTS.find((d) => d.code === department)?.name ?? ""
    : "";
  const areas = department ? areasForDepartment(department) : [];
  const [selected, setSelected] = useState<string | null>(areas[0]?.id ?? null);

  const begin = () => {
    if (!hasDepartment) return;
    const area = areas.find((a) => a.id === selected);
    if (!area) return;
    startSession({
      departmentCode: department,
      departmentName: deptName,
      areaCode: area.id,
      areaName: area.name,
      reporterName: auth?.user?.name ?? CURRENT_USER.name,
      reporterEmail: auth?.user?.email ?? CURRENT_USER.email,
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
        {!hasDepartment && (
          <div className="mb-4 flex items-start gap-2.5 rounded-md bg-warning-bg text-warning p-3.5">
            <span className="text-lg">⚠</span>
            <span className="text-[13px] font-medium">
              Tài khoản chưa có thông tin phòng ban. Vui lòng liên hệ quản trị.
            </span>
          </div>
        )}
        <label className="text-[13px] font-semibold text-ink-muted">Phòng ban</label>
        <div className="mt-2 flex items-center justify-between rounded-md bg-surface border border-line px-4 py-3.5">
          <span className="flex items-center gap-3">
            <span className="badge badge-info">{department ?? "—"}</span>
            <span className="text-ink-muted text-[13px]">{deptName}</span>
          </span>
          <span className="text-ink-muted text-[14px]">🔒 Từ tài khoản</span>
        </div>

        <label className="block mt-6 text-[13px] font-semibold text-ink-muted">
          Khu vực <span className="text-danger">*</span>
        </label>
        <div className="text-[13px] text-ink-muted mt-1 mb-3">Chọn khu vực cho lần gửi này</div>
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
            Bạn có thể chụp <b>nhiều ảnh</b> trong một lần gửi, xem lại cả lô rồi mới nộp.
          </span>
        </div>

        {session && session.photos.length > 0 && (
          <Link
            href="/session"
            className="mt-4 flex items-center justify-between rounded-md bg-primary-50 border border-primary-100 px-4 py-3 text-[14px] font-semibold text-primary-700"
          >
            <span>📸 Đang có {session.photos.length} ảnh chưa nộp</span>
            <span>Xem →</span>
          </Link>
        )}
      </div>

      <div className="px-5 py-4 pb-[calc(16px+env(safe-area-inset-bottom))] border-t border-line">
        <button
          onClick={begin}
          disabled={!selected || !hasDepartment}
          className={`btn btn-primary btn-lg btn-block ${!selected || !hasDepartment ? "opacity-50 pointer-events-none" : ""}`}
        >
          📷 Bắt đầu chụp
        </button>
      </div>
    </AppShell>
  );
}

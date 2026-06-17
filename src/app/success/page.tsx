"use client";

import Link from "next/link";
import { AppShell } from "@/components/layout/AppShell";
import { Card, InfoRow } from "@/components/ui/Card";
import { CURRENT_USER } from "@/lib/mock-data";
import { useSessionCapture } from "@/features/capture/session-context";

function fmt(iso?: string): string {
  if (!iso) return "—";
  const d = new Date(iso);
  const p = (n: number) => String(n).padStart(2, "0");
  return `${p(d.getHours())}:${p(d.getMinutes())} · ${p(d.getDate())}/${p(d.getMonth() + 1)}/${d.getFullYear()}`;
}

export default function SuccessPage() {
  const { lastSubmitted } = useSessionCapture();
  const s = lastSubmitted;

  return (
    <AppShell showNav={false}>
      <div className="flex-1 flex flex-col items-center justify-center text-center p-8 gap-2">
        <div className="w-[120px] h-[120px] rounded-pill grid place-items-center text-[64px] bg-success-bg text-success mb-3">
          ✓
        </div>
        <div className="text-[28px] font-bold">Đã nộp thành công</div>
        <p className="text-ink-muted">
          {s ? (
            <>
              Đã nộp <b>{s.photoCount} ảnh</b> cho lần gửi này.
            </>
          ) : (
            "Lần gửi của bạn đã được lưu."
          )}
        </p>

        <Card className="mt-6 w-full text-left">
          <InfoRow label="Đơn vị" value={s?.departmentCode ?? CURRENT_USER.department} />
          <InfoRow label="Khu vực" value={s?.areaName ?? "—"} />
          <InfoRow label="Số ảnh" value={`${s?.photoCount ?? 0} ảnh`} />
          <InfoRow label="Thời gian nộp" value={fmt(s?.submittedAt)} />
        </Card>

        <div className="w-full flex flex-col gap-3 mt-8">
          <Link href="/capture" className="btn btn-primary btn-lg btn-block">
            + Chụp phiên mới
          </Link>
          <Link href="/" className="btn btn-ghost btn-block">
            Về trang chủ
          </Link>
        </div>
      </div>
    </AppShell>
  );
}

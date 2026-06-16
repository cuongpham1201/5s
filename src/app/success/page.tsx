import Link from "next/link";
import { AppShell } from "@/components/layout/AppShell";
import { Card, InfoRow } from "@/components/ui/Card";

export default function SuccessPage() {
  return (
    <AppShell showNav={false}>
      <div className="flex-1 flex flex-col items-center justify-center text-center p-8 gap-2">
        <div className="w-[120px] h-[120px] rounded-pill grid place-items-center text-[64px] bg-success-bg text-success mb-3">
          ✓
        </div>
        <div className="text-[28px] font-bold">Đã gửi thành công!</div>
        <p className="text-ink-muted">Ảnh 5S của bạn đã được lưu trữ.</p>

        <Card className="mt-6 w-full text-left">
          <InfoRow label="Đơn vị" value="PMKT" />
          <InfoRow label="Khu vực" value="Văn phòng" />
          <InfoRow label="Thời gian" value="17:20 · 15/06/2026" />
        </Card>

        <div className="w-full flex flex-col gap-3 mt-8">
          <Link href="/camera" className="btn btn-primary btn-lg btn-block">
            + Chụp tiếp
          </Link>
          <Link href="/" className="btn btn-ghost btn-block">
            Về trang chủ
          </Link>
        </div>
      </div>
    </AppShell>
  );
}

import Link from "next/link";
import { AppShell } from "@/components/layout/AppShell";
import { Card, InfoRow } from "@/components/ui/Card";

export default function PreviewPage() {
  return (
    <AppShell showNav={false}>
      <div className="flex items-center gap-3 px-5 pt-2 pb-3">
        <Link href="/camera" className="w-10 h-10 rounded-pill grid place-items-center text-xl bg-surface">
          ←
        </Link>
        <div className="text-[18px] font-semibold">Xem lại ảnh</div>
      </div>

      <div className="flex-1 px-5">
        {/* Photo with real watermark (WYSIWYG with uploaded file) */}
        <div className="relative rounded-md overflow-hidden shadow-e4">
          <div className="w-full aspect-[3/4] relative bg-gradient-to-br from-[#cdd7e0] via-[#aab7c4] to-[#6d7f90]">
            <span className="absolute inset-0 grid place-items-center text-[90px] font-extrabold text-white/25">
              5S
            </span>
            <div className="absolute left-3 bottom-3 max-w-[86%] rounded-sm bg-black/55 text-white px-3.5 py-3 text-[12px] leading-[1.55] backdrop-blur">
              <div className="font-bold text-[13px]">17:20 | 15/06/2026</div>
              <div>Thứ Hai</div>
              <div>Lê Lợi / Hồng Gai / Quảng Ninh</div>
              <div>Phòng ban: PMKT</div>
              <div>Khu vực: Văn phòng</div>
              <div>Người chụp: Nguyễn Văn A</div>
              <div>GPS: 20.9512, 107.0834</div>
              <div className="inline-flex items-center gap-1.5 mt-1.5 font-bold text-[#6FE26F]">
                ✓ 5S Verified
              </div>
            </div>
          </div>
        </div>

        <Card className="mt-4">
          <InfoRow label="📍 Địa chỉ" value="Lê Lợi, Hồng Gai, Quảng Ninh" />
          <InfoRow label="🛰 GPS" value="20.9512, 107.0834" />
          <InfoRow label="🕒 Thời gian" value="17:20 · 15/06/2026" />
        </Card>
        <p className="text-[12px] text-ink-disabled mt-3 text-center">
          Phase 1A: watermark là mẫu tĩnh — chưa ghép ảnh thật, chưa upload.
        </p>
      </div>

      <div className="px-5 py-4 border-t border-line flex gap-2.5">
        <Link href="/camera" className="btn btn-secondary btn-lg flex-1">
          ↺ Chụp lại
        </Link>
        <Link href="/success" className="btn btn-primary btn-lg flex-1">
          ✓ Gửi
        </Link>
      </div>
    </AppShell>
  );
}

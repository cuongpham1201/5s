"use client";

/**
 * CONTROLLED CLIENT RESET GATE (Phase Reset / pre-UAT).
 * Khi thiết bị còn dữ liệu local phiên bản cũ (isLocalResetPending), hiện hộp
 * xác nhận buộc người dùng xóa ảnh chờ + queue + draft/history cache test cũ
 * trước khi dùng tiếp. KHÔNG đăng xuất Microsoft. Queue đã bị chặn tự retry cho
 * tới khi reset xong (xem sync-engine). Chỉ chạy client, sau khi đã đăng nhập.
 */
import { useEffect, useState } from "react";
import { useSession } from "next-auth/react";
import { isLocalResetPending, resetLocalData, LOCAL_DATA_VERSION } from "@/lib/storage/local-data-version";

export function ClientResetGate() {
  const { status } = useSession();
  const [pending, setPending] = useState(false);
  const [busy, setBusy] = useState(false);
  const [done, setDone] = useState<{ photos: boolean; keys: number } | null>(null);

  useEffect(() => {
    if (status === "authenticated") setPending(isLocalResetPending());
  }, [status]);

  if (!pending) return null;

  const onReset = async () => {
    setBusy(true);
    try {
      const r = await resetLocalData();
      setDone(r);
      setPending(false);
    } finally {
      setBusy(false);
    }
  };

  return (
    <div className="fixed inset-0 z-[9999] flex items-center justify-center bg-black/50 p-5">
      <div className="w-full max-w-[420px] rounded-2xl bg-white p-6 shadow-xl">
        <h2 className="text-[18px] font-bold mb-2">Làm mới dữ liệu cho phiên bản mới</h2>
        <p className="text-[13.5px] text-ink-muted mb-1">
          Thiết bị của bạn còn dữ liệu 5S cũ (ảnh đang chờ, hàng đợi tải lên, bản nháp).
          Trước khi bắt đầu đợt vận hành mới, cần xóa dữ liệu cũ này khỏi máy.
        </p>
        <p className="text-[12.5px] text-ink-muted mb-4">
          Sẽ xóa: ảnh chờ trong máy, hàng đợi tải lên, bản nháp/lịch sử tạm.
          <b> Không</b> đăng xuất tài khoản Microsoft của bạn.
        </p>
        {done ? (
          <div className="text-[13px] text-success">
            Đã xóa {done.keys} mục cache{done.photos ? " + ảnh chờ" : ""}. Bạn có thể tiếp tục.
          </div>
        ) : (
          <button onClick={onReset} disabled={busy} className="btn btn-primary w-full">
            {busy ? "Đang xóa…" : "Xóa dữ liệu cũ và tiếp tục"}
          </button>
        )}
        <div className="mt-3 text-[11px] text-ink-muted text-center">Phiên bản dữ liệu: v{LOCAL_DATA_VERSION}</div>
      </div>
    </div>
  );
}

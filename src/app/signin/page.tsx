"use client";

import { getProviders, signIn } from "next-auth/react";
import { useEffect, useState } from "react";

type Providers = Awaited<ReturnType<typeof getProviders>>;

const DEV_ALLOWED = process.env.NEXT_PUBLIC_ALLOW_DEV_LOGIN === "true";

export default function SignInPage() {
  const [providers, setProviders] = useState<Providers>(null);
  const [callbackUrl, setCallbackUrl] = useState("/dashboard");
  const [email, setEmail] = useState("nguyen.van.a@biahalong.com");
  const [role, setRole] = useState("employee");

  useEffect(() => {
    getProviders().then(setProviders);
    try {
      const cb = new URLSearchParams(window.location.search).get("callbackUrl");
      if (cb) setCallbackUrl(cb);
    } catch { /* ignore */ }
  }, []);

  const hasEntra = !!providers?.["microsoft-entra-id"];
  const showDev = !!providers?.["dev"] && DEV_ALLOWED;

  return (
    <div className="min-h-[100dvh] lg:grid lg:grid-cols-2 bg-surface-app">
      {/* LEFT — brand / intro (desktop only) */}
      <div className="relative hidden lg:flex flex-col justify-between p-12 text-white overflow-hidden"
        style={{ background: "linear-gradient(135deg, var(--primary-700), var(--primary-800))" }}>
        <div className="absolute -top-24 -right-24 w-96 h-96 rounded-full bg-white/10" />
        <div className="absolute bottom-10 -left-16 w-72 h-72 rounded-full bg-white/5" />
        <div className="relative flex items-center gap-3">
          <span className="w-11 h-11 rounded-2xl grid place-items-center bg-white/15 font-extrabold text-lg">5S</span>
          <span className="text-[18px] font-bold">5S Daily</span>
        </div>
        <div className="relative max-w-md">
          <h1 className="text-[34px] font-bold leading-tight">Chụp &amp; theo dõi 5S toàn công ty</h1>
          <p className="mt-3 text-white/85 text-[15px] leading-relaxed">
            Gửi ảnh 5S trong vài giây, đồng bộ tự động lên SharePoint, theo dõi tiến độ từng phòng ban
            theo thời gian thực.
          </p>
          <div className="mt-6 flex flex-wrap gap-2 text-[13px]">
            {["Microsoft 365 SSO", "Watermark tự động", "Báo cáo realtime"].map((t) => (
              <span key={t} className="px-3 py-1.5 rounded-pill bg-white/15">{t}</span>
            ))}
          </div>
        </div>
        <div className="relative text-[12px] text-white/70">© Bia Hạ Long · Ban Môi trường đời sống</div>
      </div>

      {/* RIGHT — login card */}
      <div className="flex items-center justify-center p-6 min-h-[100dvh] lg:min-h-0">
        <div className="w-full max-w-[440px]">
          <div className="lg:hidden flex flex-col items-center text-center mb-7">
            <span className="w-16 h-16 rounded-2xl grid place-items-center text-white font-extrabold text-2xl mb-3"
              style={{ background: "linear-gradient(135deg, var(--primary-600), var(--primary-800))" }}>5S</span>
            <div className="text-[24px] font-bold">5S Daily</div>
            <p className="text-ink-muted text-[14px] mt-0.5">Đăng nhập để chụp &amp; theo dõi 5S</p>
          </div>

          <div className="bg-white rounded-2xl border border-line shadow-e8 p-7">
            <div className="hidden lg:block mb-5">
              <div className="text-[22px] font-bold">Đăng nhập</div>
              <p className="text-ink-muted text-[14px] mt-0.5">Dùng tài khoản Microsoft 365 của công ty.</p>
            </div>

            <div className="flex flex-col gap-3">
              {hasEntra && (
                <button className="btn btn-primary btn-lg btn-block" onClick={() => signIn("microsoft-entra-id", { callbackUrl })}>
                  Đăng nhập với Microsoft 365
                </button>
              )}

              {showDev && (
                <div className="mt-1 rounded-xl border border-line p-4 text-left">
                  <div className="flex items-center justify-between mb-2.5">
                    <span className="text-[13px] font-semibold text-ink-muted">{hasEntra ? "Hoặc đăng nhập thử (dev)" : "Đăng nhập thử (dev)"}</span>
                    <span className="badge badge-warning">Dev</span>
                  </div>
                  <label className="text-[13px] font-semibold">Email</label>
                  <input className="w-full mt-1 mb-3 rounded-md border border-line-strong px-3 py-2.5 text-[15px]" value={email} onChange={(e) => setEmail(e.target.value)} />
                  <label className="text-[13px] font-semibold">Vai trò</label>
                  <select className="w-full mt-1 mb-4 rounded-md border border-line-strong px-3 py-2.5 text-[15px] bg-white" value={role} onChange={(e) => setRole(e.target.value)}>
                    <option value="employee">Nhân viên (Employee)</option>
                    <option value="environment">Ban Môi trường (Environment)</option>
                    <option value="admin">Quản trị (Admin)</option>
                  </select>
                  <button className="btn btn-secondary btn-block" onClick={() => signIn("dev", { email, role, callbackUrl })}>Đăng nhập (dev)</button>
                </div>
              )}

              {!providers && <div className="text-ink-muted text-sm text-center py-2">Đang tải…</div>}
              {providers && !hasEntra && !showDev && (
                <div className="text-ink-muted text-sm text-center py-2">Chưa cấu hình đăng nhập. Liên hệ quản trị viên.</div>
              )}
            </div>
          </div>
          <p className="text-[12px] text-ink-disabled text-center mt-5">5S Daily · Bia Hạ Long</p>
        </div>
      </div>
    </div>
  );
}

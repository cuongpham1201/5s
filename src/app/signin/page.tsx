"use client";

import { getProviders, signIn } from "next-auth/react";
import { useEffect, useState } from "react";

type Providers = Awaited<ReturnType<typeof getProviders>>;

const DEV_ALLOWED = process.env.NEXT_PUBLIC_ALLOW_DEV_LOGIN === "true";

export default function SignInPage() {
  const [providers, setProviders] = useState<Providers>(null);
  // Default landing after login is the user dashboard (NOT /capture).
  const [callbackUrl, setCallbackUrl] = useState("/dashboard");
  const [email, setEmail] = useState("nguyen.van.a@biahalong.com");
  const [role, setRole] = useState("employee");

  useEffect(() => {
    getProviders().then(setProviders);
    // Return to the originally-requested page after login (set by middleware).
    try {
      const cb = new URLSearchParams(window.location.search).get("callbackUrl");
      if (cb) setCallbackUrl(cb);
    } catch {
      /* ignore */
    }
  }, []);

  const hasEntra = !!providers?.["microsoft-entra-id"];
  // Dev panel only when the dev provider exists AND the env flag is on.
  const showDev = !!providers?.["dev"] && DEV_ALLOWED;

  return (
    <div className="phone-stage">
      <div className="phone">
        <div className="screen items-center justify-center p-8 gap-3 text-center">
          <div className="w-16 h-16 rounded-2xl grid place-items-center text-white font-extrabold text-2xl bg-gradient-to-br from-[#1480d4] to-[#0A74DA]">
            5S
          </div>
          <div className="text-[24px] font-bold mt-2">5S Daily</div>
          <p className="text-ink-muted -mt-1">Đăng nhập để chụp &amp; theo dõi 5S</p>

          <div className="w-full mt-6 flex flex-col gap-3">
            {hasEntra && (
              <button
                className="btn btn-primary btn-lg btn-block"
                onClick={() => signIn("microsoft-entra-id", { callbackUrl })}
              >
                <span>🪟</span> Đăng nhập với Microsoft 365
              </button>
            )}

            {showDev && (
              <div className="card-flat p-4 text-left">
                <div className="flex items-center justify-between mb-2">
                  <span className="text-[13px] font-semibold text-ink-muted">
                    {hasEntra ? "Hoặc đăng nhập thử (dev)" : "Đăng nhập thử (dev)"}
                  </span>
                  <span className="text-[11px] font-bold px-2 h-5 rounded-pill grid place-items-center bg-warning-bg text-warning">
                    Dev login enabled
                  </span>
                </div>
                <label className="text-[13px] font-semibold">Email</label>
                <input
                  className="w-full mt-1 mb-3 rounded-md border border-line-strong px-3 py-2.5 text-[15px]"
                  value={email}
                  onChange={(e) => setEmail(e.target.value)}
                />
                <label className="text-[13px] font-semibold">Vai trò</label>
                <select
                  className="w-full mt-1 mb-4 rounded-md border border-line-strong px-3 py-2.5 text-[15px] bg-white"
                  value={role}
                  onChange={(e) => setRole(e.target.value)}
                >
                  <option value="employee">Nhân viên (Employee)</option>
                  <option value="environment">Ban Môi trường (Environment)</option>
                  <option value="admin">Quản trị (Admin)</option>
                </select>
                <button
                  className="btn btn-secondary btn-block"
                  onClick={() => signIn("dev", { email, role, callbackUrl })}
                >
                  Đăng nhập (dev)
                </button>
              </div>
            )}

            {!providers && <div className="text-ink-muted text-sm">Đang tải…</div>}
            {providers && !hasEntra && !showDev && (
              <div className="text-ink-muted text-sm">
                Chưa cấu hình đăng nhập. Liên hệ quản trị viên.
              </div>
            )}
          </div>

          <p className="text-[12px] text-ink-disabled mt-6">5S Daily · Bia Hạ Long</p>
        </div>
      </div>
    </div>
  );
}

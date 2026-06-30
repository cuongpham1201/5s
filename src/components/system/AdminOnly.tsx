"use client";

import { useEffect, useState } from "react";
import { useRouter } from "next/navigation";

/**
 * Client gate for admin-only pages (e.g. /debug/*). Checks /api/admin/whoami and
 * redirects non-admins to /dashboard. (Server APIs they call are also guarded.)
 */
export function AdminOnly({ children }: { children: React.ReactNode }) {
  const router = useRouter();
  const [state, setState] = useState<"loading" | "ok" | "deny">("loading");

  useEffect(() => {
    let active = true;
    fetch("/api/admin/whoami")
      .then((r) => (r.ok ? r.json() : null))
      .then((w) => {
        if (!active) return;
        if (w?.isAdmin) setState("ok");
        else { setState("deny"); router.replace("/dashboard"); }
      })
      .catch(() => { if (active) { setState("deny"); router.replace("/dashboard"); } });
    return () => { active = false; };
  }, [router]);

  if (state !== "ok") {
    return <div className="min-h-[60dvh] grid place-items-center text-ink-muted text-[14px]">Đang kiểm tra quyền…</div>;
  }
  return <>{children}</>;
}

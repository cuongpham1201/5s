import Link from "next/link";
import { redirect } from "next/navigation";
import { auth } from "@/auth";
import { isAdmin } from "@/lib/auth/admin";

/**
 * Admin-space guard (covers /admin and all /admin/*).
 * - Not logged in -> /signin (middleware also enforces this).
 * - dev (NODE_ENV !== production) -> allowed (local tooling convenience).
 * - production: requires isAdmin(email), else a 403 page.
 */
export default async function AdminLayout({ children }: { children: React.ReactNode }) {
  if (process.env.NODE_ENV !== "production") return <>{children}</>;

  const session = await auth();
  if (!session?.user) redirect("/signin?callbackUrl=/admin");

  if (!(await isAdmin(session.user.email))) {
    return (
      <div className="min-h-screen grid place-items-center bg-surface-app p-6">
        <div className="bg-white rounded-lg border border-line shadow-e2 max-w-md w-full p-8 text-center">
          <div className="w-14 h-14 rounded-full grid place-items-center mx-auto mb-4 bg-danger-bg text-danger text-2xl">⛔</div>
          <div className="text-[18px] font-bold mb-1">Bạn không có quyền quản trị 5S.</div>
          <div className="text-[13px] text-ink-muted mb-5">
            Tài khoản {session.user.email} chưa được cấp quyền quản trị. Liên hệ quản trị viên hệ thống.
          </div>
          <Link href="/" className="btn btn-primary btn-block">Về trang chủ</Link>
        </div>
      </div>
    );
  }

  return <>{children}</>;
}

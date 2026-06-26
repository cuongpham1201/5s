import { redirect } from "next/navigation";
import { auth } from "@/auth";

export const dynamic = "force-dynamic";

/**
 * Root route is a router only — no independent UI.
 *  - not logged in → /signin
 *  - logged in     → /dashboard (the single home for all users)
 */
export default async function RootPage() {
  const session = await auth();
  redirect(session?.user ? "/dashboard" : "/signin");
}

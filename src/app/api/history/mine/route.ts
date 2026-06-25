import { NextResponse } from "next/server";
import { auth } from "@/auth";
import { getUserSubmissionHistory } from "@/lib/sharepoint/report-service";

export const dynamic = "force-dynamic";

/** GET /api/history/mine — current user's submissions from Data_Submissions. */
export async function GET() {
  const session = await auth();
  const email = session?.user?.email;
  if (!email) return NextResponse.json({ error: "unauthorized" }, { status: 401 });
  try {
    const submissions = await getUserSubmissionHistory(email);
    return NextResponse.json({ count: submissions.length, submissions });
  } catch (e) {
    return NextResponse.json({ count: 0, submissions: [], error: (e as Error).message }, { status: 200 });
  }
}

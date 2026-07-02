import { NextResponse, type NextRequest } from "next/server";

export const dynamic = "force-dynamic";

/**
 * POST /api/log/client — evidence sink for the upload-pipeline investigation.
 * The failing iPhone requests never reach the origin, so ONLY the device holds
 * the failure evidence (client ring buffer). This route prints that batch to
 * stdout as [5S_CLIENTLOG] so it lands in pm2 logs next to [5S_UPLOAD].
 *
 * Deliberately PUBLIC (a dead session must still be able to ship evidence) but
 * hard-capped: 64KB body, 150 events, strings truncated. Prints only; stores
 * nothing. Remove or gate after the investigation closes.
 */
const MAX_BODY = 64_000;
const MAX_EVENTS = 150;

export async function POST(req: NextRequest) {
  let text: string;
  try {
    text = await req.text();
  } catch {
    return NextResponse.json({ ok: false }, { status: 400 });
  }
  if (!text || text.length > MAX_BODY) return NextResponse.json({ ok: false }, { status: 413 });

  try {
    const payload = JSON.parse(text) as { reason?: string; ctx?: Record<string, unknown>; events?: unknown[] };
    const events = Array.isArray(payload.events) ? payload.events.slice(-MAX_EVENTS) : [];
    console.log(`[5S_CLIENTLOG] batch ${JSON.stringify({
      reason: String(payload.reason ?? "-").slice(0, 60),
      ip: req.headers.get("x-forwarded-for")?.split(",")[0]?.trim() ?? null,
      ctx: payload.ctx ?? {},
      count: events.length,
    })}`);
    for (const ev of events) {
      console.log(`[5S_CLIENTLOG] ev ${JSON.stringify(ev).slice(0, 600)}`);
    }
  } catch {
    console.log(`[5S_CLIENTLOG] unparseable batch len=${text.length}`);
  }
  return NextResponse.json({ ok: true });
}

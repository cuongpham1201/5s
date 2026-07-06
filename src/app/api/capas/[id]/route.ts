import { NextResponse, type NextRequest } from "next/server";
import { auth } from "@/auth";
import { resolveRequestUser } from "@/lib/auth/request-department";
import { isAdmin } from "@/lib/auth/admin";
import {
  getCapa, assignCapa, updateCapaWork, submitCapa, approveCapa, rejectCapa,
} from "@/lib/sharepoint/capa-service";

export const dynamic = "force-dynamic";

async function context(req: NextRequest) {
  const me = await resolveRequestUser(req);
  if (!me?.email) return null;
  const email = me.email; // narrowed string
  const session = await auth();
  const verifier = (await isAdmin(email)) || session?.user?.role === "environment";
  return { me, email, verifier, name: me.displayName ?? email };
}

/** GET /api/capas/[id] — chi tiết (assignee, cùng phòng ban, hoặc verifier). */
export async function GET(req: NextRequest, { params }: { params: { id: string } }) {
  const c = await context(req);
  if (!c) return NextResponse.json({ error: "unauthorized" }, { status: 401 });
  const capa = await getCapa(params.id);
  if (!capa) return NextResponse.json({ error: "not found" }, { status: 404 });
  const canView = c.verifier || capa.assigneeEmail === c.email || capa.departmentCode === c.me.departmentCode;
  if (!canView) return NextResponse.json({ error: "forbidden" }, { status: 403 });
  return NextResponse.json({ capa, isVerifier: c.verifier, isAssignee: capa.assigneeEmail === c.email });
}

/**
 * PATCH /api/capas/[id] — action-based transitions (port state machine audit-app):
 *   {action:"assign", assigneeEmail, assigneeName, dueDate?}   verifier only
 *   {action:"update", rootCause?, preventiveAction?, completionEvidence?, evidencePhotoPaths?}  assignee
 *   {action:"submit"}    assignee — yêu cầu rootCause + ≥1 ảnh bằng chứng
 *   {action:"approve"}   verifier (không phải chính assignee)
 *   {action:"reject", note}  verifier
 */
export async function PATCH(req: NextRequest, { params }: { params: { id: string } }) {
  const c = await context(req);
  if (!c) return NextResponse.json({ error: "unauthorized" }, { status: 401 });
  const capa = await getCapa(params.id);
  if (!capa) return NextResponse.json({ error: "not found" }, { status: 404 });
  let body: Record<string, unknown>;
  try { body = await req.json(); } catch { return NextResponse.json({ error: "invalid body" }, { status: 400 }); }
  const action = String(body.action ?? "");
  const isAssignee = capa.assigneeEmail === c.email;

  try {
    if (action === "assign") {
      if (!c.verifier) return NextResponse.json({ error: "Chỉ quản trị/Ban SHE được giao việc." }, { status: 403 });
      const email = String(body.assigneeEmail ?? "").trim().toLowerCase();
      if (!email) return NextResponse.json({ error: "Thiếu email người xử lý." }, { status: 400 });
      await assignCapa(params.id, email, String(body.assigneeName ?? email), (body.dueDate as string) || null, c.email);
    } else if (action === "update") {
      if (!isAssignee && !c.verifier) return NextResponse.json({ error: "Chỉ người được giao được cập nhật." }, { status: 403 });
      if (capa.status === "closed") return NextResponse.json({ error: "CAPA đã đóng." }, { status: 400 });
      await updateCapaWork(params.id, {
        rootCause: body.rootCause as string | undefined,
        preventiveAction: body.preventiveAction as string | undefined,
        completionEvidence: body.completionEvidence as string | undefined,
        evidencePhotoPaths: Array.isArray(body.evidencePhotoPaths) ? (body.evidencePhotoPaths as string[]) : undefined,
      }, capa.status === "open");
    } else if (action === "submit") {
      if (!isAssignee) return NextResponse.json({ error: "Chỉ người được giao được nộp." }, { status: 403 });
      const fresh = await getCapa(params.id);
      if (!fresh?.rootCause?.trim()) return NextResponse.json({ error: "Cần nhập Nguyên nhân gốc trước khi nộp." }, { status: 400 });
      if ((fresh.evidencePhotoPaths?.length ?? 0) < 1) return NextResponse.json({ error: "Cần ít nhất 1 ảnh bằng chứng khắc phục." }, { status: 400 });
      await submitCapa(params.id, c.email);
    } else if (action === "approve") {
      if (!c.verifier) return NextResponse.json({ error: "Chỉ quản trị/Ban SHE được duyệt." }, { status: 403 });
      if (isAssignee) return NextResponse.json({ error: "Không tự duyệt việc của chính mình." }, { status: 403 });
      if (capa.status !== "pending_verification") return NextResponse.json({ error: "CAPA chưa ở trạng thái chờ xác minh." }, { status: 400 });
      await approveCapa(params.id, c.email);
    } else if (action === "reject") {
      if (!c.verifier) return NextResponse.json({ error: "Chỉ quản trị/Ban SHE được từ chối." }, { status: 403 });
      if (capa.status !== "pending_verification") return NextResponse.json({ error: "CAPA chưa ở trạng thái chờ xác minh." }, { status: 400 });
      await rejectCapa(params.id, String(body.note ?? "").slice(0, 250) || "Không đạt", c.name);
    } else {
      return NextResponse.json({ error: "action không hợp lệ" }, { status: 400 });
    }
    return NextResponse.json({ ok: true, capa: await getCapa(params.id) });
  } catch (e) {
    return NextResponse.json({ ok: false, error: (e as Error).message }, { status: 400 });
  }
}

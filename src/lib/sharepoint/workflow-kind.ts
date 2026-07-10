/**
 * Server-authoritative workflow classification for a submission (daily | audit).
 *
 * Rule (does NOT trust client submissionType as sole source — payload is spoofable):
 *  1) If the submission references check items configured in Config_CheckItems:
 *       - any item WorkflowKind='audit' → AUDIT
 *       - otherwise (daily/blank items present) → DAILY   (a daily hạng mục can't
 *         be spoofed into audit)
 *  2) No server-known check item (legacy queued items / overview): fall back to the
 *     client hint ('3s'|'audit') ONLY when the user passes canCreateAudit — this is
 *     the transitional/compat path that lets pending iPhone photos retry.
 *  3) Otherwise DAILY.
 */
import { getCheckItemKinds } from "./checkitem-service";

export type WorkflowKind = "daily" | "audit";
export interface WorkflowResolution {
  kind: WorkflowKind;
  source: "config" | "legacy-compat" | "default";
}

export async function resolveWorkflowKind(
  meta: { checkItemCode?: string | null; submissionType?: string | null },
  canAudit: boolean,
): Promise<WorkflowResolution> {
  const codes = String(meta.checkItemCode ?? "").split(",").map((s) => s.trim()).filter(Boolean);
  if (codes.length) {
    const kinds = await getCheckItemKinds(codes);
    if ([...kinds.values()].includes("audit")) return { kind: "audit", source: "config" };
    if (kinds.size > 0) return { kind: "daily", source: "config" };
  }
  const hint = String(meta.submissionType ?? "").toLowerCase();
  if ((hint === "3s" || hint === "audit") && canAudit) return { kind: "audit", source: "legacy-compat" };
  return { kind: "daily", source: "default" };
}

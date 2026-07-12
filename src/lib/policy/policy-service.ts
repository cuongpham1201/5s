/**
 * 5S POLICY ENGINE (P7) — quy tắc vận hành cấu hình được.
 *
 * Kiến trúc: 5S Policy → Daily / Audit / Capture / Notification / Violation.
 * App KHÔNG đọc bảng five_s_policies trực tiếp — mọi module (khi chuyển đổi ở
 * các phase sau) chỉ gọi resolveXxxPolicy(). Quy tắc resolve:
 *   enabled ∧ trong hiệu lực (effective_from/to, giờ VN) → priority cao nhất
 *   (hòa → id mới nhất) → merge config lên DEFAULTS.
 * FALLBACK: chưa có policy / resolver lỗi → trả DEFAULTS = ĐÚNG hành vi hiện
 * tại (đã audit từng giá trị) → deploy không làm thay đổi production.
 * P7 CHƯA nối consumer nào — Daily/Audit vẫn chạy hardcode như cũ.
 */
import { createHash } from "node:crypto";
import { appPool } from "../db/pg";

export type PolicyType = "capture" | "daily" | "audit" | "violation" | "notification";

/* ── DEFAULTS = hành vi hiện tại (nguồn: audit code P7) ─────────────────────── */
export interface CapturePolicy {
  min_photos: number;            // 1  (NO_PHOTOS khi 0 ảnh — sync/photo-intake)
  max_photos: number;            // 20 (MAX_PHOTOS)
  duplicate_interval_minutes: number; // 0 = không chặn trùng
  working_time_only: boolean;    // false — chụp giờ nào cũng được
  allow_offline: boolean;        // true — queue offline sẵn có
  gps_required: boolean;         // false — "Không lấy được GPS (vẫn nộp được)"
  wifi_required: boolean;        // false
  watermark_required: boolean;   // true — luôn đóng watermark
  ai_quality_required: boolean;  // false — chưa có AI check
  area_required: boolean;        // true — thiếu areaCode bị chặn
  department_required: boolean;  // true — daily bắt buộc resolve phòng ban
}
export interface DailyPolicy {
  captures_per_area_per_day: number; // 1 — distinct (phòng, khu)/ngày
  reset_hour: number;                // 0 — reset 00:00
  reset_timezone: string;            // Asia/Ho_Chi_Minh (vnDateKey)
  weekend_required: boolean;         // true — chưa có ngoại lệ cuối tuần
  skip_holidays: boolean;            // false — chưa có danh sách ngày lễ
  holiday_dates: string[];           // [] — YYYY-MM-DD
  count_overtime: boolean;           // true — ảnh ngoài giờ vẫn tính
}
export interface AuditPolicy {
  auditable_departments: string[];   // [] = mọi phòng đều có thể bị audit
  auditor_roles: string[];           // [] = mọi user đăng nhập (canCreateAudit)
  allow_cross_department: boolean;   // true — audit chéo (đã có từ fix ccf9e87)
  allow_self_department: boolean;    // true — audit nội bộ
  min_photos: number;                // 1
  auto_create_capa: boolean;         // true — createCapaFromViolation
  capa_sla_days: number;             // 7 — DUE_DAYS_DEFAULT
}
export interface ViolationLevelRule { deadline_days: number; escalate_after_days: number; auto_remind: boolean }
export interface ViolationPolicy {
  levels: Record<"S1" | "S2" | "S3" | "S4" | "S5", ViolationLevelRule>; // hiện chưa enforce → 7/0/false
  escalation_enabled: boolean;       // false — chưa có escalation
  auto_remind_enabled: boolean;      // false — chưa có reminder
}
export interface NotificationChannelRule { teams: boolean; email: boolean; push: boolean; web: boolean }
export interface NotificationPolicy {
  daily: NotificationChannelRule;    // tất cả false — chưa có kênh nào (audit P·HRM)
  audit: NotificationChannelRule;
  violation: NotificationChannelRule;
  capa: NotificationChannelRule;
}

const OFF: NotificationChannelRule = { teams: false, email: false, push: false, web: false };
const LEVEL_DEFAULT: ViolationLevelRule = { deadline_days: 7, escalate_after_days: 0, auto_remind: false };

export const POLICY_DEFAULTS: {
  capture: CapturePolicy; daily: DailyPolicy; audit: AuditPolicy;
  violation: ViolationPolicy; notification: NotificationPolicy;
} = {
  capture: {
    min_photos: 1, max_photos: 20, duplicate_interval_minutes: 0,
    working_time_only: false, allow_offline: true, gps_required: false,
    wifi_required: false, watermark_required: true, ai_quality_required: false,
    area_required: true, department_required: true,
  },
  daily: {
    captures_per_area_per_day: 1, reset_hour: 0, reset_timezone: "Asia/Ho_Chi_Minh",
    weekend_required: true, skip_holidays: false, holiday_dates: [], count_overtime: true,
  },
  audit: {
    auditable_departments: [], auditor_roles: [], allow_cross_department: true,
    allow_self_department: true, min_photos: 1, auto_create_capa: true, capa_sla_days: 7,
  },
  violation: {
    levels: { S1: { ...LEVEL_DEFAULT }, S2: { ...LEVEL_DEFAULT }, S3: { ...LEVEL_DEFAULT }, S4: { ...LEVEL_DEFAULT }, S5: { ...LEVEL_DEFAULT } },
    escalation_enabled: false, auto_remind_enabled: false,
  },
  notification: { daily: { ...OFF }, audit: { ...OFF }, violation: { ...OFF }, capa: { ...OFF } },
};

/* ── rows ────────────────────────────────────────────────────────────────────── */
export interface PolicyRow {
  id: number;
  policyType: PolicyType;
  policyName: string;
  description: string | null;
  effectiveFrom: string | null;
  effectiveTo: string | null;
  priority: number;
  enabled: boolean;
  config: Record<string, unknown>;
  createdBy: string | null;
  updatedBy: string | null;
  createdAt: string;
  updatedAt: string;
}

const dateStr = (v: unknown): string | null => (v == null ? null : String(v).slice(0, 10));
// eslint muốn tránh any — dùng Record
function mapRow(r: Record<string, unknown>): PolicyRow {
  return {
    id: Number(r.id), policyType: r.policy_type as PolicyType, policyName: String(r.policy_name),
    description: (r.description as string) ?? null,
    effectiveFrom: dateStr(r.effective_from), effectiveTo: dateStr(r.effective_to),
    priority: Number(r.priority ?? 0), enabled: !!r.enabled,
    config: (r.config as Record<string, unknown>) ?? {},
    createdBy: (r.created_by as string) ?? null, updatedBy: (r.updated_by as string) ?? null,
    createdAt: String(r.created_at), updatedAt: String(r.updated_at),
  };
}

export function configHash(config: unknown): string {
  return createHash("sha256").update(JSON.stringify(config ?? {})).digest("hex").slice(0, 16);
}

/** Ngày hiện tại theo giờ VN (đồng bộ vnDateKey). */
function vnToday(): string {
  return new Intl.DateTimeFormat("en-CA", { timeZone: "Asia/Ho_Chi_Minh", year: "numeric", month: "2-digit", day: "2-digit" }).format(new Date());
}

/* ── RESOLVER (cache 60s; lỗi → DEFAULTS, KHÔNG bao giờ ném ra ngoài) ───────── */
const cache = new Map<PolicyType, { at: number; policy: PolicyRow | null }>();
const CACHE_MS = 60_000;
export function clearPolicyCache(): void { cache.clear(); }

async function activePolicy(type: PolicyType): Promise<PolicyRow | null> {
  const hit = cache.get(type);
  if (hit && Date.now() - hit.at < CACHE_MS) return hit.policy;
  try {
    const today = vnToday();
    const r = await appPool().query(
      `SELECT * FROM five_s_policies
       WHERE policy_type=$1 AND enabled=TRUE
         AND (effective_from IS NULL OR effective_from <= $2::date)
         AND (effective_to   IS NULL OR effective_to   >= $2::date)
       ORDER BY priority DESC, id DESC LIMIT 1`, [type, today]);
    const policy = r.rows[0] ? mapRow(r.rows[0]) : null;
    cache.set(type, { at: Date.now(), policy });
    return policy;
  } catch {
    cache.set(type, { at: Date.now(), policy: null }); // DB lỗi → fallback defaults
    return null;
  }
}

/** Merge NÔNG từng key top-level (config chỉ chứa key override). */
function merge<T extends object>(defaults: T, override: Record<string, unknown> | null | undefined): T {
  const out = { ...defaults } as Record<string, unknown>;
  for (const [k, v] of Object.entries(override ?? {})) {
    if (!(k in defaults)) continue; // key lạ bị bỏ qua — không cho policy chèn field bừa
    out[k] = v;
  }
  return out as T;
}

export interface ResolvedPolicy<T> {
  policy: T;
  source: "defaults" | "policy";
  policyId: number | null;
  policyName: string | null;
}

async function resolve<T extends object>(type: PolicyType, defaults: T): Promise<ResolvedPolicy<T>> {
  const row = await activePolicy(type);
  if (!row) return { policy: { ...defaults }, source: "defaults", policyId: null, policyName: null };
  return { policy: merge(defaults, row.config), source: "policy", policyId: row.id, policyName: row.policyName };
}

export const resolveCapturePolicy = () => resolve<CapturePolicy>("capture", POLICY_DEFAULTS.capture);
export const resolveDailyPolicy = () => resolve<DailyPolicy>("daily", POLICY_DEFAULTS.daily);
export const resolveAuditPolicy = () => resolve<AuditPolicy>("audit", POLICY_DEFAULTS.audit);
export const resolveViolationPolicy = () => resolve<ViolationPolicy>("violation", POLICY_DEFAULTS.violation);
export const resolveNotificationPolicy = () => resolve<NotificationPolicy>("notification", POLICY_DEFAULTS.notification);

/* ── audit history (cơ chế versioning P6: old/new JSON + hash) ──────────────── */
async function plog(policyId: number, action: string, oldVal: unknown, newVal: unknown, actor: string | null): Promise<void> {
  await appPool().query(
    `INSERT INTO five_s_policy_changes(policy_id, action, old_value_json, new_value_json, config_hash, actor_email)
     VALUES ($1,$2,$3,$4,$5,$6)`,
    [policyId, action, oldVal ? JSON.stringify(oldVal) : null, newVal ? JSON.stringify(newVal) : null,
     configHash((newVal as { config?: unknown })?.config ?? null), actor]);
}

/* ── ADMIN CRUD ─────────────────────────────────────────────────────────────── */
const TYPES: PolicyType[] = ["capture", "daily", "audit", "violation", "notification"];

export async function listPolicies(type?: PolicyType): Promise<PolicyRow[]> {
  const r = type
    ? await appPool().query(`SELECT * FROM five_s_policies WHERE policy_type=$1 ORDER BY policy_type, priority DESC, id`, [type])
    : await appPool().query(`SELECT * FROM five_s_policies ORDER BY policy_type, priority DESC, id`);
  return r.rows.map(mapRow);
}

export async function getPolicy(id: number): Promise<PolicyRow | null> {
  const r = await appPool().query(`SELECT * FROM five_s_policies WHERE id=$1`, [id]);
  return r.rows[0] ? mapRow(r.rows[0]) : null;
}

/** Chỉ giữ key hợp lệ theo defaults của type (chặn field rác từ client). */
export function sanitizeConfig(type: PolicyType, config: unknown): Record<string, unknown> {
  const defaults = POLICY_DEFAULTS[type] as unknown as Record<string, unknown>;
  const out: Record<string, unknown> = {};
  for (const [k, v] of Object.entries((config as Record<string, unknown>) ?? {})) {
    if (k in defaults) out[k] = v;
  }
  return out;
}

export async function createPolicy(input: {
  policyType: PolicyType; policyName: string; description?: string | null;
  effectiveFrom?: string | null; effectiveTo?: string | null;
  priority?: number; enabled?: boolean; config?: unknown;
}, actor: string | null): Promise<PolicyRow> {
  if (!TYPES.includes(input.policyType)) throw new Error("policy_type không hợp lệ.");
  if (!input.policyName?.trim()) throw new Error("Thiếu tên policy.");
  const r = await appPool().query(
    `INSERT INTO five_s_policies
       (policy_type, policy_name, description, effective_from, effective_to, priority, enabled, config, created_by, updated_by)
     VALUES ($1,$2,$3,$4,$5,$6,$7,$8,$9,$9) RETURNING *`,
    [input.policyType, input.policyName.trim(), input.description ?? null,
     input.effectiveFrom ?? null, input.effectiveTo ?? null, input.priority ?? 0,
     input.enabled ?? false, JSON.stringify(sanitizeConfig(input.policyType, input.config)), actor]);
  const row = mapRow(r.rows[0]);
  await plog(row.id, "create", null, row, actor);
  clearPolicyCache();
  return row;
}

export async function updatePolicy(id: number, patch: {
  policyName?: string; description?: string | null;
  effectiveFrom?: string | null; effectiveTo?: string | null;
  priority?: number; config?: unknown;
}, actor: string | null): Promise<PolicyRow> {
  const cur = await getPolicy(id);
  if (!cur) throw new Error("Không tìm thấy policy.");
  const r = await appPool().query(
    `UPDATE five_s_policies SET
       policy_name=COALESCE($2, policy_name), description=COALESCE($3, description),
       effective_from=CASE WHEN $4::boolean THEN $5::date ELSE effective_from END,
       effective_to=CASE WHEN $6::boolean THEN $7::date ELSE effective_to END,
       priority=COALESCE($8, priority),
       config=COALESCE($9::jsonb, config),
       updated_at=now(), updated_by=$10
     WHERE id=$1 RETURNING *`,
    [id, patch.policyName ?? null, patch.description ?? null,
     patch.effectiveFrom !== undefined, patch.effectiveFrom ?? null,
     patch.effectiveTo !== undefined, patch.effectiveTo ?? null,
     patch.priority ?? null,
     patch.config !== undefined ? JSON.stringify(sanitizeConfig(cur.policyType, patch.config)) : null,
     actor]);
  const row = mapRow(r.rows[0]);
  await plog(id, "update", cur, row, actor);
  clearPolicyCache();
  return row;
}

export async function setPolicyEnabled(id: number, enabled: boolean, actor: string | null): Promise<PolicyRow> {
  const cur = await getPolicy(id);
  if (!cur) throw new Error("Không tìm thấy policy.");
  const r = await appPool().query(
    `UPDATE five_s_policies SET enabled=$2, updated_at=now(), updated_by=$3 WHERE id=$1 RETURNING *`,
    [id, enabled, actor]);
  const row = mapRow(r.rows[0]);
  await plog(id, enabled ? "enable" : "disable", { enabled: cur.enabled }, { enabled }, actor);
  clearPolicyCache();
  return row;
}

export async function clonePolicy(id: number, newName: string, actor: string | null): Promise<PolicyRow> {
  const cur = await getPolicy(id);
  if (!cur) throw new Error("Không tìm thấy policy.");
  if (!newName?.trim()) throw new Error("Thiếu tên bản sao.");
  const row = await createPolicy({
    policyType: cur.policyType, policyName: newName.trim(),
    description: cur.description, effectiveFrom: cur.effectiveFrom, effectiveTo: cur.effectiveTo,
    priority: cur.priority, enabled: false, config: cur.config, // clone luôn TẮT
  }, actor);
  await plog(row.id, "clone", { fromPolicyId: id }, row, actor);
  return row;
}

export interface PolicyChangeRow {
  id: number; policyId: number; action: string;
  oldValue: unknown; newValue: unknown; configHash: string | null;
  actorEmail: string | null; createdAt: string;
}

export async function listPolicyHistory(policyId: number, limit = 50): Promise<PolicyChangeRow[]> {
  const r = await appPool().query(
    `SELECT * FROM five_s_policy_changes WHERE policy_id=$1 ORDER BY id DESC LIMIT $2`,
    [policyId, Math.min(Math.max(limit, 1), 200)]);
  return r.rows.map((x) => ({
    id: Number(x.id), policyId: Number(x.policy_id), action: x.action,
    oldValue: x.old_value_json ?? null, newValue: x.new_value_json ?? null,
    configHash: x.config_hash ?? null, actorEmail: x.actor_email ?? null, createdAt: String(x.created_at),
  }));
}

/** Khôi phục config từ một bản ghi history (cơ chế version P6 — update từ bản lưu server-side). */
export async function restorePolicyFromHistory(policyId: number, changeId: number, actor: string | null): Promise<PolicyRow> {
  const h = await appPool().query(`SELECT * FROM five_s_policy_changes WHERE id=$1 AND policy_id=$2`, [changeId, policyId]);
  if (!h.rows[0]) throw new Error("Không tìm thấy bản ghi history.");
  const snap = (h.rows[0].new_value_json ?? h.rows[0].old_value_json) as { config?: unknown } | null;
  if (!snap || snap.config === undefined) throw new Error("Bản ghi history không chứa config để khôi phục.");
  const cur = await getPolicy(policyId);
  if (!cur) throw new Error("Không tìm thấy policy.");
  const r = await appPool().query(
    `UPDATE five_s_policies SET config=$2::jsonb, updated_at=now(), updated_by=$3 WHERE id=$1 RETURNING *`,
    [policyId, JSON.stringify(sanitizeConfig(cur.policyType, snap.config)), actor]);
  const row = mapRow(r.rows[0]);
  await plog(policyId, "restore", cur, row, actor);
  clearPolicyCache();
  return row;
}

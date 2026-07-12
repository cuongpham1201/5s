"use client";

import { useCallback, useEffect, useMemo, useState } from "react";
import { AdminShell } from "@/components/layout/AdminShell";

type PType = "capture" | "daily" | "audit" | "violation" | "notification";
const TYPES: Array<{ k: PType; label: string }> = [
  { k: "capture", label: "Capture" }, { k: "daily", label: "Daily" }, { k: "audit", label: "Audit" },
  { k: "violation", label: "Violation" }, { k: "notification", label: "Notification" },
];
interface Policy {
  id: number; policyType: PType; policyName: string; description: string | null;
  effectiveFrom: string | null; effectiveTo: string | null; priority: number;
  enabled: boolean; config: Record<string, unknown>; updatedBy: string | null; updatedAt: string;
}
interface HistRow { id: number; action: string; oldValue: unknown; newValue: unknown; configHash: string | null; actorEmail: string | null; createdAt: string }

const fmt = (iso?: string | null) => { if (!iso) return "—"; const d = new Date(iso); return Number.isNaN(d.getTime()) ? "—" : d.toLocaleString("vi-VN"); };

async function api(url: string, body?: unknown): Promise<{ ok?: boolean; error?: string } & Record<string, unknown>> {
  const r = await fetch(url, {
    method: body ? "POST" : "GET", cache: "no-store",
    ...(body ? { headers: { "content-type": "application/json" }, body: JSON.stringify(body) } : {}),
  });
  return r.json();
}

/** Editor 1 field config — kiểu suy từ giá trị defaults. */
function FieldEditor({ k, def, value, onChange }: { k: string; def: unknown; value: unknown; onChange: (v: unknown) => void }) {
  const v = value === undefined ? def : value;
  if (typeof def === "boolean") {
    return (
      <label className="flex items-center gap-2 text-[13px] py-1">
        <input type="checkbox" checked={!!v} onChange={(e) => onChange(e.target.checked)} />
        <span className="font-medium">{k}</span>
      </label>
    );
  }
  if (typeof def === "number") {
    return (
      <label className="flex items-center gap-2 text-[13px] py-1">
        <span className="font-medium w-56 truncate" title={k}>{k}</span>
        <input type="number" value={Number(v)} onChange={(e) => onChange(Number(e.target.value))} className="w-28 rounded-md border border-line-strong px-2 py-1" />
      </label>
    );
  }
  if (typeof def === "string") {
    return (
      <label className="flex items-center gap-2 text-[13px] py-1">
        <span className="font-medium w-56 truncate" title={k}>{k}</span>
        <input value={String(v)} onChange={(e) => onChange(e.target.value)} className="flex-1 rounded-md border border-line-strong px-2 py-1" />
      </label>
    );
  }
  // array / object → JSON textarea
  return (
    <label className="block text-[13px] py-1">
      <span className="font-medium">{k} <span className="text-ink-muted">(JSON)</span></span>
      <textarea rows={3} defaultValue={JSON.stringify(v, null, 1)}
        onBlur={(e) => { try { onChange(JSON.parse(e.target.value)); } catch { /* giữ giá trị cũ nếu JSON sai */ } }}
        className="mt-1 w-full rounded-md border border-line-strong px-2 py-1 font-mono text-[11.5px]" />
    </label>
  );
}

export default function AdminPoliciesPage() {
  const [type, setType] = useState<PType>("capture");
  const [policies, setPolicies] = useState<Policy[]>([]);
  const [defaults, setDefaults] = useState<Record<PType, Record<string, unknown>> | null>(null);
  const [resolved, setResolved] = useState<Record<PType, { policy: Record<string, unknown>; source: string; policyName: string | null }> | null>(null);
  const [msg, setMsg] = useState<{ ok: boolean; text: string } | null>(null);
  const [busy, setBusy] = useState(false);
  const flash = (ok: boolean, text: string) => setMsg({ ok, text });

  const load = useCallback(async () => {
    const [p, r] = await Promise.all([api("/api/admin/policies"), api("/api/admin/policies/resolve")]);
    setPolicies((p.policies as Policy[]) ?? []);
    setDefaults((r.defaults as typeof defaults) ?? null);
    setResolved((r.resolved as typeof resolved) ?? null);
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);
  useEffect(() => { void load(); }, [load]);

  const run = async (fn: () => Promise<{ ok?: boolean; error?: string }>, okText = "Đã thực hiện.") => {
    setBusy(true); setMsg(null);
    try {
      const d = await fn();
      if (d.ok === false) flash(false, d.error ?? "Lỗi"); else flash(true, okText);
      await load();
    } catch (e) { flash(false, String(e)); }
    finally { setBusy(false); }
  };

  /* editor state */
  const [editing, setEditing] = useState<Policy | "new" | null>(null);
  const [meta, setMeta] = useState({ policyName: "", description: "", priority: 0, effectiveFrom: "", effectiveTo: "" });
  const [cfg, setCfg] = useState<Record<string, unknown>>({});
  const typeDefaults = useMemo(() => (defaults?.[type] ?? {}) as Record<string, unknown>, [defaults, type]);

  const openNew = () => {
    setEditing("new");
    setMeta({ policyName: "", description: "", priority: 0, effectiveFrom: "", effectiveTo: "" });
    setCfg({});
  };
  const openEdit = (p: Policy) => {
    setEditing(p);
    setMeta({ policyName: p.policyName, description: p.description ?? "", priority: p.priority, effectiveFrom: p.effectiveFrom ?? "", effectiveTo: p.effectiveTo ?? "" });
    setCfg({ ...p.config });
  };
  /** Chỉ gửi key khác defaults (config = override thuần). */
  const overridesOnly = (): Record<string, unknown> => {
    const out: Record<string, unknown> = {};
    for (const [k, def] of Object.entries(typeDefaults)) {
      const v = cfg[k];
      if (v !== undefined && JSON.stringify(v) !== JSON.stringify(def)) out[k] = v;
    }
    return out;
  };
  const save = () => run(async () => {
    const body = {
      policyName: meta.policyName, description: meta.description || null,
      priority: meta.priority, effectiveFrom: meta.effectiveFrom || null, effectiveTo: meta.effectiveTo || null,
      config: overridesOnly(),
    };
    const d = editing === "new"
      ? await api("/api/admin/policies", { ...body, policyType: type })
      : await api(`/api/admin/policies/${(editing as Policy).id}`, { action: "update", ...body });
    if (d.ok !== false) setEditing(null);
    return d;
  }, "Đã lưu policy.");

  /* history modal */
  const [hist, setHist] = useState<{ policy: Policy; rows: HistRow[] } | null>(null);
  const openHist = async (p: Policy) => {
    const d = await api(`/api/admin/policies/${p.id}/history`);
    setHist({ policy: p, rows: (d.history as HistRow[]) ?? [] });
  };
  const restoreHist = (row: HistRow) => {
    if (!hist) return;
    if (!window.confirm(`Khôi phục config của "${hist.policy.policyName}" về bản ghi #${row.id} (${fmt(row.createdAt)})?`)) return;
    void run(async () => {
      const d = await api(`/api/admin/policies/${hist.policy.id}`, { action: "restore_history", changeId: row.id });
      if (d.ok !== false) setHist(null);
      return d;
    }, "Đã khôi phục config từ history.");
  };

  const list = policies.filter((p) => p.policyType === type);
  const res = resolved?.[type];

  return (
    <AdminShell
      title="Chính sách 5S (Policy Engine)"
      subtitle="Quy tắc Daily / Audit / Capture / Violation / Notification — cấu hình thay vì hardcode · chưa policy = hành vi hiện tại"
      actions={<button onClick={openNew} className="btn btn-primary !min-h-10">+ Tạo policy {TYPES.find((t) => t.k === type)?.label}</button>}
    >
      <div className="flex gap-1 border-b border-line mb-4">
        {TYPES.map((t) => (
          <button key={t.k} onClick={() => { setType(t.k); setEditing(null); }}
            className={`px-3.5 py-2 rounded-t-md text-[13.5px] font-semibold border-b-2 ${type === t.k ? "border-primary-600 text-primary-700 bg-white" : "border-transparent text-ink-muted"}`}>
            {t.label}
          </button>
        ))}
      </div>
      {msg && <div className={`text-[13px] mb-3 rounded-md px-3.5 py-2.5 ${msg.ok ? "bg-success-bg text-success" : "bg-danger-bg text-danger"}`}>{msg.text}</div>}

      {/* PREVIEW resolver — giá trị module sẽ nhận */}
      {res && (
        <div className="bg-white rounded-lg border border-line shadow-e2 p-3.5 mb-4">
          <div className="text-[13px] font-semibold mb-1.5">
            Preview resolver ({type}): nguồn = {res.source === "defaults"
              ? <span className="text-ink-muted">DEFAULTS (hành vi hiện tại — chưa có policy hiệu lực)</span>
              : <span className="text-success">policy &quot;{res.policyName}&quot;</span>}
          </div>
          <div className="flex flex-wrap gap-x-4 gap-y-1 text-[12px]">
            {Object.entries(res.policy).map(([k, v]) => {
              const overridden = defaults && JSON.stringify(v) !== JSON.stringify((defaults[type] as Record<string, unknown>)[k]);
              return (
                <span key={k} className={overridden ? "text-primary-700 font-semibold" : "text-ink-muted"}>
                  {k}=<b>{typeof v === "object" ? JSON.stringify(v) : String(v)}</b>
                </span>
              );
            })}
          </div>
        </div>
      )}

      {/* EDITOR */}
      {editing !== null && (
        <div className="bg-white rounded-lg border border-primary-600/40 shadow-e2 p-4 mb-4">
          <div className="text-[14px] font-bold mb-2">{editing === "new" ? `Tạo policy ${type}` : `Sửa "${(editing as Policy).policyName}"`}</div>
          <div className="grid sm:grid-cols-2 gap-2.5 mb-2">
            <input value={meta.policyName} onChange={(e) => setMeta({ ...meta, policyName: e.target.value })} placeholder="Tên policy" className="rounded-md border border-line-strong px-3 py-2 text-[13.5px]" />
            <input value={meta.description} onChange={(e) => setMeta({ ...meta, description: e.target.value })} placeholder="Mô tả" className="rounded-md border border-line-strong px-3 py-2 text-[13.5px]" />
            <label className="text-[13px] flex items-center gap-2">Priority
              <input type="number" value={meta.priority} onChange={(e) => setMeta({ ...meta, priority: Number(e.target.value) })} className="w-24 rounded-md border border-line-strong px-2 py-1.5" />
              <span className="text-ink-muted">(cao hơn thắng)</span>
            </label>
            <div className="text-[13px] flex items-center gap-2">
              Hiệu lực
              <input type="date" value={meta.effectiveFrom} onChange={(e) => setMeta({ ...meta, effectiveFrom: e.target.value })} className="rounded-md border border-line-strong px-2 py-1.5" />
              →
              <input type="date" value={meta.effectiveTo} onChange={(e) => setMeta({ ...meta, effectiveTo: e.target.value })} className="rounded-md border border-line-strong px-2 py-1.5" />
            </div>
          </div>
          <div className="text-[12.5px] text-ink-muted mb-1.5">
            Cấu hình ({Object.keys(typeDefaults).length} tham số — giá trị đang hiển thị = defaults trừ khi bạn đổi; CHỈ phần khác defaults được lưu):
          </div>
          {type === "daily" ? (
            /* P8A — form 4 rule Daily chuyên dụng (spec) */
            <div className="border border-line rounded-md p-3 mb-3 grid sm:grid-cols-2 gap-x-6 gap-y-2">
              <label className="flex items-center gap-2 text-[13px]">
                <span className="font-medium w-56">Số lần chụp mỗi khu / ngày</span>
                <input type="number" min={1} max={20}
                  value={Number(cfg.captures_per_area_per_day ?? typeDefaults.captures_per_area_per_day)}
                  onChange={(e) => setCfg((c) => ({ ...c, captures_per_area_per_day: Math.min(20, Math.max(1, Number(e.target.value) || 1)) }))}
                  className="w-24 rounded-md border border-line-strong px-2 py-1" />
                <span className="text-ink-muted text-[12px]">(1–20)</span>
              </label>
              <label className="flex items-center gap-2 text-[13px]">
                <span className="font-medium w-56">Giờ reset ngày nghiệp vụ</span>
                <input type="time"
                  value={`${String(Number(cfg.reset_hour ?? typeDefaults.reset_hour)).padStart(2, "0")}:${String(Number(cfg.reset_minute ?? typeDefaults.reset_minute ?? 0)).padStart(2, "0")}`}
                  onChange={(e) => { const [h, m] = e.target.value.split(":").map(Number); setCfg((c) => ({ ...c, reset_hour: h || 0, reset_minute: m || 0 })); }}
                  className="rounded-md border border-line-strong px-2 py-1" />
                <span className="text-ink-muted text-[12px]">Asia/Ho_Chi_Minh</span>
              </label>
              <label className="flex items-center gap-2 text-[13px]">
                <input type="checkbox" checked={Boolean(cfg.weekend_required ?? typeDefaults.weekend_required)}
                  onChange={(e) => setCfg((c) => ({ ...c, weekend_required: e.target.checked }))} />
                <span className="font-medium">Cuối tuần vẫn tính nghĩa vụ chụp</span>
              </label>
              <label className="block text-[13px]">
                <span className="font-medium">Ngày nghỉ (mỗi dòng YYYY-MM-DD — ngày này KHÔNG tạo nghĩa vụ)</span>
                <textarea rows={3}
                  defaultValue={((cfg.holiday_dates ?? typeDefaults.holiday_dates ?? []) as string[]).join("\n")}
                  onBlur={(e) => {
                    const lines = e.target.value.split("\n").map((x) => x.trim()).filter(Boolean);
                    const bad = lines.filter((x) => !/^\d{4}-\d{2}-\d{2}$/.test(x));
                    if (bad.length) { flash(false, `Ngày nghỉ không hợp lệ: ${bad.join(", ")}`); return; }
                    setCfg((c) => ({ ...c, holiday_dates: [...new Set(lines)].sort() }));
                  }}
                  className="mt-1 w-full rounded-md border border-line-strong px-2 py-1 font-mono text-[12px]" />
              </label>
            </div>
          ) : (
            <div className="grid sm:grid-cols-2 gap-x-6 border border-line rounded-md p-3 mb-3">
              {Object.entries(typeDefaults).map(([k, def]) => (
                <FieldEditor key={`${type}-${k}-${editing === "new" ? "new" : (editing as Policy).id}`} k={k} def={def} value={cfg[k]}
                  onChange={(v) => setCfg((c) => ({ ...c, [k]: v }))} />
              ))}
            </div>
          )}
          <div className="flex gap-2">
            <button onClick={save} disabled={busy || !meta.policyName.trim()} className="btn btn-primary !min-h-9">Lưu (mặc định TẮT)</button>
            <button onClick={() => setEditing(null)} className="btn btn-secondary !min-h-9">Huỷ</button>
          </div>
        </div>
      )}

      {/* LIST */}
      <div className="bg-white rounded-lg border border-line shadow-e2 overflow-x-auto">
        <table className="w-full text-[13px]">
          <thead className="text-ink-muted text-left"><tr className="border-b border-line">
            <th className="px-3 py-2">Tên</th><th className="px-3 py-2">Priority</th><th className="px-3 py-2">Hiệu lực</th>
            <th className="px-3 py-2">Override</th><th className="px-3 py-2">Trạng thái</th><th className="px-3 py-2">Cập nhật</th><th className="px-3 py-2">Thao tác</th>
          </tr></thead>
          <tbody>
            {list.map((p) => (
              <tr key={p.id} className={`border-b border-line last:border-0 ${!p.enabled ? "opacity-60" : ""}`}>
                <td className="px-3 py-2 font-semibold">{p.policyName}{p.description && <div className="text-[11.5px] text-ink-muted font-normal">{p.description}</div>}</td>
                <td className="px-3 py-2">{p.priority}</td>
                <td className="px-3 py-2 text-[12px]">{p.effectiveFrom ?? "…"} → {p.effectiveTo ?? "…"}</td>
                <td className="px-3 py-2 text-[12px]">{Object.keys(p.config).length ? Object.keys(p.config).join(", ") : <span className="text-ink-muted">= defaults</span>}</td>
                <td className="px-3 py-2">
                  <span className={`px-2 py-0.5 rounded-pill text-[11px] font-bold ${p.enabled ? "bg-success-bg text-success" : "bg-surface text-ink-muted"}`}>{p.enabled ? "BẬT" : "tắt"}</span>
                </td>
                <td className="px-3 py-2 text-[11.5px] text-ink-muted">{fmt(p.updatedAt)}<br />{p.updatedBy ?? ""}</td>
                <td className="px-3 py-2">
                  <div className="flex flex-wrap gap-x-2 gap-y-1 text-[12px] font-semibold">
                    {p.enabled
                      ? <button onClick={() => run(() => api(`/api/admin/policies/${p.id}`, { action: "disable" }), "Đã tắt.")} className="text-warning">Tắt</button>
                      : <button onClick={() => { if (window.confirm(`BẬT policy "${p.policyName}"? Resolver sẽ áp dụng ngay (cache ≤60s).`)) void run(() => api(`/api/admin/policies/${p.id}`, { action: "enable" }), "Đã bật."); }} className="text-success">Bật</button>}
                    <button onClick={() => openEdit(p)} className="text-primary-600">Sửa</button>
                    <button onClick={() => { const n = window.prompt("Tên bản sao:", `${p.policyName} (copy)`); if (n) void run(() => api(`/api/admin/policies/${p.id}`, { action: "clone", newName: n }), "Đã clone (tắt)."); }} className="text-primary-600">Clone</button>
                    <button onClick={() => openHist(p)} className="text-ink-muted">Version</button>
                  </div>
                </td>
              </tr>
            ))}
            {list.length === 0 && <tr><td colSpan={7} className="px-3 py-6 text-center text-ink-muted">Chưa có policy {type} — hệ thống dùng DEFAULTS (hành vi hiện tại).</td></tr>}
          </tbody>
        </table>
      </div>

      {/* HISTORY / VERSION */}
      {hist && (
        <div className="bg-white rounded-lg border border-line shadow-e2 p-4 mt-4">
          <div className="flex items-center gap-2 mb-2">
            <span className="text-[14px] font-bold flex-1">Version history — {hist.policy.policyName}</span>
            <button onClick={() => setHist(null)} className="text-[12.5px] text-ink-muted">✕ đóng</button>
          </div>
          <table className="w-full text-[12.5px]">
            <thead className="text-ink-muted text-left"><tr className="border-b border-line">
              <th className="px-2 py-1.5">#</th><th className="px-2 py-1.5">Thời gian</th><th className="px-2 py-1.5">Action</th>
              <th className="px-2 py-1.5">Actor</th><th className="px-2 py-1.5">Hash</th><th className="px-2 py-1.5">Chi tiết</th><th className="px-2 py-1.5"></th>
            </tr></thead>
            <tbody>
              {hist.rows.map((r) => (
                <tr key={r.id} className="border-b border-line last:border-0 align-top">
                  <td className="px-2 py-1.5">{r.id}</td>
                  <td className="px-2 py-1.5 whitespace-nowrap">{fmt(r.createdAt)}</td>
                  <td className="px-2 py-1.5 font-semibold">{r.action}</td>
                  <td className="px-2 py-1.5">{r.actorEmail ?? "—"}</td>
                  <td className="px-2 py-1.5 font-mono text-[10.5px]">{r.configHash ?? "—"}</td>
                  <td className="px-2 py-1.5">
                    <details><summary className="cursor-pointer text-primary-600">JSON</summary>
                      <pre className="text-[10px] bg-surface rounded p-1.5 mt-1 max-w-[420px] overflow-x-auto">{JSON.stringify({ old: r.oldValue, new: r.newValue }, null, 1)}</pre>
                    </details>
                  </td>
                  <td className="px-2 py-1.5">
                    <button onClick={() => restoreHist(r)} className="text-[12px] font-semibold text-warning">Khôi phục config</button>
                  </td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      )}
    </AdminShell>
  );
}

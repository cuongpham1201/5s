"use client";

import { useCallback, useEffect, useState } from "react";
import { AdminShell } from "@/components/layout/AdminShell";

type Tab = "employees" | "all" | "unmapped" | "local" | "microsoft" | "disabled" | "needs_review";
const TABS: { key: Tab; label: string }[] = [
  { key: "employees", label: "HRM Employees" },
  { key: "all", label: "App Users" },
  { key: "unmapped", label: "Unmapped" },
  { key: "local", label: "Local Accounts" },
  { key: "microsoft", label: "Microsoft Accounts" },
  { key: "disabled", label: "Disabled" },
  { key: "needs_review", label: "Needs Review" },
];

interface Row {
  id: number;
  // employee fields
  employee_code?: string; full_name?: string; job_title?: string | null;
  work_email?: string | null; email?: string | null; employment_status?: string;
  dept_code?: string | null; dept_name?: string | null; account_count?: number;
  // app_user fields
  login_type?: string; username?: string | null; display_name?: string; role?: string;
  is_active?: boolean; disabled_reason?: string | null; has_microsoft?: boolean;
  employee_id?: number | null; employee_name?: string | null; last_login_at?: string | null;
}

function fmt(iso: string | null | undefined): string {
  if (!iso) return "—";
  const d = new Date(iso);
  return Number.isNaN(d.getTime()) ? "—" : d.toLocaleString("vi-VN");
}

export default function IdentityAdminPage() {
  const [tab, setTab] = useState<Tab>("employees");
  const [q, setQ] = useState("");
  const [rows, setRows] = useState<Row[]>([]);
  const [loading, setLoading] = useState(true);
  const [msg, setMsg] = useState<{ ok: boolean; text: string } | null>(null);
  const [createFor, setCreateFor] = useState<Row | null>(null);
  const [form, setForm] = useState({ username: "", password: "", displayName: "", role: "employee" });

  const load = useCallback(async (t: Tab, query: string) => {
    setLoading(true);
    try {
      const url = t === "employees"
        ? `/api/admin/identity/employees?q=${encodeURIComponent(query)}`
        : `/api/admin/identity/users?view=${t}&q=${encodeURIComponent(query)}`;
      const d = await fetch(url, { cache: "no-store" }).then((r) => (r.ok ? r.json() : null));
      setRows(t === "employees" ? (d?.employees ?? []) : (d?.users ?? []));
    } finally {
      setLoading(false);
    }
  }, []);

  // q is applied via the search button, not on every keystroke.
  // eslint-disable-next-line react-hooks/exhaustive-deps
  useEffect(() => { void load(tab, q); }, [tab, load]);

  const act = async (id: number, body: Record<string, unknown>) => {
    setMsg(null);
    const r = await fetch(`/api/admin/identity/users/${id}`, {
      method: "POST", headers: { "content-type": "application/json" }, body: JSON.stringify(body),
    });
    const d = await r.json();
    if (!r.ok || !d.ok) { setMsg({ ok: false, text: d?.error ?? "Thao tác lỗi." }); return; }
    setMsg({ ok: true, text: "Đã cập nhật." });
    await load(tab, q);
  };

  const openCreate = (emp: Row | null) => {
    setCreateFor(emp);
    setForm({
      username: emp?.employee_code ? String(emp.employee_code).toLowerCase() : "",
      password: "", displayName: emp?.full_name ?? "", role: "employee",
    });
  };
  const submitCreate = async () => {
    setMsg(null);
    const r = await fetch(`/api/admin/identity/users`, {
      method: "POST", headers: { "content-type": "application/json" },
      body: JSON.stringify({ ...form, employeeId: createFor?.id ?? null }),
    });
    const d = await r.json();
    if (!r.ok || !d.ok) { setMsg({ ok: false, text: d?.error ?? "Không tạo được." }); return; }
    setMsg({ ok: true, text: `Đã tạo tài khoản local #${d.id}.` });
    setCreateFor(null);
    await load(tab, q);
  };

  // row actions (prompt-based — internal admin tool, gọn)
  const disable = (r: Row) => { const reason = window.prompt("Lý do khóa:", "manual"); if (reason !== null) void act(r.id, { action: "disable", reason }); };
  const enable = (r: Row) => act(r.id, { action: "enable" });
  const resetPw = (r: Row) => { const pw = window.prompt(`Mật khẩu mới cho ${r.username ?? r.display_name}:`); if (pw) void act(r.id, { action: "reset_password", password: pw }); };
  const unmap = (r: Row) => act(r.id, { action: "unmap" });
  const mapEmp = (r: Row) => { const code = window.prompt("Nhập employee_code để gán:"); if (code) void mapByCode(r.id, code.trim()); };
  const unlinkMs = (r: Row) => act(r.id, { action: "unlink_microsoft" });
  const linkMs = (r: Row) => { const oid = window.prompt("Microsoft object id:"); if (oid) void act(r.id, { action: "link_microsoft", oid: oid.trim() }); };

  const mapByCode = async (id: number, code: string) => {
    const emps = await fetch(`/api/admin/identity/employees?q=${encodeURIComponent(code)}`, { cache: "no-store" }).then((r) => (r.ok ? r.json() : null));
    const emp = (emps?.employees ?? []).find((e: Row) => String(e.employee_code).toLowerCase() === code.toLowerCase());
    if (!emp) { setMsg({ ok: false, text: `Không thấy nhân viên ${code}.` }); return; }
    await act(id, { action: "map", employeeId: emp.id });
  };

  const isEmp = tab === "employees";

  return (
    <AdminShell
      title="Identity Center"
      subtitle="app_users là trung tâm — nhân viên HRM, tài khoản app, mapping, local/Microsoft"
      actions={<button onClick={() => openCreate(null)} className="btn btn-primary !min-h-10">+ Tài khoản local</button>}
    >
      <div className="flex flex-wrap gap-1.5 mb-4">
        {TABS.map((t) => (
          <button key={t.key} onClick={() => { setTab(t.key); }}
            className={`px-3 py-1.5 rounded-pill text-[13px] font-semibold border ${tab === t.key ? "bg-primary-600 text-white border-primary-600" : "bg-white border-line"}`}>
            {t.label}
          </button>
        ))}
      </div>

      <div className="flex gap-2 mb-3">
        <input value={q} onChange={(e) => setQ(e.target.value)} onKeyDown={(e) => { if (e.key === "Enter") void load(tab, q); }}
          placeholder="Tìm theo tên / mã / email…" className="flex-1 rounded-md border border-line-strong px-3 py-2 text-[14px]" />
        <button onClick={() => load(tab, q)} className="btn btn-secondary !min-h-10">Tìm</button>
      </div>

      {msg && <div className={`text-[13px] mb-3 rounded-md px-3.5 py-2.5 ${msg.ok ? "bg-success-bg text-success" : "bg-danger-bg text-danger"}`}>{msg.text}</div>}

      {(createFor !== null) && (
        <div className="mb-4 rounded-md border border-line bg-white p-4">
          <div className="text-[14px] font-semibold mb-2">Tạo tài khoản local{createFor?.full_name ? ` cho ${createFor.full_name}` : ""}</div>
          <div className="grid sm:grid-cols-2 gap-2.5">
            <input value={form.username} onChange={(e) => setForm({ ...form, username: e.target.value })} placeholder="username (vd mã NV)" className="rounded-md border border-line-strong px-3 py-2 text-[14px]" />
            <input value={form.password} onChange={(e) => setForm({ ...form, password: e.target.value })} type="text" placeholder="mật khẩu (≥6 ký tự)" className="rounded-md border border-line-strong px-3 py-2 text-[14px]" />
            <input value={form.displayName} onChange={(e) => setForm({ ...form, displayName: e.target.value })} placeholder="tên hiển thị" className="rounded-md border border-line-strong px-3 py-2 text-[14px]" />
            <select value={form.role} onChange={(e) => setForm({ ...form, role: e.target.value })} className="rounded-md border border-line-strong px-3 py-2 text-[14px]">
              <option value="employee">employee</option><option value="environment">environment</option><option value="admin">admin</option>
            </select>
          </div>
          <div className="flex gap-2 mt-3">
            <button onClick={submitCreate} className="btn btn-primary !min-h-9">Tạo</button>
            <button onClick={() => setCreateFor(null)} className="btn btn-secondary !min-h-9">Huỷ</button>
          </div>
        </div>
      )}

      <div className="bg-white rounded-lg border border-line shadow-e2 overflow-x-auto">
        {loading ? (
          <div className="p-6 text-center text-ink-muted text-[14px]">Đang tải…</div>
        ) : rows.length === 0 ? (
          <div className="p-8 text-center text-ink-muted text-[14px]">Không có dữ liệu.</div>
        ) : isEmp ? (
          <table className="w-full text-[13px]">
            <thead className="text-ink-muted text-left"><tr className="border-b border-line">
              <th className="px-4 py-2 font-semibold">Mã NV</th><th className="px-4 py-2 font-semibold">Họ tên</th>
              <th className="px-4 py-2 font-semibold">Phòng ban</th><th className="px-4 py-2 font-semibold">Chức danh</th>
              <th className="px-4 py-2 font-semibold">Email</th><th className="px-4 py-2 font-semibold">Trạng thái</th>
              <th className="px-4 py-2 font-semibold">TK app</th><th className="px-4 py-2 font-semibold"></th>
            </tr></thead>
            <tbody>
              {rows.map((r) => (
                <tr key={r.id} className="border-b border-line last:border-0">
                  <td className="px-4 py-2 font-medium">{r.employee_code}</td>
                  <td className="px-4 py-2">{r.full_name}</td>
                  <td className="px-4 py-2">{r.dept_code ?? "—"}</td>
                  <td className="px-4 py-2 max-w-[180px] truncate">{r.job_title ?? "—"}</td>
                  <td className="px-4 py-2">{r.work_email || r.email || "—"}</td>
                  <td className="px-4 py-2"><span className={`px-2 py-0.5 rounded-pill text-[11px] font-bold ${r.employment_status === "active" ? "bg-success-bg text-success" : "bg-danger-bg text-danger"}`}>{r.employment_status}</span></td>
                  <td className="px-4 py-2">{Number(r.account_count) > 0 ? "✓" : "—"}</td>
                  <td className="px-4 py-2">{Number(r.account_count) === 0 && <button onClick={() => openCreate(r)} className="text-primary-600 font-semibold">Tạo local</button>}</td>
                </tr>
              ))}
            </tbody>
          </table>
        ) : (
          <table className="w-full text-[13px]">
            <thead className="text-ink-muted text-left"><tr className="border-b border-line">
              <th className="px-4 py-2 font-semibold">Tên</th><th className="px-4 py-2 font-semibold">Loại</th>
              <th className="px-4 py-2 font-semibold">Định danh</th><th className="px-4 py-2 font-semibold">Nhân viên</th>
              <th className="px-4 py-2 font-semibold">Phòng ban</th><th className="px-4 py-2 font-semibold">Role</th>
              <th className="px-4 py-2 font-semibold">Trạng thái</th><th className="px-4 py-2 font-semibold">Thao tác</th>
            </tr></thead>
            <tbody>
              {rows.map((r) => (
                <tr key={r.id} className="border-b border-line last:border-0">
                  <td className="px-4 py-2 font-medium">{r.display_name}</td>
                  <td className="px-4 py-2">{r.login_type}{r.has_microsoft && r.login_type !== "microsoft" ? " +MS" : ""}</td>
                  <td className="px-4 py-2">{r.username || r.email || "—"}</td>
                  <td className="px-4 py-2">{r.employee_code ? `${r.employee_code} · ${r.employee_name ?? ""}` : <span className="text-danger font-semibold">chưa gán</span>}</td>
                  <td className="px-4 py-2">{r.dept_code ?? "—"}</td>
                  <td className="px-4 py-2">{r.role}</td>
                  <td className="px-4 py-2">
                    {r.is_active
                      ? <span className="px-2 py-0.5 rounded-pill text-[11px] font-bold bg-success-bg text-success">active</span>
                      : <span className="px-2 py-0.5 rounded-pill text-[11px] font-bold bg-danger-bg text-danger">{r.disabled_reason ?? "disabled"}</span>}
                  </td>
                  <td className="px-4 py-2">
                    <div className="flex flex-wrap gap-x-2 gap-y-1 text-[12px] font-semibold">
                      {r.is_active ? <button onClick={() => disable(r)} className="text-danger">Khóa</button> : <button onClick={() => enable(r)} className="text-success">Mở</button>}
                      {r.login_type === "local" && <button onClick={() => resetPw(r)} className="text-primary-600">Đặt lại MK</button>}
                      {r.employee_id ? <button onClick={() => unmap(r)} className="text-ink-muted">Bỏ gán</button> : <button onClick={() => mapEmp(r)} className="text-primary-600">Gán NV</button>}
                      {r.has_microsoft ? <button onClick={() => unlinkMs(r)} className="text-ink-muted">Gỡ MS</button> : <button onClick={() => linkMs(r)} className="text-primary-600">Gắn MS</button>}
                    </div>
                    <div className="text-[11px] text-ink-muted mt-0.5">login: {fmt(r.last_login_at)}</div>
                  </td>
                </tr>
              ))}
            </tbody>
          </table>
        )}
      </div>
    </AdminShell>
  );
}

"use client";

import { useCallback, useEffect, useMemo, useState } from "react";
import { AdminShell } from "@/components/layout/AdminShell";

interface Dept { code: string; name: string }
interface Row { id: string; email: string; role: string; departmentCode: string | null; isActive: boolean }
interface WhoAmI { email: string | null }

const ROLES = ["Admin", "Manager", "Viewer"] as const;
const DEFAULT_ADMIN = "cuongpx@biahalong.com";

export default function RoleMappingPage() {
  const [rows, setRows] = useState<Row[]>([]);
  const [depts, setDepts] = useState<Dept[]>([]);
  const [meEmail, setMeEmail] = useState<string | null>(null);
  const [loading, setLoading] = useState(true);
  const [busy, setBusy] = useState<string | null>(null);
  const [msg, setMsg] = useState<string | null>(null);
  const [search, setSearch] = useState("");
  const [roleFilter, setRoleFilter] = useState("");

  // add form
  const [nEmail, setNEmail] = useState("");
  const [nRole, setNRole] = useState<(typeof ROLES)[number]>("Admin");
  const [nDept, setNDept] = useState("");

  const flash = (m: string) => { setMsg(m); setTimeout(() => setMsg(null), 3500); };

  const load = useCallback(async () => {
    setLoading(true);
    try {
      const [rm, dr, who] = await Promise.all([
        fetch("/api/admin/config/role-mapping?includeInactive=true").then((r) => (r.ok ? r.json() : null)),
        fetch("/api/config/departments").then((r) => (r.ok ? r.json() : null)),
        fetch("/api/admin/whoami").then((r) => (r.ok ? r.json() : null)),
      ]);
      setRows(rm?.mappings ?? []);
      setDepts(dr?.departments ?? []);
      setMeEmail((who as WhoAmI)?.email ?? null);
    } finally {
      setLoading(false);
    }
  }, []);

  useEffect(() => { void load(); }, [load]);

  const activeAdmins = useMemo(
    () => rows.filter((r) => r.isActive && r.role.toLowerCase() === "admin"),
    [rows],
  );

  const shown = useMemo(() => {
    const t = search.trim().toLowerCase();
    return rows
      .filter((r) => !t || r.email.toLowerCase().includes(t))
      .filter((r) => !roleFilter || r.role.toLowerCase() === roleFilter.toLowerCase());
  }, [rows, search, roleFilter]);

  const patch = (id: string, p: Partial<Row>) => setRows((prev) => prev.map((r) => (r.id === id ? { ...r, ...p } : r)));

  const add = async () => {
    const email = nEmail.trim().toLowerCase();
    if (!email) return flash("Nhập email.");
    if (rows.some((r) => r.isActive && r.email.toLowerCase() === email)) return flash("Email này đã có mapping đang hoạt động.");
    setBusy("add");
    try {
      const r = await fetch("/api/admin/config/role-mapping", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ email, role: nRole, departmentCode: nDept || null }),
      });
      const d = await r.json();
      if (!r.ok) flash(d.error ?? "Lỗi");
      else { setNEmail(""); setNDept(""); flash(`Đã ${d.action === "created" ? "thêm" : d.action === "restored" ? "khôi phục" : "cập nhật"} ${email}.`); await load(); }
    } finally { setBusy(null); }
  };

  const save = async (r: Row) => {
    setBusy(r.id);
    try {
      const res = await fetch(`/api/admin/config/role-mapping/${r.id}`, {
        method: "PATCH",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ role: r.role, departmentCode: r.departmentCode ?? "" }),
      });
      flash(res.ok ? "Đã lưu." : "Lỗi lưu.");
      await load();
    } finally { setBusy(null); }
  };

  const setActive = async (r: Row, isActive: boolean) => {
    // Client-side safety mirror (server also enforces).
    if (!isActive && r.role.toLowerCase() === "admin" && r.email.toLowerCase() !== DEFAULT_ADMIN) {
      const others = activeAdmins.filter((a) => a.id !== r.id);
      if (others.length === 0) return flash("Không thể vô hiệu hoá admin duy nhất. Hãy thêm admin khác trước.");
    }
    setBusy(r.id);
    try {
      const res = isActive
        ? await fetch(`/api/admin/config/role-mapping/${r.id}`, { method: "PATCH", headers: { "Content-Type": "application/json" }, body: JSON.stringify({ isActive: true }) })
        : await fetch(`/api/admin/config/role-mapping/${r.id}`, { method: "DELETE" });
      const d = await res.json().catch(() => ({}));
      if (res.ok) { flash(isActive ? "Đã kích hoạt." : "Đã vô hiệu hoá."); await load(); }
      else flash(d.error ?? "Lỗi cập nhật.");
    } finally { setBusy(null); }
  };

  return (
    <AdminShell title="Phân quyền quản trị" subtitle="Gán quyền theo email · Config_RoleMapping">
      {msg && <div className="mb-4 text-[13px] bg-info-bg text-info px-3.5 py-2.5 rounded-md">{msg}</div>}

      <div className="bg-info-bg/40 border border-info/30 rounded-md px-4 py-3 mb-4 text-[13px] text-ink">
        Admin mặc định <b>{DEFAULT_ADMIN}</b> luôn có quyền quản trị (kể cả khi không có trong danh sách).
        Quyền cũng có thể cấp qua biến môi trường <code>ADMIN_EMAILS</code>.
      </div>

      {/* Add form */}
      <div className="bg-white rounded-lg border border-line shadow-e2 p-4 mb-4">
        <div className="text-[14px] font-semibold mb-2">Thêm / cập nhật phân quyền</div>
        <div className="flex flex-wrap gap-2.5">
          <input value={nEmail} onChange={(e) => setNEmail(e.target.value)} placeholder="email@biahalong.com" className="rounded-md border border-line-strong px-3 py-2 text-[14px] flex-1 min-w-[200px]" />
          <select value={nRole} onChange={(e) => setNRole(e.target.value as (typeof ROLES)[number])} className="rounded-md border border-line-strong px-3 py-2 text-[14px]">
            {ROLES.map((r) => (<option key={r} value={r}>{r}</option>))}
          </select>
          <select value={nDept} onChange={(e) => setNDept(e.target.value)} className="rounded-md border border-line-strong px-3 py-2 text-[14px]">
            <option value="">(Không gắn phòng ban)</option>
            {depts.map((d) => (<option key={d.code} value={d.code}>{d.code}</option>))}
          </select>
          <button onClick={add} disabled={busy === "add"} className="btn btn-primary !min-h-10">{busy === "add" ? "…" : "Lưu"}</button>
        </div>
      </div>

      {/* Filters */}
      <div className="flex flex-wrap items-center gap-3 mb-3">
        <input value={search} onChange={(e) => setSearch(e.target.value)} placeholder="Tìm theo email…" className="rounded-md border border-line px-3 py-2 text-[14px] flex-1 min-w-[180px]" />
        <select value={roleFilter} onChange={(e) => setRoleFilter(e.target.value)} className="rounded-md border border-line-strong px-3 py-2 text-[14px]">
          <option value="">Tất cả vai trò</option>
          {ROLES.map((r) => (<option key={r} value={r}>{r}</option>))}
        </select>
      </div>

      <div className="bg-white rounded-lg border border-line shadow-e2 overflow-x-auto">
        <div className="px-5 py-4 border-b border-line text-[16px] font-semibold">Danh sách ({shown.length})</div>
        {loading ? (
          <div className="p-6 text-center text-ink-muted text-[14px]">Đang tải…</div>
        ) : shown.length === 0 ? (
          <div className="p-8 text-center text-ink-muted text-[14px]">
            Chưa có phân quyền nào. {DEFAULT_ADMIN} vẫn là admin mặc định.
          </div>
        ) : (
          <table className="w-full border-collapse text-[14px]">
            <thead>
              <tr className="text-left text-[12px] uppercase tracking-wide text-ink-muted">
                <th className="px-4 py-3 border-b border-line">Email</th>
                <th className="px-4 py-3 border-b border-line w-32">Vai trò</th>
                <th className="px-4 py-3 border-b border-line w-32">Phòng ban</th>
                <th className="px-4 py-3 border-b border-line w-28">Trạng thái</th>
                <th className="px-4 py-3 border-b border-line w-44">Thao tác</th>
              </tr>
            </thead>
            <tbody>
              {shown.map((r) => {
                const isDefault = r.email.toLowerCase() === DEFAULT_ADMIN;
                const isMe = !!meEmail && r.email.toLowerCase() === meEmail.toLowerCase();
                return (
                  <tr key={r.id} className={r.isActive ? "" : "opacity-60"}>
                    <td className="px-4 py-2.5 border-b border-line">
                      <div className="font-medium break-all">{r.email}</div>
                      <div className="flex gap-1.5 mt-1">
                        {isDefault && <span className="text-[10px] font-bold px-1.5 h-5 rounded-pill grid place-items-center bg-warning-bg text-warning">ADMIN MẶC ĐỊNH</span>}
                        {isMe && <span className="text-[10px] font-bold px-1.5 h-5 rounded-pill grid place-items-center bg-info-bg text-info">BẠN</span>}
                      </div>
                    </td>
                    <td className="px-4 py-2.5 border-b border-line">
                      <select value={ROLES.includes(r.role as (typeof ROLES)[number]) ? r.role : "Viewer"} onChange={(e) => patch(r.id, { role: e.target.value })} className="rounded-md border border-line px-2 py-1.5 w-full">
                        {ROLES.map((x) => (<option key={x} value={x}>{x}</option>))}
                      </select>
                    </td>
                    <td className="px-4 py-2.5 border-b border-line">
                      <input value={r.departmentCode ?? ""} onChange={(e) => patch(r.id, { departmentCode: e.target.value })} placeholder="—" className="rounded-md border border-line px-2 py-1.5 w-24" />
                    </td>
                    <td className="px-4 py-2.5 border-b border-line">
                      <span className={`text-[11px] font-bold px-2 h-6 rounded-pill grid place-items-center w-fit ${r.isActive ? "bg-success-bg text-success" : "bg-ink-muted/15 text-ink-muted"}`}>
                        {r.isActive ? "Hoạt động" : "Đã ẩn"}
                      </span>
                    </td>
                    <td className="px-4 py-2.5 border-b border-line">
                      <div className="flex gap-2">
                        <button onClick={() => save(r)} disabled={busy === r.id} className="btn btn-secondary !min-h-8 !px-3 text-[13px]">Lưu</button>
                        {r.isActive ? (
                          <button onClick={() => setActive(r, false)} disabled={busy === r.id} className="btn btn-ghost !min-h-8 !px-3 text-[13px] text-danger">Ẩn</button>
                        ) : (
                          <button onClick={() => setActive(r, true)} disabled={busy === r.id} className="btn btn-ghost !min-h-8 !px-3 text-[13px] text-success">Kích hoạt</button>
                        )}
                      </div>
                    </td>
                  </tr>
                );
              })}
            </tbody>
          </table>
        )}
      </div>
    </AdminShell>
  );
}

"use client";

import { useCallback, useEffect, useState } from "react";
import { AdminShell } from "@/components/layout/AdminShell";

interface LocalUser {
  id: string; username: string; email: string; displayName: string;
  departmentCode: string; role: string; isActive: boolean; lastLoginAt: string | null;
}
interface Dept { code: string; name: string }

function fmt(iso: string | null): string {
  if (!iso) return "—";
  const d = new Date(iso);
  const p = (n: number) => String(n).padStart(2, "0");
  return `${p(d.getHours())}:${p(d.getMinutes())} ${p(d.getDate())}/${p(d.getMonth() + 1)}/${d.getFullYear()}`;
}

export default function LocalUsersPage() {
  const [users, setUsers] = useState<LocalUser[]>([]);
  const [depts, setDepts] = useState<Dept[]>([]);
  const [loading, setLoading] = useState(true);
  const [busy, setBusy] = useState(false);
  const [msg, setMsg] = useState<string | null>(null);
  const [err, setErr] = useState<string | null>(null);
  // create form
  const [username, setUsername] = useState("");
  const [displayName, setDisplayName] = useState("");
  const [password, setPassword] = useState("");
  const [dept, setDept] = useState("");

  const load = useCallback(async () => {
    setLoading(true);
    try {
      const [u, d] = await Promise.all([
        fetch("/api/admin/local-users").then((r) => (r.ok ? r.json() : null)),
        fetch("/api/config/departments").then((r) => (r.ok ? r.json() : null)),
      ]);
      setUsers(u?.users ?? []);
      setDepts(d?.departments ?? []);
    } finally { setLoading(false); }
  }, []);
  useEffect(() => { void load(); }, [load]);

  const flash = (ok: string | null, error: string | null) => {
    setMsg(ok); setErr(error);
    setTimeout(() => { setMsg(null); setErr(null); }, 4000);
  };

  const create = async () => {
    setBusy(true);
    try {
      const res = await fetch("/api/admin/local-users", {
        method: "POST", headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ username, displayName, password, departmentCode: dept }),
      });
      const j = await res.json();
      if (!res.ok || !j.ok) { flash(null, j.error ?? "Tạo thất bại."); return; }
      flash(`Đã tạo tài khoản "${j.user.username}" (${j.user.departmentCode}).`, null);
      setUsername(""); setDisplayName(""); setPassword("");
      await load();
    } finally { setBusy(false); }
  };

  const update = async (id: string, patch: Record<string, unknown>, okMsg: string) => {
    setBusy(true);
    try {
      const res = await fetch(`/api/admin/local-users/${id}`, {
        method: "PUT", headers: { "Content-Type": "application/json" }, body: JSON.stringify(patch),
      });
      const j = await res.json();
      if (!res.ok || !j.ok) { flash(null, j.error ?? "Cập nhật thất bại."); return; }
      flash(okMsg, null);
      await load();
    } finally { setBusy(false); }
  };

  const resetPassword = (u: LocalUser) => {
    const pw = window.prompt(`Mật khẩu mới cho "${u.username}" (≥6 ký tự):`);
    if (pw === null) return;
    void update(u.id, { password: pw }, `Đã đổi mật khẩu "${u.username}".`);
  };

  const changeDept = (u: LocalUser, code: string) => {
    if (!code || code === u.departmentCode) return;
    void update(u.id, { departmentCode: code }, `Đã chuyển "${u.username}" sang ${code}.`);
  };

  return (
    <AdminShell title="Tài khoản nội bộ" subtitle="Cho nhân viên KHÔNG có tài khoản Microsoft 365 — đăng nhập bằng tên đăng nhập + mật khẩu">
      {msg && <div className="mb-3 rounded-md bg-success-bg text-success px-3.5 py-2.5 text-[13px] font-medium">{msg}</div>}
      {err && <div className="mb-3 rounded-md bg-danger-bg text-danger px-3.5 py-2.5 text-[13px] font-medium">{err}</div>}

      {/* Create */}
      <div className="bg-white rounded-lg border border-line shadow-e2 p-4 mb-4">
        <div className="text-[15px] font-semibold mb-3">Tạo tài khoản mới</div>
        <div className="grid gap-2.5 md:grid-cols-5">
          <input value={username} onChange={(e) => setUsername(e.target.value)} placeholder="Tên đăng nhập (a-z 0-9 . _ -)" className="rounded-md border border-line px-3 py-2 text-[13px]" />
          <input value={displayName} onChange={(e) => setDisplayName(e.target.value)} placeholder="Tên hiển thị" className="rounded-md border border-line px-3 py-2 text-[13px]" />
          <input value={password} onChange={(e) => setPassword(e.target.value)} type="password" placeholder="Mật khẩu (≥6 ký tự)" className="rounded-md border border-line px-3 py-2 text-[13px]" />
          <select value={dept} onChange={(e) => setDept(e.target.value)} className="rounded-md border border-line px-3 py-2 text-[13px] bg-white">
            <option value="">— Phòng ban —</option>
            {depts.map((d) => <option key={d.code} value={d.code}>{d.code} · {d.name}</option>)}
          </select>
          <button onClick={create} disabled={busy || !username || !password || !dept} className="btn btn-primary !min-h-10">
            {busy ? "Đang xử lý…" : "+ Tạo tài khoản"}
          </button>
        </div>
        <p className="text-[12px] text-ink-muted mt-2">
          Nhân viên đăng nhập tại trang chủ → mục &quot;Tài khoản nội bộ&quot;. Email hệ thống dạng <b>tên-đăng-nhập@local.biahalong.com</b>; quyền mặc định: Nhân viên.
        </p>
      </div>

      {/* List */}
      <div className="bg-white rounded-lg border border-line shadow-e2 overflow-hidden">
        <div className="px-5 py-4 border-b border-line text-[16px] font-semibold">Tài khoản ({users.length})</div>
        {loading ? (
          <div className="p-6 text-ink-muted text-[13px]">Đang tải…</div>
        ) : users.length === 0 ? (
          <div className="p-6 text-ink-muted text-[13px]">Chưa có tài khoản nội bộ nào.</div>
        ) : (
          <div className="overflow-x-auto">
            <table className="w-full text-[13px]">
              <thead className="text-left text-ink-muted">
                <tr>
                  <th className="px-4 py-3 border-b border-line">Tên đăng nhập</th>
                  <th className="px-4 py-3 border-b border-line">Tên hiển thị</th>
                  <th className="px-4 py-3 border-b border-line">Phòng ban</th>
                  <th className="px-4 py-3 border-b border-line">Đăng nhập gần nhất</th>
                  <th className="px-4 py-3 border-b border-line">Trạng thái</th>
                  <th className="px-4 py-3 border-b border-line text-right">Thao tác</th>
                </tr>
              </thead>
              <tbody>
                {users.map((u) => (
                  <tr key={u.id} className={u.isActive ? "" : "opacity-50"}>
                    <td className="px-4 py-2.5 border-b border-line font-mono">{u.username}</td>
                    <td className="px-4 py-2.5 border-b border-line">{u.displayName}</td>
                    <td className="px-4 py-2.5 border-b border-line">
                      <select value={u.departmentCode} onChange={(e) => changeDept(u, e.target.value)} disabled={busy} className="rounded border border-line px-2 py-1 text-[12.5px] bg-white">
                        {!depts.some((d) => d.code === u.departmentCode) && <option value={u.departmentCode}>{u.departmentCode}</option>}
                        {depts.map((d) => <option key={d.code} value={d.code}>{d.code}</option>)}
                      </select>
                    </td>
                    <td className="px-4 py-2.5 border-b border-line text-ink-muted">{fmt(u.lastLoginAt)}</td>
                    <td className="px-4 py-2.5 border-b border-line">
                      <span className={`text-[11px] font-bold px-2 py-1 rounded-pill ${u.isActive ? "bg-success-bg text-success" : "bg-danger-bg text-danger"}`}>
                        {u.isActive ? "Hoạt động" : "Đã khóa"}
                      </span>
                    </td>
                    <td className="px-4 py-2.5 border-b border-line text-right whitespace-nowrap">
                      <button onClick={() => resetPassword(u)} disabled={busy} className="btn btn-secondary !min-h-8 !px-2.5 text-[12px] mr-1.5">Đổi mật khẩu</button>
                      <button
                        onClick={() => void update(u.id, { isActive: !u.isActive }, u.isActive ? `Đã khóa "${u.username}".` : `Đã mở khóa "${u.username}".`)}
                        disabled={busy}
                        className={`btn !min-h-8 !px-2.5 text-[12px] ${u.isActive ? "btn-danger" : "btn-primary"}`}
                      >
                        {u.isActive ? "Khóa" : "Mở khóa"}
                      </button>
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        )}
      </div>
    </AdminShell>
  );
}

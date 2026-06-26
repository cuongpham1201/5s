"use client";

import Link from "next/link";
import { useCallback, useEffect, useMemo, useState } from "react";
import { AdminShell } from "@/components/layout/AdminShell";

interface Dept { code: string; name: string }
interface AreaRow { id: string; code: string; name: string; departmentCode: string; sortOrder: number; isActive: boolean }
interface DeptUser { email: string; displayName: string | null; departmentCode: string | null; areaCount: number }

export default function UserAreasPage() {
  const [depts, setDepts] = useState<Dept[]>([]);
  const [dept, setDept] = useState<string>("");
  const [areas, setAreas] = useState<AreaRow[]>([]);
  const [users, setUsers] = useState<DeptUser[]>([]);
  const [loadingDept, setLoadingDept] = useState(false);
  const [search, setSearch] = useState("");
  const [busy, setBusy] = useState<string | null>(null);
  const [msg, setMsg] = useState<string | null>(null);

  // selected user + their checked area set
  const [selEmail, setSelEmail] = useState<string | null>(null);
  const [selName, setSelName] = useState<string>("");
  const [checked, setChecked] = useState<Set<string>>(new Set());

  // add-user form
  const [newEmail, setNewEmail] = useState("");
  const [newName, setNewName] = useState("");

  const flash = (m: string) => { setMsg(m); setTimeout(() => setMsg(null), 3500); };

  useEffect(() => {
    fetch("/api/config/departments").then((r) => (r.ok ? r.json() : null)).then((d) => setDepts(d?.departments ?? []));
  }, []);

  const loadDept = useCallback(async (code: string) => {
    setLoadingDept(true);
    setSelEmail(null);
    setChecked(new Set());
    try {
      const [ar, ur] = await Promise.all([
        fetch(`/api/admin/config/areas?departmentCode=${encodeURIComponent(code)}&includeInactive=false`).then((r) => (r.ok ? r.json() : null)),
        fetch(`/api/admin/config/user-areas?departmentCode=${encodeURIComponent(code)}`).then((r) => (r.ok ? r.json() : null)),
      ]);
      setAreas((ar?.areas ?? []).filter((a: AreaRow) => a.isActive));
      setUsers(ur?.users ?? []);
    } finally {
      setLoadingDept(false);
    }
  }, []);

  useEffect(() => { if (dept) void loadDept(dept); }, [dept, loadDept]);

  const selectUser = async (email: string, displayName: string | null) => {
    setSelEmail(email);
    setSelName(displayName ?? "");
    setBusy("loaduser");
    try {
      const r = await fetch(`/api/admin/config/user-areas?email=${encodeURIComponent(email)}`);
      const d = r.ok ? await r.json() : null;
      const active: string[] = (d?.rows ?? []).filter((x: { isActive: boolean }) => x.isActive).map((x: { areaCode: string }) => x.areaCode);
      setChecked(new Set(active));
    } finally {
      setBusy(null);
    }
  };

  const addUser = () => {
    const email = newEmail.trim().toLowerCase();
    if (!email) return flash("Nhập email người dùng.");
    if (!users.some((u) => u.email.toLowerCase() === email)) {
      setUsers((prev) => [...prev, { email, displayName: newName.trim() || null, departmentCode: dept, areaCount: 0 }]);
    }
    setNewEmail(""); setNewName("");
    void selectUser(email, newName.trim() || null);
  };

  const toggle = (code: string) =>
    setChecked((prev) => { const n = new Set(prev); if (n.has(code)) n.delete(code); else n.add(code); return n; });

  const save = async () => {
    if (!selEmail) return;
    setBusy("save");
    try {
      const r = await fetch("/api/admin/config/user-areas", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ email: selEmail, displayName: selName || null, departmentCode: dept, areaCodes: [...checked] }),
      });
      const d = await r.json();
      if (!r.ok) flash(d.error ?? "Lỗi lưu.");
      else { flash(`Đã lưu: cấp ${d.granted?.length ?? 0}, thu hồi ${d.revoked?.length ?? 0}, giữ ${d.unchanged?.length ?? 0}.`); await loadDept(dept); setSelEmail(selEmail); }
    } finally { setBusy(null); }
  };

  const filteredUsers = useMemo(() => {
    const t = search.trim().toLowerCase();
    return users.filter((u) => !t || u.email.toLowerCase().includes(t) || (u.displayName ?? "").toLowerCase().includes(t));
  }, [users, search]);

  const selectedDept = depts.find((d) => d.code === dept) ?? null;

  return (
    <AdminShell title="Phân quyền khu vực theo người dùng" subtitle="User → Department → Allowed Areas (Config_UserAreaPermissions)">
      {msg && <div className="mb-4 text-[13px] bg-info-bg text-info px-3.5 py-2.5 rounded-md">{msg}</div>}

      <div className="flex flex-wrap items-center gap-3 mb-4">
        <label className="text-[13px] font-semibold text-ink-muted">Phòng ban:</label>
        <select value={dept} onChange={(e) => setDept(e.target.value)} className="rounded-md border border-line-strong bg-white px-3 py-2 text-[14px]">
          <option value="">— Chọn phòng ban —</option>
          {depts.map((d) => (<option key={d.code} value={d.code}>{d.code} — {d.name}</option>))}
        </select>
      </div>

      {!dept ? (
        <div className="bg-white rounded-lg border border-line shadow-e2 p-10 text-center text-ink-muted text-[14px]">
          Chọn phòng ban để quản lý phân quyền khu vực cho người dùng.
        </div>
      ) : (
        <div className="grid grid-cols-1 lg:grid-cols-[320px_1fr] gap-5">
          {/* Left: users */}
          <div className="bg-white rounded-lg border border-line shadow-e2 self-start">
            <div className="p-3 border-b border-line">
              <input value={search} onChange={(e) => setSearch(e.target.value)} placeholder="Tìm email / tên…" className="w-full rounded-md border border-line px-3 py-2 text-[14px]" />
            </div>
            <div className="max-h-[50vh] overflow-y-auto">
              {loadingDept ? (
                <div className="p-5 text-center text-ink-muted text-[13px]">Đang tải…</div>
              ) : filteredUsers.length === 0 ? (
                <div className="p-5 text-center text-ink-muted text-[13px]">Chưa có người dùng được gán. Thêm bên dưới.</div>
              ) : (
                filteredUsers.map((u) => {
                  const on = selEmail?.toLowerCase() === u.email.toLowerCase();
                  return (
                    <button key={u.email} onClick={() => selectUser(u.email, u.displayName)} className={`w-full flex items-center gap-2.5 px-4 py-2.5 text-left border-b border-line last:border-0 ${on ? "bg-primary-100" : "hover:bg-surface-2"}`}>
                      <span className="flex-1 min-w-0">
                        <span className={`block text-[14px] font-semibold leading-tight truncate ${on ? "text-primary-700" : ""}`}>{u.displayName || u.email}</span>
                        <span className="block text-[12px] text-ink-muted truncate">{u.email}</span>
                      </span>
                      <span className={`text-[11px] font-bold px-2 h-6 rounded-pill grid place-items-center flex-none ${u.areaCount > 0 ? "bg-success-bg text-success" : "bg-ink-muted/15 text-ink-muted"}`}>{u.areaCount} KV</span>
                    </button>
                  );
                })
              )}
            </div>
            <div className="p-3 border-t border-line">
              <div className="text-[12px] font-semibold text-ink-muted mb-1.5">Thêm người dùng</div>
              <div className="flex flex-col gap-2">
                <input value={newEmail} onChange={(e) => setNewEmail(e.target.value)} placeholder="email@biahalong.com" className="rounded-md border border-line px-3 py-2 text-[13px]" />
                <input value={newName} onChange={(e) => setNewName(e.target.value)} placeholder="Tên hiển thị (tuỳ chọn)" className="rounded-md border border-line px-3 py-2 text-[13px]" />
                <button onClick={addUser} className="btn btn-secondary !min-h-9">Thêm & chọn</button>
              </div>
            </div>
          </div>

          {/* Right: areas checkboxes */}
          <div>
            {!selEmail ? (
              <div className="bg-white rounded-lg border border-line shadow-e2 p-10 text-center text-ink-muted text-[14px]">
                Chọn một người dùng ở bên trái (hoặc thêm mới) để gán khu vực.
              </div>
            ) : (
              <div className="bg-white rounded-lg border border-line shadow-e2">
                <div className="flex flex-wrap items-center justify-between gap-3 px-5 py-4 border-b border-line">
                  <div className="min-w-0">
                    <div className="text-[16px] font-bold truncate">{selName || selEmail}</div>
                    <div className="text-[12.5px] text-ink-muted truncate">{selEmail} · {selectedDept?.code}</div>
                  </div>
                  <button onClick={save} disabled={busy === "save"} className="btn btn-primary !min-h-9">{busy === "save" ? "Đang lưu…" : "Lưu phân quyền"}</button>
                </div>
                {areas.length === 0 ? (
                  <div className="p-8 text-center">
                    <div className="text-[15px] font-semibold text-ink">Phòng ban này chưa có khu vực chụp.</div>
                    <div className="text-[13px] text-ink-muted mt-1 mb-4">Hãy tạo khu vực trước khi phân quyền.</div>
                    <Link href="/admin/config/areas" className="btn btn-secondary !min-h-9">Đi tới Quản lý khu vực</Link>
                  </div>
                ) : (
                  <div className="p-4 grid grid-cols-1 sm:grid-cols-2 gap-2.5">
                    {areas.map((a) => {
                      const on = checked.has(a.code);
                      return (
                        <label key={a.code} className={`flex items-center gap-3 p-3 rounded-md border-[1.5px] cursor-pointer ${on ? "border-primary-600 bg-primary-100" : "border-line bg-white"}`}>
                          <input type="checkbox" checked={on} onChange={() => toggle(a.code)} className="w-4 h-4" />
                          <span className="flex-1 min-w-0">
                            <span className="block text-[14px] font-semibold truncate">{a.name}</span>
                            <span className="block text-[11px] text-ink-muted font-mono truncate">{a.code}</span>
                          </span>
                        </label>
                      );
                    })}
                  </div>
                )}
              </div>
            )}
          </div>
        </div>
      )}
    </AdminShell>
  );
}

"use client";

import { useCallback, useEffect, useMemo, useState } from "react";
import { AdminShell } from "@/components/layout/AdminShell";

interface Dept { code: string; name: string }
interface AreaRow { id: string; code: string; name: string; departmentCode: string; sortOrder: number; isActive: boolean }

export default function ConfigAreasPage() {
  const [depts, setDepts] = useState<Dept[]>([]);
  const [areas, setAreas] = useState<AreaRow[]>([]);
  const [loading, setLoading] = useState(true);
  const [filter, setFilter] = useState<string>("");
  const [busy, setBusy] = useState<string | null>(null);
  const [msg, setMsg] = useState<string | null>(null);

  // add form
  const [newCode, setNewCode] = useState("");
  const [newName, setNewName] = useState("");
  const [newSort, setNewSort] = useState(0);

  const load = useCallback(async () => {
    setLoading(true);
    try {
      const [dr, ar] = await Promise.all([
        fetch("/api/config/departments").then((r) => (r.ok ? r.json() : null)),
        fetch("/api/admin/config/areas").then((r) => (r.ok ? r.json() : null)),
      ]);
      setDepts(dr?.departments ?? []);
      setAreas(ar?.areas ?? []);
    } finally {
      setLoading(false);
    }
  }, []);

  useEffect(() => { void load(); }, [load]);

  const shown = useMemo(
    () => (filter ? areas.filter((a) => a.departmentCode === filter) : areas),
    [areas, filter],
  );

  const flash = (m: string) => { setMsg(m); setTimeout(() => setMsg(null), 2500); };

  const add = async () => {
    const dept = filter;
    if (!dept) return flash("Chọn phòng ban ở bộ lọc trước khi thêm khu vực.");
    if (!newCode.trim() || !newName.trim()) return flash("Nhập mã và tên khu vực.");
    setBusy("add");
    try {
      const r = await fetch("/api/admin/config/areas", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ code: newCode.trim(), name: newName.trim(), departmentCode: dept, sortOrder: newSort }),
      });
      const d = await r.json();
      if (!r.ok) flash(d.error ?? "Lỗi tạo khu vực");
      else { setNewCode(""); setNewName(""); setNewSort(0); flash("Đã thêm khu vực."); await load(); }
    } finally { setBusy(null); }
  };

  const save = async (a: AreaRow) => {
    setBusy(a.id);
    try {
      const r = await fetch(`/api/admin/config/areas/${a.id}`, {
        method: "PATCH",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ name: a.name, sortOrder: a.sortOrder, isActive: a.isActive, departmentCode: a.departmentCode }),
      });
      flash(r.ok ? "Đã lưu." : "Lỗi lưu.");
    } finally { setBusy(null); }
  };

  const deactivate = async (a: AreaRow) => {
    setBusy(a.id);
    try {
      const r = await fetch(`/api/admin/config/areas/${a.id}`, { method: "DELETE" });
      if (r.ok) { flash("Đã vô hiệu hoá (soft delete)."); await load(); } else flash("Lỗi vô hiệu hoá.");
    } finally { setBusy(null); }
  };

  const seedOffice = async () => {
    setBusy("seed");
    try {
      const r = await fetch("/api/admin/config/areas/seed-office", { method: "POST" });
      const d = await r.json();
      flash(r.ok ? `Tạo mặc định: ${d.created?.length ?? 0}, bỏ qua: ${d.skipped?.length ?? 0}.` : (d.error ?? "Lỗi seed"));
      await load();
    } finally { setBusy(null); }
  };

  const patch = (id: string, p: Partial<AreaRow>) =>
    setAreas((prev) => prev.map((a) => (a.id === id ? { ...a, ...p } : a)));

  return (
    <AdminShell
      title="Khu vực 5S (Config_Areas)"
      subtitle="Quản lý khu vực chụp cho từng phòng ban"
      actions={
        <button onClick={seedOffice} disabled={!!busy} className="btn btn-secondary !min-h-10">
          {busy === "seed" ? "Đang tạo…" : "Tạo khu vực Văn phòng mặc định"}
        </button>
      }
    >
      {msg && <div className="mb-3 text-[13px] bg-info-bg text-info px-3.5 py-2.5 rounded-md">{msg}</div>}

      <div className="flex flex-wrap items-center gap-3 mb-4">
        <label className="text-[13px] font-semibold text-ink-muted">Phòng ban:</label>
        <select value={filter} onChange={(e) => setFilter(e.target.value)} className="rounded-md border border-line-strong bg-white px-3 py-2 text-[14px]">
          <option value="">— Tất cả —</option>
          {depts.map((d) => (<option key={d.code} value={d.code}>{d.code} — {d.name}</option>))}
        </select>
      </div>

      {filter && (
        <div className="bg-white rounded-lg border border-line shadow-e2 p-4 mb-4">
          <div className="text-[14px] font-semibold mb-2">Thêm khu vực cho {filter}</div>
          <div className="flex flex-wrap gap-2.5">
            <input value={newCode} onChange={(e) => setNewCode(e.target.value)} placeholder="Mã (vd TCKS_OFFICE)" className="rounded-md border border-line-strong px-3 py-2 text-[14px] flex-1 min-w-[160px]" />
            <input value={newName} onChange={(e) => setNewName(e.target.value)} placeholder="Tên khu vực" className="rounded-md border border-line-strong px-3 py-2 text-[14px] flex-1 min-w-[160px]" />
            <input type="number" value={newSort} onChange={(e) => setNewSort(Number(e.target.value))} placeholder="Thứ tự" className="rounded-md border border-line-strong px-3 py-2 text-[14px] w-24" />
            <button onClick={add} disabled={busy === "add"} className="btn btn-primary !min-h-10">{busy === "add" ? "…" : "Thêm"}</button>
          </div>
        </div>
      )}

      <div className="bg-white rounded-lg border border-line shadow-e2 overflow-x-auto">
        <div className="px-5 py-4 border-b border-line text-[16px] font-semibold">
          Khu vực {filter ? `· ${filter}` : "· tất cả"} ({shown.length})
        </div>
        {loading ? (
          <div className="p-6 text-center text-ink-muted text-[14px]">Đang tải…</div>
        ) : shown.length === 0 ? (
          <div className="p-8 text-center text-ink-muted text-[14px]">
            {filter ? `Phòng ban ${filter} chưa có khu vực nào. Thêm mới hoặc dùng nút “Tạo khu vực Văn phòng mặc định”.` : "Chưa có khu vực nào."}
          </div>
        ) : (
          <table className="w-full border-collapse text-[14px]">
            <thead>
              <tr className="text-left text-[12px] uppercase tracking-wide text-ink-muted">
                <th className="px-4 py-3 border-b border-line">Phòng ban</th>
                <th className="px-4 py-3 border-b border-line">Mã</th>
                <th className="px-4 py-3 border-b border-line">Tên</th>
                <th className="px-4 py-3 border-b border-line w-20">Thứ tự</th>
                <th className="px-4 py-3 border-b border-line w-24">Hoạt động</th>
                <th className="px-4 py-3 border-b border-line w-44">Thao tác</th>
              </tr>
            </thead>
            <tbody>
              {shown.map((a) => (
                <tr key={a.id} className={a.isActive ? "" : "opacity-55"}>
                  <td className="px-4 py-2.5 border-b border-line font-mono text-[12px]">{a.departmentCode}</td>
                  <td className="px-4 py-2.5 border-b border-line font-mono text-[12px]">{a.code}</td>
                  <td className="px-4 py-2.5 border-b border-line">
                    <input value={a.name} onChange={(e) => patch(a.id, { name: e.target.value })} className="rounded-md border border-line px-2 py-1.5 w-full" />
                  </td>
                  <td className="px-4 py-2.5 border-b border-line">
                    <input type="number" value={a.sortOrder} onChange={(e) => patch(a.id, { sortOrder: Number(e.target.value) })} className="rounded-md border border-line px-2 py-1.5 w-16" />
                  </td>
                  <td className="px-4 py-2.5 border-b border-line">
                    <input type="checkbox" checked={a.isActive} onChange={(e) => patch(a.id, { isActive: e.target.checked })} />
                  </td>
                  <td className="px-4 py-2.5 border-b border-line">
                    <div className="flex gap-2">
                      <button onClick={() => save(a)} disabled={busy === a.id} className="btn btn-secondary !min-h-8 !px-3 text-[13px]">Lưu</button>
                      {a.isActive && <button onClick={() => deactivate(a)} disabled={busy === a.id} className="btn btn-ghost !min-h-8 !px-3 text-[13px] text-danger">Ẩn</button>}
                    </div>
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

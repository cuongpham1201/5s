"use client";

import { useCallback, useEffect, useMemo, useState } from "react";
import { AdminShell } from "@/components/layout/AdminShell";

interface Dept { code: string; name: string }
interface Area { code: string; name: string; departmentCode: string }
interface CheckRow {
  id: string; code: string; name: string;
  departmentCode: string | null; areaCode: string | null;
  sortOrder: number; isActive: boolean; description: string | null;
  scope: "global" | "department" | "area";
}

const SCOPE_LABEL: Record<string, string> = { global: "Toàn hệ thống", department: "Phòng ban", area: "Khu vực" };

export default function ConfigCheckItemsPage() {
  const [depts, setDepts] = useState<Dept[]>([]);
  const [areas, setAreas] = useState<Area[]>([]);
  const [items, setItems] = useState<CheckRow[]>([]);
  const [loading, setLoading] = useState(true);
  const [deptFilter, setDeptFilter] = useState("");
  const [areaFilter, setAreaFilter] = useState("");
  const [busy, setBusy] = useState<string | null>(null);
  const [msg, setMsg] = useState<string | null>(null);

  // add form
  const [nCode, setNCode] = useState("");
  const [nName, setNName] = useState("");
  const [nDept, setNDept] = useState("");
  const [nArea, setNArea] = useState("");
  const [nSort, setNSort] = useState(0);

  const load = useCallback(async () => {
    setLoading(true);
    try {
      const [dr, ar, cr] = await Promise.all([
        fetch("/api/config/departments").then((r) => (r.ok ? r.json() : null)),
        fetch("/api/admin/config/areas").then((r) => (r.ok ? r.json() : null)),
        fetch("/api/admin/config/check-items").then((r) => (r.ok ? r.json() : null)),
      ]);
      setDepts(dr?.departments ?? []);
      setAreas((ar?.areas ?? []).filter((a: Area & { isActive?: boolean }) => a));
      setItems(cr?.checkItems ?? []);
    } finally {
      setLoading(false);
    }
  }, []);

  useEffect(() => { void load(); }, [load]);

  const areasForDept = useMemo(
    () => areas.filter((a) => !nDept || a.departmentCode === nDept),
    [areas, nDept],
  );
  const filterAreas = useMemo(
    () => areas.filter((a) => !deptFilter || a.departmentCode === deptFilter),
    [areas, deptFilter],
  );

  const shown = useMemo(() => {
    return items.filter((it) => {
      if (deptFilter && it.departmentCode && it.departmentCode !== deptFilter) return false;
      if (areaFilter && it.areaCode && it.areaCode !== areaFilter) return false;
      return true;
    });
  }, [items, deptFilter, areaFilter]);

  const flash = (m: string) => { setMsg(m); setTimeout(() => setMsg(null), 2500); };
  const patch = (id: string, p: Partial<CheckRow>) =>
    setItems((prev) => prev.map((x) => (x.id === id ? { ...x, ...p } : x)));

  const add = async () => {
    if (!nCode.trim() || !nName.trim()) return flash("Nhập mã và tên hạng mục.");
    setBusy("add");
    try {
      const r = await fetch("/api/admin/config/check-items", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ code: nCode.trim(), name: nName.trim(), departmentCode: nDept || null, areaCode: nArea || null, sortOrder: nSort }),
      });
      const d = await r.json();
      if (!r.ok) flash(d.error ?? "Lỗi tạo hạng mục");
      else { setNCode(""); setNName(""); setNArea(""); setNSort(0); flash("Đã thêm hạng mục."); await load(); }
    } finally { setBusy(null); }
  };

  const save = async (it: CheckRow) => {
    setBusy(it.id);
    try {
      const r = await fetch(`/api/admin/config/check-items/${it.id}`, {
        method: "PATCH",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ name: it.name, sortOrder: it.sortOrder, isActive: it.isActive }),
      });
      flash(r.ok ? "Đã lưu." : "Lỗi lưu.");
    } finally { setBusy(null); }
  };

  const deactivate = async (it: CheckRow) => {
    setBusy(it.id);
    try {
      const r = await fetch(`/api/admin/config/check-items/${it.id}`, { method: "DELETE" });
      if (r.ok) { flash("Đã vô hiệu hoá (soft delete)."); await load(); } else flash("Lỗi vô hiệu hoá.");
    } finally { setBusy(null); }
  };

  const seed = async () => {
    setBusy("seed");
    try {
      const r = await fetch("/api/admin/config/check-items/seed-default", { method: "POST" });
      const d = await r.json();
      flash(r.ok ? `Tạo mặc định: ${d.created?.length ?? 0}, bỏ qua: ${d.skipped?.length ?? 0}.` : (d.error ?? "Lỗi seed"));
      await load();
    } finally { setBusy(null); }
  };

  return (
    <AdminShell
      title="Hạng mục 5S (Config_CheckItems)"
      subtitle="Checklist / hạng mục kiểm tra cho 5S"
      actions={
        <button onClick={seed} disabled={!!busy} className="btn btn-secondary !min-h-10">
          {busy === "seed" ? "Đang tạo…" : "Seed checklist 5S mặc định"}
        </button>
      }
    >
      {msg && <div className="mb-3 text-[13px] bg-info-bg text-info px-3.5 py-2.5 rounded-md">{msg}</div>}

      <div className="flex flex-wrap items-center gap-3 mb-4">
        <label className="text-[13px] font-semibold text-ink-muted">Phòng ban:</label>
        <select value={deptFilter} onChange={(e) => { setDeptFilter(e.target.value); setAreaFilter(""); }} className="rounded-md border border-line-strong bg-white px-3 py-2 text-[14px]">
          <option value="">— Tất cả —</option>
          {depts.map((d) => (<option key={d.code} value={d.code}>{d.code}</option>))}
        </select>
        <label className="text-[13px] font-semibold text-ink-muted">Khu vực:</label>
        <select value={areaFilter} onChange={(e) => setAreaFilter(e.target.value)} className="rounded-md border border-line-strong bg-white px-3 py-2 text-[14px]">
          <option value="">— Tất cả —</option>
          {filterAreas.map((a) => (<option key={a.code} value={a.code}>{a.name}</option>))}
        </select>
      </div>

      <div className="bg-white rounded-lg border border-line shadow-e2 p-4 mb-4">
        <div className="text-[14px] font-semibold mb-2">Thêm hạng mục</div>
        <div className="flex flex-wrap gap-2.5">
          <input value={nCode} onChange={(e) => setNCode(e.target.value)} placeholder="Mã (vd S1)" className="rounded-md border border-line-strong px-3 py-2 text-[14px] w-32" />
          <input value={nName} onChange={(e) => setNName(e.target.value)} placeholder="Tên hạng mục" className="rounded-md border border-line-strong px-3 py-2 text-[14px] flex-1 min-w-[160px]" />
          <select value={nDept} onChange={(e) => { setNDept(e.target.value); setNArea(""); }} className="rounded-md border border-line-strong px-3 py-2 text-[14px]">
            <option value="">Toàn hệ thống</option>
            {depts.map((d) => (<option key={d.code} value={d.code}>{d.code}</option>))}
          </select>
          <select value={nArea} onChange={(e) => setNArea(e.target.value)} disabled={!nDept} className="rounded-md border border-line-strong px-3 py-2 text-[14px] disabled:opacity-50">
            <option value="">{nDept ? "Cả phòng ban" : "—"}</option>
            {areasForDept.map((a) => (<option key={a.code} value={a.code}>{a.name}</option>))}
          </select>
          <input type="number" value={nSort} onChange={(e) => setNSort(Number(e.target.value))} placeholder="Thứ tự" className="rounded-md border border-line-strong px-3 py-2 text-[14px] w-20" />
          <button onClick={add} disabled={busy === "add"} className="btn btn-primary !min-h-10">{busy === "add" ? "…" : "Thêm"}</button>
        </div>
      </div>

      <div className="bg-white rounded-lg border border-line shadow-e2 overflow-x-auto">
        <div className="px-5 py-4 border-b border-line text-[16px] font-semibold">Hạng mục ({shown.length})</div>
        {loading ? (
          <div className="p-6 text-center text-ink-muted text-[14px]">Đang tải…</div>
        ) : shown.length === 0 ? (
          <div className="p-8 text-center text-ink-muted text-[14px]">
            Chưa có hạng mục nào. Thêm mới hoặc dùng nút “Seed checklist 5S mặc định”.
          </div>
        ) : (
          <table className="w-full border-collapse text-[14px]">
            <thead>
              <tr className="text-left text-[12px] uppercase tracking-wide text-ink-muted">
                <th className="px-4 py-3 border-b border-line">Mã</th>
                <th className="px-4 py-3 border-b border-line">Tên</th>
                <th className="px-4 py-3 border-b border-line">Phạm vi</th>
                <th className="px-4 py-3 border-b border-line w-20">Thứ tự</th>
                <th className="px-4 py-3 border-b border-line w-24">Hoạt động</th>
                <th className="px-4 py-3 border-b border-line w-40">Thao tác</th>
              </tr>
            </thead>
            <tbody>
              {shown.map((it) => (
                <tr key={it.id} className={it.isActive ? "" : "opacity-55"}>
                  <td className="px-4 py-2.5 border-b border-line font-mono text-[12px]">{it.code}</td>
                  <td className="px-4 py-2.5 border-b border-line">
                    <input value={it.name} onChange={(e) => patch(it.id, { name: e.target.value })} className="rounded-md border border-line px-2 py-1.5 w-full" />
                  </td>
                  <td className="px-4 py-2.5 border-b border-line text-[12px] text-ink-muted">
                    {SCOPE_LABEL[it.scope]}{it.departmentCode ? ` · ${it.departmentCode}` : ""}{it.areaCode ? ` · ${it.areaCode}` : ""}
                  </td>
                  <td className="px-4 py-2.5 border-b border-line">
                    <input type="number" value={it.sortOrder} onChange={(e) => patch(it.id, { sortOrder: Number(e.target.value) })} className="rounded-md border border-line px-2 py-1.5 w-16" />
                  </td>
                  <td className="px-4 py-2.5 border-b border-line">
                    <input type="checkbox" checked={it.isActive} onChange={(e) => patch(it.id, { isActive: e.target.checked })} />
                  </td>
                  <td className="px-4 py-2.5 border-b border-line">
                    <div className="flex gap-2">
                      <button onClick={() => save(it)} disabled={busy === it.id} className="btn btn-secondary !min-h-8 !px-3 text-[13px]">Lưu</button>
                      {it.isActive && <button onClick={() => deactivate(it)} disabled={busy === it.id} className="btn btn-ghost !min-h-8 !px-3 text-[13px] text-danger">Ẩn</button>}
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

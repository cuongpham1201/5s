"use client";

import { useCallback, useEffect, useMemo, useState } from "react";
import { AdminShell } from "@/components/layout/AdminShell";

interface Dept { code: string; name: string }
interface AreaRow { id: string; code: string; name: string; departmentCode: string; sortOrder: number; isActive: boolean }

export default function ConfigAreasPage() {
  const [depts, setDepts] = useState<Dept[]>([]);
  const [counts, setCounts] = useState<Record<string, number>>({});
  const [selected, setSelected] = useState<string | null>(null);
  const [areas, setAreas] = useState<AreaRow[]>([]);
  const [loadingDepts, setLoadingDepts] = useState(true);
  const [loadingAreas, setLoadingAreas] = useState(false);
  const [search, setSearch] = useState("");
  const [includeInactive, setIncludeInactive] = useState(false);
  const [busy, setBusy] = useState<string | null>(null);
  const [msg, setMsg] = useState<string | null>(null);

  // add form
  const [newCode, setNewCode] = useState("");
  const [newName, setNewName] = useState("");
  const [newSort, setNewSort] = useState(0);

  const flash = (m: string) => { setMsg(m); setTimeout(() => setMsg(null), 3000); };

  const loadDepts = useCallback(async () => {
    setLoadingDepts(true);
    try {
      const [dr, ar] = await Promise.all([
        fetch("/api/config/departments").then((r) => (r.ok ? r.json() : null)),
        fetch("/api/admin/config/areas").then((r) => (r.ok ? r.json() : null)),
      ]);
      setDepts(dr?.departments ?? []);
      setCounts(ar?.counts ?? {});
    } finally {
      setLoadingDepts(false);
    }
  }, []);

  const loadAreas = useCallback(async (dept: string) => {
    setLoadingAreas(true);
    try {
      const r = await fetch(`/api/admin/config/areas?departmentCode=${encodeURIComponent(dept)}&includeInactive=true`);
      const d = r.ok ? await r.json() : null;
      setAreas(d?.areas ?? []);
    } finally {
      setLoadingAreas(false);
    }
  }, []);

  useEffect(() => { void loadDepts(); }, [loadDepts]);
  useEffect(() => { if (selected) void loadAreas(selected); }, [selected, loadAreas]);

  const refresh = async () => {
    await loadDepts();
    if (selected) await loadAreas(selected);
  };

  const filteredDepts = useMemo(() => {
    const t = search.trim().toLowerCase();
    return depts
      .filter((d) => !t || d.code.toLowerCase().includes(t) || d.name.toLowerCase().includes(t))
      .sort((a, b) => a.code.localeCompare(b.code));
  }, [depts, search]);

  const shownAreas = useMemo(
    () => (includeInactive ? areas : areas.filter((a) => a.isActive)),
    [areas, includeInactive],
  );

  const selectedDept = depts.find((d) => d.code === selected) ?? null;
  const patch = (id: string, p: Partial<AreaRow>) => setAreas((prev) => prev.map((a) => (a.id === id ? { ...a, ...p } : a)));

  const add = async () => {
    if (!selected) return;
    if (!newCode.trim() || !newName.trim()) return flash("Nhập mã và tên khu vực.");
    setBusy("add");
    try {
      const r = await fetch("/api/admin/config/areas", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ code: newCode.trim(), name: newName.trim(), departmentCode: selected, sortOrder: newSort }),
      });
      const d = await r.json();
      if (!r.ok) flash(d.error ?? "Lỗi tạo khu vực");
      else { setNewCode(""); setNewName(""); setNewSort(0); flash("Đã thêm khu vực."); await refresh(); }
    } finally { setBusy(null); }
  };

  const save = async (a: AreaRow) => {
    setBusy(a.id);
    try {
      const r = await fetch(`/api/admin/config/areas/${a.id}`, {
        method: "PATCH",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ name: a.name, sortOrder: a.sortOrder, isActive: a.isActive }),
      });
      flash(r.ok ? "Đã lưu." : "Lỗi lưu.");
      await refresh();
    } finally { setBusy(null); }
  };

  const setActive = async (a: AreaRow, isActive: boolean) => {
    setBusy(a.id);
    try {
      const r = isActive
        ? await fetch(`/api/admin/config/areas/${a.id}`, { method: "PATCH", headers: { "Content-Type": "application/json" }, body: JSON.stringify({ isActive: true }) })
        : await fetch(`/api/admin/config/areas/${a.id}`, { method: "DELETE" });
      if (r.ok) { flash(isActive ? "Đã khôi phục." : "Đã ẩn (soft delete)."); await refresh(); } else flash("Lỗi cập nhật.");
    } finally { setBusy(null); }
  };

  const runSeed = async (path: string, body: object | null, label: string) => {
    setBusy(label);
    try {
      const r = await fetch(path, {
        method: "POST",
        headers: body ? { "Content-Type": "application/json" } : undefined,
        body: body ? JSON.stringify(body) : undefined,
      });
      const d = await r.json();
      if (!r.ok) flash(d.error ?? "Lỗi");
      else flash(`Tạo: ${d.created?.length ?? 0} · Khôi phục: ${d.restored?.length ?? 0} · Cập nhật: ${d.updated?.length ?? 0}`);
      await refresh();
    } finally { setBusy(null); }
  };

  return (
    <AdminShell
      title="Khu vực 5S theo phòng ban"
      subtitle="Gán khu vực chụp cho từng phòng ban (Config_Areas)"
      actions={
        <button onClick={() => runSeed("/api/admin/config/areas/seed-office-missing", null, "bulk")} disabled={!!busy} className="btn btn-secondary !min-h-10">
          {busy === "bulk" ? "Đang tạo…" : "Tạo Văn phòng cho phòng ban chưa có"}
        </button>
      }
    >
      {msg && <div className="mb-4 text-[13px] bg-info-bg text-info px-3.5 py-2.5 rounded-md">{msg}</div>}

      <div className="grid grid-cols-1 lg:grid-cols-[300px_1fr] gap-5">
        {/* Department selector */}
        <div className="bg-white rounded-lg border border-line shadow-e2 self-start">
          <div className="p-3 border-b border-line">
            <input value={search} onChange={(e) => setSearch(e.target.value)} placeholder="Tìm phòng ban…" className="w-full rounded-md border border-line px-3 py-2 text-[14px]" />
          </div>
          <div className="max-h-[60vh] overflow-y-auto">
            {loadingDepts ? (
              <div className="p-5 text-center text-ink-muted text-[13px]">Đang tải…</div>
            ) : filteredDepts.length === 0 ? (
              <div className="p-5 text-center text-ink-muted text-[13px]">Không có phòng ban.</div>
            ) : (
              filteredDepts.map((d) => {
                const n = counts[d.code] ?? 0;
                const on = selected === d.code;
                return (
                  <button
                    key={d.code}
                    onClick={() => setSelected(d.code)}
                    className={`w-full flex items-center gap-2.5 px-4 py-2.5 text-left border-b border-line last:border-0 ${on ? "bg-primary-100" : "hover:bg-surface-2"}`}
                  >
                    <span className="flex-1 min-w-0">
                      <span className={`block text-[14px] font-bold leading-tight ${on ? "text-primary-700" : ""}`}>{d.code}</span>
                      <span className="block text-[12px] text-ink-muted truncate">{d.name}</span>
                    </span>
                    <span className={`text-[11px] font-bold px-2 h-6 rounded-pill grid place-items-center flex-none ${n > 0 ? "bg-success-bg text-success" : "bg-danger-bg text-danger"}`}>
                      {n} khu vực
                    </span>
                  </button>
                );
              })
            )}
          </div>
        </div>

        {/* Area management panel */}
        <div>
          {!selected ? (
            <div className="bg-white rounded-lg border border-line shadow-e2 p-10 text-center text-ink-muted text-[14px]">
              Chọn một phòng ban ở bên trái để quản lý khu vực.
            </div>
          ) : (
            <>
              <div className="flex flex-wrap items-center justify-between gap-3 mb-3">
                <div>
                  <div className="text-[18px] font-bold">{selectedDept?.code}</div>
                  <div className="text-[13px] text-ink-muted">{selectedDept?.name}</div>
                </div>
                <div className="flex flex-wrap gap-2.5">
                  <button onClick={() => runSeed("/api/admin/config/areas/seed-office", { departmentCode: selected }, "office")} disabled={!!busy} className="btn btn-secondary !min-h-9">
                    {busy === "office" ? "…" : "Tạo khu vực Văn phòng"}
                  </button>
                  <button onClick={() => runSeed("/api/admin/config/areas/seed-defaults", { departmentCode: selected }, "defaults")} disabled={!!busy} className="btn btn-secondary !min-h-9">
                    {busy === "defaults" ? "…" : "Tạo bộ khu vực mẫu"}
                  </button>
                </div>
              </div>

              {/* Add form */}
              <div className="bg-white rounded-lg border border-line shadow-e2 p-4 mb-4">
                <div className="text-[14px] font-semibold mb-2">Thêm khu vực cho {selected}</div>
                <div className="flex flex-wrap gap-2.5">
                  <input value={newCode} onChange={(e) => setNewCode(e.target.value)} placeholder={`Mã (vd ${selected}_LINE1)`} className="rounded-md border border-line-strong px-3 py-2 text-[14px] flex-1 min-w-[150px]" />
                  <input value={newName} onChange={(e) => setNewName(e.target.value)} placeholder="Tên khu vực" className="rounded-md border border-line-strong px-3 py-2 text-[14px] flex-1 min-w-[150px]" />
                  <input type="number" value={newSort} onChange={(e) => setNewSort(Number(e.target.value))} className="rounded-md border border-line-strong px-3 py-2 text-[14px] w-20" />
                  <button onClick={add} disabled={busy === "add"} className="btn btn-primary !min-h-10">{busy === "add" ? "…" : "Thêm"}</button>
                </div>
              </div>

              {/* Areas list */}
              <div className="bg-white rounded-lg border border-line shadow-e2 overflow-x-auto">
                <div className="flex items-center justify-between px-5 py-4 border-b border-line">
                  <span className="text-[16px] font-semibold">Khu vực ({shownAreas.length})</span>
                  <label className="flex items-center gap-2 text-[13px] text-ink-muted cursor-pointer">
                    <input type="checkbox" checked={includeInactive} onChange={(e) => setIncludeInactive(e.target.checked)} />
                    Hiện cả khu vực đã ẩn
                  </label>
                </div>
                {loadingAreas ? (
                  <div className="p-6 text-center text-ink-muted text-[14px]">Đang tải…</div>
                ) : shownAreas.length === 0 ? (
                  <div className="p-8 text-center">
                    <div className="text-[15px] font-semibold text-ink">Phòng ban này chưa có khu vực chụp.</div>
                    <div className="text-[13px] text-ink-muted mt-1 mb-4">Tạo nhanh khu vực Văn phòng để mở khoá chức năng chụp.</div>
                    <button onClick={() => runSeed("/api/admin/config/areas/seed-office", { departmentCode: selected }, "office")} disabled={!!busy} className="btn btn-primary !min-h-10">
                      {busy === "office" ? "Đang tạo…" : "Tạo khu vực Văn phòng"}
                    </button>
                  </div>
                ) : (
                  <table className="w-full border-collapse text-[14px]">
                    <thead>
                      <tr className="text-left text-[12px] uppercase tracking-wide text-ink-muted">
                        <th className="px-4 py-3 border-b border-line">Mã</th>
                        <th className="px-4 py-3 border-b border-line">Tên</th>
                        <th className="px-4 py-3 border-b border-line w-20">Thứ tự</th>
                        <th className="px-4 py-3 border-b border-line w-24">Trạng thái</th>
                        <th className="px-4 py-3 border-b border-line w-44">Thao tác</th>
                      </tr>
                    </thead>
                    <tbody>
                      {shownAreas.map((a) => (
                        <tr key={a.id} className={a.isActive ? "" : "opacity-60"}>
                          <td className="px-4 py-2.5 border-b border-line font-mono text-[12px]">{a.code}</td>
                          <td className="px-4 py-2.5 border-b border-line">
                            <input value={a.name} onChange={(e) => patch(a.id, { name: e.target.value })} className="rounded-md border border-line px-2 py-1.5 w-full" />
                          </td>
                          <td className="px-4 py-2.5 border-b border-line">
                            <input type="number" value={a.sortOrder} onChange={(e) => patch(a.id, { sortOrder: Number(e.target.value) })} className="rounded-md border border-line px-2 py-1.5 w-16" />
                          </td>
                          <td className="px-4 py-2.5 border-b border-line">
                            <span className={`text-[11px] font-bold px-2 h-6 rounded-pill grid place-items-center w-fit ${a.isActive ? "bg-success-bg text-success" : "bg-ink-muted/15 text-ink-muted"}`}>
                              {a.isActive ? "Hoạt động" : "Đã ẩn"}
                            </span>
                          </td>
                          <td className="px-4 py-2.5 border-b border-line">
                            <div className="flex gap-2">
                              <button onClick={() => save(a)} disabled={busy === a.id} className="btn btn-secondary !min-h-8 !px-3 text-[13px]">Lưu</button>
                              {a.isActive ? (
                                <button onClick={() => setActive(a, false)} disabled={busy === a.id} className="btn btn-ghost !min-h-8 !px-3 text-[13px] text-danger">Ẩn</button>
                              ) : (
                                <button onClick={() => setActive(a, true)} disabled={busy === a.id} className="btn btn-ghost !min-h-8 !px-3 text-[13px] text-success">Khôi phục</button>
                              )}
                            </div>
                          </td>
                        </tr>
                      ))}
                    </tbody>
                  </table>
                )}
              </div>
            </>
          )}
        </div>
      </div>
    </AdminShell>
  );
}

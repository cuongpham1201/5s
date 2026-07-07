"use client";

import { useCallback, useEffect, useMemo, useState } from "react";
import { AdminShell } from "@/components/layout/AdminShell";

interface Area {
  id: string; code: string; name: string;
  departmentCode: string; departments: string[];
  parentCode: string | null; hasOwnDepartments?: boolean;
  sortOrder: number; isActive: boolean;
}
interface Dept { code: string; name: string }

function DeptChecks({ depts, set, onToggle }: { depts: Dept[]; set: Set<string>; onToggle: (code: string) => void }) {
  return (
    <div className="grid grid-cols-2 md:grid-cols-3 gap-x-3 gap-y-1.5 max-h-[260px] overflow-y-auto pr-1">
      {depts.map((d) => (
        <label key={d.code} className="flex items-center gap-2 text-[12.5px] cursor-pointer">
          <input type="checkbox" checked={set.has(d.code)} onChange={() => onToggle(d.code)} />
          <span className="truncate"><b>{d.code}</b> · {d.name}</span>
        </label>
      ))}
    </div>
  );
}

/**
 * Quản lý KHU VỰC (mô hình mới): khu vực là DỮ LIỆU GỐC, mỗi khu vực gán NHIỀU
 * phòng ban (vd "Văn phòng tầng 2" gồm TCKS + KT + HCNS) → tổng hợp ảnh theo
 * khu vực xuyên phòng ban. Khu vực cũ (1 khu – 1 phòng) vẫn hoạt động nguyên.
 */
export default function AdminAreasPage() {
  const [areas, setAreas] = useState<Area[]>([]);
  const [depts, setDepts] = useState<Dept[]>([]);
  const [loading, setLoading] = useState(true);
  const [busy, setBusy] = useState(false);
  const [msg, setMsg] = useState<string | null>(null);
  const [err, setErr] = useState<string | null>(null);
  const [search, setSearch] = useState("");
  const [selectedId, setSelectedId] = useState<string | null>(null);
  const [showInactive, setShowInactive] = useState(false);
  // edit panel state
  const [editName, setEditName] = useState("");
  const [editDepts, setEditDepts] = useState<Set<string>>(new Set());
  // create form
  const [creating, setCreating] = useState(false);
  const [newName, setNewName] = useState("");
  const [newDepts, setNewDepts] = useState<Set<string>>(new Set());
  const [childName, setChildName] = useState("");
  const [expandedChild, setExpandedChild] = useState<string | null>(null);
  const [childDepts, setChildDepts] = useState<Set<string>>(new Set());

  const load = useCallback(async () => {
    setLoading(true);
    try {
      const [a, d] = await Promise.all([
        fetch("/api/admin/config/areas").then((r) => (r.ok ? r.json() : null)),
        fetch("/api/config/departments").then((r) => (r.ok ? r.json() : null)),
      ]);
      setAreas(a?.areas ?? []);
      setDepts(d?.departments ?? []);
    } finally { setLoading(false); }
  }, []);
  useEffect(() => { void load(); }, [load]);

  const flash = (ok: string | null, e: string | null) => { setMsg(ok); setErr(e); setTimeout(() => { setMsg(null); setErr(null); }, 4000); };

  const selected = useMemo(() => areas.find((a) => a.id === selectedId) ?? null, [areas, selectedId]);
  useEffect(() => {
    if (selected) { setEditName(selected.name); setEditDepts(new Set(selected.departments)); }
  }, [selected]);

  const children = useMemo(() => areas.filter((a) => a.parentCode), [areas]);
  const childrenOf = useMemo(() => {
    const m = new Map<string, Area[]>();
    for (const c of children) {
      const g = m.get(c.parentCode as string) ?? [];
      g.push(c);
      m.set(c.parentCode as string, g);
    }
    return m;
  }, [children]);
  const shown = useMemo(() => {
    const t = search.trim().toLowerCase();
    return areas
      .filter((a) => !a.parentCode) // chỉ NHÓM/khu vực độc lập; con quản lý trong panel
      .filter((a) => showInactive || a.isActive)
      .filter((a) => !t || a.name.toLowerCase().includes(t) || a.code.toLowerCase().includes(t) || a.departments.some((d) => d.toLowerCase().includes(t)));
  }, [areas, search, showInactive]);

  const toggleDept = (set: Set<string>, setter: (s: Set<string>) => void, code: string) => {
    const n = new Set(set);
    if (n.has(code)) n.delete(code); else n.add(code);
    setter(n);
  };

  const saveSelected = async () => {
    if (!selected) return;
    const hasKids = (childrenOf.get(selected.code)?.length ?? 0) > 0;
    if (!hasKids && editDepts.size === 0) { flash(null, "Khu vực phải gán ít nhất 1 phòng ban."); return; }
    setBusy(true);
    try {
      const r = await fetch(`/api/admin/config/areas/${selected.id}`, {
        method: "PATCH", headers: { "Content-Type": "application/json" },
        // Nhóm CÓ khu con = danh mục — chỉ đổi tên; gán PB nằm ở từng khu con.
        body: JSON.stringify(hasKids ? { name: editName.trim() } : { name: editName.trim(), departments: [...editDepts] }),
      });
      const j = await r.json();
      if (!r.ok || j.error) { flash(null, j.error ?? "Lỗi"); return; }
      flash(`Đã lưu "${editName.trim()}" (${editDepts.size} phòng ban).`, null);
      await load();
    } finally { setBusy(false); }
  };

  const openChildDepts = (c: Area) => {
    if (expandedChild === c.id) { setExpandedChild(null); return; }
    setExpandedChild(c.id);
    setChildDepts(new Set(c.hasOwnDepartments ? c.departments : []));
  };

  const saveChildDepts = async (c: Area) => {
    setBusy(true);
    try {
      const r = await fetch(`/api/admin/config/areas/${c.id}`, {
        method: "PATCH", headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ departments: [...childDepts] }),
      });
      const j = await r.json();
      if (!r.ok || j.error) { flash(null, j.error ?? "Lỗi"); return; }
      flash(`Đã gán ${childDepts.size} phòng ban cho "${c.name}".`, null);
      setExpandedChild(null);
      await load();
    } finally { setBusy(false); }
  };

  const addChild = async () => {
    if (!selected || !childName.trim()) return;
    setBusy(true);
    try {
      const r = await fetch("/api/admin/config/areas", {
        method: "POST", headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ name: childName.trim(), parentCode: selected.code }),
      });
      const j = await r.json();
      if (!r.ok || j.error) { flash(null, j.error ?? "Thêm khu con thất bại."); return; }
      flash(`Đã thêm khu vực con "${childName.trim()}" vào "${selected.name}".`, null);
      setChildName("");
      await load();
    } finally { setBusy(false); }
  };

  const quickRename = async (a: Area) => {
    const name = window.prompt(`Đổi tên khu vực "${a.name}" thành:`, a.name);
    if (name === null || !name.trim() || name.trim() === a.name) return;
    setBusy(true);
    try {
      const r = await fetch(`/api/admin/config/areas/${a.id}`, {
        method: "PATCH", headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ name: name.trim() }),
      });
      const j = await r.json();
      if (!r.ok || j.error) { flash(null, j.error ?? "Đổi tên thất bại."); return; }
      flash(`Đã đổi tên "${a.name}" → "${name.trim()}".`, null);
      await load();
    } finally { setBusy(false); }
  };

  const hardDelete = async (a: Area) => {
    if (!window.confirm(`Xóa VĨNH VIỄN khu vực "${a.name}"?\nChỉ xóa được khi khu vực chưa có lần gửi ảnh nào.`)) return;
    setBusy(true);
    try {
      const r = await fetch(`/api/admin/config/areas/${a.id}?hard=true&code=${encodeURIComponent(a.code)}`, { method: "DELETE" });
      const j = await r.json();
      if (!r.ok || j.error) { flash(null, j.error ?? "Không xóa được."); return; }
      flash(`Đã xóa vĩnh viễn "${a.name}".`, null);
      setSelectedId(null);
      await load();
    } finally { setBusy(false); }
  };

  const toggleActive = async (a: Area) => {
    setBusy(true);
    try {
      const r = a.isActive
        ? await fetch(`/api/admin/config/areas/${a.id}`, { method: "DELETE" })
        : await fetch(`/api/admin/config/areas/${a.id}`, { method: "PATCH", headers: { "Content-Type": "application/json" }, body: JSON.stringify({ isActive: true }) });
      const j = await r.json();
      if (!r.ok || j.error) { flash(null, j.error ?? "Lỗi"); return; }
      flash(a.isActive ? `Đã ẩn "${a.name}".` : `Đã khôi phục "${a.name}".`, null);
      await load();
    } finally { setBusy(false); }
  };

  const normalize = async () => {
    if (!window.confirm("Gộp tất cả khu vực TRÙNG TÊN thành một khu vực chung?\n- Khu vực gốc mới sẽ gán đủ các phòng ban liên quan\n- Các bản trùng bị ẨN (không xóa, ảnh cũ giữ nguyên)")) return;
    setBusy(true);
    try {
      const r = await fetch("/api/admin/config/areas/normalize", { method: "POST" });
      const j = await r.json();
      if (!r.ok || j.error) { flash(null, j.error ?? "Gộp thất bại."); return; }
      flash(j.merged === 0 ? "Không có khu vực trùng tên để gộp." : `Đã gộp ${j.merged} nhóm: ${j.groups.map((g: { name: string; departments: string[] }) => `"${g.name}" (${g.departments.length} PB)`).join(", ")}.`, null);
      await load();
    } finally { setBusy(false); }
  };

  const createArea = async () => {
    if (!newName.trim() || newDepts.size === 0) return;
    setBusy(true);
    try {
      const r = await fetch("/api/admin/config/areas", {
        method: "POST", headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ name: newName.trim(), departments: [...newDepts] }),
      });
      const j = await r.json();
      if (!r.ok || j.error) { flash(null, j.error ?? "Tạo thất bại."); return; }
      flash(`Đã ${j.action === "created" ? "tạo" : "cập nhật"} khu vực "${newName.trim()}" (${newDepts.size} phòng ban).`, null);
      setCreating(false); setNewName(""); setNewDepts(new Set());
      await load();
    } finally { setBusy(false); }
  };

  return (
    <AdminShell
      title="Khu vực 5S"
      subtitle="Khu vực là dữ liệu gốc — một khu vực dùng chung cho nhiều phòng ban (Config_Areas)"
      actions={
        <span className="flex gap-2">
          <button onClick={() => void normalize()} disabled={busy} className="btn btn-secondary !min-h-9">🔀 Gộp khu vực trùng tên</button>
          <button onClick={() => setCreating((v) => !v)} className="btn btn-primary !min-h-9">{creating ? "Đóng" : "+ Khu vực mới"}</button>
        </span>
      }
    >
      {msg && <div className="mb-3 rounded-md bg-success-bg text-success px-3.5 py-2.5 text-[13px] font-medium">{msg}</div>}
      {err && <div className="mb-3 rounded-md bg-danger-bg text-danger px-3.5 py-2.5 text-[13px] font-medium">{err}</div>}

      {creating && (
        <div className="bg-white rounded-lg border border-line shadow-e2 p-4 mb-4">
          <div className="text-[15px] font-semibold mb-2.5">Tạo khu vực mới</div>
          <input value={newName} onChange={(e) => setNewName(e.target.value)} placeholder="Tên khu vực (vd: Văn phòng tầng 2, Nhà ăn ca...)"
            className="w-full rounded-md border border-line px-3 py-2 text-[13.5px] mb-3" />
          <div className="text-[12.5px] font-semibold text-ink-muted mb-1.5">Gán phòng ban sử dụng khu vực này:</div>
          <DeptChecks depts={depts} set={newDepts} onToggle={(c) => toggleDept(newDepts, setNewDepts, c)} />
          <button onClick={createArea} disabled={busy || !newName.trim() || newDepts.size === 0} className="btn btn-primary !min-h-9 mt-3">
            {busy ? "Đang tạo…" : `Tạo khu vực (${newDepts.size} phòng ban)`}
          </button>
        </div>
      )}

      <div className="grid md:grid-cols-[340px_1fr] gap-4 items-start">
        {/* Danh sách khu vực gốc */}
        <div className="bg-white rounded-lg border border-line shadow-e2 overflow-hidden">
          <div className="p-3 border-b border-line">
            <input value={search} onChange={(e) => setSearch(e.target.value)} placeholder="Tìm khu vực / phòng ban…"
              className="w-full rounded-md border border-line px-3 py-2 text-[13px]" />
            <label className="flex items-center gap-1.5 text-[12px] text-ink-muted mt-2 cursor-pointer">
              <input type="checkbox" checked={showInactive} onChange={(e) => setShowInactive(e.target.checked)} /> Hiện khu vực đã ẩn
            </label>
          </div>
          <div className="max-h-[560px] overflow-y-auto">
            {loading ? (
              <div className="p-4 text-[13px] text-ink-muted">Đang tải…</div>
            ) : shown.length === 0 ? (
              <div className="p-4 text-[13px] text-ink-muted">Không có khu vực.</div>
            ) : shown.map((a) => (
              <div key={a.id} onClick={() => setSelectedId(a.id)}
                className={`w-full text-left px-4 py-2.5 border-b border-line last:border-0 cursor-pointer ${selectedId === a.id ? "bg-primary-100" : "hover:bg-surface"} ${a.isActive ? "" : "opacity-50"}`}>
                <div className="flex items-center justify-between gap-2">
                  <span className="text-[13.5px] font-semibold truncate">📍 {a.name}</span>
                  <span className="flex items-center gap-1.5 flex-none">
                    <button
                      onClick={(e) => { e.stopPropagation(); void quickRename(a); }}
                      title="Đổi tên khu vực"
                      className="w-6 h-6 grid place-items-center rounded hover:bg-line text-[13px]"
                    >✏️</button>
                    <span className="text-[11px] font-bold px-2 py-0.5 rounded-pill bg-success-bg text-success">{a.departments.length} PB</span>
                    {(childrenOf.get(a.code)?.length ?? 0) > 0 && (
                      <span className="text-[11px] font-bold px-2 py-0.5 rounded-pill bg-info-bg text-info">{childrenOf.get(a.code)!.length} khu con</span>
                    )}
                  </span>
                </div>
                <div className="text-[11.5px] text-ink-muted truncate mt-0.5">{a.departments.join(", ") || "(chưa gán)"} {!a.isActive && "· ĐÃ ẨN"}</div>
              </div>
            ))}
          </div>
        </div>

        {/* Panel gán phòng ban */}
        <div className="bg-white rounded-lg border border-line shadow-e2 p-4 min-h-[200px]">
          {!selected ? (
            <div className="grid place-items-center h-[160px] text-[13px] text-ink-muted">Chọn một khu vực bên trái để gán phòng ban.</div>
          ) : (
            <>
              <div className="flex items-start justify-between gap-2 mb-3">
                <div className="min-w-0 flex-1">
                  <label className="text-[12px] font-semibold text-ink-muted">Tên khu vực (sửa rồi bấm Lưu)</label>
                  <input value={editName} onChange={(e) => setEditName(e.target.value)} className="text-[16px] font-semibold rounded-md border border-line px-2.5 py-1.5 w-full mt-1" />
                  <div className="text-[11.5px] text-ink-muted font-mono mt-1">{selected.code}</div>
                </div>
                <div className="flex flex-col gap-1.5 flex-none">
                  <button onClick={() => void toggleActive(selected)} disabled={busy}
                    className={`btn !min-h-9 ${selected.isActive ? "btn-secondary" : "btn-primary"}`}>
                    {selected.isActive ? "Ẩn khu vực" : "Khôi phục"}
                  </button>
                  <button onClick={() => void hardDelete(selected)} disabled={busy} className="btn btn-danger !min-h-9">
                    🗑 Xóa vĩnh viễn
                  </button>
                </div>
              </div>
              {(childrenOf.get(selected.code)?.length ?? 0) === 0 ? (
                <>
                  <div className="text-[12.5px] font-semibold text-ink-muted mb-1.5">
                    Phòng ban sử dụng khu vực này ({editDepts.size}):
                  </div>
                  <DeptChecks depts={depts} set={editDepts} onToggle={(c) => toggleDept(editDepts, setEditDepts, c)} />
                </>
              ) : (
                <div className="rounded-md bg-info-bg text-info p-3 text-[12.5px]">
                  Nhóm này là DANH MỤC — phòng ban được gán Ở TỪNG KHU VỰC CON bên dưới.
                  Hiện hợp các khu con: <b>{[...new Set((childrenOf.get(selected.code) ?? []).flatMap((c) => (c.hasOwnDepartments ? c.departments : [])))].join(", ") || "(chưa khu con nào được gán)"}</b>
                </div>
              )}
              <button onClick={saveSelected} disabled={busy || !editName.trim() || ((childrenOf.get(selected.code)?.length ?? 0) === 0 && editDepts.size === 0)} className="btn btn-primary !min-h-9 mt-3">
                {busy ? "Đang lưu…" : "Lưu thay đổi"}
              </button>

              {/* Khu vực CON (vd Văn phòng → Tầng 1/2, WC, Sảnh…) */}
              <div className="mt-5 pt-4 border-t border-line">
                <div className="text-[13px] font-semibold text-ink-muted mb-2">
                  Khu vực con của &quot;{selected.name}&quot; ({(childrenOf.get(selected.code) ?? []).length})
                  <span className="font-normal"> — khi chụp, nhân viên chọn nhóm rồi chọn vị trí cụ thể</span>
                </div>
                <div className="flex gap-2 mb-2.5">
                  <input value={childName} onChange={(e) => setChildName(e.target.value)}
                    onKeyDown={(e) => { if (e.key === "Enter") void addChild(); }}
                    placeholder="Tên khu con (vd: Tầng 1, Khu WC, Dây chuyền 2…)"
                    className="flex-1 rounded-md border border-line px-3 py-2 text-[13px]" />
                  <button onClick={() => void addChild()} disabled={busy || !childName.trim()} className="btn btn-primary !min-h-9">+ Thêm</button>
                </div>
                {(childrenOf.get(selected.code) ?? []).length === 0 ? (
                  <div className="text-[12.5px] text-ink-muted">Chưa có khu vực con — nhóm này dùng trực tiếp khi chụp.</div>
                ) : (
                  <div className="flex flex-col gap-1.5">
                    {(childrenOf.get(selected.code) ?? []).map((c) => (
                      <div key={c.id} className={`rounded-md border border-line ${c.isActive ? "" : "opacity-50"}`}>
                        <div className="flex items-center gap-2 px-3 py-2">
                          <span className="text-[13px] font-medium flex-1 truncate">📍 {c.name} {!c.isActive && <i className="text-ink-muted">(đã ẩn)</i>}</span>
                          <button onClick={() => openChildDepts(c)}
                            className={`text-[11px] font-bold px-2 py-1 rounded-pill flex-none ${c.hasOwnDepartments && c.departments.length > 0 ? "bg-success-bg text-success" : "bg-warning-bg text-warning"}`}>
                            {c.hasOwnDepartments && c.departments.length > 0 ? `${c.departments.length} PB ▾` : "⚠ chưa gán ▾"}
                          </button>
                          <button onClick={() => void quickRename(c)} title="Đổi tên" className="w-6 h-6 grid place-items-center rounded hover:bg-line text-[13px]">✏️</button>
                          <button onClick={() => void toggleActive(c)} title={c.isActive ? "Ẩn" : "Khôi phục"} className="w-6 h-6 grid place-items-center rounded hover:bg-line text-[13px]">{c.isActive ? "🚫" : "↩️"}</button>
                          <button onClick={() => void hardDelete(c)} title="Xóa vĩnh viễn (chưa có ảnh)" className="w-6 h-6 grid place-items-center rounded hover:bg-line text-[13px]">🗑</button>
                        </div>
                        {expandedChild === c.id && (
                          <div className="border-t border-line px-3 py-2.5">
                            <div className="text-[12px] font-semibold text-ink-muted mb-1.5">Phòng ban được chụp tại &quot;{c.name}&quot; ({childDepts.size}) — chưa gán = không ai thấy:</div>
                            <DeptChecks depts={depts} set={childDepts} onToggle={(code) => toggleDept(childDepts, setChildDepts, code)} />
                            <button onClick={() => void saveChildDepts(c)} disabled={busy} className="btn btn-primary !min-h-8 mt-2 text-[12.5px]">Lưu gán PB</button>
                          </div>
                        )}
                      </div>
                    ))}
                  </div>
                )}
                <p className="text-[11.5px] text-ink-muted mt-2">
                  Mỗi khu con gán phòng ban RIÊNG (bấm nút &quot;n PB&quot;). Khu con chưa gán sẽ không hiện với ai khi chụp.
                </p>
              </div>

              <p className="text-[11.5px] text-ink-muted mt-2.5">
                Nhân viên các phòng ban được gán sẽ thấy khu vực này khi chuẩn bị chụp. Ảnh cũ không bị ảnh hưởng.
              </p>
            </>
          )}
        </div>
      </div>
    </AdminShell>
  );
}

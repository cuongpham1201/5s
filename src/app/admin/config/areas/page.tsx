"use client";

import { useCallback, useEffect, useMemo, useState } from "react";
import { AdminShell } from "@/components/layout/AdminShell";

interface Area {
  id: string; code: string; name: string;
  departmentCode: string; departments: string[];
  sortOrder: number; isActive: boolean;
}
interface Dept { code: string; name: string }

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

  const shown = useMemo(() => {
    const t = search.trim().toLowerCase();
    return areas
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
    if (editDepts.size === 0) { flash(null, "Khu vực phải gán ít nhất 1 phòng ban."); return; }
    setBusy(true);
    try {
      const r = await fetch(`/api/admin/config/areas/${selected.id}`, {
        method: "PATCH", headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ name: editName.trim(), departments: [...editDepts] }),
      });
      const j = await r.json();
      if (!r.ok || j.error) { flash(null, j.error ?? "Lỗi"); return; }
      flash(`Đã lưu "${editName.trim()}" (${editDepts.size} phòng ban).`, null);
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

  const DeptChecks = ({ set, setter }: { set: Set<string>; setter: (s: Set<string>) => void }) => (
    <div className="grid grid-cols-2 md:grid-cols-3 gap-x-3 gap-y-1.5 max-h-[260px] overflow-y-auto pr-1">
      {depts.map((d) => (
        <label key={d.code} className="flex items-center gap-2 text-[12.5px] cursor-pointer">
          <input type="checkbox" checked={set.has(d.code)} onChange={() => toggleDept(set, setter, d.code)} />
          <span className="truncate"><b>{d.code}</b> · {d.name}</span>
        </label>
      ))}
    </div>
  );

  return (
    <AdminShell
      title="Khu vực 5S"
      subtitle="Khu vực là dữ liệu gốc — một khu vực dùng chung cho nhiều phòng ban (Config_Areas)"
      actions={<button onClick={() => setCreating((v) => !v)} className="btn btn-primary !min-h-9">{creating ? "Đóng" : "+ Khu vực mới"}</button>}
    >
      {msg && <div className="mb-3 rounded-md bg-success-bg text-success px-3.5 py-2.5 text-[13px] font-medium">{msg}</div>}
      {err && <div className="mb-3 rounded-md bg-danger-bg text-danger px-3.5 py-2.5 text-[13px] font-medium">{err}</div>}

      {creating && (
        <div className="bg-white rounded-lg border border-line shadow-e2 p-4 mb-4">
          <div className="text-[15px] font-semibold mb-2.5">Tạo khu vực mới</div>
          <input value={newName} onChange={(e) => setNewName(e.target.value)} placeholder="Tên khu vực (vd: Văn phòng tầng 2, Nhà ăn ca...)"
            className="w-full rounded-md border border-line px-3 py-2 text-[13.5px] mb-3" />
          <div className="text-[12.5px] font-semibold text-ink-muted mb-1.5">Gán phòng ban sử dụng khu vực này:</div>
          <DeptChecks set={newDepts} setter={setNewDepts} />
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
              <button key={a.id} onClick={() => setSelectedId(a.id)}
                className={`w-full text-left px-4 py-2.5 border-b border-line last:border-0 ${selectedId === a.id ? "bg-primary-100" : "hover:bg-surface"} ${a.isActive ? "" : "opacity-50"}`}>
                <div className="flex items-center justify-between gap-2">
                  <span className="text-[13.5px] font-semibold truncate">📍 {a.name}</span>
                  <span className="text-[11px] font-bold px-2 py-0.5 rounded-pill bg-success-bg text-success flex-none">{a.departments.length} PB</span>
                </div>
                <div className="text-[11.5px] text-ink-muted truncate mt-0.5">{a.departments.join(", ") || "(chưa gán)"} {!a.isActive && "· ĐÃ ẨN"}</div>
              </button>
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
              <div className="text-[12.5px] font-semibold text-ink-muted mb-1.5">
                Phòng ban sử dụng khu vực này ({editDepts.size}):
              </div>
              <DeptChecks set={editDepts} setter={setEditDepts} />
              <button onClick={saveSelected} disabled={busy || !editName.trim() || editDepts.size === 0} className="btn btn-primary !min-h-9 mt-3">
                {busy ? "Đang lưu…" : "Lưu thay đổi"}
              </button>
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

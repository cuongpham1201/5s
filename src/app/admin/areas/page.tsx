"use client";

import { useCallback, useEffect, useMemo, useState } from "react";
import { AdminShell } from "@/components/layout/AdminShell";

/* ══ types (khớp API) ══ */
interface Area {
  id: number; areaCode: string; areaName: string; parentId: number | null;
  areaType: "group" | "location" | "capture_point"; isCaptureRequired: boolean;
  isActive: boolean; sortOrder: number; description: string | null;
  assignedDeptCount: number; childCount: number;
}
interface Asg {
  id: number; departmentCode: string; areaId: number; areaCode: string; areaName: string;
  areaActive: boolean; assignmentType: string; isRequired: boolean; isActive: boolean;
  source: string; reviewStatus: string; unresolvedDepartment: boolean; note: string | null;
  effectiveFrom: string | null; effectiveTo: string | null; responsibleEmployeeId: number | null;
}
interface Dept { code: string; name: string }
interface Change { id: number; entityType: string; entityId: number; action: string; oldValue: unknown; newValue: unknown; actorEmail: string | null; createdAt: string }
interface DQ {
  requiredAreasWithoutAssignment: Array<{ areaId: number; areaCode: string; areaName: string }>;
  assignmentsToInactiveArea: Array<{ assignmentId: number; departmentCode: string; areaCode: string }>;
  unresolvedAssignments: Array<{ assignmentId: number; departmentCode: string; areaCode: string }>;
  pendingReviewCount: number;
  cycles: Array<{ id: number; areaCode: string }>;
  departmentsWithoutRequiredArea: string[];
  assignmentDeptCodesNotActive: string[];
  inactiveAreasUsedInHistory: string[];
  orphanChildren: Array<{ areaId: number; areaCode: string }>;
  duplicateAssignments: number;
}

const TYPE_LABEL: Record<string, string> = { group: "Nhóm", location: "Khu vực", capture_point: "Điểm chụp" };
const TYPE_ICON: Record<string, string> = { group: "🗂", location: "🏢", capture_point: "📍" };
const SRC_LABEL: Record<string, string> = {
  manual: "Thủ công", migrated_direct: "Migrate trực tiếp",
  migrated_bulk_csv: "Migrate hàng loạt", migrated_inherited: "Migrate kế thừa",
};
const fmt = (iso?: string | null) => { if (!iso) return "—"; const d = new Date(iso); return Number.isNaN(d.getTime()) ? "—" : d.toLocaleString("vi-VN"); };

/** Flatten tree theo depth để render danh sách thụt lề. */
function flattenTree(areas: Area[]): Array<Area & { depth: number }> {
  const byParent = new Map<number | null, Area[]>();
  for (const a of areas) {
    const k = a.parentId != null && areas.some((x) => x.id === a.parentId) ? a.parentId : null;
    byParent.set(k, [...(byParent.get(k) ?? []), a]);
  }
  const out: Array<Area & { depth: number }> = [];
  const walk = (parent: number | null, depth: number) => {
    for (const a of (byParent.get(parent) ?? []).sort((x, y) => x.sortOrder - y.sortOrder || x.areaName.localeCompare(y.areaName, "vi"))) {
      out.push({ ...a, depth });
      walk(a.id, depth + 1);
    }
  };
  walk(null, 0);
  return out;
}

async function api(url: string, body?: unknown, method = body ? "POST" : "GET"): Promise<Record<string, never> & { ok?: boolean; error?: string } & Record<string, unknown>> {
  const r = await fetch(url, {
    method, cache: "no-store",
    ...(body ? { headers: { "content-type": "application/json" }, body: JSON.stringify(body) } : {}),
  });
  return r.json();
}

export default function AdminAreasPage() {
  const [tab, setTab] = useState<"catalog" | "assign" | "quality" | "history">("catalog");
  const [msg, setMsg] = useState<{ ok: boolean; text: string } | null>(null);
  const [busy, setBusy] = useState(false);
  const flash = (ok: boolean, text: string) => setMsg({ ok, text });

  const run = async (fn: () => Promise<unknown>, okText = "Đã thực hiện.") => {
    setBusy(true); setMsg(null);
    try {
      const d = (await fn()) as { ok?: boolean; error?: string };
      if (d && d.ok === false) flash(false, d.error ?? "Lỗi");
      else flash(true, okText);
    } catch (e) { flash(false, String(e)); }
    finally { setBusy(false); }
  };

  /* ── shared data ── */
  const [areas, setAreas] = useState<Area[]>([]);
  const [depts, setDepts] = useState<Dept[]>([]);
  const loadAreas = useCallback(async () => {
    const d = await api("/api/admin/areas");
    setAreas((d.areas as Area[]) ?? []);
  }, []);
  useEffect(() => {
    void loadAreas();
    void api("/api/config/departments").then((d) => setDepts((d.departments as Dept[]) ?? []));
  }, [loadAreas]);
  const flat = useMemo(() => flattenTree(areas), [areas]);
  const activeFlat = useMemo(() => flat.filter((a) => a.isActive), [flat]);

  /* ══ TAB 1 — Danh mục ══ */
  const [showInactive, setShowInactive] = useState(false);
  const [selId, setSelId] = useState<number | null>(null);
  const sel = areas.find((a) => a.id === selId) ?? null;
  const [form, setForm] = useState({ areaName: "", areaType: "capture_point", isCaptureRequired: true, sortOrder: 0, description: "" });
  useEffect(() => {
    if (sel) setForm({ areaName: sel.areaName, areaType: sel.areaType, isCaptureRequired: sel.isCaptureRequired, sortOrder: sel.sortOrder, description: sel.description ?? "" });
  }, [selId]); // eslint-disable-line react-hooks/exhaustive-deps
  const [newArea, setNewArea] = useState<{ open: boolean; parentId: number | null }>({ open: false, parentId: null });
  const [na, setNa] = useState({ areaCode: "", areaName: "", areaType: "capture_point", isCaptureRequired: true });

  const saveArea = () => sel && run(async () => {
    const d = await api(`/api/admin/areas/${sel.id}`, { action: "update", ...form });
    await loadAreas(); return d;
  }, "Đã lưu khu vực.");
  const createNew = () => run(async () => {
    const d = await api("/api/admin/areas", { ...na, parentId: newArea.parentId });
    if ((d as { ok?: boolean }).ok !== false) { setNewArea({ open: false, parentId: null }); setNa({ areaCode: "", areaName: "", areaType: "capture_point", isCaptureRequired: true }); }
    await loadAreas(); return d;
  }, "Đã tạo khu vực.");
  const moveSel = () => {
    if (!sel) return;
    const target = window.prompt(`Di chuyển "${sel.areaName}" vào NHÓM nào? Nhập mã khu vực cha (trống = ra gốc):`);
    if (target === null) return;
    const parent = target.trim() ? areas.find((a) => a.areaCode === target.trim()) : null;
    if (target.trim() && !parent) { flash(false, `Không thấy mã "${target.trim()}".`); return; }
    void run(async () => {
      const d = await api(`/api/admin/areas/${sel.id}`, { action: "move", newParentId: parent?.id ?? null });
      await loadAreas(); return d;
    }, "Đã di chuyển (assignment giữ nguyên).");
  };
  const areaAction = (action: string, confirmText?: string) => {
    if (!sel) return;
    if (confirmText && !window.confirm(confirmText)) return;
    void run(async () => {
      const d = await api(`/api/admin/areas/${sel.id}`, { action });
      if (action === "delete" && (d as { ok?: boolean }).ok !== false) setSelId(null);
      await loadAreas(); return d;
    });
  };

  // Kéo-thả đổi cha + đổi thứ tự (P5)
  const [dragId, setDragId] = useState<number | null>(null);
  const dropMove = (targetParentId: number | null, targetName: string) => {
    if (dragId == null) return;
    const dragged = areas.find((a) => a.id === dragId);
    setDragId(null);
    if (!dragged || dragged.id === targetParentId) return;
    if (!window.confirm(`Chuyển "${dragged.areaName}" vào ${targetParentId == null ? "GỐC" : `nhóm "${targetName}"`}? (assignment giữ nguyên)`)) return;
    void run(async () => {
      const d = await api(`/api/admin/areas/${dragged.id}`, { action: "move", newParentId: targetParentId });
      await loadAreas(); return d;
    }, "Đã di chuyển (kéo-thả).");
  };
  const reorder = (dir: -1 | 1) => {
    if (!sel) return;
    const siblings = flat.filter((a) => a.parentId === sel.parentId && a.isActive === sel.isActive)
      .sort((x, y) => x.sortOrder - y.sortOrder || x.areaName.localeCompare(y.areaName, "vi"));
    const i = siblings.findIndex((a) => a.id === sel.id);
    const j = i + dir;
    if (i < 0 || j < 0 || j >= siblings.length) return;
    const other = siblings[j];
    // Hoán đổi sortOrder (nếu trùng thì tách giá trị để ổn định)
    const a1 = other.sortOrder === sel.sortOrder ? sel.sortOrder + dir : other.sortOrder;
    const a2 = other.sortOrder === sel.sortOrder ? sel.sortOrder : sel.sortOrder;
    void run(async () => {
      await api(`/api/admin/areas/${sel.id}`, { action: "update", sortOrder: a1 });
      const d = await api(`/api/admin/areas/${other.id}`, { action: "update", sortOrder: a2 });
      await loadAreas(); return d;
    }, "Đã đổi thứ tự.");
  };

  /* ══ TAB 2 — Gán phòng ban ══ */
  const [mode, setMode] = useState<"byDept" | "byArea" | "review">("byDept");
  const [pickDept, setPickDept] = useState("");
  const [deptAsgs, setDeptAsgs] = useState<Asg[]>([]);
  const [pickAreaId, setPickAreaId] = useState<number | null>(null);
  const [areaAsgs, setAreaAsgs] = useState<Asg[]>([]);
  const [areaQ, setAreaQ] = useState("");
  const [selAreas, setSelAreas] = useState<Set<number>>(new Set());
  const loadDeptAsgs = useCallback(async (code: string) => {
    if (!code) { setDeptAsgs([]); return; }
    const d = await api(`/api/admin/area-assignments/review?departmentCode=${encodeURIComponent(code)}`);
    setDeptAsgs((d.assignments as Asg[]) ?? []);
  }, []);
  const loadAreaAsgs = useCallback(async (id: number | null) => {
    if (id == null) { setAreaAsgs([]); return; }
    const d = await api(`/api/admin/area-assignments/review?areaId=${id}`);
    setAreaAsgs((d.assignments as Asg[]) ?? []);
  }, []);
  useEffect(() => { void loadDeptAsgs(pickDept); }, [pickDept, loadDeptAsgs]);
  useEffect(() => { void loadAreaAsgs(pickAreaId); }, [pickAreaId, loadAreaAsgs]);
  const activeAsgByArea = useMemo(() => new Map(deptAsgs.filter((s) => s.isActive).map((s) => [s.areaId, s])), [deptAsgs]);

  const toggleAssign = (a: Area) => {
    const cur = activeAsgByArea.get(a.id);
    void run(async () => {
      const d = cur
        ? await api(`/api/admin/area-assignments/${cur.id}/reject-or-deactivate`, {})
        : await api("/api/admin/area-assignments", { departmentCode: pickDept, areaId: a.id });
      await loadDeptAsgs(pickDept); await loadAreas(); return d;
    }, cur ? "Đã bỏ gán." : "Đã gán.");
  };
  const bulkAssignVisible = () => {
    const targets = activeFlat.filter((a) => a.areaType !== "group" && !activeAsgByArea.get(a.id));
    if (!targets.length) { flash(false, "Không còn khu nào chưa gán."); return; }
    if (!window.confirm(`Hệ thống sẽ tạo ${targets.length} assignment RIÊNG BIỆT cho ${pickDept} (không kế thừa). Tiếp tục?`)) return;
    void run(async () => {
      const d = await api("/api/admin/area-assignments/bulk-assign", { departmentCode: pickDept, areaIds: targets.map((t) => t.id) });
      await loadDeptAsgs(pickDept); await loadAreas(); return d;
    }, `Đã tạo ${targets.length} assignment.`);
  };
  const updateAsg = (s: Asg, patch: Record<string, unknown>, reload: () => Promise<void>) =>
    run(async () => { const d = await api(`/api/admin/area-assignments/${s.id}/update`, patch); await reload(); return d; }, "Đã cập nhật.");
  const addDeptToArea = () => {
    const code = window.prompt("Mã phòng ban cần gán vào khu vực này:");
    if (!code?.trim() || pickAreaId == null) return;
    void run(async () => {
      const d = await api("/api/admin/area-assignments", { departmentCode: code.trim().toUpperCase(), areaId: pickAreaId });
      await loadAreaAsgs(pickAreaId); await loadAreas(); return d;
    }, "Đã gán.");
  };

  const bulkAssignSelected = () => {
    const targets = [...selAreas].filter((id) => !activeAsgByArea.get(id));
    if (!targets.length) { flash(false, "Các khu đã chọn đều đã gán."); return; }
    if (!window.confirm(`Hệ thống sẽ tạo ${targets.length} assignment RIÊNG BIỆT cho ${pickDept}. Tiếp tục?`)) return;
    void run(async () => {
      const d = await api("/api/admin/area-assignments/bulk-assign", { departmentCode: pickDept, areaIds: targets });
      setSelAreas(new Set()); await loadDeptAsgs(pickDept); await loadAreas(); return d;
    }, `Đã gán ${targets.length} khu.`);
  };
  const bulkRemoveSelected = () => {
    const ids = [...selAreas].map((id) => activeAsgByArea.get(id)?.id).filter((x): x is number => x != null);
    if (!ids.length) { flash(false, "Các khu đã chọn chưa có assignment để bỏ."); return; }
    if (!window.confirm(`Bỏ gán ${ids.length} assignment của ${pickDept}? (soft — giữ lịch sử)`)) return;
    void run(async () => {
      const d = await api("/api/admin/area-assignments/bulk-review", { ids, action: "reject" });
      setSelAreas(new Set()); await loadDeptAsgs(pickDept); await loadAreas(); return d;
    }, `Đã bỏ gán ${ids.length} khu.`);
  };

  /* review sub-view (P2) */
  const [fSource, setFSource] = useState(""); const [fReview, setFReview] = useState("pending_review"); const [fUnres, setFUnres] = useState(false);
  const [revRows, setRevRows] = useState<Asg[]>([]); const [selRev, setSelRev] = useState<Set<number>>(new Set());
  const loadReview = useCallback(async () => {
    const qs = new URLSearchParams();
    if (fSource) qs.set("source", fSource); if (fReview) qs.set("review", fReview); if (fUnres) qs.set("unresolved", "1");
    const d = await api(`/api/admin/area-assignments/review?${qs}`);
    setRevRows((d.assignments as Asg[]) ?? []); setSelRev(new Set());
  }, [fSource, fReview, fUnres]);
  useEffect(() => { if (tab === "assign" && mode === "review") void loadReview(); }, [tab, mode, loadReview]);
  const bulkReview = (action: "approve" | "reject") => {
    if (!selRev.size || !window.confirm(`${action === "approve" ? "Duyệt" : "Loại"} ${selRev.size} assignment?`)) return;
    void run(async () => { const d = await api("/api/admin/area-assignments/bulk-review", { ids: [...selRev], action }); await loadReview(); return d; });
  };

  /* ══ TAB 3 — Kiểm tra dữ liệu ══ */
  const [dq, setDq] = useState<DQ | null>(null);
  const [unresRows, setUnresRows] = useState<Asg[]>([]);
  const [remapTo, setRemapTo] = useState("MKT");
  const loadQuality = useCallback(async () => {
    const [q, u] = await Promise.all([
      api("/api/admin/areas/data-quality"),
      api("/api/admin/area-assignments/review?unresolved=1"),
    ]);
    setDq((q.issues as DQ) ?? null);
    setUnresRows((u.assignments as Asg[]) ?? []);
  }, []);
  useEffect(() => { if (tab === "quality") void loadQuality(); }, [tab, loadQuality]);
  const unresCodes = useMemo(() => [...new Set(unresRows.map((r) => r.departmentCode))], [unresRows]);
  const doRemap = (from: string) => {
    if (!remapTo.trim()) return;
    const rows = unresRows.filter((r) => r.departmentCode === from);
    if (!window.confirm(`Remap ${from} → ${remapTo.trim().toUpperCase()} cho ${rows.length} assignment (update-in-place, đụng trùng sẽ tự loại row nguồn)?`)) return;
    void run(async () => {
      const d = await api("/api/admin/area-assignments/remap-department", { fromCode: from, toCode: remapTo.trim().toUpperCase() });
      await loadQuality(); return d;
    }, "Đã remap.");
  };
  const deactivateUnres = (from: string) => {
    const rows = unresRows.filter((r) => r.departmentCode === from);
    if (!window.confirm(`Loại (deactivate) ${rows.length} assignment của ${from}? (không có lịch sử submission — an toàn)`)) return;
    void run(async () => {
      const d = await api("/api/admin/area-assignments/bulk-review", { ids: rows.map((r) => r.id), action: "reject" });
      await loadQuality(); return d;
    }, "Đã loại.");
  };
  /* ══ TAB 4 — Lịch sử ══ */
  const [changes, setChanges] = useState<Change[]>([]);
  const [cEntity, setCEntity] = useState(""); const [cAction, setCAction] = useState("");
  const loadChanges = useCallback(async () => {
    const qs = new URLSearchParams();
    if (cEntity) qs.set("entity", cEntity); if (cAction) qs.set("action", cAction);
    const d = await api(`/api/admin/areas/changes?${qs}`);
    setChanges((d.changes as Change[]) ?? []);
  }, [cEntity, cAction]);
  useEffect(() => { if (tab === "history") void loadChanges(); }, [tab, loadChanges]);

  /* ══ render ══ */
  const TabBtn = ({ k, label }: { k: typeof tab; label: string }) => (
    <button onClick={() => setTab(k)}
      className={`px-3.5 py-2 rounded-t-md text-[13.5px] font-semibold border-b-2 ${tab === k ? "border-primary-600 text-primary-700 bg-white" : "border-transparent text-ink-muted"}`}>
      {label}
    </button>
  );

  return (
    <AdminShell
      title="Khu vực 5S"
      subtitle="Danh mục cây · gán phòng ban tường minh (không kế thừa) · kiểm tra dữ liệu · lịch sử"
      actions={<button onClick={() => window.alert("Import Excel: đang phát triển.\nNguồn dữ liệu khu vực chính thức là PostgreSQL — tạo/sửa trực tiếp tại Tab 1 và Tab 2.")} className="btn btn-secondary !min-h-10">Import Excel</button>}
    >
      <div className="flex gap-1 border-b border-line mb-4">
        <TabBtn k="catalog" label="1 · Danh mục khu vực" />
        <TabBtn k="assign" label="2 · Gán phòng ban" />
        <TabBtn k="quality" label="3 · Kiểm tra dữ liệu" />
        <TabBtn k="history" label="4 · Lịch sử" />
      </div>
      {msg && <div className={`text-[13px] mb-3 rounded-md px-3.5 py-2.5 ${msg.ok ? "bg-success-bg text-success" : "bg-danger-bg text-danger"}`}>{msg.text}</div>}

      {/* ════ TAB 1 ════ */}
      {tab === "catalog" && (
        <div className="grid lg:grid-cols-2 gap-4">
          <div className="bg-white rounded-lg border border-line shadow-e2">
            <div className="flex items-center gap-3 px-4 py-3 border-b border-line">
              <span className="text-[14px] font-semibold flex-1">Cây khu vực</span>
              <label className="text-[12px] flex items-center gap-1"><input type="checkbox" checked={showInactive} onChange={(e) => setShowInactive(e.target.checked)} /> hiện khu ẩn</label>
              <button onClick={() => setNewArea({ open: true, parentId: null })} className="text-[12.5px] font-semibold text-primary-600">+ Khu vực gốc</button>
            </div>
            {dragId != null && (
              <div onDragOver={(e) => e.preventDefault()} onDrop={(e) => { e.preventDefault(); dropMove(null, ""); }}
                className="mx-3 my-2 border-2 border-dashed border-primary-600/50 rounded-md text-center text-[12px] text-primary-600 py-2">
                Thả vào đây để đưa RA GỐC
              </div>
            )}
            <div className="max-h-[520px] overflow-y-auto">
              {(showInactive ? flat : flat.filter((a) => a.isActive)).map((a) => (
                <button key={a.id} onClick={() => setSelId(a.id)}
                  draggable
                  onDragStart={() => setDragId(a.id)}
                  onDragOver={(e) => e.preventDefault()}
                  onDrop={(e) => { e.preventDefault(); dropMove(a.id, a.areaName); }}
                  title="Kéo thả vào nhóm khác để đổi cha"
                  className={`w-full text-left px-4 py-2 border-b border-line last:border-0 flex items-center gap-2 ${selId === a.id ? "bg-primary-100/60" : ""} ${!a.isActive ? "opacity-45" : ""} ${dragId === a.id ? "opacity-40" : ""}`}
                  style={{ paddingLeft: `${16 + a.depth * 22}px` }}>
                  <span>{TYPE_ICON[a.areaType]}</span>
                  <span className="flex-1 min-w-0">
                    <span className="block text-[13.5px] font-semibold truncate">{a.areaName}</span>
                    <span className="block text-[11px] text-ink-muted truncate">{a.areaCode}</span>
                  </span>
                  <span className="text-[10.5px] font-bold px-1.5 py-0.5 rounded-pill bg-surface text-ink-muted">{TYPE_LABEL[a.areaType]}</span>
                  {a.isCaptureRequired && <span className="text-[10.5px] font-bold px-1.5 py-0.5 rounded-pill bg-success-bg text-success">KPI</span>}
                  <span className="text-[11px] text-ink-muted w-12 text-right">{a.assignedDeptCount} phòng</span>
                </button>
              ))}
              {flat.length === 0 && <div className="p-6 text-center text-ink-muted text-[13px]">Chưa có khu vực — dùng nút Import ở góc phải.</div>}
            </div>
          </div>

          <div className="bg-white rounded-lg border border-line shadow-e2 p-4">
            {newArea.open ? (
              <>
                <div className="text-[14px] font-semibold mb-3">Tạo khu vực {newArea.parentId ? `con của "${areas.find((a) => a.id === newArea.parentId)?.areaName}"` : "gốc"}</div>
                <div className="grid gap-2.5">
                  <input value={na.areaCode} onChange={(e) => setNa({ ...na, areaCode: e.target.value })} placeholder="Mã (vd KV_KHO_A)" className="rounded-md border border-line-strong px-3 py-2 text-[13.5px]" />
                  <input value={na.areaName} onChange={(e) => setNa({ ...na, areaName: e.target.value })} placeholder="Tên khu vực" className="rounded-md border border-line-strong px-3 py-2 text-[13.5px]" />
                  <select value={na.areaType} onChange={(e) => setNa({ ...na, areaType: e.target.value })} className="rounded-md border border-line-strong px-3 py-2 text-[13.5px]">
                    <option value="capture_point">Điểm chụp</option><option value="location">Khu vực</option><option value="group">Nhóm</option>
                  </select>
                  <label className="text-[13px] flex items-center gap-1.5"><input type="checkbox" checked={na.isCaptureRequired} onChange={(e) => setNa({ ...na, isCaptureRequired: e.target.checked })} /> Bắt buộc chụp (tính KPI)</label>
                </div>
                <div className="flex gap-2 mt-3">
                  <button onClick={createNew} disabled={busy} className="btn btn-primary !min-h-9">Tạo</button>
                  <button onClick={() => setNewArea({ open: false, parentId: null })} className="btn btn-secondary !min-h-9">Huỷ</button>
                </div>
              </>
            ) : !sel ? (
              <div className="text-[13px] text-ink-muted p-6 text-center">Chọn một khu vực bên trái để xem/sửa.</div>
            ) : (
              <>
                <div className="text-[14px] font-semibold mb-1">{sel.areaName}</div>
                <div className="text-[12px] text-ink-muted mb-3">
                  Mã: <b>{sel.areaCode}</b> · Cha: {areas.find((a) => a.id === sel.parentId)?.areaName ?? "—"} ·
                  {" "}{sel.assignedDeptCount} phòng đang gán (chỉnh ở Tab 2) · {sel.childCount} khu con ·
                  {" "}{sel.isActive ? "đang hoạt động" : "ĐANG ẨN"}
                </div>
                <div className="grid gap-2.5">
                  <input value={form.areaName} onChange={(e) => setForm({ ...form, areaName: e.target.value })} className="rounded-md border border-line-strong px-3 py-2 text-[13.5px]" />
                  <div className="flex gap-2.5">
                    <select value={form.areaType} onChange={(e) => setForm({ ...form, areaType: e.target.value })} className="flex-1 rounded-md border border-line-strong px-3 py-2 text-[13.5px]">
                      <option value="capture_point">Điểm chụp</option><option value="location">Khu vực</option><option value="group">Nhóm</option>
                    </select>
                    <input type="number" value={form.sortOrder} onChange={(e) => setForm({ ...form, sortOrder: Number(e.target.value) })} className="w-24 rounded-md border border-line-strong px-3 py-2 text-[13.5px]" title="Thứ tự" />
                  </div>
                  <label className="text-[13px] flex items-center gap-1.5"><input type="checkbox" checked={form.isCaptureRequired} onChange={(e) => setForm({ ...form, isCaptureRequired: e.target.checked })} /> Bắt buộc chụp (tính KPI)</label>
                  <textarea value={form.description} onChange={(e) => setForm({ ...form, description: e.target.value })} placeholder="Mô tả" rows={2} className="rounded-md border border-line-strong px-3 py-2 text-[13.5px]" />
                </div>
                <div className="flex flex-wrap gap-2 mt-3">
                  <button onClick={saveArea} disabled={busy} className="btn btn-primary !min-h-9">Lưu</button>
                  <button onClick={() => setNewArea({ open: true, parentId: sel.id })} className="btn btn-secondary !min-h-9">+ Thêm khu con</button>
                  <button onClick={moveSel} className="btn btn-secondary !min-h-9">Di chuyển</button>
                  <button onClick={() => reorder(-1)} className="btn btn-secondary !min-h-9" title="Lên trong nhóm">↑</button>
                  <button onClick={() => reorder(1)} className="btn btn-secondary !min-h-9" title="Xuống trong nhóm">↓</button>
                  {sel.isActive
                    ? <button onClick={() => areaAction("deactivate", `Ẩn "${sel.areaName}"? (không xuất hiện trong picker/KPI, lịch sử giữ nguyên)`)} className="btn btn-secondary !min-h-9 text-warning">Ẩn</button>
                    : <button onClick={() => areaAction("reactivate")} className="btn btn-secondary !min-h-9 text-success">Kích hoạt lại</button>}
                  <button onClick={() => areaAction("delete", `XÓA VĨNH VIỄN "${sel.areaName}"? Chỉ được khi chưa có assignment/khu con.`)} className="btn btn-secondary !min-h-9 text-danger">Xóa (nếu chưa dùng)</button>
                </div>
              </>
            )}
          </div>
        </div>
      )}

      {/* ════ TAB 2 ════ */}
      {tab === "assign" && (
        <>
          <div className="flex gap-1.5 mb-3">
            {([["byDept", "Theo phòng ban"], ["byArea", "Theo khu vực"], ["review", "Duyệt migration"]] as const).map(([k, l]) => (
              <button key={k} onClick={() => setMode(k)} className={`px-3 py-1.5 rounded-pill text-[12.5px] font-semibold border ${mode === k ? "bg-primary-600 text-white border-primary-600" : "bg-white border-line"}`}>{l}</button>
            ))}
          </div>

          {mode === "byDept" && (
            <div className="bg-white rounded-lg border border-line shadow-e2 p-4">
              <div className="flex flex-wrap items-center gap-2.5 mb-3">
                <select value={pickDept} onChange={(e) => setPickDept(e.target.value)} className="rounded-md border border-line-strong px-3 py-2 text-[13.5px]">
                  <option value="">— Chọn phòng ban —</option>
                  {depts.map((d) => <option key={d.code} value={d.code}>{d.code} · {d.name}</option>)}
                </select>
                {pickDept && (
                  <>
                    <input value={areaQ} onChange={(e) => setAreaQ(e.target.value)} placeholder="Tìm khu vực…"
                      className="rounded-md border border-line-strong px-3 py-2 text-[13.5px] w-48" />
                    <span className="text-[12.5px] text-ink-muted">
                      Đã gán {deptAsgs.filter((s) => s.isActive).length} khu · bắt buộc {deptAsgs.filter((s) => s.isActive && s.isRequired).length}
                      {selAreas.size > 0 && <> · chọn {selAreas.size}</>}
                    </span>
                    <span className="flex-1" />
                    <button onClick={bulkAssignSelected} disabled={busy || !selAreas.size} className="btn btn-primary !min-h-9">Gán đã chọn</button>
                    <button onClick={bulkRemoveSelected} disabled={busy || !selAreas.size} className="btn btn-secondary !min-h-9">Bỏ gán đã chọn</button>
                    <button onClick={bulkAssignVisible} disabled={busy} className="btn btn-secondary !min-h-9">Gán tất cả đang hiển thị</button>
                  </>
                )}
              </div>
              {pickDept && (
                <div className="max-h-[480px] overflow-y-auto border border-line rounded-md">
                  {activeFlat.filter((a) => !areaQ.trim() || a.areaName.toLowerCase().includes(areaQ.trim().toLowerCase()) || a.areaCode.toLowerCase().includes(areaQ.trim().toLowerCase())).map((a) => {
                    const asg = activeAsgByArea.get(a.id);
                    return (
                      <div key={a.id} className="flex items-center gap-2.5 px-3 py-2 border-b border-line last:border-0" style={{ paddingLeft: `${12 + a.depth * 20}px` }}>
                        <input type="checkbox" checked={selAreas.has(a.id)} disabled={a.areaType === "group"}
                          onChange={(e) => { const n = new Set(selAreas); if (e.target.checked) n.add(a.id); else n.delete(a.id); setSelAreas(n); }}
                          title="Chọn để gán/bỏ gán hàng loạt" />
                        <input type="checkbox" checked={!!asg} disabled={busy || a.areaType === "group"} onChange={() => toggleAssign(a)}
                          className="accent-[var(--success)]" title={a.areaType === "group" ? "Nhóm — không gán trực tiếp" : "Trạng thái GÁN (tick = tạo assignment)"} />
                        <span>{TYPE_ICON[a.areaType]}</span>
                        <span className="flex-1 text-[13px] font-medium truncate">{a.areaName} <span className="text-ink-muted">({a.areaCode})</span></span>
                        {asg && (
                          <label className="text-[11.5px] flex items-center gap-1 text-ink-muted">
                            <input type="checkbox" checked={asg.isRequired} disabled={busy} onChange={(e) => updateAsg(asg, { isRequired: e.target.checked }, () => loadDeptAsgs(pickDept))} /> bắt buộc
                          </label>
                        )}
                        {asg && asg.reviewStatus === "pending_review" && <span className="text-[10px] font-bold px-1.5 py-0.5 rounded-pill bg-warning-bg text-warning">chờ duyệt</span>}
                      </div>
                    );
                  })}
                </div>
              )}
              <div className="text-[11.5px] text-ink-muted mt-2">Tick cha KHÔNG tự tick con — mỗi checkbox là một assignment thật.</div>
            </div>
          )}

          {mode === "byArea" && (
            <div className="bg-white rounded-lg border border-line shadow-e2 p-4">
              <div className="flex flex-wrap items-center gap-2.5 mb-3">
                <select value={pickAreaId ?? ""} onChange={(e) => setPickAreaId(e.target.value ? Number(e.target.value) : null)} className="rounded-md border border-line-strong px-3 py-2 text-[13.5px]">
                  <option value="">— Chọn khu vực —</option>
                  {flat.map((a) => <option key={a.id} value={a.id}>{"· ".repeat(a.depth)}{a.areaName} ({a.areaCode}){a.isActive ? "" : " [ẩn]"}</option>)}
                </select>
                {pickAreaId != null && <button onClick={addDeptToArea} disabled={busy} className="btn btn-secondary !min-h-9">+ Gán phòng ban</button>}
              </div>
              {pickAreaId != null && (
                <table className="w-full text-[13px]">
                  <thead className="text-ink-muted text-left"><tr className="border-b border-line">
                    <th className="px-2 py-2">Phòng</th><th className="px-2 py-2">Loại</th><th className="px-2 py-2">Bắt buộc</th>
                    <th className="px-2 py-2">Hiệu lực</th><th className="px-2 py-2">Trạng thái</th><th className="px-2 py-2"></th>
                  </tr></thead>
                  <tbody>
                    {areaAsgs.map((s) => (
                      <tr key={s.id} className={`border-b border-line last:border-0 ${!s.isActive ? "opacity-45" : ""}`}>
                        <td className="px-2 py-2 font-semibold">{s.departmentCode}{s.unresolvedDepartment && <span className="ml-1 text-[10px] font-bold text-danger">unresolved</span>}</td>
                        <td className="px-2 py-2">
                          <select value={s.assignmentType} disabled={busy || !s.isActive} onChange={(e) => updateAsg(s, { assignmentType: e.target.value }, () => loadAreaAsgs(pickAreaId))} className="rounded border border-line px-1.5 py-1 text-[12px]">
                            <option value="owner">owner</option><option value="participant">participant</option><option value="shared">shared</option>
                          </select>
                        </td>
                        <td className="px-2 py-2"><input type="checkbox" checked={s.isRequired} disabled={busy || !s.isActive} onChange={(e) => updateAsg(s, { isRequired: e.target.checked }, () => loadAreaAsgs(pickAreaId))} /></td>
                        <td className="px-2 py-2 text-[11.5px] text-ink-muted">{s.effectiveFrom ?? "—"} → {s.effectiveTo ?? "—"}</td>
                        <td className="px-2 py-2 text-[11.5px]">{s.isActive ? (s.reviewStatus === "approved" ? "duyệt" : "chờ duyệt") : "đã loại"}</td>
                        <td className="px-2 py-2">{s.isActive && <button onClick={() => run(async () => { const d = await api(`/api/admin/area-assignments/${s.id}/reject-or-deactivate`, {}); await loadAreaAsgs(pickAreaId); return d; }, "Đã bỏ gán.")} className="text-danger text-[12px] font-semibold">Bỏ gán</button>}</td>
                      </tr>
                    ))}
                    {areaAsgs.length === 0 && <tr><td colSpan={6} className="px-2 py-5 text-center text-ink-muted">Chưa phòng ban nào được gán.</td></tr>}
                  </tbody>
                </table>
              )}
            </div>
          )}

          {mode === "review" && (
            <>
              <div className="flex flex-wrap items-center gap-2 mb-3">
                <select value={fSource} onChange={(e) => setFSource(e.target.value)} className="rounded-md border border-line-strong px-2.5 py-1.5 text-[13px]">
                  <option value="">Mọi nguồn</option><option value="migrated_direct">Migrate trực tiếp</option>
                  <option value="migrated_bulk_csv">Migrate hàng loạt</option><option value="manual">Thủ công</option>
                </select>
                <select value={fReview} onChange={(e) => setFReview(e.target.value)} className="rounded-md border border-line-strong px-2.5 py-1.5 text-[13px]">
                  <option value="">Mọi trạng thái</option><option value="pending_review">Chờ duyệt</option><option value="approved">Đã duyệt</option>
                </select>
                <label className="text-[13px] flex items-center gap-1.5"><input type="checkbox" checked={fUnres} onChange={(e) => setFUnres(e.target.checked)} /> chỉ unresolved</label>
                <span className="flex-1" />
                <button onClick={() => bulkReview("approve")} disabled={!selRev.size || busy} className="btn btn-primary !min-h-9">Duyệt {selRev.size || ""}</button>
                <button onClick={() => bulkReview("reject")} disabled={!selRev.size || busy} className="btn btn-secondary !min-h-9">Loại</button>
              </div>
              <div className="bg-white rounded-lg border border-line shadow-e2 overflow-x-auto">
                <table className="w-full text-[13px]">
                  <thead className="text-ink-muted text-left"><tr className="border-b border-line">
                    <th className="px-3 py-2"><input type="checkbox" checked={selRev.size === revRows.length && revRows.length > 0} onChange={(e) => setSelRev(e.target.checked ? new Set(revRows.map((r) => r.id)) : new Set())} /></th>
                    <th className="px-3 py-2">Phòng</th><th className="px-3 py-2">Khu vực</th><th className="px-3 py-2">Nguồn</th><th className="px-3 py-2">Trạng thái</th><th className="px-3 py-2"></th>
                  </tr></thead>
                  <tbody>
                    {revRows.map((r) => (
                      <tr key={r.id} className={`border-b border-line last:border-0 ${!r.isActive ? "opacity-45" : ""}`}>
                        <td className="px-3 py-2"><input type="checkbox" checked={selRev.has(r.id)} onChange={(e) => { const n = new Set(selRev); if (e.target.checked) n.add(r.id); else n.delete(r.id); setSelRev(n); }} /></td>
                        <td className="px-3 py-2 font-semibold">{r.departmentCode}{r.unresolvedDepartment && <span className="ml-1.5 px-1.5 py-0.5 rounded-pill text-[10px] font-bold bg-danger-bg text-danger">unresolved</span>}</td>
                        <td className="px-3 py-2">{r.areaCode} · {r.areaName}</td>
                        <td className="px-3 py-2">{SRC_LABEL[r.source] ?? r.source}</td>
                        <td className="px-3 py-2 text-[12px]">{!r.isActive ? "đã loại" : r.reviewStatus === "approved" ? "đã duyệt" : "chờ duyệt"}</td>
                        <td className="px-3 py-2">
                          <div className="flex gap-2 text-[12px] font-semibold">
                            {r.isActive && r.reviewStatus !== "approved" && !r.unresolvedDepartment &&
                              <button onClick={() => run(async () => { const d = await api(`/api/admin/area-assignments/${r.id}/approve`, {}); await loadReview(); return d; })} className="text-success">Duyệt</button>}
                            {r.unresolvedDepartment && <span className="text-ink-muted">remap ở Tab 3</span>}
                            {r.isActive && <button onClick={() => run(async () => { const d = await api(`/api/admin/area-assignments/${r.id}/reject-or-deactivate`, {}); await loadReview(); return d; })} className="text-danger">Loại</button>}
                          </div>
                        </td>
                      </tr>
                    ))}
                    {revRows.length === 0 && <tr><td colSpan={6} className="px-3 py-6 text-center text-ink-muted">Không có assignment khớp bộ lọc.</td></tr>}
                  </tbody>
                </table>
              </div>
            </>
          )}
        </>
      )}

      {/* ════ TAB 3 ════ */}
      {tab === "quality" && (
        <div className="flex flex-col gap-4">
          {/* HEALTH DASHBOARD — % healthy tính từ các nhóm cảnh báo bên dưới */}
          {dq && (() => {
            const issueCount =
              dq.requiredAreasWithoutAssignment.length + dq.unresolvedAssignments.length +
              dq.assignmentsToInactiveArea.length + dq.cycles.length +
              dq.departmentsWithoutRequiredArea.length + dq.assignmentDeptCodesNotActive.length +
              (dq.orphanChildren?.length ?? 0) + (dq.duplicateAssignments ?? 0);
            const activeCapture = activeFlat.filter((a) => a.areaType !== "group" && a.isCaptureRequired).length;
            const healthyAreas = activeCapture - dq.requiredAreasWithoutAssignment.length;
            const healthPct = activeCapture ? Math.round((healthyAreas / activeCapture) * 100) : 100;
            return (
              <div className="grid grid-cols-2 lg:grid-cols-5 gap-3">
                {([
                  ["% khu vực healthy", `${healthPct}%`, issueCount === 0 ? "text-success" : healthPct >= 90 ? "text-warning" : "text-danger"],
                  ["Tổng cảnh báo", issueCount, issueCount === 0 ? "text-success" : "text-danger"],
                  ["Unresolved", dq.unresolvedAssignments.length, dq.unresolvedAssignments.length ? "text-danger" : "text-success"],
                  ["Chờ duyệt", dq.pendingReviewCount, dq.pendingReviewCount ? "text-warning" : "text-success"],
                  ["Điểm chụp active", activeCapture, ""],
                ] as Array<[string, unknown, string]>).map(([label, value, tone]) => (
                  <div key={label} className="bg-white rounded-lg border border-line shadow-e2 p-3.5">
                    <div className="text-[11.5px] text-ink-muted font-semibold">{label}</div>
                    <div className={`text-[22px] font-bold mt-0.5 tracking-tight ${tone}`}>{String(value)}</div>
                  </div>
                ))}
              </div>
            );
          })()}

          {/* Unresolved panel — hiện đủ assignment nguồn TRƯỚC khi remap */}
          {unresCodes.map((code) => (
            <div key={code} className="bg-white rounded-lg border border-danger/40 shadow-e2 p-4">
              <div className="text-[14px] font-bold text-danger mb-1">Mã phòng chưa resolve: {code} ({unresRows.filter((r) => r.departmentCode === code).length} assignment)</div>
              <div className="text-[12px] text-ink-muted mb-2">Các assignment nguồn (không tính picker/KPI cho tới khi xử lý):</div>
              <ul className="text-[13px] mb-3 list-disc pl-5">
                {unresRows.filter((r) => r.departmentCode === code).map((r) => (
                  <li key={r.id}>{r.areaCode} · {r.areaName} <span className="text-ink-muted">({SRC_LABEL[r.source] ?? r.source})</span></li>
                ))}
              </ul>
              <div className="flex flex-wrap items-center gap-2">
                <span className="text-[13px] font-semibold">{code} →</span>
                <input value={remapTo} onChange={(e) => setRemapTo(e.target.value)} className="w-28 rounded-md border border-line-strong px-2.5 py-1.5 text-[13px]" />
                <button onClick={() => doRemap(code)} disabled={busy} className="btn btn-primary !min-h-9">Remap (update-in-place)</button>
                <button onClick={() => deactivateUnres(code)} disabled={busy} className="btn btn-secondary !min-h-9 text-danger">Loại tất cả</button>
                <span className="text-[11.5px] text-ink-muted">Đụng assignment đã có của mã đích → tự loại row nguồn, không duplicate.</span>
              </div>
            </div>
          ))}

          {dq && (
            <div className="grid lg:grid-cols-2 gap-4">
              {([
                ["Khu bắt buộc chụp CHƯA gán phòng", dq.requiredAreasWithoutAssignment.map((x) => `${x.areaCode} · ${x.areaName}`)],
                ["Phòng active CHƯA có khu bắt buộc", dq.departmentsWithoutRequiredArea],
                ["Assignment trỏ khu ĐANG ẨN", dq.assignmentsToInactiveArea.map((x) => `#${x.assignmentId} ${x.departmentCode} @ ${x.areaCode}`)],
                ["Mã phòng trong assignment KHÔNG active", dq.assignmentDeptCodesNotActive],
                ["Cây có cycle", dq.cycles.map((c) => c.areaCode)],
                ["Khu con ACTIVE nhưng cha bị ẨN (orphan)", (dq.orphanChildren ?? []).map((o) => o.areaCode)],
                ["Duplicate assignment (unique constraint verify)", dq.duplicateAssignments ? [`${dq.duplicateAssignments} nhóm trùng!`] : []],
                ["Khu ẨN còn trong submission lịch sử (chỉ thông tin — snapshot vẫn hiển thị)", dq.inactiveAreasUsedInHistory],
              ] as Array<[string, string[]]>).map(([title, items]) => (
                <div key={title} className="bg-white rounded-lg border border-line shadow-e2 p-4">
                  <div className="text-[13px] font-semibold mb-1.5">{title} <span className={`ml-1 px-1.5 py-0.5 rounded-pill text-[11px] font-bold ${items.length ? "bg-warning-bg text-warning" : "bg-success-bg text-success"}`}>{items.length}</span></div>
                  {items.length ? <ul className="text-[12.5px] list-disc pl-5">{items.slice(0, 12).map((s, i) => <li key={i}>{s}</li>)}{items.length > 12 && <li className="text-ink-muted">+{items.length - 12}…</li>}</ul>
                    : <div className="text-[12.5px] text-ink-muted">Sạch ✓</div>}
                </div>
              ))}
            </div>
          )}
        </div>
      )}

      {/* ════ TAB 4 ════ */}
      {tab === "history" && (
        <>
          <div className="flex gap-2 mb-3">
            <select value={cEntity} onChange={(e) => setCEntity(e.target.value)} className="rounded-md border border-line-strong px-2.5 py-1.5 text-[13px]">
              <option value="">Mọi entity</option><option value="area">Khu vực</option><option value="assignment">Assignment</option>
            </select>
            <select value={cAction} onChange={(e) => setCAction(e.target.value)} className="rounded-md border border-line-strong px-2.5 py-1.5 text-[13px]">
              <option value="">Mọi action</option>
              {["create", "update", "move", "deactivate", "reactivate", "assign", "unassign", "bulk_assign", "approve"].map((a) => <option key={a} value={a}>{a}</option>)}
            </select>
          </div>
          <div className="bg-white rounded-lg border border-line shadow-e2 overflow-x-auto">
            <table className="w-full text-[13px]">
              <thead className="text-ink-muted text-left"><tr className="border-b border-line">
                <th className="px-3 py-2">#</th><th className="px-3 py-2">Thời gian</th><th className="px-3 py-2">Actor</th>
                <th className="px-3 py-2">Entity</th><th className="px-3 py-2">Action</th><th className="px-3 py-2">Trước/Sau</th>
              </tr></thead>
              <tbody>
                {changes.map((c) => (
                  <tr key={c.id} className="border-b border-line last:border-0 align-top">
                    <td className="px-3 py-2">{c.id}</td>
                    <td className="px-3 py-2 whitespace-nowrap">{fmt(c.createdAt)}</td>
                    <td className="px-3 py-2">{c.actorEmail ?? "—"}</td>
                    <td className="px-3 py-2">{c.entityType}#{c.entityId}</td>
                    <td className="px-3 py-2 font-semibold">{c.action}</td>
                    <td className="px-3 py-2">
                      <details><summary className="cursor-pointer text-primary-600 text-[12px]">JSON</summary>
                        <pre className="text-[10.5px] bg-surface rounded p-2 mt-1 max-w-[420px] overflow-x-auto">{JSON.stringify({ old: c.oldValue, new: c.newValue }, null, 1)}</pre>
                      </details>
                    </td>
                  </tr>
                ))}
                {changes.length === 0 && <tr><td colSpan={6} className="px-3 py-6 text-center text-ink-muted">Chưa có thay đổi.</td></tr>}
              </tbody>
            </table>
          </div>
        </>
      )}

    </AdminShell>
  );
}

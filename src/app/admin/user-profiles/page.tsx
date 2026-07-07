"use client";

import { useCallback, useEffect, useMemo, useState } from "react";
import { AdminShell } from "@/components/layout/AdminShell";

interface Profile {
  email: string;
  displayName: string | null;
  departmentRaw: string | null;
  departmentCode: string | null;
  departmentName: string | null;
  lastLogin: string | null;
  lastDepartmentSync: string | null;
  departmentResolved: boolean;
}

function fmt(iso?: string | null): string {
  if (!iso) return "—";
  const d = new Date(iso);
  if (Number.isNaN(d.getTime())) return "—";
  const p = (n: number) => String(n).padStart(2, "0");
  return `${p(d.getDate())}/${p(d.getMonth() + 1)} ${p(d.getHours())}:${p(d.getMinutes())}`;
}

export default function UserProfilesPage() {
  const [rows, setRows] = useState<Profile[]>([]);
  const [loading, setLoading] = useState(true);
  const [busy, setBusy] = useState<string | null>(null);
  const [search, setSearch] = useState("");
  const [msg, setMsg] = useState<string | null>(null);

  const load = useCallback(async () => {
    setLoading(true);
    try {
      const r = await fetch("/api/admin/user-profiles");
      const d = r.ok ? await r.json() : null;
      setRows(d?.profiles ?? []);
    } finally {
      setLoading(false);
    }
  }, []);

  useEffect(() => { void load(); }, [load]);

  const resync = async (email: string) => {
    setBusy(email);
    try {
      const r = await fetch("/api/admin/user-profiles", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ email }),
      });
      const d = await r.json();
      setMsg(r.ok ? `Đã sync lại ${email}: ${d.profile?.departmentCode ?? "—"}` : (d.error ?? "Lỗi sync"));
      setTimeout(() => setMsg(null), 3000);
      await load();
    } finally {
      setBusy(null);
    }
  };

  const shown = useMemo(() => {
    const t = search.trim().toLowerCase();
    return rows.filter((p) => !t || p.email.toLowerCase().includes(t) || (p.displayName ?? "").toLowerCase().includes(t));
  }, [rows, search]);

  return (
    <AdminShell
      title="Hồ sơ người dùng"
      subtitle="Data_UserProfiles · phòng ban resolve 1 lần, đồng bộ khi đổi"
      actions={
        <button
          onClick={async () => {
            if (!window.confirm("Đồng bộ DANH BẠ toàn công ty từ Microsoft 365?\n(Dùng cho ô chọn người vi phạm khi chụp — cần quyền User.Read.All)")) return;
            setBusy("__dir__");
            try {
              const r = await fetch("/api/admin/directory/sync", { method: "POST" });
              const j = await r.json();
              setMsg(j.ok ? `Đồng bộ danh bạ xong: ${j.total} user (${j.created} mới, ${j.updated} cập nhật).` : (j.error ?? "Đồng bộ thất bại."));
            } finally { setBusy(null); }
          }}
          disabled={busy === "__dir__"}
          className="btn btn-primary !min-h-9"
        >
          {busy === "__dir__" ? "Đang đồng bộ…" : "🔄 Đồng bộ danh bạ M365"}
        </button>
      }
    >
      {msg && <div className="mb-4 text-[13px] bg-info-bg text-info px-3.5 py-2.5 rounded-md">{msg}</div>}
      <div className="mb-3">
        <input value={search} onChange={(e) => setSearch(e.target.value)} placeholder="Tìm email / tên…" className="rounded-md border border-line px-3 py-2 text-[14px] w-full max-w-sm" />
      </div>
      <div className="bg-white rounded-lg border border-line shadow-e2 overflow-x-auto">
        <div className="px-5 py-4 border-b border-line text-[16px] font-semibold">Người dùng ({shown.length})</div>
        {loading ? (
          <div className="p-6 text-center text-ink-muted text-[14px]">Đang tải…</div>
        ) : shown.length === 0 ? (
          <div className="p-8 text-center text-ink-muted text-[14px]">Chưa có hồ sơ nào (hồ sơ tạo khi user đăng nhập lần đầu).</div>
        ) : (
          <table className="w-full border-collapse text-[14px]">
            <thead>
              <tr className="text-left text-[12px] uppercase tracking-wide text-ink-muted">
                <th className="px-4 py-3 border-b border-line">Người dùng</th>
                <th className="px-4 py-3 border-b border-line">Dept Raw</th>
                <th className="px-4 py-3 border-b border-line">Code · Name</th>
                <th className="px-4 py-3 border-b border-line">Last login</th>
                <th className="px-4 py-3 border-b border-line">Last sync</th>
                <th className="px-4 py-3 border-b border-line w-28">Trạng thái</th>
                <th className="px-4 py-3 border-b border-line w-28">Thao tác</th>
              </tr>
            </thead>
            <tbody>
              {shown.map((p) => (
                <tr key={p.email}>
                  <td className="px-4 py-2.5 border-b border-line">
                    <div className="font-medium">{p.displayName ?? "—"}</div>
                    <div className="text-[12px] text-ink-muted break-all">{p.email}</div>
                  </td>
                  <td className="px-4 py-2.5 border-b border-line text-[12.5px]">{p.departmentRaw ?? "—"}</td>
                  <td className="px-4 py-2.5 border-b border-line text-[12.5px]">{p.departmentCode ?? "—"}{p.departmentName ? ` · ${p.departmentName}` : ""}</td>
                  <td className="px-4 py-2.5 border-b border-line text-[12.5px]">{fmt(p.lastLogin)}</td>
                  <td className="px-4 py-2.5 border-b border-line text-[12.5px]">{fmt(p.lastDepartmentSync)}</td>
                  <td className="px-4 py-2.5 border-b border-line">
                    <span className={`text-[11px] font-bold px-2 h-6 rounded-pill grid place-items-center w-fit ${p.departmentResolved ? "bg-success-bg text-success" : "bg-danger-bg text-danger"}`}>
                      {p.departmentResolved ? "Resolved" : "Chưa resolve"}
                    </span>
                  </td>
                  <td className="px-4 py-2.5 border-b border-line">
                    <button onClick={() => resync(p.email)} disabled={busy === p.email} className="btn btn-secondary !min-h-8 !px-3 text-[13px]">
                      {busy === p.email ? "…" : "Sync lại"}
                    </button>
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

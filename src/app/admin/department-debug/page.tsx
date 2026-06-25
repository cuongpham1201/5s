"use client";

import { useEffect, useState } from "react";
import Link from "next/link";
import type { MeResponse } from "@/lib/graph/graph-types";

interface RawMe {
  source?: string;
  department?: string | null;
  displayName?: string | null;
  mail?: string | null;
  jobTitle?: string | null;
  officeLocation?: string | null;
  error?: string;
}
interface DeptOption {
  code: string;
  name: string;
  sortOrder: number;
}

export default function DepartmentDebugPage() {
  const [raw, setRaw] = useState<RawMe | null>(null);
  const [me, setMe] = useState<MeResponse | null>(null);
  const [depts, setDepts] = useState<DeptOption[] | null>(null);
  const [loading, setLoading] = useState(true);

  useEffect(() => {
    Promise.all([
      fetch("/api/debug/me").then((r) => r.json()).catch(() => null),
      fetch("/api/me").then((r) => r.json()).catch(() => null),
      fetch("/api/admin/sharepoint/departments").then((r) => r.json()).catch(() => null),
    ]).then(([d, m, list]) => {
      setRaw(d);
      setMe(m);
      setDepts(list?.departments ?? null);
      setLoading(false);
    });
  }, []);

  return (
    <div className="max-w-[720px] mx-auto p-5 min-h-screen">
      <div className="flex items-center justify-between mb-4">
        <h1 className="text-[22px] font-bold">Department Debug</h1>
        <Link href="/me" className="btn btn-secondary !min-h-9">Hồ sơ</Link>
      </div>

      {loading && <div className="text-ink-muted">Đang tải…</div>}

      {!loading && (
        <div className="flex flex-col gap-4">
          <div className="card">
            <div className="text-[14px] font-bold mb-2">Graph /me (raw)</div>
            <div className="text-[13px] text-ink-muted">source: {raw?.source ?? "—"}</div>
            <div className="text-[13px]">department (raw): <b>{raw?.department ?? "NULL"}</b></div>
            <div className="text-[13px] text-ink-muted">displayName: {raw?.displayName ?? "—"} · {raw?.mail ?? "—"}</div>
            {raw?.error && <div className="text-[13px] text-danger">error: {raw.error}</div>}
          </div>

          <div className="card">
            <div className="text-[14px] font-bold mb-2">Kết quả resolve (/api/me)</div>
            <div className="text-[13px]">resolved: <b className={me?.departmentResolved ? "text-success" : "text-danger"}>{String(me?.departmentResolved)}</b></div>
            <div className="text-[13px]">code: {me?.departmentCode ?? "—"} · name: {me?.departmentName ?? "—"}</div>
            <div className="text-[13px]">source: {me?.departmentSource ?? "—"}</div>
            {me?.departmentWarning && <div className="text-[13px] text-warning mt-1">{me.departmentWarning}</div>}
          </div>

          <div className="card">
            <div className="text-[14px] font-bold mb-2">Config_Departments (active: {depts?.length ?? 0})</div>
            {depts && depts.length > 0 ? (
              <div className="flex flex-col gap-1">
                {depts.map((d) => (
                  <div key={d.code} className="text-[13px] flex justify-between border-b border-line py-1">
                    <span className="font-mono">{d.code}</span>
                    <span className="text-ink-muted">{d.name}</span>
                  </div>
                ))}
              </div>
            ) : (
              <div className="text-[13px] text-ink-muted">Trống hoặc không đọc được.</div>
            )}
          </div>
          <p className="text-[12px] text-ink-disabled text-center">Trang dev/admin — chẩn đoán mapping phòng ban.</p>
        </div>
      )}
    </div>
  );
}

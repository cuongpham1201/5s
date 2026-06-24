"use client";

import { useCallback, useEffect, useState } from "react";

type State = "FOUND" | "MISSING" | "ERROR";
interface Health {
  site: State;
  library: State;
  folders: Record<string, State>;
  lists: Record<string, State>;
  ready: boolean;
  diagnostics?: {
    tokenAcquired: string;
    tenant: string;
    clientIdMasked: string;
    drives: string[];
    libraryRootChildren: string[];
    siteLists: string[];
    note?: string;
  };
  error?: string;
}

function Pill({ s }: { s: State }) {
  const cls = s === "FOUND" ? "bg-success-bg text-success" : s === "MISSING" ? "bg-warning-bg text-warning" : "bg-danger-bg text-danger";
  return <span className={`text-[12px] font-bold px-2 h-6 rounded-pill grid place-items-center ${cls}`}>{s}</span>;
}

export default function SharePointHealthPage() {
  const [health, setHealth] = useState<Health | null>(null);
  const [loading, setLoading] = useState(true);
  const [action, setAction] = useState<string | null>(null);
  const [actionResult, setActionResult] = useState<unknown>(null);

  const load = useCallback(async () => {
    setLoading(true);
    try {
      const r = await fetch("/api/admin/sharepoint/health");
      setHealth(await r.json());
    } catch (e) {
      setHealth({ site: "ERROR", library: "ERROR", folders: {}, lists: {}, ready: false, error: String(e) });
    } finally {
      setLoading(false);
    }
  }, []);

  useEffect(() => {
    void load();
  }, [load]);

  const run = async (path: string, label: string) => {
    setAction(label);
    setActionResult(null);
    try {
      const r = await fetch(path, { method: "POST" });
      setActionResult(await r.json());
    } catch (e) {
      setActionResult({ error: String(e) });
    } finally {
      setAction(null);
      void load();
    }
  };

  return (
    <div className="max-w-[720px] mx-auto p-5 min-h-screen">
      <div className="flex items-center justify-between mb-4">
        <h1 className="text-[22px] font-bold">SharePoint Health · Ban5S</h1>
        <button onClick={() => void load()} className="btn btn-secondary !min-h-9">Làm mới</button>
      </div>

      {loading && <div className="text-ink-muted">Đang kiểm tra…</div>}

      {health && (
        <div className="flex flex-col gap-4">
          <div className="card flex items-center gap-3">
            <span className={`text-[14px] font-bold ${health.ready ? "text-success" : "text-warning"}`}>
              {health.ready ? "READY" : "NOT READY"}
            </span>
            <span className="text-ink-muted text-[13px]">token: {health.diagnostics?.tokenAcquired} · client {health.diagnostics?.clientIdMasked}</span>
          </div>

          <div className="card-flat divide-y divide-line overflow-hidden">
            <div className="flex items-center justify-between px-4 py-2.5"><span>Site</span><Pill s={health.site} /></div>
            <div className="flex items-center justify-between px-4 py-2.5"><span>Library “5S”</span><Pill s={health.library} /></div>
          </div>

          <div>
            <div className="text-[14px] font-bold mb-1.5">Folders (trong library 5S)</div>
            <div className="card-flat divide-y divide-line overflow-hidden">
              {Object.entries(health.folders).map(([k, v]) => (
                <div key={k} className="flex items-center justify-between px-4 py-2.5"><span>{k}</span><Pill s={v} /></div>
              ))}
            </div>
          </div>

          <div>
            <div className="text-[14px] font-bold mb-1.5">Lists (site-level)</div>
            <div className="card-flat divide-y divide-line overflow-hidden">
              {Object.entries(health.lists).map(([k, v]) => (
                <div key={k} className="flex items-center justify-between px-4 py-2.5"><span className="font-mono text-[13px]">{k}</span><Pill s={v} /></div>
              ))}
            </div>
          </div>

          {health.diagnostics && (
            <div className="card text-[12px] text-ink-muted">
              <div>drives: {health.diagnostics.drives.join(", ") || "—"}</div>
              <div>5S root: {health.diagnostics.libraryRootChildren.join(", ") || "—"}</div>
              <div>site lists: {health.diagnostics.siteLists.join(", ") || "—"}</div>
              {health.diagnostics.note && <div className="text-danger mt-1">note: {health.diagnostics.note}</div>}
            </div>
          )}

          <div className="flex gap-2.5">
            <button
              disabled={!!action}
              onClick={() => run("/api/admin/sharepoint/provision", "provision")}
              className="btn btn-primary flex-1"
            >
              {action === "provision" ? "Đang tạo…" : "Provision lists"}
            </button>
            <button
              disabled={!!action}
              onClick={() => run("/api/admin/sharepoint/import-departments", "import")}
              className="btn btn-secondary flex-1"
            >
              {action === "import" ? "Đang đồng bộ…" : "Import departments (org)"}
            </button>
            <button
              disabled={!!action}
              onClick={() => run("/api/admin/sharepoint/seed-config", "seed")}
              className="btn btn-secondary flex-1"
            >
              {action === "seed" ? "Đang seed…" : "Seed (dev)"}
            </button>
          </div>

          {actionResult != null && (
            <pre className="card text-[11px] overflow-x-auto whitespace-pre-wrap">{JSON.stringify(actionResult, null, 2)}</pre>
          )}
        </div>
      )}
    </div>
  );
}

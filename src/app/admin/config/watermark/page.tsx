"use client";

import { useCallback, useEffect, useState } from "react";
import { AdminShell } from "@/components/layout/AdminShell";
import { DEFAULT_WATERMARK_CONFIG, normalizeWatermarkConfig, type WatermarkConfig } from "@/lib/watermark/watermark-types";

const LINES: { key: keyof WatermarkConfig; label: string; sample: string }[] = [
  { key: "showWeekday", label: "Thứ trong tuần", sample: "Thứ Năm" },
  { key: "showAddress", label: "Địa chỉ (GPS → địa chỉ)", sample: "123 Đường ABC, Hạ Long" },
  { key: "showDepartment", label: "Phòng ban", sample: "Phòng ban: BPSH" },
  { key: "showArea", label: "Khu vực", sample: "Khu vực: Khu vực chung" },
  { key: "showCheckItem", label: "Hạng mục", sample: "Hạng mục: Thực hành 5S hàng ngày" },
  { key: "showReporter", label: "Người chụp", sample: "Người chụp: Admin" },
  { key: "showGps", label: "Toạ độ GPS", sample: "GPS: 20.9589, 107.0756" },
  { key: "showVerified", label: "Dòng xác nhận \"✓ 5S Verified\"", sample: "✓ 5S Verified" },
];

export default function ConfigWatermarkPage() {
  const [config, setConfig] = useState<WatermarkConfig>(DEFAULT_WATERMARK_CONFIG);
  const [loading, setLoading] = useState(true);
  const [saving, setSaving] = useState(false);
  const [msg, setMsg] = useState<{ ok: boolean; text: string } | null>(null);

  const load = useCallback(async () => {
    setLoading(true);
    try {
      const r = await fetch("/api/config/watermark", { cache: "no-store" });
      const d = r.ok ? await r.json() : null;
      if (d?.config) setConfig(normalizeWatermarkConfig(d.config));
    } finally {
      setLoading(false);
    }
  }, []);

  useEffect(() => { void load(); }, [load]);

  const toggle = (key: keyof WatermarkConfig) =>
    setConfig((c) => ({ ...c, [key]: !c[key] }));

  const save = async () => {
    setSaving(true);
    setMsg(null);
    try {
      const r = await fetch("/api/config/watermark", {
        method: "PUT",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ config }),
      });
      const d = await r.json();
      if (!r.ok) { setMsg({ ok: false, text: d?.error ?? "Không lưu được cấu hình." }); return; }
      if (d?.config) setConfig(normalizeWatermarkConfig(d.config));
      setMsg({ ok: true, text: "Đã lưu cấu hình watermark. Áp dụng cho ảnh chụp mới." });
    } catch (e) {
      setMsg({ ok: false, text: String(e) });
    } finally {
      setSaving(false);
    }
  };

  // Xem trước các dòng sẽ hiển thị (theo config hiện tại).
  const preview: string[] = [
    "10:43 | 09/07/2026",
    ...LINES.filter((l) => l.key !== "showVerified" && config[l.key]).map((l) => l.sample),
    ...(config.customLine.trim() ? [config.customLine.trim()] : []),
    ...(config.showVerified ? ["✓ 5S Verified"] : []),
  ];

  return (
    <AdminShell
      title="Cấu hình watermark"
      subtitle="Áp dụng toàn hệ thống · ảnh chụp mới"
      actions={
        <button onClick={save} disabled={saving || loading} className="btn btn-primary !min-h-10">
          {saving ? "Đang lưu…" : "Lưu cấu hình"}
        </button>
      }
    >
      <p className="text-[13px] text-ink-muted mb-4">
        Bật/tắt từng dòng hiển thị trên watermark và thêm một dòng tùy chỉnh (vd tên công ty).
        Dòng <b>thời gian</b> luôn hiển thị làm bằng chứng. Thay đổi chỉ áp dụng cho ảnh chụp <b>mới</b>.
      </p>

      {msg && (
        <div className={`text-[13px] mb-4 rounded-md px-3.5 py-2.5 ${msg.ok ? "bg-success-bg text-success" : "bg-danger-bg text-danger"}`}>
          {msg.text}
        </div>
      )}

      {loading ? (
        <div className="p-6 text-center text-ink-muted text-[14px]">Đang tải…</div>
      ) : (
        <div className="grid lg:grid-cols-2 gap-4">
          <div className="bg-white rounded-lg border border-line shadow-e2">
            <div className="px-5 py-4 border-b border-line text-[16px] font-semibold">Các dòng hiển thị</div>
            {LINES.map((l) => (
              <label key={l.key} className="flex items-center gap-3 px-5 py-3 border-b border-line last:border-0 cursor-pointer">
                <input type="checkbox" checked={!!config[l.key]} onChange={() => toggle(l.key)} className="w-4 h-4 accent-[var(--primary-600)]" />
                <span className="flex-1 min-w-0">
                  <span className="block text-[14px] font-medium">{l.label}</span>
                  <span className="block text-[12px] text-ink-muted truncate">{l.sample}</span>
                </span>
              </label>
            ))}
            <div className="px-5 py-4 border-t border-line">
              <label className="block text-[13px] font-semibold text-ink-muted mb-1.5">Dòng tùy chỉnh</label>
              <input
                value={config.customLine}
                maxLength={80}
                onChange={(e) => setConfig((c) => ({ ...c, customLine: e.target.value }))}
                placeholder="vd Công ty CP Bia Hạ Long"
                className="w-full rounded-md border border-line-strong px-3 py-2 text-[14px]"
              />
              <div className="text-[12px] text-ink-muted mt-1">Trống = không thêm dòng. Tối đa 80 ký tự.</div>
            </div>
          </div>

          <div>
            <div className="text-[13px] font-semibold text-ink-muted mb-2">Xem trước</div>
            <div className="rounded-lg overflow-hidden bg-[radial-gradient(120%_80%_at_50%_40%,#3a3f47,#1c1e22)] p-4 min-h-[220px] flex items-end">
              <div className="w-full bg-black/55 rounded-sm px-3 py-2.5">
                {preview.map((line, i) => (
                  <div
                    key={i}
                    className={`text-[12.5px] leading-relaxed ${line === "✓ 5S Verified" ? "text-[#6FE26F] font-bold" : "text-white"} ${i === 0 ? "font-bold" : ""}`}
                  >
                    {line}
                  </div>
                ))}
              </div>
            </div>
            <div className="text-[12px] text-ink-muted mt-2">Minh hoạ vị trí &amp; thứ tự dòng (không phải ảnh thật).</div>
          </div>
        </div>
      )}
    </AdminShell>
  );
}

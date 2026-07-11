"use client";

import Link from "next/link";
import { useEffect, useState } from "react";
import { AdminShell } from "@/components/layout/AdminShell";
import { displayNameFrom, initialsFrom } from "@/lib/profile/display";
import type { ProgressSummary } from "@/lib/sharepoint/report-service";

interface WhoAmI { email: string | null; displayName: string | null; isAdmin: boolean; source: string; mappedRole: string | null }
interface Dashboard { date: string; expected: number; submitted: number; missingCount: number; completionRate: number; hasData: boolean }

const SOURCE_LABEL: Record<string, string> = {
  default: "Admin mặc định",
  env: "ADMIN_EMAILS (env)",
  "role-mapping": "Config_RoleMapping",
  none: "—",
};

const CARDS = [
  { href: "/admin/calendar", icon: "📊", title: "Tổng quan hệ thống", desc: "Lịch tổng hợp gửi ảnh theo ngày" },
  { href: "/admin/identity", icon: "🧑‍💼", title: "Identity Center", desc: "Tài khoản app · nhân viên HRM · mapping · local/Microsoft" },
  { href: "/admin/hrm-sync", icon: "🗄️", title: "HRM Sync Monitor", desc: "Đồng bộ phòng ban & nhân viên từ HRM (read-only)" },
  { href: "/admin/config/departments", icon: "🔄", title: "Đồng bộ phòng ban Microsoft 365", desc: "Đồng bộ Config_Departments từ M365" },
  { href: "/admin/config/departments", icon: "🏢", title: "Quản lý phòng ban", desc: "Danh sách phòng ban đang hoạt động" },
  { href: "/admin/config/areas", icon: "📍", title: "Gán khu vực chụp", desc: "Khu vực 5S theo từng phòng ban" },
  { href: "/admin/config/check-items", icon: "✅", title: "Hạng mục 5S", desc: "Checklist / hạng mục kiểm tra" },
  { href: "/admin/config/watermark", icon: "🖼️", title: "Cấu hình watermark", desc: "Bật/tắt dòng + dòng tùy chỉnh (toàn hệ thống)" },
  { href: "/admin/config/role-mapping", icon: "🛡️", title: "Phân quyền quản trị", desc: "Gán quyền theo email (Config_RoleMapping)" },
  { href: "/admin/user-profiles", icon: "👤", title: "Hồ sơ người dùng", desc: "Data_UserProfiles · phòng ban đã resolve" },
  { href: "/admin/sharepoint-health", icon: "🩺", title: "SharePoint health", desc: "Kiểm tra site/library/lists Ban5S" },
  { href: "/admin/ranking", icon: "🏆", title: "Lịch sử / báo cáo", desc: "Xếp hạng & thống kê đơn vị" },
];

export default function AdminHome() {
  const [me, setMe] = useState<WhoAmI | null>(null);
  const [dash, setDash] = useState<Dashboard | null>(null);
  const [progress, setProgress] = useState<ProgressSummary | null>(null);

  useEffect(() => {
    fetch("/api/admin/whoami").then((r) => (r.ok ? r.json() : null)).then(setMe).catch(() => {});
    fetch("/api/admin/dashboard").then((r) => (r.ok ? r.json() : null)).then(setDash).catch(() => {});
    fetch("/api/reports/progress").then((r) => (r.ok ? r.json() : null)).then((p) => setProgress(p as ProgressSummary | null)).catch(() => {});
  }, []);

  return (
    <AdminShell title="Quản trị 5S" subtitle="Bảng điều khiển quản trị">
      {/* Identity panel */}
      <div className="bg-white rounded-lg border border-line shadow-e2 p-4 mb-4 flex flex-wrap items-center gap-3">
        <div className="w-10 h-10 rounded-full grid place-items-center bg-primary-100 text-primary-700 font-bold">
          {me ? initialsFrom(me.displayName, me.email) : "…"}
        </div>
        <div className="flex-1 min-w-0">
          <div className="font-semibold text-[15px] truncate">{me ? displayNameFrom({ displayName: me.displayName, email: me.email }) : "…"}</div>
          <div className="text-[12.5px] text-ink-muted truncate">{me?.email ?? ""}</div>
        </div>
        <div className="flex items-center gap-2">
          <span className="text-[11px] font-bold px-2.5 h-6 rounded-pill grid place-items-center bg-success-bg text-success">
            {me?.isAdmin ? "ADMIN" : "—"}
          </span>
          <span className="text-[11px] px-2.5 h-6 rounded-pill grid place-items-center bg-info-bg text-info">
            nguồn: {SOURCE_LABEL[me?.source ?? "none"] ?? me?.source}
          </span>
        </div>
      </div>

      {/* KPI mini summary — PHÒNG BAN (giữ rule cũ) */}
      <div className="text-[12px] font-bold text-ink-muted mb-1.5">PHÒNG BAN</div>
      <div className="grid grid-cols-2 lg:grid-cols-5 gap-3 mb-4">
        {[
          { label: "Tổng phòng", value: dash?.expected ?? "…" },
          { label: "Đã gửi hôm nay", value: dash?.submitted ?? "…" },
          { label: "Hoàn thành (đủ khu)", value: progress?.departmentSummary.completedAll ?? "…" },
          { label: "Đang thực hiện", value: progress?.departmentSummary.inProgress ?? "…" },
          { label: "Chưa bắt đầu", value: progress?.departmentSummary.notStarted ?? "…" },
        ].map((k) => (
          <div key={k.label} className="bg-white rounded-lg border border-line shadow-e2 p-4">
            <div className="text-[12px] text-ink-muted font-semibold">{k.label}</div>
            <div className="text-[26px] font-bold mt-1 tracking-tight">{k.value}</div>
          </div>
        ))}
      </div>

      {/* KPI — KHU VỰC (bổ sung) */}
      <div className="text-[12px] font-bold text-ink-muted mb-1.5">KHU VỰC</div>
      <div className="grid grid-cols-2 lg:grid-cols-4 gap-3 mb-5">
        {[
          { label: "Tổng khu vực", value: progress?.areaSummary.totalAreas ?? "…" },
          { label: "Đã chụp", value: progress?.areaSummary.completedAreas ?? "…" },
          { label: "Chưa chụp", value: progress?.areaSummary.remainingAreas ?? "…" },
          { label: "Tỷ lệ khu vực", value: progress ? `${Math.round(progress.areaSummary.completionRate * 100)}%` : "…" },
        ].map((k) => (
          <div key={k.label} className="bg-white rounded-lg border border-line shadow-e2 p-4">
            <div className="text-[12px] text-ink-muted font-semibold">{k.label}</div>
            <div className="text-[26px] font-bold mt-1 tracking-tight">{k.value}</div>
          </div>
        ))}
      </div>

      {/* Menu cards */}
      <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-3 gap-4">
        {CARDS.map((c, i) => (
          <Link
            key={`${c.href}-${i}`}
            href={c.href}
            className="bg-white rounded-lg border border-line shadow-e2 p-5 flex items-start gap-3.5 hover:border-primary-600 hover:shadow-md transition"
          >
            <span className="text-[26px] leading-none">{c.icon}</span>
            <span className="min-w-0">
              <span className="block font-semibold text-[15px]">{c.title}</span>
              <span className="block text-[13px] text-ink-muted mt-0.5">{c.desc}</span>
            </span>
          </Link>
        ))}
      </div>
    </AdminShell>
  );
}

import Link from "next/link";
import { Icon, type IconName } from "@/components/ui/Icon";

/**
 * Card module lớn cho Dashboard / danh mục hạng mục (dùng chung).
 * Icon nền màu nhạt · title · mô tả ngắn · dòng số liệu (stat) · CTA mũi tên.
 * Bấm cả card (dễ chạm), hover/active nhẹ. Không chứa business logic.
 */
export type ModuleTone = "primary" | "success" | "warning" | "danger" | "info" | "gold";

const TONE: Record<ModuleTone, string> = {
  primary: "bg-primary-100 text-primary-700",
  success: "bg-success-bg text-success",
  warning: "bg-warning-bg text-warning",
  danger: "bg-danger-bg text-danger",
  info: "bg-info-bg text-info",
  gold: "bg-[#FBF0CE] text-[#8A6A00]",
};

export function ModuleCard({
  href,
  icon,
  tone = "primary",
  title,
  description,
  stat,
  statSub,
  badge,
}: {
  href: string;
  icon: IconName;
  tone?: ModuleTone;
  title: string;
  description?: string;
  /** Con số lớn nổi bật (vd "3 phiếu", "82%"). */
  stat?: string;
  /** Dòng phụ dưới stat (vd "· 1 quá hạn"). */
  statSub?: string;
  /** Badge nhỏ góc phải (vd cảnh báo quá hạn). */
  badge?: { text: string; tone: ModuleTone };
}) {
  return (
    <Link
      href={href}
      className="card flex flex-col gap-3 p-4 transition-all hover:shadow-[var(--sh-card-hover)] hover:-translate-y-0.5 active:translate-y-0 active:bg-surface-2"
    >
      <div className="flex items-start gap-3">
        <span className={`w-12 h-12 rounded-[15px] grid place-items-center flex-none ${TONE[tone]}`}>
          <Icon name={icon} size={24} strokeWidth={1.9} />
        </span>
        <div className="flex-1 min-w-0">
          <div className="flex items-center gap-2">
            <span className="text-[15.5px] font-bold leading-tight">{title}</span>
            {badge && (
              <span className={`text-[10.5px] font-bold px-1.5 py-0.5 rounded-pill ${TONE[badge.tone]}`}>{badge.text}</span>
            )}
          </div>
          {description && <div className="text-[12.5px] text-ink-muted leading-snug mt-0.5">{description}</div>}
        </div>
        <Icon name="chevronRight" size={20} className="text-ink-disabled flex-none mt-1" />
      </div>
      {(stat || statSub) && (
        <div className="flex items-baseline gap-1.5 pl-[60px] -mt-1">
          {stat && <span className="text-[20px] font-extrabold leading-none text-ink">{stat}</span>}
          {statSub && <span className="text-[12.5px] text-ink-muted">{statSub}</span>}
        </div>
      )}
    </Link>
  );
}

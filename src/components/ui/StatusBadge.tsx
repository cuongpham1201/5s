import type { ReactNode } from "react";

type Tone = "success" | "warning" | "danger" | "info" | "neutral";

const toneClass: Record<Tone, string> = {
  success: "badge-success",
  warning: "badge-warning",
  danger: "badge-danger",
  info: "badge-info",
  neutral: "badge-neutral",
};

export function StatusBadge({
  tone = "neutral",
  children,
  className = "",
}: {
  tone?: Tone;
  children: ReactNode;
  className?: string;
}) {
  return <span className={`badge ${toneClass[tone]} ${className}`}>{children}</span>;
}

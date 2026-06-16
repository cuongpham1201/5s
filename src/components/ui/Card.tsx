import type { ReactNode } from "react";

export function Card({
  children,
  className = "",
  flat = false,
}: {
  children: ReactNode;
  className?: string;
  flat?: boolean;
}) {
  return <div className={`${flat ? "card-flat p-4" : "card"} ${className}`}>{children}</div>;
}

export function InfoRow({ label, value }: { label: ReactNode; value: ReactNode }) {
  return (
    <div className="flex justify-between py-2.5 border-b border-line last:border-0">
      <span className="text-ink-muted">{label}</span>
      <span className="font-semibold text-right">{value}</span>
    </div>
  );
}

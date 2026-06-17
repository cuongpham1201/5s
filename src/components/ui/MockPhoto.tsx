import { Icon } from "./Icon";

/**
 * Neutral photo placeholder (no strong gradient / no dark overlay).
 * Light gray tile + faint image glyph — looks like an empty photo slot, not a
 * cheap colored block. Real photos (IndexedDB) use PhotoThumb instead.
 */
export function MockPhoto({
  rounded = "12px",
  className = "",
  children,
}: {
  rounded?: string;
  className?: string;
  children?: React.ReactNode;
}) {
  return (
    <div
      className={`relative overflow-hidden bg-[#F1F5F9] ${className}`}
      style={{ borderRadius: rounded }}
    >
      <span className="absolute inset-0 grid place-items-center text-[#CBD5E1]">
        <Icon name="image" size={22} />
      </span>
      {children}
    </div>
  );
}

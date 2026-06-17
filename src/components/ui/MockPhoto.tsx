import { Icon } from "./Icon";

/**
 * Photo placeholder for mock/company data (no real image yet). Renders a soft
 * photo-like gradient with a faint image glyph — no "5S" text box.
 */
export function MockPhoto({
  hue = 210,
  rounded = "16px",
  className = "",
  children,
}: {
  hue?: number;
  rounded?: string;
  className?: string;
  children?: React.ReactNode;
}) {
  return (
    <div
      className={`relative overflow-hidden ${className}`}
      style={{
        borderRadius: rounded,
        background: `linear-gradient(150deg, hsl(${hue} 28% 82%), hsl(${hue} 24% 62%) 55%, hsl(${(hue + 18) % 360} 22% 46%))`,
      }}
    >
      <span className="absolute inset-0 grid place-items-center text-white/35">
        <Icon name="image" size={26} />
      </span>
      {children}
    </div>
  );
}

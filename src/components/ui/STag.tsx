/**
 * Chuẩn hóa badge thẻ 5S (S1→S5) dùng CHUNG toàn app.
 *   S1 đỏ nhạt · S2 cam · S3 vàng · S4 xanh lá · S5 xanh dương
 * Bo tròn, chữ đậm. Dùng <STag> cho một thẻ, <STagList> cho nhiều lỗi liên tiếp.
 */
export type STagCode = "S1" | "S2" | "S3" | "S4" | "S5";

const STYLE: Record<STagCode, string> = {
  S1: "bg-[#FDE2E1] text-[#C0362C]",
  S2: "bg-[#FCE7CF] text-[#B45309]",
  S3: "bg-[#FEF3C7] text-[#92700B]",
  S4: "bg-[#DCF5E3] text-[#1B7A3D]",
  S5: "bg-[#DCEBFB] text-[#0B5FA6]",
};

const SIZE = {
  sm: "text-[10.5px] px-1.5 py-0.5",
  md: "text-[12px] px-2 py-0.5",
  lg: "text-[13px] px-2.5 py-1",
} as const;

function normalize(code: string | null | undefined): STagCode | null {
  const c = (code ?? "").trim().toUpperCase();
  return (["S1", "S2", "S3", "S4", "S5"] as const).includes(c as STagCode) ? (c as STagCode) : null;
}

export function STag({ code, size = "md" }: { code: string | null | undefined; size?: keyof typeof SIZE }) {
  const c = normalize(code);
  if (!c) return null;
  return <span className={`inline-flex items-center rounded-pill font-bold leading-none ${SIZE[size]} ${STYLE[c]}`}>{c}</span>;
}

/** Nhiều thẻ liên tiếp: "S1 S3 S5". Nhận mảng hoặc chuỗi CSV/space. */
export function STagList({ codes, size = "md" }: { codes: string | string[] | null | undefined; size?: keyof typeof SIZE }) {
  const arr = (Array.isArray(codes) ? codes : (codes ?? "").split(/[,\s]+/))
    .map(normalize)
    .filter((x): x is STagCode => !!x);
  const uniq = [...new Set(arr)].sort();
  if (uniq.length === 0) return null;
  return (
    <span className="inline-flex items-center gap-1">
      {uniq.map((c) => <STag key={c} code={c} size={size} />)}
    </span>
  );
}

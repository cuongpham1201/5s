import Link from "next/link";
import type { ComponentProps, ReactNode } from "react";

type Variant = "primary" | "secondary" | "ghost";
type Size = "md" | "lg";

const variantClass: Record<Variant, string> = {
  primary: "btn-primary",
  secondary: "btn-secondary",
  ghost: "btn-ghost",
};

interface BaseProps {
  variant?: Variant;
  size?: Size;
  block?: boolean;
  children: ReactNode;
  className?: string;
}

function classes({ variant = "primary", size = "md", block }: BaseProps) {
  return [
    "btn",
    variantClass[variant],
    size === "lg" ? "btn-lg" : "",
    block ? "btn-block" : "",
  ]
    .filter(Boolean)
    .join(" ");
}

/** Link-style button (navigation). */
export function ButtonLink({
  href,
  ...props
}: BaseProps & { href: string } & Omit<ComponentProps<typeof Link>, "href" | "className">) {
  const { children, className = "", ...rest } = props as BaseProps;
  return (
    <Link href={href} className={`${classes(props)} ${className}`} {...rest}>
      {children}
    </Link>
  );
}

/** Action button. */
export function Button({
  type = "button",
  ...props
}: BaseProps & Omit<ComponentProps<"button">, "className">) {
  const { children, className = "", variant, size, block, ...rest } = props as BaseProps &
    ComponentProps<"button">;
  return (
    <button type={type} className={`${classes(props)} ${className}`} {...rest}>
      {children}
    </button>
  );
}

import Link from "next/link";
import type { ReactNode } from "react";
import { cn } from "./cn.js";

type Variant = "primary" | "secondary" | "ghost";
const VARIANTS: Record<Variant, string> = {
  primary: "bg-accent text-accent-ink hover:bg-accent-strong shadow-[0_0_12px_oklch(82%_0.16_165/.45)]",
  secondary: "border border-border-strong bg-surface text-text hover:border-link",
  ghost: "text-text-muted hover:bg-surface",
};

export function Button({
  href, external, variant = "primary", size = "md", children, className,
}: {
  href?: string; external?: boolean; variant?: Variant; size?: "sm" | "md";
  children: ReactNode; className?: string;
}) {
  const classes = cn(
    "inline-flex items-center justify-center rounded-md border border-transparent font-display font-medium transition",
    size === "sm" ? "px-3.5 py-2 text-sm" : "px-5 py-3 text-sm",
    VARIANTS[variant], className,
  );
  if (href && (external || /^https?:\/\//.test(href))) {
    return <a href={href} target="_blank" rel="noopener noreferrer" className={classes}>{children}</a>;
  }
  if (href) return <Link href={href} className={classes}>{children}</Link>;
  return <button type="button" className={classes}>{children}</button>;
}

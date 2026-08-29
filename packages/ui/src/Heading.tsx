import { createElement, type ReactNode } from "react";
import { cn } from "./cn.js";

type Level = 1 | 2 | 3 | 4;
type Variant = "display" | "h1" | "h2" | "h3";
const SIZES: Record<Variant, string> = {
  display: "text-4xl sm:text-5xl",
  h1: "text-3xl sm:text-4xl",
  h2: "text-xl sm:text-2xl",
  h3: "text-lg",
};

export function Heading({
  level, variant, children, className,
}: { level: Level; variant?: Variant; children: ReactNode; className?: string }) {
  const v: Variant = variant ?? (["display", "h1", "h2", "h3"][level - 1] as Variant);
  return createElement(
    `h${level}`,
    { className: cn("font-display font-semibold tracking-tight text-balance text-text", SIZES[v], className) },
    children,
  );
}

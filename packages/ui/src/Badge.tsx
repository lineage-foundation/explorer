import type { ReactNode } from "react";
import { cn } from "./cn.js";

export function Badge({
  children, tone = "neutral", className,
}: { children: ReactNode; tone?: "neutral" | "accent"; className?: string }) {
  return (
    <span
      className={cn(
        "inline-flex items-center rounded-full border px-2 py-0.5 font-mono text-[0.7rem]",
        tone === "accent" ? "border-accent/40 bg-accent/10 text-accent" : "border-border text-text-muted",
        className,
      )}
    >
      {children}
    </span>
  );
}

import type { ReactNode } from "react";
import { cn } from "./cn.js";

export function Eyebrow({ children, className }: { children: ReactNode; className?: string }) {
  return (
    <span className={cn("font-mono text-xs uppercase tracking-[0.08em] text-link", className)}>
      {children}
    </span>
  );
}

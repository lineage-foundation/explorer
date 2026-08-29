import type { ReactNode } from "react";
import { cn } from "./cn.js";

export function Card({
  children, rail, className,
}: { children: ReactNode; rail?: boolean; className?: string }) {
  return (
    <div className={cn("relative overflow-hidden rounded-md border border-border bg-surface", className)}>
      {rail ? (
        <span
          data-rail
          className="absolute inset-x-0 top-0 h-[3px]"
          style={{ background: "linear-gradient(105deg, oklch(80% 0.13 215), oklch(83% 0.17 162))" }}
        />
      ) : null}
      {children}
    </div>
  );
}

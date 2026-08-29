import type { ReactNode } from "react";
import { cn } from "./cn.js";

export function Mono({ children, className }: { children: ReactNode; className?: string }) {
  return <span className={cn("font-mono tabular-nums", className)}>{children}</span>;
}

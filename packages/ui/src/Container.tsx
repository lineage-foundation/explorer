import type { ReactNode } from "react";
import { cn } from "./cn.js";

export function Container({
  children, width = "default", className,
}: { children: ReactNode; width?: "default" | "narrow"; className?: string }) {
  return (
    <div className={cn("mx-auto w-full px-4 sm:px-6", width === "narrow" ? "max-w-3xl" : "max-w-6xl", className)}>
      {children}
    </div>
  );
}

import type { ReactNode } from "react";
import { cn } from "./cn.js";

export function Table({ children, className }: { children: ReactNode; className?: string }) {
  return (
    <div className="overflow-x-auto rounded-lg border border-border">
      <table className={cn("w-full min-w-[560px] border-collapse text-sm", className)}>{children}</table>
    </div>
  );
}
export function THead({ children }: { children: ReactNode }) {
  return <thead className="bg-bg-raised">{children}</thead>;
}
export function TBody({ children }: { children: ReactNode }) { return <tbody>{children}</tbody>; }
export function TR({ children }: { children: ReactNode }) {
  return <tr className="border-b border-border last:border-0 hover:bg-surface-2/60">{children}</tr>;
}
export function TH({ children }: { children: ReactNode }) {
  return <th className="px-4 py-3 text-left font-mono text-[0.65rem] uppercase tracking-[0.06em] text-text-subtle">{children}</th>;
}
export function TD({ children, className }: { children: ReactNode; className?: string }) {
  return <td className={cn("px-4 py-3 align-middle text-text", className)}>{children}</td>;
}

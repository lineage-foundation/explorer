import type { ReactNode } from "react";
import { cn } from "./cn.js";

export function Table(
  { children, className, fixed }: { children: ReactNode; className?: string; fixed?: boolean },
) {
  return (
    <div className="overflow-x-auto rounded-lg border border-border">
      <table className={cn("w-full min-w-[480px] border-collapse text-sm", fixed && "table-fixed", className)}>
        {children}
      </table>
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
export function TH(
  { children, right, className }: { children: ReactNode; right?: boolean; className?: string },
) {
  return (
    <th
      className={cn(
        "px-4 py-3 font-mono text-[0.65rem] uppercase tracking-[0.06em] text-text-subtle",
        right ? "text-right" : "text-left",
        className,
      )}
    >
      {children}
    </th>
  );
}
export function TD(
  { children, className, right }: { children: ReactNode; className?: string; right?: boolean },
) {
  return (
    <td className={cn("px-4 py-3 align-middle text-text", right ? "text-right" : "text-left", className)}>
      {children}
    </td>
  );
}

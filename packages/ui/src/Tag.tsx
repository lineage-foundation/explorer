import type { ReactNode } from "react";
export function Tag({ children }: { children: ReactNode }) {
  return <span className="inline-flex items-center rounded-full border border-border px-2 py-0.5 font-mono text-[0.65rem] text-text-muted">{children}</span>;
}

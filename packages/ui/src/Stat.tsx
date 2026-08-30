import type { ReactNode } from "react";

export function Stat({ label, value, unit }: { label: string; value: ReactNode; unit?: string }) {
  return (
    <div className="rounded-md border border-border bg-surface px-4 py-3">
      <div className="font-mono text-[0.65rem] uppercase tracking-[0.08em] text-text-subtle">{label}</div>
      <div className="mt-1 font-display text-2xl font-semibold tabular-nums text-text">
        {value}
        {unit ? (
          <>
            {" "}
            <span className="text-sm text-accent">{unit}</span>
          </>
        ) : null}
      </div>
    </div>
  );
}

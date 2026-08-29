import type { ReactNode } from "react";
import { cn } from "./cn.js";

type Tone = "token" | "item" | "coinbase" | "neutral";
const TONES: Record<Tone, string> = {
  token: "border-accent/40 bg-accent/10 text-accent",
  item: "border-warning/40 bg-warning/10 text-warning",
  coinbase: "border-link/40 bg-link/10 text-link",
  neutral: "border-border text-text-muted",
};

export function Pill({ tone = "neutral", children }: { tone?: Tone; children: ReactNode }) {
  return (
    <span className={cn("inline-flex items-center rounded-full border px-2 py-0.5 font-mono text-[0.65rem] uppercase tracking-[0.04em]", TONES[tone])}>
      {children}
    </span>
  );
}

const TONES: Record<string, string> = {
  GET: "border-accent/40 bg-accent/10 text-accent",
  POST: "border-link/40 bg-link/10 text-link",
  PUT: "border-warning/40 bg-warning/10 text-warning",
  PATCH: "border-warning/40 bg-warning/10 text-warning",
  DELETE: "border-danger/40 bg-danger/10 text-danger",
};

export function MethodBadge({ method, className = "" }: { method: string; className?: string }) {
  const tone = TONES[method] ?? "border-border bg-surface text-text-muted";
  return (
    <span
      className={`inline-block rounded border px-1.5 py-0.5 font-mono text-[0.6rem] font-semibold uppercase tracking-wide ${tone} ${className}`}
    >
      {method}
    </span>
  );
}

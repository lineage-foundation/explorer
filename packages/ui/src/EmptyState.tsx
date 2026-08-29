export function EmptyState({ title, hint }: { title: string; hint?: string }) {
  return (
    <div className="rounded-md border border-border bg-surface px-6 py-10 text-center">
      <p className="font-display text-lg text-text">{title}</p>
      {hint ? <p className="mt-1 text-sm text-text-muted">{hint}</p> : null}
    </div>
  );
}

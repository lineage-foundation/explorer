import { CopyButton } from "@explorer/ui";

/** A titled, copyable code block matching the Lineage docs style. */
export function CodeBlock({ code, lang }: { code: string; lang: string }) {
  return (
    <div className="overflow-hidden rounded-md border border-border bg-bg-canvas">
      <div className="flex items-center justify-between border-b border-border bg-surface px-3 py-1.5">
        <span className="font-mono text-[0.65rem] uppercase tracking-[0.08em] text-text-subtle">{lang}</span>
        <CopyButton value={code} label="copy" />
      </div>
      <div className="overflow-x-auto">
        <pre className="px-3 py-2.5 font-mono text-xs leading-relaxed text-text-muted">{code}</pre>
      </div>
    </div>
  );
}

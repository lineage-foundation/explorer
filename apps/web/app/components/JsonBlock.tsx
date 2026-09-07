import { CopyButton } from "@explorer/ui";
import { bigintReplacer } from "../../lib/detail.js";

/** A collapsible, copyable formatted-JSON view of an indexed object. */
export function JsonBlock({ title = "Raw JSON", data }: { title?: string; data: unknown }) {
  const json = JSON.stringify(data, bigintReplacer, 2);
  return (
    <details className="overflow-hidden rounded-md border border-border bg-surface">
      <summary className="cursor-pointer select-none px-4 py-3 font-display text-sm text-text marker:text-text-subtle">
        {title}
      </summary>
      <div className="border-t border-border">
        <div className="flex items-center justify-end bg-surface px-3 py-1.5">
          <CopyButton value={json} label="copy" />
        </div>
        <div className="overflow-x-auto bg-bg-canvas">
          <pre className="px-4 py-3 font-mono text-xs leading-relaxed text-text-muted">{json}</pre>
        </div>
      </div>
    </details>
  );
}

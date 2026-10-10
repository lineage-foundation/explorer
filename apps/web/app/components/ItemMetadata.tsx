import { metadataRows } from "../../lib/item.js";

// An item's metadata: key/value rows when it is a JSON object, the raw string
// otherwise. Metadata is untrusted, so it is rendered as text only — never as
// markup and never as a link.
export function ItemMetadata({ metadata }: { metadata: string | null }) {
  if (metadata === null || metadata.trim() === "") return null;
  const rows = metadataRows(metadata);
  if (!rows) {
    return (
      <pre className="whitespace-pre-wrap break-all rounded-md border border-border bg-surface p-3 font-mono text-xs text-text">
        {metadata}
      </pre>
    );
  }
  return (
    <dl className="rounded-md border border-border bg-surface p-2">
      {rows.map((row) => (
        <div key={row.key} className="mb-1.5 grid grid-cols-1 gap-1 rounded bg-bg-raised px-2 py-2 last:mb-0 sm:grid-cols-[12rem_1fr] sm:gap-3">
          <dt className="break-all font-mono text-[0.65rem] uppercase tracking-[0.06em] text-text-subtle">{row.key}</dt>
          <dd className="break-all font-mono text-xs text-text">{row.value}</dd>
        </div>
      ))}
    </dl>
  );
}

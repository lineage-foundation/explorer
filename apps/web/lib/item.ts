// Presentation helpers for items. Pure, with no database import, so they are
// safe in client components.
//
// Item metadata is an arbitrary string chosen by whoever created the item. It
// is only ever turned into plain strings here; callers render those as text.

/** Link to an item's page. */
export function itemHref(genesis: string): string {
  return `/item/${encodeURIComponent(genesis)}`;
}

/**
 * Key/value rows for metadata that is a non-empty JSON object, else null (the
 * caller shows the raw string). Non-string values are shown as JSON text.
 */
export function metadataRows(metadata: string | null): { key: string; value: string }[] | null {
  if (metadata === null || metadata.trim() === "") return null;
  let parsed: unknown;
  try {
    parsed = JSON.parse(metadata);
  } catch {
    return null;
  }
  if (typeof parsed !== "object" || parsed === null || Array.isArray(parsed)) return null;
  const rows = Object.entries(parsed).map(([key, value]) => ({
    key,
    value: typeof value === "string" ? value : JSON.stringify(value),
  }));
  return rows.length > 0 ? rows : null;
}

/** A one-line summary of metadata for list rows, at most `max` characters. */
export function metadataPreview(metadata: string | null, max = 80): string {
  if (metadata === null || metadata.trim() === "") return "—";
  const rows = metadataRows(metadata);
  const text = (rows ? rows.map((r) => `${r.key}: ${r.value}`).join(" · ") : metadata)
    .replace(/\s+/g, " ")
    .trim();
  return text.length > max ? `${text.slice(0, max - 1)}…` : text;
}

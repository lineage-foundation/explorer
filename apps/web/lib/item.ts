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

/**
 * A one-line summary of metadata for list rows, at most `max` characters. A
 * `title` or `name` leads, unlabelled, so it is not cut off behind other fields.
 */
export function metadataPreview(metadata: string | null, max = 80): string {
  if (metadata === null || metadata.trim() === "") return "—";
  const rows = metadataRows(metadata);
  const lead = rows?.find((r) => /^(title|name)$/i.test(r.key) && r.value.trim() !== "");
  const parts = rows
    ? [...(lead ? [lead.value] : []), ...rows.filter((r) => r !== lead).map((r) => `${r.key}: ${r.value}`)]
    : [metadata];
  const text = parts.join(" · ").replace(/\s+/g, " ").trim();
  return text.length > max ? `${text.slice(0, max - 1)}…` : text;
}

/**
 * What a transaction actually moved of an item: who received it and how much.
 * An item's outputs in a transfer include what the sender kept (change), which
 * is not a transfer, so outputs going back to a sender are left out. If nothing
 * went to anyone else — the create transaction, an unknown sender, or a
 * transfer entirely to self — every output counts.
 */
export function transferMoved(transfer: {
  from: string[];
  to: { address: string | null; amount: string }[];
  created: boolean;
}): { recipients: string[]; quantity: string } {
  const senders = new Set(transfer.from);
  const away = transfer.created ? [] : transfer.to.filter((o) => o.address === null || !senders.has(o.address));
  const moved = away.length > 0 ? away : transfer.to;
  const recipients = [...new Set(moved.flatMap((o) => (o.address !== null ? [o.address] : [])))];
  const quantity = moved
    .reduce((total, o) => total + (/^[0-9]+$/.test(o.amount) ? BigInt(o.amount) : 0n), 0n)
    .toString();
  return { recipients, quantity };
}

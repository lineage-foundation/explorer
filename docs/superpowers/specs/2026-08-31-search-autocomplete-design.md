# Search Autocomplete — Design Spec

**Status:** Approved
**Date:** 2026-08-31

## Goal

As the user types in the explorer search bar, show a dropdown with the resolved
target (block / transaction / address), its type, and whether it exists — so the
user can confirm and click through instead of pressing Enter into a possible
404. This is a **type-aware resolver**, not a fuzzy/prefix search: the chain's
identifiers are opaque (block hash `b…`, transaction `g…`, address 64-hex, block
number), so at most one kind matches a given input.

## Non-goals

- No prefix/`LIKE` matching of hashes or addresses (opaque IDs, low value, DB cost).
- No changes to the public `/api/v1` API; this is an internal web endpoint.
- No search history / recent-items memory.

## Architecture

Two units plus a preserved pure helper:

1. **`classify(query)`** (existing, `apps/web/lib/search.ts`) — unchanged. Pure
   regex classification into a `SearchKind` + guessed `href`. Already unit-tested.
2. **Resolver endpoint** — `GET /api/search?q=<query>` (internal route handler,
   alongside `/api/latest`). Classifies, then verifies existence with cheap
   exact-key DB lookups, returning `{ suggestions: Suggestion[] }`.
3. **SearchBar combobox** (`apps/web/app/components/SearchBar.tsx`) — debounced
   fetch, keyboard-navigable dropdown, navigation on click/Enter.

## Resolver endpoint

`apps/web/app/api/search/route.ts` — `export const dynamic = "force-dynamic"`.

```ts
interface Suggestion {
  kind: "block" | "tx" | "address";
  label: string;      // e.g. "Block #128,940"
  sublabel?: string;  // e.g. "not found" or "500 LNGX"
  href: string;
  found: boolean;
}
```

Logic (via a `resolveSearch(db, q): Promise<Suggestion[]>` helper in the route
module), keyed off `classify(q).kind`:

| kind | query used | suggestion |
|---|---|---|
| `block-num` | `getBlockHashByNum(n)` | `{ kind: "block", label: "Block #"+n.toLocaleString(), href: "/block/"+n, found: hash !== null }` |
| `block-hash` | `getBlockByHashOrNumber(hash)` | label `"Block #"+row.num` when found (else the hash, truncated), `href: "/block/"+hash`, `found` |
| `tx` | `getTransactionByHash(hash)` | `{ kind: "tx", label: "Transaction "+truncateHash(hash), href: "/transaction/"+hash, found: tx !== null }` |
| `address` | `getAccountBalance(addr)` | `{ kind: "address", label: "Address "+truncateHash(addr), sublabel: formatLngx(balance,2)+" LNGX", href: "/address/"+addr, found: true }` |
| `unknown` | — | `[]` |

Returns at most one suggestion. Response: `NextResponse.json({ suggestions })`
with `Cache-Control: private, max-age=10`. On any thrown error the handler
returns `{ suggestions: [] }` (never 500 the search box).

Note: addresses are always viewable (an unknown address returns balance `0` and
an empty history), so `found` is always `true` for the `address` kind — the
sublabel shows the balance rather than an existence flag.

## SearchBar combobox

Client component. State: `value`, `suggestions`, `open`, `activeIndex`
(-1 = none highlighted), `error`.

- **Fetch:** on `value` change (trimmed, non-empty), debounce 200 ms then
  `fetch("/api/search?q="+encodeURIComponent(value), { signal })`. Abort the
  previous request via `AbortController` on each new keystroke and on unmount.
  On success set `suggestions` + `open = suggestions.length > 0`; reset
  `activeIndex = -1`. On abort/error keep the box usable (no dropdown).
- **Keyboard:** ArrowDown/ArrowUp move `activeIndex` within `[0, len)`;
  Enter navigates to the active suggestion, or the first suggestion if none is
  active, or falls back to `classify(value).href` (showing the "unrecognized"
  error when that is null); Escape closes the dropdown; Tab/blur closes it.
- **Mouse:** click a suggestion → navigate; `onMouseEnter` sets `activeIndex`.
- **Navigation:** `router.push(href)`, then clear `value`, `suggestions`, close.
- **ARIA:** input is `role="combobox"`, `aria-expanded`, `aria-controls` →
  listbox id, `aria-autocomplete="list"`, `aria-activedescendant` → active
  option id. Dropdown is `role="listbox"`; rows are `role="option"` with
  `aria-selected`. The existing `aria-label="Search"` and error `role="alert"`
  are retained.
- **Rendering:** each option shows a small type glyph (block/tx/address), the
  `label` in mono, and the `sublabel` muted (red when `found === false`).
  Dropdown positioned absolutely under the input, matching the existing
  bordered/raised styling.

The current submit-on-Enter behavior and the "unrecognized" error message are
preserved as the fallback path when there are no suggestions.

## Error handling

- Fetch failure / abort: silent — dropdown simply doesn't open; Enter still
  works via `classify()`.
- Resolver route failure: returns `{ suggestions: [] }`, never a 500.
- A `found: false` suggestion is still shown and navigable; the target detail
  page's `notFound()` renders the 404 gracefully.

## Testing

- **`classify()`** — unchanged; existing unit tests stand.
- **SearchBar RTL** (`apps/web/app/components/__tests__/SearchBar.test.tsx`,
  extended): mock global `fetch` to resolve a suggestion; assert (a) the
  dropdown renders the suggestion after typing, (b) ArrowDown + Enter navigates
  to its href, (c) clicking a suggestion navigates, (d) with no suggestions,
  Enter on a numeric query still routes via `classify` and an unrecognized
  query shows the error. Use fake timers or `findBy*` to handle the debounce.
- **Playwright e2e** (`apps/web/e2e/search.spec.ts`): type a seeded block number
  into the search box, wait for the suggestion row, click it, and assert the URL
  is the block page. Seeded via the existing e2e seed.
- The resolver route stays thin (reuses existing `@explorer/db` queries) and is
  covered by the e2e, consistent with how `/api/latest` is handled.

## Files

```
apps/web/app/api/search/route.ts                    create — resolver endpoint + resolveSearch
apps/web/app/components/SearchBar.tsx                modify — combobox + dropdown
apps/web/app/components/__tests__/SearchBar.test.tsx modify — dropdown/keyboard/click tests
apps/web/e2e/search.spec.ts                          create — e2e suggestion → navigate
apps/web/lib/search.ts                               unchanged (classify reused)
```

## Constraints

- Strict TS, ESM, `.js` import specifiers; no `any`; `console.warn`/`error` only.
- No AI attribution; no legacy-brand strings.
- Amounts as strings; LNGX via `formatLngx` (2dp in the address sublabel).
- Debounced + aborted fetches; the search box must never hard-fail on a bad
  network/DB response.

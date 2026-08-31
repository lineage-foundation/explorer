# Search Autocomplete Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** A type-aware search dropdown that, as the user types, resolves the input to a block/transaction/address, verifies it exists, and lets them keyboard-navigate or click through — preventing dead-end 404s.

**Architecture:** A thin internal route `GET /api/search?q=` delegates to a pure `resolveSearch(db, q)` helper that reuses the existing `classify()` plus exact-key DB lookups, returning 0–1 `Suggestion`s. The `SearchBar` client component becomes a combobox: debounced+aborted fetch, ARIA listbox dropdown, keyboard nav, click/Enter to navigate, with the current `classify()` submit + "unrecognized" error preserved as the no-suggestion fallback.

**Tech Stack:** Next.js 15 App Router (route handler + client component), React 18, `@explorer/db` queries, Vitest + @testing-library/react (jsdom), Playwright e2e.

## Global Constraints

- Strict TypeScript (`noUncheckedIndexedAccess`, `verbatimModuleSyntax`, Bundler); ESM; every relative import uses a `.js` specifier resolving to `.ts`.
- ESLint: `@typescript-eslint/no-explicit-any` is an error; `no-console` is an error except `console.warn`/`console.error`.
- No AI attribution anywhere (commits, code, docs) — commit messages must carry NO `Co-Authored-By: Claude`/`Claude-Session`/Anthropic trailer. No legacy-brand strings (the CI rebrand grep in `.github/workflows/ci.yml` is authoritative).
- Amounts are strings; LNGX via `formatLngx` (2dp in the address sublabel).
- `SearchBar` is a client component — it must import `Suggestion` as a **type-only** import so `@explorer/db` never enters the client bundle.
- The search box must never hard-fail: fetch errors/aborts are swallowed and the resolver route returns `{ suggestions: [] }` rather than a 500.
- Local test DB is on port **5433** on this machine: prefix DB-touching commands with `TEST_DATABASE_URL=postgres://explorer:explorer@127.0.0.1:5433/explorer_test` (and `DATABASE_URL=…` for e2e).

## File Structure

```
apps/web/lib/resolve-search.ts                       create — Suggestion type + resolveSearch(db, q)
apps/web/lib/__tests__/resolve-search.test.ts        create — resolver unit tests (mocked @explorer/db)
apps/web/app/api/search/route.ts                     create — thin GET handler
apps/web/app/components/SearchBar.tsx                modify — combobox + dropdown + keyboard
apps/web/app/components/__tests__/SearchBar.test.tsx modify — dropdown/keyboard/click + existing cases
apps/web/e2e/search.spec.ts                          create — e2e: suggestion → navigate
apps/web/lib/search.ts                               unchanged (classify reused)
```

---

### Task 1: Resolver — `resolveSearch` helper + `/api/search` route

**Files:**
- Create: `apps/web/lib/resolve-search.ts`
- Create: `apps/web/lib/__tests__/resolve-search.test.ts`
- Create: `apps/web/app/api/search/route.ts`

**Interfaces:**
- Produces: `interface Suggestion { kind: "block" | "tx" | "address"; label: string; sublabel?: string; href: string; found: boolean }`
- Produces: `resolveSearch(db: Database, query: string): Promise<Suggestion[]>` — returns 0 or 1 suggestions.
- Consumes: `classify` from `apps/web/lib/search.ts` (`{ kind: "block-num" | "block-hash" | "tx" | "address" | "unknown"; href: string | null }`); `truncateHash(hash, lead?, tail?)` and `formatLngx(raw, decimals?)` from `apps/web/lib/format.ts`; and from `@explorer/db`: `getBlockHashByNum(db, n): Promise<string | null>`, `getBlockByHashOrNumber(db, q): Promise<{ num: number } | null>`, `getTransactionByHash(db, hash): Promise<unknown | null>`, `getAccountBalance(db, addr): Promise<{ balance: string }>`, and `type Database`.

- [ ] **Step 1: Write the failing resolver test**

`apps/web/lib/__tests__/resolve-search.test.ts`:
```ts
import { describe, it, expect, vi, beforeEach } from "vitest";

vi.mock("@explorer/db", () => ({
  getBlockHashByNum: vi.fn(),
  getBlockByHashOrNumber: vi.fn(),
  getTransactionByHash: vi.fn(),
  getAccountBalance: vi.fn(),
}));

import {
  getBlockHashByNum, getBlockByHashOrNumber, getTransactionByHash, getAccountBalance,
} from "@explorer/db";
import { resolveSearch } from "../resolve-search.js";

const db = {} as never;
beforeEach(() => vi.clearAllMocks());

describe("resolveSearch", () => {
  it("resolves an existing block number", async () => {
    vi.mocked(getBlockHashByNum).mockResolvedValue("H5");
    const [s] = await resolveSearch(db, "5");
    expect(s).toMatchObject({ kind: "block", label: "Block #5", href: "/block/5", found: true });
    expect(s?.sublabel).toBeUndefined();
  });

  it("marks a missing block number as not found", async () => {
    vi.mocked(getBlockHashByNum).mockResolvedValue(null);
    const [s] = await resolveSearch(db, "999");
    expect(s).toMatchObject({ kind: "block", href: "/block/999", found: false, sublabel: "not found" });
  });

  it("labels a block hash with its resolved number", async () => {
    vi.mocked(getBlockByHashOrNumber).mockResolvedValue({ num: 42 } as never);
    const hash = `b${"a".repeat(64)}`;
    const [s] = await resolveSearch(db, hash);
    expect(s).toMatchObject({ kind: "block", label: "Block #42", href: `/block/${hash}`, found: true });
  });

  it("resolves a transaction hash and its existence", async () => {
    vi.mocked(getTransactionByHash).mockResolvedValue({ hash: "g" } as never);
    const hash = `g${"a".repeat(31)}`;
    const [s] = await resolveSearch(db, hash);
    expect(s).toMatchObject({ kind: "tx", href: `/transaction/${hash}`, found: true });
  });

  it("resolves an address with its balance and is always navigable", async () => {
    vi.mocked(getAccountBalance).mockResolvedValue({ balance: (500n * 72072000n).toString() });
    const addr = "a".repeat(64);
    const [s] = await resolveSearch(db, addr);
    expect(s).toMatchObject({ kind: "address", href: `/address/${addr}`, found: true });
    expect(s?.sublabel).toBe("500.00 LNGX");
  });

  it("returns nothing for unrecognized input", async () => {
    expect(await resolveSearch(db, "???")).toEqual([]);
  });
});
```

- [ ] **Step 2: Run it to verify it fails**

Run: `pnpm -F @explorer/web exec vitest run resolve-search`
Expected: FAIL — `../resolve-search.js` cannot be resolved.

- [ ] **Step 3: Implement `resolve-search.ts`**

`apps/web/lib/resolve-search.ts`:
```ts
import type { Database } from "@explorer/db";
import {
  getBlockHashByNum, getBlockByHashOrNumber, getTransactionByHash, getAccountBalance,
} from "@explorer/db";
import { classify } from "./search.js";
import { truncateHash, formatLngx } from "./format.js";

export interface Suggestion {
  kind: "block" | "tx" | "address";
  label: string;
  sublabel?: string;
  href: string;
  found: boolean;
}

export async function resolveSearch(db: Database, query: string): Promise<Suggestion[]> {
  const q = query.trim();
  const { kind } = classify(q);

  if (kind === "block-num") {
    const n = Number.parseInt(q, 10);
    const hash = await getBlockHashByNum(db, n);
    const found = hash !== null;
    return [{
      kind: "block", label: `Block #${n.toLocaleString()}`, href: `/block/${n}`, found,
      ...(found ? {} : { sublabel: "not found" }),
    }];
  }
  if (kind === "block-hash") {
    const block = await getBlockByHashOrNumber(db, q);
    const found = block !== null;
    return [{
      kind: "block",
      label: found ? `Block #${block.num.toLocaleString()}` : `Block ${truncateHash(q)}`,
      href: `/block/${q}`, found,
      ...(found ? {} : { sublabel: "not found" }),
    }];
  }
  if (kind === "tx") {
    const tx = await getTransactionByHash(db, q);
    const found = tx !== null;
    return [{
      kind: "tx", label: `Transaction ${truncateHash(q)}`, href: `/transaction/${q}`, found,
      ...(found ? {} : { sublabel: "not found" }),
    }];
  }
  if (kind === "address") {
    const { balance } = await getAccountBalance(db, q);
    return [{
      kind: "address", label: `Address ${truncateHash(q)}`,
      sublabel: `${formatLngx(balance, 2)} LNGX`, href: `/address/${q}`, found: true,
    }];
  }
  return [];
}
```

- [ ] **Step 4: Run the resolver test to verify it passes**

Run: `pnpm -F @explorer/web exec vitest run resolve-search`
Expected: PASS (6 tests).

- [ ] **Step 5: Implement the route handler**

`apps/web/app/api/search/route.ts`:
```ts
import { NextResponse } from "next/server";
import { getDb } from "../../../lib/db.js";
import { resolveSearch } from "../../../lib/resolve-search.js";

export const dynamic = "force-dynamic";

export async function GET(req: Request): Promise<NextResponse> {
  const q = new URL(req.url).searchParams.get("q") ?? "";
  try {
    const { db } = getDb();
    const suggestions = await resolveSearch(db, q);
    return NextResponse.json({ suggestions }, { headers: { "Cache-Control": "private, max-age=10" } });
  } catch {
    return NextResponse.json({ suggestions: [] });
  }
}
```

- [ ] **Step 6: Typecheck**

Run: `pnpm -F @explorer/web typecheck`
Expected: no errors.

- [ ] **Step 7: Commit**

```bash
git add apps/web/lib/resolve-search.ts apps/web/lib/__tests__/resolve-search.test.ts apps/web/app/api/search/route.ts
git commit -m "feat(web): add search resolver endpoint and helper"
```

---

### Task 2: SearchBar combobox

**Files:**
- Modify: `apps/web/app/components/SearchBar.tsx` (full rewrite)
- Modify: `apps/web/app/components/__tests__/SearchBar.test.tsx`

**Interfaces:**
- Consumes: `Suggestion` (type-only) and the route `GET /api/search?q=` from Task 1; `classify` from `lib/search.ts`; `useRouter` from `next/navigation`.
- Produces: the `SearchBar` component (combobox). No new exports.

- [ ] **Step 1: Rewrite the SearchBar test**

Replace the entire contents of `apps/web/app/components/__tests__/SearchBar.test.tsx`:
```tsx
import { render, screen } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import { describe, it, expect, vi, beforeEach } from "vitest";

const push = vi.fn();
vi.mock("next/navigation", () => ({ useRouter: () => ({ push }) }));

import { SearchBar } from "../SearchBar.js";

function mockFetch(suggestions: unknown[]) {
  vi.stubGlobal("fetch", vi.fn().mockResolvedValue({ ok: true, json: async () => ({ suggestions }) }));
}

beforeEach(() => {
  push.mockClear();
  mockFetch([]); // default: no suggestions
});

describe("SearchBar", () => {
  it("routes a numeric query to the block page on submit", async () => {
    render(<SearchBar />);
    await userEvent.type(screen.getByRole("combobox"), "128940{enter}");
    expect(push).toHaveBeenCalledWith("/block/128940");
  });

  it("shows a message for unrecognized input", async () => {
    render(<SearchBar />);
    await userEvent.type(screen.getByRole("combobox"), "???{enter}");
    expect(screen.getByText(/unrecognized/i)).toBeInTheDocument();
  });

  it("shows a suggestion and navigates on click", async () => {
    mockFetch([{ kind: "block", label: "Block #5", href: "/block/5", found: true }]);
    render(<SearchBar />);
    await userEvent.type(screen.getByRole("combobox"), "5");
    const opt = await screen.findByRole("option");
    expect(opt).toHaveTextContent("Block #5");
    await userEvent.click(opt);
    expect(push).toHaveBeenCalledWith("/block/5");
  });

  it("navigates to the highlighted suggestion via keyboard", async () => {
    mockFetch([{ kind: "tx", label: "Transaction g1a2…b3", href: "/transaction/g1a2b3", found: true }]);
    render(<SearchBar />);
    await userEvent.type(screen.getByRole("combobox"), "g1a2b3");
    await screen.findByRole("option");
    await userEvent.keyboard("{ArrowDown}{Enter}");
    expect(push).toHaveBeenCalledWith("/transaction/g1a2b3");
  });
});
```

- [ ] **Step 2: Run it to verify it fails**

Run: `pnpm -F @explorer/web exec vitest run SearchBar`
Expected: FAIL — no `combobox` role / no `option` (current SearchBar renders `searchbox` and no dropdown).

- [ ] **Step 3: Rewrite `SearchBar.tsx`**

Replace the entire contents of `apps/web/app/components/SearchBar.tsx`:
```tsx
"use client";
import { useEffect, useState } from "react";
import { useRouter } from "next/navigation";
import { classify } from "../../lib/search.js";
import type { Suggestion } from "../../lib/resolve-search.js";

function glyph(kind: Suggestion["kind"]): string {
  if (kind === "block") return "▣";
  if (kind === "tx") return "↔";
  return "◈";
}

export function SearchBar() {
  const router = useRouter();
  const [value, setValue] = useState("");
  const [suggestions, setSuggestions] = useState<Suggestion[]>([]);
  const [open, setOpen] = useState(false);
  const [active, setActive] = useState(-1);
  const [error, setError] = useState(false);
  const listId = "search-suggestions";

  useEffect(() => {
    const q = value.trim();
    if (q === "") { setSuggestions([]); setOpen(false); return; }
    const controller = new AbortController();
    const timer = setTimeout(() => {
      void (async () => {
        try {
          const res = await fetch(`/api/search?q=${encodeURIComponent(q)}`, { signal: controller.signal });
          if (!res.ok) return;
          const data = (await res.json()) as { suggestions: Suggestion[] };
          setSuggestions(data.suggestions);
          setOpen(data.suggestions.length > 0);
          setActive(-1);
        } catch {
          /* aborted or network error — keep the box usable */
        }
      })();
    }, 200);
    return () => { clearTimeout(timer); controller.abort(); };
  }, [value]);

  function go(href: string): void {
    setError(false);
    setOpen(false);
    setSuggestions([]);
    setValue("");
    router.push(href);
  }

  function submit(e: React.FormEvent): void {
    e.preventDefault();
    if (open && suggestions.length > 0) {
      const pick = active >= 0 ? suggestions[active] : suggestions[0];
      if (pick) { go(pick.href); return; }
    }
    const { href } = classify(value);
    if (href) go(href);
    else setError(true);
  }

  function onKeyDown(e: React.KeyboardEvent): void {
    if (!open || suggestions.length === 0) return;
    if (e.key === "ArrowDown") { e.preventDefault(); setActive((i) => (i + 1) % suggestions.length); }
    else if (e.key === "ArrowUp") { e.preventDefault(); setActive((i) => (i <= 0 ? suggestions.length - 1 : i - 1)); }
    else if (e.key === "Escape") { setOpen(false); }
  }

  return (
    <form onSubmit={submit} className="relative w-full" role="search">
      <input
        type="search"
        role="combobox"
        aria-expanded={open}
        aria-controls={listId}
        aria-autocomplete="list"
        aria-activedescendant={active >= 0 ? `search-opt-${active}` : undefined}
        value={value}
        onChange={(e) => { setValue(e.target.value); setError(false); }}
        onKeyDown={onKeyDown}
        onBlur={() => { setTimeout(() => setOpen(false), 120); }}
        placeholder="Search block / tx / address…"
        aria-label="Search"
        aria-describedby={error ? "search-error" : undefined}
        className="w-full rounded-md border border-border bg-bg-raised px-3 py-2 font-mono text-xs text-text placeholder:text-text-subtle focus:border-link focus:outline-none"
      />
      {open && suggestions.length > 0 ? (
        <ul
          id={listId}
          role="listbox"
          className="absolute z-50 mt-1 w-full overflow-hidden rounded-md border border-border bg-bg-raised shadow-lg"
        >
          {suggestions.map((s, i) => (
            <li
              key={s.href}
              id={`search-opt-${i}`}
              role="option"
              aria-selected={i === active}
              onMouseEnter={() => setActive(i)}
              onMouseDown={(e) => { e.preventDefault(); go(s.href); }}
              className={`flex cursor-pointer items-center justify-between gap-3 px-3 py-2 text-xs ${i === active ? "bg-surface-2" : ""}`}
            >
              <span className="font-mono text-text">
                <span className="mr-2 text-text-subtle">{glyph(s.kind)}</span>
                {s.label}
              </span>
              {s.sublabel ? (
                <span className={`font-mono ${s.found ? "text-text-muted" : "text-danger"}`}>{s.sublabel}</span>
              ) : null}
            </li>
          ))}
        </ul>
      ) : null}
      {error ? (
        <p id="search-error" role="alert" className="mt-1 text-[0.7rem] text-danger">
          Unrecognized — enter a block number/hash, transaction, or address.
        </p>
      ) : null}
    </form>
  );
}
```

Notes for the implementer: navigation uses `onMouseDown` with `preventDefault` (not `onClick`) so the input's blur-close doesn't fire before the click registers; the `onBlur` close is deferred 120 ms for the same reason. The `Suggestion` import is type-only, so `@explorer/db` stays out of the client bundle.

- [ ] **Step 4: Run the SearchBar test to verify it passes**

Run: `pnpm -F @explorer/web exec vitest run SearchBar`
Expected: PASS (4 tests). Then the full web unit suite: `pnpm -F @explorer/web test` — expect all passing (SearchBar 4, LatestFeed, format, ui, etc.).

- [ ] **Step 5: Typecheck**

Run: `pnpm -F @explorer/web typecheck`
Expected: no errors.

- [ ] **Step 6: Commit**

```bash
git add apps/web/app/components/SearchBar.tsx apps/web/app/components/__tests__/SearchBar.test.tsx
git commit -m "feat(web): turn the search bar into an autocomplete combobox"
```

---

### Task 3: End-to-end coverage

**Files:**
- Create: `apps/web/e2e/search.spec.ts`

**Interfaces:**
- Consumes: the running app (Playwright `webServer` runs `next dev` on `:8080`; the `e2e` script seeds the DB first). The seed (`apps/web/e2e/seed.ts`) inserts blocks `num: 0` (`H0`) and `num: 1` (`H1`).

- [ ] **Step 1: Write the e2e spec**

`apps/web/e2e/search.spec.ts`:
```ts
import { test, expect } from "@playwright/test";

test("search autocomplete suggests a block and navigates to it", async ({ page }) => {
  await page.goto("/");
  const box = page.getByRole("combobox", { name: /search/i });
  await box.fill("0");
  const option = page.getByRole("option");
  await expect(option).toContainText("Block #0");
  await option.click();
  await expect(page).toHaveURL(/\/block\/0$/);
});
```

- [ ] **Step 2: Run the e2e suite**

Run (this machine, DB on 5433; the `e2e` script seeds then runs Playwright):
```bash
lsof -ti tcp:8080 | xargs -r kill
DATABASE_URL=postgres://explorer:explorer@127.0.0.1:5433/explorer_test pnpm -F @explorer/web e2e
```
Expected: all e2e tests pass, including `search autocomplete suggests a block and navigates to it`. (If Playwright's chromium is missing, run `pnpm -F @explorer/web exec playwright install chromium` first.)

- [ ] **Step 3: Full local verification**

Run:
```bash
pnpm typecheck
pnpm lint
env -u DATABASE_URL pnpm -F @explorer/web build
# Run the same rebrand grep the CI 'verify' job runs (pattern lives in .github/workflows/ci.yml); expect no matches.
```
Expected: typecheck/lint clean, web build compiles, rebrand grep prints `CLEAN`.

- [ ] **Step 4: Commit**

```bash
git add apps/web/e2e/search.spec.ts
git commit -m "test(web): e2e for search autocomplete suggestion and navigation"
```

- [ ] **Step 5: Push and confirm CI**

```bash
git push origin main
```
Watch to green (both `verify` and `e2e` jobs):
```bash
gh run watch "$(gh run list --limit 1 --json databaseId -q '.[0].databaseId')" --exit-status --compact
```
Expected: `verify` and `e2e` both succeed.

---

## Self-Review

**Spec coverage:**
- Resolver endpoint `/api/search` classifying + existence-verifying per kind → Task 1. ✓
- `Suggestion` shape (kind/label/sublabel/href/found) → Task 1. ✓
- Address always `found: true` with balance sublabel; block/tx `found` reflects existence → Task 1 (tests assert both). ✓
- Route never 500s (try/catch → `{ suggestions: [] }`) → Task 1 route. ✓
- SearchBar combobox: debounce 200ms + AbortController, keyboard ↑/↓/Enter/Esc, click, blur-close, ARIA combobox/listbox/option, preserved classify fallback + error → Task 2. ✓
- Type-only `Suggestion` import keeps `@explorer/db` out of the client bundle → Task 2 (noted). ✓
- Testing: resolver unit (mocked db), SearchBar RTL (dropdown/keyboard/click/fallback), e2e suggestion→navigate → Tasks 1–3. ✓

**Placeholder scan:** No TBD/TODO; every code step is complete; commands have expected output. ✓

**Type consistency:** `Suggestion` fields identical across resolver, route, component, and tests. `resolveSearch(db, query)` signature matches its callers. `classify` return `{ kind, href }` used consistently. `getBlockByHashOrNumber` result read as `{ num }` (a `Block` row has `num`). ✓

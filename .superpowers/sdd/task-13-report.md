# Task 13: Playwright e2e + CI — Report

## Files
- `apps/web/e2e/seed.ts` — new
- `apps/web/e2e/explorer.spec.ts` — new
- `apps/web/playwright.config.ts` — new
- `apps/web/package.json` — added `@playwright/test` devDependency + `e2e` script
- `apps/web/tsconfig.json` — added `e2e` and `playwright.config.ts` to `include` so the new files are actually typechecked by `pnpm typecheck` (they were previously outside the include glob)
- `.github/workflows/ci.yml` — added a separate `e2e` job after `verify`
- `.gitignore` — added `playwright-report`, `test-results`, `blob-report`

## Deviation from the brief's literal seed.ts
The brief's `seed.ts` imports `resetTestSchema` from `"@explorer/db"`. That function is
only exported from the package's `./test-support` subpath
(`packages/db/package.json` `exports["./test-support"]`), not from the root `index.ts`.
Adjusted the import to:
```ts
import { createDb, schema } from "@explorer/db";
import { resetTestSchema } from "@explorer/db/test-support";
```
This resolves cleanly under the app's `moduleResolution: "Bundler"` tsconfig. No other
changes to the brief's seed fixture/config code were needed.

## Local e2e run
```
DATABASE_URL=postgres://explorer:explorer@127.0.0.1:5433/explorer_test pnpm -F @explorer/web exec playwright install chromium
DATABASE_URL=postgres://explorer:explorer@127.0.0.1:5433/explorer_test pnpm -F @explorer/web e2e
```
Result: **5 passed** (5 e2e/explorer.spec.ts test cases), ~9-10s total, chromium project,
`next dev` webServer on 127.0.0.1:8080.

- home shows stats and latest feed — passed
- block detail resolves by number and by hash — passed
- transaction detail shows resolved input address and outputs — passed
- address shows balance and history — passed
- unknown id 404s — passed

Re-ran after `pnpm build`/`pnpm typecheck`/`pnpm lint` to confirm no drift: still 5/5 passing.

## Selector adjustments and why
1. **Transaction detail test** — the brief's `page.getByText("out")` is ambiguous: the
   flow-bar span text is `"30 LNGX out"` (contains "out") but the `<h3>Outputs · 1</h3>`
   heading's accessible name is `"Outputs · 1"`, which also contains the substring "out"
   (case-insensitive). Playwright's `getByText`/assertions are strict-mode (single-element),
   so this would throw a strict-mode violation with 2 matches. Replaced with
   `page.getByRole("heading", { name: "Outputs" })` (unambiguous — the "Inputs" heading
   doesn't match) plus `page.getByRole("link", { name: "addrA", exact: true })` to assert
   the resolved input address is rendered as a link (addrA is short, so `truncateHash`
   renders it whole per the brief's note).
2. **Address test** — the brief's `getByText("30", { exact: true })` failed: the `Stat`
   component renders `{value}{unit-span}` with no separating whitespace text node, so the
   DOM text is literally `"30LNGX"`, not `"30"`. Confirmed via the Playwright
   `error-context.md` snapshot (`text: Balance 30LNGX addrB`). Changed the assertion to
   `page.getByText("30LNGX")`.
3. Kept the brief's home-page and 404 assertions unchanged — they matched actual rendered
   output (`"Total blocks"`, `"Latest blocks"`, and a 404 HTTP status from `notFound()`)
   with no adjustment needed.

## typecheck / lint / build
`pnpm typecheck`, `pnpm lint`, and `pnpm build` all pass cleanly at the repo root
(6/6 packages including `@explorer/web`, which now also typechecks `e2e/` and
`playwright.config.ts`).

## Rebrand gate
```
git grep -niE "aiblock|aibcoin|@2waychain|2wayjs|ablock" -- ':!.github/workflows/ci.yml'
```
Result: **CLEAN** (no matches).

## CI e2e job
Added as a job named `e2e` in `.github/workflows/ci.yml`, placed after `verify` in the
file, running independently (no `needs: verify`) so the fast unit-test gate isn't blocked
behind the slower browser job — same postgres:16 service block as `verify`,
`pnpm/action-setup@v4` with no pinned version (repo pins pnpm via `packageManager`),
Node 22 + pnpm cache, `pnpm install --frozen-lockfile`,
`pnpm -F @explorer/web exec playwright install --with-deps chromium`, then
`pnpm -F @explorer/web e2e` with `DATABASE_URL: postgres://explorer:explorer@localhost:5432/explorer_test`
at job env level. Validated as well-formed YAML with `ruby -ryaml`.

## Artifacts
`test-results/`, `playwright-report/`, `blob-report/` were generated locally and removed
before commit; they're now gitignored.

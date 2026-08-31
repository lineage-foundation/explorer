# Lineage Explorer

A monorepo (pnpm + Turborepo) for the Lineage block explorer:

- `apps/web` — the explorer web app (Next.js, App Router)
- `apps/indexer` — the block indexer worker (ingests the chain into Postgres)
- `packages/db` — Drizzle schema + typed queries
- `packages/chain` — the Lineage node client
- `packages/ui` — the design-system component kit
- `packages/config` — shared tooling config + brand constants

## Run locally (against a local `../fleet` node)

The explorer reads the chain from a locally-running Lineage node provided by the
[`fleet`](../fleet) repo, and stores it in a local Postgres.

**Prerequisites:** Node 22, `pnpm`, Docker.

```bash
# 1. Start the Lineage node cluster (in the fleet repo).
#    On Apple Silicon, prefix with FLEET_COMPOSE_PLATFORM=linux/arm64.
cd ../fleet && docker compose up
#    Publishes: storage-node API :3001 (blocks), mempool-node API :3003 (supply).

# 2. In this repo: install, start a local Postgres, create the schema, run.
pnpm install
pnpm setup            # copies .env.example -> .env (edit if needed)
pnpm dev:db           # local Postgres on localhost:5432 (docker compose)
pnpm db:migrate       # apply the schema
pnpm dev              # runs the indexer + web with hot reload
```

- Web: <http://localhost:8080>
- Indexer health/status: <http://localhost:8090/health>, `/status`

`pnpm dev` loads `.env` (via `dotenv-cli`) and runs both apps under Turborepo.
The indexer ingests blocks from the fleet node into Postgres; the web app reads
Postgres directly. Stop the DB with `pnpm dev:stop`.

### How the fleet connection is wired

The indexer talks to the fleet's **`/v1` REST API** (`/v1/blocks/*`,
`/v1/blockchain-entries/query`, `/v1/supply`).

| What | Env var | Default | Served by |
| --- | --- | --- | --- |
| Blocks / transactions | `LINEAGE_STORAGE_NODE_URL` | `http://localhost:3001` | fleet **storage** node |
| Circulating / total supply | `LINEAGE_MEMPOOL_NODE_URL` | `http://localhost:3003` | fleet **mempool** node |
| Database | `DATABASE_URL` | `postgres://explorer:explorer@localhost:5432/explorer` | local Postgres |

The supply endpoint (`/v1/supply`) lives on the **mempool** node, not the
storage node — so `LINEAGE_MEMPOOL_NODE_URL` must be set for circulating
supply to resolve. All other tunables (indexer batching, poll interval, log
level, health port) are in `.env.example` with sane defaults.

### Run in Docker with hot reload (`pnpm dev:docker`)

```bash
# fleet must be running (see step 1 above). Then:
pnpm dev:docker            # docker compose -f docker-compose.dev.yml up
```

Runs Postgres + an auto-migrate step + a `dev` container that bind-mounts the
source and runs `turbo run dev` (web on :8080, indexer health on :8090) in watch
mode — **code changes reflect live**, no image rebuild. `node_modules` live in
named volumes (installed in-container for the right platform); file changes are
picked up via polling (Docker bind mounts don't deliver inotify events on
macOS/Windows). Reaches the fleet node via `host.docker.internal:3001/3003`.
First run installs deps in-container (slower); subsequent runs reuse the volumes.

### Run everything in Docker (production-like)

```bash
# fleet must be running (see step 1 above). Then:
docker compose up          # builds + runs postgres, migrate, web, indexer
```

`web` + `indexer` + `postgres` run in containers, self-contained: they use the
internal `postgres` service and reach the fleet node on the host via
`host.docker.internal:3001/3003` — no `.env` required. A one-shot `migrate`
service applies the schema before `web`/`indexer` start, so the stack comes up
ready. Use this for a production-like local run; use `pnpm dev` for iteration.

### Migrations & the `postgres` hostname

- **Host dev (`pnpm dev`):** run `pnpm db:migrate` once (it uses `.env`'s
  `DATABASE_URL`, i.e. `localhost:5432` — the Postgres started by `pnpm dev:db`).
- **Docker (`docker compose up`):** migrations run automatically via the
  `migrate` service — nothing to do.

The hostname `postgres` in `docker-compose.yml` only resolves **inside** the
compose network (that is how `web`/`indexer` reach the DB). If you see
`getaddrinfo ENOTFOUND postgres`, a process **outside** that network is trying to
use it — e.g. running `pnpm db:migrate` on the host with a stale `.env`, or
starting `web`/`indexer` without the `postgres` service. From the host, always
use `localhost:5432`; run the full `docker compose up` so the `postgres` service
is present on the network.

## Public API

A read-only REST API is served under `/api/v1`. Interactive docs (Scalar) are
at `/api/v1/docs` and the OpenAPI 3.1 document at `/api/v1/openapi.json`.
Access is anonymous with a soft per-IP rate limit.

## Scripts

| Script | Purpose |
| --- | --- |
| `pnpm dev` | Run indexer + web on the host (hot reload), loading `.env` |
| `pnpm dev:docker` | Run the whole stack in Docker with hot reload |
| `pnpm dev:db` / `pnpm dev:stop` | Start / stop the local Postgres container |
| `pnpm db:migrate` | Apply the database schema |
| `pnpm build` / `pnpm typecheck` / `pnpm lint` | Standard gates |
| `pnpm test` | Unit/integration tests (needs a Postgres; see CI) |

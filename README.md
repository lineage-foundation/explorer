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

| What | Env var | Default | Served by |
| --- | --- | --- | --- |
| Blocks / transactions | `LINEAGE_STORAGE_NODE_URL` | `http://localhost:3001` | fleet **storage** node |
| Circulating / total supply | `LINEAGE_MEMPOOL_NODE_URL` | `http://localhost:3003` | fleet **mempool** node |
| Database | `DATABASE_URL` | `postgres://explorer:explorer@localhost:5432/explorer` | local Postgres |

The supply endpoints (`/issued_supply`, `/total_supply`) live on the **mempool**
node, not the storage node — so `LINEAGE_MEMPOOL_NODE_URL` must be set for
circulating supply to resolve. All other tunables (indexer batching, poll
interval, log level, health port) are in `.env.example` with sane defaults.

### Run everything in Docker (alternative)

`docker compose up` builds and runs `web` + `indexer` + `postgres` in containers.
Those services are self-contained: they use the internal `postgres` service and
reach the fleet node on the host via `host.docker.internal:3001/3003` — no `.env`
required. Use this for a production-like local run; use `pnpm dev` for iteration.

## Scripts

| Script | Purpose |
| --- | --- |
| `pnpm dev` | Run indexer + web on the host (hot reload), loading `.env` |
| `pnpm dev:db` / `pnpm dev:stop` | Start / stop the local Postgres container |
| `pnpm db:migrate` | Apply the database schema |
| `pnpm build` / `pnpm typecheck` / `pnpm lint` | Standard gates |
| `pnpm test` | Unit/integration tests (needs a Postgres; see CI) |

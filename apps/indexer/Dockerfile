FROM node:22-slim AS base
RUN corepack enable
WORKDIR /app

FROM base AS build
COPY . .
RUN pnpm install --frozen-lockfile
RUN pnpm -F @explorer/indexer build
RUN pnpm --filter @explorer/indexer --prod deploy /out

FROM gcr.io/distroless/nodejs22-debian12 AS runtime
WORKDIR /app
ENV NODE_ENV=production INDEXER_MIGRATE_ON_START=true MIGRATIONS_DIR=/app/drizzle
COPY --from=build /out/node_modules ./node_modules
COPY --from=build /app/apps/indexer/dist ./dist
# Committed migration SQL, applied on startup (idempotent) so the indexer
# converges the schema before ingesting.
COPY --from=build /app/packages/db/drizzle ./drizzle
CMD ["dist/index.js"]

FROM node:22-slim AS base
RUN corepack enable
WORKDIR /app

FROM base AS build
COPY . .
RUN pnpm install --frozen-lockfile
RUN pnpm -F @explorer/web build

FROM gcr.io/distroless/nodejs22-debian12 AS runtime
WORKDIR /app
# HOSTNAME=0.0.0.0 so Next's standalone server binds all interfaces (Docker sets
# HOSTNAME to the container id by default, which the proxy can't reach).
ENV NODE_ENV=production PORT=8080 HOSTNAME=0.0.0.0
COPY --from=build /app/apps/web/.next/standalone ./
COPY --from=build /app/apps/web/.next/static ./apps/web/.next/static
COPY --from=build /app/apps/web/public ./apps/web/public
EXPOSE 8080
CMD ["apps/web/server.js"]

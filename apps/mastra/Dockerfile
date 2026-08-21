# Build from the repository root:
#   docker build -f apps/mastra/Dockerfile -t mastra-blueprint-mastra .
#
# Rock8Cloud builds this image itself: point the service at this path and it
# reads the port from EXPOSE below. Nothing here needs a secret — every
# environment variable is read on first use at runtime, not at build time.
FROM oven/bun:1.3.14 AS build
WORKDIR /app

# Manifests first, so `bun install` is cached until a dependency actually
# changes. The lockfile covers every workspace, so every package.json in it has
# to be present for --frozen-lockfile to resolve.
COPY package.json bun.lock turbo.json ./
COPY apps/mastra/package.json apps/mastra/package.json
COPY apps/web/package.json apps/web/package.json
COPY packages/typescript-config/package.json packages/typescript-config/package.json
RUN bun install --frozen-lockfile

COPY apps/mastra apps/mastra
COPY packages/typescript-config packages/typescript-config

# `mastra build --studio` bundles the server *and* Studio into
# apps/mastra/.mastra/output, together with that bundle's own node_modules.
RUN cd apps/mastra && bun run build

FROM node:22-slim AS runtime
WORKDIR /app
ENV NODE_ENV=production
# Overridden by the platform. `src/mastra/index.ts` reads PORT and binds it
# explicitly, so a busy port fails loudly instead of moving somewhere else.
ENV PORT=4111

COPY --from=build /app/apps/mastra/.mastra/output ./
# The server applies these at startup (src/db/migrate.ts), so the image must
# carry the migrations of exactly this commit next to the bundle.
COPY --from=build /app/apps/mastra/drizzle ./drizzle

EXPOSE 4111
# This is what `mastra start` spawns: node on the built entry, from its own
# directory. Running it directly keeps the CLI out of the runtime image.
CMD ["node", "index.mjs"]

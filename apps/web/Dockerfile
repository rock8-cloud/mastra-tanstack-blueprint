# Build from the repository root:
#   docker build -f apps/web/Dockerfile -t mastra-blueprint-web .
#
# MASTRA_API_URL is deliberately *not* a build argument: it is read per request
# on the server, so one image works against any Mastra deployment.
FROM oven/bun:1.3.14 AS build
WORKDIR /app

COPY package.json bun.lock turbo.json ./
COPY apps/mastra/package.json apps/mastra/package.json
COPY apps/web/package.json apps/web/package.json
COPY packages/typescript-config/package.json packages/typescript-config/package.json
RUN bun install --frozen-lockfile

COPY apps/web apps/web
COPY packages/typescript-config packages/typescript-config

# Vite + Nitro emit a self-contained Node server in apps/web/.output.
RUN cd apps/web && bun run build

FROM node:22-slim AS runtime
WORKDIR /app
ENV NODE_ENV=production
# Overridden by the platform; the Nitro server reads PORT.
ENV PORT=3000

COPY --from=build /app/apps/web/.output ./.output

EXPOSE 3000
CMD ["node", ".output/server/index.mjs"]

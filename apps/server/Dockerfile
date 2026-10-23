# syntax=docker/dockerfile:1@sha256:4edf897a3ffa55b89f906fc8cc78afdb3f1834cc9c7083565e611a8a7d5fe99e
#
# Server image. Four stages so the runtime layer contains no compiler, no dev
# dependency and no source: a smaller image, and a smaller attack surface.
#
# Base images are pinned to an exact patch tag. `npm run pin:images` rewrites
# these lines with the resolved sha256 digests, which is the stronger form of
# pinning (a tag can be re-pushed, a digest cannot).

ARG NODE_IMAGE=node:24.22.1-bookworm-slim@sha256:55fb5f5a527ea2c5c4a95f963e48ef90aa38c7b346054fdc8ee9957a2b55d205

# ── Dependencies (including dev, needed to compile TypeScript) ────────────────
FROM ${NODE_IMAGE} AS deps
WORKDIR /app
# Only the manifests, so this layer is cached until a dependency actually changes.
COPY package.json package-lock.json ./
COPY packages/shared/package.json packages/shared/
COPY apps/server/package.json apps/server/
COPY apps/client/package.json apps/client/
# `npm ci` installs exactly the lockfile; `npm install` could silently drift.
RUN npm ci --ignore-scripts

# ── Build ─────────────────────────────────────────────────────────────────────
FROM deps AS build
COPY tsconfig.base.json tsconfig.json ./
COPY packages/shared packages/shared
COPY apps/server apps/server
RUN npx tsc -b apps/server

# ── Production dependencies only ──────────────────────────────────────────────
FROM ${NODE_IMAGE} AS prod-deps
WORKDIR /app
COPY package.json package-lock.json ./
COPY packages/shared/package.json packages/shared/
COPY apps/server/package.json apps/server/
COPY apps/client/package.json apps/client/
RUN npm ci --omit=dev --ignore-scripts && npm cache clean --force

# ── Runtime ───────────────────────────────────────────────────────────────────
FROM ${NODE_IMAGE} AS runtime
ENV NODE_ENV=production
WORKDIR /app

COPY --from=prod-deps /app/node_modules ./node_modules
COPY --from=build /app/packages/shared/dist ./packages/shared/dist
COPY --from=build /app/packages/shared/package.json ./packages/shared/
COPY --from=build /app/apps/server/dist ./apps/server/dist
COPY --from=build /app/apps/server/package.json ./apps/server/
COPY package.json ./

# The node image ships an unprivileged `node` user (uid 1000). Running as root
# would mean a remote-code-execution bug owns the container.
USER node

EXPOSE 4000

# /api/ready, not /api/health: Compose gates dependent services on this, and
# "the process is up" is not the question those services are asking. A failing
# critical dependency (MongoDB from step 05) must hold them back.
HEALTHCHECK --interval=15s --timeout=3s --start-period=20s --retries=3 \
  CMD node -e "fetch('http://127.0.0.1:'+(process.env.PORT||4000)+'/api/ready').then(r=>process.exit(r.ok?0:1)).catch(()=>process.exit(1))"

# No npm in the entrypoint: npm would be PID 1 and would not forward SIGTERM,
# so the graceful shutdown in index.ts would never run.
CMD ["node", "apps/server/dist/index.js"]

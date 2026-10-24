# syntax=docker/dockerfile:1@sha256:4edf897a3ffa55b89f906fc8cc78afdb3f1834cc9c7083565e611a8a7d5fe99e
#
# Client image with two usable targets:
#
#   dev   — Vite dev server with hot module replacement. The default for the
#           local stack, because the point of this release is a machine a
#           contributor can clone and work in.
#   serve — static build behind nginx. Written now so the production path is
#           not a surprise later; the production Compose profile itself is
#           deferred (docs/roadmap/PRODUCTION.md, P5).

ARG NODE_IMAGE=node:24.22.1-bookworm-slim@sha256:55fb5f5a527ea2c5c4a95f963e48ef90aa38c7b346054fdc8ee9957a2b55d205
ARG NGINX_IMAGE=nginx:alpine@sha256:a3554c0d0b48177b1413c26e01f695334428020d9df01243fbae3e11cfd17417

FROM ${NODE_IMAGE} AS deps
WORKDIR /app
# /app belongs to the unprivileged `node` user before anything is installed, and
# every later stage stays that user. The dev server has to write at runtime —
# Vite bundles vite.config.ts to a sibling temp file and caches dependency
# pre-bundles in node_modules/.vite — so a root-owned tree makes the container
# crash-loop with EACCES. Chowning here rather than after `npm ci` keeps the
# node_modules layer from being duplicated.
RUN chown node:node /app
USER node
COPY --chown=node:node package.json package-lock.json ./
COPY --chown=node:node packages/shared/package.json packages/shared/
COPY --chown=node:node apps/client/package.json apps/client/
COPY --chown=node:node apps/server/package.json apps/server/
# `--ignore-scripts`, matching the server image. A workspace install pulls in
# every workspace's dev dependencies, and `redis-memory-server`'s postinstall
# compiles Redis from source — which needs `make`, absent from a slim image, so
# the build fails on a package this image never runs. Nothing the client ships
# needs a lifecycle script.
RUN npm ci --ignore-scripts

FROM deps AS dev
# The root tsconfig.json is deliberately *not* copied. It is a solution file
# whose only content is references to all three projects, including
# ./apps/server, which this image has no reason to contain. Vite's transformer
# resolves the nearest tsconfig when it processes @csas/shared and fails on the
# dangling reference — a failure that only appeared once the client started
# importing the shared locale formatters. Nothing here needs it: each project's
# own tsconfig extends tsconfig.base.json directly.
COPY --chown=node:node tsconfig.base.json ./
COPY --chown=node:node packages/shared packages/shared
COPY --chown=node:node apps/client apps/client
RUN npx tsc -b packages/shared
EXPOSE 5173
CMD ["npm", "run", "dev", "-w", "@csas/client"]

FROM deps AS build
COPY --chown=node:node tsconfig.base.json ./
COPY --chown=node:node packages/shared packages/shared
COPY --chown=node:node apps/client apps/client
RUN npx tsc -b packages/shared && npm run build -w @csas/client

FROM ${NGINX_IMAGE} AS serve
COPY --from=build /app/apps/client/dist /usr/share/nginx/html
COPY infra/nginx/client.conf /etc/nginx/conf.d/default.conf
EXPOSE 8081

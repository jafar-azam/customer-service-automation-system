# syntax=docker/dockerfile:1
#
# Client image with two usable targets:
#
#   dev   — Vite dev server with hot module replacement. The default for the
#           local stack, because the point of this release is a machine a
#           contributor can clone and work in.
#   serve — static build behind nginx. Written now so the production path is
#           not a surprise later; the production Compose profile itself is
#           deferred (docs/roadmap/PRODUCTION.md, P5).

ARG NODE_IMAGE=node:24.22.1-bookworm-slim
ARG NGINX_IMAGE=nginx:alpine

FROM ${NODE_IMAGE} AS deps
WORKDIR /app
COPY package.json package-lock.json ./
COPY packages/shared/package.json packages/shared/
COPY apps/client/package.json apps/client/
COPY apps/server/package.json apps/server/
RUN npm ci

FROM deps AS dev
COPY tsconfig.base.json tsconfig.json ./
COPY packages/shared packages/shared
COPY apps/client apps/client
RUN npx tsc -b packages/shared
USER node
EXPOSE 5173
CMD ["npm", "run", "dev", "-w", "@csas/client"]

FROM deps AS build
COPY tsconfig.base.json tsconfig.json ./
COPY packages/shared packages/shared
COPY apps/client apps/client
RUN npx tsc -b packages/shared && npm run build -w @csas/client

FROM ${NGINX_IMAGE} AS serve
COPY --from=build /app/apps/client/dist /usr/share/nginx/html
COPY infra/nginx/client.conf /etc/nginx/conf.d/default.conf
EXPOSE 8081

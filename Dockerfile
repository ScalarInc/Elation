# syntax=docker/dockerfile:1.7
# Elation X: one image serves the web app and the API (docs/step-14-deploy-ops.md).
#   docker build -t elation-x .
#   docker run -p 4000:4000 --env-file server/.env.production elation-x
# Migrations are not run on start: Railway runs `npx prisma migrate deploy` as the
# pre-deploy command (railway.json), once per deploy, before traffic switches.

ARG NODE_IMAGE=node:24-slim

# ─── Build: install everything, build shared → webapp → server ───
FROM ${NODE_IMAGE} AS build
WORKDIR /app
ENV CI=true

COPY package.json package-lock.json ./
COPY packages/shared/package.json packages/shared/
COPY server/package.json server/
COPY webapp/package.json webapp/
# `postinstall` runs `prisma generate`: it needs the schema and config first.
COPY server/prisma server/prisma
COPY server/prisma.config.ts server/
RUN --mount=type=cache,target=/root/.npm npm ci

COPY packages/shared packages/shared
COPY server server
COPY webapp webapp
RUN npm run build && npm run check:bundle --workspace webapp

# ─── Production dependencies of the server only ───
FROM ${NODE_IMAGE} AS deps
WORKDIR /app
COPY package.json package-lock.json ./
COPY packages/shared/package.json packages/shared/
COPY server/package.json server/
COPY webapp/package.json webapp/
COPY server/prisma server/prisma
COPY server/prisma.config.ts server/
RUN --mount=type=cache,target=/root/.npm npm ci --omit=dev --workspace server --include-workspace-root=false \
  && rm -rf server/src/generated

# ─── Runtime ───
FROM ${NODE_IMAGE} AS runtime
ENV NODE_ENV=production \
    HOST=0.0.0.0 \
    PORT=4000 \
    SERVE_WEBAPP_DIST=/app/webapp/dist \
    NODE_OPTIONS=--enable-source-maps
WORKDIR /app/server

COPY --from=deps --chown=node:node /app/node_modules /app/node_modules
COPY --from=deps --chown=node:node /app/package.json /app/package.json
COPY --from=deps --chown=node:node /app/packages/shared /app/packages/shared
COPY --chown=node:node server/package.json server/prisma.config.ts ./
COPY --chown=node:node server/prisma ./prisma
COPY --from=build --chown=node:node /app/server/dist ./dist
COPY --from=build --chown=node:node /app/webapp/dist /app/webapp/dist

USER node
EXPOSE 4000
HEALTHCHECK --interval=30s --timeout=5s --start-period=20s --retries=3 \
  CMD node -e "fetch('http://127.0.0.1:'+(process.env.PORT||4000)+'/api/v1/healthz').then(r=>process.exit(r.ok?0:1),()=>process.exit(1))"
CMD ["node", "dist/server.js"]

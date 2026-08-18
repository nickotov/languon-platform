# syntax=docker/dockerfile:1.7@sha256:a57df69d0ea827fb7266491f2813635de6f17269be881f696fbfdf2d83dda33e

FROM node:24-bookworm-slim@sha256:3638d9a6fe4030bd716be989438248074489337ba3275657f93595428be4fc03 AS builder

ENV PNPM_HOME=/pnpm
ENV PATH=$PNPM_HOME:$PATH
WORKDIR /workspace

RUN corepack enable && corepack prepare pnpm@10.13.1 --activate
COPY . .
RUN --mount=type=cache,id=languon-pnpm,target=/pnpm/store \
    pnpm install --frozen-lockfile
RUN pnpm --filter @languon/backend... build
RUN --mount=type=cache,id=languon-pnpm,target=/pnpm/store \
    pnpm --filter @languon/backend deploy --prod /production/backend

FROM node:24-bookworm-slim@sha256:3638d9a6fe4030bd716be989438248074489337ba3275657f93595428be4fc03 AS runtime

ARG RELEASE_SHA=development
LABEL org.opencontainers.image.title="Languon backend" \
      org.opencontainers.image.revision=$RELEASE_SHA

ENV NODE_ENV=production
ENV RELEASE_SHA=$RELEASE_SHA
WORKDIR /app

COPY --from=builder --chown=node:node /production/backend/node_modules ./node_modules
COPY --from=builder --chown=node:node /workspace/apps/backend/dist ./dist
COPY --from=builder --chown=node:node /workspace/apps/backend/package.json ./package.json

USER node
EXPOSE 4000
HEALTHCHECK --interval=10s --timeout=3s --start-period=15s --retries=3 \
    CMD ["node", "-e", "fetch('http://127.0.0.1:4000/livez').then(r=>{if(!r.ok)process.exit(1)}).catch(()=>process.exit(1))"]
CMD ["node", "dist/index.js"]

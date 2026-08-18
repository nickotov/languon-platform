# syntax=docker/dockerfile:1.7@sha256:a57df69d0ea827fb7266491f2813635de6f17269be881f696fbfdf2d83dda33e

FROM node:24-bookworm-slim@sha256:3638d9a6fe4030bd716be989438248074489337ba3275657f93595428be4fc03 AS builder

ENV PNPM_HOME=/pnpm
ENV PATH=$PNPM_HOME:$PATH
WORKDIR /workspace

RUN corepack enable && corepack prepare pnpm@10.13.1 --activate
COPY . .
RUN --mount=type=cache,id=languon-pnpm,target=/pnpm/store \
    pnpm install --frozen-lockfile
RUN pnpm --filter @languon/web... build

FROM node:24-bookworm-slim@sha256:3638d9a6fe4030bd716be989438248074489337ba3275657f93595428be4fc03 AS runtime

ARG RELEASE_SHA=development
LABEL org.opencontainers.image.title="Languon web" \
      org.opencontainers.image.revision=$RELEASE_SHA

ENV HOSTNAME=0.0.0.0
ENV NODE_ENV=production
ENV PORT=3333
ENV RELEASE_SHA=$RELEASE_SHA
WORKDIR /app/apps/web

COPY --from=builder --chown=node:node /workspace/apps/web/.next/standalone /app
COPY --from=builder --chown=node:node /workspace/apps/web/.next/static ./.next/static

USER node
EXPOSE 3333
HEALTHCHECK --interval=10s --timeout=3s --start-period=15s --retries=3 \
    CMD ["node", "-e", "fetch('http://127.0.0.1:3333/healthz').then(r=>{if(!r.ok)process.exit(1)}).catch(()=>process.exit(1))"]
CMD ["node", "server.js"]

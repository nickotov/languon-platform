# syntax=docker/dockerfile:1.7@sha256:a57df69d0ea827fb7266491f2813635de6f17269be881f696fbfdf2d83dda33e
FROM node:24-bookworm-slim@sha256:3638d9a6fe4030bd716be989438248074489337ba3275657f93595428be4fc03 AS builder
ENV PNPM_HOME=/pnpm
ENV PATH=$PNPM_HOME:$PATH
WORKDIR /workspace
RUN corepack enable && corepack prepare pnpm@10.13.1 --activate
COPY . .
RUN --mount=type=cache,id=languon-pnpm,target=/pnpm/store \
    pnpm install --frozen-lockfile
ARG RELEASE_SHA=development
ENV RELEASE_SHA=$RELEASE_SHA
RUN pnpm --filter @languon/admin... build

FROM nginx:1.29-alpine@sha256:5616878291a2eed594aee8db4dade5878cf7edcb475e59193904b198d9b830de AS runtime
ARG RELEASE_SHA=development
LABEL org.opencontainers.image.title="Languon admin" \
    org.opencontainers.image.revision=$RELEASE_SHA
COPY infra/docker/admin.nginx.conf /etc/nginx/nginx.conf
COPY --from=builder /workspace/apps/admin/dist /usr/share/nginx/html
RUN chown -R nginx:nginx /usr/share/nginx/html
USER nginx
EXPOSE 3001
HEALTHCHECK --interval=10s --timeout=3s --start-period=5s --retries=3 \
    CMD ["wget", "--quiet", "--spider", "http://127.0.0.1:3001/healthz"]
ENTRYPOINT []
CMD ["nginx", "-g", "daemon off;"]

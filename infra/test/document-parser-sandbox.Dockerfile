FROM node:24-bookworm-slim@sha256:3638d9a6fe4030bd716be989438248074489337ba3275657f93595428be4fc03

WORKDIR /probe
COPY infra/test/document-parser-sandbox-probe.mjs ./probe.mjs
USER node
CMD ["node", "probe.mjs"]

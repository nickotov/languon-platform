FROM node:24-alpine
WORKDIR /fixture
COPY infra/deploy/tests/fixtures/stream-server.mjs ./server.mjs
USER node
CMD ["node", "server.mjs"]


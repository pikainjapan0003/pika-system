FROM node:24.18.0-bookworm-slim

ENV COREPACK_DEFAULT_TO_LATEST=0
WORKDIR /workspace
RUN corepack enable && corepack prepare pnpm@10.34.4 --activate

# Build the current API with the existing lockfile. No frontend or secrets needed.
COPY package.json pnpm-lock.yaml pnpm-workspace.yaml .npmrc tsconfig*.json ./
COPY artifacts/api-server ./artifacts/api-server
COPY lib ./lib
RUN pnpm install --frozen-lockfile --filter @workspace/api-server... \
    && pnpm --filter @workspace/api-server run build

ENV NODE_ENV=production PORT=8080 PIKA_PRIVATE_POC=true
USER node
WORKDIR /workspace/artifacts/api-server
EXPOSE 8080
CMD ["node", "src/poc/start.mjs"]

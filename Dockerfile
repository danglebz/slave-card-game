# Multi-stage build: install deps + build the Vite client with pnpm, then run the
# Fastify/Socket.IO server on Bun. Only needed if Render's native `runtime: node`
# blueprint (render.yaml) is swapped for this Docker-based service.

FROM node:22-slim AS build
WORKDIR /app
RUN corepack enable
COPY package.json pnpm-lock.yaml ./
RUN pnpm install --frozen-lockfile
COPY . .
RUN pnpm build

FROM oven/bun:1 AS runtime
WORKDIR /app
ENV NODE_ENV=production
COPY --from=build /app/node_modules ./node_modules
COPY --from=build /app/dist ./dist
COPY --from=build /app/server ./server
COPY --from=build /app/shared ./shared
COPY --from=build /app/package.json ./package.json

EXPOSE 4000
CMD ["bun", "server/index.ts"]

# Build context: repo root.
# Railway: set Root Directory = / and Dockerfile Path = relay-api-service/Dockerfile
#
# Why ts-node and not a tsc build step?
#   The service is small, ts-node startup is ~1s, and avoiding a build step
#   keeps the Dockerfile trivial. Switch to tsc + node ./dist/index.js if
#   cold-start ever matters.

FROM node:20-alpine

WORKDIR /app

# Copy only what the service needs.
COPY relay-api-service/package.json relay-api-service/package-lock.json* ./relay-api-service/
COPY relay-api-service/tsconfig.json ./relay-api-service/
COPY relay-api-service/src ./relay-api-service/src

WORKDIR /app/relay-api-service

# Production install. ts-node + typescript are dev deps in package.json today,
# but the service runs them at boot — install the lot rather than splitting.
RUN npm install --include=dev --no-audit --no-fund

# Persistent data dir. Mount a Railway Volume at /app/relay-api-service/data
# in the service Settings → Volumes, otherwise volume.jsonl is wiped on every
# redeploy and the leaderboard re-derives from on-chain only.
# (Railway rejects the Dockerfile VOLUME directive — use Railway Volumes UI.)
RUN mkdir -p ./data ./logs

# Railway sets PORT; the service already reads process.env.PORT.
ENV NODE_ENV=production

CMD ["npm", "start"]

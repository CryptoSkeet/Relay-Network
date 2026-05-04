# Build context: repo root
# Railway: set Root Directory = / and Dockerfile Path = services/heartbeat/Dockerfile

FROM node:20-alpine

WORKDIR /app

# Copy plugin-sdk first (local workspace dependency)
COPY packages/plugin-sdk ./packages/plugin-sdk

# Copy heartbeat service files
COPY services/heartbeat/package.json ./services/heartbeat/package.json
COPY services/heartbeat/heartbeat.js ./services/heartbeat/heartbeat.js
COPY services/heartbeat/agent-content-generator.js ./services/heartbeat/agent-content-generator.js
COPY services/heartbeat/contract-agent.js ./services/heartbeat/contract-agent.js
COPY services/heartbeat/inference-receipt.js ./services/heartbeat/inference-receipt.js
COPY services/heartbeat/llm-circuit-breaker.js ./services/heartbeat/llm-circuit-breaker.js

WORKDIR /app/services/heartbeat

# Install production deps (file:../../packages/plugin-sdk resolves correctly)
RUN npm install --production

# Env vars injected by Railway — no .env file needed
CMD ["node", "heartbeat.js"]

#!/bin/bash
cd /mnt/c/Users/willi/v0-ai-agent-instagram
echo "=== Starting pnpm install ==="
pnpm install --no-frozen-lockfile 2>&1
echo "=== Install exit code: $? ==="
echo "=== Starting build ==="
pnpm run build 2>&1
echo "=== Build exit code: $? ==="

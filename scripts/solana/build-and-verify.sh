#!/usr/bin/env bash
# Build + deploy + verify Relay Solana programs using Docker (no host
# toolchain required). This is the canonical path that also satisfies
# `solana-verify verify-from-repo` because it uses the exact same
# reproducible image (solanafoundation/solana-verifiable-build).
#
# Prereqs (host):
#   - Docker Desktop running
#   - solana CLI on PATH (for deploy + verify steps only)
#   - solana-verify CLI:  cargo install solana-verify
#   - ~/.config/solana/id.json funded on devnet
#
# Usage:
#   ./scripts/solana/build-and-verify.sh                  # build all
#   ./scripts/solana/build-and-verify.sh relay_reputation # build one
#
# After build: deploy + verify using the printed commands.

set -euo pipefail

REPO_URL="${REPO_URL:-https://github.com/CryptoSkeet/v0-ai-agent-instagram}"
CLUSTER="${CLUSTER:-devnet}"
IMAGE="solanafoundation/solana-verifiable-build:2.1.11"

PROGRAMS=("relay_reputation" "relay_agent_profile" "relay_agent_registry")
declare -A PROGRAM_IDS=(
  [relay_reputation]="2dysoEiGEyn2DeUKgFneY1KxBNqGP4XWdzLtzBK8MYau"
  # Profile + registry IDs filled in after first deploy:
  [relay_agent_profile]=""
  [relay_agent_registry]="Hs1hX4pSZSAQKLgGrcydyEaJMsJfqXQqJyJvVnqdaoDE"
)

TARGETS=()
if [[ $# -gt 0 ]]; then
  TARGETS=("$@")
else
  TARGETS=("${PROGRAMS[@]}")
fi

ROOT="$(cd "$(dirname "$0")/../.." && pwd)"
cd "$ROOT"

for prog in "${TARGETS[@]}"; do
  echo "==> Building $prog in Docker (reproducible)…"
  docker run --rm \
    -v "$ROOT":/workdir \
    -w /workdir/programs \
    "$IMAGE" \
    cargo build-sbf --manifest-path "$prog/Cargo.toml"
  echo "    Built: programs/target/deploy/${prog}.so"
done

echo
echo "==> Next steps:"
for prog in "${TARGETS[@]}"; do
  pid="${PROGRAM_IDS[$prog]}"
  so="programs/target/deploy/${prog}.so"
  if [[ -z "$pid" ]]; then
    echo "  # First-time deploy for $prog (no program ID yet):"
    echo "  solana program deploy --url $CLUSTER $so"
  else
    echo "  # Upgrade $prog ($pid):"
    echo "  solana program deploy --url $CLUSTER --program-id <keypair> $so"
    echo "  # Verify against this repo:"
    echo "  solana-verify verify-from-repo \\"
    echo "    --url $CLUSTER \\"
    echo "    --program-id $pid \\"
    echo "    --library-name $prog \\"
    echo "    --mount-path programs \\"
    echo "    $REPO_URL"
  fi
done

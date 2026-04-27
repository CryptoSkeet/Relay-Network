#!/usr/bin/env bash
set -euo pipefail
source "$HOME/.cargo/env"
export PATH="$HOME/.local/share/solana/install/active_release/bin:$PATH"

SRC=/mnt/c/Users/dirby/v0-ai-agent-instagram/programs
WORK=$HOME/relay-build/programs
rm -rf "$HOME/relay-build"
mkdir -p "$WORK"

cp "$SRC/Cargo.toml" "$WORK/"
[ -f "$SRC/Cargo.lock" ] && cp "$SRC/Cargo.lock" "$WORK/"
[ -f "$SRC/Anchor.toml" ] && cp "$SRC/Anchor.toml" "$WORK/"
for d in relay_agent_registry relay_reputation relay_agent_profile; do
  if [ -d "$SRC/$d" ]; then
    mkdir -p "$WORK/$d"
    cp "$SRC/$d/Cargo.toml" "$WORK/$d/"
    cp -r "$SRC/$d/src" "$WORK/$d/"
    [ -f "$SRC/$d/Xargo.toml" ] && cp "$SRC/$d/Xargo.toml" "$WORK/$d/"
  fi
done

cd "$WORK"
echo "=== building relay_agent_registry ==="
cargo-build-sbf --manifest-path relay_agent_registry/Cargo.toml

echo "=== artifacts ==="
ls -la target/deploy/

DEST=/mnt/c/Users/dirby/v0-ai-agent-instagram/programs/target/deploy
mkdir -p "$DEST"
cp -v target/deploy/relay_agent_registry.so "$DEST/"
[ -f target/deploy/relay_agent_registry-keypair.json ] && cp -v target/deploy/relay_agent_registry-keypair.json "$DEST/" || true
echo "DONE"

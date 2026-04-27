#!/usr/bin/env bash
set -euo pipefail
source "$HOME/.cargo/env"
sh -c "$(curl -sSfL https://release.anza.xyz/v3.1.11/install)"
echo 'export PATH="$HOME/.local/share/solana/install/active_release/bin:$PATH"' >> "$HOME/.bashrc"
export PATH="$HOME/.local/share/solana/install/active_release/bin:$PATH"
solana --version
cargo-build-sbf --version

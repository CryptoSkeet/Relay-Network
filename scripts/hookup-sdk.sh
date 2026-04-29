#!/usr/bin/env bash
# hookup-sdk.sh
# Publishes @relaynetwork/agent-sdk from packages/sdk and wires it
# into the root app as a real dependency.
#
# Run from the repo root:
#   bash scripts/hookup-sdk.sh
#
# Prerequisites: Node >=18, pnpm, an npm account with publish rights to
# the @relaynetwork scope (or use --dry-run to skip publish).

set -euo pipefail

DRY_RUN=${1:-""}   # pass --dry-run as first arg to skip npm publish

REPO_ROOT="$(cd "$(dirname "$0")/.." && pwd)"
SDK_DIR="$REPO_ROOT/packages/sdk"

echo ""
echo "━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━"
echo "  Relay SDK hookup — @relaynetwork/agent-sdk"
echo "━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━"
echo ""

# ── Step 1: build the SDK ─────────────────────────────────────────────────────
echo "▶  Building SDK…"
cd "$SDK_DIR"
# Ensure deps are present for the DTS pass (use pnpm to match repo lockfile)
pnpm install --silent
# Build without --clean (avoids EPERM on Windows-mounted paths)
pnpm exec tsup src/index.ts --format cjs,esm --dts
echo "   ✓ Build complete"
echo ""

# ── Step 1b: confirm version is bumped (avoid 403 on republish) ──────────────
SDK_VERSION=$(node -p "require('./package.json').version")
if [ "$DRY_RUN" != "--dry-run" ]; then
  if npm view "@relaynetwork/agent-sdk@$SDK_VERSION" version >/dev/null 2>&1; then
    echo "✗ Version $SDK_VERSION already published. Bump packages/sdk/package.json and re-run."
    exit 1
  fi
  echo "   ✓ Version $SDK_VERSION is unpublished — safe to publish"
  echo ""
fi

# ── Step 2: publish to npm (skip in dry-run mode) ────────────────────────────
if [ "$DRY_RUN" = "--dry-run" ]; then
  echo "⚠  Dry run — skipping npm publish"
  echo "   (remove --dry-run to publish @relaynetwork/agent-sdk)"
  echo ""
else
  echo "▶  Publishing @relaynetwork/agent-sdk to npm…"
  npm publish --access public
  echo "   ✓ Published"
  echo ""
fi

# ── Step 3: add/update the dependency in the root app ────────────────────────
echo "▶  Wiring @relaynetwork/agent-sdk into root package.json…"
cd "$REPO_ROOT"

# Detect package manager
if [ -f "pnpm-lock.yaml" ]; then
  PKG_MGR="pnpm"
elif [ -f "yarn.lock" ]; then
  PKG_MGR="yarn"
else
  PKG_MGR="npm"
fi

echo "   using $PKG_MGR"

if [ "$DRY_RUN" = "--dry-run" ]; then
  # Install from local build via file: reference; safe for testing
  echo "   (dry-run) installing from local file: ./packages/sdk"
  $PKG_MGR add "@relaynetwork/agent-sdk@file:./packages/sdk"
else
  # Install the published version from npm
  $PKG_MGR add "@relaynetwork/agent-sdk@latest"
fi

echo "   ✓ Dependency added"
echo ""

# ── Step 4: verify the import resolves ───────────────────────────────────────
echo "▶  Verifying import…"
node --input-type=module <<'EOF'
import { RelayAgent } from '@relaynetwork/agent-sdk'
if (typeof RelayAgent !== 'function') {
  console.error('ERROR: RelayAgent is not a constructor')
  process.exit(1)
}
console.log('   ✓ RelayAgent imported OK')
EOF

echo ""
echo "━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━"
echo "  Done. SDK is hooked up."
echo ""
echo "  Next steps:"
echo "    1. Use the SDK in your app code:"
echo "       import { RelayAgent } from '@relaynetwork/agent-sdk'"
echo ""
echo "    2. Generate TypeScript types (if using Supabase):"
echo "       pnpm run db:types"
echo ""
echo "    3. Re-run this script after bumping the SDK version"
echo "       in packages/sdk/package.json"
echo "━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━"
echo ""

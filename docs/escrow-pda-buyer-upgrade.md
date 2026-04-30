# Escrow PDA seed upgrade — bind buyer pubkey

**Status:** code shipped, **NOT YET DEPLOYED on-chain**.
**Target:** `programs/relay_agent_registry` (program id `Hs1hX4pSZSAQKLgGrcydyEaJMsJfqXQqJyJvVnqdaoDE`).

## What changed

PDA seeds for the escrow program were upgraded from:

```
escrow_account: [b"escrow",       sha256(contract_id)]
escrow_vault:   [b"escrow-vault", sha256(contract_id)]
```

to:

```
escrow_account: [b"escrow",       sha256(contract_id), buyer.key()]
escrow_vault:   [b"escrow-vault", sha256(contract_id), buyer.key()]
```

## Why

The old seed scheme was vulnerable to a **PDA squatting attack**:
an attacker who learned a `contract_id` (e.g. via leaked DB row or
public API response) could front-run with their own `lock_escrow`
call — seeding 1 raw RELAY unit and becoming `escrow.buyer`.
Our `lib/solana/relay-escrow.ts` carries a `decodeEscrowBuyer` runtime
check (lines 158–203 of the old version) to defend against this, but
that defense is fragile: any code path that skips the check, or any
race window between PDA creation and the read, leaks the contract.

Binding `buyer.key()` into the seeds makes the squat **impossible**:
an attacker would derive a different PDA, so they cannot collide with
the legitimate buyer's escrow account.

## Code changes (already merged to main, awaiting deploy)

| File | Change |
| --- | --- |
| [`programs/relay_agent_registry/src/lib.rs`](../programs/relay_agent_registry/src/lib.rs) | 6 PDA seed declarations + 2 runtime CPI seeds in `release_escrow` and `refund_escrow` updated to include buyer pubkey. |
| [`lib/solana/relay-escrow.ts`](../lib/solana/relay-escrow.ts) | `deriveEscrowPDA` and `deriveEscrowVaultPDA` now take `buyer: PublicKey`. `releaseEscrowOnChain` gets a new `buyerPublicKey` param. `decodeEscrowBuyer` belt-and-suspenders comment updated. |
| [`lib/contract-engine.js`](../lib/contract-engine.js) | Release path resolves buyer wallet via `ensureAgentWallet(buyer_agent_id ?? client_id)` and threads it into `releaseEscrowOnChain`. |
| [`scripts/smoke-escrow-uuid.mjs`](../scripts/smoke-escrow-uuid.mjs) | Smoke test passes payer as buyer to derives. |

## Migration risk

**Low.** Per [`docs/anchor-program-audit.md`](./anchor-program-audit.md) §4.1,
the previous seed-length bug (UUID > 32 bytes) made the escrow
program "silently unreachable; we're effectively running a
single-mint settlement model" until the SHA-256 fix shipped on
2026-04-27. We have no record of any successful production
`lock_escrow` calls before the new program is deployed, so there are
no live escrows that would become unrecoverable on upgrade.

If any escrows DID land between 2026-04-27 and the deploy of this
upgrade, drain them by running `release_escrow` / `refund_escrow`
against the OLD program build BEFORE deploying the new IDL.

## Deploy checklist

```
# 1. From a Linux/macOS box (or WSL) with the Anchor toolchain:
cd programs
anchor build

# 2. Inspect the new IDL:
diff -u target/idl/relay_agent_registry.json.bak target/idl/relay_agent_registry.json

# 3. Drain any live escrows on the OLD build (likely none, see above):
node scripts/scan-locked-escrows.mjs        # TODO write if needed
# Manually release/refund any matches.

# 4. Deploy upgrade (same program id):
anchor upgrade target/deploy/relay_agent_registry.so \
    --program-id Hs1hX4pSZSAQKLgGrcydyEaJMsJfqXQqJyJvVnqdaoDE \
    --provider.cluster mainnet-beta

# 5. Refresh the IDL on-chain:
anchor idl upgrade Hs1hX4pSZSAQKLgGrcydyEaJMsJfqXQqJyJvVnqdaoDE \
    -f target/idl/relay_agent_registry.json \
    --provider.cluster mainnet-beta

# 6. Smoke test on devnet first if you have a devnet copy:
node scripts/smoke-escrow-uuid.mjs
# Expect: lock → release happy-path passes with new (contract_id, buyer) seeds.

# 7. Verify a real contract on mainnet:
#    Initiate a tiny test contract through the app, watch for
#    "[contract-engine] On-chain escrow lock tx: ..." in logs, confirm
#    the PDA derivation in TS matches the address minted on-chain.
```

## Rollback

If the upgrade misbehaves:

1. Revert this commit on `main`.
2. `anchor upgrade` back to the previous `.so` artifact (kept in
   `target/deploy/relay_agent_registry-prev.so` per build convention).
3. Refresh IDL with the previous version.
4. Any escrows minted under the new seeds become unrecoverable until
   the new program is restored — accept the risk window or roll
   forward with a fix instead of rolling back.

## Out of scope (follow-ups)

- Add a backward-compat `release_escrow_legacy` instruction if we ever
  find we need to recover an old-seed PDA. Skipped for now: low risk
  per the migration analysis above.
- Drop `decodeEscrowBuyer` entirely once the new program has been
  stable in production for 30+ days. For now keep as defense in depth.

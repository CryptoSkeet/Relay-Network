# relay_agent_profile — On-Chain Agent Profiles

Anchor program that mirrors canonical Relay agent profiles into handle-derived
PDAs so anyone can verify reputation on Solscan instead of trusting an API.

## What it gives you

- **PDA seeds:** `["profile", utf8(handle)]` (handle ≤ 32 bytes)
- **Stored fields:** handle, display_name, did_pubkey, wallet, reputation_score
  (basis points), completed/failed/disputed contracts, total_earned (RELAY base
  units), is_verified, is_suspended, profile_hash (sha256 of canonical JSON),
  created_at, updated_at, version (monotonic).
- **Trust model:** single treasury authority writes (same model as
  `relay_reputation`). Score derivation stays in DB (deterministic from
  `contracts` rows). On-chain is an auditable snapshot + commitment hash.

## Files

- `programs/relay_agent_profile/src/lib.rs` — Anchor program
- `lib/solana/agent-profile.ts` — TS client (PDA derivation, upsert, reader)
- `app/api/v1/agents/[handle]/profile/route.ts` — paid endpoint, returns
  `onchain_profile_pda` + `onchain_profile_solscan_url`
- `app/api/v1/agents/[handle]/reputation/route.ts` — same
- `scripts/sync-onchain-profiles.mjs` — backfill / cron writer

## Deploy (one-time)

```bash
cd programs

# 1. Generate program keypair (replaces the placeholder declare_id!)
solana-keygen new -o relay_agent_profile-keypair.json --no-bip39-passphrase

# 2. Print the new program ID and update three places:
solana address -k relay_agent_profile-keypair.json
#   - programs/relay_agent_profile/src/lib.rs       declare_id!("...")
#   - programs/Anchor.toml                          [programs.devnet]/[programs.mainnet]
#   - .env.local                                    NEXT_PUBLIC_RELAY_AGENT_PROFILE_PROGRAM_ID

# 3. Build + deploy
anchor build
anchor deploy --program-name relay_agent_profile --provider.cluster devnet
# (or mainnet — needs ~3 SOL for program rent)

# 4. Initialize the writer authority (once per cluster)
node -e "require('./lib/solana/agent-profile').initProfileConfig().then(console.log)"
```

## Backfill existing agents

```bash
node scripts/sync-onchain-profiles.mjs --dry-run
node scripts/sync-onchain-profiles.mjs               # all
node scripts/sync-onchain-profiles.mjs relay_foundation   # one
```

## Verify on Solscan

The PDA is fully deterministic — anyone can derive it client-side:

```ts
import { PublicKey } from '@solana/web3.js'
const PROGRAM_ID = new PublicKey('AgntProFiLe1111111111111111111111111111111') // post-deploy
const [pda] = PublicKey.findProgramAddressSync(
  [Buffer.from('profile'), Buffer.from('relay_foundation', 'utf8')],
  PROGRAM_ID,
)
// → https://solscan.io/account/<pda>
```

## Hot-path integration

After every reputation event (settle, cancel, dispute, endorsement), call:

```ts
import { upsertAgentProfileOnChain } from '@/lib/solana/agent-profile'

await upsertAgentProfileOnChain({
  handle, displayName, didPubkey, wallet,
  reputationScore, completedContracts, failedContracts, disputes,
  totalEarned, isVerified, isSuspended,
})
// → returns { signature, pda, solscanUrl, profileHash }
```

Persist the returned `pda` into `agents.onchain_profile_pda` and the
`signature` into `agents.onchain_commitment_tx`.

## Verifying a profile_hash

The on-chain `profile_hash` is `sha256(canonicalProfileJson(fields))`. To
verify the API response wasn't tampered with after the on-chain write, a
client can:

1. Read the PDA on-chain → get `profile_hash`.
2. Recompute `sha256(canonical_json(api_response))`.
3. Compare. Mismatch ⇒ stale or tampered API response.

`canonicalProfileJson()` in `lib/solana/agent-profile.ts` is the canonical
field order — clients in other languages must serialize identically.

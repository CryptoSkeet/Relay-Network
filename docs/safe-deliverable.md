# SAFE deliverable — agent profile on Solana devnet

**Created:** 2026-04-25
**Cluster:** devnet
**Program:** [`Hkr85mHxBFZk9i3MeFu2YEj7ZPuhvPf3New4idiQTGMr`](https://solscan.io/account/Hkr85mHxBFZk9i3MeFu2YEj7ZPuhvPf3New4idiQTGMr?cluster=devnet)

## The link

**Agent profile PDA on Solscan:**
[`7KBFRzQMyWRvXT2pAEWoma7u83Jco1YUx2hj2i4wj2M5`](https://solscan.io/account/7KBFRzQMyWRvXT2pAEWoma7u83Jco1YUx2hj2i4wj2M5?cluster=devnet)

This is a real on-chain account holding the canonical profile snapshot for
agent `forge_gpt`. Anyone can verify the score without trusting the
Relay API — they just derive the PDA from the handle and read the account
data.

```
$ solana account 7KBFRzQMyWRvXT2pAEWoma7u83Jco1YUx2hj2i4wj2M5 --url devnet
Public Key: 7KBFRzQMyWRvXT2pAEWoma7u83Jco1YUx2hj2i4wj2M5
Balance:    0.00281184 SOL
Owner:      Hkr85mHxBFZk9i3MeFu2YEj7ZPuhvPf3New4idiQTGMr   ← our program
Length:     276 bytes
0000:   3c e3 2a 18  00 57 56 cd  09 00 00 00  66 6f 72 67   <.*..WV.....forg
```

## Provenance

| Field | Value |
|---|---|
| Handle | `forge_gpt` |
| Display name | Forge |
| Agent ID (DB) | `33ad98f6-6983-4911-8f15-2e0108dd3bc1` |
| Wallet | [`Ak3TGfYoGnHTDgvyGCgAgCsdh5cxjXkJkLWuH3x77su5`](https://solscan.io/account/Ak3TGfYoGnHTDgvyGCgAgCsdh5cxjXkJkLWuH3x77su5?cluster=devnet) |
| Reputation score | 50 bps |
| Total earned | 0 (RELAY base units) |
| Verified | true |
| Status | active |
| Init config tx | [`2sjheAVAtcPERSw5cdNKUUqre5BbcHybTQV5uhn6BfgBbHeNYCxYfQgwDnfAo8adNjfASnPexytDimsZMZ1k9xiL`](https://solscan.io/tx/2sjheAVAtcPERSw5cdNKUUqre5BbcHybTQV5uhn6BfgBbHeNYCxYfQgwDnfAo8adNjfASnPexytDimsZMZ1k9xiL?cluster=devnet) |
| Upsert profile tx | [`66h8ASYnBEqtajshmqxb3vyJMGfjBLfzKSCr5pHmjWayfqacKt691AkZzQukRq1mWdoj9rQ2H4NocgEUCs6uyosc`](https://solscan.io/tx/66h8ASYnBEqtajshmqxb3vyJMGfjBLfzKSCr5pHmjWayfqacKt691AkZzQukRq1mWdoj9rQ2H4NocgEUCs6uyosc?cluster=devnet) |
| Config PDA | [`4WNgZXrGtArMx557jBAX1B7xXzN6otGPqqmtQd5omQHr`](https://solscan.io/account/4WNgZXrGtArMx557jBAX1B7xXzN6otGPqqmtQd5omQHr?cluster=devnet) |

## How to verify (TS)

```ts
import { deriveAgentProfilePDA, RELAY_AGENT_PROFILE_PROGRAM_ID } from '@/lib/solana/agent-profile'
import { Connection } from '@solana/web3.js'

const [pda] = deriveAgentProfilePDA('forge_gpt')
// pda.toBase58() === '7KBFRzQMyWRvXT2pAEWoma7u83Jco1YUx2hj2i4wj2M5'

const conn = new Connection('https://api.devnet.solana.com')
const acct = await conn.getAccountInfo(pda)
// acct.owner.equals(RELAY_AGENT_PROFILE_PROGRAM_ID) === true
// acct.data is the borsh-encoded AgentProfile struct
```

## How this was shipped (timeline ≈ 35 min, end-to-end autonomous)

1. `solana-keygen new` → `programs/relay_agent_profile-keypair.json`
   (gitignored).
2. Pubkey `Hkr85mHxBFZk9i3MeFu2YEj7ZPuhvPf3New4idiQTGMr` written into
   `programs/relay_agent_profile/src/lib.rs` `declare_id!` and
   `programs/Anchor.toml`.
3. New CI workflow [`.github/workflows/deploy-profile.yml`](../.github/workflows/deploy-profile.yml)
   modeled on `deploy-reputation.yml`.
4. Keypair uploaded as `PROGRAM_KEYPAIR_PROFILE` GitHub secret via `gh secret set`.
5. Commit `62e441d` pushed → workflow auto-triggered → built and deployed to
   devnet at slot 457925853.
6. [`scripts/deploy-profile-link.ts`](../scripts/deploy-profile-link.ts) ran
   `initProfileConfig()` (one-shot) and `upsertAgentProfileOnChain()` for
   `forge_gpt`.
7. Both calls hit the documented `TransactionExpiredBlockheightExceededError`
   from the legacy `@solana/web3.js` `sendAndConfirmTransaction` path — but
   both transactions actually finalized (verified via `solana confirm`). See
   `docs/phase-4-followups.md` "Reputation anchor still on @solana/web3.js"
   — same root cause, applies to `agent-profile.ts` too.

## Reproducing this artifact

```powershell
$env:NEXT_PUBLIC_RELAY_AGENT_PROFILE_PROGRAM_ID = 'Hkr85mHxBFZk9i3MeFu2YEj7ZPuhvPf3New4idiQTGMr'
$env:NEXT_PUBLIC_SOLANA_NETWORK = 'devnet'
pnpm tsx scripts/deploy-profile-link.ts --handle forge_gpt
```

## Followups

- **P1:** Port `lib/solana/agent-profile.ts` to `@solana/kit` via
  `lib/solana/send.ts` to eliminate the blockhash-expired noise. Same fix as
  the reputation client — added to `docs/phase-4-followups.md`.
- **P1:** Wire `upsertAgentProfileOnChain()` into the contract settle path so
  every reputation event automatically refreshes the on-chain snapshot.

# Relay Network — Anchor Program Audit

**Audit Date:** 2026-04-25
**Auditor:** Pass C session (read-only research, no edits)
**Scope:** Three Anchor programs under `programs/` plus their TS/JS clients
**Optimization function:** *Shortest path to one Solscan link of a real agent
profile on devnet.*

This document is the artifact. It does not propose to be the fix. It separates
"knowing what we have" from "deciding what to do."

---

## TL;DR

We have three Anchor programs (`relay_agent_registry`, `relay_reputation`,
`relay_agent_profile`), all pinned to Anchor 0.31.0. **Two are deployed to
devnet, one is not.** Of the two deployed, **one (escrow inside
`relay_agent_registry`) is unreachable in production today** because of a
PDA seed-length bug. The third (`relay_agent_profile`) is fully coded but
still has the System Program ID as its placeholder declare_id.

**Recommendation: fix in place, do not scaffold fresh.** The shortest path
to a Solscan link of a real agent profile is:

1. Run `anchor deploy --program-name relay_agent_profile` to claim a real
   program ID (≈ 30 minutes).
2. Update [programs/relay_agent_profile/src/lib.rs](../programs/relay_agent_profile/src/lib.rs) `declare_id!`
   and [programs/Anchor.toml](../programs/Anchor.toml).
3. Set `NEXT_PUBLIC_RELAY_AGENT_PROFILE_PROGRAM_ID`.
4. Call `initProfileConfig()` once.
5. Call `upsertProfile()` for any one real agent → Solscan link.

Estimated time-to-first-link: **2 hours**, no Rust changes required.

The escrow seed-length bug is unrelated to the agent-profile path and can
be fixed later as a separate workstream.

---

## 1. Program inventory

### 1.1 `relay_agent_registry`

| | |
|---|---|
| Program ID (declare_id!) | `Hs1hX4pSZSAQKLgGrcydyEaJMsJfqXQqJyJvVnqdaoDE` ([lib.rs L5](../programs/relay_agent_registry/src/lib.rs)) |
| Program ID (Anchor.toml) | matches ✓ ([Anchor.toml L11](../programs/Anchor.toml)) |
| Anchor version | 0.31.0 ([Cargo.toml L13](../programs/relay_agent_registry/Cargo.toml)) |
| Deployed | ✅ devnet (CI: [`.github/workflows/deploy-registry.yml`](../.github/workflows/deploy-registry.yml)) |
| IDL | ✅ [`lib/solana/idl/relay_agent_registry.json`](../lib/solana/idl/relay_agent_registry.json) |
| Reachable from prod | **Partially** — agent registration paths reachable; escrow paths broken |

#### Instructions

| Instruction | Args | Purpose |
|---|---|---|
| `register_agent` | `handle: String, capabilities_hash: [u8; 32]` | DID-keyed PDA for agent profile |
| `update_capabilities` | `capabilities_hash: [u8; 32]` | Update capability commitment |
| `commit_model` | `model_hash: [u8; 32], prompt_hash: [u8; 32]` | Tamper-evidence layer |
| `update_commitment` | `model_hash, prompt_hash` | Update model commitment |
| `lock_escrow` | `contract_id: String, amount: u64` | **BROKEN** — see §4.1 |
| `release_escrow` | – | **BROKEN** — see §4.1 |
| `refund_escrow` | – | **BROKEN** — see §4.1 |

#### PDAs

| PDA | Seeds | Status |
|---|---|---|
| `agent_profile` | `[b"agent-profile", did_pubkey.as_ref()]` (≈52 B) | ✓ |
| `model_commitment` | `[b"model-commitment", did_pubkey.as_ref()]` (≈48 B) | ✓ |
| `escrow` | `[b"escrow", contract_id.as_bytes()]` | **🔴 36-byte UUID exceeds 32-byte seed limit** |
| `escrow_vault` | `[b"escrow-vault", contract_id.as_bytes()]` | **🔴 same bug** |

#### State accounts

| Struct | Size | Notes |
|---|---|---|
| `AgentProfile` | 123 B | `MAX_HANDLE_LEN = 30` |
| `ModelCommitment` | 113 B | – |
| `EscrowAccount` | 163 B | `MAX_CONTRACT_ID_LEN = 36` (matches the broken seed) |

### 1.2 `relay_reputation`

| | |
|---|---|
| Program ID | `2dysoEiGEyn2DeUKgFneY1KxBNqGP4XWdzLtzBK8MYau` ([lib.rs L21](../programs/relay_reputation/src/lib.rs)) |
| Anchor.toml | matches ✓ |
| Anchor version | 0.31.0 |
| Deployed | ✅ devnet ([`.github/workflows/deploy-reputation.yml`](../.github/workflows/deploy-reputation.yml)) |
| Keypair | [`programs/relay_reputation-keypair.json`](../programs/relay_reputation-keypair.json) (matches declare_id) |
| IDL | ❌ none (TS client uses raw discriminators) |
| Called from prod | Yes, via [`lib/solana/relay-reputation.ts`](../lib/solana/relay-reputation.ts) — but suffers blockhash-expired errors under congestion (see [`docs/phase-4-followups.md`](./phase-4-followups.md)) |

#### Instructions

| Instruction | Args |
|---|---|
| `init_config` | `authority: Pubkey` (one-shot) |
| `set_authority` | `new_authority: Pubkey` |
| `record_settlement` | `agent_did: Pubkey, contract_id_hash: [u8; 32], amount: u64, outcome: u8, score: u32, fulfilled: bool` |

#### PDAs

| PDA | Seeds | Status |
|---|---|---|
| `reputation-config` | `[b"reputation-config"]` | ✓ |
| `reputation` | `[b"reputation", agent_did.as_ref()]` | ✓ |

### 1.3 `relay_agent_profile`

| | |
|---|---|
| Program ID (declare_id!) | `11111111111111111111111111111111` ([lib.rs L28](../programs/relay_agent_profile/src/lib.rs)) — **placeholder = System Program** |
| Anchor.toml | matches placeholder |
| Anchor version | 0.31.0 |
| Deployed | ❌ never |
| CI deploy workflow | ❌ none |
| IDL | ❌ none |
| TS client | ✅ [`lib/solana/agent-profile.ts`](../lib/solana/agent-profile.ts) (scaffolded; uses placeholder ID) |

#### Instructions

| Instruction | Args |
|---|---|
| `init_config` | `authority: Pubkey` |
| `set_authority` | `new_authority: Pubkey` |
| `upsert_profile` | `handle, display_name, did_pubkey, wallet, reputation_score, completed_contracts, failed_contracts, disputes, total_earned, is_verified, is_suspended, permissions, fulfilled_contracts, total_contracts, profile_hash` |

#### PDAs

| PDA | Seeds | Status |
|---|---|---|
| `profile-config` | `[b"profile-config"]` | ✓ |
| `profile` | `[b"profile", handle.as_bytes()]` | ✓ (handle bounded to 32 B — at the limit, but valid) |

**Design choice worth highlighting:** profile PDA is keyed by *handle*, not
by pubkey. That makes the Solscan link for any agent derivable from the
handle alone (no API lookup, no DB read). This is exactly the property we
want for the optimization function — anyone with a handle can compute the
PDA address and click through to Solscan.

---

## 2. Workspace configuration

### 2.1 `programs/Anchor.toml`

```toml
[workspace]
members = ["relay_agent_registry", "relay_reputation", "relay_agent_profile"]

[features]
seeds = false
skip-lint = false

[programs.devnet]
relay_agent_registry = "Hs1hX4pSZSAQKLgGrcydyEaJMsJfqXQqJyJvVnqdaoDE"
relay_reputation     = "2dysoEiGEyn2DeUKgFneY1KxBNqGP4XWdzLtzBK8MYau"
relay_agent_profile  = "11111111111111111111111111111111"

[provider]
cluster = "devnet"
wallet  = "~/.config/solana/id.json"
```

- Devnet only. No mainnet, no testnet entries.
- `seeds = false` → Anchor does not enforce seed verification at compile time.

### 2.2 `programs/Cargo.toml`

- Resolver 2 ✓
- `overflow-checks = true` in release profile ✓
- No shared workspace deps; each program pins its own.

---

## 3. Client integration

| TS file | Targets | Pattern | State |
|---|---|---|---|
| [`lib/solana/agent-registry.ts`](../lib/solana/agent-registry.ts) | `relay_agent_registry` (register/update) | raw web3.js, manual ix | Functional |
| [`lib/solana/relay-escrow.ts`](../lib/solana/relay-escrow.ts) | `relay_agent_registry` (escrow) | mixed: web3.js + @solana/kit | release/refund Kit-ported (Pass C); lock still web3.js; **all paths bypassed in prod via `EscrowNotFoundError` fallback** |
| [`lib/solana/relay-reputation.ts`](../lib/solana/relay-reputation.ts) | `relay_reputation` | raw web3.js, manual discriminators | Active in prod; flaky under congestion |
| [`lib/solana/agent-profile.ts`](../lib/solana/agent-profile.ts) | `relay_agent_profile` | raw web3.js, manual ix | **Dormant** — placeholder program ID |

**Net wire-up status:** of the three programs only `relay_reputation` is
actually being called from production code. `relay_agent_registry`'s
escrow path is bypassed; `relay_agent_profile` has never been called
because there's nothing to call.

---

## 4. Findings

### 4.1 🔴 P0 (already known, restated for completeness): escrow PDA seed-length bug

- **Where:** [`programs/relay_agent_registry/src/lib.rs`](../programs/relay_agent_registry/src/lib.rs) lines 441 (`escrow`), 452 (`escrow-vault`).
- **Bug:** `seeds = [b"escrow", contract_id.as_bytes()]` where `contract_id` is a 36-byte UUID. Solana caps each PDA seed at 32 bytes. Every real call therefore fails at the client with `Max seed length exceeded`.
- **Production effect:** [`lib/solana/relay-escrow.ts`](../lib/solana/relay-escrow.ts) wraps the derive in try/catch and throws our typed `EscrowNotFoundError`, which `lib/contract-engine.js` catches and falls back to a bare `mintRelayTokens` call. Net: on-chain escrow is silently unreachable; we're effectively running a single-mint settlement model.
- **Fix (program side):** hash the contract_id to 32 bytes inside the program (`solana_program::keccak::hash(contract_id.as_bytes()).0`) and use that as the seed. Update the TS client's `deriveEscrowPDA` to perform the same hash before deriving.
- **Cross-ref:** [`docs/phase-4-followups.md`](./phase-4-followups.md#on-chain--solana) — already tracked.

### 4.2 🟠 P1: `relay_agent_profile` has placeholder program ID

- **Where:** [`programs/relay_agent_profile/src/lib.rs`](../programs/relay_agent_profile/src/lib.rs) L28; [`programs/Anchor.toml`](../programs/Anchor.toml) L13.
- **Bug:** declare_id! is `11111111111111111111111111111111` (System Program). This passes `anchor build` but cannot be deployed because nobody owns the System Program keypair.
- **Fix:** generate a new keypair (`solana-keygen new -o programs/relay_agent_profile-keypair.json`), read the pubkey, paste into both files, then `anchor deploy --program-name relay_agent_profile`.
- **No code changes needed** — the program logic is complete.

### 4.3 🟠 P1: no GitHub Actions workflow for `relay_agent_profile` deploy

- Existing workflows: `deploy-registry.yml`, `deploy-reputation.yml`. Neither covers `relay_agent_profile`.
- Once §4.2 is unblocked, copy `deploy-reputation.yml`, swap the program name and the secret name (`PROGRAM_KEYPAIR_PROFILE`), and commit.

### 4.4 🟠 P1: no IDLs for `relay_reputation` or `relay_agent_profile`

- Only `relay_agent_registry.json` exists under [`lib/solana/idl/`](../lib/solana/idl/).
- TS clients for the other two programs hand-roll instruction discriminators. Functional but fragile: an upstream Rust change to argument order will silently break the wire format.
- **Fix:** copy `target/idl/*.json` from each program's build directory into `lib/solana/idl/` after every deploy, then refactor the TS clients to consume the IDL via `@coral-xyz/anchor`.

### 4.5 🟠 P1: `relay_reputation` calls still on raw `@solana/web3.js`

- Already documented in [`docs/phase-4-followups.md`](./phase-4-followups.md). Restating here because it surfaces specifically when this program is exercised.

### 4.6 🟡 P2: escrow state machine has no transition guards

- `release_escrow` and `refund_escrow` ([lib.rs L471](../programs/relay_agent_registry/src/lib.rs), L498) do not check `EscrowAccount.state` before transitioning. In principle, a privileged caller could refund an already-released escrow or vice versa.
- Mitigation today: only the backend authority signs these calls, and `lib/contract-engine.js` enforces state on the DB side. Still — defense in depth requires a `require!(escrow.state == Locked)` in both instructions.

### 4.7 🟡 P2: `lock_escrow` lacks zero-amount semantic clarity

- A `require!(amount > 0)` exists at L131 but the error message is generic. Easy upgrade to a typed `EscrowError::ZeroAmount`.

### 4.8 🟡 P2: zero on-chain test coverage

- No `programs/*/tests/` directories exist. The escrow seed-length bug would have been caught by a one-line test (`Pubkey::find_program_address(&[b"escrow", &Uuid::new_v4().to_string().as_bytes()], &id())` — guaranteed panic).
- **Fix:** add `programs/relay_agent_registry/tests/escrow.ts` with PDA-derivation, state-machine, and authority tests. Anchor scaffolds these via `anchor init`.

### 4.9 🟢 P3: `agent_profile` and `model_commitment` PDAs in registry vs. dedicated `profile` PDA in `relay_agent_profile`

- The registry already stores agent-profile-shaped data (DID-keyed). The new `relay_agent_profile` program stores a richer profile (handle-keyed, with reputation snapshot fields).
- These are not redundant — they serve different lookups (DID → profile vs. handle → profile) — but the overlap is worth a future architecture review.

### 4.10 🟢 P3: Anchor version (0.31.0) requires Rust 1.86.0 pin

- `deploy-reputation.yml` already pins this. Documented for the next person who wonders why CI uses an old toolchain.

---

## 5. Trust model (single-authority pattern)

All three programs follow the same model:

- **One authority** (Relay treasury, `RELAY_PAYER_SECRET_KEY`) is the sole signer for state-changing instructions.
- No multisig, no DAO, no decentralised governance.
- `require_keys_eq!(ctx.accounts.authority.key(), ctx.accounts.config.authority)` is the gate ([reputation L154](../programs/relay_reputation/src/lib.rs); [profile L50](../programs/relay_agent_profile/src/lib.rs)).
- Database remains source of truth. Programs are tamper-evident snapshots, not the live compute.

This is appropriate for current scale (single founder, no on-chain DAO) but
should be reviewed before token launch.

---

## 6. Decision: fix in place vs. scaffold fresh

### Optimisation function recap

> Shortest path to one Solscan link of a real agent profile on devnet.

### Option A — fix in place (recommended)

| Step | Time |
|---|---|
| Generate `programs/relay_agent_profile-keypair.json` | 1 min |
| Update declare_id + Anchor.toml | 2 min |
| `anchor build && anchor deploy --program-name relay_agent_profile` (devnet) | ~20 min (cold) |
| Set `NEXT_PUBLIC_RELAY_AGENT_PROFILE_PROGRAM_ID` env var | 1 min |
| Run `initProfileConfig()` (one-shot) | 5 min |
| Run `upsertProfile()` for one real agent | 5 min |
| Click the resulting Solscan link | 0 min |
| **Total** | **~35 min** |

Followups (not blocking the Solscan link):

- Copy `deploy-reputation.yml` → `deploy-profile.yml` so subsequent program changes auto-deploy. (~30 min)
- Wire `upsertProfile()` into the contract settle path (~2 hours).

### Option B — scaffold fresh

Disregards a fully-coded, Anchor 0.31-compatible program. Net loss of
~3 days. **Not recommended.**

The escrow seed-length bug is unrelated to the agent-profile path and can
be fixed in its own workstream.

---

## 7. Audit checklist

- [x] Program IDs match between `declare_id!` and `Anchor.toml`
- [x] Anchor version pinned consistently across all three (0.31.0)
- [x] Instruction inventory complete
- [x] PDA seed lengths checked against 32-byte limit (1 violation)
- [x] State struct sizes correctly declared
- [x] Deployment status verified (CI workflows + keypair files)
- [x] TS client integration mapped
- [x] IDL inventory (only registry has one)
- [x] Test coverage assessed (none exists)
- [x] Authority + state-machine checks reviewed
- [x] Cross-referenced against [`docs/phase-4-followups.md`](./phase-4-followups.md)

---

## 8. Appendix — file references

| Component | Path |
|---|---|
| Workspace manifest | [`programs/Anchor.toml`](../programs/Anchor.toml) |
| Workspace cargo | [`programs/Cargo.toml`](../programs/Cargo.toml) |
| `relay_agent_registry` source | [`programs/relay_agent_registry/src/lib.rs`](../programs/relay_agent_registry/src/lib.rs) |
| `relay_reputation` source | [`programs/relay_reputation/src/lib.rs`](../programs/relay_reputation/src/lib.rs) |
| `relay_agent_profile` source | [`programs/relay_agent_profile/src/lib.rs`](../programs/relay_agent_profile/src/lib.rs) |
| Reputation keypair | [`programs/relay_reputation-keypair.json`](../programs/relay_reputation-keypair.json) |
| Registry IDL | [`lib/solana/idl/relay_agent_registry.json`](../lib/solana/idl/relay_agent_registry.json) |
| Registry deploy CI | [`.github/workflows/deploy-registry.yml`](../.github/workflows/deploy-registry.yml) |
| Reputation deploy CI | [`.github/workflows/deploy-reputation.yml`](../.github/workflows/deploy-reputation.yml) |
| Registry TS client | [`lib/solana/agent-registry.ts`](../lib/solana/agent-registry.ts) |
| Escrow TS client | [`lib/solana/relay-escrow.ts`](../lib/solana/relay-escrow.ts) |
| Reputation TS client | [`lib/solana/relay-reputation.ts`](../lib/solana/relay-reputation.ts) |
| Profile TS client | [`lib/solana/agent-profile.ts`](../lib/solana/agent-profile.ts) |

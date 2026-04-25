# Phase 4+ Follow-ups

Living list of known-but-deferred work. Add to this file every time you
discover a problem you don't have time to fix today. The point is to make
deferred work *searchable* in 6 months instead of tribal knowledge.

Format: `- [ ] [SEVERITY] short title — surfaced YYYY-MM-DD in <context>`
Severity: `P0` ship-blocking, `P1` next sprint, `P2` quarterly cleanup,
          `P3` nice-to-have.

---

## Open

### On-chain / Solana

- [ ] **[P1] Reputation anchor still on `@solana/web3.js`** — surfaced
  2026-04-25 during Pass C smoke test.
  `lib/solana/relay-reputation-bridge.ts:75` calls raw
  `sendAndConfirmTransaction` without blockhash refresh, so it routinely
  throws `TransactionExpiredBlockheightExceededError` under devnet
  congestion. Port to `@solana/kit` via the canonical `lib/solana/send.ts`
  wrapper (CU estimation + p75 priority fee + blockhash retry come for
  free). Mirrors the `lib/solana/relay-escrow.ts` Pass C item 4 port.

- [ ] **[P1] `agent-profile.ts` has the same blockhash-expired bug** —
  surfaced 2026-04-25 while shipping the SAFE deliverable. Both
  `initProfileConfig()` and `upsertAgentProfileOnChain()` use raw
  `sendAndConfirmTransaction`. Both calls *actually finalized* on devnet
  but the client threw — operator had to `solana confirm` manually to
  see the truth. Same fix as the reputation item: port to
  `lib/solana/send.ts`. Until then, callers MUST treat
  `TransactionExpiredBlockheightExceededError` as "maybe succeeded, go
  check on-chain" rather than a real failure. Also add an
  `upsertAgentProfileOnChain()` call to the contract settle path so the
  PDA stays current.

- [ ] **[P1] On-chain escrow program rejects UUID `contract_id`s** —
  surfaced 2026-04-25 during Pass C smoke test.
  `programs/relay_agent_registry/src/lib.rs` derives PDA seeds via
  `b"escrow"` + `contract_id.as_bytes()`. Solana caps PDA seeds at 32
  bytes; UUIDs are 36. Currently the TS client throws "Max seed length
  exceeded" for every real contract, which we now catch as
  `EscrowNotFoundError` → silent fallback to mint. Net effect: the
  on-chain escrow program is unreachable from production today. Fix:
  hash `contract_id` to 32 bytes inside the program (e.g. `keccak256`)
  and update the TS PDA derivation to match. See Pass C smoke output for
  forensic.

- [ ] **[P2] `lockEscrowOnChain` still on `@solana/web3.js`** — Pass C
  item 4 ported `release` and `refund` only because they don't need a
  buyer keypair as co-signer. `lock` requires the buyer agent's signer,
  which means routing through `@/lib/solana/agent-signer` first. Defer
  until escrow is actually wired into the new-contract path.

### Database / Idempotency

- [ ] **[P2] Daily reconciliation sweeper not yet running** — surfaced
  2026-04-25 (Pass C). The atomic-claim + idempotency-row pattern
  guarantees no duplicate mints, but it does NOT auto-recover the case
  where: (a) on-chain mint succeeded, (b) `transactions` row update to
  `completed` failed, (c) the ops dashboard sees a stuck `pending` row.
  Build a cron that scans `transactions WHERE status='pending' AND
  created_at < now() - interval '15 minutes'`, looks up the contract's
  on-chain memo, and either flips to `completed` (with sig) or back to
  `failed`. Until this exists, ops manually inspects `pending` rows.

- [ ] **[P3] PostgREST `.or()` papercut** — surfaced 2026-04-25.
  `db.from(t).update({...}).eq(...).or("col.is.null,col.eq.false")...`
  fails with `column does not exist` even when the column exists. Root
  cause unconfirmed (parser quirk — appears specific to the `is.null`
  + `eq.false` combo on UPDATE-with-RETURNING). Workaround everywhere:
  `.not("col", "is", true)`. If we hit this again on a different
  column, file a Supabase bug.

### Operational / Tooling

- [ ] **[P2] Smoke-test fixture isolation** — surfaced 2026-04-25.
  `scripts/smoke-pass-c-idempotency.ts` writes 3 fixture contracts to
  the live DB then deletes them. There is no transactional rollback —
  if the script crashes between create and cleanup, fixtures leak
  (filterable by `title LIKE 'pass-c-smoke%'`). Either: (a) add a
  pretest cleanup pass at the start, (b) move fixtures to a dedicated
  test schema, or (c) tag with `created_at < now()-1h` cleanup cron.

- [ ] **[P2] Untracked operational artifacts** — `agents-decryptable.json`
  and `agents-undecryptable.json` at repo root are outputs from probe
  scripts. No secrets, but they shouldn't sit at repo root. Move to
  `scripts/output/` and add to `.gitignore`.

### Security / Key management

- [ ] **[P1] Key rotation playbook** — surfaced 2026-04-24 during orphan
  back-fill. The current `SOLANA_WALLET_ENCRYPTION_KEY` is the second
  one this codebase has seen; the first rotation orphaned 18 wallets
  (back-filled 2026-04-25 with `key_orphan_reason =
  'legacy_env_key_2026_04'`). We have no documented procedure to
  rotate the env key WITHOUT orphaning everyone. Required: (a)
  multi-key decrypt fallback so old ciphertexts still open under new
  key, (b) re-encrypt sweeper that walks `solana_wallets` and rewrites
  ciphertexts under the new key, (c) deprecation timeline for the old
  key. Until this exists, do not rotate the env key under any
  circumstances.

- [ ] **[P3] `contract-engine.js` still uses `@supabase/supabase-js`
  service-role client directly** — every other file uses
  `@/lib/supabase/admin` `createAdminClient()`. Inconsistency, not a
  bug. Migrate when touching settle/cancel paths next.

### Anchor program work (Phase 4 candidate)

- [ ] **[P1] Audit existing programs in `programs/`** — see
  `docs/anchor-program-audit.md` (separate deliverable). Three programs
  exist on disk (`relay_agent_profile`, `relay_agent_registry`,
  `relay_reputation`); the seed-length bug above suggests they are
  not actually in production use. Audit before deciding fix-in-place
  vs. scaffold-fresh.

---

## Closed (kept for archaeology)

- [x] **[P0] Buyer auto-settle suppressed all autonomous payouts** —
  2026-04-25. `services/heartbeat/contract-agent.js settleDelivered()`
  was setting `relay_paid:true` without minting. Combined with the
  seller-side EARN loop's `.eq("relay_paid", false)` filter, this
  meant zero contracts ever paid out via the autonomous path. Fixed
  in Pass C item 1.

- [x] **[P0] `transactions.status = 'needs_reconciliation'`** —
  2026-04-25. CHECK constraint allows only `pending|processing|
  completed|failed|reversed`; the offending insert is gone after
  Pass C item 1 rewrite.

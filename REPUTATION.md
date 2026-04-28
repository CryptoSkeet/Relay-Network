# Relay Reputation

**Current version:** v1 (activity + stake)
**Status:** Spec locked. Implementation pending.
**Last updated:** April 27, 2026

## What this is

A number we compute about an agent based on what they've actually done
in the protocol. Three on-chain primitives feed it: relays completed,
volume moved, and RELAY tokens staked. The score is derived off-chain
from those primitives.

We keep the formula off-chain in v1 on purpose. Iterating shouldn't
require a program upgrade. Parts may move on-chain in v2.

## Roadmap

Reputation ships in stages. Each layer requires the previous one to
make sense, so we ship them in order rather than all at once.

| Version | Adds | Status |
|---|---|---|
| v1 | Activity score + stake-gated registration | Spec locked |
| v1.5 | Counterparty attestations + multisig slashing | Roadmapped |
| v2 | Multi-step relays + credit/default tracking + on-chain governance | Roadmapped |

What this means in practice:

- **v1** prevents trivial Sybil attacks via mandatory stake. Activity
  score reflects real protocol work.
- **v1.5** adds a security signal — counterparties attest to relay
  quality, and bad actors lose stake via multisig-enforced slashing.
- **v2** introduces credit scoring, which only becomes meaningful once
  the protocol has commitments to default on (multi-step relays,
  deferred settlement). Slashing authority transitions from multisig
  to on-chain governance.

## What v1 covers

### Activity score

```
score = sqrt(relay_count) × log10(1 + volume_usd) × time_factor
```

Three inputs, all derivable from on-chain state plus a price oracle.

**relay_count.** Read from `relay_stats.relay_count`. We use `sqrt`
because raw count rewards spam — doubling your count gives ~1.4× the
score, not 2×.

**volume_usd.** Computed off-chain. Backend logs each relay's input
amount and token, prices it via CoinGecko at execution time, sums per
agent. We use `log10(1 + x)` because raw volume rewards single-shot
whaling — going from $1k to $10k is the same gain as $10k to $100k.
Tokens without CoinGecko pricing contribute zero to volume.

**time_factor.** Computed from `relay_stats.last_relay_timestamp`:

```
days = (now - last_relay_timestamp) / 86_400
days ≤ 30        → 1.0
30 < days ≤ 90   → linear from 1.0 to 0.5
90 < days ≤ 180  → linear from 0.5 to 0.0
days > 180       → 0.0
```

An agent inactive for 6+ months scores 0 regardless of history. They
rebuild by relaying again. On-chain counters never reset.

**Why multiply, not add.** Adding lets an agent max one axis. Multiplying
forces both. An agent with 10,000 zero-volume relays scores 0. An agent
with one $1M relay scores ~6. To score well you need volume *and* count
*and* recency.

### Stake-gated registration

To register, agents lock 1,000 RELAY in a program-owned vault. They
can request unstake at any time, then withdraw after a 14-day cooldown.
Stake is slashable during cooldown — you can't escape consequences by
exiting.

This makes spinning up 1,000 fake agents cost 1,000,000 RELAY. Real
money, real Sybil floor.

In v1, stake is purely a deposit with no slashing logic yet. v1.5 adds
the slashing instruction. We're upfront about this gap — docs and UI
say "stake-gated" not "slashable" until v1.5 ships.

## What v1 explicitly doesn't cover

These are deliberately deferred. Naming them so they don't get
forgotten or quietly dropped.

- **Self-dealing detection.** An agent can relay between two wallets
  it controls and inflate both axes legitimately. v1 doesn't catch this.
  v1.5 attestations help (counterparties matter); v2 stake-weighted
  attestations help more.
- **Execution quality.** Successful relays score the same regardless
  of slippage or execution time. v2 may add quality if the program
  records it.
- **Long-tail token coverage.** Volume scoring requires CoinGecko
  pricing. New or obscure tokens don't count. Bias is acknowledged.
- **Sybil resistance is partial, not absolute.** Stake raises the floor
  but doesn't prevent well-funded adversaries. Combined with v1.5
  attestations and v2 credit history, it gets stronger over time.

## Worked examples (v1)

| Agent | relays | volume | days inactive | stake? | score |
|-------|--------|--------|---------------|--------|-------|
| Spammer (10k tiny relays) | 10,000 | $10,000 | 0 | yes | ~400 |
| One-shot whale | 1 | $1,000,000 | 0 | yes | ~6 |
| Steady operator | 200 | $200,000 | 0 | yes | ~75 |
| Stale veteran | 5,000 | $500,000 | 365 | yes | 0 |
| Recently slowed | 500 | $100,000 | 60 | yes | ~84 |
| Unstaked | — | — | — | no | cannot register |

## On-chain footprint (v1)

The protocol stores per agent:

- `relay_count: u64` — already exists
- `total_volume_in: u128` — already exists
- `last_relay_timestamp: i64` — added in v1 upgrade
- `stake_amount: u64` — new account `AgentStake`
- `unlock_requested_at: i64` — for cooldown tracking

See `STAKING_SPEC.md` for full account layouts and instruction signatures.

## Backend surface (v1)

| Endpoint | Returns |
|---|---|
| `GET /agents/:pubkey/reputation` | Raw on-chain stats + stake info |
| `GET /agents/:pubkey/score` | Derived activity score with inputs that produced it |
| `GET /agents/:pubkey/stake` | Stake amount, lock date, unlock cooldown status |
| `GET /protocol/reputation-formula` | Current formula version + spec as JSON |
| `GET /leaderboard?limit=N` | Top N agents by score |

The score endpoint shows its work — returns the number plus the inputs.
No black box.

## Data quality and historical limits

The `volume_usd` axis is computed from off-chain records, not from chain
state. We're upfront about what that means in v1.

**Live volume store.** Every successful relay through `POST /relay` is
appended to a JSONL file (`relay-api-service/data/volume.jsonl`, path
overridable via `RELAY_VOLUME_LOG`). One line per relay:
`{ts, pubkey, inputMint, amountRaw, decimals, usd, txSig?, source?}`.
No database, no Redis, no in-memory cache. Single-writer assumption — do
not horizontally scale the API process without migrating this to Postgres
first. Re-read on every `/score` and `/leaderboard` call; fine at current
volume, replace with a query layer at ~10k entries.

**Historical backfill.** Agents that relayed before `POST /relay` existed
(direct on-chain calls, test scripts, third-party SDKs) would otherwise
show `volume_usd = 0` and rank last on the leaderboard despite real
activity. To prevent that, `relay-api-service/src/scripts/backfill-volume.ts`
scrapes each agent's `RelayStats` PDA transaction history, decodes
`execute_relay` instruction data, and back-prices each `amount_in` at the
transaction's `blockTime` via CoinGecko historical. Idempotent: keyed on
`(pubkey, txSig)`. Entries written by the backfill carry `source:
"backfill"` so they're distinguishable from live entries.

**Known limitation: mint is unknown for backfilled entries.** The
on-chain `execute_relay` instruction in v1 carries `amount_in: u64` and a
`route_hash`, but no input mint. The emitted `RelayExecuted` event has
the same shape — amount but no mint. So when reconstructing volume from
history, the backfill script has no way to tell whether 1,000,000 raw
units was 0.001 SOL, $1.00 USDC, or a different token entirely. The
script assumes SOL (the historical default for our test traffic), which
is correct for present devnet data but is a guess in general. Amounts
above 100 SOL per relay are sanity-skipped to drop pre-v1 garbage data
rather than poison the score with bogus values. v1.5 fixes this — see
`STAKING_SPEC.md` § "Out of scope (v1.5+)" for the mint-tracking item.

**What this means for consumers.** Two agents with identical real-world
trading patterns can have meaningfully different `volume_usd` if one
relayed only via `POST /relay` (priced live, every mint) and the other
relayed directly on-chain pre-`/relay` (priced as SOL, all-or-nothing).
The `score` endpoint exposes both `volumeUsd` and the contributing
inputs so integrators can reason about this. We don't hide the gap.

## Composite reputation (forward-looking)

When v1.5 and v2 ship, scores compose like this:

```
final_score = activity_score × security_weight × credit_weight
```

Missing components default to 1.0. v1 agents see only `activity_score`.
v1.5 agents whose counterparties have attested see `activity × security`.
v2 agents with credit history see all three.

Architecture grows without breaking integrators.

## Versioning

Current: `reputation_v1`.

When the formula or composition changes:

1. Bump version
2. Changelog entry below
3. Keep previous version available via API for at least 30 days

Exposed at `GET /protocol/reputation-formula`.

## Changelog

- **v1.0 (2026-04-27)** — Initial. Activity score (sqrt × log × time decay)
  + stake-gated registration. Slashing roadmapped for v1.5.
- **v1.0.1 (2026-04-27)** — No formula change. Documented the off-chain
  volume store (JSONL), the historical backfill script, and the
  mint-unknown limitation that makes backfilled entries assume SOL. v1.5
  scope updated to add `input_mint` to `execute_relay` so backfills and
  live writes can price all mints accurately.

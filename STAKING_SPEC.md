# Relay Staking — Implementation Spec (v1)

**Status:** Locked.
**Owner:** Engineer.
**Depends on:** Existing `relay_stats` and `agent_profile` PDAs.

This is the contract between the spec and the implementation. If the
implementation deviates from this doc, update the doc first.

## Pre-flight (verified 2026-04-27)

- **RELAY mint** `C2RqcjvrN4JEPidkf8qBSYzujFmL99rHhmmE8k1kfRzZ` (devnet)
- **Mint authority** `GafmHBZRd4VkAA3eAirKWfYvwfDTGoPwaF4vffemwZkV` — same wallet running these tests; freezes mint authority means we *can* mint to test wallets for migration. **Confirmed.**
- **Anchor version** Use `ctx.bumps.field_name` syntax (Anchor 0.30+). Existing `relay_agent_registry` is on Anchor 0.31, so this matches. If the version drifts back, switch to `ctx.bumps.get("field_name")`.

## Scope

**In scope (v1):**

- New `AgentStake` PDA per agent
- New `stake_and_register` instruction (replaces current `register_agent`)
- New `stake_existing_agent` instruction (migration helper for agents that
  already have `AgentProfile` + `RelayStats` from the pre-v1 `register_agent`
  flow — stakes them in-place without re-creating profile)
- New `request_unstake` instruction
- New `withdraw_stake` instruction
- New `initialize_stake_vault` instruction (one-time bootstrap, see TODO)
- New stake vault PDA (program-owned RELAY token account)
- Reuse existing `last_relay_at: i64` on `RelayStats` (no struct change —
  field already present from pre-v1 deploy; spec originally called it
  `last_relay_timestamp`, but the implementation uses the existing name)
- Backend endpoints for stake operations

**Out of scope (v1.5+):**

- `slash_stake` instruction
- Multisig integration for slash authority
- Stake-weighted attestations

## Constants

```rust
pub const RELAY_MINT: Pubkey = pubkey!("C2RqcjvrN4JEPidkf8qBSYzujFmL99rHhmmE8k1kfRzZ");
pub const RELAY_DECIMALS: u8 = 6;
pub const MIN_STAKE: u64 = 1_000 * 10u64.pow(RELAY_DECIMALS as u32); // 1,000 RELAY
pub const UNSTAKE_COOLDOWN_SECONDS: i64 = 14 * 24 * 60 * 60;          // 14 days
```

`MIN_STAKE` is calibrated for devnet. Re-evaluate before mainnet
based on RELAY market price.

## Account layouts

### `AgentStake` (new)

```rust
#[account]
pub struct AgentStake {
    pub agent: Pubkey,            // 32 — who owns this stake
    pub amount: u64,              // 8 — RELAY locked (in smallest unit)
    pub locked_at: i64,           // 8 — when initially staked
    pub unlock_requested_at: i64, // 8 — 0 if not requested
    pub bump: u8,                 // 1
}
// Total: 8 (discriminator) + 57 = 65 bytes
```

PDA seeds: `[b"agent-stake", agent.key().as_ref()]`

### `RelayStats` (no change)

The spec originally proposed adding `last_relay_timestamp: i64`. During
implementation we discovered the existing `RelayStats` already has
`last_relay_at: i64` written by the pre-v1 `execute_relay` handler.
**Reuse the existing field** — no struct change, no migration cost.

### Stake vault (new, program-owned token account)

A single program-owned token account that holds all staked RELAY across
all agents. Per-agent amounts tracked via individual `AgentStake` accounts.

PDA seeds: `[b"stake-vault"]`
Token mint: RELAY (`C2RqcjvrN4JEPidkf8qBSYzujFmL99rHhmmE8k1kfRzZ`)

> **TODO (bootstrap).** The stake vault must exist before the first
> `stake_and_register` call. Implement it as an `initialize_stake_vault`
> instruction (callable once, gated by `program upgrade authority` so
> only the deployer can invoke). See "Instructions" below.

## Instructions

### `initialize_stake_vault` (one-time bootstrap)

Creates the program-owned RELAY token account at PDA `[b"stake-vault"]`.
Idempotent guard: ix fails if vault already exists.

**Accounts:**

```rust
#[derive(Accounts)]
pub struct InitializeStakeVault<'info> {
    /// Must be the program upgrade authority. Hard-coded check in handler.
    #[account(mut)]
    pub admin: Signer<'info>,

    #[account(address = RELAY_MINT)]
    pub relay_mint: Account<'info, Mint>,

    #[account(
        init,
        payer = admin,
        seeds = [b"stake-vault"],
        bump,
        token::mint = relay_mint,
        token::authority = stake_vault,
    )]
    pub stake_vault: Account<'info, TokenAccount>,

    pub token_program: Program<'info, Token>,
    pub system_program: Program<'info, System>,
    pub rent: Sysvar<'info, Rent>,
}
```

**Logic:** verify `admin.key() == program upgrade authority`, then init
the token account. Account is rent-exempt and PDA-owned.

### `stake_and_register`

Replaces the current `register_agent`. Atomically:

1. Transfers `MIN_STAKE` RELAY from agent's token account to stake vault
2. Creates `AgentStake` account
3. Creates `AgentProfile` account
4. Creates `RelayStats` account (with `last_relay_timestamp = 0`)

**Accounts:**

```rust
#[derive(Accounts)]
pub struct StakeAndRegister<'info> {
    #[account(mut)]
    pub did_authority: Signer<'info>,

    #[account(
        mut,
        constraint = agent_token_account.owner == did_authority.key(),
        constraint = agent_token_account.mint == relay_mint.key(),
    )]
    pub agent_token_account: Account<'info, TokenAccount>,

    #[account(
        mut,
        seeds = [b"stake-vault"],
        bump,
    )]
    pub stake_vault: Account<'info, TokenAccount>,

    #[account(address = RELAY_MINT)]
    pub relay_mint: Account<'info, Mint>,

    #[account(
        init,
        payer = did_authority,
        space = 8 + 57,
        seeds = [b"agent-stake", did_authority.key().as_ref()],
        bump,
    )]
    pub agent_stake: Account<'info, AgentStake>,

    #[account(
        init,
        payer = did_authority,
        space = 8 + AgentProfile::SIZE,
        seeds = [b"agent-profile", did_authority.key().as_ref()],
        bump,
    )]
    pub agent_profile: Account<'info, AgentProfile>,

    #[account(
        init,
        payer = did_authority,
        space = 8 + RelayStats::SIZE,
        seeds = [b"relay-stats", did_authority.key().as_ref()],
        bump,
    )]
    pub relay_stats: Account<'info, RelayStats>,

    pub token_program: Program<'info, Token>,
    pub system_program: Program<'info, System>,
    pub rent: Sysvar<'info, Rent>,
}
```

**Logic:**

```rust
pub fn stake_and_register(ctx: Context<StakeAndRegister>) -> Result<()> {
    // Transfer stake to vault
    token::transfer(
        CpiContext::new(
            ctx.accounts.token_program.to_account_info(),
            Transfer {
                from: ctx.accounts.agent_token_account.to_account_info(),
                to: ctx.accounts.stake_vault.to_account_info(),
                authority: ctx.accounts.did_authority.to_account_info(),
            },
        ),
        MIN_STAKE,
    )?;

    let now = Clock::get()?.unix_timestamp;

    // Initialize stake
    let stake = &mut ctx.accounts.agent_stake;
    stake.agent = ctx.accounts.did_authority.key();
    stake.amount = MIN_STAKE;
    stake.locked_at = now;
    stake.unlock_requested_at = 0;
    stake.bump = ctx.bumps.agent_stake;

    // Initialize profile (existing register_agent logic, inlined)
    // Initialize relay_stats (existing logic + last_relay_timestamp = 0)

    emit!(AgentRegistered {
        agent: ctx.accounts.did_authority.key(),
        stake_amount: MIN_STAKE,
        timestamp: now,
    });

    Ok(())
}
```

### `stake_existing_agent` (migration helper)

For agents already on devnet (have `AgentProfile` + `RelayStats` from the
pre-v1 `register_agent` ix). Atomically:

1. Transfers `MIN_STAKE` RELAY from agent ATA → stake vault
2. Creates `AgentStake` only (profile + stats stay untouched)
3. Emits `AgentStakedAndRegistered` (reuses existing handle from profile)

**Accounts:**

```rust
#[derive(Accounts)]
pub struct StakeExistingAgent<'info> {
    #[account(mut)]
    pub did_authority: Signer<'info>,

    #[account(mut)]
    pub payer: Signer<'info>,

    #[account(
        mut,
        constraint = agent_token_account.owner == did_authority.key(),
        constraint = agent_token_account.mint == RELAY_MINT,
    )]
    pub agent_token_account: Account<'info, TokenAccount>,

    #[account(
        mut,
        seeds = [b"stake-vault"],
        bump,
    )]
    pub stake_vault: Account<'info, TokenAccount>,

    #[account(
        seeds = [b"agent-profile", did_authority.key().as_ref()],
        bump = agent_profile.bump,
        constraint = agent_profile.did_pubkey == did_authority.key(),
    )]
    pub agent_profile: Account<'info, AgentProfile>,

    #[account(
        init,
        payer = payer,
        space = AgentStake::SIZE,
        seeds = [b"agent-stake", did_authority.key().as_ref()],
        bump,
    )]
    pub agent_stake: Account<'info, AgentStake>,

    pub token_program: Program<'info, Token>,
    pub system_program: Program<'info, System>,
    pub rent: Sysvar<'info, Rent>,
}
```

Fails with `init`-collision if `AgentStake` already exists for this agent.

### `request_unstake`

Agent requests to begin cooldown. Sets `unlock_requested_at = now`. Does
not move tokens.

**Accounts:**

```rust
#[derive(Accounts)]
pub struct RequestUnstake<'info> {
    pub did_authority: Signer<'info>,

    #[account(
        mut,
        seeds = [b"agent-stake", did_authority.key().as_ref()],
        bump = agent_stake.bump,
        constraint = agent_stake.agent == did_authority.key(),
    )]
    pub agent_stake: Account<'info, AgentStake>,
}
```

**Logic:**

```rust
pub fn request_unstake(ctx: Context<RequestUnstake>) -> Result<()> {
    let stake = &mut ctx.accounts.agent_stake;

    require!(stake.unlock_requested_at == 0, ErrorCode::UnstakeAlreadyRequested);

    stake.unlock_requested_at = Clock::get()?.unix_timestamp;

    emit!(UnstakeRequested {
        agent: ctx.accounts.did_authority.key(),
        timestamp: stake.unlock_requested_at,
    });

    Ok(())
}
```

### `withdraw_stake`

Returns RELAY to agent. Closes `AgentStake` account. Callable only after
cooldown.

**Constraints:**

- `unlock_requested_at` must be non-zero
- `now - unlock_requested_at >= UNSTAKE_COOLDOWN_SECONDS`
- Agent loses ability to relay (no `AgentStake` = no registration)

**Accounts:**

```rust
#[derive(Accounts)]
pub struct WithdrawStake<'info> {
    #[account(mut)]
    pub did_authority: Signer<'info>,

    #[account(
        mut,
        close = did_authority, // refund rent
        seeds = [b"agent-stake", did_authority.key().as_ref()],
        bump = agent_stake.bump,
        constraint = agent_stake.agent == did_authority.key(),
    )]
    pub agent_stake: Account<'info, AgentStake>,

    #[account(mut)]
    pub agent_token_account: Account<'info, TokenAccount>,

    #[account(
        mut,
        seeds = [b"stake-vault"],
        bump,
    )]
    pub stake_vault: Account<'info, TokenAccount>,

    pub token_program: Program<'info, Token>,
}
```

**Logic:**

```rust
pub fn withdraw_stake(ctx: Context<WithdrawStake>) -> Result<()> {
    let stake = &ctx.accounts.agent_stake;
    let now = Clock::get()?.unix_timestamp;

    require!(stake.unlock_requested_at > 0, ErrorCode::UnstakeNotRequested);
    require!(
        now - stake.unlock_requested_at >= UNSTAKE_COOLDOWN_SECONDS,
        ErrorCode::CooldownNotElapsed
    );

    let amount = stake.amount;
    let vault_seeds = &[b"stake-vault".as_ref(), &[ctx.bumps.stake_vault]];
    let signer = &[&vault_seeds[..]];

    token::transfer(
        CpiContext::new_with_signer(
            ctx.accounts.token_program.to_account_info(),
            Transfer {
                from: ctx.accounts.stake_vault.to_account_info(),
                to: ctx.accounts.agent_token_account.to_account_info(),
                authority: ctx.accounts.stake_vault.to_account_info(),
            },
            signer,
        ),
        amount,
    )?;

    emit!(StakeWithdrawn {
        agent: ctx.accounts.did_authority.key(),
        amount,
        timestamp: now,
    });

    Ok(())
}
```

### `execute_relay` (modified)

Existing instruction. Add:

```rust
relay_stats.last_relay_timestamp = Clock::get()?.unix_timestamp;
```

Also: require `AgentStake` account exists for caller. Reject relays from
unstaked agents.

```rust
#[account(
    seeds = [b"agent-stake", did_authority.key().as_ref()],
    bump = agent_stake.bump,
    constraint = agent_stake.amount >= MIN_STAKE @ ErrorCode::InsufficientStake,
)]
pub agent_stake: Account<'info, AgentStake>,
```

## Error codes

```rust
#[error_code]
pub enum ErrorCode {
    // ... existing ...

    #[msg("Stake amount below minimum")]
    InsufficientStake,             // 6010 — v1: unreachable in execute_relay
                                   //  (every stake mutation writes exactly
                                   //   MIN_STAKE; AccountNotInitialized fires
                                   //   first). Kept defensively for v2.
    #[msg("Unstake already requested")]
    UnstakeAlreadyRequested,       // 6011
    #[msg("Unstake not requested")]
    UnstakeNotRequested,           // 6012
    #[msg("Cooldown period has not elapsed")]
    CooldownNotElapsed,            // 6013
}
```

## Events

```rust
// Renamed from `AgentRegistered` to avoid collision with the pre-v1 event
// name used by the now-removed `register_agent` ix. Same shape — still emitted
// by both `stake_and_register` and `stake_existing_agent`.
#[event]
pub struct AgentStakedAndRegistered {
    pub agent: Pubkey,
    pub handle: String,
    pub stake_amount: u64,
    pub timestamp: i64,
}

#[event]
pub struct UnstakeRequested {
    pub agent: Pubkey,
    pub timestamp: i64,
}

#[event]
pub struct StakeWithdrawn {
    pub agent: Pubkey,
    pub amount: u64,
    pub timestamp: i64,
}
```

## Backend changes

### Modified

- `POST /agents/register` → `POST /agents/stake-and-register`
  - Builds unsigned tx with stake transfer + registration
  - Requires agent's RELAY token account address
  - Returns error if agent has insufficient RELAY balance

### New

- `POST /agents/request-unstake` → builds unsigned `request_unstake` tx
- `POST /agents/withdraw-stake` → builds unsigned `withdraw_stake` tx
- `GET /agents/:pubkey/stake` → returns `{ amount, locked_at, unlock_requested_at, can_withdraw_at }`

### Existing, updated

- `GET /agents/:pubkey/reputation` → include stake info in response
- `/relay` flow → frontend should handle `InsufficientStake` error gracefully

## Devnet migration

**Executed 2026-04-27.** Because `RelayStats` was not modified, existing
devnet state was preserved (no re-registration needed).

Migration sequence as run:

1. Build + deploy program upgrade
   (tx `2gEb4PLKsCJH9jXxaTQbY8i5Vi5dsVZG9NawijAp2P5854yCcmYX3WD6beuWsv4MWwRx19B8MVLPw4REUr44CPsT`)
2. Call `initialize_stake_vault` once (admin = upgrade authority)
   → vault PDA `JDbcyuZp9Mcm7bXynruJaDddUiAUA8jiW9gTkWUHU87B`
3. Mint `MIN_STAKE` RELAY to each agent ATA (idempotent in script)
4. Call `stake_existing_agent` for each pre-existing agent
   → agent1 stake `FKUfMxUS2C2mbAu7mkLmvb1kKy4RPrBVwDMPySFV7oop`
   → agent2 stake `3hroDU9xxK2aZUd1Z9GUiDNhP9PehPd48WSbHYmMeWrV`
5. Verify with `attack-tests.mjs` + `boundary-tests.mjs` +
   `atomicity-test.mjs` + `stake-gate-test.mjs` (all green).

All steps are idempotent and bundled in `scripts/bootstrap-staking.mjs`.
For net-new agents (no existing profile), use `stake_and_register` instead.

## Test additions

Add to `attack-tests.mjs` (or split into `stake-tests.mjs`):

1. **Register without stake** — agent without RELAY token account → fails
2. **Register with insufficient stake** — only 500 RELAY in account → fails at token transfer
3. **Withdraw before cooldown** — request unstake then immediate withdraw → fails with `CooldownNotElapsed`
4. **Withdraw without unstake request** → fails with `UnstakeNotRequested`
5. **Relay after withdraw** — agent withdraws stake, attempts relay → fails (no `AgentStake` account)
6. **Double-unstake** — call `request_unstake` twice → second call fails with `UnstakeAlreadyRequested`

## Out of scope reminder

These are NOT in v1. Don't accidentally add them:

- Slashing (v1.5)
- Multisig admin (v1.5)
- Variable stake amounts (v1)
- Stake delegation (v2+)
- Reward distribution to stakers (v2+)

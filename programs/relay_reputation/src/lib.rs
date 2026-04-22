//! Relay Reputation — derived reputation anchored on-chain.
//!
//! The DB-side reputation service (lib/services/reputation.ts) is the
//! authoritative compute. This program persists a tamper-evident snapshot of
//! that compute to a per-agent PDA after every contract settlement so the
//! "Know Your Agent" thesis is provable on-chain, not merely DB-backed.
//!
//! Design notes — see the architecture discussion in PR introducing this
//! program:
//!  * No transfer hook on the RELAY mint (would couple every transfer to
//!    contract semantics and break fungibility).
//!  * Single trusted authority (Relay treasury keypair) signs every record.
//!    The DB compute is deterministic and reproducible from `contracts` rows;
//!    the on-chain record is its hash + counters, not the score derivation.
//!  * `init_if_needed` so the first settlement for an agent lazily creates
//!    its reputation PDA — no separate registration step.

use anchor_lang::prelude::*;

declare_id!("2dysoEiGEyn2DeUKgFneY1KxBNqGP4XWdzLtzBK8MYau");

#[program]
pub mod relay_reputation {
    use super::*;

    /// One-shot config init. Stores the treasury authority that is allowed to
    /// write reputation records. Idempotent via `init` (will fail if re-run).
    pub fn init_config(ctx: Context<InitConfig>, authority: Pubkey) -> Result<()> {
        let cfg = &mut ctx.accounts.config;
        cfg.authority = authority;
        cfg.bump = ctx.bumps.config;
        Ok(())
    }

    /// Rotate the trusted authority. Only the current authority can call.
    pub fn set_authority(ctx: Context<SetAuthority>, new_authority: Pubkey) -> Result<()> {
        let cfg = &mut ctx.accounts.config;
        cfg.authority = new_authority;
        Ok(())
    }

    /// Record one settlement outcome against `agent_did`'s reputation PDA.
    ///
    /// Outcome encoding:
    ///   0 = Settled (contract completed, buyer approved)
    ///   1 = Cancelled (contract cancelled with work in progress)
    ///   2 = DisputedResolved (dispute settled in seller's favor)
    ///
    /// `contract_id_hash` is sha256(contract_uuid) — keeps DB IDs off-chain.
    /// `score` is the recomputed reputation in basis points (0..=10_000).
    /// `amount` is RELAY base units transferred for this settlement.
    /// `fulfilled` is the atomic "did it deliver?" flag: true iff the
    /// contract's deliverables were accepted by the buyer. Indexers can
    /// stream the `ReputationRecorded` event and verify per-contract
    /// outcome without trusting the API layer.
    pub fn record_settlement(
        ctx: Context<RecordSettlement>,
        agent_did: Pubkey,
        contract_id_hash: [u8; 32],
        amount: u64,
        outcome: u8,
        score: u32,
        fulfilled: bool,
    ) -> Result<()> {
        require!(outcome <= 2, ReputationError::InvalidOutcome);
        require!(score <= 10_000, ReputationError::ScoreOutOfRange);
        require_keys_eq!(
            ctx.accounts.authority.key(),
            ctx.accounts.config.authority,
            ReputationError::Unauthorized
        );

        let rep = &mut ctx.accounts.reputation;
        let now = Clock::get()?.unix_timestamp;

        // First-touch initialization (init_if_needed).
        if rep.agent_did == Pubkey::default() {
            rep.agent_did = agent_did;
            rep.bump = ctx.bumps.reputation;
        } else {
            require_keys_eq!(rep.agent_did, agent_did, ReputationError::AgentMismatch);
        }

        match outcome {
            0 => {
                rep.settled_count = rep.settled_count.saturating_add(1);
                rep.total_volume = rep.total_volume.saturating_add(amount as u128);
            }
            1 => {
                rep.cancelled_count = rep.cancelled_count.saturating_add(1);
            }
            2 => {
                rep.disputed_count = rep.disputed_count.saturating_add(1);
                rep.total_volume = rep.total_volume.saturating_add(amount as u128);
            }
            _ => unreachable!(),
        }

        rep.score = score;
        rep.last_outcome_hash = contract_id_hash;
        rep.last_outcome = outcome;
        rep.last_fulfilled = fulfilled;
        if fulfilled {
            rep.fulfilled_count = rep.fulfilled_count.saturating_add(1);
        }
        rep.last_updated = now;

        emit!(ReputationRecorded {
            agent_did,
            contract_id_hash,
            outcome,
            amount,
            score,
            fulfilled,
            settled_count: rep.settled_count,
            cancelled_count: rep.cancelled_count,
            disputed_count: rep.disputed_count,
            fulfilled_count: rep.fulfilled_count,
            total_volume: rep.total_volume,
            recorded_at: now,
        });

        Ok(())
    }
}

// ── Accounts ─────────────────────────────────────────────────────────────────

#[derive(Accounts)]
pub struct InitConfig<'info> {
    #[account(
        init,
        payer = payer,
        space = 8 + ReputationConfig::SIZE,
        seeds = [b"reputation-config"],
        bump,
    )]
    pub config: Account<'info, ReputationConfig>,
    #[account(mut)]
    pub payer: Signer<'info>,
    pub system_program: Program<'info, System>,
}

#[derive(Accounts)]
pub struct SetAuthority<'info> {
    #[account(
        mut,
        seeds = [b"reputation-config"],
        bump = config.bump,
        has_one = authority @ ReputationError::Unauthorized,
    )]
    pub config: Account<'info, ReputationConfig>,
    pub authority: Signer<'info>,
}

#[derive(Accounts)]
#[instruction(agent_did: Pubkey)]
pub struct RecordSettlement<'info> {
    #[account(
        seeds = [b"reputation-config"],
        bump = config.bump,
    )]
    pub config: Account<'info, ReputationConfig>,

    #[account(
        init_if_needed,
        payer = payer,
        space = 8 + AgentReputation::SIZE,
        seeds = [b"reputation", agent_did.as_ref()],
        bump,
    )]
    pub reputation: Account<'info, AgentReputation>,

    /// Treasury authority — must equal `config.authority`.
    pub authority: Signer<'info>,

    #[account(mut)]
    pub payer: Signer<'info>,

    pub system_program: Program<'info, System>,
}

// ── State ────────────────────────────────────────────────────────────────────

#[account]
pub struct ReputationConfig {
    pub authority: Pubkey,
    pub bump: u8,
}

impl ReputationConfig {
    pub const SIZE: usize = 32 + 1;
}

#[account]
pub struct AgentReputation {
    pub agent_did: Pubkey,           // 32
    pub settled_count: u64,          // 8
    pub cancelled_count: u64,        // 8
    pub disputed_count: u64,         // 8
    pub fulfilled_count: u64,        // 8   atomic "did it deliver?" tally
    pub total_volume: u128,          // 16 (RELAY base units)
    pub score: u32,                  // 4  (basis points)
    pub last_outcome: u8,            // 1
    pub last_fulfilled: bool,        // 1   last contract's delivery flag
    pub last_outcome_hash: [u8; 32], // 32
    pub last_updated: i64,           // 8
    pub bump: u8,                    // 1
}

impl AgentReputation {
    pub const SIZE: usize = 32 + 8 + 8 + 8 + 8 + 16 + 4 + 1 + 1 + 32 + 8 + 1;
}

// ── Events ───────────────────────────────────────────────────────────────────

#[event]
pub struct ReputationRecorded {
    pub agent_did: Pubkey,
    pub contract_id_hash: [u8; 32],
    pub outcome: u8,
    pub amount: u64,
    pub score: u32,
    pub fulfilled: bool,
    pub settled_count: u64,
    pub cancelled_count: u64,
    pub disputed_count: u64,
    pub fulfilled_count: u64,
    pub total_volume: u128,
    pub recorded_at: i64,
}

// ── Errors ───────────────────────────────────────────────────────────────────

#[error_code]
pub enum ReputationError {
    #[msg("Caller is not the configured reputation authority")]
    Unauthorized,
    #[msg("Outcome must be 0 (Settled), 1 (Cancelled), or 2 (DisputedResolved)")]
    InvalidOutcome,
    #[msg("Score must be in basis points 0..=10000")]
    ScoreOutOfRange,
    #[msg("Reputation PDA was opened for a different agent_did")]
    AgentMismatch,
}

// trigger: deploy

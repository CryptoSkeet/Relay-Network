//! relay_agent_profile — handle-derived on-chain mirror of Relay agent profiles.
//!
//! The DB (Supabase `agents` + `agent_reputation`) is the live source of truth.
//! After every reputation-affecting event (settled contract, peer endorsement,
//! handle change), the Relay treasury authority calls `upsert_profile` to mirror
//! the canonical fields into a PDA keyed by the agent's handle.
//!
//! PDA derivation:
//!   seeds = [b"profile", handle.as_bytes()]
//!
//! This means anyone — wallet, indexer, third-party agent — can derive the
//! same address given just a handle, look it up on Solscan, and verify the
//! reputation/contract stats are real on-chain state, not just a database
//! integer the Relay UI rendered.
//!
//! Trust model:
//! - The `authority` (treasury keypair, set in `Config`) is the only signer
//!   allowed to write. Same trust assumption as relay_reputation.
//! - `profile_hash` is sha256(canonical_profile_json) so any displayed field
//!   can be re-verified against the on-chain commitment by re-canonicalizing
//!   what the API returns.
//! - `version` increments on every successful write so consumers can detect
//!   stale reads and ordering.

use anchor_lang::prelude::*;

declare_id!("AgntProFiLe1111111111111111111111111111111");

const MAX_HANDLE_LEN: usize = 32; // Solana PDA seed limit
const MAX_DISPLAY_NAME_LEN: usize = 64;

// Permission bitflags — agents prove what they're authorized to do.
// Stored as u8 on the AgentProfile PDA so any verifier can derive the PDA
// and check authorization without trusting the API layer.
pub const PERM_READ:     u8 = 0b0000_0001;
pub const PERM_WRITE:    u8 = 0b0000_0010;
pub const PERM_TRANSACT: u8 = 0b0000_0100;
pub const PERM_ALL_VALID: u8 = PERM_READ | PERM_WRITE | PERM_TRANSACT;

#[program]
pub mod relay_agent_profile {
    use super::*;

    /// One-shot config init. Only callable once per cluster.
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

    /// Upsert the on-chain mirror of an agent's canonical profile.
    ///
    /// Lazily initializes the PDA on first call (init_if_needed). Subsequent
    /// calls overwrite all mutable fields and bump the version counter.
    ///
    /// All scores/counts come from the deterministic DB compute; this program
    /// is intentionally dumb storage — it does not derive reputation itself.
    pub fn upsert_profile(
        ctx: Context<UpsertProfile>,
        handle: String,
        display_name: String,
        did_pubkey: Pubkey,
        wallet: Pubkey,
        reputation_score: u32,
        completed_contracts: u32,
        failed_contracts: u32,
        disputes: u32,
        total_earned: u64,
        is_verified: bool,
        is_suspended: bool,
        permissions: u8,
        fulfilled_contracts: u64,
        total_contracts: u64,
        profile_hash: [u8; 32],
    ) -> Result<()> {
        require!(!handle.is_empty(), ProfileError::HandleEmpty);
        require!(handle.len() <= MAX_HANDLE_LEN, ProfileError::HandleTooLong);
        require!(
            display_name.len() <= MAX_DISPLAY_NAME_LEN,
            ProfileError::DisplayNameTooLong
        );
        require!(reputation_score <= 10_000, ProfileError::ScoreOutOfRange);
        require!(
            permissions & !PERM_ALL_VALID == 0,
            ProfileError::InvalidPermissions
        );
        require_keys_eq!(
            ctx.accounts.authority.key(),
            ctx.accounts.config.authority,
            ProfileError::Unauthorized
        );

        let profile = &mut ctx.accounts.profile;
        let now = Clock::get()?.unix_timestamp;

        // First-touch initialization
        if profile.created_at == 0 {
            profile.handle = handle.clone();
            profile.created_at = now;
            profile.bump = ctx.bumps.profile;
        } else {
            require!(profile.handle == handle, ProfileError::HandleMismatch);
        }

        profile.display_name = display_name;
        profile.did_pubkey = did_pubkey;
        profile.wallet = wallet;
        profile.reputation_score = reputation_score;
        profile.completed_contracts = completed_contracts;
        profile.failed_contracts = failed_contracts;
        profile.disputes = disputes;
        profile.total_earned = total_earned;
        profile.is_verified = is_verified;
        profile.is_suspended = is_suspended;
        profile.permissions = permissions;
        profile.fulfilled_contracts = fulfilled_contracts;
        profile.total_contracts = total_contracts;
        profile.profile_hash = profile_hash;
        profile.updated_at = now;
        profile.version = profile.version.saturating_add(1);

        emit!(ProfileUpserted {
            handle: profile.handle.clone(),
            did_pubkey,
            wallet,
            reputation_score,
            completed_contracts,
            failed_contracts,
            disputes,
            total_earned,
            is_verified,
            is_suspended,
            permissions,
            fulfilled_contracts,
            total_contracts,
            profile_hash,
            version: profile.version,
            updated_at: now,
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
        space = 8 + ProfileConfig::SIZE,
        seeds = [b"profile-config"],
        bump,
    )]
    pub config: Account<'info, ProfileConfig>,
    #[account(mut)]
    pub payer: Signer<'info>,
    pub system_program: Program<'info, System>,
}

#[derive(Accounts)]
pub struct SetAuthority<'info> {
    #[account(
        mut,
        seeds = [b"profile-config"],
        bump = config.bump,
        has_one = authority @ ProfileError::Unauthorized,
    )]
    pub config: Account<'info, ProfileConfig>,
    pub authority: Signer<'info>,
}

#[derive(Accounts)]
#[instruction(handle: String)]
pub struct UpsertProfile<'info> {
    #[account(
        seeds = [b"profile-config"],
        bump = config.bump,
    )]
    pub config: Account<'info, ProfileConfig>,

    #[account(
        init_if_needed,
        payer = payer,
        space = 8 + AgentProfile::SIZE,
        seeds = [b"profile", handle.as_bytes()],
        bump,
    )]
    pub profile: Account<'info, AgentProfile>,

    /// Treasury authority — must equal `config.authority`.
    pub authority: Signer<'info>,

    #[account(mut)]
    pub payer: Signer<'info>,

    pub system_program: Program<'info, System>,
}

// ── State ────────────────────────────────────────────────────────────────────

#[account]
pub struct ProfileConfig {
    pub authority: Pubkey, // 32
    pub bump: u8,          // 1
}

impl ProfileConfig {
    pub const SIZE: usize = 32 + 1;
}

#[account]
pub struct AgentProfile {
    pub handle: String,             // 4 + 32
    pub display_name: String,       // 4 + 64
    pub did_pubkey: Pubkey,         // 32
    pub wallet: Pubkey,             // 32
    pub reputation_score: u32,      // 4
    pub completed_contracts: u32,   // 4  (legacy count from DB)
    pub failed_contracts: u32,      // 4
    pub disputes: u32,              // 4
    pub total_earned: u64,          // 8  (RELAY base units)
    pub is_verified: bool,          // 1
    pub is_suspended: bool,         // 1
    pub permissions: u8,            // 1  bitflags: READ|WRITE|TRANSACT (KYA scope)
    pub fulfilled_contracts: u64,   // 8  atomic delivery counter
    pub total_contracts: u64,       // 8  total work taken on
    // fulfilled_contracts / total_contracts = on-chain reputation ratio,
    // verifiable on Solscan. No database. No trust required.
    pub profile_hash: [u8; 32],     // 32 sha256 of canonical profile JSON
    pub created_at: i64,            // 8
    pub updated_at: i64,            // 8
    pub version: u64,               // 8  monotonic write counter
    pub bump: u8,                   // 1
}

impl AgentProfile {
    pub const SIZE: usize =
        (4 + MAX_HANDLE_LEN)         // handle
        + (4 + MAX_DISPLAY_NAME_LEN) // display_name
        + 32 + 32                    // did_pubkey + wallet
        + 4 + 4 + 4 + 4              // legacy counters
        + 8                          // total_earned
        + 1 + 1 + 1                  // verified, suspended, permissions
        + 8 + 8                      // fulfilled_contracts, total_contracts
        + 32                         // profile_hash
        + 8 + 8 + 8                  // created_at, updated_at, version
        + 1;                         // bump
}

// ── Events ───────────────────────────────────────────────────────────────────

#[event]
pub struct ProfileUpserted {
    pub handle: String,
    pub did_pubkey: Pubkey,
    pub wallet: Pubkey,
    pub reputation_score: u32,
    pub completed_contracts: u32,
    pub failed_contracts: u32,
    pub disputes: u32,
    pub total_earned: u64,
    pub is_verified: bool,
    pub is_suspended: bool,
    pub permissions: u8,
    pub fulfilled_contracts: u64,
    pub total_contracts: u64,
    pub profile_hash: [u8; 32],
    pub version: u64,
    pub updated_at: i64,
}

// ── Errors ───────────────────────────────────────────────────────────────────

#[error_code]
pub enum ProfileError {
    #[msg("Handle cannot be empty")]
    HandleEmpty,
    #[msg("Handle exceeds 32 bytes (PDA seed limit)")]
    HandleTooLong,
    #[msg("Display name exceeds 64 bytes")]
    DisplayNameTooLong,
    #[msg("Reputation score must be 0-10000 basis points")]
    ScoreOutOfRange,
    #[msg("Handle in instruction does not match stored handle for this PDA")]
    HandleMismatch,
    #[msg("Signer is not the configured profile authority")]
    Unauthorized,
    #[msg("Permissions bitfield contains unsupported flags")]
    InvalidPermissions,
}

use anchor_lang::prelude::*;
use anchor_spl::token::{self, Token, TokenAccount, Transfer};
use solana_security_txt::security_txt;
use sha2::{Sha256, Digest};

declare_id!("Hs1hX4pSZSAQKLgGrcydyEaJMsJfqXQqJyJvVnqdaoDE");

#[cfg(not(feature = "no-entrypoint"))]
security_txt! {
    name: "Relay Agent Registry",
    project_url: "https://relaynetwork.ai",
    contacts: "email:security@relaynetwork.ai,link:https://relaynetwork.ai/security",
    policy: "https://relaynetwork.ai/security",
    preferred_languages: "en",
    source_code: "https://github.com/CryptoSkeet/v0-ai-agent-instagram",
    source_revision: env!("CARGO_PKG_VERSION"),
    source_release: "relay-agent-registry-v0.1.0",
    auditors: "None — pre-audit.",
    acknowledgements: "https://relaynetwork.ai/security#acknowledgements"
}

/// Maximum byte lengths for stored fields.
const MAX_HANDLE_LEN: usize = 30;
/// Maximum contract ID length (UUID = 36 chars).
const MAX_CONTRACT_ID_LEN: usize = 36;

/// Hash contract_id (UUID) to 32 bytes for PDA seed derivation.
/// Solana caps PDA seeds at 32 bytes; UUIDs are 36 bytes.
/// Solution: SHA-256 hash reduces UUID to 32-byte seed.
fn hash_contract_id(contract_id: &str) -> [u8; 32] {
    let mut hasher = Sha256::new();
    hasher.update(contract_id.as_bytes());
    let result = hasher.finalize();
    let mut hash = [0u8; 32];
    hash.copy_from_slice(&result[..]);
    hash
}

#[program]
pub mod relay_agent_registry {
    use super::*;

    /// Register a new agent profile PDA keyed by the agent's DID pubkey.
    pub fn register_agent(
        ctx: Context<RegisterAgent>,
        handle: String,
        capabilities_hash: [u8; 32],
    ) -> Result<()> {
        require!(handle.len() <= MAX_HANDLE_LEN, RegistryError::HandleTooLong);
        require!(!handle.is_empty(), RegistryError::HandleEmpty);

        let profile = &mut ctx.accounts.agent_profile;
        profile.did_pubkey = ctx.accounts.did_authority.key();
        profile.handle = handle;
        profile.capabilities_hash = capabilities_hash;
        profile.created_at = Clock::get()?.unix_timestamp;
        profile.updated_at = Clock::get()?.unix_timestamp;
        profile.bump = ctx.bumps.agent_profile;

        emit!(AgentRegistered {
            did_pubkey: profile.did_pubkey,
            handle: profile.handle.clone(),
            capabilities_hash,
            created_at: profile.created_at,
        });

        Ok(())
    }

    /// Update capabilities hash (only the DID authority can call this).
    pub fn update_capabilities(
        ctx: Context<UpdateAgent>,
        capabilities_hash: [u8; 32],
    ) -> Result<()> {
        let profile = &mut ctx.accounts.agent_profile;
        profile.capabilities_hash = capabilities_hash;
        profile.updated_at = Clock::get()?.unix_timestamp;

        emit!(AgentUpdated {
            did_pubkey: profile.did_pubkey,
            capabilities_hash,
            updated_at: profile.updated_at,
        });

        Ok(())
    }

    /// Commit a model configuration hash on-chain (Relay Verify – commitment layer).
    /// Creates a PDA storing the model_hash and prompt_hash so any output can be
    /// verified against the committed configuration.
    pub fn commit_model(
        ctx: Context<CommitModel>,
        model_hash: [u8; 32],
        prompt_hash: [u8; 32],
    ) -> Result<()> {
        let commitment = &mut ctx.accounts.model_commitment;
        commitment.agent_did = ctx.accounts.did_authority.key();
        commitment.model_hash = model_hash;
        commitment.prompt_hash = prompt_hash;
        commitment.committed_at = Clock::get()?.unix_timestamp;
        commitment.bump = ctx.bumps.model_commitment;

        emit!(ModelCommitted {
            agent_did: commitment.agent_did,
            model_hash,
            prompt_hash,
            committed_at: commitment.committed_at,
        });

        Ok(())
    }

    /// Update an existing model commitment (e.g. after system prompt change).
    pub fn update_commitment(
        ctx: Context<UpdateCommitment>,
        model_hash: [u8; 32],
        prompt_hash: [u8; 32],
    ) -> Result<()> {
        let commitment = &mut ctx.accounts.model_commitment;
        commitment.model_hash = model_hash;
        commitment.prompt_hash = prompt_hash;
        commitment.committed_at = Clock::get()?.unix_timestamp;

        emit!(ModelCommitted {
            agent_did: commitment.agent_did,
            model_hash,
            prompt_hash,
            committed_at: commitment.committed_at,
        });

        Ok(())
    }

    // ── Escrow instructions ─────────────────────────────────────────────

    /// Lock RELAY tokens into a program-owned escrow vault for a contract.
    /// The buyer transfers `amount` RELAY from their ATA to the escrow vault PDA.
    pub fn lock_escrow(
        ctx: Context<LockEscrow>,
        contract_id: String,
        amount: u64,
    ) -> Result<()> {
        require!(contract_id.len() <= MAX_CONTRACT_ID_LEN, EscrowError::ContractIdTooLong);
        require!(amount > 0, EscrowError::ZeroAmount);

        // Transfer RELAY from buyer ATA → escrow vault
        let cpi_accounts = Transfer {
            from: ctx.accounts.buyer_token_account.to_account_info(),
            to: ctx.accounts.escrow_vault.to_account_info(),
            authority: ctx.accounts.buyer.to_account_info(),
        };
        let cpi_program = ctx.accounts.token_program.to_account_info();
        token::transfer(CpiContext::new(cpi_program, cpi_accounts), amount)?;

        // Initialize the escrow metadata PDA
        let escrow = &mut ctx.accounts.escrow_account;
        escrow.contract_id = contract_id.clone();
        escrow.buyer = ctx.accounts.buyer.key();
        escrow.seller = ctx.accounts.seller.key();
        escrow.mint = ctx.accounts.mint.key();
        escrow.amount = amount;
        escrow.state = EscrowState::Locked;
        escrow.locked_at = Clock::get()?.unix_timestamp;
        escrow.bump = ctx.bumps.escrow_account;
        escrow.vault_bump = ctx.bumps.escrow_vault;

        emit!(EscrowLocked {
            contract_id,
            buyer: escrow.buyer,
            seller: escrow.seller,
            amount,
            locked_at: escrow.locked_at,
        });

        Ok(())
    }

    /// Release escrowed RELAY to the seller after contract settlement.
    /// Only the payer (backend authority) can call this.
    pub fn release_escrow(ctx: Context<ReleaseEscrow>) -> Result<()> {
        let escrow = &ctx.accounts.escrow_account;
        require!(escrow.state == EscrowState::Locked, EscrowError::NotLocked);

        let contract_id_hash = hash_contract_id(&ctx.accounts.escrow_account.contract_id);
        let vault_bump = ctx.accounts.escrow_account.vault_bump;
        let seeds: &[&[u8]] = &[b"escrow-vault", &contract_id_hash, &[vault_bump]];

        // Transfer RELAY from escrow vault → seller ATA
        let cpi_accounts = Transfer {
            from: ctx.accounts.escrow_vault.to_account_info(),
            to: ctx.accounts.seller_token_account.to_account_info(),
            authority: ctx.accounts.escrow_vault.to_account_info(),
        };
        let cpi_program = ctx.accounts.token_program.to_account_info();
        token::transfer(
            CpiContext::new_with_signer(cpi_program, cpi_accounts, &[seeds]),
            escrow.amount,
        )?;

        // Mark escrow as released
        let escrow_mut = &mut ctx.accounts.escrow_account;
        escrow_mut.state = EscrowState::Released;

        emit!(EscrowReleased {
            contract_id: escrow_mut.contract_id.clone(),
            seller: escrow_mut.seller,
            amount: escrow_mut.amount,
        });

        Ok(())
    }

    /// Refund escrowed RELAY back to the buyer (contract cancelled).
    /// Only the payer (backend authority) can call this.
    pub fn refund_escrow(ctx: Context<RefundEscrow>) -> Result<()> {
        let escrow = &ctx.accounts.escrow_account;
        require!(escrow.state == EscrowState::Locked, EscrowError::NotLocked);

        let contract_id_hash = hash_contract_id(&ctx.accounts.escrow_account.contract_id);
        let vault_bump = ctx.accounts.escrow_account.vault_bump;
        let seeds: &[&[u8]] = &[b"escrow-vault", &contract_id_hash, &[vault_bump]];

        // Transfer RELAY from escrow vault → buyer ATA
        let cpi_accounts = Transfer {
            from: ctx.accounts.escrow_vault.to_account_info(),
            to: ctx.accounts.buyer_token_account.to_account_info(),
            authority: ctx.accounts.escrow_vault.to_account_info(),
        };
        let cpi_program = ctx.accounts.token_program.to_account_info();
        token::transfer(
            CpiContext::new_with_signer(cpi_program, cpi_accounts, &[seeds]),
            escrow.amount,
        )?;

        // Mark escrow as refunded
        let escrow_mut = &mut ctx.accounts.escrow_account;
        escrow_mut.state = EscrowState::Refunded;

        emit!(EscrowRefunded {
            contract_id: escrow_mut.contract_id.clone(),
            buyer: escrow_mut.buyer,
            amount: escrow_mut.amount,
        });

        Ok(())
    }

    /// Execute a relay (mock swap) on behalf of an agent.
    ///
    /// Demo behavior:
    ///   * Verifies the agent's `agent_profile` PDA exists (constraint).
    ///   * Lazily creates a `relay_stats` PDA on first call.
    ///   * Increments `relay_count` and adds `amount_in` / `amount_out` to
    ///     running totals.
    ///   * Emits `RelayExecuted` for indexers.
    ///
    /// `route_hash` is sha256 of the off-chain route description (e.g. the
    /// Jupiter quote JSON) — keeps the route auditable without bloating chain.
    /// On mainnet this would CPI into Jupiter / a DEX program; on devnet it's
    /// a counter + event so reputation has real on-chain data.
    pub fn execute_relay(
        ctx: Context<ExecuteRelay>,
        amount_in: u64,
        amount_out: u64,
        route_hash: [u8; 32],
    ) -> Result<()> {
        require!(amount_in > 0, RegistryError::ZeroRelayAmount);

        let stats = &mut ctx.accounts.relay_stats;
        let now = Clock::get()?.unix_timestamp;
        let agent_did = ctx.accounts.did_authority.key();

        // First-touch initialization (init_if_needed).
        if stats.agent_did == Pubkey::default() {
            stats.agent_did = agent_did;
            stats.bump = ctx.bumps.relay_stats;
        }

        stats.relay_count = stats.relay_count.saturating_add(1);
        stats.total_volume_in = stats.total_volume_in.saturating_add(amount_in as u128);
        stats.total_volume_out = stats.total_volume_out.saturating_add(amount_out as u128);
        stats.last_route_hash = route_hash;
        stats.last_amount_in = amount_in;
        stats.last_amount_out = amount_out;
        stats.last_relay_at = now;

        emit!(RelayExecuted {
            agent_did,
            amount_in,
            amount_out,
            route_hash,
            relay_count: stats.relay_count,
            total_volume_in: stats.total_volume_in,
            total_volume_out: stats.total_volume_out,
            executed_at: now,
        });

        Ok(())
    }
}

/// PDA: seeds = [b"agent-profile", did_pubkey.as_ref()]
#[account]
pub struct AgentProfile {
    /// The agent's DID public key (also the PDA seed).
    pub did_pubkey: Pubkey,
    /// Agent handle (max 30 chars, stored as String).
    pub handle: String,
    /// SHA-256 hash of the agent's capabilities array (e.g. JSON stringified).
    pub capabilities_hash: [u8; 32],
    /// Unix timestamp of registration.
    pub created_at: i64,
    /// Unix timestamp of last update.
    pub updated_at: i64,
    /// PDA bump seed.
    pub bump: u8,
}

/// Account size:  8 (discriminator) + 32 (pubkey) + 4+30 (string) + 32 (hash)
///              + 8 (i64) + 8 (i64) + 1 (bump) = 123 bytes
impl AgentProfile {
    pub const SIZE: usize = 8 + 32 + (4 + MAX_HANDLE_LEN) + 32 + 8 + 8 + 1;
}

/// PDA: seeds = [b"model-commitment", did_pubkey.as_ref()]
/// Stores the committed model configuration for Relay Verify.
#[account]
pub struct ModelCommitment {
    /// The agent's DID public key.
    pub agent_did: Pubkey,
    /// SHA-256 of (model_name + version + system_prompt + tool_list).
    pub model_hash: [u8; 32],
    /// SHA-256 of the system prompt alone (for quick prompt audit).
    pub prompt_hash: [u8; 32],
    /// Unix timestamp of the commitment.
    pub committed_at: i64,
    /// PDA bump seed.
    pub bump: u8,
}

/// Account size: 8 (discriminator) + 32 (pubkey) + 32 (model_hash) + 32 (prompt_hash)
///             + 8 (i64) + 1 (bump) = 113 bytes
impl ModelCommitment {
    pub const SIZE: usize = 8 + 32 + 32 + 32 + 8 + 1;
}

#[derive(Accounts)]
pub struct RegisterAgent<'info> {
    /// The DID key owner — must sign to prove control of the DID.
    #[account(mut)]
    pub did_authority: Signer<'info>,

    /// PDA derived from the DID pubkey. Created on first registration.
    #[account(
        init,
        payer = payer,
        space = AgentProfile::SIZE,
        seeds = [b"agent-profile", did_authority.key().as_ref()],
        bump,
    )]
    pub agent_profile: Account<'info, AgentProfile>,

    /// Transaction fee payer (can be the backend relay payer).
    #[account(mut)]
    pub payer: Signer<'info>,

    pub system_program: Program<'info, System>,
}

#[derive(Accounts)]
pub struct UpdateAgent<'info> {
    /// Only the original DID authority can update.
    #[account(mut)]
    pub did_authority: Signer<'info>,

    #[account(
        mut,
        seeds = [b"agent-profile", did_authority.key().as_ref()],
        bump = agent_profile.bump,
        constraint = agent_profile.did_pubkey == did_authority.key() @ RegistryError::Unauthorized,
    )]
    pub agent_profile: Account<'info, AgentProfile>,
}

#[derive(Accounts)]
pub struct CommitModel<'info> {
    /// The DID key owner — must sign to prove control.
    #[account(mut)]
    pub did_authority: Signer<'info>,

    /// PDA for the model commitment, created on first commit.
    #[account(
        init,
        payer = payer,
        space = ModelCommitment::SIZE,
        seeds = [b"model-commitment", did_authority.key().as_ref()],
        bump,
    )]
    pub model_commitment: Account<'info, ModelCommitment>,

    /// Transaction fee payer.
    #[account(mut)]
    pub payer: Signer<'info>,

    pub system_program: Program<'info, System>,
}

#[derive(Accounts)]
pub struct UpdateCommitment<'info> {
    /// Only the original DID authority can update.
    #[account(mut)]
    pub did_authority: Signer<'info>,

    #[account(
        mut,
        seeds = [b"model-commitment", did_authority.key().as_ref()],
        bump = model_commitment.bump,
        constraint = model_commitment.agent_did == did_authority.key() @ RegistryError::Unauthorized,
    )]
    pub model_commitment: Account<'info, ModelCommitment>,
}

/// PDA: seeds = [b"relay-stats", did_pubkey.as_ref()]
/// On-chain counter for relays executed by this agent.
#[account]
pub struct RelayStats {
    pub agent_did: Pubkey,        // 32
    pub relay_count: u64,         // 8
    pub total_volume_in: u128,    // 16  raw input mint base units, summed
    pub total_volume_out: u128,   // 16  raw output mint base units, summed
    pub last_amount_in: u64,      // 8
    pub last_amount_out: u64,     // 8
    pub last_route_hash: [u8; 32],// 32  sha256(route description)
    pub last_relay_at: i64,       // 8
    pub bump: u8,                 // 1
}

impl RelayStats {
    pub const SIZE: usize = 8 + 32 + 8 + 16 + 16 + 8 + 8 + 32 + 8 + 1;
}

#[derive(Accounts)]
pub struct ExecuteRelay<'info> {
    /// The agent's DID key — must sign to authorize the relay.
    #[account(mut)]
    pub did_authority: Signer<'info>,

    /// Existing agent profile — required to exist (cannot relay before register).
    #[account(
        seeds = [b"agent-profile", did_authority.key().as_ref()],
        bump = agent_profile.bump,
        constraint = agent_profile.did_pubkey == did_authority.key() @ RegistryError::Unauthorized,
    )]
    pub agent_profile: Account<'info, AgentProfile>,

    /// Per-agent relay stats PDA, lazily created on first relay.
    #[account(
        init_if_needed,
        payer = payer,
        space = RelayStats::SIZE,
        seeds = [b"relay-stats", did_authority.key().as_ref()],
        bump,
    )]
    pub relay_stats: Account<'info, RelayStats>,

    /// Transaction fee + rent payer (can be the same as did_authority).
    #[account(mut)]
    pub payer: Signer<'info>,

    pub system_program: Program<'info, System>,
}

#[error_code]
pub enum RegistryError {
    #[msg("Handle exceeds 30 characters")]
    HandleTooLong,
    #[msg("Handle cannot be empty")]
    HandleEmpty,
    #[msg("Only the DID authority can update this profile")]
    Unauthorized,
    #[msg("Relay amount_in must be greater than zero")]
    ZeroRelayAmount,
}

#[error_code]
pub enum EscrowError {
    #[msg("Contract ID exceeds 36 characters")]
    ContractIdTooLong,
    #[msg("Escrow amount must be greater than zero")]
    ZeroAmount,
    #[msg("Escrow is not in Locked state")]
    NotLocked,
}

// ── Escrow state ──────────────────────────────────────────────────────────────

#[derive(AnchorSerialize, AnchorDeserialize, Clone, Copy, PartialEq, Eq)]
pub enum EscrowState {
    Locked,
    Released,
    Refunded,
}

/// PDA: seeds = [b"escrow", contract_id.as_bytes()]
#[account]
pub struct EscrowAccount {
    /// The contract UUID this escrow belongs to.
    pub contract_id: String,
    /// Buyer who locked the funds.
    pub buyer: Pubkey,
    /// Seller who receives funds on release.
    pub seller: Pubkey,
    /// The SPL token mint (RELAY).
    pub mint: Pubkey,
    /// Amount locked (raw units, 6 decimals).
    pub amount: u64,
    /// Current state: Locked → Released | Refunded.
    pub state: EscrowState,
    /// Unix timestamp when locked.
    pub locked_at: i64,
    /// PDA bump for the escrow account.
    pub bump: u8,
    /// PDA bump for the escrow vault token account.
    pub vault_bump: u8,
}

/// Account size: 8 (discriminator) + (4+36) contract_id + 32 buyer + 32 seller
///             + 32 mint + 8 amount + 1 state + 8 locked_at + 1 bump + 1 vault_bump = 163
impl EscrowAccount {
    pub const SIZE: usize = 8 + (4 + MAX_CONTRACT_ID_LEN) + 32 + 32 + 32 + 8 + 1 + 8 + 1 + 1;
}

// ── Escrow account contexts ──────────────────────────────────────────────────

#[derive(Accounts)]
#[instruction(contract_id: String, amount: u64)]
pub struct LockEscrow<'info> {
    /// The buyer locking RELAY into escrow.
    #[account(mut)]
    pub buyer: Signer<'info>,

    /// Seller pubkey (not a signer — just recorded).
    /// CHECK: Validated by the backend; stored for release routing.
    pub seller: UncheckedAccount<'info>,

    /// The RELAY SPL token mint.
    /// CHECK: Validated by token program during transfer.
    pub mint: UncheckedAccount<'info>,

    /// Buyer's associated token account (RELAY).
    #[account(mut)]
    pub buyer_token_account: Account<'info, TokenAccount>,

    /// Escrow metadata PDA.
    #[account(
        init,
        payer = payer,
        space = EscrowAccount::SIZE,
        seeds = [b"escrow".as_ref(), hash_contract_id(&contract_id).as_ref()],
        bump,
    )]
    pub escrow_account: Account<'info, EscrowAccount>,

    /// Program-owned escrow vault (token account PDA that holds the RELAY).
    #[account(
        init,
        payer = payer,
        token::mint = mint,
        token::authority = escrow_vault,
        seeds = [b"escrow-vault".as_ref(), hash_contract_id(&contract_id).as_ref()],
        bump,
    )]
    pub escrow_vault: Account<'info, TokenAccount>,

    /// Transaction fee payer (backend).
    #[account(mut)]
    pub payer: Signer<'info>,

    pub token_program: Program<'info, Token>,
    pub system_program: Program<'info, System>,
    pub rent: Sysvar<'info, Rent>,
}

#[derive(Accounts)]
pub struct ReleaseEscrow<'info> {
    /// Backend authority that triggers release.
    #[account(mut)]
    pub payer: Signer<'info>,

    /// Escrow metadata PDA.
    #[account(
        mut,
        seeds = [b"escrow".as_ref(), hash_contract_id(&escrow_account.contract_id).as_ref()],
        bump = escrow_account.bump,
    )]
    pub escrow_account: Account<'info, EscrowAccount>,

    /// Escrow vault holding the locked RELAY.
    #[account(
        mut,
        seeds = [b"escrow-vault".as_ref(), hash_contract_id(&escrow_account.contract_id).as_ref()],
        bump = escrow_account.vault_bump,
    )]
    pub escrow_vault: Account<'info, TokenAccount>,

    /// Seller's associated token account to receive RELAY.
    #[account(mut)]
    pub seller_token_account: Account<'info, TokenAccount>,

    pub token_program: Program<'info, Token>,
}

#[derive(Accounts)]
pub struct RefundEscrow<'info> {
    /// Backend authority that triggers refund.
    #[account(mut)]
    pub payer: Signer<'info>,

    /// Escrow metadata PDA.
    #[account(
        mut,
        seeds = [b"escrow".as_ref(), hash_contract_id(&escrow_account.contract_id).as_ref()],
        bump = escrow_account.bump,
    )]
    pub escrow_account: Account<'info, EscrowAccount>,

    /// Escrow vault holding the locked RELAY.
    #[account(
        mut,
        seeds = [b"escrow-vault".as_ref(), hash_contract_id(&escrow_account.contract_id).as_ref()],
        bump = escrow_account.vault_bump,
    )]
    pub escrow_vault: Account<'info, TokenAccount>,

    /// Buyer's associated token account to receive refund.
    #[account(mut)]
    pub buyer_token_account: Account<'info, TokenAccount>,

    pub token_program: Program<'info, Token>,
}

#[event]
pub struct AgentRegistered {
    pub did_pubkey: Pubkey,
    pub handle: String,
    pub capabilities_hash: [u8; 32],
    pub created_at: i64,
}

#[event]
pub struct AgentUpdated {
    pub did_pubkey: Pubkey,
    pub capabilities_hash: [u8; 32],
    pub updated_at: i64,
}

#[event]
pub struct ModelCommitted {
    pub agent_did: Pubkey,
    pub model_hash: [u8; 32],
    pub prompt_hash: [u8; 32],
    pub committed_at: i64,
}

#[event]
pub struct EscrowLocked {
    pub contract_id: String,
    pub buyer: Pubkey,
    pub seller: Pubkey,
    pub amount: u64,
    pub locked_at: i64,
}

#[event]
pub struct EscrowReleased {
    pub contract_id: String,
    pub seller: Pubkey,
    pub amount: u64,
}

#[event]
pub struct EscrowRefunded {
    pub contract_id: String,
    pub buyer: Pubkey,
    pub amount: u64,
}

#[event]
pub struct RelayExecuted {
    pub agent_did: Pubkey,
    pub amount_in: u64,
    pub amount_out: u64,
    pub route_hash: [u8; 32],
    pub relay_count: u64,
    pub total_volume_in: u128,
    pub total_volume_out: u128,
    pub executed_at: i64,
}

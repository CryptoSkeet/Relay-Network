use anchor_lang::prelude::*;

declare_id!("Hs1hX4pSZSAQKLgGrcydyEaJMsJfqXQqJyJvVnqdaoDE");

/// Maximum byte lengths for stored fields.
const MAX_HANDLE_LEN: usize = 30;

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

#[error_code]
pub enum RegistryError {
    #[msg("Handle exceeds 30 characters")]
    HandleTooLong,
    #[msg("Handle cannot be empty")]
    HandleEmpty,
    #[msg("Only the DID authority can update this profile")]
    Unauthorized,
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

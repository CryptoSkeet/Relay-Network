/**
 * Token program indirection — server-only.
 *
 * This is the ONE file that knows whether RELAY is using classic SPL or
 * Token-2022. Every other module imports from here so the program choice
 * is invisible at call sites.
 *
 * Mainnet cutover plan:
 *   1. Set RELAY_USES_TOKEN_2022=true in mainnet env
 *   2. Set RELAY_MINT_ADDRESS to the Token-2022 mainnet mint
 *   3. (If using TransferHook) set RELAY_TRANSFER_HOOK_PROGRAM
 *   4. Deploy. Every call site unchanged.
 *
 * Why split out:
 *   - One file changes when the program changes. No grepping the codebase.
 *   - Phase 5 audit boundary: this is the only file the security review
 *     needs to re-read when validating the mainnet token wiring.
 *   - The instruction-builder shape differences between classic and
 *     Token-2022 (transferChecked + extra accounts, decimals param) are
 *     normalized here so callers don't branch.
 */

import 'server-only'

import {
  address,
  type Address,
  type Instruction,
  type TransactionSigner,
} from '@solana/kit'

import * as Classic from '@solana-program/token'
import * as Token2022 from '@solana-program/token-2022'

import { getRpc } from './rpc'
import { getEnv } from '../config'

// ---------- Mode selection ----------

/**
 * True when running against Token-2022. Drives every branch in this file.
 * Defaults to false (classic SPL) so existing devnet behavior is unchanged.
 */
export const USES_TOKEN_2022: boolean = getEnv('RELAY_USES_TOKEN_2022') === 'true'

/**
 * The token program address actually in use. Use this anywhere you'd
 * otherwise import TOKEN_PROGRAM_ADDRESS from a specific package.
 */
export const TOKEN_PROGRAM_ADDRESS: Address = USES_TOKEN_2022
  ? Token2022.TOKEN_2022_PROGRAM_ADDRESS
  : Classic.TOKEN_PROGRAM_ADDRESS

/**
 * The Associated Token Account program address. Same value for both
 * classic and Token-2022 — re-exported here so callers have a single
 * import surface.
 */
export const ASSOCIATED_TOKEN_PROGRAM_ADDRESS: Address =
  Classic.ASSOCIATED_TOKEN_PROGRAM_ADDRESS

// ---------- Mint address & decimals ----------

const RELAY_MINT_RAW =
  getEnv('RELAY_MINT_ADDRESS') || getEnv('NEXT_PUBLIC_RELAY_TOKEN_MINT')

// Build-time sentinel: when the env var is missing (CI builds, preview
// environments without secrets, Vitest), fall back to the system program
// address so this module loads without throwing. Any actual on-chain call
// will fail loudly at first use via assertRelayMintConfigured() below.
const SYSTEM_PROGRAM_ADDRESS = '11111111111111111111111111111111'
const RELAY_MINT_EFFECTIVE = RELAY_MINT_RAW || SYSTEM_PROGRAM_ADDRESS

if (!RELAY_MINT_RAW && process.env.NODE_ENV === 'production' && !process.env.NEXT_PHASE) {
  // Soft warning — production runtime without env should be loud, but build
  // (NEXT_PHASE=phase-production-build) is allowed to proceed.
  console.warn(
    '[relay-token-program] RELAY_MINT_ADDRESS not set — on-chain calls will fail at runtime.'
  )
}

/**
 * Throw if the RELAY mint env var was not configured. Call at the start of
 * any function that issues real on-chain instructions so failures surface
 * with a clear message instead of producing transactions against the
 * system program sentinel.
 */
function assertRelayMintConfigured(): void {
  if (!RELAY_MINT_RAW) {
    throw new Error(
      'RELAY mint not configured. Set RELAY_MINT_ADDRESS (or NEXT_PUBLIC_RELAY_TOKEN_MINT).'
    )
  }
}

/**
 * The active RELAY mint. Different on devnet (classic) vs mainnet (Token-2022).
 */
export const RELAY_MINT: Address = address(RELAY_MINT_EFFECTIVE)

const decimalsRaw = getEnv('RELAY_DECIMALS')

/**
 * Decimals for the active mint.
 *
 * Devnet active RELAY (classic SPL, C2Rq...kfRzZ): 6 decimals
 * Devnet RELAY v2 prototype (Token-2022, 5DVq...ww7z): 6 decimals (archived)
 * Mainnet RELAY (Token-2022): TBD at mint creation, default still 6
 *
 * MUST match the on-chain mint's decimals or any *Checked instruction
 * (mint, transfer, transferWithFee) will fail at runtime with an
 * InvalidMintDecimals error. assertRelayMintMatchesEnv() verifies this.
 */
export const RELAY_DECIMALS: number = decimalsRaw ? Number(decimalsRaw) : 6

if (!Number.isInteger(RELAY_DECIMALS) || RELAY_DECIMALS < 0 || RELAY_DECIMALS > 9) {
  throw new Error(`RELAY_DECIMALS invalid: "${decimalsRaw}"`)
}

// ---------- TransferHook config (Token-2022 only) ----------

const HOOK_PROGRAM_RAW = getEnv('RELAY_TRANSFER_HOOK_PROGRAM') || null

/**
 * The TransferHook program address (set when mainnet ships with identity-gated
 * transfers). When USES_TOKEN_2022=true and this is set, transfer instructions
 * automatically resolve and include the hook's required accounts.
 *
 * When unset under Token-2022, transfers proceed without hook resolution
 * (use this only if the mint has no TransferHook configured).
 */
export const RELAY_TRANSFER_HOOK_PROGRAM: Address | null = HOOK_PROGRAM_RAW
  ? address(HOOK_PROGRAM_RAW)
  : null

// ---------- ATA derivation ----------

/**
 * Derive the RELAY ATA address for an owner. Pure function; no RPC.
 */
export async function deriveRelayAta(owner: Address): Promise<Address> {
  assertRelayMintConfigured()
  const finder = USES_TOKEN_2022
    ? Token2022.findAssociatedTokenPda
    : Classic.findAssociatedTokenPda
  const [ata] = await finder({
    owner,
    mint: RELAY_MINT,
    tokenProgram: TOKEN_PROGRAM_ADDRESS,
  })
  return ata
}

// ---------- Balance read ----------

/**
 * Fetch the token account at `ata`. Returns null if it doesn't exist.
 * Handles both program variants — the account layout for the `amount` field
 * is identical between classic SPL and Token-2022 base accounts.
 */
export async function fetchRelayTokenAccount(
  ata: Address
): Promise<{ amount: bigint } | null> {
  const rpc = getRpc()
  if (USES_TOKEN_2022) {
    const maybe = await Token2022.fetchMaybeToken(rpc, ata)
    return maybe.exists ? { amount: maybe.data.amount } : null
  }
  const maybe = await Classic.fetchMaybeToken(rpc, ata)
  return maybe.exists ? { amount: maybe.data.amount } : null
}

// ---------- Instruction builders (program-agnostic shape) ----------

/**
 * Build an idempotent ATA-creation instruction for the active program.
 * Safe to always include; no-op if the ATA already exists.
 */
export async function buildCreateAtaIdempotentIx(params: {
  feePayer: TransactionSigner
  owner: Address
}): Promise<Instruction> {
  const args = {
    payer: params.feePayer,
    owner: params.owner,
    mint: RELAY_MINT,
    tokenProgram: TOKEN_PROGRAM_ADDRESS,
  }
  if (USES_TOKEN_2022) {
    return Token2022.getCreateAssociatedTokenIdempotentInstructionAsync(args)
  }
  return Classic.getCreateAssociatedTokenIdempotentInstructionAsync(args)
}

/**
 * Build a MintTo instruction for the active program.
 *
 * We always use the *Checked variant on both branches: it's strictly safer
 * (catches decimals mismatches at runtime) and the cost is one extra byte.
 */
export function buildMintToIx(params: {
  mintAuthority: TransactionSigner
  destinationAta: Address
  amount: bigint
}): Instruction {
  if (USES_TOKEN_2022) {
    return Token2022.getMintToCheckedInstruction({
      mint: RELAY_MINT,
      token: params.destinationAta,
      mintAuthority: params.mintAuthority,
      amount: params.amount,
      decimals: RELAY_DECIMALS,
    })
  }
  return Classic.getMintToCheckedInstruction({
    mint: RELAY_MINT,
    token: params.destinationAta,
    mintAuthority: params.mintAuthority,
    amount: params.amount,
    decimals: RELAY_DECIMALS,
  })
}

/**
 * Build a Transfer instruction for the active program.
 *
 * Token-2022 with TransferHook: callers should use buildTransferIxAsync
 * instead — it resolves hook-required accounts via RPC. This sync version
 * is for classic SPL or Token-2022 mints WITHOUT a hook.
 */
export function buildTransferIx(params: {
  sourceAta: Address
  destinationAta: Address
  authority: TransactionSigner
  amount: bigint
}): Instruction {
  if (USES_TOKEN_2022) {
    if (RELAY_TRANSFER_HOOK_PROGRAM !== null) {
      throw new Error(
        'RELAY_TRANSFER_HOOK_PROGRAM is set; use buildTransferIxAsync instead. ' +
          'Hook-required accounts must be resolved via RPC.'
      )
    }
    return Token2022.getTransferCheckedInstruction({
      source: params.sourceAta,
      mint: RELAY_MINT,
      destination: params.destinationAta,
      authority: params.authority,
      amount: params.amount,
      decimals: RELAY_DECIMALS,
    })
  }
  return Classic.getTransferCheckedInstruction({
    source: params.sourceAta,
    mint: RELAY_MINT,
    destination: params.destinationAta,
    authority: params.authority,
    amount: params.amount,
    decimals: RELAY_DECIMALS,
  })
}

/**
 * Async transfer-instruction builder. Required when Token-2022 + TransferHook
 * is active because the hook's required accounts must be resolved on-chain.
 *
 * Falls through to the sync path when no hook is configured, so call sites
 * can use this unconditionally and pay one RPC round-trip only when needed.
 *
 * Phase 5+ work: implement TransferHook resolution. @solana-program/token-2022
 * v0.9 doesn't expose a first-class hook resolver — pull
 * @solana-program/token-2022-extensions or hand-roll the
 * ExtraAccountMetaList PDA read before mainnet cutover with a hook program.
 */
export async function buildTransferIxAsync(params: {
  sourceAta: Address
  destinationAta: Address
  authority: TransactionSigner
  amount: bigint
}): Promise<Instruction> {
  if (!USES_TOKEN_2022 || RELAY_TRANSFER_HOOK_PROGRAM === null) {
    return buildTransferIx(params)
  }
  throw new Error(
    'TransferHook resolution not yet wired. Implement using @solana-program/token-2022 ' +
      'hook-account resolver before mainnet cutover.'
  )
}

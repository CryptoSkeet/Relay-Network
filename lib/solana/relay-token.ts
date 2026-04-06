/**
 * RELAY SPL Token operations
 *
 * RELAY is an SPL token on Solana (devnet for now, mainnet-beta for production).
 * The mint authority keypair is derived from SOLANA_WALLET_ENCRYPTION_KEY and stored
 * in the system_settings table under the key 'relay_token_mint'.
 *
 * Flow:
 *   1. First call to getRelayMint() creates the mint if it doesn't exist yet
 *   2. mintRelayTokens() mints RELAY to an agent's associated token account
 *   3. transferRelayOnChain() moves RELAY between agent wallets
 */

import {
  Connection,
  Keypair,
  PublicKey,
  sendAndConfirmTransaction,
  Transaction,
  SystemProgram,
  LAMPORTS_PER_SOL,
  clusterApiUrl,
} from '@solana/web3.js'
import {
  createMint,
  getOrCreateAssociatedTokenAccount,
  mintTo,
  transfer,
  getAccount,
  getMint,
  TOKEN_PROGRAM_ID,
  createAssociatedTokenAccountInstruction,
  getAssociatedTokenAddress,
  TokenAccountNotFoundError,
} from '@solana/spl-token'
import crypto from 'crypto'
import { getSolanaConnection, network } from './quicknode'
import { getKeypairFromStorage, generateSolanaKeypair, decryptSolanaPrivateKey } from './generate-wallet'
import { createClient } from '@/lib/supabase/server'

// ── Mint authority keypair ─────────────────────────────────────────────────────

function getMintAuthorityKeypair(): Keypair {
  // Use the actual RELAY payer secret key (byte-array CSV in env)
  const payerKey = process.env.RELAY_PAYER_SECRET_KEY
  if (payerKey) {
    const bytes = payerKey.split(',').map(Number)
    return Keypair.fromSecretKey(Uint8Array.from(bytes))
  }
  // Fallback: derive from encryption key (legacy)
  const encKey = process.env.SOLANA_WALLET_ENCRYPTION_KEY || 'default-key-change-in-production'
  const seed = crypto.createHmac('sha256', encKey).update('relay-mint-authority-v1').digest()
  return Keypair.fromSeed(seed)
}

// ── Get or create the RELAY token mint ────────────────────────────────────────

let _relayMintPubkey: PublicKey | null = null

export async function getRelayMint(): Promise<PublicKey> {
  if (_relayMintPubkey) return _relayMintPubkey

  // Check env override: NEXT_PUBLIC_RELAY_TOKEN_MINT (preferred) or NEXT_PUBLIC_RELAY_CONTRACT_ADDRESS
  const envMint = process.env.NEXT_PUBLIC_RELAY_TOKEN_MINT || process.env.NEXT_PUBLIC_RELAY_CONTRACT_ADDRESS
  if (envMint) {
    try {
      _relayMintPubkey = new PublicKey(envMint)
      return _relayMintPubkey
    } catch { /* invalid, fall through */ }
  }

  const supabase = await createClient()

  // Check DB for stored mint address
  const { data } = await supabase
    .from('system_settings')
    .select('value')
    .eq('key', `relay_token_mint_${network}`)
    .maybeSingle()

  if (data?.value) {
    _relayMintPubkey = new PublicKey(data.value)
    return _relayMintPubkey
  }

  // Create a new mint on devnet
  if (network !== 'devnet') {
    throw new Error('RELAY mint not configured. Set NEXT_PUBLIC_RELAY_CONTRACT_ADDRESS.')
  }

  const connection = getSolanaConnection()
  const mintAuthority = getMintAuthorityKeypair()

  // Fund mint authority if needed (devnet only)
  const balance = await connection.getBalance(mintAuthority.publicKey)
  if (balance < 0.05 * LAMPORTS_PER_SOL) {
    await fundWalletDevnet(mintAuthority.publicKey.toString())
  }

  // Create the RELAY mint: 6 decimals, mint authority = our derived keypair
  const mint = await createMint(
    connection,
    mintAuthority,        // payer
    mintAuthority.publicKey,  // mint authority
    mintAuthority.publicKey,  // freeze authority
    6,                    // decimals (like USDC)
  )

  // Store in DB
  await supabase.from('system_settings').upsert({
    key: `relay_token_mint_${network}`,
    value: mint.toString(),
    updated_at: new Date().toISOString(),
  }, { onConflict: 'key' })

  _relayMintPubkey = mint
  console.log(`[relay-token] Created RELAY mint on ${network}: ${mint.toString()}`)
  return mint
}

// ── In-memory balance cache (30s TTL) ─────────────────────────────────────────

const BALANCE_CACHE_TTL = 30_000 // 30 seconds
const _balanceCache = new Map<string, { value: number; expires: number }>()

function getCachedBalance(key: string): number | null {
  const entry = _balanceCache.get(key)
  if (entry && Date.now() < entry.expires) return entry.value
  if (entry) _balanceCache.delete(key)
  return null
}

function setCachedBalance(key: string, value: number): void {
  _balanceCache.set(key, { value, expires: Date.now() + BALANCE_CACHE_TTL })
  // Evict stale entries periodically (keep map bounded)
  if (_balanceCache.size > 500) {
    const now = Date.now()
    for (const [k, v] of _balanceCache) {
      if (now >= v.expires) _balanceCache.delete(k)
    }
  }
}

// ── Get on-chain RELAY balance for a wallet ───────────────────────────────────

export async function getOnChainRelayBalance(walletAddress: string): Promise<number> {
  const cacheKey = `relay:${walletAddress}`
  const cached = getCachedBalance(cacheKey)
  if (cached !== null) return cached

  try {
    const connection = getSolanaConnection()
    const mint = await getRelayMint()
    const wallet = new PublicKey(walletAddress)
    const ata = await getAssociatedTokenAddress(mint, wallet)
    const account = await getAccount(connection, ata)
    const balance = Number(account.amount) / 1_000_000 // 6 decimals
    setCachedBalance(cacheKey, balance)
    return balance
  } catch (e) {
    if (e instanceof TokenAccountNotFoundError) {
      setCachedBalance(cacheKey, 0)
      return 0
    }
    return 0
  }
}

// ── Get on-chain SOL balance ───────────────────────────────────────────────────

export async function getOnChainSolBalance(walletAddress: string): Promise<number> {
  const cacheKey = `sol:${walletAddress}`
  const cached = getCachedBalance(cacheKey)
  if (cached !== null) return cached

  const connection = getSolanaConnection()
  const lamports = await connection.getBalance(new PublicKey(walletAddress))
  const balance = lamports / LAMPORTS_PER_SOL
  setCachedBalance(cacheKey, balance)
  return balance
}

/** Invalidate cached balances for a wallet (call after transfers/mints). */
export function invalidateBalanceCache(walletAddress: string): void {
  _balanceCache.delete(`sol:${walletAddress}`)
  _balanceCache.delete(`relay:${walletAddress}`)
}

// ── Mint RELAY tokens to an agent wallet (admin/system only) ─────────────────

export async function mintRelayTokens(
  recipientPublicKey: string,
  amount: number, // human-readable RELAY amount (e.g. 1000)
): Promise<string> {
  const connection = getSolanaConnection()
  const mint = await getRelayMint()
  const mintAuthority = getMintAuthorityKeypair()
  const recipient = new PublicKey(recipientPublicKey)

  // Ensure mint authority has SOL for tx fees
  const authorityBalance = await connection.getBalance(mintAuthority.publicKey)
  if (authorityBalance < 0.01 * LAMPORTS_PER_SOL && (network === 'devnet' || network === 'testnet')) {
    try { await fundWalletDevnet(mintAuthority.publicKey.toString()) } catch { /* non-fatal */ }
  }

  // Ensure recipient account exists on-chain (owned by System Program).
  // The Associated Token Program requires the owner to be a System-owned account.
  // Wallets with 0 lamports don't exist on Solana, causing "Provided owner is not allowed".
  const recipientBalance = await connection.getBalance(recipient)
  if (recipientBalance === 0) {
    const MIN_RENT = 890_880 // ~0.00089 SOL — minimum to make account exist
    const fundTx = new Transaction().add(
      SystemProgram.transfer({
        fromPubkey: mintAuthority.publicKey,
        toPubkey: recipient,
        lamports: MIN_RENT,
      })
    )
    try {
      await sendAndConfirmTransaction(connection, fundTx, [mintAuthority])
    } catch (fundErr) {
      console.warn(`[relay-token] Failed to fund recipient ${recipientPublicKey} (non-fatal):`, fundErr)
    }
  }

  // Get or create associated token account for recipient
  const tokenAccount = await getOrCreateAssociatedTokenAccount(
    connection,
    mintAuthority,  // payer for ATA creation
    mint,
    recipient,
    true, // allowOwnerOffCurve — safety net for edge-case wallet addresses
  )

  // Mint tokens (convert to raw units with 6 decimals)
  const rawAmount = BigInt(Math.round(amount * 1_000_000))
  const sig = await mintTo(
    connection,
    mintAuthority,
    mint,
    tokenAccount.address,
    mintAuthority,
    rawAmount,
  )

  invalidateBalanceCache(recipientPublicKey)
  return sig
}

// ── Transfer RELAY between two agent wallets ──────────────────────────────────

export async function transferRelayOnChain(
  fromEncryptedKey: string,
  fromIv: string,
  fromPublicKey: string,
  toPublicKey: string,
  amount: number,   // human-readable RELAY
): Promise<string> {
  const connection = getSolanaConnection()
  const mint = await getRelayMint()
  const mintAuthority = getMintAuthorityKeypair()

  const fromKeypair = getKeypairFromStorage(fromEncryptedKey, fromIv)
  const fromPubkey = new PublicKey(fromPublicKey)
  const toPubkey = new PublicKey(toPublicKey)

  // Get or create ATAs for both parties
  const fromATA = await getOrCreateAssociatedTokenAccount(
    connection, mintAuthority, mint, fromPubkey,
  )
  const toATA = await getOrCreateAssociatedTokenAccount(
    connection, mintAuthority, mint, toPubkey,
  )

  const rawAmount = BigInt(Math.round(amount * 1_000_000))
  const sig = await transfer(
    connection,
    fromKeypair,       // payer + authority
    fromATA.address,
    toATA.address,
    fromKeypair.publicKey,
    rawAmount,
  )

  invalidateBalanceCache(fromPublicKey)
  invalidateBalanceCache(toPublicKey)
  return sig
}

// ── Airdrop SOL on devnet ────────────────────────────────────────────────────

// Internal: try multiple faucet strategies for devnet SOL funding
async function fundWalletDevnet(walletAddress: string): Promise<string> {
  const pubkey = new PublicKey(walletAddress)

  // Strategy 1: QuickNode devnet endpoint (supports up to ~1 SOL)
  try {
    const qnConn = getSolanaConnection()
    const sig = await qnConn.requestAirdrop(pubkey, 999_999_999) // just under 1 SOL
    await qnConn.confirmTransaction(sig, 'confirmed')
    return sig
  } catch { /* try next */ }

  // Strategy 2: Public Solana devnet RPC
  try {
    const pubConn = new Connection(clusterApiUrl('devnet'), 'confirmed')
    const sig = await pubConn.requestAirdrop(pubkey, 1 * LAMPORTS_PER_SOL)
    await pubConn.confirmTransaction(sig, 'confirmed')
    return sig
  } catch { /* all failed */ }

  throw new Error(
    `Devnet airdrop rate-limited. Manually fund ${walletAddress} on devnet then retry.\n` +
    `Use: https://faucet.solana.com or solana airdrop 1 ${walletAddress} --url devnet`
  )
}

export async function airdropSol(
  walletAddress: string,
  sol = 1,
): Promise<string> {
  if (network !== 'devnet' && network !== 'testnet') {
    throw new Error('Airdrops only available on devnet/testnet')
  }
  return fundWalletDevnet(walletAddress)
}

// ── Ensure agent has a devnet Solana wallet + funded + has RELAY ──────────────

export async function ensureAgentWallet(agentId: string): Promise<{
  publicKey: string
  solBalance: number
  relayBalance: number
}> {
  const supabase = await createClient()

  // Get existing wallet
  let { data: wallet } = await supabase
    .from('solana_wallets')
    .select('public_key, encrypted_private_key, encryption_iv, network')
    .eq('agent_id', agentId)
    .maybeSingle()

  // Create wallet if doesn't exist — derive from identity key if available
  if (!wallet) {
    let kp
    // Try to derive from agent's identity key (DID ↔ wallet deterministic link)
    const { data: identity } = await supabase
      .from('agent_identities')
      .select('encrypted_private_key, encryption_iv')
      .eq('agent_id', agentId)
      .maybeSingle()

    if (identity?.encrypted_private_key && identity?.encryption_iv) {
      try {
        const { decryptPrivateKey } = await import('@/lib/crypto/identity')
        const identityPrivKey = decryptPrivateKey(identity.encrypted_private_key, identity.encryption_iv)
        const { generateSolanaKeypairFromIdentity } = await import('./generate-wallet')
        kp = generateSolanaKeypairFromIdentity(identityPrivKey)
      } catch {
        // Fall back to random keypair if identity decryption fails
        kp = generateSolanaKeypair()
      }
    } else {
      kp = generateSolanaKeypair()
    }
    await supabase.from('solana_wallets').insert({
      agent_id: agentId,
      public_key: kp.publicKey,
      encrypted_private_key: kp.encryptedPrivateKey,
      encryption_iv: kp.iv,
      network,
    })
    wallet = { public_key: kp.publicKey, encrypted_private_key: kp.encryptedPrivateKey, encryption_iv: kp.iv, network }
  }

  const publicKey = wallet.public_key
  const solBalance = await getOnChainSolBalance(publicKey)
  const relayBalance = await getOnChainRelayBalance(publicKey)

  // Auto-fund with devnet SOL if empty (best-effort — rate limits apply)
  if (solBalance < 0.01 && (network === 'devnet' || network === 'testnet')) {
    try { await fundWalletDevnet(publicKey) } catch { /* rate limited, non-fatal */ }
  }

  return { publicKey, solBalance, relayBalance }
}

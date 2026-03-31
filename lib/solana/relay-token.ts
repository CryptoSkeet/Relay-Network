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

// ── Mint authority keypair (derived from encryption key) ──────────────────────

function getMintAuthorityKeypair(): Keypair {
  const encKey = process.env.SOLANA_WALLET_ENCRYPTION_KEY || 'default-key-change-in-production'
  // Derive a deterministic 32-byte seed from the encryption key
  const seed = crypto.createHmac('sha256', encKey).update('relay-mint-authority-v1').digest()
  return Keypair.fromSeed(seed)
}

// ── Get or create the RELAY token mint ────────────────────────────────────────

let _relayMintPubkey: PublicKey | null = null

export async function getRelayMint(): Promise<PublicKey> {
  if (_relayMintPubkey) return _relayMintPubkey

  // Check env override first (production mainnet address)
  const envMint = process.env.NEXT_PUBLIC_RELAY_CONTRACT_ADDRESS
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

// ── Get on-chain RELAY balance for a wallet ───────────────────────────────────

export async function getOnChainRelayBalance(walletAddress: string): Promise<number> {
  try {
    const connection = getSolanaConnection()
    const mint = await getRelayMint()
    const wallet = new PublicKey(walletAddress)
    const ata = await getAssociatedTokenAddress(mint, wallet)
    const account = await getAccount(connection, ata)
    return Number(account.amount) / 1_000_000 // 6 decimals
  } catch (e) {
    if (e instanceof TokenAccountNotFoundError) return 0
    return 0
  }
}

// ── Get on-chain SOL balance ───────────────────────────────────────────────────

export async function getOnChainSolBalance(walletAddress: string): Promise<number> {
  const connection = getSolanaConnection()
  const lamports = await connection.getBalance(new PublicKey(walletAddress))
  return lamports / LAMPORTS_PER_SOL
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

  // Get or create associated token account for recipient
  const tokenAccount = await getOrCreateAssociatedTokenAccount(
    connection,
    mintAuthority,  // payer for ATA creation
    mint,
    recipient,
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

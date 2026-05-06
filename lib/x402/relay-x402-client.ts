// lib/x402/relay-x402-client.ts
// Relay agents spending USDC via x402 to acquire external resources

import { wrapFetchWithPayment, x402Client } from '@x402/fetch'
import { ExactSvmScheme, toClientSvmSigner } from '@x402/svm'
import { createKeyPairSignerFromBytes } from '@solana/kit'
import { Connection, PublicKey } from '@solana/web3.js'
import { createHash } from 'crypto'
import { getKeypairFromStorage } from '@/lib/solana/generate-wallet'
import { createClient } from '@/lib/supabase/server'
import { buildKYAHeader, KYA_HEADER } from '@/lib/solana/kya-credential'

// SPL USDC mints (canonical)
const USDC_MINTS = {
  'solana:mainnet': 'EPjFWdd5AufqSSqeM2qN1xzybapC8G4wEGGkZwyTDt1v',
  'solana:devnet':  '4zMMC9srt5Ri5X14GAgXhaHii3GnPAEERYPJgZJDncDU',
} as const

// SPL token program (classic)
const TOKEN_PROGRAM_ID = new PublicKey('TokenkegQfeZyiNwAJbNbGKPFXCWuBvf9Ss623VQ5DA')
// Associated token account program
const ASSOCIATED_TOKEN_PROGRAM_ID = new PublicKey('ATokenGPvbdGVxr1b2hvZbsiqW5xWH25efTNsLJA8knL')

function deriveAta(owner: PublicKey, mint: PublicKey): PublicKey {
  const [ata] = PublicKey.findProgramAddressSync(
    [owner.toBuffer(), TOKEN_PROGRAM_ID.toBuffer(), mint.toBuffer()],
    ASSOCIATED_TOKEN_PROGRAM_ID,
  )
  return ata
}

/**
 * Convert a DID string (base58 pubkey or "did:relay:<handle>") to a PublicKey.
 * Falls back to sha256 hash when the DID isn't a valid base58 key.
 */
function didToPubkey(did: string): PublicKey {
  const raw = did.replace(/^did:relay:/, '')
  try {
    return new PublicKey(raw)
  } catch {
    return new PublicKey(createHash('sha256').update(did).digest())
  }
}

function rpcForNetwork(network: 'solana:mainnet' | 'solana:devnet'): string {
  if (network === 'solana:mainnet') {
    return process.env.X402_OUTBOUND_RPC_URL
      || process.env.SOLANA_MAINNET_RPC_URL
      || 'https://api.mainnet-beta.solana.com'
  }
  return process.env.QUICKNODE_RPC_URL
    || process.env.NEXT_PUBLIC_SOLANA_RPC
    || 'https://api.devnet.solana.com'
}

/**
 * Check the agent's USDC balance on the outbound x402 network.
 * Returns balance in whole USDC units (not micro-USDC).
 * Returns 0 if the ATA doesn't exist yet.
 */
export async function getAgentUsdcBalance(
  publicKey: string,
  network: 'solana:mainnet' | 'solana:devnet' = 'solana:mainnet',
): Promise<number> {
  const conn = new Connection(rpcForNetwork(network), 'confirmed')
  const owner = new PublicKey(publicKey)
  const mint = new PublicKey(USDC_MINTS[network])
  const ata = deriveAta(owner, mint)
  try {
    const bal = await conn.getTokenAccountBalance(ata)
    return bal.value.uiAmount ?? 0
  } catch {
    // ATA doesn't exist → balance is 0
    return 0
  }
}

export interface X402Resource {
  url: string
  maxAmountUsdc: number  // ceiling the agent will pay, in USDC
  description: string
}

export interface X402Result {
  success: boolean
  data?: any
  amountPaidUsdc?: number
  txSignature?: string
  error?: string
  network?: string
  balanceUsdc?: number
}

/**
 * Fetch a paid resource on behalf of a Relay agent using x402.
 * The agent pays in USDC from its Solana wallet.
 * Its Relay DID and PoI score are attached as headers so the
 * receiving server can verify identity before fulfilling.
 */
export async function agentFetchX402(
  agentId: string,
  resource: X402Resource,
): Promise<X402Result> {
  const supabase = await createClient()

  // 1. Load agent wallet + DID
  const { data: wallet } = await supabase
    .from('solana_wallets')
    .select('public_key, encrypted_private_key, encryption_iv')
    .eq('agent_id', agentId)
    .maybeSingle()

  if (!wallet) {
    return { success: false, error: 'Agent has no Solana wallet' }
  }

  const { data: agent } = await supabase
    .from('agents')
    .select('did, reputation_score')
    .eq('id', agentId)
    .maybeSingle()

  // 2. Reconstruct keypair from encrypted storage
  const keypair = getKeypairFromStorage(
    wallet.encrypted_private_key,
    wallet.encryption_iv,
  )

  // 3. Build x402 client with Solana signer
  // Convert @solana/web3.js Keypair to @solana/kit KeyPairSigner (required by x402)
  const kitSigner = await createKeyPairSignerFromBytes(keypair.secretKey)
  const svmSigner = toClientSvmSigner(kitSigner)
  // Outbound x402 network is decoupled from the rest of the Solana stack.
  // Real x402 paywalls (agentic.market, etc) live on mainnet, while Relay's
  // anchor programs run on devnet. Default to mainnet so agents can actually
  // transact; override via X402_OUTBOUND_NETWORK=solana:devnet for testing.
  // NOTE: the agent's wallet must hold real mainnet USDC at the same address
  // for outbound payment to succeed.
  const rawNetwork = (process.env.X402_OUTBOUND_NETWORK || 'solana:mainnet').trim()
  const network: 'solana:mainnet' | 'solana:devnet' =
    (rawNetwork === 'solana:mainnet' || rawNetwork === 'solana:devnet')
      ? rawNetwork
      : 'solana:mainnet'

  // 3a. Pre-flight: confirm the agent actually has enough USDC on the
  // outbound network. This turns opaque x402 handshake failures into a
  // clear "insufficient USDC" error before we attempt the payment.
  const balanceUsdc = await getAgentUsdcBalance(wallet.public_key, network)
  if (balanceUsdc < resource.maxAmountUsdc) {
    return {
      success: false,
      network,
      balanceUsdc,
      error: `Insufficient USDC on ${network}: have ${balanceUsdc}, need ${resource.maxAmountUsdc} (wallet ${wallet.public_key})`,
    }
  }

  const client = new x402Client()
    .register(network, new ExactSvmScheme(svmSigner))

  const fetchWithPay = wrapFetchWithPayment(fetch, client)

  try {
    // 4. Build KYA credential header from agent's on-chain profile.
    // KYA replaces the old raw DID/reputation headers with a single
    // cryptographically-verifiable credential that the receiving server
    // can check against on-chain state.
    const identityHeaders: Record<string, string> = {
      'X-Relay-Agent-ID': agentId,
    }
    if (agent?.did) {
      try {
        const didPubkey = didToPubkey(agent.did)
        const kyaValue = await buildKYAHeader(didPubkey)
        if (kyaValue) {
          identityHeaders[KYA_HEADER] = kyaValue
        }
      } catch (e) {
        // KYA resolution failed (network, PDA not found, etc.)
        // Fall through without the header — the payment still works,
        // the agent just won't get credential-based discounts.
        console.warn('[x402-client] KYA header build failed:', e)
      }
    }

    // 5. Fetch the paid resource — x402 handles 402 handshake automatically
    const response = await fetchWithPay(resource.url, {
      headers: identityHeaders,
    })

    if (!response.ok) {
      return { success: false, network, balanceUsdc, error: `HTTP ${response.status}` }
    }

    const data = await response.json()

    // The facilitator's settlement response is forwarded as `x-payment-response`.
    // It's a base64-encoded JSON containing the on-chain tx signature.
    let txSignature: string | undefined
    let payTo: string | undefined
    try {
      const payRespHeader = response.headers.get('x-payment-response')
      if (payRespHeader) {
        const decoded = JSON.parse(Buffer.from(payRespHeader, 'base64').toString('utf8'))
        txSignature = decoded?.transaction
        payTo = decoded?.payTo
      }
    } catch {
      // Header missing or malformed — log without sig
    }

    // 6. Log the spend to DB for transparency
    await supabase.from('agent_x402_transactions').insert({
      agent_id:       agentId,
      direction:      'outbound',
      network,
      resource_url:   resource.url,
      description:    resource.description,
      amount_usdc:    resource.maxAmountUsdc,
      tx_signature:   txSignature ?? null,
      pay_to_address: payTo ?? null,
      status:         'completed',
      created_at:     new Date().toISOString(),
    })

    return {
      success: true,
      data,
      amountPaidUsdc: resource.maxAmountUsdc,
      network,
      balanceUsdc,
      txSignature,
    }

  } catch (err: any) {
    return { success: false, network, balanceUsdc, error: err.message }
  }
}

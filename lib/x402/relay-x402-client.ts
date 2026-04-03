// lib/x402/relay-x402-client.ts
// Relay agents spending USDC via x402 to acquire external resources

import { createX402Client } from '@x402/fetch'
import { Connection, Keypair, PublicKey } from '@solana/web3.js'
import { getKeypairFromStorage } from '@/lib/solana/generate-wallet'
import { createClient } from '@/lib/supabase/server'
import { getSolanaConnection } from '@/lib/solana/quicknode'

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
  const x402Client = createX402Client({
    network: 'solana',
    signer: keypair,
    maxAmountUsd: resource.maxAmountUsdc,
  })

  try {
    // 4. Fetch the paid resource — x402 handles 402 handshake automatically
    const response = await x402Client.fetch(resource.url, {
      headers: {
        // Attach Relay identity so servers can verify agent trustworthiness
        'X-Relay-DID':        agent?.did ?? '',
        'X-Relay-Reputation': String(agent?.reputation_score ?? 0),
        'X-Relay-Agent-ID':   agentId,
      },
    })

    if (!response.ok) {
      return { success: false, error: `HTTP ${response.status}` }
    }

    const data = await response.json()

    // 5. Log the spend to DB for transparency
    await supabase.from('agent_x402_transactions').insert({
      agent_id:       agentId,
      resource_url:   resource.url,
      description:    resource.description,
      amount_usdc:    resource.maxAmountUsdc,
      status:         'completed',
      created_at:     new Date().toISOString(),
    })

    return {
      success: true,
      data,
      amountPaidUsdc: resource.maxAmountUsdc,
    }

  } catch (err: any) {
    return { success: false, error: err.message }
  }
}

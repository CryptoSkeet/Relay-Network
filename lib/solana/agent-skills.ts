/**
 * lib/solana/agent-skills.ts
 *
 * Wrapper around Solana Agent Kit that lets Relay agents execute
 * on-chain skills (swap, transfer, balance, stake, etc.) using
 * the network's payer keypair.
 *
 * Env:
 *   RELAY_PAYER_SECRET_KEY   JSON array [64 bytes]
 *   QUICKNODE_RPC_URL / NEXT_PUBLIC_SOLANA_RPC
 */

import { Keypair } from '@solana/web3.js'
import { SolanaAgentKit, KeypairWallet, executeAction } from 'solana-agent-kit'
import type { Action, Config } from 'solana-agent-kit'
import { getSolanaConnection } from './quicknode'

// ---------------------------------------------------------------------------
// Singleton agent kit — created lazily from env vars
// ---------------------------------------------------------------------------

let _kit: SolanaAgentKit | null = null

function getAgentKit(): SolanaAgentKit {
  if (_kit) return _kit

  const raw = process.env.RELAY_PAYER_SECRET_KEY
  if (!raw) throw new Error('RELAY_PAYER_SECRET_KEY not configured')

  const bytes = new Uint8Array(JSON.parse(raw))
  const keypair = Keypair.fromSecretKey(bytes)

  const conn = getSolanaConnection()
  const rpcUrl = (conn as any)._rpcEndpoint as string

  const wallet = new KeypairWallet(keypair, rpcUrl)

  const config: Config = {
    HELIUS_API_KEY: process.env.HELIUS_API_KEY,
    OPENAI_API_KEY: process.env.OPENAI_API_KEY,
    JUPITER_REFERRAL_ACCOUNT: process.env.JUPITER_REFERRAL_ACCOUNT,
    JUPITER_FEE_BPS: process.env.JUPITER_FEE_BPS
      ? parseInt(process.env.JUPITER_FEE_BPS)
      : undefined,
  }

  _kit = new SolanaAgentKit(wallet, rpcUrl, config)
  return _kit
}

// ---------------------------------------------------------------------------
// Skill registry — maps skill names to allowlisted agent kit actions
// ---------------------------------------------------------------------------

export interface SkillResult {
  success: boolean
  data?: Record<string, unknown>
  error?: string
}

/**
 * The set of skills agents are allowed to invoke.
 * We keep a static allowlist rather than exposing the full
 * agent kit surface — new skills are opt-in.
 */
const ALLOWED_SKILLS = new Set([
  'solana-balance',
  'solana-transfer',
  'solana-swap',
  'solana-stake',
  'solana-token-data',
  'solana-price',
])

/**
 * Lists all available skills with their descriptions.
 */
export function listSkills(): { name: string; description: string }[] {
  return [
    { name: 'solana-balance', description: 'Get SOL or token balance for any wallet address' },
    { name: 'solana-transfer', description: 'Transfer SOL or SPL tokens to another wallet' },
    { name: 'solana-swap', description: 'Swap tokens via Jupiter aggregator' },
    { name: 'solana-stake', description: 'Stake SOL with a validator' },
    { name: 'solana-token-data', description: 'Get token metadata and supply info' },
    { name: 'solana-price', description: 'Get current token price in USD' },
  ]
}

/**
 * Execute a Solana skill by name with the given parameters.
 *
 * Uses the Relay payer keypair as the signer. Only allowlisted
 * skills can be executed — unknown names are rejected.
 */
export async function executeSkill(
  skillName: string,
  params: Record<string, unknown>
): Promise<SkillResult> {
  if (!ALLOWED_SKILLS.has(skillName)) {
    return { success: false, error: `Unknown skill: ${skillName}` }
  }

  const kit = getAgentKit()

  // Find the matching action in the agent kit's registered actions.
  // Actions are registered via plugins; if not found, fall back to
  // a manual handler map for core operations.
  const action = kit.actions.find(
    (a: Action) => a.name === skillName || a.similes?.includes(skillName)
  )

  if (action) {
    try {
      const result = await executeAction(action, kit, params)
      return { success: true, data: result }
    } catch (err) {
      return { success: false, error: err instanceof Error ? err.message : String(err) }
    }
  }

  // Manual handler fallback for core skills that may not be
  // registered as formal actions in some agent-kit versions.
  try {
    const data = await runCoreSkill(kit, skillName, params)
    return { success: true, data }
  } catch (err) {
    return { success: false, error: err instanceof Error ? err.message : String(err) }
  }
}

// ---------------------------------------------------------------------------
// Core skill handlers — direct agent-kit method calls
// ---------------------------------------------------------------------------

async function runCoreSkill(
  kit: SolanaAgentKit,
  skill: string,
  params: Record<string, unknown>
): Promise<Record<string, unknown>> {
  const conn = getSolanaConnection()

  switch (skill) {
    case 'solana-balance': {
      const address = params.address as string | undefined
      const pubkey = address
        ? await import('@solana/web3.js').then(m => new m.PublicKey(address))
        : kit.wallet.publicKey
      const lamports = await conn.getBalance(pubkey)
      return { address: pubkey.toBase58(), sol: lamports / 1e9 }
    }

    case 'solana-transfer': {
      const { PublicKey, SystemProgram, Transaction, sendAndConfirmTransaction } =
        await import('@solana/web3.js')
      const to = new PublicKey(params.to as string)
      const sol = params.amount as number
      const tx = new Transaction().add(
        SystemProgram.transfer({
          fromPubkey: kit.wallet.publicKey,
          toPubkey: to,
          lamports: Math.round(sol * 1e9),
        })
      )
      const signed = await kit.wallet.signTransaction(tx)
      const sig = await conn.sendRawTransaction(signed.serialize())
      await conn.confirmTransaction(sig, 'confirmed')
      return { signature: sig, to: to.toBase58(), amount: sol }
    }

    case 'solana-swap': {
      // Use Jupiter quote + swap API
      const inputMint = params.inputMint as string
      const outputMint = params.outputMint as string
      const amount = params.amount as number
      const slippage = (params.slippageBps as number) ?? 50

      const quoteUrl = `https://quote-api.jup.ag/v6/quote?inputMint=${inputMint}&outputMint=${outputMint}&amount=${Math.round(amount * 1e9)}&slippageBps=${slippage}`
      const quoteRes = await fetch(quoteUrl)
      if (!quoteRes.ok) throw new Error(`Jupiter quote failed: ${quoteRes.status}`)
      const quote = await quoteRes.json()

      const swapRes = await fetch('https://quote-api.jup.ag/v6/swap', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          quoteResponse: quote,
          userPublicKey: kit.wallet.publicKey.toBase58(),
        }),
      })
      if (!swapRes.ok) throw new Error(`Jupiter swap failed: ${swapRes.status}`)
      const { swapTransaction } = await swapRes.json()

      const { VersionedTransaction } = await import('@solana/web3.js')
      const txBuf = Buffer.from(swapTransaction, 'base64')
      const vtx = VersionedTransaction.deserialize(txBuf)
      const signed = await kit.wallet.signTransaction(vtx)
      const sig = await conn.sendRawTransaction(signed.serialize())
      await conn.confirmTransaction(sig, 'confirmed')

      return {
        signature: sig,
        inputMint,
        outputMint,
        inputAmount: amount,
        outputAmount: quote.outAmount,
      }
    }

    case 'solana-stake': {
      const { StakeProgram, Authorized, Lockup, PublicKey } =
        await import('@solana/web3.js')
      const stakeAmount = params.amount as number
      const validatorAddress = params.validator as string

      const stakeKeypair = Keypair.generate()
      const authorized = new Authorized(kit.wallet.publicKey, kit.wallet.publicKey)

      const tx = StakeProgram.createAccount({
        fromPubkey: kit.wallet.publicKey,
        stakePubkey: stakeKeypair.publicKey,
        authorized,
        lockup: new Lockup(0, 0, kit.wallet.publicKey),
        lamports: Math.round(stakeAmount * 1e9),
      })

      const delegateTx = StakeProgram.delegate({
        stakePubkey: stakeKeypair.publicKey,
        authorizedPubkey: kit.wallet.publicKey,
        votePubkey: new PublicKey(validatorAddress),
      })

      tx.add(...delegateTx.instructions)
      const signed = await kit.wallet.signTransaction(tx)
      const sig = await conn.sendRawTransaction(signed.serialize())
      await conn.confirmTransaction(sig, 'confirmed')

      return {
        signature: sig,
        stakeAccount: stakeKeypair.publicKey.toBase58(),
        amount: stakeAmount,
        validator: validatorAddress,
      }
    }

    case 'solana-token-data': {
      const { PublicKey } = await import('@solana/web3.js')
      const mintStr = params.mint as string
      const mint = new PublicKey(mintStr)
      const info = await conn.getParsedAccountInfo(mint)
      const parsed = (info.value?.data as any)?.parsed
      return {
        mint: mintStr,
        supply: parsed?.info?.supply,
        decimals: parsed?.info?.decimals,
        freezeAuthority: parsed?.info?.freezeAuthority,
        mintAuthority: parsed?.info?.mintAuthority,
      }
    }

    case 'solana-price': {
      const token = params.token as string
      const res = await fetch(
        `https://api.jup.ag/price/v2?ids=${token}`
      )
      if (!res.ok) throw new Error(`Jupiter price API failed: ${res.status}`)
      const json = await res.json()
      const priceData = json.data?.[token]
      return {
        token,
        priceUsd: priceData?.price ?? null,
        source: 'jupiter',
      }
    }

    default:
      throw new Error(`Unhandled skill: ${skill}`)
  }
}

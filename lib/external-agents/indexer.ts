// lib/external-agents/indexer.ts
// Crawls external agent registries and creates Relay profiles with custodial DIDs

import * as ed from '@noble/ed25519'
import { createClient } from '@/lib/supabase/server'
import crypto from 'crypto'

const ENCRYPTION_KEY = process.env.SOLANA_WALLET_ENCRYPTION_KEY!

// ── DID generation ────────────────────────────────────────────────────────────

function slugify(name: string, source: string): string {
  return `${source}-${name.toLowerCase().replace(/[^a-z0-9]/g, '-').replace(/-+/g, '-').slice(0, 40)}`
}

async function generateCustodialKeypair(): Promise<{
  publicKey: string
  encryptedPrivateKey: string
  iv: string
}> {
  // Generate Ed25519 keypair
  const privateKeyBytes = crypto.randomBytes(32)
  const publicKeyBytes  = await ed.getPublicKeyAsync(privateKeyBytes)

  // Encrypt private key for storage
  const iv  = crypto.randomBytes(16)
  const key = crypto.scryptSync(ENCRYPTION_KEY, 'relay-custodial-did-v1', 32)
  const cipher = crypto.createCipheriv('aes-256-cbc', key, iv)

  const encrypted = Buffer.concat([
    cipher.update(privateKeyBytes),
    cipher.final(),
  ])

  return {
    publicKey:           Buffer.from(publicKeyBytes).toString('hex'),
    encryptedPrivateKey: encrypted.toString('hex'),
    iv:                  iv.toString('hex'),
  }
}

// ── Source: use-agently.com ───────────────────────────────────────────────────

interface UseAgentlyAgent {
  id:           string
  name:         string
  description:  string
  owner:        string   // EVM address
  x402Enabled:  boolean
  mcpEndpoint?: string
  capabilities: string[]
  avatarUrl?:   string
  sourceUrl:    string
}

async function fetchUseAgentlyAgents(): Promise<UseAgentlyAgent[]> {
  try {
    const res = await fetch('https://use-agently.com/api/agents?limit=100', {
      headers: { 'User-Agent': 'RelayNetwork-Indexer/1.0' }
    })

    if (res.ok) {
      const data = await res.json() as Record<string, any>
      return (data.agents ?? []).map((a: any) => ({
        id:           String(a.id),
        name:         a.name,
        description:  a.description ?? '',
        owner:        a.owner ?? '',
        x402Enabled:  a.payments === 'X402' || a.x402Enabled === true,
        mcpEndpoint:  a.services?.find((s: any) => s.type === 'MCP')?.url,
        capabilities: a.capabilities ?? [],
        avatarUrl:    a.avatar_url,
        sourceUrl:    `https://use-agently.com/agent/${a.id}`,
      }))
    }
  } catch { /* fall through to seed */ }

  // Fallback: manually seed known agents (expand over time)
  return [
    {
      id:           '35635',
      name:         'Jina',
      description:  'Read any URL and convert it to clean, LLM-friendly markdown using Jina Reader.',
      owner:        '0x506d...ff11',
      x402Enabled:  true,
      mcpEndpoint:  'https://jina-ai-model.vercel.app/mcp',
      capabilities: ['url-reader', 'web-search', 'markdown-extraction'],
      avatarUrl:    undefined,
      sourceUrl:    'https://use-agently.com/agent/35635',
    },
  ]
}

// ── Source: MCP Registry ──────────────────────────────────────────────────────

async function fetchMCPRegistryAgents(): Promise<UseAgentlyAgent[]> {
  try {
    const res = await fetch('https://registry.modelcontextprotocol.io/servers?limit=50')
    if (!res.ok) return []

    const data = await res.json() as Record<string, any>
    return (data.servers ?? []).map((s: any) => ({
      id:           s.id ?? s.name,
      name:         s.name,
      description:  s.description ?? '',
      owner:        s.publisher ?? '',
      x402Enabled:  false,
      mcpEndpoint:  s.url,
      capabilities: s.tools?.map((t: any) => t.name) ?? [],
      avatarUrl:    undefined,
      sourceUrl:    `https://registry.modelcontextprotocol.io/servers/${s.id}`,
    }))
  } catch {
    return []
  }
}

// ── Core indexer ──────────────────────────────────────────────────────────────

export interface IndexResult {
  created:  number
  updated:  number
  skipped:  number
  errors:   string[]
}

export async function indexExternalAgents(): Promise<IndexResult> {
  const supabase = await createClient()
  const result: IndexResult = { created: 0, updated: 0, skipped: 0, errors: [] }

  const [useAgentlyAgents, mcpAgents] = await Promise.all([
    fetchUseAgentlyAgents(),
    fetchMCPRegistryAgents(),
  ])

  const allAgents = [
    ...useAgentlyAgents.map(a => ({ ...a, source: 'use-agently' })),
    ...mcpAgents.map(a => ({ ...a, source: 'mcp-registry' })),
  ]

  for (const agent of allAgents) {
    try {
      const slug     = slugify(agent.name, agent.source)
      const relayDid = `did:relay:external:${slug}`

      const { data: existing } = await supabase
        .from('external_agents')
        .select('id, reputation_score, status')
        .eq('relay_did', relayDid)
        .maybeSingle()

      if (existing) {
        await supabase
          .from('external_agents')
          .update({
            name:            agent.name,
            description:     agent.description,
            capabilities:    agent.capabilities,
            x402_enabled:    agent.x402Enabled,
            mcp_endpoint:    agent.mcpEndpoint,
            last_indexed_at: new Date().toISOString(),
            updated_at:      new Date().toISOString(),
          })
          .eq('id', existing.id)

        result.updated++
        continue
      }

      const keypair = await generateCustodialKeypair()

      const { error } = await supabase
        .from('external_agents')
        .insert({
          relay_did:             relayDid,
          external_id:           agent.id,
          source_registry:       agent.source,
          source_url:            agent.sourceUrl,
          name:                  agent.name,
          description:           agent.description,
          capabilities:          agent.capabilities,
          avatar_url:            agent.avatarUrl,
          x402_enabled:          agent.x402Enabled,
          evm_address:           agent.owner || null,
          mcp_endpoint:          agent.mcpEndpoint || null,
          reputation_score:      0,
          contracts_completed:   0,
          status:                'unclaimed',
          custodial_public_key:  keypair.publicKey,
          custodial_private_key: keypair.encryptedPrivateKey,
          last_indexed_at:       new Date().toISOString(),
        })

      if (error) {
        result.errors.push(`${agent.name}: ${error.message}`)
      } else {
        result.created++
        console.log(`[indexer] Created external agent: ${relayDid}`)
      }

    } catch (err: any) {
      result.errors.push(`${agent.name}: ${err.message}`)
    }
  }

  console.log(`[indexer] Done — created: ${result.created}, updated: ${result.updated}, errors: ${result.errors.length}`)
  return result
}

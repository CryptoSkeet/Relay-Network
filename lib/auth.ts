import * as ed from '@noble/ed25519'
import { sha512 } from '@noble/hashes/sha512'
import { createAdminClient } from './supabase/admin'

// Configure ed25519 to use sha512
ed.etc.sha512Sync = (...m) => sha512(ed.etc.concatBytes(...m))

export interface AgentAuthResult {
  success: true
  agent: {
    id: string
    display_name: string
    handle: string
    public_key: string
    reputation_score: number
    status: string
  }
}

export interface AgentAuthError {
  success: false
  error: string
  status: number
}

export type VerifyAgentResult = AgentAuthResult | AgentAuthError

/**
 * Verify an agent request using Ed25519 signature
 * 
 * Required headers:
 * - X-Agent-ID: UUID of the agent
 * - X-Agent-Signature: Ed25519 signature (hex encoded)
 * - X-Timestamp: Unix timestamp in milliseconds
 * 
 * The signature is over: timestamp + ":" + rawBody
 */
export async function verifyAgentRequest(
  request: Request
): Promise<VerifyAgentResult> {
  const agentId = request.headers.get('X-Agent-ID')
  const signature = request.headers.get('X-Agent-Signature')
  const timestamp = request.headers.get('X-Timestamp')

  // Check required headers
  if (!agentId || !signature || !timestamp) {
    return {
      success: false,
      error: 'Missing required headers: X-Agent-ID, X-Agent-Signature, X-Timestamp',
      status: 401,
    }
  }

  // Replay attack prevention - reject if timestamp is older than 60 seconds
  const timestampMs = parseInt(timestamp, 10)
  const now = Date.now()
  const maxAge = 60 * 1000 // 60 seconds

  if (isNaN(timestampMs) || now - timestampMs > maxAge) {
    return {
      success: false,
      error: 'Request timestamp expired or invalid (max 60 seconds)',
      status: 401,
    }
  }

  // Also reject if timestamp is in the future (clock skew tolerance of 5 seconds)
  if (timestampMs > now + 5000) {
    return {
      success: false,
      error: 'Request timestamp is in the future',
      status: 401,
    }
  }

  // Fetch agent from database
  const supabase = createAdminClient()
  const { data: agent, error: dbError } = await supabase
    .from('agents')
    .select('id, display_name, handle, public_key, reputation_score, status')
    .eq('id', agentId)
    .single()

  if (dbError || !agent) {
    return {
      success: false,
      error: 'Agent not found',
      status: 401,
    }
  }

  if (!agent.public_key) {
    return {
      success: false,
      error: 'Agent does not have a registered public key',
      status: 401,
    }
  }

  // Get the raw request body for signature verification
  let rawBody = ''
  try {
    rawBody = await request.clone().text()
  } catch {
    // Empty body is fine for GET requests
  }

  // The signed message is: timestamp + ":" + rawBody
  const message = `${timestamp}:${rawBody}`
  const messageBytes = new TextEncoder().encode(message)

  // Convert hex signature to Uint8Array
  let signatureBytes: Uint8Array
  try {
    signatureBytes = hexToBytes(signature)
  } catch {
    return {
      success: false,
      error: 'Invalid signature format (expected hex)',
      status: 401,
    }
  }

  // Convert hex public key to Uint8Array
  let publicKeyBytes: Uint8Array
  try {
    publicKeyBytes = hexToBytes(agent.public_key)
  } catch {
    return {
      success: false,
      error: 'Invalid public key format in database',
      status: 500,
    }
  }

  // Verify Ed25519 signature
  let isValid = false
  try {
    isValid = await ed.verifyAsync(signatureBytes, messageBytes, publicKeyBytes)
  } catch (err) {
    return {
      success: false,
      error: `Signature verification failed: ${err instanceof Error ? err.message : 'Unknown error'}`,
      status: 401,
    }
  }

  if (!isValid) {
    return {
      success: false,
      error: 'Invalid signature',
      status: 401,
    }
  }

  return {
    success: true,
    agent,
  }
}

/**
 * Verify a request authenticated with a Relay API key (Bearer relay_xxx).
 * Used by the SDK and terminal agents instead of Ed25519.
 */
export async function verifyApiKeyRequest(request: Request): Promise<VerifyAgentResult> {
  const auth = request.headers.get('Authorization')
  if (!auth?.startsWith('Bearer relay_')) {
    return { success: false, error: 'Missing or invalid API key', status: 401 }
  }
  const key = auth.replace('Bearer ', '')
  const { createHash } = await import('crypto')
  const keyHash = createHash('sha256').update(key).digest('hex')
  const supabase = createAdminClient()
  const { data: apiKey } = await supabase
    .from('agent_api_keys')
    .select('agent_id, is_active, expires_at, scopes')
    .eq('key_hash', keyHash)
    .maybeSingle()
  if (!apiKey) return { success: false, error: 'Invalid API key', status: 401 }
  if (!apiKey.is_active) return { success: false, error: 'API key revoked', status: 401 }
  if (apiKey.expires_at && new Date(apiKey.expires_at) < new Date()) {
    return { success: false, error: 'API key expired', status: 401 }
  }
  // Update last_used_at (non-blocking)
  supabase.from('agent_api_keys').update({ last_used_at: new Date().toISOString() }).eq('key_hash', keyHash).then(() => {})
  const { data: agent } = await supabase
    .from('agents')
    .select('id, display_name, handle, public_key, reputation_score, status')
    .eq('id', apiKey.agent_id)
    .single()
  if (!agent) return { success: false, error: 'Agent not found', status: 401 }
  return { success: true, agent: { ...agent, public_key: agent.public_key ?? '' } }
}

/**
 * Helper function to convert hex string to Uint8Array
 */
function hexToBytes(hex: string): Uint8Array {
  // Remove 0x prefix if present
  const cleanHex = hex.startsWith('0x') ? hex.slice(2) : hex
  
  if (cleanHex.length % 2 !== 0) {
    throw new Error('Invalid hex string length')
  }

  const bytes = new Uint8Array(cleanHex.length / 2)
  for (let i = 0; i < cleanHex.length; i += 2) {
    bytes[i / 2] = parseInt(cleanHex.substring(i, i + 2), 16)
  }
  return bytes
}

/**
 * Helper function to convert Uint8Array to hex string
 */
export function bytesToHex(bytes: Uint8Array): string {
  return Array.from(bytes)
    .map((b) => b.toString(16).padStart(2, '0'))
    .join('')
}

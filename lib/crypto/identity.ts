/**
 * Agent Identity Cryptographic Utilities
 * - DID generation (did:relay:...)
 * - Ed25519 keypair generation for message signing
 * - AES-256-GCM encryption for private key storage
 * - Signature creation and verification
 */

import { createHash, randomBytes, createCipheriv, createDecipheriv } from 'crypto'
import { ed25519 } from '@noble/curves/ed25519'

const fromHex = (hex: string) => Uint8Array.from(Buffer.from(hex, 'hex'))

// Environment variable for encryption key (must be 32 bytes / 256 bits)
const ENCRYPTION_KEY = process.env.AGENT_ENCRYPTION_KEY || ''

const toHex = (b: Uint8Array) => Array.from(b).map(x => x.toString(16).padStart(2, '0')).join('')

/**
 * Generate a real Ed25519 keypair.
 * Returns hex-encoded public and private keys (compatible with auth.ts).
 */
export async function generateKeypair(): Promise<{
  publicKey: string
  privateKey: string
}> {
  const privateKeyBytes = randomBytes(32)
  const publicKeyBytes = ed25519.getPublicKey(privateKeyBytes)
  return {
    publicKey: toHex(publicKeyBytes),
    privateKey: toHex(privateKeyBytes),
  }
}

/**
 * Generate a Decentralized Identifier (DID) for an agent
 * Format: did:relay:{base58-encoded-public-key-hash}
 */
export function generateDID(publicKey: string): string {
  const hash = createHash('sha256')
    .update(publicKey)
    .digest('hex')
    .slice(0, 32) // First 32 hex chars = 16 bytes
  
  return `did:relay:${hash}`
}

/**
 * Encrypt private key using AES-256-GCM for secure storage
 */
export function encryptPrivateKey(privateKey: string): {
  encryptedKey: string
  iv: string
} {
  if (!ENCRYPTION_KEY || ENCRYPTION_KEY.length < 32) {
    // Use a derived key for development (NOT for production!)
    const derivedKey = createHash('sha256')
      .update(process.env.SUPABASE_URL || 'relay-dev-key')
      .digest()
    
    const iv = randomBytes(16)
    const cipher = createCipheriv('aes-256-gcm', derivedKey, iv)
    
    let encrypted = cipher.update(privateKey, 'utf8', 'base64')
    encrypted += cipher.final('base64')
    
    const authTag = cipher.getAuthTag()
    
    return {
      encryptedKey: encrypted + ':' + authTag.toString('base64'),
      iv: iv.toString('base64'),
    }
  }
  
  const key = Buffer.from(ENCRYPTION_KEY, 'hex').subarray(0, 32)
  const iv = randomBytes(16)
  const cipher = createCipheriv('aes-256-gcm', key, iv)
  
  let encrypted = cipher.update(privateKey, 'utf8', 'base64')
  encrypted += cipher.final('base64')
  
  const authTag = cipher.getAuthTag()
  
  return {
    encryptedKey: encrypted + ':' + authTag.toString('base64'),
    iv: iv.toString('base64'),
  }
}

/**
 * Decrypt private key from storage
 */
export function decryptPrivateKey(encryptedKey: string, iv: string): string {
  const [encrypted, authTagB64] = encryptedKey.split(':')
  const authTag = Buffer.from(authTagB64, 'base64')
  const ivBuffer = Buffer.from(iv, 'base64')
  
  let key: Buffer
  if (!ENCRYPTION_KEY || ENCRYPTION_KEY.length < 32) {
    key = createHash('sha256')
      .update(process.env.SUPABASE_URL || 'relay-dev-key')
      .digest()
  } else {
    key = Buffer.from(ENCRYPTION_KEY, 'hex').subarray(0, 32)
  }
  
  const decipher = createDecipheriv('aes-256-gcm', key, ivBuffer)
  decipher.setAuthTag(authTag)
  
  let decrypted = decipher.update(encrypted, 'base64', 'utf8')
  decrypted += decipher.final('utf8')
  
  return decrypted
}

/**
 * Sign a message using Ed25519 private key (hex-encoded).
 * Returns hex-encoded signature.
 */
export function signMessage(message: string, privateKey: string): string {
  const privateKeyBytes = fromHex(privateKey)
  const messageBytes = new TextEncoder().encode(message)
  const sigBytes = ed25519.sign(messageBytes, privateKeyBytes)
  return toHex(sigBytes)
}

/**
 * Verify an Ed25519 signature.
 * Both signature and publicKey are hex-encoded.
 */
export function verifySignature(
  message: string,
  signature: string,
  publicKey: string
): boolean {
  try {
    const sigBytes = fromHex(signature)
    const pubKeyBytes = fromHex(publicKey)
    const messageBytes = new TextEncoder().encode(message)
    return ed25519.verify(sigBytes, messageBytes, pubKeyBytes)
  } catch {
    return false
  }
}

/**
 * Create signature headers for API requests
 */
export function createSignatureHeaders(
  agentId: string,
  privateKey: string,
  body?: string
): {
  'X-Agent-ID': string
  'X-Agent-Signature': string
  'X-Timestamp': string
} {
  const timestamp = Date.now().toString()
  const message = `${agentId}:${timestamp}:${body || ''}`
  const signature = signMessage(message, privateKey)
  
  return {
    'X-Agent-ID': agentId,
    'X-Agent-Signature': signature,
    'X-Timestamp': timestamp,
  }
}

/**
 * Verify signature headers from API request
 */
export async function verifySignatureHeaders(
  headers: {
    'x-agent-id'?: string
    'x-agent-signature'?: string
    'x-timestamp'?: string
  },
  body: string,
  getPublicKey: (agentId: string) => Promise<string | null>
): Promise<{ valid: boolean; error?: string; agentId?: string }> {
  const agentId = headers['x-agent-id']
  const signature = headers['x-agent-signature']
  const timestamp = headers['x-timestamp']
  
  if (!agentId || !signature || !timestamp) {
    return { valid: false, error: 'Missing required signature headers' }
  }
  
  // Check timestamp freshness (5 minute window)
  const timestampMs = parseInt(timestamp, 10)
  const now = Date.now()
  if (isNaN(timestampMs) || Math.abs(now - timestampMs) > 5 * 60 * 1000) {
    return { valid: false, error: 'Timestamp expired or invalid' }
  }
  
  // Get public key for agent
  const publicKey = await getPublicKey(agentId)
  if (!publicKey) {
    return { valid: false, error: 'Agent not found or no public key' }
  }
  
  // Verify signature
  const message = `${agentId}:${timestamp}:${body}`
  const isValid = verifySignature(message, signature, publicKey)
  
  if (!isValid) {
    return { valid: false, error: 'Invalid signature' }
  }
  
  return { valid: true, agentId }
}

/**
 * Generate a challenge for proof verification
 */
export function generateChallenge(): string {
  return randomBytes(32).toString('hex')
}

/**
 * Verify a challenge response
 */
export function verifyChallengeResponse(
  challenge: string,
  response: string,
  publicKey: string
): boolean {
  return verifySignature(challenge, response, publicKey)
}

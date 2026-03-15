'use client'

/**
 * Browser-side Ed25519 identity utilities.
 *
 * Keypair generation  → @noble/curves/ed25519 (works in browser & Node)
 * Private key storage → AES-256-GCM, key derived via PBKDF2 from user password
 *                       using the Web Crypto API. The raw private key is NEVER
 *                       sent to the server.
 */

import * as ed25519 from '@noble/ed25519'

// ── helpers ─────────────────────────────────────────────────────────────────

const toHex = (b: Uint8Array) =>
  Array.from(b)
    .map((x) => x.toString(16).padStart(2, '0'))
    .join('')

const fromHex = (hex: string) =>
  new Uint8Array(hex.match(/.{2}/g)!.map((b) => parseInt(b, 16)))

const toBase64 = (buf: ArrayBuffer | Uint8Array): string =>
  btoa(String.fromCharCode(...new Uint8Array(buf instanceof ArrayBuffer ? buf : buf.buffer)))

const fromBase64 = (b64: string): Uint8Array => {
  const bin = atob(b64)
  return new Uint8Array(bin.length).map((_, i) => bin.charCodeAt(i))
}

// ── types ────────────────────────────────────────────────────────────────────

export interface StoredKeypair {
  /** Hex-encoded Ed25519 public key (safe to send to server) */
  publicKey: string
  /** Base64-encoded AES-256-GCM ciphertext (includes 16-byte auth tag) */
  encryptedPrivateKey: string
  /** Base64-encoded 12-byte AES-GCM IV */
  iv: string
  /** Base64-encoded 16-byte PBKDF2 salt */
  salt: string
}

// ── keypair generation ───────────────────────────────────────────────────────

/** Generate a fresh Ed25519 keypair. Both keys are hex-encoded. */
export async function generateKeypair(): Promise<{ publicKey: string; privateKey: string }> {
  const priv = ed25519.utils.randomPrivateKey()
  const pub = await ed25519.getPublicKey(priv)
  return { publicKey: toHex(pub), privateKey: toHex(priv) }
}

// ── encryption / decryption ──────────────────────────────────────────────────

/**
 * Encrypt an Ed25519 private key (hex) with the user's password.
 * Uses PBKDF2 (100 000 iterations, SHA-256) → AES-256-GCM.
 * All work happens in the browser via Web Crypto API.
 */
export async function encryptPrivateKeyWithPassword(
  privateKeyHex: string,
  password: string,
  publicKey: string,
): Promise<StoredKeypair> {
  const enc = new TextEncoder()
  const salt = crypto.getRandomValues(new Uint8Array(16))

  const keyMaterial = await crypto.subtle.importKey(
    'raw',
    enc.encode(password),
    'PBKDF2',
    false,
    ['deriveKey'],
  )

  const aesKey = await crypto.subtle.deriveKey(
    { name: 'PBKDF2', salt, iterations: 100_000, hash: 'SHA-256' },
    keyMaterial,
    { name: 'AES-GCM', length: 256 },
    false,
    ['encrypt'],
  )

  const iv = crypto.getRandomValues(new Uint8Array(12))
  const ciphertext = await crypto.subtle.encrypt(
    { name: 'AES-GCM', iv },
    aesKey,
    enc.encode(privateKeyHex),
  )

  return {
    publicKey,
    encryptedPrivateKey: toBase64(ciphertext),
    iv: toBase64(iv),
    salt: toBase64(salt),
  }
}

/**
 * Decrypt a stored keypair using the user's password.
 * Returns the raw hex private key on success; throws on wrong password.
 */
export async function decryptPrivateKeyWithPassword(
  stored: StoredKeypair,
  password: string,
): Promise<string> {
  const enc = new TextEncoder()
  const salt = fromBase64(stored.salt)
  const iv = fromBase64(stored.iv)
  const ciphertext = fromBase64(stored.encryptedPrivateKey)

  const keyMaterial = await crypto.subtle.importKey(
    'raw',
    enc.encode(password),
    'PBKDF2',
    false,
    ['deriveKey'],
  )

  const aesKey = await crypto.subtle.deriveKey(
    { name: 'PBKDF2', salt, iterations: 100_000, hash: 'SHA-256' },
    keyMaterial,
    { name: 'AES-GCM', length: 256 },
    false,
    ['decrypt'],
  )

  const plaintext = await crypto.subtle.decrypt({ name: 'AES-GCM', iv }, aesKey, ciphertext)
  return new TextDecoder().decode(plaintext)
}

// ── localStorage helpers ─────────────────────────────────────────────────────

const PENDING_KEY = 'relay_pending_keypair'

/** Persist an encrypted keypair to localStorage under a given key. */
export function storeKeyLocally(storageKey: string, data: StoredKeypair): void {
  localStorage.setItem(storageKey, JSON.stringify(data))
}

/** Load a previously stored keypair from localStorage. Returns null if absent. */
export function getStoredKey(storageKey: string): StoredKeypair | null {
  const raw = localStorage.getItem(storageKey)
  if (!raw) return null
  try {
    return JSON.parse(raw) as StoredKeypair
  } catch {
    return null
  }
}

/** Remove a key from localStorage. */
export function removeStoredKey(storageKey: string): void {
  localStorage.removeItem(storageKey)
}

/**
 * After signup: generate keypair, encrypt with password, stash in localStorage.
 * Called from the sign-up form before redirecting to create-agent.
 */
export async function generateAndStashKeypair(password: string): Promise<string> {
  const { publicKey, privateKey } = await generateKeypair()
  const stored = await encryptPrivateKeyWithPassword(privateKey, password, publicKey)
  storeKeyLocally(PENDING_KEY, stored)
  return publicKey
}

/**
 * During agent creation: read the pending keypair and promote it to a
 * permanent per-agent key. Returns the public key (to send to the server).
 * If no pending keypair exists, generates a fresh one (unencrypted) as fallback.
 */
export async function claimPendingKeypair(agentId: string): Promise<string> {
  const pending = getStoredKey(PENDING_KEY)

  if (pending) {
    storeKeyLocally(`relay_key_${agentId}`, pending)
    removeStoredKey(PENDING_KEY)
    return pending.publicKey
  }

  // Fallback: generate new keypair (no password-based encryption)
  const { publicKey, privateKey } = await generateKeypair()
  storeKeyLocally(`relay_key_${agentId}`, {
    publicKey,
    encryptedPrivateKey: '',   // unencrypted fallback – stored as plain hex
    iv: '',
    salt: '',
    // stash plaintext for later use (only when no password available)
    ...(({ _raw: privateKey } as unknown) as object),
  } as StoredKeypair)

  // Also write raw key for the unencrypted fallback path
  localStorage.setItem(`relay_raw_key_${agentId}`, privateKey)
  return publicKey
}

// ── signing ──────────────────────────────────────────────────────────────────

/** Sign a UTF-8 message with an Ed25519 private key (hex). Returns hex signature. */
export async function signMessage(message: string, privateKeyHex: string): Promise<string> {
  const msgBytes = new TextEncoder().encode(message)
  const privBytes = fromHex(privateKeyHex)
  const sig = await ed25519.sign(msgBytes, privBytes)
  return toHex(sig)
}

/**
 * Build the three custom auth headers that Relay API routes expect.
 * Signature covers: `${timestamp}:${bodyString}` (matches lib/auth.ts).
 */
export async function createSignatureHeaders(
  agentId: string,
  privateKeyHex: string,
  body?: string,
): Promise<{ 'X-Agent-ID': string; 'X-Agent-Signature': string; 'X-Timestamp': string }> {
  const timestamp = Date.now().toString()
  const message = `${timestamp}:${body || ''}`
  return {
    'X-Agent-ID': agentId,
    'X-Agent-Signature': await signMessage(message, privateKeyHex),
    'X-Timestamp': timestamp,
  }
}

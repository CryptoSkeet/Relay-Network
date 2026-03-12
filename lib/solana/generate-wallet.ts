import { Keypair } from '@solana/web3.js'
import crypto from 'crypto'

/**
 * Generate a new Solana keypair for an agent
 * Returns both the public key (public) and encrypted private key (for storage)
 */
export function generateSolanaKeypair() {
  const keypair = Keypair.generate()
  const publicKey = keypair.publicKey.toString()
  const secretKey = keypair.secretKey
  
  // Generate encryption IV
  const iv = crypto.randomBytes(16)
  
  // Encrypt the secret key using AES-256-GCM
  const encryptionKey = crypto.scryptSync(
    process.env.SOLANA_WALLET_ENCRYPTION_KEY || 'default-key-change-in-production',
    'salt',
    32
  )
  
  const cipher = crypto.createCipheriv('aes-256-gcm', encryptionKey, iv)
  const encryptedSecretKey = Buffer.concat([
    cipher.update(secretKey),
    cipher.final()
  ])
  const authTag = cipher.getAuthTag()
  
  return {
    publicKey,
    encryptedPrivateKey: Buffer.concat([authTag, encryptedSecretKey]).toString('base64'),
    iv: iv.toString('base64'),
  }
}

/**
 * Decrypt a Solana private key for operations
 */
export function decryptSolanaPrivateKey(
  encryptedPrivateKey: string,
  iv: string
): Buffer {
  const encryptionKey = crypto.scryptSync(
    process.env.SOLANA_WALLET_ENCRYPTION_KEY || 'default-key-change-in-production',
    'salt',
    32
  )
  
  const encryptedBuffer = Buffer.from(encryptedPrivateKey, 'base64')
  const authTag = encryptedBuffer.slice(0, 16)
  const encrypted = encryptedBuffer.slice(16)
  const ivBuffer = Buffer.from(iv, 'base64')
  
  const decipher = crypto.createDecipheriv('aes-256-gcm', encryptionKey, ivBuffer)
  decipher.setAuthTag(authTag)
  
  return Buffer.concat([
    decipher.update(encrypted),
    decipher.final()
  ])
}

/**
 * Get Keypair object from encrypted storage
 */
export function getKeypairFromStorage(
  encryptedPrivateKey: string,
  iv: string
): Keypair {
  const secretKeyBuffer = decryptSolanaPrivateKey(encryptedPrivateKey, iv)
  return Keypair.fromSecretKey(new Uint8Array(secretKeyBuffer))
}

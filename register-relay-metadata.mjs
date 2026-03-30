#!/usr/bin/env node
/**
 * register-relay-metadata.mjs
 * Registers on-chain metadata (name, symbol, logo) for the RELAY SPL token
 * using the Metaplex Token Metadata program + Umi framework.
 *
 * Usage:
 *   node register-relay-metadata.mjs
 *
 * Requires:
 *   - RELAY_PAYER_SECRET_KEY in .env.local (JSON array of the mint-authority keypair)
 *   - NEXT_PUBLIC_RELAY_TOKEN_MINT in .env.local
 *   - @metaplex-foundation/mpl-token-metadata
 *   - @metaplex-foundation/umi
 *   - @metaplex-foundation/umi-bundle-defaults
 */

import dotenv from 'dotenv'
dotenv.config({ path: '.env' })
dotenv.config({ path: '.env.local', override: true })
import { createUmi } from '@metaplex-foundation/umi-bundle-defaults'
import { createV1, updateV1, fetchMetadataFromSeeds, mplTokenMetadata, TokenStandard } from '@metaplex-foundation/mpl-token-metadata'
import { keypairIdentity, publicKey, percentAmount } from '@metaplex-foundation/umi'

// ── Config ───────────────────────────────────────────────────────────────────
const CLUSTER_URL = 'https://api.devnet.solana.com'
const MINT_ADDRESS = process.env.NEXT_PUBLIC_RELAY_TOKEN_MINT
const PAYER_KEY = process.env.RELAY_PAYER_SECRET_KEY

if (!MINT_ADDRESS || !PAYER_KEY) {
  console.error('Missing NEXT_PUBLIC_RELAY_TOKEN_MINT or RELAY_PAYER_SECRET_KEY in .env.local')
  process.exit(1)
}

const secretKey = Uint8Array.from(JSON.parse(PAYER_KEY))

// ── Umi setup ────────────────────────────────────────────────────────────────
const umi = createUmi(CLUSTER_URL)
  .use(mplTokenMetadata())

const keypair = umi.eddsa.createKeypairFromSecretKey(secretKey)
umi.use(keypairIdentity(keypair))

const mint = publicKey(MINT_ADDRESS)

async function main() {
  const NEW_URI = 'https://raw.githubusercontent.com/CryptoSkeet/v0-ai-agent-instagram/main/public/relay-metadata.json'
  console.log('Mint:', MINT_ADDRESS)
  console.log('Payer:', keypair.publicKey)
  console.log('URI:', NEW_URI)

  // Fetch existing metadata to preserve creators
  const existing = await fetchMetadataFromSeeds(umi, { mint })

  const tx = await updateV1(umi, {
    mint,
    data: {
      ...existing,
      name: 'Relay',
      symbol: 'RELAY',
      uri: NEW_URI,
    },
    authority: umi.identity,
  }).sendAndConfirm(umi)

  console.log('✅ Metadata updated successfully!')
  console.log('Name:   Relay')
  console.log('Symbol: RELAY')
  console.log('URI:   ', NEW_URI)
  console.log('Tx sig:', Buffer.from(tx.signature).toString('base64'))
}

main().catch((err) => {
  console.error('❌ Failed:', err.message)
  process.exit(1)
})

#!/usr/bin/env node
/**
 * verify-kya-credential.mjs — standalone KYA credential verifier.
 *
 * Takes a handle or pubkey, derives the on-chain PDA, fetches it,
 * checks the program owner, and prints every credential field.
 *
 * Usage:
 *   SOLANA_CLUSTER=devnet node scripts/verify-kya-credential.mjs <handle-or-pubkey>
 *
 * Examples:
 *   node scripts/verify-kya-credential.mjs relay-agent-1
 *   node scripts/verify-kya-credential.mjs 7xKXtg2CW87d97TXJSDpbD5jBkheTqA83TZRuJosgAsU
 *
 * No dependencies beyond @solana/web3.js. No API calls. Pure on-chain read.
 */

import { Connection, PublicKey } from '@solana/web3.js'

// ── Config ──────────────────────────────────────────────────────────────────

const PROGRAM_ID = new PublicKey('Hkr85mHxBFZk9i3MeFu2YEj7ZPuhvPf3New4idiQTGMr')

const CLUSTER = (process.env.SOLANA_CLUSTER || 'devnet').trim().toLowerCase()
const RPC_URL = CLUSTER === 'mainnet' || CLUSTER === 'mainnet-beta'
  ? 'https://api.mainnet-beta.solana.com'
  : CLUSTER === 'testnet'
    ? 'https://api.testnet.solana.com'
    : 'https://api.devnet.solana.com'

// ── PDA derivation ──────────────────────────────────────────────────────────

function deriveProfilePDA(handle) {
  return PublicKey.findProgramAddressSync(
    [Buffer.from('profile'), Buffer.from(handle, 'utf8')],
    PROGRAM_ID,
  )
}

function deriveHandleLookupPDA(pubkey) {
  return PublicKey.findProgramAddressSync(
    [Buffer.from('handle-lookup'), pubkey.toBuffer()],
    PROGRAM_ID,
  )
}

// ── Account parsing ─────────────────────────────────────────────────────────

function readString(buf, offset) {
  const len = buf.readUInt32LE(offset)
  const start = offset + 4
  return { value: buf.subarray(start, start + len).toString('utf8'), next: start + len }
}

function parseAgentProfile(data) {
  const buf = data.subarray(8) // skip Anchor discriminator
  let o = 0

  const handle = readString(buf, o); o = handle.next
  const displayName = readString(buf, o); o = displayName.next
  const didPubkey = new PublicKey(buf.subarray(o, o + 32)); o += 32
  const wallet = new PublicKey(buf.subarray(o, o + 32)); o += 32
  const reputationScore = buf.readUInt32LE(o); o += 4
  const completedContracts = buf.readUInt32LE(o); o += 4
  const failedContracts = buf.readUInt32LE(o); o += 4
  const disputes = buf.readUInt32LE(o); o += 4
  const totalEarned = buf.readBigUInt64LE(o); o += 8
  const isVerified = buf.readUInt8(o) === 1; o += 1
  const isSuspended = buf.readUInt8(o) === 1; o += 1
  const permissions = buf.readUInt8(o); o += 1
  const fulfilledContracts = buf.readBigUInt64LE(o); o += 8
  const totalContracts = buf.readBigUInt64LE(o); o += 8
  const profileHash = buf.subarray(o, o + 32).toString('hex'); o += 32
  const createdAt = Number(buf.readBigInt64LE(o)); o += 8
  const updatedAt = Number(buf.readBigInt64LE(o)); o += 8
  const version = buf.readBigUInt64LE(o); o += 8
  const bump = buf.readUInt8(o)

  return {
    handle: handle.value,
    displayName: displayName.value,
    didPubkey: didPubkey.toBase58(),
    wallet: wallet.toBase58(),
    reputationScore,
    completedContracts,
    failedContracts,
    disputes,
    totalEarned: totalEarned.toString(),
    isVerified,
    isSuspended,
    permissions,
    permissionFlags: {
      read: (permissions & 0x01) !== 0,
      write: (permissions & 0x02) !== 0,
      transact: (permissions & 0x04) !== 0,
    },
    fulfilledContracts: Number(fulfilledContracts),
    totalContracts: Number(totalContracts),
    fulfillmentRate: totalContracts > 0n
      ? (Number(fulfilledContracts) / Number(totalContracts) * 100).toFixed(1) + '%'
      : 'N/A (no contracts)',
    profileHash,
    createdAt: new Date(createdAt * 1000).toISOString(),
    updatedAt: new Date(updatedAt * 1000).toISOString(),
    version: version.toString(),
    bump,
  }
}

function parseHandleLookup(data) {
  const buf = data.subarray(8)
  const didPubkey = new PublicKey(buf.subarray(0, 32))
  const handle = readString(buf, 32)
  return { didPubkey: didPubkey.toBase58(), handle: handle.value }
}

// ── Input detection ─────────────────────────────────────────────────────────

function isBase58Pubkey(input) {
  try {
    const pk = new PublicKey(input)
    return pk.toBase58() === input
  } catch {
    return false
  }
}

// ── Main ────────────────────────────────────────────────────────────────────

async function main() {
  const input = process.argv[2]
  if (!input) {
    console.error('Usage: node scripts/verify-kya-credential.mjs <handle-or-pubkey>')
    process.exit(1)
  }

  const conn = new Connection(RPC_URL, 'confirmed')
  console.log(`\nCluster: ${CLUSTER}`)
  console.log(`RPC:     ${RPC_URL}`)
  console.log(`Program: ${PROGRAM_ID.toBase58()}\n`)

  let handle
  let lookupInfo = null

  if (isBase58Pubkey(input)) {
    // Pubkey path: two reads
    console.log(`Input type: pubkey`)
    console.log(`Resolving handle via lookup PDA...`)
    const pubkey = new PublicKey(input)
    const [lookupPda] = deriveHandleLookupPDA(pubkey)
    console.log(`  Lookup PDA: ${lookupPda.toBase58()}`)

    const info = await conn.getAccountInfo(lookupPda)
    if (!info) {
      console.error(`\nNo lookup PDA found for pubkey ${input}.`)
      console.error(`This agent either doesn't exist on Relay or hasn't had its profile mirrored on-chain.`)
      process.exit(1)
    }

    // Verify program owner
    if (!info.owner.equals(PROGRAM_ID)) {
      console.error(`\nLOOKUP VERIFICATION FAILED`)
      console.error(`  Account owner: ${info.owner.toBase58()}`)
      console.error(`  Expected:      ${PROGRAM_ID.toBase58()}`)
      console.error(`  This account was NOT written by the Relay Agent Profile program.`)
      process.exit(1)
    }

    lookupInfo = parseHandleLookup(info.data)
    handle = lookupInfo.handle
    console.log(`  Resolved handle: "${handle}"`)
    console.log(`  Lookup PDA owner matches program ID: YES\n`)
  } else {
    // Handle path: one read
    console.log(`Input type: handle`)
    handle = input
  }

  // Fetch profile PDA
  const [profilePda] = deriveProfilePDA(handle)
  console.log(`Profile PDA: ${profilePda.toBase58()}`)

  const profileInfo = await conn.getAccountInfo(profilePda)
  if (!profileInfo) {
    console.error(`\nNo profile PDA found for handle "${handle}".`)
    process.exit(1)
  }

  // Verify program owner — this is the critical check
  if (!profileInfo.owner.equals(PROGRAM_ID)) {
    console.error(`\nPROFILE VERIFICATION FAILED`)
    console.error(`  Account owner: ${profileInfo.owner.toBase58()}`)
    console.error(`  Expected:      ${PROGRAM_ID.toBase58()}`)
    console.error(`  This account was NOT written by the Relay Agent Profile program.`)
    console.error(`  DO NOT trust the data in this account.`)
    process.exit(1)
  }

  console.log(`Account owner matches program ID: YES`)
  console.log(`Account size: ${profileInfo.data.length} bytes\n`)

  // Parse and display
  const profile = parseAgentProfile(profileInfo.data)

  console.log(`── KYA Credential ──────────────────────────────────────`)
  console.log(`  Handle:              ${profile.handle}`)
  console.log(`  Display Name:        ${profile.displayName}`)
  console.log(`  DID Pubkey:          ${profile.didPubkey}`)
  console.log(`  Wallet:              ${profile.wallet}`)
  console.log(`  Reputation Score:    ${profile.reputationScore} / 10000 (${(profile.reputationScore / 100).toFixed(1)}%)`)
  console.log(`  Fulfilled:           ${profile.fulfilledContracts} / ${profile.totalContracts} (${profile.fulfillmentRate})`)
  console.log(`  Completed Contracts: ${profile.completedContracts}`)
  console.log(`  Failed Contracts:    ${profile.failedContracts}`)
  console.log(`  Disputes:            ${profile.disputes}`)
  console.log(`  Total Earned:        ${profile.totalEarned} RELAY (base units)`)
  console.log(`  Verified:            ${profile.isVerified}`)
  console.log(`  Suspended:           ${profile.isSuspended}`)
  console.log(`  Permissions:         0x${profile.permissions.toString(16).padStart(2, '0')} (R:${profile.permissionFlags.read} W:${profile.permissionFlags.write} T:${profile.permissionFlags.transact})`)
  console.log(`  Profile Hash:        ${profile.profileHash}`)
  console.log(`  Created:             ${profile.createdAt}`)
  console.log(`  Updated:             ${profile.updatedAt}`)
  console.log(`  Version:             ${profile.version}`)
  console.log(`────────────────────────────────────────────────────────`)
  console.log(`\nVerification: PASSED`)
  console.log(`  The account is owned by the Relay Agent Profile program.`)
  console.log(`  The data above is on-chain state written by the program authority.\n`)

  // Solscan link
  const suffix = CLUSTER === 'mainnet-beta' ? '' : `?cluster=${CLUSTER}`
  console.log(`Solscan: https://solscan.io/account/${profilePda.toBase58()}${suffix}`)
}

main().catch(err => {
  console.error('Error:', err.message)
  process.exit(1)
})

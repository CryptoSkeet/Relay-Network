/**
 * Phase 3 — Bootstrap v1 staking on devnet.
 *
 *   1. initialize_stake_vault    (admin one-shot)
 *   2. Mint 1000 RELAY → agent1 ATA, 1000 RELAY → agent2 ATA
 *      (skip if balance already >= MIN_STAKE)
 *   3. stake_existing_agent for agent1, agent2
 *
 * Idempotent: each step probes on-chain state and skips if already done.
 */
import { createHash } from 'node:crypto'
import { readFileSync } from 'node:fs'
import { resolve } from 'node:path'
import {
  Connection,
  Keypair,
  PublicKey,
  SystemProgram,
  SYSVAR_RENT_PUBKEY,
  Transaction,
  TransactionInstruction,
} from '@solana/web3.js'
import {
  TOKEN_PROGRAM_ID,
  ASSOCIATED_TOKEN_PROGRAM_ID,
  getAssociatedTokenAddressSync,
  createAssociatedTokenAccountInstruction,
  createMintToInstruction,
  getAccount,
} from '@solana/spl-token'

const RPC = process.env.SOLANA_RPC_URL || 'https://api.devnet.solana.com'
const PROGRAM_ID = new PublicKey('Hs1hX4pSZSAQKLgGrcydyEaJMsJfqXQqJyJvVnqdaoDE')
const RELAY_MINT = new PublicKey('C2RqcjvrN4JEPidkf8qBSYzujFmL99rHhmmE8k1kfRzZ')
const MIN_STAKE = 1_000n * 1_000_000n // 1000 RELAY (6 decimals) = 1_000_000_000

function loadEnv(file) {
  try {
    for (const line of readFileSync(file, 'utf8').split(/\r?\n/)) {
      const m = line.match(/^([A-Z0-9_]+)\s*=\s*(.*)$/)
      if (!m) continue
      let [, k, v] = m
      v = v.trim().replace(/^["']|["']$/g, '')
      if (!process.env[k]) process.env[k] = v
    }
  } catch {}
}
loadEnv(resolve('.env.local'))

const anchorDisc = (n) => createHash('sha256').update(`global:${n}`).digest().subarray(0, 8)

function loadKeypairFile(p) {
  return Keypair.fromSecretKey(Uint8Array.from(JSON.parse(readFileSync(p, 'utf8'))))
}

function deriveStakeVaultPda() {
  return PublicKey.findProgramAddressSync([Buffer.from('stake-vault')], PROGRAM_ID)[0]
}
function deriveAgentStakePda(authority) {
  return PublicKey.findProgramAddressSync(
    [Buffer.from('agent-stake'), authority.toBuffer()], PROGRAM_ID,
  )[0]
}
function deriveAgentProfilePda(authority) {
  return PublicKey.findProgramAddressSync(
    [Buffer.from('agent-profile'), authority.toBuffer()], PROGRAM_ID,
  )[0]
}

async function sendTx(conn, ixs, signers) {
  const tx = new Transaction()
  for (const ix of ixs) tx.add(ix)
  tx.feePayer = signers[0].publicKey
  tx.recentBlockhash = (await conn.getLatestBlockhash('confirmed')).blockhash
  tx.sign(...signers)
  const sig = await conn.sendRawTransaction(tx.serialize(), { skipPreflight: false })
  await conn.confirmTransaction(sig, 'confirmed')
  return sig
}

function buildInitializeStakeVaultIx(admin) {
  const data = Buffer.from(anchorDisc('initialize_stake_vault'))
  return new TransactionInstruction({
    programId: PROGRAM_ID,
    keys: [
      { pubkey: admin,                       isSigner: true,  isWritable: true  },
      { pubkey: RELAY_MINT,                  isSigner: false, isWritable: false },
      { pubkey: deriveStakeVaultPda(),       isSigner: false, isWritable: true  },
      { pubkey: TOKEN_PROGRAM_ID,            isSigner: false, isWritable: false },
      { pubkey: SystemProgram.programId,     isSigner: false, isWritable: false },
      { pubkey: SYSVAR_RENT_PUBKEY,          isSigner: false, isWritable: false },
    ],
    data,
  })
}

function buildStakeExistingAgentIx(authority, payer) {
  const ata = getAssociatedTokenAddressSync(RELAY_MINT, authority)
  return new TransactionInstruction({
    programId: PROGRAM_ID,
    keys: [
      { pubkey: authority,                   isSigner: true,  isWritable: true  },
      { pubkey: payer,                       isSigner: true,  isWritable: true  },
      { pubkey: ata,                         isSigner: false, isWritable: true  },
      { pubkey: deriveStakeVaultPda(),       isSigner: false, isWritable: true  },
      { pubkey: deriveAgentProfilePda(authority), isSigner: false, isWritable: false },
      { pubkey: deriveAgentStakePda(authority),   isSigner: false, isWritable: true  },
      { pubkey: TOKEN_PROGRAM_ID,            isSigner: false, isWritable: false },
      { pubkey: SystemProgram.programId,     isSigner: false, isWritable: false },
      { pubkey: SYSVAR_RENT_PUBKEY,          isSigner: false, isWritable: false },
    ],
    data: Buffer.from(anchorDisc('stake_existing_agent')),
  })
}

async function ensureAtaAndBalance(conn, admin, owner) {
  const ata = getAssociatedTokenAddressSync(RELAY_MINT, owner)
  const ixs = []
  let balance = 0n
  try {
    const acc = await getAccount(conn, ata, 'confirmed')
    balance = acc.amount
  } catch {
    console.log(`  • creating ATA ${ata.toBase58()} for ${owner.toBase58()}`)
    ixs.push(createAssociatedTokenAccountInstruction(admin.publicKey, ata, owner, RELAY_MINT))
  }
  if (balance < MIN_STAKE) {
    const need = MIN_STAKE - balance
    console.log(`  • minting ${need} RELAY (raw) to ${ata.toBase58()}`)
    ixs.push(createMintToInstruction(RELAY_MINT, ata, admin.publicKey, Number(need)))
  } else {
    console.log(`  • ATA balance OK: ${balance} (>= ${MIN_STAKE})`)
  }
  if (ixs.length) {
    const sig = await sendTx(conn, ixs, [admin])
    console.log(`  ✔ ata/mint tx: ${sig}`)
  }
  return ata
}

async function main() {
  const conn = new Connection(RPC, 'confirmed')
  const admin = loadKeypairFile(resolve(process.env.USERPROFILE + '/.config/solana/id.json'))
  console.log(`admin / mint authority: ${admin.publicKey.toBase58()}`)

  // 1. initialize_stake_vault — skip if PDA already a token account.
  const vaultPda = deriveStakeVaultPda()
  console.log(`\n=== STEP 1: initialize_stake_vault ===`)
  console.log(`  vault PDA: ${vaultPda.toBase58()}`)
  const vaultInfo = await conn.getAccountInfo(vaultPda, 'confirmed')
  if (vaultInfo) {
    console.log(`  ✔ already initialized (owner: ${vaultInfo.owner.toBase58()})`)
  } else {
    const sig = await sendTx(conn, [buildInitializeStakeVaultIx(admin.publicKey)], [admin])
    console.log(`  ✔ initialized: ${sig}`)
  }

  // 2 + 3. For each agent: ensure ATA funded; then stake_existing_agent if AgentStake missing.
  const agents = []
  // agent1 = main keypair
  agents.push({ name: 'agent1 (admin)', kp: admin })
  // agent2 from .keys
  const a2Path = resolve('.keys/agent2.json')
  agents.push({ name: 'agent2', kp: loadKeypairFile(a2Path) })

  for (const { name, kp } of agents) {
    console.log(`\n=== ${name}: ${kp.publicKey.toBase58()} ===`)

    // Profile must exist (these are pre-v1 agents).
    const profPda = deriveAgentProfilePda(kp.publicKey)
    const prof = await conn.getAccountInfo(profPda, 'confirmed')
    if (!prof) {
      console.log(`  ✗ no AgentProfile at ${profPda.toBase58()} — skipping (use stake_and_register instead)`)
      continue
    }

    // Ensure ATA + balance >= MIN_STAKE.
    await ensureAtaAndBalance(conn, admin, kp.publicKey)

    // AgentStake exists?
    const stakePda = deriveAgentStakePda(kp.publicKey)
    const stakeInfo = await conn.getAccountInfo(stakePda, 'confirmed')
    if (stakeInfo) {
      console.log(`  ✔ AgentStake already exists at ${stakePda.toBase58()}`)
      continue
    }

    // Stake.
    console.log(`  → stake_existing_agent`)
    const ix = buildStakeExistingAgentIx(kp.publicKey, admin.publicKey)
    const signers = kp.publicKey.equals(admin.publicKey) ? [admin] : [admin, kp]
    const sig = await sendTx(conn, [ix], signers)
    console.log(`  ✔ stake tx: ${sig}`)
    console.log(`     AgentStake PDA: ${stakePda.toBase58()}`)
  }

  console.log('\n✅ bootstrap complete')
}

main().catch((e) => {
  console.error(e)
  process.exit(1)
})

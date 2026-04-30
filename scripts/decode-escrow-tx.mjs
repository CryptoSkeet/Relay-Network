import { Connection, clusterApiUrl } from '@solana/web3.js'
const sig = '5gcQAGbDV6qrSA8uLServzxfw3pgHVQJn3GQ6kcgmJAuKNYwFeJb8curZDBMopGax77uhu2L3FWHWvUPM1XNKLZu'
const c = new Connection(clusterApiUrl('devnet'), 'confirmed')
const tx = await c.getParsedTransaction(sig, { commitment: 'finalized', maxSupportedTransactionVersion: 0 })
if (!tx) { console.log('not found'); process.exit(1) }
const keys = tx.transaction.message.accountKeys
console.log('--- ACCOUNTS ---')
keys.forEach((k, i) => {
  console.log(String(i).padStart(2), k.pubkey.toBase58(), k.signer ? 'SIGNER' : '      ', k.writable ? 'WRITE' : 'READ ')
})
console.log('\n--- PRE TOKEN BALANCES ---')
for (const b of tx.meta?.preTokenBalances || []) {
  const acct = keys[b.accountIndex].pubkey.toBase58()
  console.log('idx', b.accountIndex, 'acct', acct, 'owner', b.owner, 'amount', b.uiTokenAmount.uiAmountString)
}
console.log('\n--- POST TOKEN BALANCES ---')
for (const b of tx.meta?.postTokenBalances || []) {
  const acct = keys[b.accountIndex].pubkey.toBase58()
  console.log('idx', b.accountIndex, 'acct', acct, 'owner', b.owner, 'amount', b.uiTokenAmount.uiAmountString)
}
console.log('\n--- INSTRUCTIONS (top-level) ---')
tx.transaction.message.instructions.forEach((ix, i) => {
  console.log(`ix#${i} program=${'programId' in ix ? ix.programId.toBase58() : 'parsed'}`)
  if ('accounts' in ix) {
    ix.accounts.forEach((a, j) => console.log('  acct', j, a.toBase58()))
  }
})

/**
 * scripts/x402-test-payment.ts
 *
 * Trigger a real on-chain x402 payment against the live Relay reputation
 * endpoint. The successful settlement bootstraps discovery on aggregators
 * like agentic.market.
 *
 * Usage:
 *   1. Fund a Solana mainnet wallet with:
 *        - ≥0.005 SOL (for tx fees + ATA rent if needed)
 *        - ≥0.001 USDC (mint EPjFWdd5AufqSSqeM2qN1xzybapC8G4wEGGkZwyTDt1v)
 *   2. Export its secret key as either:
 *        - X402_TEST_SK_BASE58="<base58 secret key>"  (Phantom export format)
 *        - X402_TEST_SK_JSON="[12,34,...]"           (solana-keygen array)
 *        - X402_TEST_SK_PATH="C:\Users\you\.config\solana\id.json"
 *   3. Optional: X402_TEST_RPC="https://your-helius-or-quicknode-mainnet-rpc"
 *      (defaults to https://api.mainnet-beta.solana.com which is rate-limited)
 *   4. pnpm tsx scripts/x402-test-payment.ts
 */

import fs from 'node:fs'
import bs58 from 'bs58'
import { wrapFetchWithPayment, x402Client } from '@x402/fetch'
import { ExactSvmScheme, toClientSvmSigner } from '@x402/svm'
import { createKeyPairSignerFromBytes } from '@solana/kit'

const ENDPOINT =
  process.env.X402_TEST_URL ??
  'https://relaynetwork.ai/api/v1/agents/relay-genesis/reputation'

function loadSecretKeyBytes(): Uint8Array {
  const b58 = process.env.X402_TEST_SK_BASE58
  if (b58) return bs58.decode(b58.trim())

  const json = process.env.X402_TEST_SK_JSON
  if (json) return Uint8Array.from(JSON.parse(json) as number[])

  const path = process.env.X402_TEST_SK_PATH
  if (path) {
    const raw = fs.readFileSync(path, 'utf8')
    return Uint8Array.from(JSON.parse(raw) as number[])
  }

  throw new Error(
    'No secret key provided. Set X402_TEST_SK_BASE58, X402_TEST_SK_JSON, or X402_TEST_SK_PATH.',
  )
}

async function main() {
  console.log('🔧 Loading signer...')
  const sk = loadSecretKeyBytes()
  const kitSigner = await createKeyPairSignerFromBytes(sk)
  console.log('   payer:', kitSigner.address)

  const svmSigner = toClientSvmSigner(kitSigner)

  const client = new x402Client()
    .registerV1('solana', new ExactSvmScheme(svmSigner))
    .register('solana:5eykt4UsFv8P8NJdTREpY1vzqKqZKvdp', new ExactSvmScheme(svmSigner))
  const fetchWithPay = wrapFetchWithPayment(fetch as any, client)

  console.log('🌐 GET (unpaid) to inspect 402 ...')
  const probe = await fetch(ENDPOINT)
  console.log('   status:', probe.status)
  console.log('   accepts:', JSON.stringify(JSON.parse(await probe.text()).accepts[0], null, 2))

  console.log('💸 Retrying with payment...')
  const res = await fetchWithPay(ENDPOINT)
  console.log('   status:', res.status)
  console.log('   x-payment-response:', res.headers.get('x-payment-response'))
  const body = await res.text()
  console.log('   body:', body.slice(0, 600))

  const paymentResp = res.headers.get('x-payment-response')
  if (paymentResp) {
    try {
      const decoded = JSON.parse(Buffer.from(paymentResp, 'base64').toString('utf8'))
      console.log('\n✅ Settlement decoded:')
      console.log(JSON.stringify(decoded, null, 2))
      if (decoded.transaction || decoded.txHash || decoded.signature) {
        const sig = decoded.transaction ?? decoded.txHash ?? decoded.signature
        console.log(`\n🔗 Solscan: https://solscan.io/tx/${sig}`)
      }
    } catch {
      console.log('   (settlement header not base64 JSON)')
    }
  }
}

main().catch((e) => {
  console.error('❌', e)
  process.exit(1)
})

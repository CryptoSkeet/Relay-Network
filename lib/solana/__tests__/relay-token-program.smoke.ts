import {
  USES_TOKEN_2022,
  TOKEN_PROGRAM_ADDRESS,
  RELAY_MINT,
  RELAY_DECIMALS,
  deriveRelayAta,
  fetchRelayTokenAccount,
} from '../relay-token-program'
import { getRpc } from '../rpc'
import { address, type Address } from '@solana/kit'

async function main() {
  console.log('USES_TOKEN_2022:', USES_TOKEN_2022)
  console.log('PROGRAM:        ', TOKEN_PROGRAM_ADDRESS)
  console.log('MINT:           ', RELAY_MINT)
  console.log('DECIMALS:       ', RELAY_DECIMALS)

  const treasury = address('GafmHBZRd4VkAA3eAirKWfYvwfDTGoPwaF4vffemwZkV')
  const ata = await deriveRelayAta(treasury)
  console.log('treasury ATA:   ', ata)

  // Inline mint verification (replaces assertRelayMintMatchesEnv).
  const rpc = getRpc()
  const info = await rpc.getAccountInfo(RELAY_MINT, { encoding: 'jsonParsed' }).send()
  const value = info.value
  if (!value) throw new Error(`mint ${RELAY_MINT} not found`)
  if ((value.owner as Address) !== TOKEN_PROGRAM_ADDRESS) {
    throw new Error(`owner mismatch: ${value.owner} != ${TOKEN_PROGRAM_ADDRESS}`)
  }
  const onChainDecimals = (value.data as any)?.parsed?.info?.decimals
  if (onChainDecimals !== RELAY_DECIMALS) {
    throw new Error(`decimals mismatch: on-chain=${onChainDecimals} env=${RELAY_DECIMALS}`)
  }
  console.log('on-chain decimals OK:', onChainDecimals)

  // Round-trip the new fetchRelayTokenAccount helper against the treasury ATA.
  const acct = await fetchRelayTokenAccount(ata)
  console.log('treasury ATA state:  ', acct === null ? 'missing' : `amount=${acct.amount}`)
}

main().catch((e) => {
  console.error('ERR', e?.message ?? e)
  process.exit(1)
})

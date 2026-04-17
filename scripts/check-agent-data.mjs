import { readFileSync } from 'fs'
const env = readFileSync('.env.local', 'utf8')
const url = env.match(/NEXT_PUBLIC_SUPABASE_URL="?([^"\n]+)/)?.[1]
const key = env.match(/SUPABASE_SERVICE_ROLE_KEY="?([^"\n]+)/)?.[1]

async function q(table, params = '') {
  const r = await fetch(`${url}/rest/v1/${table}?${params}`, {
    headers: { apikey: key, Authorization: `Bearer ${key}` }
  })
  if (!r.ok) return { error: r.status }
  return await r.json()
}

async function main() {
  // Find test555
  const agents = await q('agents', 'handle=eq.test555&select=id,handle,display_name')
  console.log('Agent:', JSON.stringify(agents))
  if (!agents.length) { console.log('Agent not found'); return }
  const id = agents[0].id

  // Check each data source
  const wallet = await q('wallets', `agent_id=eq.${id}&select=id,balance,staked_balance,locked_balance,lifetime_earned`)
  console.log('Wallet:', JSON.stringify(wallet))

  const identity = await q('agent_identities', `agent_id=eq.${id}&select=id,did,verification_tier`)
  console.log('Identity:', JSON.stringify(identity))

  const reputation = await q('agent_reputation', `agent_id=eq.${id}&select=id,reputation_score,completed_contracts`)
  console.log('Reputation:', JSON.stringify(reputation))

  const contracts = await q('contracts', `or=(client_id.eq.${id},provider_id.eq.${id})&select=id,title,status&limit=5`)
  console.log('Contracts:', JSON.stringify(contracts))

  const businesses = await q('businesses', `founder_id=eq.${id}&select=id,name&limit=5`)
  console.log('Businesses:', JSON.stringify(businesses))

  if (wallet.length) {
    const txs = await q('wallet_transactions', `wallet_id=eq.${wallet[0].id}&select=id,type,amount&limit=5`)
    console.log('Transactions:', JSON.stringify(txs))
  }

  const endorsements = await q('peer_endorsements', `endorsed_id=eq.${id}&select=id,message&limit=5`)
  console.log('Endorsements:', JSON.stringify(endorsements))
}
main()

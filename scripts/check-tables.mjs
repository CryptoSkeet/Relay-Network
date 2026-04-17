// Quick check which tables exist via Supabase REST
import { readFileSync } from 'fs'
const env = readFileSync('.env.local', 'utf8')
const url = env.match(/NEXT_PUBLIC_SUPABASE_URL="?([^"\n]+)/)?.[1]
const key = env.match(/SUPABASE_SERVICE_ROLE_KEY="?([^"\n]+)/)?.[1]

const tables = [
  'agents', 'posts', 'follows', 'wallets', 'wallet_transactions',
  'contracts', 'businesses', 'business_shareholders', 'agent_identities',
  'agent_reputation', 'peer_endorsements', 'transactions', 'reviews',
  'agent_applications', 'standing_offers', 'hiring_profiles',
  'comments', 'post_reactions', 'notifications', 'conversations',
  'messages', 'agent_online_status', 'agent_heartbeats',
  'stakes', 'token_supply', 'trending_topics'
]

async function main() {
  for (const t of tables) {
    const r = await fetch(`${url}/rest/v1/${t}?select=*&limit=0`, {
      headers: { apikey: key, Authorization: `Bearer ${key}` }
    })
    console.log(`${t}: ${r.status === 200 ? 'OK' : `FAIL ${r.status}`}`)
  }
}
main()

import { withX402 } from '@x402/next'
import { NextRequest } from 'next/server'
import { createClient } from '@/lib/supabase/client'

export const GET = withX402(
  async (req: NextRequest) => {
    // Extract handle from URL
    const urlParts = req.url.split('/')
    const handle = urlParts[urlParts.length - 3]
    // Fetch reputation from Supabase
    const supabase = createClient()
    const { data, error } = await supabase
      .from('agent_reputation_view')
      .select('score,completed_contracts')
      .eq('handle', handle)
      .single()
    if (error) {
      return new Response(JSON.stringify({ error: error.message }), { status: 404 })
    }
    return new Response(
      JSON.stringify({ handle, score: data?.score ?? 0, contracts: data?.completed_contracts ?? 0 }),
      {
        status: 200,
        headers: {
          'x-bazaar-name': 'Relay Agent Reputation',
          'x-bazaar-description': 'On-chain reputation score for verified Relay agents',
          'x-bazaar-category': 'Social',
          'x-bazaar-pricing': '0.001 USDC per call',
          'Content-Type': 'application/json',
        },
      }
    )
  },
  {
    amount: 0.001, // USDC
    network: 'base',
    description: 'Relay agent reputation lookup',
  }
)

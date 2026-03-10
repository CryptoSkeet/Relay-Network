import { createClient } from '@/lib/supabase/server'
import { type NextRequest, NextResponse } from 'next/server'

// Generate a new wallet for an agent
export async function POST(request: NextRequest) {
  try {
    const supabase = await createClient()
    const body = await request.json()
    const { agent_id } = body

    if (!agent_id) {
      return NextResponse.json({ error: 'Agent ID is required' }, { status: 400 })
    }

    // Check if agent exists
    const { data: agent, error: agentError } = await supabase
      .from('agents')
      .select('id, handle, display_name')
      .eq('id', agent_id)
      .single()

    if (agentError || !agent) {
      return NextResponse.json({ error: 'Agent not found' }, { status: 404 })
    }

    // Check if wallet already exists
    const { data: existingWallet } = await supabase
      .from('wallets')
      .select('id')
      .eq('agent_id', agent_id)
      .single()

    if (existingWallet) {
      return NextResponse.json({ error: 'Wallet already exists for this agent' }, { status: 400 })
    }

    // Generate wallet with welcome bonus
    const welcomeBonus = 1000 // 1000 RELAY tokens for new agents

    const { data: wallet, error: walletError } = await supabase
      .from('wallets')
      .insert({
        agent_id,
        balance: welcomeBonus,
        currency: 'RELAY',
        staked_balance: 0,
        locked_balance: 0,
      })
      .select()
      .single()

    if (walletError) {
      console.error('Wallet creation error:', walletError)
      return NextResponse.json({ error: 'Failed to create wallet' }, { status: 500 })
    }

    return NextResponse.json({
      success: true,
      wallet,
      message: `Wallet created for @${agent.handle} with ${welcomeBonus} RELAY welcome bonus!`
    })
  } catch (error) {
    console.error('Wallet generation error:', error)
    return NextResponse.json({ error: 'Internal server error' }, { status: 500 })
  }
}

// Get wallet for an agent
export async function GET(request: NextRequest) {
  try {
    const supabase = await createClient()
    const { searchParams } = new URL(request.url)
    const agentId = searchParams.get('agent_id')

    if (!agentId) {
      return NextResponse.json({ error: 'Agent ID is required' }, { status: 400 })
    }

    const { data: wallet, error } = await supabase
      .from('wallets')
      .select('*')
      .eq('agent_id', agentId)
      .single()

    if (error) {
      return NextResponse.json({ error: 'Wallet not found' }, { status: 404 })
    }

    return NextResponse.json({ wallet })
  } catch (error) {
    console.error('Fetch wallet error:', error)
    return NextResponse.json({ error: 'Internal server error' }, { status: 500 })
  }
}

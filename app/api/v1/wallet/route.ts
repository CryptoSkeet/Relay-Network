import { NextRequest, NextResponse } from 'next/server'
import { createClient } from '@/lib/supabase/server'

// GET /v1/wallet - Get wallet for an agent
export async function GET(request: NextRequest) {
  const supabase = await createClient()

  try {
    const { searchParams } = new URL(request.url)
    const agentId = searchParams.get('agent_id')

    if (!agentId) {
      return NextResponse.json(
        { success: false, error: 'agent_id is required' },
        { status: 400 }
      )
    }

    // Get or create wallet for agent
    let { data: wallet, error } = await supabase
      .from('wallets')
      .select('*')
      .eq('agent_id', agentId)
      .single()

    if (error && error.code === 'PGRST116') {
      const { data: newWallet, error: createError } = await supabase
        .from('wallets')
        .insert({ agent_id: agentId })
        .select()
        .single()

      if (createError) throw createError
      wallet = newWallet
    } else if (error) {
      throw error
    }

    // Get recent transactions (last 30 days) from the transactions table
    const thirtyDaysAgo = new Date()
    thirtyDaysAgo.setDate(thirtyDaysAgo.getDate() - 30)

    const { data: transactions } = await supabase
      .from('transactions')
      .select('*')
      .or(`from_agent_id.eq.${agentId},to_agent_id.eq.${agentId}`)
      .gte('created_at', thirtyDaysAgo.toISOString())
      .order('created_at', { ascending: false })
      .limit(100)

    return NextResponse.json({
      success: true,
      data: {
        wallet,
        transactions: transactions || [],
      }
    })
  } catch (error) {
    console.error('Wallet GET error:', error)
    return NextResponse.json(
      { success: false, error: 'Failed to fetch wallet' },
      { status: 500 }
    )
  }
}

// POST /v1/wallet/transaction - Record a transaction and update balance
export async function POST(request: NextRequest) {
  const supabase = await createClient()

  try {
    const body = await request.json()
    const { wallet_id, type, amount, description, reference_id } = body

    if (!wallet_id || !type || amount === undefined) {
      return NextResponse.json(
        { success: false, error: 'wallet_id, type, and amount are required' },
        { status: 400 }
      )
    }

    // Get current wallet
    const { data: wallet, error: walletError } = await supabase
      .from('wallets')
      .select('*')
      .eq('id', wallet_id)
      .single()

    if (walletError) {
      return NextResponse.json(
        { success: false, error: 'Wallet not found' },
        { status: 404 }
      )
    }

    const txAmount = parseFloat(amount)
    let newBalance      = parseFloat(wallet.balance)       || 0
    let newStaked       = parseFloat(wallet.staked_balance) || 0
    let newLocked       = parseFloat(wallet.locked_balance) || 0
    let newLifetimeEarned = parseFloat(wallet.lifetime_earned) || 0
    let newLifetimeSpent  = parseFloat(wallet.lifetime_spent)  || 0

    switch (type) {
      case 'earned':
      case 'purchased':
      case 'bonus':
        newBalance += txAmount
        newLifetimeEarned += txAmount
        break
      case 'spent':
      case 'withdrawn':
        if (newBalance < txAmount) {
          return NextResponse.json(
            { success: false, error: 'Insufficient balance' },
            { status: 400 }
          )
        }
        newBalance -= txAmount
        newLifetimeSpent += txAmount
        break
      case 'staked':
        if (newBalance < txAmount) {
          return NextResponse.json(
            { success: false, error: 'Insufficient balance for staking' },
            { status: 400 }
          )
        }
        newBalance -= txAmount
        newStaked  += txAmount
        break
      case 'unstaked':
        if (newStaked < txAmount) {
          return NextResponse.json(
            { success: false, error: 'Insufficient staked balance' },
            { status: 400 }
          )
        }
        newStaked  -= txAmount
        newBalance += txAmount
        break
      case 'locked':
        if (newBalance < txAmount) {
          return NextResponse.json(
            { success: false, error: 'Insufficient balance for escrow' },
            { status: 400 }
          )
        }
        newBalance -= txAmount
        newLocked  += txAmount
        break
      case 'released':
        newLocked  -= txAmount
        newBalance += txAmount
        break
    }

    // Update wallet
    const { error: updateError } = await supabase
      .from('wallets')
      .update({
        balance:          newBalance,
        staked_balance:   newStaked,
        locked_balance:   newLocked,
        lifetime_earned:  newLifetimeEarned,
        lifetime_spent:   newLifetimeSpent,
        updated_at:       new Date().toISOString()
      })
      .eq('id', wallet_id)

    if (updateError) throw updateError

    // Record in transactions table
    const { data: transaction, error: txError } = await supabase
      .from('transactions')
      .insert({
        to_agent_id:  wallet.agent_id,
        amount:       txAmount,
        currency:     'RELAY',
        type:         ['earned','purchased','bonus'].includes(type) ? 'payment' : type === 'staked' ? 'stake' : type === 'unstaked' ? 'unstake' : 'payment',
        status:       'completed',
        description:  description ?? `${type}: ${txAmount} RELAY`,
        tx_hash:      reference_id ?? null,
      })
      .select()
      .single()

    if (txError) throw txError

    return NextResponse.json({
      success: true,
      data: {
        transaction,
        wallet: {
          balance:        newBalance,
          staked_balance: newStaked,
          locked_balance: newLocked,
        }
      }
    })
  } catch (error) {
    console.error('Wallet POST error:', error)
    return NextResponse.json(
      { success: false, error: 'Failed to process transaction' },
      { status: 500 }
    )
  }
}

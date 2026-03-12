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
      // Wallet doesn't exist, create one
      const { data: newWallet, error: createError } = await supabase
        .from('wallets')
        .insert({ agent_id: agentId })
        .select()
        .single()
      
      if (createError) {
        throw createError
      }
      wallet = newWallet
    } else if (error) {
      throw error
    }
    
    // Get recent transactions (last 30 days)
    const thirtyDaysAgo = new Date()
    thirtyDaysAgo.setDate(thirtyDaysAgo.getDate() - 30)
    
    const { data: transactions } = await supabase
      .from('wallet_transactions')
      .select('*')
      .eq('wallet_id', wallet.id)
      .gte('created_at', thirtyDaysAgo.toISOString())
      .order('created_at', { ascending: false })
      .limit(100)
    
    // Get active stakes
    const { data: stakes } = await supabase
      .from('stakes')
      .select('*')
      .eq('wallet_id', wallet.id)
      .eq('is_active', true)
    
    // Get daily bonuses for today
    const today = new Date().toISOString().split('T')[0]
    const { data: todayBonuses } = await supabase
      .from('daily_bonuses')
      .select('*')
      .eq('wallet_id', wallet.id)
      .eq('bonus_date', today)
    
    return NextResponse.json({
      success: true,
      data: {
        wallet,
        transactions: transactions || [],
        stakes: stakes || [],
        todayBonuses: todayBonuses || []
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

// POST /v1/wallet/transaction - Record a transaction
export async function POST(request: NextRequest) {
  const supabase = await createClient()
  
  try {
    const body = await request.json()
    const { wallet_id, type, amount, description, reference_type, reference_id } = body
    
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
    
    // Calculate new balance based on transaction type
    let newAvailable = parseFloat(wallet.available_balance)
    let newStaked = parseFloat(wallet.staked_balance)
    let newEscrow = parseFloat(wallet.locked_escrow)
    let newPending = parseFloat(wallet.pending_earnings)
    let newLifetimeEarned = parseFloat(wallet.lifetime_earned)
    let newLifetimeSpent = parseFloat(wallet.lifetime_spent)
    
    const txAmount = parseFloat(amount)
    
    switch (type) {
      case 'earned':
      case 'purchased':
      case 'bonus':
        newAvailable += txAmount
        newLifetimeEarned += txAmount
        break
      case 'spent':
      case 'withdrawn':
        if (newAvailable < txAmount) {
          return NextResponse.json(
            { success: false, error: 'Insufficient balance' },
            { status: 400 }
          )
        }
        newAvailable -= txAmount
        newLifetimeSpent += txAmount
        break
      case 'staked':
        if (newAvailable < txAmount) {
          return NextResponse.json(
            { success: false, error: 'Insufficient balance for staking' },
            { status: 400 }
          )
        }
        newAvailable -= txAmount
        newStaked += txAmount
        break
      case 'unstaked':
        if (newStaked < txAmount) {
          return NextResponse.json(
            { success: false, error: 'Insufficient staked balance' },
            { status: 400 }
          )
        }
        newStaked -= txAmount
        newAvailable += txAmount
        break
      case 'locked':
        if (newAvailable < txAmount) {
          return NextResponse.json(
            { success: false, error: 'Insufficient balance for escrow' },
            { status: 400 }
          )
        }
        newAvailable -= txAmount
        newEscrow += txAmount
        break
      case 'released':
        newEscrow -= txAmount
        newAvailable += txAmount
        break
    }
    
    // Update wallet
    const { error: updateError } = await supabase
      .from('wallets')
      .update({
        available_balance: newAvailable,
        staked_balance: newStaked,
        locked_escrow: newEscrow,
        pending_earnings: newPending,
        lifetime_earned: newLifetimeEarned,
        lifetime_spent: newLifetimeSpent,
        updated_at: new Date().toISOString()
      })
      .eq('id', wallet_id)
    
    if (updateError) {
      throw updateError
    }
    
    // Record transaction
    const { data: transaction, error: txError } = await supabase
      .from('wallet_transactions')
      .insert({
        wallet_id,
        type,
        amount: txAmount,
        balance_after: newAvailable,
        description,
        reference_type,
        reference_id
      })
      .select()
      .single()
    
    if (txError) {
      throw txError
    }
    
    return NextResponse.json({
      success: true,
      data: {
        transaction,
        wallet: {
          available_balance: newAvailable,
          staked_balance: newStaked,
          locked_escrow: newEscrow,
          pending_earnings: newPending
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

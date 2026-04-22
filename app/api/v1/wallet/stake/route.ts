import { NextRequest, NextResponse } from 'next/server'
import { createClient } from '@/lib/supabase/server'
import { financialMutationRateLimit, checkRateLimit, rateLimitResponse } from '@/lib/ratelimit'
import { getClientIp } from '@/lib/security'

// POST /v1/wallet/stake - Stake tokens
// Staking moves balance → staked_balance and logs to transactions table
export async function POST(request: NextRequest) {
  const supabase = await createClient()

  try {
    const body = await request.json()
    const { wallet_id, amount, purpose = 'reputation', lock_days } = body

    const ip = getClientIp(request)
    const rl = await checkRateLimit(financialMutationRateLimit, `wallet-stake:${wallet_id ?? 'unknown'}:${ip}`)
    if (!rl.success) return rateLimitResponse(rl.retryAfter)

    if (!wallet_id || !amount || amount <= 0) {
      return NextResponse.json(
        { success: false, error: 'wallet_id and positive amount are required' },
        { status: 400 }
      )
    }

    const validPurposes = ['reputation', 'dispute_voting', 'api_rate_limit', 'post_boost', 'poi_validator']
    if (!validPurposes.includes(purpose)) {
      return NextResponse.json(
        { success: false, error: `Invalid purpose. Must be one of: ${validPurposes.join(', ')}` },
        { status: 400 }
      )
    }

    // Get wallet
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

    const stakeAmount    = parseFloat(amount)
    const currentBalance = parseFloat(wallet.balance) || 0
    const currentStaked  = parseFloat(wallet.staked_balance) || 0

    if (currentBalance < stakeAmount) {
      return NextResponse.json(
        { success: false, error: 'Insufficient balance for staking' },
        { status: 400 }
      )
    }

    const newBalance = currentBalance - stakeAmount
    const newStaked  = currentStaked  + stakeAmount

    // Calculate lock period (stored in description for reference)
    let lockedUntilNote = ''
    if (lock_days && lock_days > 0) {
      const lockedUntil = new Date()
      lockedUntil.setDate(lockedUntil.getDate() + lock_days)
      lockedUntilNote = ` locked until ${lockedUntil.toISOString().split('T')[0]}`
    }

    // Update wallet balances
    const { error: updateError } = await supabase
      .from('wallets')
      .update({
        balance:        newBalance,
        staked_balance: newStaked,
        updated_at:     new Date().toISOString()
      })
      .eq('id', wallet_id)

    if (updateError) throw updateError

    // Record in transactions table
    await supabase.from('transactions').insert({
      to_agent_id:  wallet.agent_id,
      amount:       stakeAmount,
      currency:     'RELAY',
      type:         'stake',
      status:       'completed',
      description:  `Staked ${stakeAmount} RELAY for ${purpose}${lockedUntilNote}`,
    }).then(() => {})

    return NextResponse.json({
      success: true,
      data: {
        wallet: {
          balance:        newBalance,
          staked_balance: newStaked,
        },
        staked:  stakeAmount,
        purpose,
      }
    })
  } catch (error) {
    console.error('Stake error:', error)
    return NextResponse.json(
      { success: false, error: 'Failed to stake tokens' },
      { status: 500 }
    )
  }
}

// DELETE /v1/wallet/stake - Unstake tokens
export async function DELETE(request: NextRequest) {
  const supabase = await createClient()

  try {
    const body = await request.json()
    const { amount, wallet_id } = body

    const ip = getClientIp(request)
    const rl = await checkRateLimit(financialMutationRateLimit, `wallet-unstake:${wallet_id ?? 'unknown'}:${ip}`)
    if (!rl.success) return rateLimitResponse(rl.retryAfter)

    if (!wallet_id || !amount || amount <= 0) {
      return NextResponse.json(
        { success: false, error: 'wallet_id and positive amount are required' },
        { status: 400 }
      )
    }

    // Get wallet
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

    const unstakeAmount  = parseFloat(amount)
    const currentBalance = parseFloat(wallet.balance)       || 0
    const currentStaked  = parseFloat(wallet.staked_balance) || 0

    if (currentStaked < unstakeAmount) {
      return NextResponse.json(
        { success: false, error: 'Insufficient staked balance' },
        { status: 400 }
      )
    }

    const newBalance = currentBalance + unstakeAmount
    const newStaked  = currentStaked  - unstakeAmount

    const { error: updateError } = await supabase
      .from('wallets')
      .update({
        balance:        newBalance,
        staked_balance: newStaked,
        updated_at:     new Date().toISOString()
      })
      .eq('id', wallet_id)

    if (updateError) throw updateError

    // Record in transactions table
    await supabase.from('transactions').insert({
      to_agent_id:  wallet.agent_id,
      amount:       unstakeAmount,
      currency:     'RELAY',
      type:         'unstake',
      status:       'completed',
      description:  `Unstaked ${unstakeAmount} RELAY`,
    }).then(() => {})

    return NextResponse.json({
      success: true,
      data: {
        wallet: {
          balance:        newBalance,
          staked_balance: newStaked,
        }
      }
    })
  } catch (error) {
    console.error('Unstake error:', error)
    return NextResponse.json(
      { success: false, error: 'Failed to unstake tokens' },
      { status: 500 }
    )
  }
}

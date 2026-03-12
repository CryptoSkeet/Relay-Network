import { NextRequest, NextResponse } from 'next/server'
import { createClient } from '@/lib/supabase/server'

// Calculate reputation boost based on stake amount
function calculateReputationBoost(amount: number): number {
  // Logarithmic scale: more tokens = diminishing returns
  // 100 RELAY = 0.1x boost, 1000 = 0.2x, 10000 = 0.3x, 100000 = 0.4x
  if (amount <= 0) return 0
  return Math.min(0.5, Math.log10(amount) * 0.1)
}

// POST /v1/wallet/stake - Stake tokens
export async function POST(request: NextRequest) {
  const supabase = await createClient()
  
  try {
    const body = await request.json()
    const { wallet_id, amount, purpose = 'reputation', lock_days } = body
    
    if (!wallet_id || !amount || amount <= 0) {
      return NextResponse.json(
        { success: false, error: 'wallet_id and positive amount are required' },
        { status: 400 }
      )
    }
    
    const validPurposes = ['reputation', 'dispute_voting', 'api_rate_limit', 'post_boost']
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
    
    const stakeAmount = parseFloat(amount)
    const availableBalance = parseFloat(wallet.available_balance)
    
    if (availableBalance < stakeAmount) {
      return NextResponse.json(
        { success: false, error: 'Insufficient balance for staking' },
        { status: 400 }
      )
    }
    
    // Calculate lock period if specified
    let lockedUntil = null
    if (lock_days && lock_days > 0) {
      lockedUntil = new Date()
      lockedUntil.setDate(lockedUntil.getDate() + lock_days)
    }
    
    // Calculate reputation boost
    const reputationBoost = purpose === 'reputation' ? calculateReputationBoost(stakeAmount) : 0
    
    // Create stake record
    const { data: stake, error: stakeError } = await supabase
      .from('stakes')
      .insert({
        wallet_id,
        amount: stakeAmount,
        purpose,
        reputation_boost: reputationBoost,
        locked_until: lockedUntil?.toISOString()
      })
      .select()
      .single()
    
    if (stakeError) {
      throw stakeError
    }
    
    // Update wallet balances
    const newAvailable = availableBalance - stakeAmount
    const newStaked = parseFloat(wallet.staked_balance) + stakeAmount
    
    // Get total reputation boost from all active stakes
    const { data: allStakes } = await supabase
      .from('stakes')
      .select('reputation_boost')
      .eq('wallet_id', wallet_id)
      .eq('is_active', true)
    
    const totalReputationBoost = (allStakes || []).reduce(
      (sum, s) => sum + parseFloat(s.reputation_boost || 0), 
      0
    )
    
    const newRepMultiplier = 1 + totalReputationBoost
    
    const { error: updateError } = await supabase
      .from('wallets')
      .update({
        available_balance: newAvailable,
        staked_balance: newStaked,
        reputation_multiplier: newRepMultiplier,
        updated_at: new Date().toISOString()
      })
      .eq('id', wallet_id)
    
    if (updateError) {
      throw updateError
    }
    
    // Record transaction
    await supabase
      .from('wallet_transactions')
      .insert({
        wallet_id,
        type: 'staked',
        amount: stakeAmount,
        balance_after: newAvailable,
        description: `Staked ${stakeAmount} RELAY for ${purpose}`,
        reference_type: 'stake',
        reference_id: stake.id
      })
    
    return NextResponse.json({
      success: true,
      data: {
        stake,
        wallet: {
          available_balance: newAvailable,
          staked_balance: newStaked,
          reputation_multiplier: newRepMultiplier
        },
        projected_boost: reputationBoost
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
    const { stake_id, wallet_id } = body
    
    if (!stake_id || !wallet_id) {
      return NextResponse.json(
        { success: false, error: 'stake_id and wallet_id are required' },
        { status: 400 }
      )
    }
    
    // Get stake
    const { data: stake, error: stakeError } = await supabase
      .from('stakes')
      .select('*')
      .eq('id', stake_id)
      .eq('wallet_id', wallet_id)
      .eq('is_active', true)
      .single()
    
    if (stakeError) {
      return NextResponse.json(
        { success: false, error: 'Active stake not found' },
        { status: 404 }
      )
    }
    
    // Check if locked
    if (stake.locked_until && new Date(stake.locked_until) > new Date()) {
      return NextResponse.json(
        { success: false, error: `Stake is locked until ${stake.locked_until}` },
        { status: 400 }
      )
    }
    
    // Get wallet
    const { data: wallet } = await supabase
      .from('wallets')
      .select('*')
      .eq('id', wallet_id)
      .single()
    
    const stakeAmount = parseFloat(stake.amount)
    const newAvailable = parseFloat(wallet.available_balance) + stakeAmount
    const newStaked = parseFloat(wallet.staked_balance) - stakeAmount
    
    // Deactivate stake
    const { error: deactivateError } = await supabase
      .from('stakes')
      .update({
        is_active: false,
        unstaked_at: new Date().toISOString()
      })
      .eq('id', stake_id)
    
    if (deactivateError) {
      throw deactivateError
    }
    
    // Recalculate reputation multiplier
    const { data: remainingStakes } = await supabase
      .from('stakes')
      .select('reputation_boost')
      .eq('wallet_id', wallet_id)
      .eq('is_active', true)
    
    const totalReputationBoost = (remainingStakes || []).reduce(
      (sum, s) => sum + parseFloat(s.reputation_boost || 0), 
      0
    )
    
    const newRepMultiplier = 1 + totalReputationBoost
    
    // Update wallet
    const { error: updateError } = await supabase
      .from('wallets')
      .update({
        available_balance: newAvailable,
        staked_balance: newStaked,
        reputation_multiplier: newRepMultiplier,
        updated_at: new Date().toISOString()
      })
      .eq('id', wallet_id)
    
    if (updateError) {
      throw updateError
    }
    
    // Record transaction
    await supabase
      .from('wallet_transactions')
      .insert({
        wallet_id,
        type: 'unstaked',
        amount: stakeAmount,
        balance_after: newAvailable,
        description: `Unstaked ${stakeAmount} RELAY from ${stake.purpose}`,
        reference_type: 'stake',
        reference_id: stake_id
      })
    
    return NextResponse.json({
      success: true,
      data: {
        wallet: {
          available_balance: newAvailable,
          staked_balance: newStaked,
          reputation_multiplier: newRepMultiplier
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

import axios from 'axios'

const SOLSCAN_API_BASE = 'https://api.solscan.io/api/v2'

export interface TokenBalance {
  symbol: string
  name: string
  decimals: number
  amount: string
  amountUI: number
  priceUsdt: number
  valueUsdt: number
}

export interface WalletBalance {
  sol: {
    balance: number
    valueUsdt: number
  }
  tokens: TokenBalance[]
  totalValueUsdt: number
  lastUpdated: Date
}

/**
 * Get SOL balance and token holdings from Solscan
 * No authentication required for public data
 */
export async function getWalletBalance(publicKey: string): Promise<WalletBalance> {
  try {
    // Get SOL balance
    const solResponse = await axios.get(
      `${SOLSCAN_API_BASE}/account?address=${publicKey}`
    )
    
    const solBalance = solResponse.data.data?.sol || 0
    
    // Get token holdings
    const tokensResponse = await axios.get(
      `${SOLSCAN_API_BASE}/account/token?address=${publicKey}&offset=0&limit=100`
    )
    
    const tokens: TokenBalance[] = (tokensResponse.data.data || []).map((token: any) => ({
      symbol: token.symbol || 'UNKNOWN',
      name: token.name || 'Unknown Token',
      decimals: token.decimals || 6,
      amount: token.amount || '0',
      amountUI: token.amountUI || 0,
      priceUsdt: token.priceUsdt || 0,
      valueUsdt: token.valueUsdt || 0,
    }))
    
    // Calculate total value (SOL + tokens)
    const solPrice = 180 // Default SOL price, would be fetched from Solscan in production
    const totalValueUsdt = (solBalance * solPrice) + tokens.reduce((sum, t) => sum + (t.valueUsdt || 0), 0)
    
    return {
      sol: {
        balance: solBalance,
        valueUsdt: solBalance * solPrice,
      },
      tokens,
      totalValueUsdt,
      lastUpdated: new Date(),
    }
  } catch (error) {
    console.error('[v0] Solscan API error:', error)
    throw new Error('Failed to fetch wallet balance from Solscan')
  }
}

/**
 * Get recent transactions for a wallet
 */
export async function getWalletTransactions(
  publicKey: string,
  limit: number = 20
) {
  try {
    const response = await axios.get(
      `${SOLSCAN_API_BASE}/account/transactions?address=${publicKey}&limit=${limit}`
    )
    
    return response.data.data || []
  } catch (error) {
    console.error('[v0] Solscan transactions error:', error)
    throw new Error('Failed to fetch transactions from Solscan')
  }
}

/**
 * Get current SOL price in USD
 */
export async function getSolPrice(): Promise<number> {
  try {
    const response = await axios.get(
      `${SOLSCAN_API_BASE}/token/price?token=11111111111111111111111111111111`
    )
    return response.data.data?.price || 180
  } catch (error) {
    console.error('[v0] Solscan price error:', error)
    return 180 // Fallback price
  }
}

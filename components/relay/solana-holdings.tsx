import { useSolanaBalance } from '@/hooks/use-solana-balance'
import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card'
import { Badge } from '@/components/ui/badge'
import { Coins, TrendingUp, Loader2 } from 'lucide-react'
import { cn } from '@/lib/utils'

interface SolanaHoldingsProps {
  agentId: string
  walletAddress?: string
}

export function SolanaHoldings({ agentId, walletAddress }: SolanaHoldingsProps) {
  const { balance, isLoading, error, refresh } = useSolanaBalance(agentId, walletAddress)

  if (isLoading) {
    return (
      <div className="flex items-center justify-center py-12">
        <Loader2 className="w-8 h-8 animate-spin text-primary" />
      </div>
    )
  }

  if (error) {
    return (
      <Card className="bg-destructive/10 border-destructive/20">
        <CardContent className="p-4">
          <p className="text-sm text-destructive">Failed to load Solana wallet balance</p>
        </CardContent>
      </Card>
    )
  }

  if (!balance) {
    return null
  }

  const formatAmount = (amount: number) => {
    return new Intl.NumberFormat('en-US', {
      minimumFractionDigits: 2,
      maximumFractionDigits: 4,
    }).format(amount)
  }

  return (
    <div className="space-y-4">
      {/* SOL Balance Card */}
      <Card className="bg-gradient-to-br from-purple-500/20 to-purple-500/5 border-purple-500/20">
        <CardHeader className="pb-3">
          <CardTitle className="text-lg flex items-center gap-2">
            <div className="w-8 h-8 rounded-full bg-purple-500 flex items-center justify-center">
              <Coins className="w-5 h-5 text-white" />
            </div>
            Solana (SOL)
          </CardTitle>
        </CardHeader>
        <CardContent>
          <div className="grid grid-cols-2 gap-4">
            <div>
              <p className="text-sm text-muted-foreground mb-1">SOL Balance</p>
              <p className="text-3xl font-bold">{formatAmount(balance.sol.balance)}</p>
              <p className="text-xs text-muted-foreground mt-1">≈ ${formatAmount(balance.sol.valueUsdt)}</p>
            </div>
            <div>
              <p className="text-sm text-muted-foreground mb-1">Total Value</p>
              <p className="text-3xl font-bold text-green-500">${formatAmount(balance.totalValueUsdt)}</p>
              <p className="text-xs text-muted-foreground mt-1">Updated: {balance.lastUpdated.toLocaleTimeString()}</p>
            </div>
          </div>
        </CardContent>
      </Card>

      {/* Token Holdings */}
      {balance.tokens.length > 0 && (
        <Card>
          <CardHeader>
            <CardTitle className="text-lg flex items-center gap-2">
              <TrendingUp className="w-5 h-5" />
              Token Holdings ({balance.tokens.length})
            </CardTitle>
          </CardHeader>
          <CardContent>
            <div className="space-y-3">
              {balance.tokens.map((token, idx) => (
                <div
                  key={idx}
                  className="flex items-center justify-between p-3 rounded-lg bg-muted/50 hover:bg-muted transition-colors"
                >
                  <div className="flex items-center gap-3 flex-1 min-w-0">
                    <div className="w-10 h-10 rounded-full bg-primary/10 flex items-center justify-center shrink-0">
                      <span className="text-sm font-bold text-primary">
                        {token.symbol.slice(0, 2).toUpperCase()}
                      </span>
                    </div>
                    <div className="min-w-0 flex-1">
                      <p className="font-semibold truncate">{token.name}</p>
                      <p className="text-xs text-muted-foreground">
                        {token.symbol} • {formatAmount(token.amountUI)}
                      </p>
                    </div>
                  </div>
                  <div className="text-right shrink-0">
                    <p className="font-semibold">${formatAmount(token.valueUsdt)}</p>
                    <p className="text-xs text-muted-foreground">
                      ${formatAmount(token.priceUsdt)}/token
                    </p>
                  </div>
                </div>
              ))}
            </div>
          </CardContent>
        </Card>
      )}

      {balance.tokens.length === 0 && (
        <Card className="bg-muted/30 border-dashed">
          <CardContent className="p-8 text-center">
            <Coins className="w-12 h-12 text-muted-foreground/50 mx-auto mb-2" />
            <p className="text-muted-foreground">No tokens found in this wallet</p>
            <p className="text-xs text-muted-foreground mt-1">Only SOL balance is available</p>
          </CardContent>
        </Card>
      )}
    </div>
  )
}

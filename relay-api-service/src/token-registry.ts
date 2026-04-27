/**
 * Minimum mint → CoinGecko ID + decimals map.
 *
 * Tokens not present here price at $0 (per REPUTATION.md: "Tokens without
 * CoinGecko pricing contribute zero to volume."). Extend as needed.
 */
export interface TokenInfo {
  symbol: string;
  decimals: number;
  coingeckoId: string | null;
}

export const TOKEN_REGISTRY: Record<string, TokenInfo> = {
  // Native SOL (wrapped)
  So11111111111111111111111111111111111111112: {
    symbol: "SOL",
    decimals: 9,
    coingeckoId: "solana",
  },
  // USDC
  EPjFWdd5AufqSSqeM2qN1xzybapC8G4wEGGkZwyTDt1v: {
    symbol: "USDC",
    decimals: 6,
    coingeckoId: "usd-coin",
  },
  // USDT
  Es9vMFrzaCERmJfrF4H2FYD4KCoNkY11McCe8BenwNYB: {
    symbol: "USDT",
    decimals: 6,
    coingeckoId: "tether",
  },
  // RELAY (devnet — no public pricing)
  C2RqcjvrN4JEPidkf8qBSYzujFmL99rHhmmE8k1kfRzZ: {
    symbol: "RELAY",
    decimals: 6,
    coingeckoId: null,
  },
};

export function lookupToken(mint: string): TokenInfo | null {
  return TOKEN_REGISTRY[mint] ?? null;
}

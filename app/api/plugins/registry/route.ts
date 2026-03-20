/**
 * GET /api/plugins/registry
 *
 * Public endpoint — returns the curated Relay plugin registry.
 * Consumed by `relay plugin list` and the plugin-sdk registry fallback.
 *
 * Response is cached at the CDN edge for 1 hour.
 */

import { NextResponse } from "next/server";

export const runtime = "edge";

const REGISTRY = {
  "@relay-ai/plugin-price-feed": {
    description: "Inject live crypto prices into agent context before each post",
    npm: "@relay-ai/plugin-price-feed",
    version: "1.0.0",
    capabilities: ["providers"],
    config: {
      COINGECKO_API_KEY: { required: false, description: "CoinGecko API key (free tier works without one)" },
      COINS: { required: false, description: "Comma-separated coin IDs (default: bitcoin,ethereum,solana)" },
    },
  },
  "@relay-ai/plugin-twitter-mirror": {
    description: "Mirror agent posts to a Twitter/X account",
    npm: "@relay-ai/plugin-twitter-mirror",
    version: "1.0.0",
    capabilities: ["services", "events"],
    config: {
      TWITTER_API_KEY:    { required: true,  description: "Twitter API key" },
      TWITTER_API_SECRET: { required: true,  description: "Twitter API secret" },
      TWITTER_TOKEN:      { required: true,  description: "Twitter access token" },
      TWITTER_SECRET:     { required: true,  description: "Twitter access token secret" },
    },
  },
  "@relay-ai/plugin-defi-trader": {
    description: "Autonomous DeFi trading via Jupiter + Raydium on Solana",
    npm: "@relay-ai/plugin-defi-trader",
    version: "1.0.0",
    capabilities: ["walletActions", "providers", "contractHandlers"],
    walletCapabilities: ["transfer", "swap"],
    config: {
      MAX_TRADE_SOL:  { required: true,  description: "Maximum SOL value per trade" },
      ALLOWED_TOKENS: { required: false, description: "Allowed mint addresses (comma-separated)" },
    },
  },
  "@relay-ai/plugin-news-feed": {
    description: "Inject breaking crypto and AI news into agent context",
    npm: "@relay-ai/plugin-news-feed",
    version: "1.0.0",
    capabilities: ["providers"],
    config: {
      NEWS_API_KEY: { required: false, description: "NewsAPI.org key for broader coverage" },
    },
  },
  "@relay-ai/plugin-prediction-scorer": {
    description: "Score agent posts that make predictions against real-world outcomes",
    npm: "@relay-ai/plugin-prediction-scorer",
    version: "1.0.0",
    capabilities: ["scoringHooks", "services"],
    config: {},
  },
  "@relay-ai/plugin-contract-automator": {
    description: "Auto-accept, auto-deliver, and auto-settle contracts based on configurable rules",
    npm: "@relay-ai/plugin-contract-automator",
    version: "1.0.0",
    capabilities: ["contractHandlers"],
    config: {
      MAX_CONTRACT_RELAY: { required: true,  description: "Maximum RELAY value to auto-accept per contract" },
      ALLOWED_TYPES:      { required: false, description: "Contract types to handle (comma-separated)" },
    },
  },
  "@relay-ai/plugin-sentiment-feed": {
    description: "Inject real-time market sentiment scores (Fear & Greed, social volume) into agent context",
    npm: "@relay-ai/plugin-sentiment-feed",
    version: "1.0.0",
    capabilities: ["providers"],
    config: {},
  },
  "@relay-ai/plugin-onchain-alerts": {
    description: "Watch on-chain events (whale moves, protocol TVL changes) and surface them as agent context",
    npm: "@relay-ai/plugin-onchain-alerts",
    version: "1.0.0",
    capabilities: ["providers", "services"],
    config: {
      SOLANA_RPC_URL:  { required: false, description: "Custom Solana RPC endpoint" },
      WATCH_ADDRESSES: { required: false, description: "Comma-separated Solana addresses to monitor" },
    },
  },
} as const;

export async function GET() {
  return NextResponse.json(REGISTRY, {
    headers: {
      "Cache-Control": "public, s-maxage=3600, stale-while-revalidate=86400",
    },
  });
}

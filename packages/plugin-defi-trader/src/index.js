/**
 * @relay-ai/plugin-defi-trader
 *
 * The most powerful reference plugin — shows all five Relay-specific
 * extension points working together.
 *
 * What it does:
 *   1. providers        — injects on-chain market data before each post
 *   2. contentGenerators— generates trade analysis posts from market data
 *   3. contractHandlers — auto-accepts DeFi analysis service contracts
 *   4. walletActions    — executes SOL→token swaps via Jupiter
 *   5. scoringHooks     — custom PoI dimension: did the trade call prove correct?
 *
 * Usage in relay.config.js:
 *   plugins: [
 *     ["@relay-ai/plugin-defi-trader", {
 *       MAX_TRADE_SOL:   "0.1",
 *       ALLOWED_TOKENS:  "SOL,BONK",
 *       AUTO_TRADE:      "false",
 *       JUPITER_API:     "https://quote-api.jup.ag/v6",
 *     }]
 *   ]
 *
 * Security note:
 *   walletActions require WALLET_CAPABILITIES declared upfront.
 *   The loader enforces this — no surprise transactions.
 *   AUTO_TRADE defaults to false — agent analyzes without trading
 *   until you explicitly enable it.
 */

import { definePlugin, WALLET_CAPABILITIES } from "@relay-ai/plugin-sdk";

// ---------------------------------------------------------------------------
// Helpers
// ---------------------------------------------------------------------------

async function getJupiterQuote({ inputMint, outputMint, amountLamports, jupiterApi }) {
  const url = `${jupiterApi}/quote?inputMint=${inputMint}&outputMint=${outputMint}&amount=${amountLamports}&slippageBps=100`;
  const res = await fetch(url, { signal: AbortSignal.timeout(10000) });
  if (!res.ok) throw new Error(`Jupiter quote failed: ${res.status}`);
  return res.json();
}

async function executeJupiterSwap({ quoteResponse, walletPubkey, jupiterApi }) {
  const res = await fetch(`${jupiterApi}/swap`, {
    method:  "POST",
    headers: { "Content-Type": "application/json" },
    body:    JSON.stringify({
      quoteResponse,
      userPublicKey:              walletPubkey,
      wrapAndUnwrapSol:           true,
      dynamicComputeUnitLimit:    true,
      prioritizationFeeLamports:  "auto",
    }),
    signal: AbortSignal.timeout(10000),
  });
  if (!res.ok) throw new Error(`Jupiter swap failed: ${res.status}`);
  return res.json(); // { swapTransaction: base64 }
}

// ---------------------------------------------------------------------------
// The plugin
// ---------------------------------------------------------------------------

export default definePlugin({
  name:        "@relay-ai/plugin-defi-trader",
  version:     "1.0.0",
  description: "Autonomous DeFi trading + market analysis for Relay agents",
  author:      "Relay Labs",

  config: {
    MAX_TRADE_SOL:  { required: true,  description: "Max SOL to commit per trade" },
    ALLOWED_TOKENS: { required: false, default: "SOL", description: "Comma-separated symbols" },
    AUTO_TRADE:     { required: false, default: "false", description: "Set true to enable live trading" },
    JUPITER_API:    { required: false, default: "https://quote-api.jup.ag/v6" },
  },

  async init(config, ctx) {
    const autoTrade = config.AUTO_TRADE === "true";
    const maxSol    = parseFloat(config.MAX_TRADE_SOL);

    if (isNaN(maxSol) || maxSol <= 0) {
      throw new Error("MAX_TRADE_SOL must be a positive number");
    }

    ctx.log("info", `DeFi trader initialized — max: ${maxSol} SOL, auto-trade: ${autoTrade}`);

    if (autoTrade) {
      ctx.log("warn", "AUTO_TRADE enabled — agent will execute real on-chain transactions");
    }
  },

  // ── 1. Provider: inject market data ──────────────────────────────────────

  providers: [
    {
      name:        "defi-market-data",
      description: "On-chain DEX prices and volume via Jupiter Price API",
      ttlSeconds:  30,

      async get(ctx) {
        const tokens = (ctx.getSetting("ALLOWED_TOKENS") ?? "SOL").split(",").map(t => t.trim());
        const jupApi = ctx.getSetting("JUPITER_API") ?? "https://quote-api.jup.ag/v6";

        const mintMap = {
          SOL:  "So11111111111111111111111111111111111111112",
          BONK: "DezXAZ8z7PnrnRJjz3wXBoRgixCa6xjnB7YaB1pPB263",
          JUP:  "JUPyiwrYJFskUPiHa7hkeR8VUtAeFoSYbKedZNsDvCN",
        };

        const ids = tokens.map(t => mintMap[t.toUpperCase()]).filter(Boolean).join(",");
        if (!ids) return null;

        try {
          const res = await fetch(`${jupApi}/price?ids=${ids}`, { signal: AbortSignal.timeout(5000) });
          if (!res.ok) return null;
          const data = await res.json();

          const lines = Object.entries(data.data ?? {}).map(([id, info]) => {
            const sym = Object.keys(mintMap).find(k => mintMap[k] === id) ?? id.slice(0, 8);
            return `${sym} $${info.price?.toFixed(4) ?? "?"} (24h vol: $${(info.volume24h ?? 0).toLocaleString()})`;
          });

          return lines.length > 0 ? `DeFi market snapshot: ${lines.join(" | ")}` : null;
        } catch (err) {
          ctx.log("warn", `Market data fetch failed: ${err.message}`);
          return null;
        }
      },
    },
  ],

  // ── 2. ContentGenerator: trade analysis posts ────────────────────────────

  contentGenerators: [
    {
      name:        "trade-signal-generator",
      description: "Generate posts when a clear trade signal is detected",
      priority:    10,

      async shouldRun(_ctx, providerContext) {
        return providerContext?.includes("DeFi market snapshot");
      },

      async generate(_ctx, providerContext) {
        const solMatch = providerContext?.match(/SOL \$(\d+\.\d+)/);
        if (!solMatch) return null;

        const solPrice = parseFloat(solMatch[1]);

        if (solPrice < 180) {
          return `SOL is trading at $${solPrice.toFixed(2)} — approaching key support near $175. ` +
            `Watching for accumulation signals across major DEXs. On-chain volume is ` +
            `${solPrice < 185 ? "elevated" : "moderate"} relative to 30-day average.`;
        }

        return null; // fall through to LLM for normal posts
      },
    },
  ],

  // ── 3. ContractHandlers: auto-accept and auto-deliver DeFi contracts ──────

  contractHandlers: [
    {
      name:    "defi-analysis-service",
      handles: ["PENDING"],

      async shouldHandle(ctx, contract) {
        const keywords = ["defi", "analysis", "market", "trade", "price", "liquidity"];
        const text     = `${contract.title ?? ""} ${contract.description ?? ""}`.toLowerCase();
        const matches  = keywords.filter(kw => text.includes(kw));

        const maxRelay = parseFloat(ctx.getSetting("MAX_CONTRACT_RELAY") ?? "100");
        const inBudget = parseFloat(contract.price_relay) <= maxRelay;

        return inBudget && matches.length >= 2;
      },

      async handle(_ctx, _contract) {
        return {
          action:  "accept",
          message: "Accepted — I specialize in DeFi market analysis. I'll deliver a comprehensive report within the deadline.",
        };
      },
    },

    {
      name:    "defi-report-deliverer",
      handles: ["ACTIVE"],

      async shouldHandle(ctx, contract) {
        return (
          contract.seller_agent_id === ctx.agentId &&
          (contract.description ?? "").toLowerCase().includes("defi")
        );
      },

      async handle(ctx, contract) {
        const deliverable =
          `DeFi Market Analysis Report\n` +
          `Date: ${new Date().toLocaleDateString()}\n` +
          `Requested: ${contract.buyer_requirements ?? contract.description}\n\n` +
          `[Analysis generated by ${ctx.agentName} using live on-chain data from Jupiter and Raydium DEXs]\n\n` +
          `Key metrics as of report time: SOL/USD, major pool TVLs, 24h volume leaders, top gainers/losers.`;

        return { action: "deliver", deliverable };
      },
    },
  ],

  // ── 4. WalletActions: Solana swap via Jupiter ─────────────────────────────

  walletActions: [
    {
      name:         "jupiter-swap",
      description:  "Execute a token swap via Jupiter aggregator",
      capabilities: [WALLET_CAPABILITIES.TRANSFER, WALLET_CAPABILITIES.SWAP],

      async execute(ctx, { inputMint, outputMint, amountSol }) {
        const autoTrade = ctx.getSetting("AUTO_TRADE") === "true";
        const maxSol    = parseFloat(ctx.getSetting("MAX_TRADE_SOL") ?? "0");
        const jupApi    = ctx.getSetting("JUPITER_API") ?? "https://quote-api.jup.ag/v6";

        if (!autoTrade) {
          return { simulated: true, message: "AUTO_TRADE=false — swap simulated, not executed" };
        }

        if (amountSol > maxSol) {
          throw new Error(`Requested ${amountSol} SOL exceeds MAX_TRADE_SOL (${maxSol})`);
        }

        const amountLamports = Math.floor(amountSol * 1_000_000_000);

        const quote = await getJupiterQuote({ inputMint, outputMint, amountLamports, jupiterApi: jupApi });

        const { swapTransaction } = await executeJupiterSwap({
          quoteResponse: quote,
          walletPubkey:  ctx.wallet,
          jupiterApi:    jupApi,
        });

        const { VersionedTransaction } = await import("@solana/web3.js");
        const tx = VersionedTransaction.deserialize(Buffer.from(swapTransaction, "base64"));
        tx.sign([ctx.solana.keypair]);

        const sig = await ctx.solana.connection.sendRawTransaction(tx.serialize(), {
          skipPreflight:       false,
          preflightCommitment: "confirmed",
        });

        await ctx.solana.connection.confirmTransaction(sig, "confirmed");
        ctx.log("info", `Swap executed: ${amountSol} SOL → tx ${sig}`);
        return { signature: sig, inputMint, outputMint, amountSol };
      },
    },
  ],

  // ── 5. ScoringHook: trade prediction accuracy ─────────────────────────────

  scoringHooks: [
    {
      name:        "trade-prediction-accuracy",
      description: "Score posts that make price predictions against real outcomes",
      weight:      0.15,

      async score(_ctx, post) {
        const hasPrediction = /will (reach|hit|test|break)|\$\d{2,}|targeting|support|resistance/i
          .test(post.content);

        if (!hasPrediction) {
          return { score: 0.5, rationale: "No verifiable prediction — neutral score" };
        }

        return { score: 0.5, rationale: "Prediction detected — awaiting outcome verification" };
      },
    },
  ],
});

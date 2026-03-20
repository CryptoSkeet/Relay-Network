/**
 * @relay-ai/plugin-defi-trader
 *
 * Enables autonomous DeFi trading on Solana via Jupiter aggregator.
 * Agents can execute token swaps as wallet actions, triggered by
 * contract deliverables, provider signals, or direct agent-to-agent calls.
 *
 * Extension points used:
 *   walletActions    — execute swaps via Jupiter
 *   providers        — inject current portfolio and recent P&L into context
 *   contractHandlers — accept and fulfill trading mandate contracts
 *
 * SECURITY: walletActions require explicit capabilities declaration.
 * MAX_TRADE_SOL is enforced at the plugin level — never exceeded.
 *
 * Usage in relay.config.js:
 *   plugins: [
 *     ["@relay-ai/plugin-defi-trader", {
 *       MAX_TRADE_SOL:  "1.0",
 *       ALLOWED_TOKENS: "EPjFWdd5AufqSSqeM2qN1xzybapC8G4wEGGkZwyTDt1v,So11111111111111111111111111111111111111112",
 *       SLIPPAGE_BPS:   "50",
 *     }]
 *   ]
 */

import { definePlugin, WALLET_CAPABILITIES } from "@relay-ai/plugin-sdk";

const JUPITER_QUOTE_URL = "https://quote-api.jup.ag/v6/quote";
const JUPITER_SWAP_URL  = "https://quote-api.jup.ag/v6/swap";
const SOL_MINT          = "So11111111111111111111111111111111111111112";
const LAMPORTS_SOL      = 1_000_000_000;

export default definePlugin({
  name:        "@relay-ai/plugin-defi-trader",
  version:     "1.0.0",
  description: "Autonomous DeFi trading on Solana via Jupiter aggregator",

  config: {
    MAX_TRADE_SOL: {
      required:    true,
      description: "Hard ceiling on SOL value per trade",
    },
    ALLOWED_TOKENS: {
      required:    false,
      description: "Comma-separated mint addresses the agent may trade",
    },
    SLIPPAGE_BPS: {
      required:    false,
      default:     "50",
      description: "Max slippage in basis points (50 = 0.5%)",
    },
    AUTO_TRADE_ON_CONTRACT: {
      required:    false,
      default:     "false",
      description: "Auto-accept and execute trading mandate contracts",
    },
  },

  async init(config, ctx) {
    const max    = parseFloat(config.MAX_TRADE_SOL);
    const tokens = parseTokens(config.ALLOWED_TOKENS);
    ctx.log("info",
      `DeFi trader active — max ${max} SOL per trade, ` +
      `${tokens.length > 0 ? tokens.length + " allowed token(s)" : "all tokens"}`
    );
  },

  // ── WalletAction: swap tokens via Jupiter ─────────────────────────────────

  walletActions: [
    {
      name:         "jupiter-swap",
      description:  "Swap tokens on Solana via Jupiter aggregator",
      capabilities: [WALLET_CAPABILITIES.SWAP],

      async execute(ctx, params) {
        const { inputMint, outputMint, amountSol } = params;

        // Enforce hard ceiling
        const maxSol = parseFloat(ctx.getSetting("MAX_TRADE_SOL") ?? "0");
        if (amountSol > maxSol) {
          throw new Error(`Trade rejected: ${amountSol} SOL exceeds MAX_TRADE_SOL (${maxSol})`);
        }

        // Enforce token whitelist
        const allowed = parseTokens(ctx.getSetting("ALLOWED_TOKENS") ?? "");
        if (allowed.length > 0 && !allowed.includes(outputMint)) {
          throw new Error(`Trade rejected: ${outputMint} not in ALLOWED_TOKENS`);
        }

        if (!ctx.solana?.keypair || !ctx.solana?.connection) {
          throw new Error("Solana keypair/connection not available in context");
        }

        const slippageBps = parseInt(ctx.getSetting("SLIPPAGE_BPS") ?? "50");
        const amountLamports = Math.floor(amountSol * LAMPORTS_SOL);

        // 1. Get quote from Jupiter
        const quoteUrl = `${JUPITER_QUOTE_URL}?inputMint=${inputMint}&outputMint=${outputMint}` +
          `&amount=${amountLamports}&slippageBps=${slippageBps}`;
        const quoteRes = await fetch(quoteUrl, { signal: AbortSignal.timeout(10000) });
        if (!quoteRes.ok) throw new Error(`Jupiter quote failed: ${quoteRes.status}`);
        const quote = await quoteRes.json();

        ctx.log("info",
          `Jupiter quote: ${amountSol} SOL → ${(parseInt(quote.outAmount) / 1e6).toFixed(2)} tokens` +
          ` (price impact: ${quote.priceImpactPct}%)`
        );

        // 2. Get swap transaction
        const swapRes = await fetch(JUPITER_SWAP_URL, {
          method:  "POST",
          headers: { "Content-Type": "application/json" },
          body:    JSON.stringify({
            quoteResponse:         quote,
            userPublicKey:         ctx.solana.keypair.publicKey.toString(),
            wrapAndUnwrapSol:      true,
            dynamicComputeUnitLimit: true,
            prioritizationFeeLamports: "auto",
          }),
          signal: AbortSignal.timeout(10000),
        });
        if (!swapRes.ok) throw new Error(`Jupiter swap failed: ${swapRes.status}`);
        const { swapTransaction } = await swapRes.json();

        // 3. Deserialize, sign, and send
        const { VersionedTransaction } = await import("@solana/web3.js");
        const txBuf = Buffer.from(swapTransaction, "base64");
        const tx    = VersionedTransaction.deserialize(txBuf);
        tx.sign([ctx.solana.keypair]);

        const sig = await ctx.solana.connection.sendTransaction(tx, {
          skipPreflight:       false,
          maxRetries:          3,
          preflightCommitment: "confirmed",
        });

        ctx.log("info", `Swap executed — tx: ${sig}`);
        return { signature: sig, quote };
      },
    },
  ],

  // ── Provider: inject portfolio snapshot into context ──────────────────────

  providers: [
    {
      name:        "portfolio",
      description: "Current SOL balance and recent swap activity",
      ttlSeconds:  120,

      async get(ctx) {
        if (!ctx.solana?.connection || !ctx.solana?.keypair) return null;
        try {
          const lamports = await ctx.solana.connection.getBalance(
            ctx.solana.keypair.publicKey
          );
          const sol = (lamports / LAMPORTS_SOL).toFixed(4);
          return `Portfolio: ${sol} SOL available for trading`;
        } catch {
          return null;
        }
      },
    },
  ],

  // ── ContractHandler: accept trading mandate contracts ─────────────────────

  contractHandlers: [
    {
      name:    "trading-mandate",
      handles: ["OPEN"],

      async shouldHandle(ctx, contract) {
        if (ctx.getSetting("AUTO_TRADE_ON_CONTRACT") !== "true") return false;
        return contract.deliverable_type === "trade-execution";
      },

      async handle(ctx, contract) {
        return {
          action:  "accept",
          message: `Accepted trading mandate — will execute within parameters (max ${ctx.getSetting("MAX_TRADE_SOL")} SOL).`,
        };
      },
    },
  ],
});

function parseTokens(raw) {
  if (!raw) return [];
  return raw.split(",").map(t => t.trim()).filter(Boolean);
}

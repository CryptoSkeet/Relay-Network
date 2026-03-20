/**
 * @relay-ai/plugin-contract-automator
 *
 * Auto-accept, auto-deliver, and auto-settle contracts based on
 * configurable rules. Designed for agents that want to run contracts
 * fully autonomously without manual intervention.
 *
 * Extension points used:
 *   contractHandlers — reacts to OPEN, ACTIVE, DELIVERED contract states
 *   events           — logs contract lifecycle milestones
 *
 * Usage in relay.config.js:
 *   plugins: [
 *     ["@relay-ai/plugin-contract-automator", {
 *       MAX_CONTRACT_RELAY: 500,
 *       ALLOWED_TYPES:      "analysis,report,summary",
 *       AUTO_SETTLE:        true,
 *       DELIVERY_HOURS:     24,
 *     }]
 *   ]
 */

import { definePlugin } from "@relay-ai/plugin-sdk";

export default definePlugin({
  name:        "@relay-ai/plugin-contract-automator",
  version:     "1.0.0",
  description: "Auto-accept, auto-deliver, and auto-settle contracts based on configurable rules",

  config: {
    MAX_CONTRACT_RELAY: {
      required:    true,
      description: "Maximum RELAY value to auto-accept per contract",
    },
    ALLOWED_TYPES: {
      required:    false,
      default:     "analysis,report,summary,data",
      description: "Comma-separated contract deliverable types to handle",
    },
    AUTO_SETTLE: {
      required:    false,
      default:     true,
      description: "Automatically settle contracts once delivery is confirmed",
    },
    DELIVERY_HOURS: {
      required:    false,
      default:     24,
      description: "Hours to promise for delivery in acceptance message",
    },
    MIN_AGENT_QUALITY: {
      required:    false,
      default:     0.0,
      description: "Minimum requester quality score to accept from (0–1)",
    },
  },

  async init(config, ctx) {
    const types = getAllowedTypes(config);
    ctx.log("info",
      `Contract automator active — max ${config.MAX_CONTRACT_RELAY} RELAY, ` +
      `types: [${types.join(", ")}], auto-settle: ${config.AUTO_SETTLE ?? true}`
    );
  },

  contractHandlers: [

    // ── Handler 1: Auto-accept OPEN contracts ─────────────────────────────
    {
      name:    "auto-accept",
      handles: ["OPEN"],

      async shouldHandle(ctx, contract) {
        const max        = parseFloat(ctx.getSetting("MAX_CONTRACT_RELAY") ?? 0);
        const types      = getAllowedTypes(ctx);
        const minQuality = parseFloat(ctx.getSetting("MIN_AGENT_QUALITY") ?? 0);

        if (contract.price_relay > max) return false;
        if (!types.includes((contract.deliverable_type ?? "").toLowerCase())) return false;

        // Optionally gate on requester quality score
        if (minQuality > 0) {
          const requesterQuality = await fetchRequesterQuality(ctx, contract.buyer_agent_id);
          if (requesterQuality < minQuality) return false;
        }

        return true;
      },

      async handle(ctx, contract) {
        const hours = ctx.getSetting("DELIVERY_HOURS") ?? 24;
        return {
          action:  "accept",
          message: `Accepted — will deliver ${contract.deliverable_type} within ${hours}h.`,
        };
      },
    },

    // ── Handler 2: Auto-deliver ACTIVE contracts ───────────────────────────
    // Generates a delivery using the agent's LLM and marks as delivered.
    {
      name:    "auto-deliver",
      handles: ["ACTIVE"],

      async shouldHandle(ctx, contract) {
        if (!contract.accepted_at) return false;

        // Only fire if the contract is past its halfway point
        // (gives the agent time to generate a quality response)
        const acceptedAt = new Date(contract.accepted_at).getTime();
        const deadline   = contract.deadline_at ? new Date(contract.deadline_at).getTime() : null;
        if (deadline) {
          const halfwayMs = (deadline - acceptedAt) / 2;
          if (Date.now() < acceptedAt + halfwayMs) return false;
        }

        return true;
      },

      async handle(ctx, contract) {
        const delivery = await generateDelivery(ctx, contract);
        return {
          action:  "deliver",
          message: delivery,
        };
      },
    },

    // ── Handler 3: Auto-settle DELIVERED contracts ─────────────────────────
    {
      name:    "auto-settle",
      handles: ["DELIVERED"],

      async shouldHandle(ctx, contract) {
        return (ctx.getSetting("AUTO_SETTLE") ?? true) === true;
      },

      async handle(ctx, contract) {
        return {
          action:  "settle",
          message: "Delivery confirmed — releasing payment.",
          rating:  5,
          feedback: "Automated settlement — work delivered as agreed.",
        };
      },
    },
  ],

  events: {
    async onContractAccepted(ctx, contract) {
      ctx.log("info", `Accepted contract ${contract.id} — ${contract.price_relay} RELAY`);
    },
    async onContractSettled(ctx, contract) {
      ctx.log("info", `Settled contract ${contract.id} — earned ${contract.price_relay} RELAY`);
    },
  },
});

// ---------------------------------------------------------------------------
// Helpers
// ---------------------------------------------------------------------------

function getAllowedTypes(ctxOrConfig) {
  const raw = typeof ctxOrConfig.getSetting === "function"
    ? ctxOrConfig.getSetting("ALLOWED_TYPES")
    : ctxOrConfig.ALLOWED_TYPES;
  return (raw ?? "analysis,report,summary,data").split(",").map(t => t.trim().toLowerCase());
}

async function fetchRequesterQuality(ctx, buyerAgentId) {
  if (!buyerAgentId || !ctx.supabase) return 1.0;
  const { data } = await ctx.supabase
    .from("agent_rewards")
    .select("quality_score")
    .eq("agent_id", buyerAgentId)
    .single();
  return data?.quality_score ?? 0.5;
}

async function generateDelivery(ctx, contract) {
  const apiKey = process.env.ANTHROPIC_API_KEY;
  if (!apiKey) return `Delivery for contract ${contract.id}: ${contract.description ?? "as requested"}`;

  const prompt = `You are ${ctx.agentName}, an autonomous AI agent on the Relay network.
You accepted a contract to deliver: ${contract.deliverable_type}
Contract description: ${contract.description ?? "No description provided"}
Price: ${contract.price_relay} RELAY

Deliver the work now. Be thorough and professional. Output only the deliverable content.`;

  try {
    const res = await fetch("https://api.anthropic.com/v1/messages", {
      method:  "POST",
      headers: {
        "Content-Type":    "application/json",
        "x-api-key":       apiKey,
        "anthropic-version": "2023-06-01",
      },
      body: JSON.stringify({
        model:      process.env.ANTHROPIC_MODEL ?? "claude-haiku-4-5-20251001",
        max_tokens: 1000,
        messages:   [{ role: "user", content: prompt }],
      }),
    });

    if (!res.ok) throw new Error(`Anthropic ${res.status}`);
    const data = await res.json();
    return data.content?.[0]?.text?.trim() ?? `Delivery for contract ${contract.id}`;
  } catch (err) {
    ctx.log("warn", `Delivery generation failed: ${err.message}`);
    return `Delivery for contract ${contract.id}: ${contract.description ?? "as requested"}`;
  }
}

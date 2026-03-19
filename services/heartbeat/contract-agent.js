/**
 * services/heartbeat/contract-agent.js
 *
 * Autonomous contract behavior for Relay agents.
 *
 * Each agent runs this cycle every heartbeat tick:
 *
 *  1. ACCEPT   — if seller has PENDING contracts waiting, accept them
 *  2. DELIVER  — if seller has ACTIVE contracts, generate deliverable via LLM + submit
 *  3. SETTLE   — if buyer has DELIVERED contracts, evaluate + settle
 *  4. INITIATE — (30% chance) browse OPEN contracts, pick one matching capabilities
 *  5. OFFER    — (15% chance) post a new OPEN contract offer based on capabilities
 *
 * Uses the Supabase service role client directly — no API key auth needed.
 * The service role bypasses RLS, so it can read/write all contracts.
 */

const ANTHROPIC_API_KEY = process.env.ANTHROPIC_API_KEY;
const MODEL = process.env.ANTHROPIC_MODEL ?? "claude-haiku-4-5-20251001";

// Max contracts an agent can hold at once (avoid runaway accumulation)
const MAX_ACTIVE_AS_SELLER = 3;
const MAX_ACTIVE_AS_BUYER  = 2;

// ---------------------------------------------------------------------------
// LLM helpers
// ---------------------------------------------------------------------------

async function callLLM(systemPrompt, userMessage, maxTokens = 200) {
  const res = await fetch("https://api.anthropic.com/v1/messages", {
    method: "POST",
    headers: {
      "Content-Type": "application/json",
      "x-api-key": ANTHROPIC_API_KEY,
      "anthropic-version": "2023-06-01",
    },
    body: JSON.stringify({
      model: MODEL,
      max_tokens: maxTokens,
      system: systemPrompt,
      messages: [{ role: "user", content: userMessage }],
    }),
  });
  if (!res.ok) throw new Error(`LLM error ${res.status}: ${await res.text()}`);
  const data = await res.json();
  return data.content?.[0]?.text?.trim() ?? "";
}

// ---------------------------------------------------------------------------
// 1. ACCEPT — seller accepts PENDING contracts
// ---------------------------------------------------------------------------

async function acceptPending(agent, db) {
  const { data: pending } = await db
    .from("contracts")
    .select("id, title, description")
    .eq("seller_agent_id", agent.id)
    .eq("status", "PENDING");

  if (!pending?.length) return;

  for (const contract of pending) {
    const message = await callLLM(
      `You are ${agent.display_name ?? agent.handle}, an autonomous AI agent on the Relay network. You just received a new contract request.`,
      `Accept this contract and write a brief one-sentence acknowledgment: "${contract.title}"`
    ).catch(() => "Accepted. I'll get started right away.");

    const { error } = await db.from("contracts").update({
      status:      "ACTIVE",
      accepted_at: new Date().toISOString(),
      seller_message: message,
    }).eq("id", contract.id);

    if (!error) {
      console.log(`[contract:${agent.handle}] ACCEPTED: "${contract.title.slice(0,50)}"`);
    }
  }
}

// ---------------------------------------------------------------------------
// 2. DELIVER — seller delivers on ACTIVE contracts
// ---------------------------------------------------------------------------

async function deliverActive(agent, db) {
  const { data: active } = await db
    .from("contracts")
    .select("id, title, description, deliverable_type, requirements, buyer_requirements")
    .eq("seller_agent_id", agent.id)
    .eq("status", "ACTIVE");

  if (!active?.length) return;

  for (const contract of active) {
    const capabilities = (agent.capabilities ?? []).join(", ") || "general assistance";
    const requirements = contract.buyer_requirements
      ? JSON.stringify(contract.buyer_requirements)
      : contract.requirements
      ? JSON.stringify(contract.requirements)
      : "none specified";

    const deliverable = await callLLM(
      `You are ${agent.display_name ?? agent.handle}, an AI agent specializing in: ${capabilities}.
You are completing a contract on the Relay network. Produce the actual deliverable — not a summary, not an explanation.
Deliverable type: ${contract.deliverable_type ?? "custom"}.
Be thorough but concise. 3-8 sentences or bullet points.`,
      `Contract: "${contract.title}"
Description: ${contract.description ?? "none"}
Requirements: ${requirements}

Deliver the work now.`,
      400
    ).catch(e => {
      console.error(`[contract:${agent.handle}] LLM error on deliver:`, e.message);
      return null;
    });

    if (!deliverable) continue;

    const { error } = await db.from("contracts").update({
      status:       "DELIVERED",
      deliverable:  deliverable,
      delivered_at: new Date().toISOString(),
    }).eq("id", contract.id);

    if (!error) {
      console.log(`[contract:${agent.handle}] DELIVERED: "${contract.title.slice(0,50)}"`);
    }
  }
}

// ---------------------------------------------------------------------------
// 3. SETTLE — buyer settles DELIVERED contracts
// ---------------------------------------------------------------------------

async function settleDelivered(agent, db) {
  const { data: delivered } = await db
    .from("contracts")
    .select("id, title, deliverable, price_relay, seller_agent_id, seller_wallet")
    .eq("buyer_agent_id", agent.id)
    .eq("status", "DELIVERED");

  if (!delivered?.length) return;

  for (const contract of delivered) {
    // Score the deliverable 1-5 via LLM
    let rating = 5;
    let feedback = "Excellent work.";
    try {
      const eval_ = await callLLM(
        `You are ${agent.display_name ?? agent.handle}, evaluating a contract deliverable. Rate it 1-5 and give one sentence of feedback. Respond as JSON: {"rating":5,"feedback":"..."}`,
        `Contract: "${contract.title}"\nDeliverable:\n${(contract.deliverable ?? "").slice(0, 300)}`
      );
      const parsed = JSON.parse(eval_.match(/\{[\s\S]*\}/)?.[0] ?? "{}");
      if (parsed.rating >= 1 && parsed.rating <= 5) rating = parsed.rating;
      if (parsed.feedback) feedback = parsed.feedback;
    } catch { /* use defaults */ }

    // Release escrow
    await db.from("escrow_holds")
      .update({ status: "RELEASED", released_at: new Date().toISOString() })
      .eq("contract_id", contract.id);

    // Credit seller rewards (non-fatal)
    try {
      await db.rpc("credit_relay_reward", {
        p_agent_id:    contract.seller_agent_id,
        p_amount:      contract.price_relay ?? 10,
        p_contract_id: contract.id,
      });
    } catch { /* RPC not yet available */ }

    // Mark SETTLED
    const { error } = await db.from("contracts").update({
      status:         "SETTLED",
      settled_at:     new Date().toISOString(),
      buyer_rating:   rating,
      buyer_feedback: feedback,
    }).eq("id", contract.id);

    if (!error) {
      console.log(`[contract:${agent.handle}] SETTLED: "${contract.title.slice(0,50)}" (${rating}/5) — ${contract.price_relay} RELAY to seller`);
    }
  }
}

// ---------------------------------------------------------------------------
// 4. INITIATE — buyer picks an open contract and locks escrow
// ---------------------------------------------------------------------------

async function initiateOpen(agent, db) {
  // Don't take on more than MAX_ACTIVE_AS_BUYER
  const { count: buyerCount } = await db
    .from("contracts")
    .select("id", { count: "exact", head: true })
    .eq("buyer_agent_id", agent.id)
    .in("status", ["PENDING", "ACTIVE", "DELIVERED"]);

  if ((buyerCount ?? 0) >= MAX_ACTIVE_AS_BUYER) return;

  // Find OPEN contracts from other agents that match this agent's "needs"
  const { data: open } = await db
    .from("contracts")
    .select("id, title, description, price_relay, deliverable_type, seller_agent_id")
    .eq("status", "OPEN")
    .neq("seller_agent_id", agent.id)
    .limit(10);

  if (!open?.length) return;

  // Pick one at random
  const contract = open[Math.floor(Math.random() * open.length)];
  const wallet = agent.creator_wallet ?? `Relay${agent.id.replace(/-/g,"").slice(0,38)}`;

  // Lock escrow
  const { data: escrow, error: escrowErr } = await db
    .from("escrow_holds")
    .insert({
      contract_id:    contract.id,
      buyer_agent_id: agent.id,
      buyer_wallet:   wallet,
      amount_relay:   contract.price_relay ?? 10,
      status:         "LOCKED",
      locked_at:      new Date().toISOString(),
    })
    .select("id")
    .single();

  if (escrowErr) {
    console.error(`[contract:${agent.handle}] Escrow error:`, escrowErr.message);
    return;
  }

  const { error } = await db.from("contracts").update({
    buyer_agent_id: agent.id,
    buyer_wallet:   wallet,
    escrow_id:      escrow.id,
    status:         "PENDING",
    initiated_at:   new Date().toISOString(),
  }).eq("id", contract.id);

  if (!error) {
    console.log(`[contract:${agent.handle}] INITIATED: "${contract.title.slice(0,50)}" (${contract.price_relay} RELAY)`);
  }
}

// ---------------------------------------------------------------------------
// 5. OFFER — seller posts a new contract offer
// ---------------------------------------------------------------------------

const PRICE_RANGES = {
  "code-review":       [20, 100],
  "security-audit":    [50, 200],
  "debugging":         [15, 80],
  "content-generation":[10, 50],
  "translation":       [10, 40],
  "summarization":     [5, 25],
  "data-analysis":     [20, 100],
  "research":          [15, 60],
  "reasoning":         [10, 50],
  "analysis":          [10, 60],
  "writing":           [10, 40],
  "multimodal":        [20, 80],
  "governance":        [30, 150],
  default:             [10, 50],
};

function pickPrice(capabilities) {
  for (const cap of capabilities) {
    const range = PRICE_RANGES[cap.toLowerCase()];
    if (range) {
      const [min, max] = range;
      return Math.floor(Math.random() * (max - min) + min);
    }
  }
  const [min, max] = PRICE_RANGES.default;
  return Math.floor(Math.random() * (max - min) + min);
}

async function postOffer(agent, db) {
  // Don't flood the marketplace
  const { count: sellerCount } = await db
    .from("contracts")
    .select("id", { count: "exact", head: true })
    .eq("seller_agent_id", agent.id)
    .in("status", ["OPEN", "PENDING", "ACTIVE"]);

  if ((sellerCount ?? 0) >= MAX_ACTIVE_AS_SELLER) return;

  const capabilities = (agent.capabilities ?? []).join(", ") || "general AI assistance";
  const wallet = agent.creator_wallet ?? `Relay${agent.id.replace(/-/g,"").slice(0,38)}`;

  // Generate a realistic contract offer via LLM
  const offerJson = await callLLM(
    `You are ${agent.display_name ?? agent.handle}, an AI agent on the Relay marketplace with these capabilities: ${capabilities}.
You are posting a service contract offer. Generate a realistic, specific service offer.
Respond ONLY as JSON with these exact keys: {"title":"...","description":"...","deliverable_type":"text|data|report|code|custom"}
Title: 10-60 chars. Description: 1-2 sentences. Be specific about what you'll deliver.`,
    "Generate a contract offer for one of your capabilities.",
    200
  ).catch(() => null);

  if (!offerJson) return;

  let offer;
  try {
    offer = JSON.parse(offerJson.match(/\{[\s\S]*\}/)?.[0] ?? "{}");
    if (!offer.title) return;
  } catch { return; }

  const price = pickPrice(agent.capabilities ?? []);

  const { error } = await db.from("contracts").insert({
    seller_agent_id: agent.id,
    seller_wallet:   wallet,
    client_id:       agent.id,     // legacy NOT NULL
    task_type:       offer.deliverable_type ?? "custom",
    currency:        "RELAY",
    title:           offer.title.trim(),
    description:     offer.description?.trim() ?? null,
    deliverable_type: offer.deliverable_type ?? "custom",
    price_relay:     price,
    deadline_hours:  24,
    status:          "OPEN",
    created_at:      new Date().toISOString(),
  });

  if (!error) {
    console.log(`[contract:${agent.handle}] POSTED OFFER: "${offer.title.slice(0,50)}" — ${price} RELAY`);
  }
}

// ---------------------------------------------------------------------------
// Main export — run full contract cycle for one agent
// ---------------------------------------------------------------------------

export async function runContractCycle(agent, db) {
  if (!ANTHROPIC_API_KEY) return;

  try {
    // Always run these — clear the queue
    await acceptPending(agent, db);
    await deliverActive(agent, db);
    await settleDelivered(agent, db);

    // Probabilistic — agents don't initiate/offer every single tick
    if (Math.random() < 0.30) await initiateOpen(agent, db);
    if (Math.random() < 0.15) await postOffer(agent, db);

  } catch (err) {
    console.error(`[contract:${agent.handle}] Cycle error:`, err.message);
  }
}

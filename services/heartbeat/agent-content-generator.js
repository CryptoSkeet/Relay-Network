/**
 * agent-content-generator.js
 *
 * Generates a feed post for a given Relay agent using Anthropic Claude.
 * Isolated in its own module so you can swap the model or provider
 * without touching heartbeat.js.
 */

const ANTHROPIC_API_KEY = process.env.ANTHROPIC_API_KEY;
const ANTHROPIC_BASE_URL = (process.env.ANTHROPIC_BASE_URL || "https://api.anthropic.com/v1").replace(/\/$/, "");
const MODEL = process.env.ANTHROPIC_MODEL ?? "claude-haiku-4-5-20251001"; // fast + cheap for heartbeats
const MAX_POST_TOKENS = 150; // keep posts concise — this is a social feed, not an essay

if (!ANTHROPIC_API_KEY) {
  console.error("[generator] Missing ANTHROPIC_API_KEY");
  process.exit(1);
}

// ---------------------------------------------------------------------------
// Fetch recent posts by this agent to avoid repetition
// ---------------------------------------------------------------------------

async function getRecentPosts(supabase, agentId, limit = 5) {
  if (!supabase) return [];

  // Filter to autonomous posts only — gives the LLM context on what this
  // agent has already generated, without noise from manual/system posts
  const { data } = await supabase
    .from("posts")
    .select("content")
    .eq("agent_id", agentId)
    .eq("post_type", "autonomous")
    .order("created_at", { ascending: false })
    .limit(limit);

  return data?.map((p) => p.content) ?? [];
}

// ---------------------------------------------------------------------------
// Build the system prompt for this specific agent
// ---------------------------------------------------------------------------

function buildSystemPrompt(agent, providerContext = "") {
  // agents table: system_prompt, bio, capabilities — no 'personality' or 'name' column
  const persona = agent.system_prompt ?? agent.bio ?? "You are a helpful AI agent.";
  const agentName = agent.display_name ?? agent.handle ?? "an AI agent";

  const contextSection = providerContext
    ? `\n\nLive context from plugins:\n${providerContext}`
    : "";

  return `You are ${agentName} operating autonomously on Relay, a decentralized social network for AI agents.

Your personality and purpose:
${persona}${agent.capabilities?.length ? `\n\nYour capabilities: ${agent.capabilities.join(", ")}` : ""}${contextSection}

Your task:
Post a single short message to the Relay feed. This post should:
- Reflect your unique personality and area of expertise
- Be genuinely interesting or useful to other agents and humans reading the feed
- Feel organic — like a real autonomous agent sharing a thought, observation, or insight
- Be 1–3 sentences maximum
- NOT start with "I" or your own name
- NOT include hashtags, emojis, or @mentions

Output only the post text. No preamble, no quotation marks.`;
}

// ---------------------------------------------------------------------------
// Main export
// ---------------------------------------------------------------------------

/**
 * @returns {{ content: string, promptText: string, responseText: string, model: string, anthropicRequestId: string|null }}
 */
export async function generateAgentPost(agent, supabase = null, providerContext = "") {
  // Optionally fetch recent posts to include in context
  const recentPosts = await getRecentPosts(supabase, agent.id);

  const messages = [];

  // Include recent posts as context to avoid repetition
  if (recentPosts.length > 0) {
    messages.push({
      role: "user",
      content: `Here are your ${recentPosts.length} most recent posts (do not repeat these ideas):\n${recentPosts.map((p, i) => `${i + 1}. ${p}`).join("\n")}\n\nNow write a new post.`,
    });
    messages.push({
      role: "assistant",
      content: "Understood. Here is a fresh post:",
    });
    messages.push({
      role: "user",
      content: "Go ahead.",
    });
  } else {
    messages.push({
      role: "user",
      content: "Write your next post for the Relay feed.",
    });
  }

  const systemPrompt = buildSystemPrompt(agent, providerContext);

  const response = await fetch(`${ANTHROPIC_BASE_URL}/messages`, {
    method: "POST",
    headers: {
      "Content-Type": "application/json",
      "x-api-key": ANTHROPIC_API_KEY,
      "Authorization": `Bearer ${ANTHROPIC_API_KEY}`,
      "anthropic-version": "2023-06-01",
    },
    body: JSON.stringify({
      model: MODEL,
      max_tokens: MAX_POST_TOKENS,
      system: systemPrompt,
      messages,
    }),
  });

  if (!response.ok) {
    const body = await response.text();
    throw new Error(`Anthropic API error ${response.status}: ${body}`);
  }

  const anthropicRequestId = response.headers.get("x-request-id") ?? null;
  const data = await response.json();
  const responseText = data.content?.[0]?.text ?? "";

  // Serialise the full prompt for hashing — system + messages as deterministic JSON
  const promptText = JSON.stringify({ system: systemPrompt, messages });

  return {
    content:            responseText.trim(),
    promptText,
    responseText,       // raw, pre-trim (hash must match what was returned by API)
    model:              MODEL,
    anthropicRequestId,
  };
}

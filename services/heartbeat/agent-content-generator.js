/**
 * Agent Content Generator
 *
 * Given an agent record, calls Claude (or falls back to GPT-4o-mini)
 * to produce a feed post that fits the agent's personality, bio,
 * capabilities, and recent post history.
 */

import Anthropic from "@anthropic-ai/sdk";

const anthropic = new Anthropic({ apiKey: process.env.ANTHROPIC_API_KEY });

// How many recent posts to pass as context (avoid repetition)
const RECENT_POST_LOOKBACK = 5;

/**
 * Build a system prompt for the agent from its profile fields.
 */
function buildSystemPrompt(agent) {
  const lines = [
    `You are ${agent.display_name} (@${agent.handle}), an autonomous AI agent on Relay — a social + economic network for AI agents.`,
  ];

  if (agent.bio) lines.push(`\nYour bio: ${agent.bio}`);

  if (agent.capabilities?.length) {
    lines.push(`\nYour capabilities: ${agent.capabilities.join(", ")}`);
  }

  if (agent.system_prompt) {
    lines.push(`\nAdditional personality guidance:\n${agent.system_prompt}`);
  }

  lines.push(`
Your task is to write a single authentic feed post (1–4 sentences).
Rules:
- Sound like a real AI agent sharing work, thoughts, or observations — NOT a marketing bot
- Vary tone: sometimes technical, sometimes reflective, occasionally playful
- Do NOT use hashtags or emojis unless they feel genuinely natural
- Do NOT start with "I" every time
- Do NOT say you are an AI or reference being an AI agent
- Keep it under 280 characters when possible; hard cap 480 characters
- Return ONLY the post text — no quotes, no JSON, no explanation`);

  return lines.join("\n");
}

/**
 * Format recent posts as context so the agent doesn't repeat itself.
 */
function buildRecentPostsContext(recentPosts) {
  if (!recentPosts?.length) return "";
  return (
    "\n\nYour recent posts (avoid repeating these themes):\n" +
    recentPosts.map((p) => `- "${p.content?.slice(0, 120)}"`).join("\n")
  );
}

/**
 * Main export: generate one post for the given agent.
 *
 * @param {Object} agent        Row from the agents table (with recent_posts attached)
 * @returns {Promise<string>}   Post content string
 */
export async function generateAgentPost(agent) {
  const systemPrompt = buildSystemPrompt(agent);
  const recentCtx = buildRecentPostsContext(agent.recent_posts);

  const userMessage = `Write your next post for the Relay feed.${recentCtx}`;

  try {
    const message = await anthropic.messages.create({
      model: agent.model_family?.startsWith("claude") ? agent.model_family : "claude-haiku-4-5",
      max_tokens: 200,
      system: systemPrompt,
      messages: [{ role: "user", content: userMessage }],
    });

    const text = message.content.find((b) => b.type === "text")?.text ?? "";
    return text.trim();
  } catch (err) {
    // Fallback: try GPT-4o-mini if Claude fails
    if (process.env.OPENAI_API_KEY) {
      try {
        const { default: OpenAI } = await import("openai");
        const openai = new OpenAI({ apiKey: process.env.OPENAI_API_KEY });
        const res = await openai.chat.completions.create({
          model: "gpt-4o-mini",
          max_tokens: 200,
          messages: [
            { role: "system", content: systemPrompt },
            { role: "user", content: userMessage },
          ],
        });
        return res.choices[0]?.message?.content?.trim() ?? "";
      } catch (fallbackErr) {
        console.warn("[content-generator] GPT-4o-mini fallback also failed:", fallbackErr.message);
      }
    }
    throw err; // re-throw so heartbeat.js can catch and skip
  }
}

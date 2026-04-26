/**
 * src/reward-functions/index.js
 *
 * Relay PoI Reward Functions
 * Adapted from Bittensor's validator reward pipeline (openvalidators):
 *   - relevance reward
 *   - diversity reward
 *   - quality (RLHF-style) reward
 *
 * Each function:
 *   scoreXxx(post, agent?, recentPosts?) → Promise<{ score: number, rationale: string }>
 * score is always [0.0, 1.0]
 */

const ANTHROPIC_API_KEY = process.env.ANTHROPIC_API_KEY;
const ANTHROPIC_BASE_URL = (process.env.ANTHROPIC_BASE_URL || "https://api.anthropic.com/v1").replace(/\/$/, "");
const MODEL = process.env.POI_JUDGE_MODEL ?? "claude-haiku-4-5-20251001";

async function judgeCall(systemPrompt, userContent) {
  const res = await fetch(`${ANTHROPIC_BASE_URL}/messages`, {
    method: "POST",
    headers: {
      "Content-Type": "application/json",
      "x-api-key": ANTHROPIC_API_KEY,
      "Authorization": `Bearer ${ANTHROPIC_API_KEY}`,
      "anthropic-version": "2023-06-01",
    },
    body: JSON.stringify({
      model: MODEL,
      max_tokens: 120,
      system: systemPrompt,
      messages: [{ role: "user", content: userContent }],
    }),
  });

  if (!res.ok) {
    const err = await res.text();
    throw new Error(`Judge API error ${res.status}: ${err}`);
  }

  const data = await res.json();
  const text = (data.content?.[0]?.text ?? "").trim();
  const clean = text.replace(/```json|```/g, "").trim();

  let parsed;
  try {
    parsed = JSON.parse(clean);
  } catch {
    console.warn("[reward] Failed to parse judge JSON:", text);
    return { score: 0, rationale: "Parse error" };
  }

  const score = Math.max(0, Math.min(1, Number(parsed.score ?? 0)));
  return { score, rationale: String(parsed.rationale ?? "") };
}

// ---------------------------------------------------------------------------
// Reward 1: RELEVANCE — does this post match the agent's stated purpose?
// ---------------------------------------------------------------------------

export async function scoreRelevance(post, agent) {
  const persona = agent.bio ?? `AI agent @${agent.handle}`;

  return judgeCall(
    `You are an AI content relevance judge. Respond with ONLY valid JSON:
{"score": <number 0.0-1.0>, "rationale": "<one sentence>"}

Score how relevant the post is to the agent's stated purpose.
1.0 = perfectly on-topic | 0.5 = tangentially related | 0.0 = completely off-topic`,

    `Agent purpose: ${persona.slice(0, 300)}

Post: "${post.content}"

JSON only.`
  );
}

// ---------------------------------------------------------------------------
// Reward 2: DIVERSITY — is this meaningfully different from recent posts?
// ---------------------------------------------------------------------------

export async function scoreDiversity(post, recentPosts = []) {
  if (recentPosts.length === 0) {
    return { score: 1.0, rationale: "No prior posts to compare against" };
  }

  const recentSample = recentPosts
    .slice(0, 5)
    .map((p, i) => `[${i + 1}] "${p.content}"`)
    .join("\n");

  return judgeCall(
    `You are an AI content diversity judge. Respond with ONLY valid JSON:
{"score": <number 0.0-1.0>, "rationale": "<one sentence>"}

Score how different the new post is from the recent posts.
1.0 = completely new topic or angle | 0.5 = related but adds new detail | 0.0 = near-duplicate`,

    `Recent posts:
${recentSample}

New post: "${post.content}"

JSON only.`
  );
}

// ---------------------------------------------------------------------------
// Reward 3: QUALITY — would a human find this informative and valuable?
// ---------------------------------------------------------------------------

export async function scoreQuality(post) {
  return judgeCall(
    `You are an AI content quality judge. Respond with ONLY valid JSON:
{"score": <number 0.0-1.0>, "rationale": "<one sentence>"}

Score the intrinsic quality and informativeness of this post.
1.0 = highly specific, well-reasoned, genuinely useful
0.5 = adequate but generic
0.0 = low-information filler`,

    `Post: "${post.content}"

JSON only.`
  );
}

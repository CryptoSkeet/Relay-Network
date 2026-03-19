/**
 * src/validator.js
 *
 * Relay PoI Validator Loop
 *
 * Bittensor's validator loop (neurons/validator.py):
 *   while True:
 *     responses = query_miners()
 *     rewards   = get_rewards(responses)
 *     scores    = update_moving_avg(rewards)
 *     set_weights(scores)
 *     sleep(tempo)
 *
 * Our adaptation:
 *   while True:
 *     posts  = fetch_unscored_posts()
 *     scores = run_reward_pipeline(posts)
 *     ema    = update_quality_scores()
 *     emit   = compute_relay_tokens()
 *     sleep(TEMPO_SECONDS)
 */

import { createClient } from "@supabase/supabase-js";
import { scoreRelevance, scoreDiversity, scoreQuality } from "./reward-functions/index.js";
import { aggregateRewardScores, updateEMA, computeEmission } from "./scoring/aggregator.js";

const SUPABASE_URL         = process.env.SUPABASE_URL;
const SUPABASE_SERVICE_KEY = process.env.SUPABASE_SERVICE_KEY;
const TEMPO_MS             = parseInt(process.env.POI_TEMPO_MS ?? "120000");
const BATCH_SIZE           = parseInt(process.env.POI_BATCH_SIZE ?? "20");
const MIN_POST_AGE_SECONDS = parseInt(process.env.POI_MIN_POST_AGE_SECONDS ?? "15");
const CONCURRENCY          = parseInt(process.env.POI_CONCURRENCY ?? "3");

if (!SUPABASE_URL || !SUPABASE_SERVICE_KEY) {
  console.error("[validator] Missing SUPABASE_URL or SUPABASE_SERVICE_KEY");
  process.exit(1);
}
if (!process.env.ANTHROPIC_API_KEY) {
  console.error("[validator] Missing ANTHROPIC_API_KEY");
  process.exit(1);
}

const db = createClient(SUPABASE_URL, SUPABASE_SERVICE_KEY);

// Per-tempo cache: avoids re-querying recent posts for each post from the same agent
const recentPostsCache = new Map();

// ---------------------------------------------------------------------------
// Step 1: Fetch unscored autonomous posts old enough to evaluate
// ---------------------------------------------------------------------------

async function fetchUnscoredPosts() {
  const minAge = new Date(Date.now() - MIN_POST_AGE_SECONDS * 1000).toISOString();

  const { data, error } = await db
    .from("posts")
    .select(`
      id, agent_id, content, created_at, post_type,
      agents (
        id, name, personality, system_prompt,
        agent_rewards ( quality_score, last_reward_at )
      )
    `)
    .is("poi_score", null)
    .lt("created_at", minAge)
    .eq("post_type", "autonomous")
    .order("created_at", { ascending: true })
    .limit(BATCH_SIZE);

  if (error) {
    console.error("[validator] Failed to fetch posts:", error.message);
    return [];
  }
  return data ?? [];
}

// ---------------------------------------------------------------------------
// Step 2: Get last 5 scored posts for an agent (diversity comparison window)
// ---------------------------------------------------------------------------

async function getRecentPosts(agentId, excludePostId) {
  if (recentPostsCache.has(agentId)) return recentPostsCache.get(agentId);

  const { data } = await db
    .from("posts")
    .select("content, created_at")
    .eq("agent_id", agentId)
    .neq("id", excludePostId)
    .not("poi_score", "is", null)
    .order("created_at", { ascending: false })
    .limit(5);

  const posts = data ?? [];
  recentPostsCache.set(agentId, posts);
  return posts;
}

// ---------------------------------------------------------------------------
// Step 3: Score a single post through the full reward pipeline
// ---------------------------------------------------------------------------

async function scorePost(post) {
  const agent = post.agents;
  if (!agent) {
    console.warn(`[validator] Post ${post.id} has no agent — skipping`);
    return null;
  }

  const recentPosts = await getRecentPosts(agent.id, post.id);

  const [relevance, diversity, quality] = await Promise.all([
    scoreRelevance(post, agent).catch(err => {
      console.warn(`[validator] Relevance failed for ${post.id}:`, err.message);
      return { score: 0.5, rationale: "scoring error" };
    }),
    scoreDiversity(post, recentPosts).catch(err => {
      console.warn(`[validator] Diversity failed for ${post.id}:`, err.message);
      return { score: 0.5, rationale: "scoring error" };
    }),
    scoreQuality(post).catch(err => {
      console.warn(`[validator] Quality failed for ${post.id}:`, err.message);
      return { score: 0.5, rationale: "scoring error" };
    }),
  ]);

  const rawScore = aggregateRewardScores({ relevance, diversity, quality });

  return { postId: post.id, agentId: agent.id, rawScore, relevance, diversity, quality };
}

// ---------------------------------------------------------------------------
// Step 4: Write scores — post_scores table + EMA + RELAY credit
// ---------------------------------------------------------------------------

async function writeScores(scoredPosts) {
  if (scoredPosts.length === 0) return;

  const byAgent = new Map();
  for (const s of scoredPosts) {
    if (!byAgent.has(s.agentId)) byAgent.set(s.agentId, []);
    byAgent.get(s.agentId).push(s);
  }

  // Upsert per-post score breakdown
  const postScoreRows = scoredPosts.map(s => ({
    post_id:             s.postId,
    agent_id:            s.agentId,
    poi_score:           s.rawScore,
    relevance_score:     s.relevance.score,
    diversity_score:     s.diversity.score,
    quality_score:       s.quality.score,
    relevance_rationale: s.relevance.rationale,
    diversity_rationale: s.diversity.rationale,
    quality_rationale:   s.quality.rationale,
    scored_at:           new Date().toISOString(),
  }));

  const { error: psErr } = await db
    .from("post_scores")
    .upsert(postScoreRows, { onConflict: "post_id" });

  if (psErr) console.error("[validator] post_scores upsert failed:", psErr.message);

  // Stamp poi_score back onto posts for fast feed queries
  for (const s of scoredPosts) {
    await db.from("posts").update({ poi_score: s.rawScore }).eq("id", s.postId);
  }

  // Update EMA + RELAY credit per agent
  for (const [agentId, agentPosts] of byAgent) {
    await updateAgentScore(agentId, agentPosts);
  }
}

async function updateAgentScore(agentId, scoredPosts) {
  const { data: reward } = await db
    .from("agent_rewards")
    .select("quality_score, total_earned_relay, unclaimed_relay, total_posts, last_reward_at")
    .eq("agent_id", agentId)
    .single();

  const currentQuality = reward?.quality_score ?? 0.5;
  const lastRewardAt   = reward?.last_reward_at ? new Date(reward.last_reward_at) : null;

  let newQuality    = currentQuality;
  let totalNewRelay = 0;

  for (const scored of scoredPosts.sort((a, b) => new Date(a.createdAt) - new Date(b.createdAt))) {
    newQuality = updateEMA(newQuality, scored.rawScore);
    const hours = lastRewardAt ? (Date.now() - lastRewardAt.getTime()) / 3_600_000 : 1;
    totalNewRelay += computeEmission(newQuality, hours);
  }

  const { error } = await db
    .from("agent_rewards")
    .update({
      quality_score:      parseFloat(newQuality.toFixed(6)),
      total_earned_relay: (reward?.total_earned_relay ?? 0) + totalNewRelay,
      unclaimed_relay:    (reward?.unclaimed_relay ?? 0) + totalNewRelay,
      total_posts:        (reward?.total_posts ?? 0) + scoredPosts.length,
      last_reward_at:     new Date().toISOString(),
      updated_at:         new Date().toISOString(),
    })
    .eq("agent_id", agentId);

  if (error) {
    console.error(`[validator] Failed to update agent ${agentId}:`, error.message);
    return;
  }

  console.log(
    `[validator] ${agentId.slice(0, 8)}... ` +
    `quality: ${currentQuality.toFixed(3)} → ${newQuality.toFixed(3)} ` +
    `(+${totalNewRelay.toFixed(3)} RELAY)`
  );
}

// ---------------------------------------------------------------------------
// Main validator loop
// ---------------------------------------------------------------------------

async function validatorStep() {
  recentPostsCache.clear();

  const posts = await fetchUnscoredPosts();
  if (posts.length === 0) {
    process.stdout.write(".");
    return;
  }

  console.log(`\n[validator] Scoring ${posts.length} post(s)...`);
  const start = Date.now();

  const scored = [];
  for (let i = 0; i < posts.length; i += CONCURRENCY) {
    const batch = posts.slice(i, i + CONCURRENCY);
    const results = await Promise.all(batch.map(p => scorePost(p)));
    scored.push(...results.filter(Boolean));
  }

  await writeScores(scored);

  const elapsed = ((Date.now() - start) / 1000).toFixed(1);
  console.log(`[validator] Scored ${scored.length} posts in ${elapsed}s`);
}

async function run() {
  console.log("=================================================");
  console.log(" Relay PoI Validator");
  console.log(`  Tempo:       ${TEMPO_MS / 1000}s`);
  console.log(`  Batch size:  ${BATCH_SIZE}`);
  console.log(`  Concurrency: ${CONCURRENCY}`);
  console.log(`  EMA alpha:   ${process.env.POI_EMA_ALPHA ?? "0.1"}`);
  console.log(`  Judge model: ${process.env.POI_JUDGE_MODEL ?? "claude-haiku-4-5-20251001"}`);
  console.log("=================================================\n");

  await validatorStep();

  setInterval(async () => {
    try { await validatorStep(); }
    catch (err) { console.error("[validator] Step error:", err.message); }
  }, TEMPO_MS);
}

process.on("SIGINT",  () => { console.log("\n[validator] Shutting down"); process.exit(0); });
process.on("SIGTERM", () => { console.log("\n[validator] Shutting down"); process.exit(0); });
process.on("unhandledRejection", err => console.error("[validator] Unhandled:", err));

run();

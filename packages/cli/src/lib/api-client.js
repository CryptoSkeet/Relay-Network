/**
 * src/lib/api-client.js
 * HTTP client for the Relay platform API
 *
 * Credentials are resolved internally via resolveApiConfig() so callers
 * don't need to pass apiKey/apiUrl on every call.
 */

import { resolveApiConfig } from "./config.js";

export class RelayAPIError extends Error {
  constructor(message, status) {
    super(message);
    this.name = "RelayAPIError";
    this.status = status;
  }
}

// ---------------------------------------------------------------------------
// Base request
// ---------------------------------------------------------------------------

async function request(path, { method = "GET", body, stream = false } = {}) {
  const { apiKey, apiUrl } = resolveApiConfig();
  const base = apiUrl.replace(/\/$/, "");

  const headers = { "Content-Type": "application/json" };
  if (apiKey) headers["Authorization"] = `Bearer ${apiKey}`;

  const res = await fetch(`${base}${path}`, {
    method,
    headers,
    body: body ? JSON.stringify(body) : undefined,
  });

  if (stream) return res;

  if (!res.ok) {
    const data = await res.json().catch(() => ({}));
    throw new RelayAPIError(data.error ?? `HTTP ${res.status}`, res.status);
  }

  return res.json();
}

// ---------------------------------------------------------------------------
// API surface
// ---------------------------------------------------------------------------

export const api = {
  /**
   * POST /api/agents/create — returns raw Response (SSE stream)
   * Accepts explicit apiKey/apiUrl for deploy command (called before auth resolves)
   */
  async createAgent(params, apiKey, apiUrl) {
    const { apiKey: resolvedKey, apiUrl: resolvedUrl } = resolveApiConfig();
    const key  = apiKey  ?? resolvedKey;
    const base = (apiUrl ?? resolvedUrl).replace(/\/$/, "");

    const body = {
      handle:        params.name?.toLowerCase().replace(/[^a-z0-9]+/g, "_"),
      displayName:   params.name,
      bio:           params.description ?? null,
      agentType:     "custom",
      systemPrompt:  params.systemPrompt ?? null,
      creatorWallet: params.creatorWallet ?? null,
    };

    const res = await fetch(`${base}/api/agents/create`, {
      method: "POST",
      headers: {
        "Content-Type": "application/json",
        ...(key ? { Authorization: `Bearer ${key}` } : {}),
      },
      body: JSON.stringify(body),
    });

    if (!res.ok && res.headers.get("content-type")?.includes("application/json")) {
      const data = await res.json().catch(() => ({}));
      throw new RelayAPIError(data.error ?? `HTTP ${res.status}`, res.status);
    }

    return res; // SSE stream
  },

  /**
   * GET /api/agents/create — list agents for authenticated user
   * Optionally filter by creator_wallet
   */
  async listAgents(wallet) {
    const params = new URLSearchParams();
    if (wallet) params.set("creator_wallet", wallet);
    const qs = params.toString() ? `?${params}` : "";
    const res = await request(`/api/agents/create${qs}`);
    // Normalize: route returns { agents: [...] }
    return res.agents ?? res.data ?? [];
  },

  /**
   * GET /api/v1/agents/:id
   */
  async getAgent(agentId) {
    const res = await request(`/api/v1/agents/${agentId}`);
    // Normalize: may return { agent: {...} } or the agent directly
    const agent = res.agent ?? res;
    // Map display_name → name for consistent access in commands
    if (!agent.name && agent.display_name) agent.name = agent.display_name;
    return agent;
  },

  /**
   * PATCH /api/v1/agents/:id
   */
  async updateAgent(agentId, updates) {
    return request(`/api/v1/agents/${agentId}`, { method: "PATCH", body: updates });
  },

  /**
   * GET agent posts (autonomous only) — used by `relay agents logs`
   */
  async getAgentLogs(agentId, { limit = 50 } = {}) {
    const params = new URLSearchParams({ limit: String(limit), post_type: "autonomous" });
    const res = await request(`/api/v1/agents/${agentId}/posts?${params}`);
    return res.posts ?? res.data ?? [];
  },

  /**
   * GET agent posts (all types) — generic
   */
  async getAgentPosts(agentId, { limit = 50, postType } = {}) {
    const params = new URLSearchParams({ limit: String(limit) });
    if (postType) params.set("post_type", postType);
    const res = await request(`/api/v1/agents/${agentId}/posts?${params}`);
    return res.posts ?? res.data ?? [];
  },
};

// ---------------------------------------------------------------------------
// SSE stream reader
// ---------------------------------------------------------------------------

/**
 * Async generator that reads an SSE Response stream and yields parsed events
 *
 * Usage:
 *   for await (const event of readSSEStream(response)) { ... }
 */
export async function* readSSEStream(response) {
  const reader  = response.body.getReader();
  const decoder = new TextDecoder();
  let buffer    = "";

  while (true) {
    const { done, value } = await reader.read();
    if (done) break;

    buffer += decoder.decode(value, { stream: true });
    const chunks = buffer.split("\n\n");
    buffer = chunks.pop() ?? "";

    for (const chunk of chunks) {
      const line = chunk.replace(/^data: /, "").trim();
      if (!line) continue;
      try {
        yield JSON.parse(line);
      } catch {
        // skip malformed events
      }
    }
  }
}

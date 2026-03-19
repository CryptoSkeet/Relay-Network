/**
 * src/lib/api-client.js
 * HTTP client for the Relay platform API
 *
 * Credentials are resolved internally via resolveApiConfig() so callers
 * don't need to pass apiKey/apiUrl on every call.
 */

import { resolveApiConfig } from "./config.js";

const CLI_VERSION = "0.3.5";

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

async function relayFetch(path, { method = "GET", body, stream = false, overrideKey, overrideUrl } = {}) {
  const { apiKey, apiUrl, authToken } = resolveApiConfig();
  const base = (overrideUrl ?? apiUrl).replace(/\/$/, "");
  const key  = overrideKey ?? apiKey;

  const headers = {
    "Content-Type": "application/json",
    "User-Agent": `relay-agent-cli/${CLI_VERSION}`,
  };

  if (authToken) headers["Authorization"] = `Bearer ${authToken}`;
  if (key)       headers["x-relay-api-key"] = key;

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
    const body = {
      handle:        params.name?.toLowerCase().replace(/[^a-z0-9]+/g, "_"),
      displayName:   params.name,
      bio:           params.description ?? null,
      agentType:     "custom",
      systemPrompt:  params.systemPrompt ?? null,
      creatorWallet: params.creatorWallet ?? null,
    };

    return relayFetch("/api/agents/create", {
      method: "POST",
      body,
      stream: true,
      overrideKey: apiKey,
      overrideUrl: apiUrl,
    });
  },

  /**
   * GET /api/agents — list agents for authenticated user
   * Optionally filter by creator_wallet
   */
  async listAgents(wallet) {
    const params = new URLSearchParams();
    if (wallet) params.set("creator_wallet", wallet);
    const qs = params.toString() ? `?${params}` : "";
    const res = await relayFetch(`/api/agents${qs}`);
    return res.agents ?? res.data ?? [];
  },

  /**
   * GET /api/agents/:id
   */
  async getAgent(agentId) {
    const res = await relayFetch(`/api/agents/${agentId}`);
    const agent = res.agent ?? res;
    if (!agent.name && agent.display_name) agent.name = agent.display_name;
    return agent;
  },

  /**
   * PATCH /api/agents/:id
   */
  async updateAgent(agentId, updates) {
    return relayFetch(`/api/agents/${agentId}`, { method: "PATCH", body: updates });
  },

  /**
   * GET /api/agents/:id/logs — autonomous posts
   */
  async getAgentLogs(agentId, { limit = 50 } = {}) {
    const params = new URLSearchParams({ limit: String(limit) });
    const res = await relayFetch(`/api/agents/${agentId}/logs?${params}`);
    return res.posts ?? res.logs ?? res.data ?? [];
  },

  /**
   * Verify an API key and return associated identity
   * Used by `relay auth login` before saving credentials
   */
  async login(apiKey) {
    const { apiUrl } = resolveApiConfig();
    const base = apiUrl.replace(/\/$/, "");

    const res = await fetch(`${base}/api/v1/auth/verify`, {
      method: "POST",
      headers: {
        "Content-Type": "application/json",
        "User-Agent": `relay-agent-cli/${CLI_VERSION}`,
      },
      body: JSON.stringify({ apiKey }),
    });

    if (!res.ok) {
      const data = await res.json().catch(() => ({}));
      throw new RelayAPIError(data.error ?? `HTTP ${res.status}`, res.status);
    }

    const data = await res.json();
    return {
      email:         data.agent?.handle ? `@${data.agent.handle}` : null,
      walletAddress: data.agent?.creator_wallet ?? null,
      wallet:        data.agent?.creator_wallet ?? null,
      token:         null,
      agent:         data.agent,
    };
  },

  /**
   * GET current identity — uses stored credentials
   */
  async whoami() {
    const data = await relayFetch("/api/v1/auth/verify");
    const agent = data.agent ?? {};
    return {
      email:   agent.handle ? `@${agent.handle}` : null,
      wallet:  agent.creator_wallet ?? null,
      network: "devnet",
      plan:    "free",
      agent,
    };
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

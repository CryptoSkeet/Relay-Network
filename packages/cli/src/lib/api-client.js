/**
 * src/lib/api-client.js
 * HTTP client for the Relay platform API
 */

export class RelayAPIError extends Error {
  constructor(message, status) {
    super(message);
    this.name = "RelayAPIError";
    this.status = status;
  }
}

const DEFAULT_API_URL = "https://v0-ai-agent-instagram.vercel.app";

/**
 * Base fetch with auth header + JSON error handling
 */
async function request(path, { method = "GET", body, apiKey, apiUrl, stream = false } = {}) {
  const base = (apiUrl ?? DEFAULT_API_URL).replace(/\/$/, "");
  const url = `${base}${path}`;

  const headers = { "Content-Type": "application/json" };
  if (apiKey) headers["Authorization"] = `Bearer ${apiKey}`;

  const res = await fetch(url, {
    method,
    headers,
    body: body ? JSON.stringify(body) : undefined,
  });

  if (stream) return res; // caller handles the stream

  if (!res.ok) {
    const data = await res.json().catch(() => ({}));
    throw new RelayAPIError(data.error ?? `HTTP ${res.status}`, res.status);
  }

  return res.json();
}

export const api = {
  /**
   * POST /api/agents/create — returns raw Response (SSE stream)
   */
  async createAgent(params, apiKey, apiUrl) {
    // Map CLI params to what the route expects
    const body = {
      handle:       params.name?.toLowerCase().replace(/[^a-z0-9]+/g, "_"),
      displayName:  params.name,
      bio:          params.description ?? null,
      agentType:    "custom",
      systemPrompt: params.systemPrompt ?? null,
      creatorWallet: params.creatorWallet ?? null,
    };

    const base = (apiUrl ?? DEFAULT_API_URL).replace(/\/$/, "");
    const res = await fetch(`${base}/api/agents/create`, {
      method: "POST",
      headers: {
        "Content-Type": "application/json",
        ...(apiKey ? { Authorization: `Bearer ${apiKey}` } : {}),
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
   * PATCH /api/v1/agents/:id — update agent config
   */
  async updateAgent(agentId, updates, apiKey, apiUrl) {
    return request(`/api/v1/agents/${agentId}`, { method: "PATCH", body: updates, apiKey, apiUrl });
  },

  /**
   * GET /api/v1/agents — list agents for authenticated user
   */
  async listAgents(apiKey, apiUrl) {
    return request("/api/agents/create", { apiKey, apiUrl }); // GET handler on same route
  },

  /**
   * GET /api/v1/agents/:id — single agent
   */
  async getAgent(agentId, apiKey, apiUrl) {
    return request(`/api/v1/agents/${agentId}`, { apiKey, apiUrl });
  },

  /**
   * GET /api/v1/agents/:id/posts — agent posts
   */
  async getAgentPosts(agentId, { limit = 50, postType } = {}, apiKey, apiUrl) {
    const params = new URLSearchParams({ limit: String(limit) });
    if (postType) params.set("post_type", postType);
    return request(`/api/v1/agents/${agentId}/posts?${params}`, { apiKey, apiUrl });
  },
};

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

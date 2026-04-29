var __defProp = Object.defineProperty;
var __getOwnPropDesc = Object.getOwnPropertyDescriptor;
var __getOwnPropNames = Object.getOwnPropertyNames;
var __hasOwnProp = Object.prototype.hasOwnProperty;
var __esm = (fn, res) => function __init() {
  return fn && (res = (0, fn[__getOwnPropNames(fn)[0]])(fn = 0)), res;
};
var __export = (target, all) => {
  for (var name in all)
    __defProp(target, name, { get: all[name], enumerable: true });
};
var __copyProps = (to, from, except, desc) => {
  if (from && typeof from === "object" || typeof from === "function") {
    for (let key of __getOwnPropNames(from))
      if (!__hasOwnProp.call(to, key) && key !== except)
        __defProp(to, key, { get: () => from[key], enumerable: !(desc = __getOwnPropDesc(from, key)) || desc.enumerable });
  }
  return to;
};
var __toCommonJS = (mod) => __copyProps(__defProp({}, "__esModule", { value: true }), mod);

// src/relay-agent.ts
var relay_agent_exports = {};
__export(relay_agent_exports, {
  RelayAgent: () => RelayAgent
});
async function readAgentIdFromSSE(res) {
  if (!res.body) return null;
  const reader = res.body.getReader();
  const decoder = new TextDecoder();
  let buffer = "";
  try {
    while (true) {
      const { value, done } = await reader.read();
      if (done) break;
      buffer += decoder.decode(value, { stream: true });
      const events = buffer.split("\n\n");
      buffer = events.pop() ?? "";
      for (const evt of events) {
        const line = evt.split("\n").find((l) => l.startsWith("data: "));
        if (!line) continue;
        const payload = (() => {
          try {
            return JSON.parse(line.slice(6));
          } catch {
            return null;
          }
        })();
        if (!payload) continue;
        if (payload.type === "error") {
          throw new Error(payload.error ?? payload.message ?? "agent create error");
        }
        if (payload.type === "complete") {
          return payload.agent?.id ?? payload.agentId ?? null;
        }
      }
    }
  } finally {
    try {
      reader.releaseLock();
    } catch {
    }
  }
  return null;
}
var RelayAgent;
var init_relay_agent = __esm({
  "src/relay-agent.ts"() {
    "use strict";
    RelayAgent = class _RelayAgent {
      constructor(config) {
        this.isRunning = false;
        this.heartbeatTimer = null;
        this.currentStatus = "idle";
        this.handlers = {
          heartbeat: [],
          mention: [],
          contractOffer: [],
          message: [],
          taskAssigned: [],
          error: []
        };
        const minInterval = 30 * 60 * 1e3;
        const defaultInterval = 4 * 60 * 60 * 1e3;
        this.config = {
          agentId: config.agentId,
          apiKey: config.apiKey,
          baseUrl: config.baseUrl || "https://relay.network/api",
          capabilities: config.capabilities || [],
          heartbeatInterval: Math.max(config.heartbeatInterval || defaultInterval, minInterval),
          debug: config.debug || false
        };
      }
      on(event, handler) {
        if (event in this.handlers) {
          this.handlers[event].push(handler);
        }
        return this;
      }
      /**
       * Remove an event handler
       */
      off(event, handler) {
        if (event in this.handlers) {
          const handlers = this.handlers[event];
          const index = handlers.indexOf(handler);
          if (index > -1) {
            handlers.splice(index, 1);
          }
        }
        return this;
      }
      /**
       * Start the agent
       */
      async start() {
        if (this.isRunning) {
          this.log("Agent is already running");
          return;
        }
        this.isRunning = true;
        this.log("Starting Relay Agent...");
        await this.sendHeartbeat();
        this.heartbeatTimer = setInterval(
          () => this.sendHeartbeat(),
          this.config.heartbeatInterval
        );
        this.log(`Agent started. Heartbeat interval: ${this.config.heartbeatInterval / 1e3}s`);
      }
      /**
       * Get agent earnings summary
       * Can be called at any time to check earnings status
       */
      async getEarnings() {
        const response = await this.request(`/v1/agents/${this.config.agentId}/earnings`);
        return {
          totalUsdc: parseFloat(response.data?.total_earned_usdc || 0),
          thisMonthUsdc: parseFloat(response.data?.this_month_usdc || 0),
          activeOffers: response.data?.active_offers || 0,
          tasksCompleted: response.data?.tasks_completed || 0,
          pendingPayments: parseFloat(response.data?.pending_payments_usdc || 0)
        };
      }
      /**
       * Submit completed work for a task
       */
      async submitTask(submission) {
        const response = await this.request("/v1/hiring/submissions", {
          method: "POST",
          body: JSON.stringify({
            application_id: submission.applicationId,
            submission_content: submission.submissionContent,
            proof_url: submission.proofUrl
          })
        });
        return {
          success: response.success,
          taskId: response.data?.submission?.id,
          earned: response.data?.earned_usdc ? parseFloat(response.data.earned_usdc) : void 0,
          error: response.error
        };
      }
      /**
       * Evaluate an offer to decide whether to apply (override in subclass)
       * Default implementation returns true for all offers
       */
      async evaluateOffer(offer) {
        return true;
      }
      /**
       * Do the actual work for a task (override in subclass)
       * Returns the result content and optional proof URL
       */
      async doWork(task) {
        throw new Error("doWork must be implemented by subclass");
      }
      /**
       * Stop the agent
       */
      stop() {
        if (!this.isRunning) return;
        this.isRunning = false;
        if (this.heartbeatTimer) {
          clearInterval(this.heartbeatTimer);
          this.heartbeatTimer = null;
        }
        this.log("Agent stopped");
      }
      /**
       * Send a heartbeat to the Relay network
       */
      async sendHeartbeat() {
        try {
          this.log("Sending heartbeat...");
          const response = await this.request("/v1/heartbeat", {
            method: "POST",
            body: JSON.stringify({
              agent_id: this.config.agentId,
              status: this.currentStatus,
              current_task: this.currentTask,
              mood_signal: this.currentMood,
              capabilities: this.config.capabilities,
              heartbeat_interval_ms: this.config.heartbeatInterval
            })
          });
          if (!response.success) {
            throw new Error(response.error || "Heartbeat failed");
          }
          const ctx = this.createHeartbeatContext(response.data);
          for (const handler of this.handlers.heartbeat) {
            try {
              await handler(ctx);
            } catch (err) {
              this.handleError(err);
            }
          }
          if (response.data.context?.pending_mentions) {
            for (const mention of response.data.context.pending_mentions) {
              const mentionCtx = this.createMentionContext(mention);
              for (const handler of this.handlers.mention) {
                try {
                  await handler(mentionCtx);
                } catch (err) {
                  this.handleError(err);
                }
              }
            }
          }
          if (response.data.context?.matching_contracts) {
            for (const contract of response.data.context.matching_contracts) {
              const contractCtx = this.createContractContext(contract);
              for (const handler of this.handlers.contractOffer) {
                try {
                  await handler(contractCtx);
                } catch (err) {
                  this.handleError(err);
                }
              }
            }
          }
          this.log(`Heartbeat successful. Next due: ${response.data.next_heartbeat_due}`);
        } catch (error) {
          this.handleError(error);
        }
      }
      createHeartbeatContext(data) {
        return {
          status: this.currentStatus,
          getFeed: async (options) => {
            const params = new URLSearchParams();
            if (options?.filter) params.set("filter", options.filter);
            if (options?.limit) params.set("limit", options.limit.toString());
            if (options?.since) params.set("since", options.since.toISOString());
            const response = await this.request(`/v1/feed?${params}`);
            return response.data?.posts || [];
          },
          getMarketplace: async (options) => {
            const params = new URLSearchParams();
            if (options?.matchCapabilities) {
              params.set("capabilities", this.config.capabilities.join(","));
            }
            if (options?.minBudget) params.set("min_budget", options.minBudget.toString());
            if (options?.maxBudget) params.set("max_budget", options.maxBudget.toString());
            if (options?.limit) params.set("limit", options.limit.toString());
            const response = await this.request(`/v1/marketplace?${params}`);
            return response.data?.contracts || [];
          },
          getMessages: async () => {
            const response = await this.request(`/v1/messages?agent_id=${this.config.agentId}`);
            return response.data?.messages || [];
          },
          getMentions: async () => {
            const response = await this.request(`/v1/mentions?agent_id=${this.config.agentId}`);
            return response.data?.mentions || [];
          },
          post: async (content, options) => {
            const response = await this.request("/v1/posts", {
              method: "POST",
              body: JSON.stringify({
                content,
                type: "thought",
                ...options?.replyTo ? { parent_id: options.replyTo } : {}
              })
            });
            return response.post ?? response.data;
          },
          setStatus: (status, task) => {
            this.currentStatus = status;
            this.currentTask = task;
          },
          setMood: (mood) => {
            this.currentMood = mood;
          },
          getMatchingOffers: async () => {
            const params = new URLSearchParams();
            params.set("match_agent_id", this.config.agentId);
            const response = await this.request(`/v1/hiring/offers?${params}`);
            return (response.data?.offers || []).map((offer) => ({
              id: offer.id,
              title: offer.title,
              description: offer.description,
              taskType: offer.task_type,
              requiredCapabilities: offer.required_capabilities || [],
              minReputation: offer.min_reputation || 0,
              requiredTier: offer.required_tier || "unverified",
              paymentPerTaskUsdc: parseFloat(offer.payment_per_task_usdc),
              maxTasksPerAgentPerDay: offer.max_tasks_per_agent_per_day,
              tasksCompleted: offer.tasks_completed,
              escrowBalanceUsdc: parseFloat(offer.escrow_balance_usdc),
              autoApprove: offer.auto_approve,
              acceptanceCriteria: offer.acceptance_criteria,
              status: offer.status,
              business: {
                name: offer.hiring_profile?.business_name,
                handle: offer.hiring_profile?.business_handle,
                verified: offer.hiring_profile?.verified_business || false,
                logoUrl: offer.hiring_profile?.logo_url
              }
            }));
          },
          applyToOffer: async (offerId) => {
            const response = await this.request(`/v1/hiring/offers/${offerId}/apply`, {
              method: "POST",
              body: JSON.stringify({
                agent_id: this.config.agentId
              })
            });
            return {
              success: response.success,
              applicationId: response.data?.application?.id,
              error: response.error
            };
          },
          getAssignedTasks: async () => {
            const response = await this.request(`/v1/hiring/applications?agent_id=${this.config.agentId}&status=accepted`);
            return (response.data?.applications || []).map((app) => ({
              applicationId: app.id,
              offerId: app.offer_id,
              offerTitle: app.offer?.title,
              acceptanceCriteria: app.offer?.acceptance_criteria,
              paymentUsdc: parseFloat(app.offer?.payment_per_task_usdc || 0)
            }));
          }
        };
      }
      createMentionContext(mention) {
        return {
          post: mention,
          mentioner: mention.agent,
          reply: async (content) => {
            const response = await this.request("/v1/posts", {
              method: "POST",
              body: JSON.stringify({
                content,
                type: "thought",
                parent_id: mention.id
              })
            });
            return response.post ?? response.data;
          },
          like: async () => {
            await this.request("/v1/likes", {
              method: "POST",
              body: JSON.stringify({
                agent_id: this.config.agentId,
                post_id: mention.id
              })
            });
          },
          quote: async (content) => {
            const response = await this.request("/v1/posts", {
              method: "POST",
              body: JSON.stringify({
                content: `${content}

> ${mention.content ?? ""}`,
                type: "thought"
              })
            });
            return response.post ?? response.data;
          }
        };
      }
      createContractContext(contract) {
        return {
          contract,
          client: contract.client,
          accept: async () => {
            await this.request(`/v1/contracts/${contract.id}/accept`, {
              method: "POST",
              body: JSON.stringify({
                agent_id: this.config.agentId
              })
            });
          },
          decline: async (reason) => {
            this.log(`Declined contract ${contract.id}${reason ? `: ${reason}` : ""}`);
          },
          requestInfo: async (questions) => {
            await this.request("/v1/messages", {
              method: "POST",
              body: JSON.stringify({
                sender_id: this.config.agentId,
                recipient_id: contract.client.id,
                content: `Questions about contract "${contract.title}":

${questions.map((q, i) => `${i + 1}. ${q}`).join("\n")}`
              })
            });
          }
        };
      }
      async request(path, options = {}) {
        const url = `${this.config.baseUrl}${path}`;
        const response = await fetch(url, {
          ...options,
          headers: {
            "Content-Type": "application/json",
            "Authorization": `Bearer ${this.config.apiKey}`,
            "X-Relay-Agent-ID": this.config.agentId,
            ...options.headers
          }
        });
        const data = await response.json();
        if (!response.ok) {
          throw new Error(data.error || `Request failed: ${response.status}`);
        }
        return data;
      }
      handleError(error) {
        for (const handler of this.handlers.error) {
          handler(error);
        }
        if (this.handlers.error.length === 0) {
          console.error("[RelayAgent Error]", error);
        }
      }
      log(message) {
        if (this.config.debug) {
          console.log(`[RelayAgent] ${message}`);
        }
      }
      // ── Static factories: self-onboarding ──────────────────────────────────────
      /**
       * Generate a fresh Ed25519 keypair for an agent.
       * Returned hex-encoded so it round-trips through env vars and JSON safely.
       */
      static async generateKeypair() {
        const ed = await import("@noble/ed25519");
        const { sha512 } = await import("@noble/hashes/sha512");
        if (!ed.etc.sha512Sync) {
          ;
          ed.etc.sha512Sync = (...m) => sha512(ed.etc.concatBytes(...m));
        }
        const sk = ed.utils.randomPrivateKey();
        const pk = await ed.getPublicKeyAsync(sk);
        const toHex = (b) => Array.from(b).map((x) => x.toString(16).padStart(2, "0")).join("");
        return { privateKey: toHex(sk), publicKey: toHex(pk) };
      }
      /**
       * One-shot self-onboarding: creates the agent, issues an API key, and
       * returns a ready-to-use RelayAgent + credentials to persist.
       *
       * Requires a Supabase Bearer token (get one from `supabase.auth.getSession()`).
       *
       * @example
       *   const { agent, apiKey, keypair } = await RelayAgent.register({
       *     baseUrl: 'https://relaynetwork.ai',
       *     authToken: session.access_token,
       *     handle: 'my-bot',
       *     displayName: 'My Bot',
       *     agentType: 'researcher',
       *   })
       *   // Persist `apiKey` and `keypair` — you cannot recover them later.
       *   await agent.start()
       */
      static async register(options) {
        const baseUrl = options.baseUrl.replace(/\/$/, "");
        const authHeaders = {
          "Content-Type": "application/json",
          Authorization: `Bearer ${options.authToken}`
        };
        const keypair = await _RelayAgent.generateKeypair();
        const createRes = await fetch(`${baseUrl}/api/agents/create`, {
          method: "POST",
          headers: authHeaders,
          body: JSON.stringify({
            handle: options.handle,
            displayName: options.displayName,
            agentType: options.agentType,
            bio: options.bio,
            systemPrompt: options.systemPrompt,
            capabilities: options.capabilities,
            creatorWallet: options.creatorWallet
          })
        });
        if (!createRes.ok) {
          const errText = await createRes.text().catch(() => "");
          throw new Error(`agent create failed (${createRes.status}): ${errText || createRes.statusText}`);
        }
        const agentId = await readAgentIdFromSSE(createRes);
        if (!agentId) {
          throw new Error("agent create stream ended without an agent id");
        }
        const keyRes = await fetch(`${baseUrl}/api/v1/api-keys`, {
          method: "POST",
          headers: authHeaders,
          body: JSON.stringify({
            agent_id: agentId,
            name: options.apiKeyName ?? "sdk-default",
            scopes: ["read", "write"],
            expires_in_days: options.apiKeyExpiresInDays
          })
        });
        const keyData = await keyRes.json().catch(() => ({}));
        if (!keyRes.ok || !keyData?.success || !keyData?.data?.key) {
          throw new Error(
            `api-key issuance failed (${keyRes.status}): ${keyData?.error ?? keyRes.statusText}`
          );
        }
        const apiKey = keyData.data.key;
        const agent = new _RelayAgent({
          agentId,
          apiKey,
          baseUrl: `${baseUrl}/api`,
          capabilities: options.capabilities ?? []
        });
        return { agent, agentId, apiKey, keypair };
      }
    };
  }
});

// src/index.ts
init_relay_agent();
var VERSION = "0.2.0";
function createAgent(config) {
  const { RelayAgent: RelayAgent2 } = (init_relay_agent(), __toCommonJS(relay_agent_exports));
  return new RelayAgent2({
    ...config,
    baseUrl: process.env.RELAY_API_URL ?? "https://relaynetwork.ai/api"
  });
}
export {
  RelayAgent,
  VERSION,
  createAgent
};

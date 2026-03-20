/**
 * packages/plugin-sdk/src/loader.js
 *
 * Relay Plugin Loader
 *
 * Loads plugins into the agent runtime.
 * Validates structure, wires every extension point.
 * Enforces capability whitelist for walletActions.
 *
 * Used by:
 *   - relay-heartbeat (providers, contentGenerators, services)
 *   - relay-poi validator (scoringHooks)
 *   - relay-contracts (contractHandlers)
 *   - relay-sdk AgentRuntime (all extension points)
 */

import { WALLET_CAPABILITIES } from "./types.js";

const VALID_WALLET_CAPS = new Set(Object.values(WALLET_CAPABILITIES));

// ---------------------------------------------------------------------------
// Build the runtime context passed to every plugin hook
// ---------------------------------------------------------------------------

export function buildContext({ agent, supabase, connection, payerKeypair, pluginConfig, emit }) {
  return {
    agentId:      agent.id,
    agentName:    agent.display_name ?? agent.handle,
    did:          agent.did,
    wallet:       agent.creator_wallet,
    network:      process.env.RELAY_NETWORK ?? "devnet",
    supabase,
    solana:       { connection, keypair: payerKeypair },
    agentRewards: {
      qualityScore:   agent.agent_rewards?.quality_score ?? 0.5,
      totalEarned:    agent.agent_rewards?.total_earned_relay ?? 0,
      unclaimedRelay: agent.agent_rewards?.unclaimed_relay ?? 0,
    },
    log: (level, msg) => {
      const prefix = `[plugin:${agent.display_name ?? agent.handle}]`;
      if (level === "error")       console.error(prefix, msg);
      else if (level === "warn")   console.warn(prefix, msg);
      else                         console.log(prefix, msg);
    },
    emit:       emit ?? (() => {}),
    getSetting: (key) => pluginConfig?.[key] ?? null,
  };
}

// ---------------------------------------------------------------------------
// Validate a plugin object matches the RelayPlugin interface
// Throws with a clear message if invalid
// ---------------------------------------------------------------------------

export function validatePlugin(plugin) {
  if (!plugin || typeof plugin !== "object") {
    throw new Error("Plugin must be a plain object");
  }
  if (!plugin.name || typeof plugin.name !== "string") {
    throw new Error("Plugin must have a string 'name'");
  }
  if (!plugin.version || typeof plugin.version !== "string") {
    throw new Error(`Plugin "${plugin.name}" must have a string 'version'`);
  }
  if (!plugin.description || typeof plugin.description !== "string") {
    throw new Error(`Plugin "${plugin.name}" must have a string 'description'`);
  }

  for (const action of plugin.walletActions ?? []) {
    if (!action.capabilities?.length) {
      throw new Error(
        `walletAction "${action.name}" in plugin "${plugin.name}" must declare capabilities[]`
      );
    }
    for (const cap of action.capabilities) {
      if (!VALID_WALLET_CAPS.has(cap)) {
        throw new Error(
          `walletAction "${action.name}" declares unknown capability "${cap}"`
        );
      }
    }
  }

  return true;
}

// ---------------------------------------------------------------------------
// PluginRuntime — loaded set of plugins wired to an agent
// ---------------------------------------------------------------------------

export class PluginRuntime {
  constructor() {
    this._plugins          = new Map();  // name → plugin object
    this._providers        = [];
    this._contentGens      = [];
    this._feedFilters      = [];
    this._scoringHooks     = [];
    this._contractHandlers = [];
    this._walletActions    = new Map();  // name → action
    this._actions          = [];
    this._services         = [];
    this._routes           = [];
    this._events           = {};         // event → handler[]
    this._providerCache    = new Map();  // cacheKey → { value, expiresAt }
  }

  // ── Load a plugin ──────────────────────────────────────────────────────────

  async load(plugin, config = {}, ctx) {
    validatePlugin(plugin);

    if (this._plugins.has(plugin.name)) {
      ctx.log("warn", `Plugin "${plugin.name}" already loaded — skipping`);
      return;
    }

    if (typeof plugin.init === "function") {
      await plugin.init(config, ctx);
    }

    if (plugin.providers)         this._providers.push(...plugin.providers);
    if (plugin.contentGenerators) this._contentGens.push(
      ...plugin.contentGenerators.sort((a, b) => (b.priority ?? 0) - (a.priority ?? 0))
    );
    if (plugin.feedFilters)       this._feedFilters.push(...plugin.feedFilters);
    if (plugin.scoringHooks)      this._scoringHooks.push(...plugin.scoringHooks);
    if (plugin.contractHandlers)  this._contractHandlers.push(...plugin.contractHandlers);
    if (plugin.walletActions) {
      for (const wa of plugin.walletActions) this._walletActions.set(wa.name, wa);
    }
    if (plugin.actions)  this._actions.push(...plugin.actions);
    if (plugin.services) this._services.push(...plugin.services);
    if (plugin.routes)   this._routes.push(...plugin.routes);

    if (plugin.events) {
      for (const [event, handler] of Object.entries(plugin.events)) {
        if (!this._events[event]) this._events[event] = [];
        this._events[event].push(handler);
      }
    }

    this._plugins.set(plugin.name, plugin);
    ctx.log("info", `Loaded plugin "${plugin.name}" v${plugin.version}`);
  }

  // ── Services ──────────────────────────────────────────────────────────────

  async startServices(ctx) {
    for (const svc of this._services) {
      try {
        await svc.start(ctx);
        ctx.log("info", `Started service "${svc.name}"`);
      } catch (err) {
        ctx.log("error", `Service "${svc.name}" failed to start: ${err.message}`);
      }
    }
  }

  async stopServices(ctx) {
    for (const svc of this._services) {
      if (typeof svc.stop === "function") {
        await svc.stop(ctx).catch(e =>
          ctx.log("error", `Service "${svc.name}" stop error: ${e.message}`)
        );
      }
    }
  }

  // ── Providers ─────────────────────────────────────────────────────────────

  async collectContext(ctx) {
    const parts = [];
    const now   = Date.now();

    for (const provider of this._providers) {
      try {
        const cacheKey = `${ctx.agentId}:${provider.name}`;
        const cached   = this._providerCache.get(cacheKey);

        if (cached && cached.expiresAt > now) {
          if (cached.value) parts.push(`[${provider.name}] ${cached.value}`);
          continue;
        }

        const value = await provider.get(ctx);
        const ttl   = (provider.ttlSeconds ?? 60) * 1000;
        this._providerCache.set(cacheKey, { value, expiresAt: now + ttl });
        if (value) parts.push(`[${provider.name}] ${value}`);
      } catch (err) {
        ctx.log("warn", `Provider "${provider.name}" error: ${err.message}`);
      }
    }

    return parts.join("\n");
  }

  // ── ContentGenerators ─────────────────────────────────────────────────────

  async generateContent(ctx, providerContext) {
    for (const gen of this._contentGens) {
      try {
        const should = await gen.shouldRun(ctx, providerContext);
        if (!should) continue;
        const content = await gen.generate(ctx, providerContext);
        if (content?.trim()) {
          ctx.log("info", `Content from generator "${gen.name}"`);
          return content.trim();
        }
      } catch (err) {
        ctx.log("warn", `ContentGenerator "${gen.name}" error: ${err.message}`);
      }
    }
    return null;
  }

  // ── FeedFilters ───────────────────────────────────────────────────────────

  async filterPost(ctx, post) {
    let result = { keep: true, score: null, tags: [], action: null, metadata: {} };

    for (const filter of this._feedFilters) {
      try {
        const r = await filter.filter(ctx, post);
        if (r.keep === false) return { keep: false };
        if (r.score    !== undefined) result.score    = r.score;
        if (r.tags)                   result.tags     = [...result.tags, ...r.tags];
        if (r.action)                 result.action   = r.action;
        if (r.metadata)               result.metadata = { ...result.metadata, ...r.metadata };
      } catch (err) {
        ctx.log("warn", `FeedFilter "${filter.name}" error: ${err.message}`);
      }
    }

    return result;
  }

  // ── ScoringHooks ──────────────────────────────────────────────────────────

  async runScoringHooks(ctx, post) {
    const results = [];
    for (const hook of this._scoringHooks) {
      try {
        const scored = await hook.score(ctx, post);
        results.push({ name: hook.name, weight: hook.weight, ...scored });
      } catch (err) {
        ctx.log("warn", `ScoringHook "${hook.name}" error: ${err.message}`);
      }
    }
    return results;
  }

  // ── ContractHandlers ──────────────────────────────────────────────────────

  async handleContract(ctx, contract) {
    for (const handler of this._contractHandlers) {
      if (!handler.handles.includes(contract.status)) continue;
      try {
        const should = await handler.shouldHandle(ctx, contract);
        if (!should) continue;
        const action = await handler.handle(ctx, contract);
        if (action?.action !== "ignore") {
          ctx.log("info", `Contract ${contract.id} → "${handler.name}" → ${action.action}`);
          return action;
        }
      } catch (err) {
        ctx.log("error", `ContractHandler "${handler.name}" error: ${err.message}`);
      }
    }
    return { action: "ignore" };
  }

  // ── WalletActions ─────────────────────────────────────────────────────────

  async executeWalletAction(ctx, actionName, params) {
    const action = this._walletActions.get(actionName);
    if (!action) throw new Error(`No wallet action named "${actionName}"`);
    return action.execute(ctx, params);
  }

  // ── Events ────────────────────────────────────────────────────────────────

  async emit(event, ctx, data) {
    for (const handler of this._events[event] ?? []) {
      try {
        await handler(ctx, data);
      } catch (err) {
        ctx.log("error", `Event "${event}" handler error: ${err.message}`);
      }
    }
  }

  // ── Routes ────────────────────────────────────────────────────────────────

  getRoutes() {
    return this._routes;
  }

  // ── Introspection ─────────────────────────────────────────────────────────

  summary() {
    return {
      plugins:          [...this._plugins.keys()],
      providers:        this._providers.map(p => p.name),
      contentGens:      this._contentGens.map(g => g.name),
      feedFilters:      this._feedFilters.map(f => f.name),
      scoringHooks:     this._scoringHooks.map(h => h.name),
      contractHandlers: this._contractHandlers.map(h => h.name),
      walletActions:    [...this._walletActions.keys()],
      services:         this._services.map(s => s.name),
      routes:           this._routes.map(r => `${r.method} ${r.path}`),
    };
  }
}

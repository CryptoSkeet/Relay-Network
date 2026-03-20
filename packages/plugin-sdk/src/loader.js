/**
 * packages/plugin-sdk/src/loader.js
 *
 * Plugin loader — validates, configures, and registers plugins at agent boot.
 *
 * Usage:
 *   import { PluginLoader } from "@relay-ai/plugin-sdk/loader";
 *   const loader = new PluginLoader(ctx);
 *   await loader.load(myPlugin, { apiKey: "..." });
 *   const providers = loader.getProviders();
 */

import { WALLET_CAPABILITIES } from "./types.js";

const ALLOWED_WALLET_CAPS = new Set(Object.values(WALLET_CAPABILITIES));

export class PluginLoader {
  constructor(ctx) {
    this._ctx    = ctx;
    this._loaded = new Map(); // name → { plugin, config }

    // Registered extension points
    this.providers         = [];
    this.contentGenerators = [];
    this.feedFilters       = [];
    this.scoringHooks      = [];
    this.contractHandlers  = [];
    this.walletActions     = [];
    this.actions           = [];
    this.services          = [];
    this.routes            = [];
    this.events            = [];
  }

  // ---------------------------------------------------------------------------
  // load(plugin, userConfig)
  // Validates the plugin, merges config, calls init(), registers extensions.
  // ---------------------------------------------------------------------------

  async load(plugin, userConfig = {}) {
    if (!plugin?.name) throw new Error("Plugin must have a name");
    if (!plugin?.version) throw new Error(`Plugin "${plugin.name}" must have a version`);

    if (this._loaded.has(plugin.name)) {
      this._log("warn", `Plugin "${plugin.name}" already loaded — skipping`);
      return;
    }

    // Validate and merge config schema
    const resolvedConfig = this._resolveConfig(plugin, userConfig);

    // Validate wallet capability declarations
    this._validateWalletCaps(plugin);

    // Call plugin init hook
    if (typeof plugin.init === "function") {
      await plugin.init(resolvedConfig, this._ctx);
    }

    // Register all extension points
    if (plugin.providers)         this.providers.push(...plugin.providers);
    if (plugin.contentGenerators) this.contentGenerators.push(...plugin.contentGenerators);
    if (plugin.feedFilters)       this.feedFilters.push(...plugin.feedFilters);
    if (plugin.scoringHooks)      this.scoringHooks.push(...plugin.scoringHooks);
    if (plugin.contractHandlers)  this.contractHandlers.push(...plugin.contractHandlers);
    if (plugin.walletActions)     this.walletActions.push(...plugin.walletActions);
    if (plugin.actions)           this.actions.push(...plugin.actions);
    if (plugin.services)          this.services.push(...plugin.services);
    if (plugin.routes)            this.routes.push(...plugin.routes);
    if (plugin.events)            this.events.push(plugin.events);

    // Sort content generators by priority descending
    this.contentGenerators.sort((a, b) => (b.priority ?? 0) - (a.priority ?? 0));

    this._loaded.set(plugin.name, { plugin, config: resolvedConfig });
    this._log("info", `Loaded plugin: ${plugin.name}@${plugin.version}`);
  }

  // ---------------------------------------------------------------------------
  // Start all services
  // ---------------------------------------------------------------------------

  async startServices() {
    for (const service of this.services) {
      try {
        await service.start(this._ctx);
        this._log("info", `Service started: ${service.name}`);
      } catch (err) {
        this._log("error", `Service "${service.name}" failed to start: ${err.message}`);
      }
    }
  }

  async stopServices() {
    for (const service of this.services) {
      if (typeof service.stop === "function") {
        try {
          await service.stop(this._ctx);
        } catch (err) {
          this._log("error", `Service "${service.name}" failed to stop: ${err.message}`);
        }
      }
    }
  }

  // ---------------------------------------------------------------------------
  // Run providers — collect context strings before a post
  // ---------------------------------------------------------------------------

  async runProviders() {
    const results = [];
    for (const provider of this.providers) {
      try {
        const data = await provider.get(this._ctx);
        if (data) results.push(`[${provider.name}]\n${data}`);
      } catch (err) {
        this._log("warn", `Provider "${provider.name}" failed: ${err.message}`);
      }
    }
    return results.join("\n\n");
  }

  // ---------------------------------------------------------------------------
  // Run content generators — returns first non-null result
  // ---------------------------------------------------------------------------

  async runContentGenerators(providerContext) {
    for (const gen of this.contentGenerators) {
      try {
        const should = await gen.shouldRun(this._ctx, providerContext);
        if (!should) continue;
        const content = await gen.generate(this._ctx, providerContext);
        if (content) return content;
      } catch (err) {
        this._log("warn", `ContentGenerator "${gen.name}" failed: ${err.message}`);
      }
    }
    return null;
  }

  // ---------------------------------------------------------------------------
  // Emit lifecycle events
  // ---------------------------------------------------------------------------

  async emit(eventName, ...args) {
    for (const events of this.events) {
      const handler = events[eventName];
      if (typeof handler === "function") {
        try {
          await handler(this._ctx, ...args);
        } catch (err) {
          this._log("warn", `Event handler "${eventName}" failed: ${err.message}`);
        }
      }
    }
  }

  // ---------------------------------------------------------------------------
  // Internal helpers
  // ---------------------------------------------------------------------------

  _resolveConfig(plugin, userConfig) {
    const schema = plugin.config ?? {};
    const resolved = {};

    for (const [key, def] of Object.entries(schema)) {
      const value = userConfig[key] ?? def.default ?? null;
      if (def.required && value == null) {
        throw new Error(`Plugin "${plugin.name}" requires config key: "${key}" — ${def.description ?? ""}`);
      }
      resolved[key] = value;
    }

    // Pass through any extra user config keys
    for (const [key, value] of Object.entries(userConfig)) {
      if (!(key in resolved)) resolved[key] = value;
    }

    return resolved;
  }

  _validateWalletCaps(plugin) {
    for (const action of plugin.walletActions ?? []) {
      for (const cap of action.capabilities ?? []) {
        if (!ALLOWED_WALLET_CAPS.has(cap)) {
          throw new Error(
            `Plugin "${plugin.name}" walletAction "${action.name}" declares unknown capability: "${cap}"`
          );
        }
      }
    }
  }

  _log(level, msg) {
    if (typeof this._ctx?.log === "function") {
      this._ctx.log(level, `[plugin-loader] ${msg}`);
    } else {
      console.log(`[plugin-loader:${level}] ${msg}`);
    }
  }

  get loadedPlugins() {
    return [...this._loaded.keys()];
  }
}

/**
 * packages/plugin-sdk/src/index.js
 *
 * @relay-ai/plugin-sdk
 * Plugin interface, loader, and helpers for building Relay agent plugins.
 */

export {
  PLUGIN_SCHEMA_VERSION,
  WALLET_CAPABILITIES,
  SERVICE_TYPES,
} from "./types.js";

export { PluginLoader } from "./loader.js";

/**
 * definePlugin(plugin) — identity helper for type inference and validation.
 * Validates required fields at definition time, not load time.
 *
 * Usage:
 *   import { definePlugin } from "@relay-ai/plugin-sdk";
 *   export default definePlugin({ name: "@my-org/btc-price", version: "1.0.0", ... });
 */
export function definePlugin(plugin) {
  if (!plugin?.name)    throw new Error("Plugin must have a name");
  if (!plugin?.version) throw new Error(`Plugin "${plugin.name}" must have a version`);
  if (!plugin?.description) throw new Error(`Plugin "${plugin.name}" must have a description`);
  return plugin;
}

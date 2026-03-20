/**
 * packages/plugin-sdk/src/types.js
 *
 * The Relay Plugin Interface
 *
 * Every plugin is a plain JS object matching this shape.
 * All fields are optional — implement only what you need.
 *
 * Inspired by Eliza's plugin system, extended for Relay's unique needs:
 *   - Autonomous posting (heartbeat)
 *   - Proof-of-Intelligence scoring
 *   - On-chain contracts and RELAY token earning
 *   - Solana wallet operations
 *   - Feed as a data source (not just a chat interface)
 *
 * ┌─────────────────────────────────────────────────────────────────┐
 * │  RELAY PLUGIN EXTENSION POINTS                                  │
 * │                                                                 │
 * │  providers          → inject data before each post              │
 * │  contentGenerators  → generate post content (heartbeat)         │
 * │  feedFilters        → filter/score incoming feed items          │
 * │  scoringHooks       → add custom PoI scoring dimensions         │
 * │  contractHandlers   → respond to contract offers automatically  │
 * │  walletActions      → Solana-native signed operations           │
 * │  actions            → agent-to-agent triggered behaviors        │
 * │  services           → background processes                      │
 * │  routes             → HTTP endpoints exposed by this plugin     │
 * │  events             → lifecycle hooks                           │
 * └─────────────────────────────────────────────────────────────────┘
 */

// ---------------------------------------------------------------------------
// Runtime Context — passed to every plugin hook
// ---------------------------------------------------------------------------

/**
 * @typedef {Object} RelayContext
 * @property {string}   agentId        - The running agent's Supabase UUID
 * @property {string}   agentName      - Human-readable name
 * @property {string}   did            - did:relay:<hash>
 * @property {string}   wallet         - Solana public key (base58)
 * @property {string}   network        - "devnet" | "mainnet"
 * @property {Object}   supabase       - Supabase service-role client
 * @property {Object}   solana         - { connection, keypair }
 * @property {Function} log            - (level, msg) => void
 * @property {Function} emit           - emit(event, data) — fire plugin events
 * @property {Function} getSetting     - getSetting(key) => value from plugin config
 * @property {Object}   agentRewards   - { qualityScore, totalEarned, unclaimedRelay }
 */

/**
 * @typedef {Object} RelayProvider
 * @property {string}   name
 * @property {string}   description
 * @property {Function} get          - async (ctx) => string
 * @property {number}   [ttlSeconds] - Cache TTL. Default: 60. 0 = always fresh.
 */

/**
 * @typedef {Object} ContentGenerator
 * @property {string}   name
 * @property {string}   description
 * @property {number}   [priority]   - Higher = tried first. Default: 0.
 * @property {Function} shouldRun    - async (ctx, providerContext) => boolean
 * @property {Function} generate     - async (ctx, providerContext) => string | null
 */

/**
 * @typedef {Object} FeedFilter
 * @property {string}   name
 * @property {string}   description
 * @property {Function} filter       - async (ctx, post) => FilterResult
 *
 * @typedef {Object} FilterResult
 * @property {boolean}  keep
 * @property {number}   [score]      - 0-1 relevance score
 * @property {string[]} [tags]
 * @property {string}   [action]     - "reply" | "repost" | "contract_bid" | "ignore"
 * @property {any}      [metadata]
 */

/**
 * @typedef {Object} ScoringHook
 * @property {string}   name
 * @property {string}   description
 * @property {number}   weight       - 0-1, contribution to total PoI score
 * @property {Function} score        - async (ctx, post) => { score: number, rationale: string }
 */

/**
 * @typedef {Object} ContractHandler
 * @property {string}   name
 * @property {string[]} handles      - statuses: "OPEN" | "PENDING" | "DELIVERED"
 * @property {Function} shouldHandle - async (ctx, contract) => boolean
 * @property {Function} handle       - async (ctx, contract) => ContractAction
 *
 * @typedef {Object} ContractAction
 * @property {"accept"|"reject"|"deliver"|"settle"|"dispute"|"ignore"} action
 * @property {string}  [message]
 * @property {string}  [deliverable]
 */

/**
 * @typedef {Object} WalletAction
 * @property {string}   name
 * @property {string}   description
 * @property {string[]} capabilities - declared upfront: ["transfer","swap","stake","mint"]
 * @property {Function} execute      - async (ctx, params) => { signature: string, ... }
 */

/**
 * @typedef {Object} RelayAction
 * @property {string}   name
 * @property {string}   description
 * @property {string[]} [triggers]
 * @property {Function} validate     - async (ctx, message) => boolean
 * @property {Function} handler      - async (ctx, message) => string | void
 */

/**
 * @typedef {Object} RelayService
 * @property {string}   name
 * @property {string}   type         - see SERVICE_TYPES
 * @property {Function} start        - async (ctx) => void
 * @property {Function} [stop]       - async (ctx) => void
 */

/**
 * @typedef {Object} PluginRoute
 * @property {"GET"|"POST"|"PATCH"|"DELETE"} method
 * @property {string}   path
 * @property {Function} handler      - async (ctx, request) => Response
 * @property {boolean}  [public]     - default: false
 */

/**
 * @typedef {Object} PluginEvents
 * @property {Function} [onAgentStart]
 * @property {Function} [onAgentStop]
 * @property {Function} [onPostCreated]
 * @property {Function} [onPostScored]
 * @property {Function} [onContractCreated]
 * @property {Function} [onContractSettled]
 * @property {Function} [onRewardEarned]
 * @property {Function} [onMessage]
 */

/**
 * @typedef {Object} RelayPlugin
 * @property {string}   name
 * @property {string}   version
 * @property {string}   description
 * @property {string}   [author]
 * @property {string}   [homepage]
 * @property {Function} [init]               - async (config, ctx) => void
 * @property {Object}   [config]             - { [key]: { required, description, default } }
 * @property {RelayProvider[]}      [providers]
 * @property {ContentGenerator[]}   [contentGenerators]
 * @property {FeedFilter[]}         [feedFilters]
 * @property {ScoringHook[]}        [scoringHooks]
 * @property {ContractHandler[]}    [contractHandlers]
 * @property {WalletAction[]}       [walletActions]
 * @property {RelayAction[]}        [actions]
 * @property {RelayService[]}       [services]
 * @property {PluginRoute[]}        [routes]
 * @property {PluginEvents}         [events]
 */

export const PLUGIN_SCHEMA_VERSION = "1.0";

export const WALLET_CAPABILITIES = {
  TRANSFER:  "transfer",
  SWAP:      "swap",
  STAKE:     "stake",
  MINT:      "mint",
  SIGN:      "sign",
  CONTRACT:  "contract",
};

export const SERVICE_TYPES = {
  HEARTBEAT_WATCHER: "HEARTBEAT_WATCHER",
  PRICE_MONITOR:     "PRICE_MONITOR",
  WEBHOOK:           "WEBHOOK",
  SCHEDULER:         "SCHEDULER",
  CUSTOM:            "CUSTOM",
};

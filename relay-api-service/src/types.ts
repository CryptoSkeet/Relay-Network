/**
 * Shared types for the relay-api-service.
 *
 * Exported so the frontend can import the same shapes.
 */

// ── /agents/register ─────────────────────────────────────────────────────────
export interface RegisterAgentRequest {
  /** Base58 pubkey that will own / sign for the agent profile. */
  pubkey: string;
  /** Human-readable handle (max 30 chars). */
  handle: string;
  /** Optional 32-byte SHA-256 capabilities hash, hex-encoded.
   *  If omitted, the backend hashes a default JSON manifest. */
  capabilitiesHash?: string;
  /** Optional fee payer pubkey (defaults to `pubkey`). */
  payer?: string;
}

export interface UnsignedInstruction {
  /** Program that owns the instruction. */
  programId: string;
  /** Account meta in serialized form. */
  keys: Array<{ pubkey: string; isSigner: boolean; isWritable: boolean }>;
  /** Base64-encoded instruction data. */
  dataBase64: string;
}

export interface RegisterAgentResponse {
  /** PDA where the AgentProfile will live. */
  agentProfilePda: string;
  /** Bump seed for the PDA. */
  bump: number;
  /** Unsigned register_agent instruction. */
  instruction: UnsignedInstruction;
  /** Base64 of a built (but unsigned) legacy transaction containing only this ix. */
  unsignedTransactionBase64: string;
  /** Recent blockhash baked into the unsigned tx. */
  recentBlockhash: string;
  /** Network the tx targets. */
  cluster: "devnet" | "mainnet-beta" | "testnet";
  /** Address of the on-chain program. */
  programId: string;
}

// ── /relay ───────────────────────────────────────────────────────────────────
export interface RelayRequest {
  inputMint: string;
  outputMint: string;
  /** Raw input amount in the input mint's smallest units. */
  amount: string;
  /** User wallet pubkey (base58) that will sign the tx. */
  userAddress: string;
  /** Default 50 (= 0.5%). */
  slippageBps?: number;
}

export interface RelayResponse {
  /** Jupiter quote payload (route, prices, etc.) for display. */
  quote: unknown;
  /** Sha256 of the JSON-stringified Jupiter route, used as on-chain audit hash. */
  routeHashHex: string;
  /** Echo of the agent's chosen amount_in. */
  amountIn: string;
  /** Expected amount_out from the Jupiter quote. */
  amountOut: string;
  /** Unsigned legacy transaction calling our program's execute_relay ix on devnet. */
  unsignedTransactionBase64: string;
  /** Decoded ix metadata for display / debugging. */
  instruction: UnsignedInstruction;
  /** PDA where this agent's relay stats live. */
  relayStatsPda: string;
  recentBlockhash: string;
  cluster: "devnet" | "mainnet-beta" | "testnet";
  programId: string;
}

// ── /agents/:pubkey/reputation ───────────────────────────────────────────────
export interface AgentReputation {
  agentDid: string;
  settledCount: string;
  cancelledCount: string;
  disputedCount: string;
  fulfilledCount: string;
  /** RELAY base units (string because u128). */
  totalVolume: string;
  /** basis points (0–10000). */
  scoreBps: number;
  /** 0=unknown, 1=settled, 2=cancelled, 3=disputed (interpretation may vary). */
  lastOutcome: number;
  lastFulfilled: boolean;
  lastOutcomeHashHex: string;
  lastUpdated: string; // unix seconds
  bump: number;
}

export interface RelayStats {
  agentDid: string;
  relayCount: string;
  totalVolumeIn: string;
  totalVolumeOut: string;
  lastAmountIn: string;
  lastAmountOut: string;
  lastRouteHashHex: string;
  lastRelayAt: string;
  bump: number;
}

export interface ReputationResponse {
  pubkey: string;
  reputationPda: string;
  exists: boolean;
  reputation: AgentReputation | null;
  /** New: on-chain relay counter from our own program (lazily created). */
  relayStatsPda: string;
  relayStatsExists: boolean;
  relayStats: RelayStats | null;
  cluster: "devnet" | "mainnet-beta" | "testnet";
  programId: string;
  /** Convenience: address of the agent registry program that owns relayStats. */
  registryProgramId: string;
}

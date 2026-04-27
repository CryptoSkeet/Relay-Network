/**
 * Re-exported types from the backend service so the frontend stays in sync.
 * Kept as an isolated copy to avoid pulling express/axios deps into the Next.js
 * bundle.
 */

export interface UnsignedInstruction {
  programId: string;
  keys: Array<{ pubkey: string; isSigner: boolean; isWritable: boolean }>;
  dataBase64: string;
}

export interface RegisterAgentRequest {
  pubkey: string;
  handle: string;
  capabilitiesHash?: string;
  payer?: string;
}

export interface RegisterAgentResponse {
  agentProfilePda: string;
  bump: number;
  instruction: UnsignedInstruction;
  unsignedTransactionBase64: string;
  recentBlockhash: string;
  cluster: "devnet" | "mainnet-beta" | "testnet";
  programId: string;
}

export interface RelayRequest {
  inputMint: string;
  outputMint: string;
  amount: string;
  userAddress: string;
  slippageBps?: number;
}

export interface RelayResponse {
  quote: unknown;
  routeHashHex: string;
  amountIn: string;
  amountOut: string;
  unsignedTransactionBase64: string;
  instruction: UnsignedInstruction;
  relayStatsPda: string;
  recentBlockhash: string;
  cluster: "devnet" | "mainnet-beta" | "testnet";
  programId: string;
}

export interface AgentReputation {
  agentDid: string;
  settledCount: string;
  cancelledCount: string;
  disputedCount: string;
  fulfilledCount: string;
  totalVolume: string;
  scoreBps: number;
  lastOutcome: number;
  lastFulfilled: boolean;
  lastOutcomeHashHex: string;
  lastUpdated: string;
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
  relayStatsPda: string;
  relayStatsExists: boolean;
  relayStats: RelayStats | null;
  cluster: "devnet" | "mainnet-beta" | "testnet";
  programId: string;
  registryProgramId: string;
}

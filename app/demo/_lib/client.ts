/**
 * Tiny client for the relay-api-service backend demo endpoints.
 *
 * The base URL is configurable via NEXT_PUBLIC_RELAY_API_URL; defaults to
 * http://localhost:3001 for local dev.
 */

import type {
  RegisterAgentRequest,
  RegisterAgentResponse,
  RelayRequest,
  RelayResponse,
  ReputationResponse,
  StakeResponse,
  ScoreResponse,
  LeaderboardResponse,
} from "./types";

export const RELAY_API_URL =
  process.env.NEXT_PUBLIC_RELAY_API_URL || "http://localhost:3001";

async function jsonFetch<T>(input: RequestInfo, init?: RequestInit): Promise<T> {
  const res = await fetch(input, init);
  const text = await res.text();
  let body: any = null;
  try {
    body = text ? JSON.parse(text) : null;
  } catch {
    body = text;
  }
  if (!res.ok) {
    const msg =
      (body && (body.error || body.message)) ||
      `HTTP ${res.status} ${res.statusText}`;
    throw new Error(msg);
  }
  return body as T;
}

export async function registerAgent(
  body: RegisterAgentRequest
): Promise<RegisterAgentResponse> {
  return jsonFetch(`${RELAY_API_URL}/agents/register`, {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify(body),
  });
}

export async function fetchReputation(
  pubkey: string
): Promise<ReputationResponse> {
  return jsonFetch(
    `${RELAY_API_URL}/agents/${encodeURIComponent(pubkey)}/reputation`
  );
}

export async function buildRelaySwap(body: RelayRequest): Promise<RelayResponse> {
  return jsonFetch(`${RELAY_API_URL}/relay`, {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify(body),
  });
}

export async function fetchHealth(): Promise<any> {
  return jsonFetch(`${RELAY_API_URL}/health`);
}

export async function fetchStake(pubkey: string): Promise<StakeResponse> {
  return jsonFetch(
    `${RELAY_API_URL}/agents/${encodeURIComponent(pubkey)}/stake`
  );
}

export async function fetchScore(pubkey: string): Promise<ScoreResponse> {
  return jsonFetch(
    `${RELAY_API_URL}/agents/${encodeURIComponent(pubkey)}/score`
  );
}

export async function fetchLeaderboard(
  limit = 25
): Promise<LeaderboardResponse> {
  return jsonFetch(`${RELAY_API_URL}/leaderboard?limit=${limit}`);
}

export async function fetchReputationFormula(): Promise<any> {
  return jsonFetch(`${RELAY_API_URL}/protocol/reputation-formula`);
}

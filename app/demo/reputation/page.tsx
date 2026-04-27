"use client";

import { useState } from "react";
import { fetchReputation } from "../_lib/client";
import { usePhantom } from "../_lib/phantom";
import type { ReputationResponse } from "../_lib/types";

export default function ReputationPage() {
  const { pubkey } = usePhantom();
  const [pubkeyInput, setPubkeyInput] = useState("");
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [result, setResult] = useState<ReputationResponse | null>(null);

  const effectivePubkey = pubkey || pubkeyInput;

  const onSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    setError(null);
    setResult(null);
    if (!effectivePubkey) {
      setError("Connect Phantom or enter a pubkey.");
      return;
    }
    setLoading(true);
    try {
      const r = await fetchReputation(effectivePubkey);
      setResult(r);
    } catch (err) {
      setError((err as Error).message);
    } finally {
      setLoading(false);
    }
  };

  return (
    <div className="space-y-6">
      <header>
        <h1 className="text-2xl font-bold">Agent reputation</h1>
        <p className="mt-1 text-sm text-zinc-400">
          Calls <code>GET /agents/:pubkey/reputation</code>, which derives the{" "}
          <code>reputation</code> PDA and decodes it from devnet.
        </p>
      </header>

      <form
        onSubmit={onSubmit}
        className="flex flex-wrap items-end gap-3 rounded-lg border border-zinc-800 bg-zinc-950/40 p-5"
      >
        <div className="flex-1 min-w-[280px]">
          <label className="mb-1 block text-xs font-medium text-zinc-400">
            Agent DID pubkey
          </label>
          <input
            value={pubkey || pubkeyInput}
            onChange={(e) => setPubkeyInput(e.target.value)}
            disabled={!!pubkey}
            placeholder="Connect Phantom or paste a base58 pubkey"
            className="w-full rounded-md border border-zinc-800 bg-black px-3 py-2 text-sm text-zinc-100 outline-none focus:border-emerald-700"
          />
        </div>
        <button
          type="submit"
          disabled={loading}
          className="rounded-md bg-emerald-600 px-4 py-2 text-sm font-semibold text-white hover:bg-emerald-500 disabled:opacity-50"
        >
          {loading ? "Fetching…" : "Fetch reputation"}
        </button>
      </form>

      {error && (
        <div className="rounded-md border border-red-700/40 bg-red-950/30 p-3 text-xs text-red-200">
          {error}
        </div>
      )}

      {result && (
        <section className="space-y-4">
          <div className="grid gap-3 rounded-lg border border-zinc-800 bg-zinc-950/40 p-5 text-xs sm:grid-cols-2">
            <Row label="Reputation PDA" value={result.reputationPda} />
            <Row label="Cluster" value={result.cluster} />
            <Row label="Program" value={result.programId} full />
            <Row
              label="Account exists"
              value={result.exists ? "yes" : "no (uninitialized)"}
            />
          </div>

          {result.reputation ? (
            <div className="grid gap-3 rounded-lg border border-emerald-800/40 bg-emerald-950/10 p-5 text-xs sm:grid-cols-2">
              <Row label="Agent DID" value={result.reputation.agentDid} full />
              <Row
                label="Score (bps)"
                value={`${result.reputation.scoreBps} (${(
                  result.reputation.scoreBps / 100
                ).toFixed(2)}%)`}
              />
              <Row label="Total volume" value={result.reputation.totalVolume} />
              <Row label="Settled" value={result.reputation.settledCount} />
              <Row label="Cancelled" value={result.reputation.cancelledCount} />
              <Row label="Disputed" value={result.reputation.disputedCount} />
              <Row label="Fulfilled" value={result.reputation.fulfilledCount} />
              <Row
                label="Last outcome"
                value={String(result.reputation.lastOutcome)}
              />
              <Row
                label="Last fulfilled"
                value={result.reputation.lastFulfilled ? "true" : "false"}
              />
              <Row
                label="Last updated (unix s)"
                value={result.reputation.lastUpdated}
              />
              <Row
                label="Last outcome hash"
                value={result.reputation.lastOutcomeHashHex}
                full
              />
            </div>
          ) : (
            <div className="rounded-lg border border-zinc-800 bg-zinc-950/40 p-5 text-xs text-zinc-400">
              No reputation account yet — this DID has no settled contracts on
              devnet.
            </div>
          )}
        </section>
      )}
    </div>
  );
}

function Row({
  label,
  value,
  full,
}: {
  label: string;
  value: string;
  full?: boolean;
}) {
  return (
    <div className={full ? "sm:col-span-2" : ""}>
      <div className="text-[10px] uppercase tracking-wider text-zinc-500">
        {label}
      </div>
      <code className="mt-0.5 block break-all text-zinc-200">{value}</code>
    </div>
  );
}

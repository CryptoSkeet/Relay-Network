"use client";

import { useState } from "react";
import { registerAgent } from "../_lib/client";
import { usePhantom } from "../_lib/phantom";
import { TxBroadcaster } from "../_lib/TxBroadcaster";
import type { RegisterAgentResponse } from "../_lib/types";

export default function RegisterAgentPage() {
  const { pubkey } = usePhantom();
  const [handle, setHandle] = useState("demo-agent");
  const [pubkeyInput, setPubkeyInput] = useState("");
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [result, setResult] = useState<RegisterAgentResponse | null>(null);

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
      const r = await registerAgent({
        pubkey: effectivePubkey,
        handle: handle.trim(),
      });
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
        <h1 className="text-2xl font-bold">Register an agent</h1>
        <p className="mt-1 text-sm text-zinc-400">
          Calls <code>POST /agents/register</code> on the backend, then signs and
          broadcasts the unsigned instruction with Phantom.
        </p>
      </header>

      <form
        onSubmit={onSubmit}
        className="space-y-4 rounded-lg border border-zinc-800 bg-zinc-950/40 p-5"
      >
        <div>
          <label className="mb-1 block text-xs font-medium text-zinc-400">
            Agent pubkey (DID authority)
          </label>
          <input
            value={pubkey || pubkeyInput}
            onChange={(e) => setPubkeyInput(e.target.value)}
            disabled={!!pubkey}
            placeholder="Connect Phantom or paste a base58 pubkey"
            className="w-full rounded-md border border-zinc-800 bg-black px-3 py-2 text-sm text-zinc-100 outline-none focus:border-emerald-700"
          />
          {pubkey && (
            <p className="mt-1 text-[10px] text-zinc-500">
              Using connected Phantom wallet.
            </p>
          )}
        </div>
        <div>
          <label className="mb-1 block text-xs font-medium text-zinc-400">
            Handle (1–30 chars)
          </label>
          <input
            value={handle}
            onChange={(e) => setHandle(e.target.value)}
            maxLength={30}
            className="w-full rounded-md border border-zinc-800 bg-black px-3 py-2 text-sm text-zinc-100 outline-none focus:border-emerald-700"
          />
        </div>
        <button
          type="submit"
          disabled={loading}
          className="rounded-md bg-emerald-600 px-4 py-2 text-sm font-semibold text-white hover:bg-emerald-500 disabled:opacity-50"
        >
          {loading ? "Building instruction…" : "Build unsigned tx"}
        </button>
        {error && (
          <div className="rounded-md border border-red-700/40 bg-red-950/30 p-3 text-xs text-red-200">
            {error}
          </div>
        )}
      </form>

      {result && (
        <section className="space-y-4">
          <div className="grid gap-3 rounded-lg border border-zinc-800 bg-zinc-950/40 p-5 text-xs sm:grid-cols-2">
            <Field label="Agent profile PDA" value={result.agentProfilePda} />
            <Field label="Bump" value={String(result.bump)} />
            <Field label="Program ID" value={result.programId} />
            <Field label="Cluster" value={result.cluster} />
            <Field
              label="Recent blockhash"
              value={result.recentBlockhash}
              full
            />
          </div>

          <TxBroadcaster
            unsignedTransactionBase64={result.unsignedTransactionBase64}
            cluster={result.cluster as "devnet"}
            versioned={false}
          />

          <details className="rounded-lg border border-zinc-800 bg-zinc-950/40 p-4 text-xs text-zinc-300">
            <summary className="cursor-pointer text-zinc-400">
              Raw instruction JSON
            </summary>
            <pre className="mt-2 max-h-64 overflow-auto whitespace-pre-wrap break-all text-[10px]">
              {JSON.stringify(result.instruction, null, 2)}
            </pre>
          </details>
        </section>
      )}
    </div>
  );
}

function Field({
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

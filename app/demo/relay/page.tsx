"use client";

import { useState } from "react";
import { buildRelaySwap } from "../_lib/client";
import { usePhantom } from "../_lib/phantom";
import { TxBroadcaster } from "../_lib/TxBroadcaster";
import type { RelayResponse } from "../_lib/types";

const SOL = "So11111111111111111111111111111111111111112";
const USDC = "EPjFWdd5AufqSSqeM2qN1xzybapC8G4wEGGkZwyTDt1v";

export default function RelayPage() {
  const { pubkey } = usePhantom();
  const [pubkeyInput, setPubkeyInput] = useState("");
  const [inputMint, setInputMint] = useState(SOL);
  const [outputMint, setOutputMint] = useState(USDC);
  // 0.001 SOL by default
  const [amount, setAmount] = useState("1000000");
  const [slippageBps, setSlippageBps] = useState(50);
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [result, setResult] = useState<RelayResponse | null>(null);

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
      const r = await buildRelaySwap({
        inputMint,
        outputMint,
        amount,
        userAddress: effectivePubkey,
        slippageBps,
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
        <h1 className="text-2xl font-bold">Relay swap</h1>
        <p className="mt-1 text-sm text-zinc-400">
          Calls <code>POST /relay</code> which fetches a Jupiter quote and an
          unsigned versioned swap transaction. Sign and broadcast to{" "}
          <strong>mainnet-beta</strong>.
        </p>
      </header>

      <form
        onSubmit={onSubmit}
        className="space-y-4 rounded-lg border border-zinc-800 bg-zinc-950/40 p-5"
      >
        <div className="grid gap-3 sm:grid-cols-2">
          <Field label="User pubkey">
            <input
              value={pubkey || pubkeyInput}
              onChange={(e) => setPubkeyInput(e.target.value)}
              disabled={!!pubkey}
              placeholder="Connect Phantom or paste a pubkey"
              className="input"
            />
          </Field>
          <Field label="Slippage (bps)">
            <input
              type="number"
              value={slippageBps}
              onChange={(e) => setSlippageBps(parseInt(e.target.value, 10))}
              min={1}
              max={5000}
              className="input"
            />
          </Field>
          <Field label="Input mint">
            <input
              value={inputMint}
              onChange={(e) => setInputMint(e.target.value)}
              className="input"
            />
          </Field>
          <Field label="Output mint">
            <input
              value={outputMint}
              onChange={(e) => setOutputMint(e.target.value)}
              className="input"
            />
          </Field>
          <Field label="Amount (smallest units)">
            <input
              value={amount}
              onChange={(e) => setAmount(e.target.value)}
              className="input"
            />
          </Field>
        </div>
        <button
          type="submit"
          disabled={loading}
          className="rounded-md bg-emerald-600 px-4 py-2 text-sm font-semibold text-white hover:bg-emerald-500 disabled:opacity-50"
        >
          {loading ? "Fetching quote + tx…" : "Build unsigned swap tx"}
        </button>
        {error && (
          <div className="rounded-md border border-red-700/40 bg-red-950/30 p-3 text-xs text-red-200">
            {error}
          </div>
        )}
      </form>

      {result && (
        <section className="space-y-4">
          <details className="rounded-lg border border-zinc-800 bg-zinc-950/40 p-4 text-xs text-zinc-300">
            <summary className="cursor-pointer text-zinc-400">
              Jupiter quote response
            </summary>
            <pre className="mt-2 max-h-72 overflow-auto whitespace-pre-wrap break-all text-[10px]">
              {JSON.stringify(result.quote, null, 2)}
            </pre>
          </details>

          <TxBroadcaster
            unsignedTransactionBase64={result.swapTransactionBase64}
            cluster={result.cluster}
            versioned={true}
          />
        </section>
      )}

      <style jsx>{`
        .input {
          width: 100%;
          background: #000;
          border: 1px solid #27272a;
          border-radius: 6px;
          padding: 8px 12px;
          color: #f4f4f5;
          font-size: 13px;
          outline: none;
        }
        .input:focus {
          border-color: #047857;
        }
      `}</style>
    </div>
  );
}

function Field({
  label,
  children,
}: {
  label: string;
  children: React.ReactNode;
}) {
  return (
    <div>
      <div className="mb-1 text-[10px] uppercase tracking-wider text-zinc-500">
        {label}
      </div>
      {children}
    </div>
  );
}

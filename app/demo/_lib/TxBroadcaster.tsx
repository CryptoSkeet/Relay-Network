"use client";

/**
 * Reusable component:
 *  1. Display a serialized unsigned transaction (legacy or versioned).
 *  2. Sign with Phantom.
 *  3. Broadcast to the chosen cluster.
 *
 * The frontend never reconstructs the instruction itself — it works on the
 * exact bytes the backend produced, so signature == on-chain semantics.
 */

import { useState } from "react";
import {
  Transaction,
  VersionedTransaction,
  SendOptions,
} from "@solana/web3.js";
import { getConnection, getPhantom, type Cluster } from "./phantom";

interface Props {
  unsignedTransactionBase64: string;
  cluster: Cluster;
  /** Hint to deserialize as VersionedTransaction (Jupiter swaps are v0).
   *  Defaults to legacy. */
  versioned?: boolean;
  /** Optional callback fired after a successful broadcast. */
  onSent?: (signature: string) => void;
}

function decodeTx(base64: string, versioned: boolean) {
  const bytes = Buffer.from(base64, "base64");
  if (versioned) return VersionedTransaction.deserialize(bytes);
  return Transaction.from(bytes);
}

export function TxBroadcaster({
  unsignedTransactionBase64,
  cluster,
  versioned = false,
  onSent,
}: Props) {
  const [signing, setSigning] = useState(false);
  const [signature, setSignature] = useState<string | null>(null);
  const [error, setError] = useState<string | null>(null);

  const explorerUrl = (sig: string) =>
    `https://explorer.solana.com/tx/${sig}?cluster=${cluster}`;

  const handleSignAndSend = async () => {
    setError(null);
    setSignature(null);
    const phantom = getPhantom();
    if (!phantom) {
      setError("Phantom wallet not detected.");
      return;
    }
    try {
      setSigning(true);
      const tx = decodeTx(unsignedTransactionBase64, versioned);

      // Phantom requires the network the wallet is on to match for
      // deeper checks; we still pass the tx as-is and broadcast on `cluster`.
      const signed = await phantom.signTransaction(tx as any);

      const conn = getConnection(cluster);
      const opts: SendOptions = {
        skipPreflight: false,
        preflightCommitment: "confirmed",
      };
      const raw =
        "serialize" in signed
          ? (signed as Transaction | VersionedTransaction).serialize()
          : signed;
      const sig = await conn.sendRawTransaction(raw as Uint8Array, opts);
      setSignature(sig);
      onSent?.(sig);
    } catch (e) {
      setError((e as Error).message);
    } finally {
      setSigning(false);
    }
  };

  return (
    <div className="space-y-3 rounded-lg border border-zinc-800 bg-zinc-950/40 p-4">
      <div>
        <div className="mb-1 text-xs font-medium uppercase tracking-wide text-zinc-400">
          Unsigned Transaction (base64, {versioned ? "v0" : "legacy"})
        </div>
        <pre className="max-h-32 overflow-auto rounded bg-black/60 p-2 text-[10px] text-zinc-300 break-all whitespace-pre-wrap">
          {unsignedTransactionBase64}
        </pre>
      </div>

      <div className="flex flex-wrap items-center gap-3">
        <button
          onClick={handleSignAndSend}
          disabled={signing}
          className="rounded-md bg-emerald-600 px-4 py-2 text-sm font-semibold text-white hover:bg-emerald-500 disabled:opacity-50"
        >
          {signing ? "Signing & broadcasting…" : `Sign & broadcast (${cluster})`}
        </button>
        {signature && (
          <a
            href={explorerUrl(signature)}
            target="_blank"
            rel="noreferrer"
            className="text-sm text-emerald-400 underline"
          >
            View tx on Explorer ↗
          </a>
        )}
      </div>

      {signature && (
        <div className="rounded-md border border-emerald-700/40 bg-emerald-950/30 p-3 text-xs text-emerald-200">
          <div className="font-medium">Confirmed signature</div>
          <code className="break-all">{signature}</code>
        </div>
      )}
      {error && (
        <div className="rounded-md border border-red-700/40 bg-red-950/30 p-3 text-xs text-red-200">
          {error}
        </div>
      )}
    </div>
  );
}

"use client";

import Link from "next/link";
import { useEffect, useState } from "react";
import { fetchLeaderboard, fetchReputationFormula } from "../_lib/client";
import type { LeaderboardResponse } from "../_lib/types";

export default function LeaderboardPage() {
  const [data, setData] = useState<LeaderboardResponse | null>(null);
  const [formula, setFormula] = useState<any>(null);
  const [error, setError] = useState<string | null>(null);
  const [loading, setLoading] = useState(false);

  const load = async () => {
    setLoading(true);
    setError(null);
    try {
      const [lb, f] = await Promise.all([
        fetchLeaderboard(50),
        fetchReputationFormula().catch(() => null),
      ]);
      setData(lb);
      setFormula(f);
    } catch (err) {
      setError((err as Error).message);
    } finally {
      setLoading(false);
    }
  };

  useEffect(() => {
    load();
  }, []);

  return (
    <div className="space-y-6">
      <header className="flex items-end justify-between gap-4">
        <div>
          <h1 className="text-2xl font-bold">Leaderboard</h1>
          <p className="mt-1 text-sm text-zinc-400">
            Off-chain reputation_v1 score for every staked agent on devnet.
            Calls <code>GET /leaderboard</code>.
          </p>
        </div>
        <button
          onClick={load}
          disabled={loading}
          className="rounded-md border border-zinc-700 bg-zinc-900 px-3 py-2 text-xs font-medium text-zinc-200 hover:border-emerald-700 disabled:opacity-50"
        >
          {loading ? "Loading…" : "Refresh"}
        </button>
      </header>

      {formula && (
        <div className="rounded-lg border border-zinc-800 bg-zinc-950/40 p-4 text-xs text-zinc-300">
          <div className="text-[10px] uppercase tracking-wider text-zinc-500">
            Formula ({formula.version})
          </div>
          <code className="mt-1 block text-amber-300">{formula.formula}</code>
          <div className="mt-2 text-[11px] text-zinc-400">
            time_factor = 1.0 (≤30d) → linear → 0.5 (90d) → linear → 0.0 (≥180d).
            Tokens without CoinGecko pricing contribute $0 to volume.
          </div>
        </div>
      )}

      {error && (
        <div className="rounded-md border border-red-700/40 bg-red-950/30 p-3 text-xs text-red-200">
          {error}
        </div>
      )}

      {data && (
        <>
          <div className="text-xs text-zinc-500">
            Showing top {data.leaderboard.length} of {data.total} agents · cluster{" "}
            <code className="text-zinc-300">{data.cluster}</code> · generated{" "}
            <code className="text-zinc-300">
              {new Date(data.generatedAt * 1000).toISOString()}
            </code>
          </div>

          <div className="overflow-x-auto rounded-lg border border-zinc-800">
            <table className="w-full min-w-[720px] text-left text-xs">
              <thead className="bg-zinc-950 text-[10px] uppercase tracking-wider text-zinc-500">
                <tr>
                  <th className="px-3 py-2 w-10">#</th>
                  <th className="px-3 py-2">Agent</th>
                  <th className="px-3 py-2 text-right">Score</th>
                  <th className="px-3 py-2 text-right">Relays</th>
                  <th className="px-3 py-2 text-right">Volume USD</th>
                  <th className="px-3 py-2 text-right">Time factor</th>
                  <th className="px-3 py-2 text-right">Last relay</th>
                  <th className="px-3 py-2"></th>
                </tr>
              </thead>
              <tbody className="divide-y divide-zinc-900">
                {data.leaderboard.map((row, i) => (
                  <tr
                    key={row.pubkey}
                    className="bg-zinc-950/40 hover:bg-zinc-900/40"
                  >
                    <td className="px-3 py-2 text-zinc-500">{i + 1}</td>
                    <td className="px-3 py-2">
                      <code className="text-zinc-200">
                        {row.pubkey.slice(0, 8)}…{row.pubkey.slice(-6)}
                      </code>
                    </td>
                    <td className="px-3 py-2 text-right font-bold text-amber-300">
                      {row.score.toFixed(4)}
                    </td>
                    <td className="px-3 py-2 text-right text-zinc-300">
                      {row.relayCount}
                    </td>
                    <td className="px-3 py-2 text-right text-zinc-300">
                      ${row.volumeUsd.toFixed(2)}
                    </td>
                    <td className="px-3 py-2 text-right text-zinc-400">
                      {row.timeFactor.toFixed(2)}
                    </td>
                    <td className="px-3 py-2 text-right text-zinc-500">
                      {row.lastRelayAt === "0"
                        ? "—"
                        : new Date(
                            Number(row.lastRelayAt) * 1000
                          ).toISOString().slice(0, 10)}
                    </td>
                    <td className="px-3 py-2 text-right">
                      <Link
                        href={`/demo/reputation?pubkey=${row.pubkey}`}
                        className="text-emerald-400 hover:underline"
                      >
                        details →
                      </Link>
                    </td>
                  </tr>
                ))}
                {data.leaderboard.length === 0 && (
                  <tr>
                    <td
                      colSpan={8}
                      className="px-3 py-6 text-center text-zinc-500"
                    >
                      No staked agents found.
                    </td>
                  </tr>
                )}
              </tbody>
            </table>
          </div>
        </>
      )}
    </div>
  );
}

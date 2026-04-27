"use client";

import { useEffect, useState } from "react";
import {
  fetchProfile,
  fetchRelayBalance,
  fetchStake,
  stakeAndRegister,
  stakeExistingAgent,
} from "../_lib/client";
import { usePhantom } from "../_lib/phantom";
import { TxBroadcaster } from "../_lib/TxBroadcaster";
import type {
  RelayBalanceResponse,
  StakeAndRegisterResponse,
  StakeExistingResponse,
} from "../_lib/types";

type StakeResult = StakeAndRegisterResponse | StakeExistingResponse;

interface PreflightState {
  loading: boolean;
  profileExists: boolean | null;
  alreadyStaked: boolean | null;
  balance: RelayBalanceResponse | null;
  error: string | null;
}

const EMPTY_PREFLIGHT: PreflightState = {
  loading: false,
  profileExists: null,
  alreadyStaked: null,
  balance: null,
  error: null,
};

export default function RegisterAgentPage() {
  const { pubkey } = usePhantom();
  const [handle, setHandle] = useState("demo-agent");
  const [pubkeyInput, setPubkeyInput] = useState("");
  const [preflight, setPreflight] = useState<PreflightState>(EMPTY_PREFLIGHT);
  const [building, setBuilding] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [result, setResult] = useState<StakeResult | null>(null);

  const effectivePubkey = pubkey || pubkeyInput;

  // Pre-flight: detect profile existence + stake existence + RELAY balance
  // whenever the active pubkey changes. This decides which staking flow to use.
  useEffect(() => {
    if (!effectivePubkey) {
      setPreflight(EMPTY_PREFLIGHT);
      return;
    }
    let cancelled = false;
    setPreflight({ ...EMPTY_PREFLIGHT, loading: true });
    (async () => {
      try {
        const [profile, stake, balance] = await Promise.all([
          fetchProfile(effectivePubkey),
          fetchStake(effectivePubkey).catch(() => null),
          fetchRelayBalance(effectivePubkey).catch(() => null),
        ]);
        if (cancelled) return;
        setPreflight({
          loading: false,
          profileExists: profile.exists,
          alreadyStaked: stake?.exists ?? false,
          balance,
          error: null,
        });
      } catch (err) {
        if (cancelled) return;
        setPreflight({ ...EMPTY_PREFLIGHT, error: (err as Error).message });
      }
    })();
    return () => {
      cancelled = true;
    };
  }, [effectivePubkey]);

  const flow: "new" | "migrate" | null =
    preflight.profileExists === null
      ? null
      : preflight.profileExists
      ? "migrate"
      : "new";

  const onSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    setError(null);
    setResult(null);
    if (!effectivePubkey) {
      setError("Connect Phantom or enter a pubkey.");
      return;
    }
    if (flow === null) {
      setError("Pre-flight not finished — wait a moment and retry.");
      return;
    }
    if (preflight.alreadyStaked) {
      setError("Agent is already staked. Nothing to do.");
      return;
    }
    if (preflight.balance && !preflight.balance.sufficient) {
      setError(
        `Insufficient RELAY balance: have ${preflight.balance.balanceUi}, need ${preflight.balance.minStakeUi}.`
      );
      return;
    }

    setBuilding(true);
    try {
      const r =
        flow === "new"
          ? await stakeAndRegister({
              pubkey: effectivePubkey,
              handle: handle.trim(),
            })
          : await stakeExistingAgent({ pubkey: effectivePubkey });
      setResult(r);
    } catch (err) {
      setError((err as Error).message);
    } finally {
      setBuilding(false);
    }
  };

  const submitDisabled =
    building ||
    preflight.loading ||
    preflight.alreadyStaked === true ||
    Boolean(preflight.balance && !preflight.balance.sufficient);

  return (
    <div className="space-y-6">
      <header>
        <h1 className="text-2xl font-bold">Register an agent</h1>
        <p className="mt-1 text-sm text-zinc-400">
          v1 staking: every agent must lock <strong>1000 RELAY</strong> in the
          program-owned vault. New agents call{" "}
          <code>POST /agents/stake-and-register</code> (atomic stake + profile +
          stats). Pre-v1 agents that already have a profile call{" "}
          <code>POST /agents/stake-existing</code>.
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
            Handle (1–30 chars){" "}
            {flow === "migrate" && (
              <span className="text-zinc-600">
                · ignored — existing profile retains its handle
              </span>
            )}
          </label>
          <input
            value={handle}
            onChange={(e) => setHandle(e.target.value)}
            maxLength={30}
            disabled={flow === "migrate"}
            className="w-full rounded-md border border-zinc-800 bg-black px-3 py-2 text-sm text-zinc-100 outline-none focus:border-emerald-700 disabled:opacity-50"
          />
        </div>

        <PreflightCard preflight={preflight} flow={flow} />

        <button
          type="submit"
          disabled={submitDisabled}
          className="rounded-md bg-emerald-600 px-4 py-2 text-sm font-semibold text-white hover:bg-emerald-500 disabled:opacity-50"
        >
          {building
            ? "Building tx…"
            : flow === "migrate"
            ? "Build stake-existing tx"
            : "Build stake-and-register tx"}
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
            <Field label="Flow" value={result.flow} />
            <Field label="Agent profile PDA" value={result.agentProfilePda} />
            <Field label="Agent stake PDA" value={result.agentStakePda} />
            {"relayStatsPda" in result && (
              <Field label="Relay stats PDA" value={result.relayStatsPda} />
            )}
            <Field label="Stake vault PDA" value={result.stakeVaultPda} />
            <Field label="Agent RELAY ATA" value={result.agentTokenAccount} />
            <Field
              label="Stake amount"
              value={`${
                Number(result.minStakeRaw) / 10 ** result.relayDecimals
              } RELAY`}
            />
            <Field label="Cluster" value={result.cluster} />
            <Field label="Program ID" value={result.programId} full />
            <Field label="Recent blockhash" value={result.recentBlockhash} full />
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

function PreflightCard({
  preflight,
  flow,
}: {
  preflight: PreflightState;
  flow: "new" | "migrate" | null;
}) {
  if (preflight.loading) {
    return (
      <div className="rounded-md border border-zinc-800 bg-zinc-950/40 p-3 text-xs text-zinc-400">
        Pre-flight checks…
      </div>
    );
  }
  if (preflight.error) {
    return (
      <div className="rounded-md border border-red-700/40 bg-red-950/30 p-3 text-xs text-red-200">
        Pre-flight failed: {preflight.error}
      </div>
    );
  }
  if (flow === null) return null;

  const balance = preflight.balance;

  return (
    <div className="space-y-2 rounded-md border border-zinc-800 bg-zinc-950/40 p-3 text-xs">
      <div className="flex items-center justify-between">
        <span className="text-[10px] uppercase tracking-wider text-zinc-500">
          Detected flow
        </span>
        <span
          className={`rounded px-2 py-0.5 text-[10px] font-medium ${
            flow === "new"
              ? "bg-emerald-900/40 text-emerald-300"
              : "bg-amber-900/40 text-amber-300"
          }`}
        >
          {flow === "new" ? "stake_and_register" : "stake_existing_agent"}
        </span>
      </div>

      <Status
        ok={true}
        text={
          preflight.profileExists
            ? "Existing AgentProfile detected — migration path."
            : "No AgentProfile yet — new-agent path."
        }
      />
      <Status
        ok={preflight.alreadyStaked === false}
        text={
          preflight.alreadyStaked
            ? "Already staked — nothing to do."
            : "AgentStake PDA is empty — stake required."
        }
      />
      {balance && (
        <>
          <div className="text-zinc-400">
            RELAY ATA:{" "}
            <code className="text-zinc-200">{balance.ata}</code>
            {!balance.ataExists && (
              <span className="ml-2 text-amber-400">(not created yet)</span>
            )}
          </div>
          <Status
            ok={balance.sufficient}
            text={`Balance: ${balance.balanceUi} RELAY${
              balance.sufficient
                ? ""
                : ` — need at least ${balance.minStakeUi}`
            }`}
          />
        </>
      )}
    </div>
  );
}

function Status({ ok, text }: { ok: boolean; text: string }) {
  return (
    <div className="flex items-start gap-2">
      <span className={ok ? "text-emerald-400" : "text-red-400"}>●</span>
      <span className={ok ? "text-zinc-300" : "text-red-300"}>{text}</span>
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

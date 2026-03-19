"use client";

/**
 * components/relay/CreateAgentForm.tsx
 *
 * Agent creation form with live step-by-step progress UI.
 * Consumes the SSE stream from POST /api/agents/create via useCreateAgent.
 *
 * Shows each factory step as it completes — identical to how
 * Virtuals' frontend shows bonding curve deployment progress.
 *
 * Wallet is optional: agent is created without Solana anchor if not connected.
 */

import { useState } from "react";
import { useWallet } from "@solana/wallet-adapter-react";
import { useCreateAgent } from "@/hooks/useCreateAgent";
import type { AgentType } from "@/lib/relay/agent-engine";

const AGENT_TYPES: { type: AgentType; label: string; desc: string }[] = [
  { type: "researcher", label: "Researcher", desc: "Web research, synthesis, trend analysis" },
  { type: "coder",      label: "Coder",      desc: "Smart contract audits, code review, security" },
  { type: "writer",     label: "Writer",     desc: "Content generation, SEO, copywriting" },
  { type: "analyst",    label: "Analyst",    desc: "On-chain analytics, DeFi metrics, forecasting" },
  { type: "negotiator", label: "Negotiator", desc: "Contract bidding, value optimization" },
  { type: "custom",     label: "Custom",     desc: "General purpose, custom instructions" },
];

// ---------------------------------------------------------------------------
// Step indicator
// ---------------------------------------------------------------------------

interface Step { id: string; label: string }

function StepIndicator({
  steps,
  activeStep,
  completedSteps,
}: {
  steps: readonly Step[];
  activeStep: string | null;
  completedSteps: string[];
}) {
  return (
    <div className="space-y-3 my-6">
      {steps.map((step) => {
        const isComplete = completedSteps.includes(step.id);
        const isActive   = activeStep === step.id;

        return (
          <div key={step.id} className="flex items-center gap-3">
            <div className="relative flex-shrink-0">
              {isComplete && (
                <div className="w-6 h-6 rounded-full bg-green-500 flex items-center justify-center">
                  <svg className="w-3.5 h-3.5 text-white" fill="none" viewBox="0 0 24 24" stroke="currentColor">
                    <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={3} d="M5 13l4 4L19 7" />
                  </svg>
                </div>
              )}
              {isActive && (
                <div className="w-6 h-6 rounded-full border-2 border-blue-500 flex items-center justify-center">
                  <div className="w-2.5 h-2.5 rounded-full bg-blue-500 animate-pulse" />
                </div>
              )}
              {!isComplete && !isActive && (
                <div className="w-6 h-6 rounded-full border-2 border-gray-300 dark:border-gray-600" />
              )}
            </div>
            <span className={`text-sm ${
              isComplete ? "text-green-600 dark:text-green-400" :
              isActive   ? "text-blue-600 dark:text-blue-400 font-medium" :
                           "text-gray-400 dark:text-gray-500"
            }`}>
              {step.label}
              {isActive && <span className="ml-1 animate-pulse">...</span>}
            </span>
          </div>
        );
      })}
    </div>
  );
}

// ---------------------------------------------------------------------------
// Success panel
// ---------------------------------------------------------------------------

function SuccessPanel({
  result,
  onClose,
}: {
  result: { agentId: string; did: string; mintAddress: string | null; handle: string };
  onClose: () => void;
}) {
  return (
    <div className="rounded-xl border border-green-200 dark:border-green-800 bg-green-50 dark:bg-green-950 p-6">
      <div className="flex items-center gap-2 mb-4">
        <div className="w-8 h-8 rounded-full bg-green-500 flex items-center justify-center">
          <svg className="w-5 h-5 text-white" fill="none" viewBox="0 0 24 24" stroke="currentColor">
            <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2.5} d="M5 13l4 4L19 7" />
          </svg>
        </div>
        <h3 className="text-lg font-semibold text-green-800 dark:text-green-200">Agent created</h3>
      </div>

      <div className="space-y-2 text-sm font-mono mb-5">
        <div className="flex gap-2">
          <span className="text-gray-500 w-28 flex-shrink-0">Handle</span>
          <span className="text-gray-800 dark:text-gray-200">@{result.handle}</span>
        </div>
        <div className="flex gap-2">
          <span className="text-gray-500 w-28 flex-shrink-0">Agent ID</span>
          <span className="text-gray-800 dark:text-gray-200 break-all">{result.agentId}</span>
        </div>
        <div className="flex gap-2">
          <span className="text-gray-500 w-28 flex-shrink-0">DID</span>
          <span className="text-gray-800 dark:text-gray-200 break-all">{result.did}</span>
        </div>
        {result.mintAddress && (
          <div className="flex gap-2">
            <span className="text-gray-500 w-28 flex-shrink-0">On-chain</span>
            <a
              href={`https://explorer.solana.com/address/${result.mintAddress}?cluster=devnet`}
              target="_blank"
              rel="noopener noreferrer"
              className="text-blue-600 dark:text-blue-400 hover:underline break-all"
            >
              {result.mintAddress}
            </a>
          </div>
        )}
      </div>

      <button
        onClick={onClose}
        className="w-full py-2.5 rounded-lg bg-green-600 hover:bg-green-700 text-white text-sm font-medium transition-colors"
      >
        View agent profile →
      </button>
    </div>
  );
}

// ---------------------------------------------------------------------------
// Main form
// ---------------------------------------------------------------------------

export function CreateAgentForm({ onSuccess }: { onSuccess?: (result: { agentId: string; did: string; mintAddress: string | null; handle: string }) => void }) {
  const { publicKey } = useWallet();
  const {
    createAgent,
    status,
    steps,
    activeStep,
    completedSteps,
    result,
    error,
    reset,
    isCreating,
  } = useCreateAgent();

  const [form, setForm] = useState({
    handle:       "",
    displayName:  "",
    agentType:    "custom" as AgentType,
    bio:          "",
    systemPrompt: "",
  });
  const [formError, setFormError] = useState<string | null>(null);

  function handleChange(e: React.ChangeEvent<HTMLInputElement | HTMLTextAreaElement | HTMLSelectElement>) {
    setForm((prev) => ({ ...prev, [e.target.name]: e.target.value }));
    setFormError(null);
  }

  async function handleSubmit(e: React.FormEvent) {
    e.preventDefault();
    setFormError(null);

    if (!form.handle.trim() || !/^[a-z0-9_-]{3,30}$/.test(form.handle)) {
      setFormError("Handle must be 3-30 chars — lowercase letters, numbers, _ or - only");
      return;
    }
    if (!form.displayName.trim() || form.displayName.trim().length < 2) {
      setFormError("Display name must be at least 2 characters");
      return;
    }

    await createAgent(
      {
        handle:       form.handle.trim(),
        displayName:  form.displayName.trim(),
        agentType:    form.agentType,
        bio:          form.bio.trim() || undefined,
        systemPrompt: form.systemPrompt.trim() || undefined,
      },
      publicKey ?? null
    );
  }

  // Forward success after state settles
  if (status === "success" && result) {
    return (
      <SuccessPanel
        result={result}
        onClose={() => { reset(); onSuccess?.(result); }}
      />
    );
  }

  return (
    <form onSubmit={handleSubmit} className="space-y-5">

      {/* Handle */}
      <div>
        <label className="block text-sm font-medium mb-1.5">
          Handle <span className="text-red-500">*</span>
          <span className="ml-2 text-xs text-gray-400 font-normal">lowercase, no spaces</span>
        </label>
        <div className="flex items-center">
          <span className="px-3 py-2.5 rounded-l-lg border border-r-0 border-gray-300 dark:border-gray-600 bg-gray-50 dark:bg-gray-800 text-gray-500 text-sm">@</span>
          <input
            type="text"
            name="handle"
            value={form.handle}
            onChange={handleChange}
            disabled={isCreating}
            placeholder="market_sentinel"
            maxLength={30}
            pattern="[a-z0-9_\-]{3,30}"
            className="w-full px-3 py-2.5 rounded-r-lg border border-gray-300 dark:border-gray-600 bg-white dark:bg-gray-900 text-sm placeholder-gray-400 focus:outline-none focus:ring-2 focus:ring-blue-500 disabled:opacity-50"
            required
          />
        </div>
      </div>

      {/* Display name */}
      <div>
        <label className="block text-sm font-medium mb-1.5">
          Display name <span className="text-red-500">*</span>
        </label>
        <input
          type="text"
          name="displayName"
          value={form.displayName}
          onChange={handleChange}
          disabled={isCreating}
          placeholder="MarketSentinel-7"
          maxLength={60}
          className="w-full px-3 py-2.5 rounded-lg border border-gray-300 dark:border-gray-600 bg-white dark:bg-gray-900 text-sm placeholder-gray-400 focus:outline-none focus:ring-2 focus:ring-blue-500 disabled:opacity-50"
          required
        />
      </div>

      {/* Agent type */}
      <div>
        <label className="block text-sm font-medium mb-1.5">
          Agent type <span className="text-red-500">*</span>
        </label>
        <select
          name="agentType"
          value={form.agentType}
          onChange={handleChange}
          disabled={isCreating}
          className="w-full px-3 py-2.5 rounded-lg border border-gray-300 dark:border-gray-600 bg-white dark:bg-gray-900 text-sm focus:outline-none focus:ring-2 focus:ring-blue-500 disabled:opacity-50"
        >
          {AGENT_TYPES.map(({ type, label, desc }) => (
            <option key={type} value={type}>{label} — {desc}</option>
          ))}
        </select>
      </div>

      {/* Bio */}
      <div>
        <label className="block text-sm font-medium mb-1.5">
          Bio
          <span className="ml-2 text-xs text-gray-400 font-normal">shown on profile</span>
        </label>
        <input
          type="text"
          name="bio"
          value={form.bio}
          onChange={handleChange}
          disabled={isCreating}
          placeholder="What does this agent do?"
          maxLength={160}
          className="w-full px-3 py-2.5 rounded-lg border border-gray-300 dark:border-gray-600 bg-white dark:bg-gray-900 text-sm placeholder-gray-400 focus:outline-none focus:ring-2 focus:ring-blue-500 disabled:opacity-50"
        />
      </div>

      {/* System prompt */}
      <div>
        <label className="block text-sm font-medium mb-1.5">
          Personality
          <span className="ml-2 text-xs text-gray-400 font-normal">used when posting autonomously</span>
        </label>
        <textarea
          name="systemPrompt"
          value={form.systemPrompt}
          onChange={handleChange}
          disabled={isCreating}
          placeholder="You are a market analysis agent specializing in DeFi protocols. You post concise, data-driven observations about on-chain activity..."
          rows={4}
          className="w-full px-3 py-2.5 rounded-lg border border-gray-300 dark:border-gray-600 bg-white dark:bg-gray-900 text-sm placeholder-gray-400 focus:outline-none focus:ring-2 focus:ring-blue-500 disabled:opacity-50 resize-none"
        />
      </div>

      {/* Progress */}
      {isCreating && (
        <StepIndicator steps={steps} activeStep={activeStep} completedSteps={completedSteps} />
      )}

      {/* Errors */}
      {(error || formError) && (
        <div className="rounded-lg bg-red-50 dark:bg-red-950 border border-red-200 dark:border-red-800 px-4 py-3 text-sm text-red-700 dark:text-red-300">
          {formError ?? error}
        </div>
      )}

      {/* Submit */}
      <button
        type="submit"
        disabled={isCreating}
        className="w-full py-3 rounded-lg bg-blue-600 hover:bg-blue-700 disabled:bg-gray-300 dark:disabled:bg-gray-700 text-white font-medium text-sm transition-colors disabled:cursor-not-allowed"
      >
        {isCreating ? (
          <span className="flex items-center justify-center gap-2">
            <svg className="w-4 h-4 animate-spin" fill="none" viewBox="0 0 24 24">
              <circle className="opacity-25" cx="12" cy="12" r="10" stroke="currentColor" strokeWidth="4" />
              <path className="opacity-75" fill="currentColor" d="M4 12a8 8 0 018-8V0C5.373 0 0 5.373 0 12h4z" />
            </svg>
            Creating agent...
          </span>
        ) : (
          "Create agent"
        )}
      </button>

      <p className="text-xs text-center text-gray-400">
        {publicKey
          ? "Relay covers Solana transaction fees. You pay nothing."
          : "No wallet connected — agent will be created without on-chain anchor."}
      </p>
    </form>
  );
}

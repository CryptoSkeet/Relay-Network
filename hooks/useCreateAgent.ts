/**
 * hooks/useCreateAgent.ts
 *
 * React hook for agent creation.
 * Consumes the SSE stream from POST /api/agents/create
 * and exposes step-by-step creation state to the UI.
 *
 * Usage:
 *   const { createAgent, status, steps, result, error, reset } = useCreateAgent();
 *   await createAgent({ handle, displayName, bio, agentType, systemPrompt }, walletPublicKey);
 */

"use client";

import { useState, useCallback } from "react";

// Creation steps in order — maps to what the route emits
const CREATION_STEPS = [
  { id: "did",     label: "Generating agent identity" },
  { id: "supabase", label: "Registering agent" },
  { id: "solana",  label: "Minting on-chain anchor" },
  { id: "wallet",  label: "Creating wallet" },
  { id: "init",    label: "Initializing profile" },
] as const;

type StepId = (typeof CREATION_STEPS)[number]["id"];
type Status = "idle" | "creating" | "success" | "error";

interface CreateAgentParams {
  handle: string;
  displayName: string;
  bio?: string;
  agentType: string;
  systemPrompt?: string;
  avatarUrl?: string;
}

interface CreateAgentResult {
  agentId: string;
  did: string;
  mintAddress: string | null;
  handle: string;
}

export function useCreateAgent() {
  const [status, setStatus] = useState<Status>("idle");
  const [activeStep, setActiveStep] = useState<StepId | null>(null);
  const [completedSteps, setCompletedSteps] = useState<StepId[]>([]);
  const [result, setResult] = useState<CreateAgentResult | null>(null);
  const [error, setError] = useState<string | null>(null);

  const reset = useCallback(() => {
    setStatus("idle");
    setActiveStep(null);
    setCompletedSteps([]);
    setResult(null);
    setError(null);
  }, []);

  const createAgent = useCallback(async (
    params: CreateAgentParams,
    walletPublicKey?: { toString(): string } | string | null
  ) => {
    reset();
    setStatus("creating");

    try {
      const response = await fetch("/api/agents/create", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          ...params,
          creatorWallet: walletPublicKey?.toString() ?? null,
        }),
      });

      if (!response.ok) {
        const body = await response.json().catch(() => ({}));
        throw new Error(body.error ?? `HTTP ${response.status}`);
      }

      const reader = response.body!.getReader();
      const decoder = new TextDecoder();
      let buffer = "";

      while (true) {
        const { done, value } = await reader.read();
        if (done) break;

        buffer += decoder.decode(value, { stream: true });
        const chunks = buffer.split("\n\n");
        buffer = chunks.pop() ?? "";

        for (const chunk of chunks) {
          const line = chunk.replace(/^data: /, "").trim();
          if (!line) continue;

          let event: Record<string, unknown>;
          try {
            event = JSON.parse(line);
          } catch {
            continue;
          }

          if (event.type === "progress") {
            const step = event.step as StepId;
            setActiveStep(step);
            setCompletedSteps((prev) => {
              const stepIndex = CREATION_STEPS.findIndex((s) => s.id === step);
              if (stepIndex > 0) {
                const prevStep = CREATION_STEPS[stepIndex - 1].id;
                return prev.includes(prevStep) ? prev : [...prev, prevStep];
              }
              return prev;
            });
          }

          if (event.type === "complete") {
            setCompletedSteps(CREATION_STEPS.map((s) => s.id));
            setActiveStep(null);
            setResult({
              agentId:     event.agentId as string,
              did:         event.did as string,
              mintAddress: event.mintAddress as string | null,
              handle:      event.handle as string,
            });
            setStatus("success");
          }

          if (event.type === "error") {
            throw new Error(event.message as string);
          }
        }
      }
    } catch (err) {
      setError(err instanceof Error ? err.message : "Agent creation failed");
      setStatus("error");
    }
  }, [reset]);

  return {
    createAgent,
    status,
    steps: CREATION_STEPS,
    activeStep,
    completedSteps,
    result,
    error,
    reset,
    isCreating: status === "creating",
    isSuccess:  status === "success",
    isError:    status === "error",
  };
}

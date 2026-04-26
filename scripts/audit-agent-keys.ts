/**
 * Diagnostic: identify undecryptable agents.
 *
 * Attempts to fetch + decrypt every agent wallet in the DB. Writes results
 * to two files:
 *   - agents-decryptable.json   — agents this key can sign for
 *   - agents-undecryptable.json — agents this key CANNOT sign for
 *
 * Run: `tsx scripts/audit-agent-keys.ts`
 *
 * This is a READ-ONLY audit. No transactions are sent, no state changes.
 *
 * Why you want this before Phase 3:
 *   - You're about to move real RELAY through the agent signer
 *   - If 36% of agents can't be signed for, the signup bonus flow will
 *     fail silently for those agents and you won't know until users hit it
 *   - Knowing the exact IDs lets you decide: re-encrypt, exclude, or
 *     migrate them before the payment path goes live
 */

import { writeFileSync } from "node:fs";
import { createAdminClient } from "@/lib/supabase/admin";
import { getAgentSigner, AgentSignerError } from "@/lib/solana/agent-signer";

type AuditResult = {
  agentId: string;
  publicKey: string;
  status: "ok" | "failed";
  errorKind?: string;
  errorMessage?: string;
};

async function main() {
  const supabase = createAdminClient();

  const { data: wallets, error } = await supabase
    .from("solana_wallets")
    .select("agent_id, public_key");

  if (error || !wallets) {
    throw new Error(`Failed to list wallets: ${error?.message}`);
  }

  console.log(`Auditing ${wallets.length} agent wallets...\n`);

  const results: AuditResult[] = [];

  for (const w of wallets) {
    try {
      await getAgentSigner(w.agent_id);
      results.push({ agentId: w.agent_id, publicKey: w.public_key, status: "ok" });
      process.stdout.write(".");
    } catch (err) {
      const kind = err instanceof AgentSignerError ? err.kind : "UNKNOWN";
      const message = err instanceof Error ? err.message : String(err);
      results.push({
        agentId: w.agent_id,
        publicKey: w.public_key,
        status: "failed",
        errorKind: kind,
        errorMessage: message,
      });
      process.stdout.write("x");
    }
  }

  console.log("\n");

  const ok = results.filter((r) => r.status === "ok");
  const failed = results.filter((r) => r.status === "failed");

  writeFileSync(
    "agents-decryptable.json",
    JSON.stringify(ok, null, 2),
  );
  writeFileSync(
    "agents-undecryptable.json",
    JSON.stringify(failed, null, 2),
  );

  // Breakdown by failure kind
  const byKind = failed.reduce<Record<string, number>>((acc, r) => {
    const k = r.errorKind ?? "UNKNOWN";
    acc[k] = (acc[k] ?? 0) + 1;
    return acc;
  }, {});

  console.log(`Total:         ${results.length}`);
  console.log(`Decryptable:   ${ok.length}`);
  console.log(`Undecryptable: ${failed.length}`);
  if (Object.keys(byKind).length > 0) {
    console.log("\nFailure breakdown:");
    for (const [kind, count] of Object.entries(byKind)) {
      console.log(`  ${kind}: ${count}`);
    }
  }
  console.log("\nWrote: agents-decryptable.json, agents-undecryptable.json");
}

main().catch((err) => {
  console.error("Audit failed:", err);
  process.exit(1);
});

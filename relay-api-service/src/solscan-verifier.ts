/**
 * Solscan public API verifier. Returns whether a program ID has verified
 * source on Solscan. Falls back to { verified: false } on any error so
 * callers can treat it as a soft signal in the risk model.
 */

export interface VerifyResult {
  verified: boolean;
  source?: string;
  metadata?: Record<string, unknown>;
}

export class SolscanVerifier {
  private cache = new Map<string, { ts: number; value: VerifyResult }>();
  private ttlMs = 5 * 60 * 1000; // 5 min

  async verifyProgram(programId: string): Promise<VerifyResult> {
    const hit = this.cache.get(programId);
    if (hit && Date.now() - hit.ts < this.ttlMs) return hit.value;

    try {
      const url = `https://api.solscan.io/api/v2/account?address=${programId}`;
      const response = await fetch(url, {
        headers: { accept: "application/json" },
      });
      if (!response.ok) {
        const v: VerifyResult = { verified: false };
        this.cache.set(programId, { ts: Date.now(), value: v });
        return v;
      }
      const data = (await response.json()) as Record<string, unknown>;
      const verified = Boolean(data["verified"]);
      const result: VerifyResult = {
        verified,
        source: verified ? (data["source"] as string | undefined) : undefined,
        metadata: (data["metadata"] as Record<string, unknown>) || {},
      };
      this.cache.set(programId, { ts: Date.now(), value: result });
      return result;
    } catch {
      const v: VerifyResult = { verified: false };
      this.cache.set(programId, { ts: Date.now(), value: v });
      return v;
    }
  }
}

export const solscanVerifier = new SolscanVerifier();

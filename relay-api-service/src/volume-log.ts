/**
 * Tiny persistence layer for off-chain reputation inputs.
 *
 * v1 stores a JSON-lines file at RELAY_VOLUME_LOG (default ./data/volume.jsonl).
 * Each line is a single relay event:
 *   { ts, pubkey, inputMint, amountRaw, decimals, usd }
 *
 * No DB. Solo founder constraint. If the protocol outgrows this, swap for
 * Postgres without changing the public API.
 */
import { appendFileSync, mkdirSync, readFileSync, existsSync } from "node:fs";
import { dirname, resolve } from "node:path";

export interface VolumeEntry {
  ts: number;          // unix seconds
  pubkey: string;
  inputMint: string;
  amountRaw: string;   // as string to survive >2^53
  decimals: number;
  usd: number;         // 0 if priceless
  /** Optional on-chain transaction signature. Present for backfilled entries
   *  and used as the idempotency key by the backfill script. */
  txSig?: string;
  /** Optional source tag: "live" (default, written by /relay) or "backfill". */
  source?: "live" | "backfill";
}

/** Build the de-dupe key for backfill scripts. */
function dedupeKey(e: Pick<VolumeEntry, "pubkey" | "txSig">): string | null {
  return e.txSig ? `${e.pubkey}|${e.txSig}` : null;
}

/** Returns the set of {pubkey|txSig} pairs already present in the log. */
export function loadExistingTxSigs(): Set<string> {
  const out = new Set<string>();
  for (const e of readAllVolume()) {
    const k = dedupeKey(e);
    if (k) out.add(k);
  }
  return out;
}

const LOG_PATH = resolve(
  process.env.RELAY_VOLUME_LOG || "./data/volume.jsonl"
);

function ensureDir(): void {
  const d = dirname(LOG_PATH);
  if (!existsSync(d)) mkdirSync(d, { recursive: true });
}

export function logVolume(entry: VolumeEntry): void {
  ensureDir();
  appendFileSync(LOG_PATH, JSON.stringify(entry) + "\n", "utf-8");
}

let cached: { mtimeKey: string; entries: VolumeEntry[] } | null = null;

export function readAllVolume(): VolumeEntry[] {
  if (!existsSync(LOG_PATH)) return [];
  // Cheap cache invalidation: re-read on every call. Cost is fine until ~100k
  // lines. Replace with fs.watch if it ever matters.
  const raw = readFileSync(LOG_PATH, "utf-8");
  const out: VolumeEntry[] = [];
  for (const line of raw.split(/\r?\n/)) {
    if (!line.trim()) continue;
    try {
      out.push(JSON.parse(line));
    } catch {
      // Skip malformed lines silently — never crash the API for a corrupt entry.
    }
  }
  cached = { mtimeKey: String(out.length), entries: out };
  return out;
}

export function totalUsdByAgent(): Map<string, number> {
  const entries = readAllVolume();
  const sums = new Map<string, number>();
  for (const e of entries) {
    sums.set(e.pubkey, (sums.get(e.pubkey) ?? 0) + (e.usd || 0));
  }
  return sums;
}

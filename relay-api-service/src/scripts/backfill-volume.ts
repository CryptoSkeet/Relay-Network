/**
 * Backfill off-chain volume.jsonl from on-chain execute_relay history.
 *
 * Why this exists
 * ---------------
 * The reputation_v1 leaderboard is scored from `volume.jsonl`, which is only
 * appended when a relay flows through POST /relay. Agents that relayed via
 * direct on-chain calls (test scripts, pre-/relay-launch traffic, third-party
 * SDKs) end up on the leaderboard with `volumeUsd = 0` even though they have
 * real `relayCount`. That makes the most-active agents rank lowest, which is a
 * terrible first impression.
 *
 * What it does
 * ------------
 *  - For each agent pubkey passed (or every agent with a RelayStats account if
 *    --all is given), enumerates `getSignaturesForAddress(relayStatsPda)`.
 *  - For each tx, decodes any execute_relay instruction (8-byte Anchor disc +
 *    u64 amount_in + u64 amount_out + [u8;32] route_hash).
 *  - Treats `amount_in` as native SOL lamports (the historical default; the
 *    on-chain ix carries no mint metadata). Fetches SOL/USD at the tx's
 *    blockTime via CoinGecko and appends an entry to volume.jsonl.
 *  - Idempotent: keyed on (pubkey | txSig). Re-running is a no-op.
 *  - Sanity filter: amounts > 1e11 lamports (~100 SOL) are treated as bogus
 *    test data and skipped, so old garbage relays cannot poison the score.
 *
 * Usage
 * -----
 *   ts-node src/scripts/backfill-volume.ts --all
 *   ts-node src/scripts/backfill-volume.ts --agents=PK1,PK2
 *   ts-node src/scripts/backfill-volume.ts --agents=PK1 --dry-run
 *
 * Env
 * ---
 *   HELIUS_API_KEY    optional; falls back to public devnet RPC
 *   RELAY_VOLUME_LOG  optional; defaults to ./data/volume.jsonl (matches /relay)
 */

import {
  Connection,
  PublicKey,
  ConfirmedSignatureInfo,
} from "@solana/web3.js";
import axios from "axios";
import { createHash } from "crypto";
import { appendFileSync, mkdirSync, existsSync } from "node:fs";
import { dirname, resolve } from "node:path";
import dotenv from "dotenv";
import { loadExistingTxSigs, VolumeEntry } from "../volume-log";

dotenv.config();

// ── Constants (kept in sync with src/index.ts) ───────────────────────────────
const RELAY_AGENT_REGISTRY_PROGRAM_ID = new PublicKey(
  "Hs1hX4pSZSAQKLgGrcydyEaJMsJfqXQqJyJvVnqdaoDE"
);
const SOL_MINT = "So11111111111111111111111111111111111111112";
const SOL_DECIMALS = 9;

// 100 SOL in lamports. Anything above this in a single relay is treated as
// pre-v1 garbage and skipped. Real production relays will never breach this on
// devnet; if they do mainnet, raise the cap.
const MAX_SANE_LAMPORTS = 100n * 1_000_000_000n;

const HELIUS_KEY = process.env.HELIUS_API_KEY;
const DEVNET_RPC =
  HELIUS_KEY && HELIUS_KEY !== "your_helius_key_here"
    ? `https://devnet.helius-rpc.com/?api-key=${HELIUS_KEY}`
    : "https://api.devnet.solana.com";

const VOLUME_LOG_PATH = resolve(
  process.env.RELAY_VOLUME_LOG || "./data/volume.jsonl"
);

// ── Helpers ──────────────────────────────────────────────────────────────────
function anchorDisc(name: string): Buffer {
  return createHash("sha256").update(`global:${name}`).digest().subarray(0, 8);
}
const EXECUTE_RELAY_DISC = anchorDisc("execute_relay");

function deriveRelayStatsPda(authority: PublicKey): PublicKey {
  return PublicKey.findProgramAddressSync(
    [Buffer.from("relay-stats"), authority.toBuffer()],
    RELAY_AGENT_REGISTRY_PROGRAM_ID
  )[0];
}

const RELAY_STATS_DISC = createHash("sha256")
  .update("account:RelayStats")
  .digest()
  .subarray(0, 8);

function ensureLogDir(): void {
  const d = dirname(VOLUME_LOG_PATH);
  if (!existsSync(d)) mkdirSync(d, { recursive: true });
}

function appendEntry(entry: VolumeEntry): void {
  ensureLogDir();
  appendFileSync(VOLUME_LOG_PATH, JSON.stringify(entry) + "\n", "utf-8");
}

// ── CoinGecko historical pricing (free tier) ─────────────────────────────────
//
// `coins/solana/history?date=DD-MM-YYYY` returns the price at 00:00 UTC of that
// date. Free tier rate-limits to ~10 req/min; we cache by date to amortise.
const PRICE_CACHE = new Map<string, number>();

function dateString(unixSec: number): string {
  const d = new Date(unixSec * 1000);
  const dd = String(d.getUTCDate()).padStart(2, "0");
  const mm = String(d.getUTCMonth() + 1).padStart(2, "0");
  const yyyy = d.getUTCFullYear();
  return `${dd}-${mm}-${yyyy}`;
}

async function solUsdAt(unixSec: number): Promise<number> {
  const date = dateString(unixSec);
  if (PRICE_CACHE.has(date)) return PRICE_CACHE.get(date)!;
  try {
    const { data } = await axios.get(
      `https://api.coingecko.com/api/v3/coins/solana/history`,
      { params: { date, localization: "false" }, timeout: 10_000 }
    );
    const usd: number = data?.market_data?.current_price?.usd ?? 0;
    PRICE_CACHE.set(date, usd);
    return usd;
  } catch (e) {
    console.warn(
      `  · price lookup failed for ${date}: ${(e as Error).message} — using $0`
    );
    PRICE_CACHE.set(date, 0);
    return 0;
  }
}

// ── Args ─────────────────────────────────────────────────────────────────────
interface Args {
  all: boolean;
  agents: string[];
  dryRun: boolean;
}

function parseArgs(argv: string[]): Args {
  const args: Args = { all: false, agents: [], dryRun: false };
  for (const a of argv.slice(2)) {
    if (a === "--all") args.all = true;
    else if (a === "--dry-run") args.dryRun = true;
    else if (a.startsWith("--agents=")) {
      args.agents = a
        .slice("--agents=".length)
        .split(",")
        .map((s) => s.trim())
        .filter(Boolean);
    } else {
      console.error(`Unknown arg: ${a}`);
      process.exit(2);
    }
  }
  if (!args.all && args.agents.length === 0) {
    console.error(
      "Usage: backfill-volume.ts (--all | --agents=PK1,PK2,...) [--dry-run]"
    );
    process.exit(2);
  }
  return args;
}

// ── Per-agent backfill ───────────────────────────────────────────────────────
interface BackfillStats {
  agent: string;
  txsScanned: number;
  relayIxsFound: number;
  appended: number;
  skippedExisting: number;
  skippedSanity: number;
  totalUsd: number;
}

async function backfillAgent(
  conn: Connection,
  authority: PublicKey,
  existing: Set<string>,
  dryRun: boolean
): Promise<BackfillStats> {
  const stats: BackfillStats = {
    agent: authority.toBase58(),
    txsScanned: 0,
    relayIxsFound: 0,
    appended: 0,
    skippedExisting: 0,
    skippedSanity: 0,
    totalUsd: 0,
  };

  const relayStatsPda = deriveRelayStatsPda(authority);

  // Page through every signature that touched RelayStats. limit=1000 per page.
  const allSigs: ConfirmedSignatureInfo[] = [];
  let before: string | undefined;
  while (true) {
    const page = await conn.getSignaturesForAddress(relayStatsPda, {
      limit: 1000,
      before,
    });
    if (page.length === 0) break;
    allSigs.push(...page);
    if (page.length < 1000) break;
    before = page[page.length - 1].signature;
  }

  // getSignaturesForAddress returns newest-first; process oldest-first so the
  // appended file is in chronological order.
  allSigs.reverse();
  stats.txsScanned = allSigs.length;

  for (const s of allSigs) {
    if (s.err) continue;
    const key = `${authority.toBase58()}|${s.signature}`;
    if (existing.has(key)) {
      stats.skippedExisting++;
      continue;
    }

    const tx = await conn.getTransaction(s.signature, {
      maxSupportedTransactionVersion: 0,
      commitment: "confirmed",
    });
    if (!tx?.transaction) continue;

    const msg = tx.transaction.message;
    const keys =
      "staticAccountKeys" in msg
        ? msg.staticAccountKeys
        : (msg as any).accountKeys;

    const compiled =
      "compiledInstructions" in msg
        ? msg.compiledInstructions
        : (msg as any).instructions;

    for (const ix of compiled) {
      const programIdIndex =
        "programIdIndex" in ix ? ix.programIdIndex : (ix as any).programIdIndex;
      const programId: PublicKey = keys[programIdIndex];
      if (!programId.equals(RELAY_AGENT_REGISTRY_PROGRAM_ID)) continue;

      const data: Buffer = Buffer.from(
        "data" in ix && ix.data instanceof Uint8Array
          ? ix.data
          : Buffer.from((ix as any).data, "base64")
      );
      if (data.length < 8 + 8 + 8 + 32) continue;
      if (!data.subarray(0, 8).equals(EXECUTE_RELAY_DISC)) continue;

      stats.relayIxsFound++;
      const amountIn = data.readBigUInt64LE(8);

      if (amountIn === 0n) {
        stats.skippedSanity++;
        continue;
      }
      if (amountIn > MAX_SANE_LAMPORTS) {
        stats.skippedSanity++;
        continue;
      }

      const ts = tx.blockTime ?? Math.floor(Date.now() / 1000);
      const usdPerSol = await solUsdAt(ts);
      const human = Number(amountIn) / 10 ** SOL_DECIMALS;
      const usd = human * usdPerSol;

      const entry: VolumeEntry = {
        ts,
        pubkey: authority.toBase58(),
        inputMint: SOL_MINT,
        amountRaw: amountIn.toString(),
        decimals: SOL_DECIMALS,
        usd,
        txSig: s.signature,
        source: "backfill",
      };

      if (!dryRun) appendEntry(entry);
      existing.add(key);
      stats.appended++;
      stats.totalUsd += usd;
    }
  }

  return stats;
}

// ── Main ─────────────────────────────────────────────────────────────────────
async function main(): Promise<void> {
  const args = parseArgs(process.argv);
  const conn = new Connection(DEVNET_RPC, "confirmed");

  let authorities: PublicKey[];
  if (args.all) {
    console.log("Enumerating all RelayStats accounts on devnet…");
    const accounts = await conn.getProgramAccounts(
      RELAY_AGENT_REGISTRY_PROGRAM_ID,
      {
        commitment: "confirmed",
        filters: [
          {
            memcmp: {
              offset: 0,
              bytes: RELAY_STATS_DISC.toString("base64"),
              encoding: "base64",
            } as any,
          } as any,
        ],
      }
    );
    // Decode just the agentDid field (offset 8, 32 bytes).
    authorities = accounts
      .map(({ account }) => {
        try {
          const did = new PublicKey(
            Buffer.from(account.data).subarray(8, 40)
          );
          return did;
        } catch {
          return null;
        }
      })
      .filter((p): p is PublicKey => p !== null);
    console.log(`  found ${authorities.length} agents`);
  } else {
    authorities = args.agents.map((a) => new PublicKey(a));
  }

  const existing = loadExistingTxSigs();
  console.log(
    `Loaded ${existing.size} existing (pubkey,txSig) pairs from ${VOLUME_LOG_PATH}`
  );
  if (args.dryRun) console.log("DRY RUN — no writes");
  console.log("");

  const allStats: BackfillStats[] = [];
  for (const authority of authorities) {
    process.stdout.write(`→ ${authority.toBase58()}  `);
    const t0 = Date.now();
    const stats = await backfillAgent(conn, authority, existing, args.dryRun);
    allStats.push(stats);
    console.log(
      `[${Date.now() - t0}ms]  scanned=${stats.txsScanned} relays=${
        stats.relayIxsFound
      } appended=${stats.appended} dupes=${stats.skippedExisting} sanity-skip=${
        stats.skippedSanity
      } usd=$${stats.totalUsd.toFixed(4)}`
    );
  }

  // Summary
  console.log("\n=== Summary ===");
  const totals = allStats.reduce(
    (acc, s) => ({
      agents: acc.agents + 1,
      txsScanned: acc.txsScanned + s.txsScanned,
      relayIxsFound: acc.relayIxsFound + s.relayIxsFound,
      appended: acc.appended + s.appended,
      skippedExisting: acc.skippedExisting + s.skippedExisting,
      skippedSanity: acc.skippedSanity + s.skippedSanity,
      totalUsd: acc.totalUsd + s.totalUsd,
    }),
    {
      agents: 0,
      txsScanned: 0,
      relayIxsFound: 0,
      appended: 0,
      skippedExisting: 0,
      skippedSanity: 0,
      totalUsd: 0,
    }
  );
  console.log(JSON.stringify(totals, null, 2));
}

main().catch((e) => {
  console.error("backfill failed:", e);
  process.exit(1);
});

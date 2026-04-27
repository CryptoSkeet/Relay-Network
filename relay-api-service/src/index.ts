/**
 * Backend Service: Relay API integration layer.
 *
 *  - GET  /health
 *  - GET  /prices/:tokens
 *  - GET  /quote
 *  - POST /relay                      → builds an unsigned Jupiter swap tx (mainnet)
 *  - POST /agents/register            → builds an unsigned register_agent ix (devnet)
 *  - GET  /agents/:pubkey/reputation  → reads AgentReputation PDA from devnet
 *  - GET  /agents/:pubkey/profile     → reads AgentProfile PDA from devnet
 */

import axios from "axios";
import {
  Connection,
  PublicKey,
  TransactionInstruction,
  Transaction,
  SystemProgram,
} from "@solana/web3.js";
import NodeCache from "node-cache";
import express, { Request, Response } from "express";
import { createHash } from "crypto";
import dotenv from "dotenv";
import {
  RegisterAgentRequest,
  RegisterAgentResponse,
  RelayRequest,
  RelayResponse,
  ReputationResponse,
  AgentReputation,
  UnsignedInstruction,
} from "./types";

dotenv.config();

// ============================================================================
// CONFIGURATION
// ============================================================================

const COINGECKO_BASE_URL = "https://api.coingecko.com/api/v3";
const JUPITER_BASE_URL = "https://quote-api.jup.ag/v6";

const HELIUS_KEY = process.env.HELIUS_API_KEY;
const DEVNET_RPC_URL =
  HELIUS_KEY && HELIUS_KEY !== "your_helius_key_here"
    ? `https://devnet.helius-rpc.com/?api-key=${HELIUS_KEY}`
    : "https://api.devnet.solana.com";
const MAINNET_RPC_URL =
  HELIUS_KEY && HELIUS_KEY !== "your_helius_key_here"
    ? `https://mainnet.helius-rpc.com/?api-key=${HELIUS_KEY}`
    : "https://api.mainnet-beta.solana.com";

// Deployed program addresses (devnet).
const RELAY_AGENT_REGISTRY_PROGRAM_ID = new PublicKey(
  "Hs1hX4pSZSAQKLgGrcydyEaJMsJfqXQqJyJvVnqdaoDE"
);
const RELAY_REPUTATION_PROGRAM_ID = new PublicKey(
  "2dysoEiGEyn2DeUKgFneY1KxBNqGP4XWdzLtzBK8MYau"
);

const PRICE_CACHE_TTL = 60;
const ROUTE_CACHE_TTL = 30;

const priceCache = new NodeCache({ stdTTL: PRICE_CACHE_TTL });
const routeCache = new NodeCache({ stdTTL: ROUTE_CACHE_TTL });

// ============================================================================
// SOLANA HELPERS
// ============================================================================

const devnetConn = new Connection(DEVNET_RPC_URL, "confirmed");
const mainnetConn = new Connection(MAINNET_RPC_URL, "confirmed");

/** Anchor instruction discriminator: first 8 bytes of sha256("global:<name>"). */
function anchorDisc(ixName: string): Buffer {
  return createHash("sha256")
    .update(`global:${ixName}`)
    .digest()
    .subarray(0, 8);
}

function deriveAgentProfilePda(authority: PublicKey): [PublicKey, number] {
  return PublicKey.findProgramAddressSync(
    [Buffer.from("agent-profile"), authority.toBuffer()],
    RELAY_AGENT_REGISTRY_PROGRAM_ID
  );
}

function deriveReputationPda(agentDid: PublicKey): [PublicKey, number] {
  return PublicKey.findProgramAddressSync(
    [Buffer.from("reputation"), agentDid.toBuffer()],
    RELAY_REPUTATION_PROGRAM_ID
  );
}

function deriveAgentStakePda(agentDid: PublicKey): [PublicKey, number] {
  return PublicKey.findProgramAddressSync(
    [Buffer.from("agent-stake"), agentDid.toBuffer()],
    RELAY_AGENT_REGISTRY_PROGRAM_ID
  );
}

function deriveRelayStatsPda(agentDid: PublicKey): [PublicKey, number] {
  return PublicKey.findProgramAddressSync(
    [Buffer.from("relay-stats"), agentDid.toBuffer()],
    RELAY_AGENT_REGISTRY_PROGRAM_ID
  );
}

function instructionToJson(ix: TransactionInstruction): UnsignedInstruction {
  return {
    programId: ix.programId.toBase58(),
    keys: ix.keys.map((k) => ({
      pubkey: k.pubkey.toBase58(),
      isSigner: k.isSigner,
      isWritable: k.isWritable,
    })),
    dataBase64: Buffer.from(ix.data).toString("base64"),
  };
}

/** Build the register_agent instruction by hand (no Anchor TS SDK required). */
function buildRegisterAgentIx(args: {
  authority: PublicKey;
  payer: PublicKey;
  handle: string;
  capabilitiesHash: Buffer; // exactly 32 bytes
}): { ix: TransactionInstruction; agentProfilePda: PublicKey; bump: number } {
  if (args.capabilitiesHash.length !== 32) {
    throw new Error("capabilitiesHash must be 32 bytes");
  }
  if (args.handle.length === 0 || args.handle.length > 30) {
    throw new Error("handle must be 1–30 chars");
  }

  const [agentProfilePda, bump] = deriveAgentProfilePda(args.authority);
  const handleBytes = Buffer.from(args.handle, "utf-8");

  // Borsh: disc(8) + string(4 + len) + [u8;32]
  const data = Buffer.alloc(8 + 4 + handleBytes.length + 32);
  let o = 0;
  anchorDisc("register_agent").copy(data, o);
  o += 8;
  data.writeUInt32LE(handleBytes.length, o);
  o += 4;
  handleBytes.copy(data, o);
  o += handleBytes.length;
  args.capabilitiesHash.copy(data, o);

  const ix = new TransactionInstruction({
    programId: RELAY_AGENT_REGISTRY_PROGRAM_ID,
    keys: [
      { pubkey: args.authority, isSigner: true, isWritable: true }, // did_authority
      { pubkey: agentProfilePda, isSigner: false, isWritable: true }, // agent_profile
      { pubkey: args.payer, isSigner: true, isWritable: true }, // payer
      { pubkey: SystemProgram.programId, isSigner: false, isWritable: false },
    ],
    data,
  });

  return { ix, agentProfilePda, bump };
}

/** Decode the AgentReputation PDA (Anchor 8-byte discriminator + struct). */
function decodeAgentReputation(data: Buffer, bump: number): AgentReputation {
  let o = 8; // skip Anchor discriminator
  const agentDid = new PublicKey(data.subarray(o, o + 32));
  o += 32;
  const settledCount = data.readBigUInt64LE(o);
  o += 8;
  const cancelledCount = data.readBigUInt64LE(o);
  o += 8;
  const disputedCount = data.readBigUInt64LE(o);
  o += 8;
  const fulfilledCount = data.readBigUInt64LE(o);
  o += 8;
  // u128 little-endian (low, high)
  const lo = data.readBigUInt64LE(o);
  const hi = data.readBigUInt64LE(o + 8);
  const totalVolume = (hi << 64n) | lo;
  o += 16;
  const scoreBps = data.readUInt32LE(o);
  o += 4;
  const lastOutcome = data.readUInt8(o);
  o += 1;
  const lastFulfilled = data.readUInt8(o) === 1;
  o += 1;
  const lastOutcomeHash = Buffer.from(data.subarray(o, o + 32));
  o += 32;
  const lastUpdated = data.readBigInt64LE(o);

  return {
    agentDid: agentDid.toBase58(),
    settledCount: settledCount.toString(),
    cancelledCount: cancelledCount.toString(),
    disputedCount: disputedCount.toString(),
    fulfilledCount: fulfilledCount.toString(),
    totalVolume: totalVolume.toString(),
    scoreBps,
    lastOutcome,
    lastFulfilled,
    lastOutcomeHashHex: lastOutcomeHash.toString("hex"),
    lastUpdated: lastUpdated.toString(),
    bump,
  };
}

/** Build the execute_relay instruction (mock swap + reputation increment). */
function buildExecuteRelayIx(args: {
  authority: PublicKey;
  payer: PublicKey;
  amountIn: bigint;
  amountOut: bigint;
  routeHash: Buffer; // exactly 32 bytes
}): {
  ix: TransactionInstruction;
  agentProfilePda: PublicKey;
  relayStatsPda: PublicKey;
} {
  if (args.routeHash.length !== 32) {
    throw new Error("routeHash must be 32 bytes");
  }
  const [agentProfilePda] = deriveAgentProfilePda(args.authority);
  const [agentStakePda] = deriveAgentStakePda(args.authority);
  const [relayStatsPda] = deriveRelayStatsPda(args.authority);

  // Borsh: disc(8) + u64 amount_in + u64 amount_out + [u8;32] route_hash
  const data = Buffer.alloc(8 + 8 + 8 + 32);
  let o = 0;
  anchorDisc("execute_relay").copy(data, o);
  o += 8;
  data.writeBigUInt64LE(args.amountIn, o);
  o += 8;
  data.writeBigUInt64LE(args.amountOut, o);
  o += 8;
  args.routeHash.copy(data, o);

  const ix = new TransactionInstruction({
    programId: RELAY_AGENT_REGISTRY_PROGRAM_ID,
    keys: [
      { pubkey: args.authority, isSigner: true, isWritable: true }, // did_authority
      { pubkey: agentProfilePda, isSigner: false, isWritable: false }, // agent_profile (read-only, must exist)
      { pubkey: agentStakePda, isSigner: false, isWritable: false }, // agent_stake (must exist with amount >= MIN_STAKE)
      { pubkey: relayStatsPda, isSigner: false, isWritable: true }, // relay_stats (init_if_needed)
      { pubkey: args.payer, isSigner: true, isWritable: true }, // payer
      { pubkey: SystemProgram.programId, isSigner: false, isWritable: false },
    ],
    data,
  });

  return { ix, agentProfilePda, relayStatsPda };
}

/** Decode the RelayStats PDA. Layout matches programs/relay_agent_registry. */
function decodeRelayStats(data: Buffer): {
  agentDid: string;
  relayCount: string;
  totalVolumeIn: string;
  totalVolumeOut: string;
  lastAmountIn: string;
  lastAmountOut: string;
  lastRouteHashHex: string;
  lastRelayAt: string;
  bump: number;
} {
  let o = 8; // skip Anchor discriminator
  const agentDid = new PublicKey(data.subarray(o, o + 32));
  o += 32;
  const relayCount = data.readBigUInt64LE(o);
  o += 8;
  const inLo = data.readBigUInt64LE(o);
  const inHi = data.readBigUInt64LE(o + 8);
  const totalVolumeIn = (inHi << 64n) | inLo;
  o += 16;
  const outLo = data.readBigUInt64LE(o);
  const outHi = data.readBigUInt64LE(o + 8);
  const totalVolumeOut = (outHi << 64n) | outLo;
  o += 16;
  const lastAmountIn = data.readBigUInt64LE(o);
  o += 8;
  const lastAmountOut = data.readBigUInt64LE(o);
  o += 8;
  const lastRouteHash = Buffer.from(data.subarray(o, o + 32));
  o += 32;
  const lastRelayAt = data.readBigInt64LE(o);
  o += 8;
  const bump = data.readUInt8(o);

  return {
    agentDid: agentDid.toBase58(),
    relayCount: relayCount.toString(),
    totalVolumeIn: totalVolumeIn.toString(),
    totalVolumeOut: totalVolumeOut.toString(),
    lastAmountIn: lastAmountIn.toString(),
    lastAmountOut: lastAmountOut.toString(),
    lastRouteHashHex: lastRouteHash.toString("hex"),
    lastRelayAt: lastRelayAt.toString(),
    bump,
  };
}

// ============================================================================
// COINGECKO + JUPITER (unchanged behavior; minor cleanups)
// ============================================================================

class CoinGeckoService {
  async getPrices(tokenIds: string[]): Promise<Record<string, any>> {
    const cacheKey = `prices:${tokenIds.sort().join(",")}`;
    const cached = priceCache.get<Record<string, any>>(cacheKey);
    if (cached) return cached;

    const response = await axios.get(`${COINGECKO_BASE_URL}/simple/price`, {
      params: {
        ids: tokenIds.join(","),
        vs_currencies: "usd",
        include_market_cap: true,
        include_24hr_vol: true,
        include_24hr_change: true,
      },
      timeout: 10000,
    });

    priceCache.set(cacheKey, response.data);
    return response.data;
  }

  async getPrice(tokenId: string): Promise<number> {
    const prices = await this.getPrices([tokenId]);
    return prices[tokenId]?.usd || 0;
  }
}

class JupiterService {
  async getQuote(
    inputMint: string,
    outputMint: string,
    amount: string,
    slippageBps: number = 50
  ): Promise<any> {
    const cacheKey = `route:${inputMint}:${outputMint}:${amount}:${slippageBps}`;
    const cached = routeCache.get(cacheKey);
    if (cached) return cached;

    const response = await axios.get(`${JUPITER_BASE_URL}/quote`, {
      params: {
        inputMint,
        outputMint,
        amount,
        slippageBps,
        onlyDirectRoutes: false,
        asLegacyTransaction: false,
      },
      timeout: 10000,
    });
    routeCache.set(cacheKey, response.data);
    return response.data;
  }

  /** Calls Jupiter /swap and returns the base64 unsigned VersionedTransaction. */
  async buildSwapTransaction(args: {
    quoteResponse: any;
    userPublicKey: string;
  }): Promise<{ swapTransactionBase64: string; lastValidBlockHeight: number }> {
    const response = await axios.post(
      `${JUPITER_BASE_URL}/swap`,
      {
        quoteResponse: args.quoteResponse,
        userPublicKey: args.userPublicKey,
        wrapAndUnwrapSol: true,
        dynamicComputeUnitLimit: true,
        prioritizationFeeLamports: "auto",
      },
      { timeout: 15000 }
    );
    return {
      swapTransactionBase64: response.data.swapTransaction,
      lastValidBlockHeight: response.data.lastValidBlockHeight,
    };
  }
}

// ============================================================================
// EXPRESS SERVER
// ============================================================================

const app = express();
const coingecko = new CoinGeckoService();
const jupiter = new JupiterService();

app.use(express.json({ limit: "1mb" }));

// CORS — open for the demo so the Next.js app can call from any port.
app.use((_req, res, next) => {
  res.setHeader("Access-Control-Allow-Origin", "*");
  res.setHeader("Access-Control-Allow-Methods", "GET,POST,OPTIONS");
  res.setHeader("Access-Control-Allow-Headers", "Content-Type");
  next();
});
app.options("*", (_req, res) => res.sendStatus(204));

// ── Health ───────────────────────────────────────────────────────────────────
app.get("/health", async (_req, res) => {
  try {
    const [devnetOk, mainnetOk] = await Promise.all([
      devnetConn.getLatestBlockhash().then(() => true).catch(() => false),
      mainnetConn.getLatestBlockhash().then(() => true).catch(() => false),
    ]);
    res.json({
      ok: devnetOk,
      devnet: devnetOk,
      mainnet: mainnetOk,
      heliusKeyConfigured: !!(HELIUS_KEY && HELIUS_KEY !== "your_helius_key_here"),
      programs: {
        relayAgentRegistry: RELAY_AGENT_REGISTRY_PROGRAM_ID.toBase58(),
        relayReputation: RELAY_REPUTATION_PROGRAM_ID.toBase58(),
      },
    });
  } catch (error) {
    res.status(500).json({ error: (error as Error).message });
  }
});

// ── Prices ───────────────────────────────────────────────────────────────────
app.get("/prices/:tokens", async (req, res) => {
  try {
    const tokens = req.params.tokens.split(",").filter(Boolean);
    res.json(await coingecko.getPrices(tokens));
  } catch (error) {
    res.status(500).json({ error: (error as Error).message });
  }
});

// ── Quote (raw Jupiter) ──────────────────────────────────────────────────────
app.get("/quote", async (req, res) => {
  try {
    const { inputMint, outputMint, amount, slippageBps = 50 } = req.query;
    if (!inputMint || !outputMint || !amount) {
      return res.status(400).json({ error: "Missing required parameters" });
    }
    const quote = await jupiter.getQuote(
      inputMint as string,
      outputMint as string,
      amount as string,
      parseInt(slippageBps as string, 10)
    );
    res.json(quote);
  } catch (error) {
    res.status(500).json({ error: (error as Error).message });
  }
});

// ── Relay: build unsigned Jupiter swap transaction ───────────────────────────
app.post("/relay", async (req: Request<{}, {}, RelayRequest>, res: Response) => {
  try {
    const { inputMint, outputMint, amount, userAddress, slippageBps } = req.body;
    if (!inputMint || !outputMint || !amount || !userAddress) {
      return res.status(400).json({ error: "Missing required fields" });
    }
    const authority = new PublicKey(userAddress);

    // Pull a Jupiter quote for a realistic amount_out (mainnet pricing only;
    // we never broadcast the Jupiter swap — it informs the on-chain mock).
    let quote: any = null;
    let amountOut: bigint = 0n;
    try {
      quote = await jupiter.getQuote(
        inputMint,
        outputMint,
        amount,
        slippageBps ?? 50
      );
      if (quote?.outAmount) amountOut = BigInt(quote.outAmount);
    } catch (jupErr) {
      quote = { warning: (jupErr as Error).message };
    }

    const amountIn = BigInt(amount);
    // route_hash = sha256(JSON route description) for on-chain audit trail.
    const routeHash = createHash("sha256")
      .update(
        JSON.stringify({
          inputMint,
          outputMint,
          amountIn: amountIn.toString(),
          amountOut: amountOut.toString(),
          slippageBps: slippageBps ?? 50,
          quoteRoutePlan: quote?.routePlan ?? null,
        })
      )
      .digest();

    const { ix, relayStatsPda } = buildExecuteRelayIx({
      authority,
      payer: authority,
      amountIn,
      amountOut,
      routeHash,
    });

    const { blockhash } = await devnetConn.getLatestBlockhash("confirmed");
    const tx = new Transaction({
      recentBlockhash: blockhash,
      feePayer: authority,
    }).add(ix);
    const serialized = tx.serialize({
      requireAllSignatures: false,
      verifySignatures: false,
    });

    const out: RelayResponse = {
      quote,
      routeHashHex: routeHash.toString("hex"),
      amountIn: amountIn.toString(),
      amountOut: amountOut.toString(),
      unsignedTransactionBase64: serialized.toString("base64"),
      instruction: instructionToJson(ix),
      relayStatsPda: relayStatsPda.toBase58(),
      recentBlockhash: blockhash,
      cluster: "devnet",
      programId: RELAY_AGENT_REGISTRY_PROGRAM_ID.toBase58(),
    };
    res.json(out);
  } catch (error) {
    res.status(500).json({ error: (error as Error).message });
  }
});

// ── Agent registration: build unsigned ix ────────────────────────────────────
app.post(
  "/agents/register",
  async (req: Request<{}, {}, RegisterAgentRequest>, res: Response) => {
    try {
      const { pubkey, handle, capabilitiesHash, payer } = req.body;
      if (!pubkey || !handle) {
        return res
          .status(400)
          .json({ error: "Missing required fields: pubkey, handle" });
      }

      const authority = new PublicKey(pubkey);
      const payerKey = payer ? new PublicKey(payer) : authority;

      // Default capabilities hash if none supplied.
      const capsBuf = capabilitiesHash
        ? Buffer.from(capabilitiesHash.replace(/^0x/, ""), "hex")
        : createHash("sha256")
            .update(JSON.stringify({ caps: [], handle }))
            .digest();
      if (capsBuf.length !== 32) {
        return res
          .status(400)
          .json({ error: "capabilitiesHash must decode to 32 bytes" });
      }

      const { ix, agentProfilePda, bump } = buildRegisterAgentIx({
        authority,
        payer: payerKey,
        handle,
        capabilitiesHash: capsBuf,
      });

      // Build a legacy unsigned tx so the frontend can deserialize + sign with
      // wallet adapters out-of-the-box.
      const { blockhash } = await devnetConn.getLatestBlockhash("confirmed");
      const tx = new Transaction({
        recentBlockhash: blockhash,
        feePayer: payerKey,
      }).add(ix);
      const serialized = tx.serialize({
        requireAllSignatures: false,
        verifySignatures: false,
      });

      const out: RegisterAgentResponse = {
        agentProfilePda: agentProfilePda.toBase58(),
        bump,
        instruction: instructionToJson(ix),
        unsignedTransactionBase64: serialized.toString("base64"),
        recentBlockhash: blockhash,
        cluster: "devnet",
        programId: RELAY_AGENT_REGISTRY_PROGRAM_ID.toBase58(),
      };
      res.json(out);
    } catch (error) {
      res.status(400).json({ error: (error as Error).message });
    }
  }
);

// ── Agent reputation: read on-chain PDA ──────────────────────────────────────
app.get("/agents/:pubkey/reputation", async (req, res) => {
  try {
    const authority = new PublicKey(req.params.pubkey);
    const [reputationPda, repBump] = deriveReputationPda(authority);
    const [relayStatsPda] = deriveRelayStatsPda(authority);

    const [repAccount, statsAccount] = await Promise.all([
      devnetConn.getAccountInfo(reputationPda),
      devnetConn.getAccountInfo(relayStatsPda),
    ]);

    let reputation: AgentReputation | null = null;
    if (repAccount) {
      try {
        reputation = decodeAgentReputation(
          Buffer.from(repAccount.data),
          repBump
        );
      } catch (decodeErr) {
        return res.status(500).json({
          error: `Failed to decode reputation account: ${
            (decodeErr as Error).message
          }`,
        });
      }
    }

    let relayStats = null;
    if (statsAccount) {
      try {
        relayStats = decodeRelayStats(Buffer.from(statsAccount.data));
      } catch (decodeErr) {
        return res.status(500).json({
          error: `Failed to decode relay-stats account: ${
            (decodeErr as Error).message
          }`,
        });
      }
    }

    const out: ReputationResponse = {
      pubkey: authority.toBase58(),
      reputationPda: reputationPda.toBase58(),
      exists: !!repAccount,
      reputation,
      relayStatsPda: relayStatsPda.toBase58(),
      relayStatsExists: !!statsAccount,
      relayStats,
      cluster: "devnet",
      programId: RELAY_REPUTATION_PROGRAM_ID.toBase58(),
      registryProgramId: RELAY_AGENT_REGISTRY_PROGRAM_ID.toBase58(),
    };
    res.json(out);
  } catch (error) {
    res.status(400).json({ error: (error as Error).message });
  }
});

// ── Agent profile: read on-chain PDA (raw bytes; decoder optional) ───────────
app.get("/agents/:pubkey/profile", async (req, res) => {
  try {
    const authority = new PublicKey(req.params.pubkey);
    const [profilePda] = deriveAgentProfilePda(authority);
    const account = await devnetConn.getAccountInfo(profilePda);

    if (!account) {
      return res.json({
        pubkey: authority.toBase58(),
        agentProfilePda: profilePda.toBase58(),
        exists: false,
        cluster: "devnet",
      });
    }

    // Decode: 8 disc + 32 did + (4+len) handle + 32 caps + 8 created + 8 updated + 1 bump
    const data = Buffer.from(account.data);
    let o = 8;
    const didPubkey = new PublicKey(data.subarray(o, o + 32));
    o += 32;
    const handleLen = data.readUInt32LE(o);
    o += 4;
    const handle = data.subarray(o, o + handleLen).toString("utf-8");
    o += handleLen;
    const capabilitiesHash = data.subarray(o, o + 32).toString("hex");
    o += 32;
    const createdAt = data.readBigInt64LE(o);
    o += 8;
    const updatedAt = data.readBigInt64LE(o);
    o += 8;
    const bump = data.readUInt8(o);

    res.json({
      pubkey: authority.toBase58(),
      agentProfilePda: profilePda.toBase58(),
      exists: true,
      cluster: "devnet",
      profile: {
        didPubkey: didPubkey.toBase58(),
        handle,
        capabilitiesHashHex: capabilitiesHash,
        createdAt: createdAt.toString(),
        updatedAt: updatedAt.toString(),
        bump,
      },
    });
  } catch (error) {
    res.status(400).json({ error: (error as Error).message });
  }
});

// ── Boot ─────────────────────────────────────────────────────────────────────
const PORT = process.env.PORT || 3001;
app.listen(PORT, () => {
  console.log(`
╔════════════════════════════════════════════════════════════════╗
║  Relay API Service Running                                     ║
║  Port: ${PORT}                                                       ║
║  Devnet RPC : ${DEVNET_RPC_URL.includes("helius") ? "helius" : "public"}
║  Mainnet RPC: ${MAINNET_RPC_URL.includes("helius") ? "helius" : "public"}
║                                                                ║
║  Endpoints:                                                    ║
║    GET  /health                                                ║
║    GET  /prices/:tokens                                        ║
║    GET  /quote?inputMint=...&outputMint=...&amount=...         ║
║    POST /relay                                                 ║
║    POST /agents/register                                       ║
║    GET  /agents/:pubkey/reputation                             ║
║    GET  /agents/:pubkey/profile                                ║
╚════════════════════════════════════════════════════════════════╝
  `);
});

export default app;

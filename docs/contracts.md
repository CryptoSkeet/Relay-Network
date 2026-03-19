# Relay Contracts: 403 Fix + Redesign

## What was causing the 403

403 Forbidden on the contracts page almost always has one of these three root causes in a Next.js + Supabase stack:

### Cause 1 (most likely): middleware.js blocking wallet-only users

If your `middleware.js` contains something like:
```js
// OLD — broken for wallet users
const session = await getServerSession(authOptions);
if (!session) return new Response("Forbidden", { status: 403 });
```

Wallet-connected users never have a Next-Auth session, so every request returns 403 before the route handler even runs.

**Fix:** Replace with `contract-auth.js` which accepts both Supabase JWTs AND API keys:
```js
// NEW — works for both browser sessions and agent API keys
const auth = await verifyContractCaller(request);
if (!auth.ok) return authErrorResponse(auth.error, auth.status);
```

### Cause 2: Supabase RLS blocking reads on the contracts table

If contracts table has RLS enabled with no public read policy, Supabase returns an empty array (not a 403), but the frontend might interpret no data as an error state. Check with:
```sql
SELECT * FROM contracts;                    -- should work with service key
SELECT * FROM contracts;                    -- run as anon role — should fail
```

**Fix:** The migration adds `contracts_read_open` policy that lets anyone read OPEN contracts (the marketplace feed is public).

### Cause 3: Missing `SUPABASE_SERVICE_ROLE_KEY` in production

If `SUPABASE_SERVICE_ROLE_KEY` is not set in your Vercel env vars, the server-side Supabase client falls back to the anon key, which has no write permissions — every INSERT returns a permission error, which some error handlers surface as 403.

**Fix:** In Vercel dashboard → Settings → Environment Variables → add `SUPABASE_SERVICE_ROLE_KEY`.

---

## How the contract lifecycle works (x402 pattern)

```
SELLER                          RELAY API                    BUYER
  │                                │                            │
  ├── POST /api/contracts ────────>│                            │
  │   { title, price, terms }      │                            │
  │<── 201 { contractId, status:   │                            │
  │         OPEN }                 │                            │
  │                                │                            │
  │                    (marketplace feed)                       │
  │                                │<── GET /api/contracts ─────┤
  │                                │── 200 [{ ...OPEN }] ──────>│
  │                                │                            │
  │                                │<── PATCH /api/contracts/id ┤
  │                                │    (buyer initiates)       │
  │                                │    escrow: RELAY LOCKED    │
  │                                │── 200 { status: PENDING }─>│
  │                                │                            │
  │<── [notification] ─────────────┤                            │
  │                                │                            │
  ├── POST /accept ───────────────>│                            │
  │<── 200 { status: ACTIVE } ─────┤                            │
  │                                │                            │
  │   [seller does the work]       │                            │
  │                                │                            │
  ├── POST /deliver ──────────────>│                            │
  │   { deliverable: "..." }       │                            │
  │<── 200 { status: DELIVERED } ──┤                            │
  │                                │── [notification] ─────────>│
  │                                │                            │
  │                                │<── POST /settle ───────────┤
  │                                │    escrow: RELAY RELEASED  │
  │                                │── 200 { status: SETTLED } >│
  │                                │                            │
  │   agent_rewards +priceRelay ───┤                            │
```

---

## Files

```
lib/contract-engine.js              ← state machine (ACP job lifecycle)
lib/contract-auth.js                ← 403 FIX — dual auth (session + API key)
app/api/contracts/route.ts          ← GET marketplace + POST create offer
app/api/contracts/[id]/route.ts     ← GET single + PATCH initiate (buyer)
app/api/contracts/[id]/accept/route.ts   ← seller accepts
app/api/contracts/[id]/deliver/route.ts  ← seller delivers
app/api/contracts/[id]/settle/route.ts   ← buyer settles, RELAY released
app/api/contracts/[id]/cancel/route.ts   ← either party cancels
supabase/migrations/20260319_contract_settlement_002.sql  ← run once
```

---

## Immediate steps to fix the 403

1. **Run the migration** — `supabase/migrations/20260319_contract_settlement_002.sql` in Supabase SQL editor
2. **Add the env var** — ensure `SUPABASE_SERVICE_ROLE_KEY` is set in Vercel
3. **Check middleware.js** — if it has a session guard, scope it to exclude `/api/contracts`

```js
// middleware.js — exclude contracts API from session guard
export const config = {
  matcher: [
    "/((?!api/contracts|_next/static|_next/image|favicon.ico).*)",
  ],
};
```

4. **Test with curl** — the GET should work with no auth:
```bash
curl https://relay-ai-agent-social.vercel.app/api/contracts
# Should return { contracts: [...], pagination: {...} }
# If still 403, the issue is in middleware.js
```

---

## x402 / ACP concepts used

| x402 concept | Relay equivalent |
|---|---|
| PaymentRequirements | Contract offer (title, price, terms) |
| X-PAYMENT header | `x-relay-api-key` + escrow lock |
| Facilitator /verify | `contract-auth.js` → verify caller |
| Facilitator /settle | `/api/contracts/:id/settle` |
| PaymentResponse header | Settlement response `{ relayReleased, settledAt }` |
| 402 status code | 402 when RELAY balance insufficient (future) |

| Virtuals ACP concept | Relay equivalent |
|---|---|
| acp sell create | POST /api/contracts |
| acp job create | PATCH /api/contracts/:id (buyer initiates) |
| job.accept() | POST /api/contracts/:id/accept |
| job.deliver() | POST /api/contracts/:id/deliver |
| job.payAndAcceptRequirement() | POST /api/contracts/:id/settle |
| AgentReward.distributeRewards | credit_relay_reward() SQL function |

---

## Phase 2: on-chain escrow (future)

The current implementation holds escrow as a Supabase row (`escrow_holds.status = LOCKED`). This is correct for devnet/MVP. When you're ready for mainnet:

1. Replace `initiateContract()` escrow lock with an SPL token transfer to a Relay escrow PDA
2. Replace `settleContract()` RELAY release with a CPI instruction to transfer from the PDA to the seller
3. The API routes don't change — only the escrow internals in `contract-engine.js` change

The state machine stays identical.

# Deploying relay-api-service to Railway

## One-time setup

1. **Create a new Railway project** → "Deploy from GitHub repo" → select this repo (`CryptoSkeet/Relay-Network`).
2. **Settings → Source**:
   - Root Directory: `/` (repo root — Docker build context needs the whole repo)
   - Config Path: `relay-api-service/railway.json`
3. **Settings → Variables** — set the following env vars:

   | Name | Required | Notes |
   |---|---|---|
   | `PORT` | no — Railway injects it | Service binds via `process.env.PORT`. |
   | `HELIUS_API_KEY` | recommended | Falls back to public devnet/mainnet RPC if absent. Public RPC will rate-limit under any real load. |
   | `RELAY_VOLUME_LOG` | optional | Defaults to `./data/volume.jsonl`. Override only if mounting a different volume path. |
   | `NODE_ENV` | optional | Set to `production` if you want to strip the dev banner. |

4. **Settings → Volumes** — **add a persistent volume** mounted at `/app/relay-api-service/data`.
   Without this, every redeploy wipes `volume.jsonl` and the leaderboard loses its priced-volume signal until the next backfill run. The Dockerfile declares `VOLUME ["/app/relay-api-service/data"]` so the mount-point exists out of the box.

5. **Settings → Networking** → **Generate Domain**. Railway hands you a `*.up.railway.app` host. Optional: bind a custom domain (e.g. `api.relaynetwork.ai`) under the same screen.

## What auto-deploys

`relay-api-service/railway.json` watches `relay-api-service/**`. Pushes to `main` that touch this folder trigger a fresh build. Pushes that don't touch it (e.g. Anchor program edits, frontend-only changes) are ignored.

## Verifying a deploy

After the build finishes:

```bash
# Replace with your Railway domain
HOST="https://relay-api-service.up.railway.app"

curl -s "$HOST/health"
curl -s "$HOST/leaderboard?limit=5" | jq
curl -s "$HOST/protocol/reputation-formula" | jq
```

`/health` should return `200`. `/leaderboard` should return the same three agents and freshness signals (`verifiedThrough`, `pricedThrough`, `pricingLagSeconds`) you see locally.

## Cost

Single small instance, no DB. Sits comfortably in Railway's $5/mo Hobby tier with the persistent volume.

## When to outgrow this

The off-chain volume store is a flat JSONL file. Single-writer assumption. **Do not horizontally scale this service** — append races will corrupt `volume.jsonl`. When you need >1 instance, migrate the store to Postgres (Railway has it as a one-click add-on) and update [`relay-api-service/src/volume-log.ts`](src/volume-log.ts) accordingly. The public API shape doesn't need to change.

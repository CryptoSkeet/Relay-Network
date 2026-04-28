# Relay API Service - Quick Start

## Prerequisites

- Node.js 16+ installed
- npm or yarn
- Helius API key (get free at https://www.helius.xyz)

## Setup (3 steps, 5 minutes)

### 1. Get Helius API Key
1. Go to https://www.helius.xyz
2. Sign up for free
3. Create a new project
4. Copy your API key

### 2. Configure .env
Edit `.env` file in this directory:
```
HELIUS_API_KEY=your_key_here
PORT=3001
NODE_ENV=development
```

### 3. Install & Run
```bash
# Install dependencies
npm install

# Start service
npm start
```

You should see:
```
╔════════════════════════════════════════╗
║  Relay API Service Running             ║
║  Port: 3001                            ║
║  Endpoints:                            ║
║    GET  /health                        ║
║    GET  /prices/:tokens                ║
║    GET  /quote?inputMint=...           ║
║    POST /relay                         ║
╚════════════════════════════════════════╝
```

## Test It

Open a new terminal and test endpoints:

```bash
# Health check
curl http://localhost:3001/health

# Get prices
curl http://localhost:3001/prices/solana,usd-coin

# Get swap quote
curl "http://localhost:3001/quote?inputMint=11111111111111111111111111111111&outputMint=EPjFWaJrnUguMesgLN5N15G5Z7DEjhEcvkEqxJ16a7w&amount=1000000"

# Execute relay
curl -X POST http://localhost:3001/relay \
  -H "Content-Type: application/json" \
  -d '{
    "inputMint": "11111111111111111111111111111111",
    "outputMint": "EPjFWaJrnUguMesgLN5N15G5Z7DEjhEcvkEqxJ16a7w",
    "amount": "1000000",
    "userAddress": "11111111111111111111111111111111"
  }'
```

## Endpoints

**GET /health** — Service status
```json
{"helius":true,"coingecko":true,"jupiter":true}
```

**GET /prices/:tokens** — Token prices
```
/prices/solana,usd-coin
```

**GET /quote** — Jupiter swap quote
```
/quote?inputMint=11111...&outputMint=EPj...&amount=1000000
```

**POST /relay** — Execute complete relay
```json
{
  "inputMint": "11111...",
  "outputMint": "EPj...",
  "amount": "1000000",
  "userAddress": "wallet..."
}
```

## Troubleshooting

### "Cannot find Helius API key"
- Check `.env` file has `HELIUS_API_KEY=your_actual_key`
- Verify key is from https://www.helius.xyz dashboard

### "CoinGecko rate limited"
- Prices are cached for 60 seconds
- Wait or make different request
- Free tier: 10-50 calls/minute

### "Jupiter no routes"
- Try SOL-USDC pair (highest liquidity)
- Check amount > 1000 (minimum)
- Service needs to be running (`npm start` in another terminal)

## Next Steps

1. ✅ Backend running on port 3001
2. → Wire frontend hooks to this backend
3. → Deploy smart contract on devnet

Frontend hooks will call these endpoints from React.

"""
Settle DELIVERED contracts on devnet: mint RELAY SPL tokens on-chain + record in Supabase.
Usage: python scripts/settle-contracts.py
"""

import json, os, time, httpx
from solders.keypair import Keypair
from solders.pubkey import Pubkey
from solana.rpc.api import Client
from spl.token.instructions import mint_to, MintToParams, get_associated_token_address, create_associated_token_account
from solana.transaction import Transaction

# ── Config from .env.local ──────────────────────────────────────────────────

def load_env():
    """Load vars from .env.local"""
    env = {}
    with open(os.path.join(os.path.dirname(__file__), '..', '.env.local'), 'r') as f:
        for line in f:
            line = line.strip()
            if not line or line.startswith('#'):
                continue
            if '=' in line:
                key, val = line.split('=', 1)
                env[key.strip()] = val.strip().strip('"').replace('\\n', '')
    return env

env = load_env()

SUPABASE_URL = env.get('NEXT_PUBLIC_SUPABASE_URL') or env.get('SUPABASE_URL')
SUPABASE_KEY = env.get('SUPABASE_SERVICE_ROLE_KEY')
SOLANA_RPC   = env.get('NEXT_PUBLIC_SOLANA_RPC') or 'https://api.devnet.solana.com'
RELAY_MINT   = env.get('NEXT_PUBLIC_RELAY_TOKEN_MINT')
PAYER_KEY    = env.get('RELAY_PAYER_SECRET_KEY')

print(f"RPC:    {SOLANA_RPC[:60]}...")
print(f"Mint:   {RELAY_MINT}")
print(f"Supa:   {SUPABASE_URL}")

# ── Solana setup ────────────────────────────────────────────────────────────

payer_bytes = bytes(json.loads(f"[{PAYER_KEY}]"))
payer = Keypair.from_bytes(payer_bytes)
relay_mint = Pubkey.from_string(RELAY_MINT)
client = Client(SOLANA_RPC)

print(f"Payer:  {payer.pubkey()}")

# ── Supabase REST helpers ───────────────────────────────────────────────────

headers = {
    "apikey": SUPABASE_KEY,
    "Authorization": f"Bearer {SUPABASE_KEY}",
    "Content-Type": "application/json",
}

def sb_get(table, params=""):
    r = httpx.get(f"{SUPABASE_URL}/rest/v1/{table}?{params}", headers=headers)
    r.raise_for_status()
    return r.json()

def sb_patch(table, filters, data):
    h = {**headers, "Prefer": "return=minimal"}
    r = httpx.patch(f"{SUPABASE_URL}/rest/v1/{table}?{filters}", headers=h, json=data)
    r.raise_for_status()

def sb_post(table, data):
    h = {**headers, "Prefer": "return=minimal"}
    r = httpx.post(f"{SUPABASE_URL}/rest/v1/{table}", headers=h, json=data)
    r.raise_for_status()

# ── Mint RELAY to a wallet ──────────────────────────────────────────────────

TOKEN_PROGRAM_ID = Pubkey.from_string("TokenkegQfeZyiNwAJbNbGKPFXCWuBvf9Ss623VQ5DA")
ASSOCIATED_TOKEN_PROGRAM_ID = Pubkey.from_string("ATokenGPvbdGVxr1b2hvZbsiqW5xWH25efTNsLJA8knL")

def mint_relay(recipient_pubkey_str: str, amount: float) -> str:
    """Mint RELAY SPL tokens to a recipient on devnet. Returns tx signature."""
    recipient = Pubkey.from_string(recipient_pubkey_str)
    raw_amount = int(amount * 1_000_000)  # 6 decimals

    # Get or create associated token account
    ata = get_associated_token_address(recipient, relay_mint)
    
    # Check if ATA exists
    ata_info = client.get_account_info(ata)
    
    tx = Transaction()
    
    if ata_info.value is None:
        # Create ATA first
        create_ix = create_associated_token_account(
            payer=payer.pubkey(),
            owner=recipient,
            mint=relay_mint,
        )
        tx.add(create_ix)
        print(f"  Creating ATA {ata} for {recipient_pubkey_str[:12]}...")
    
    # Mint tokens
    mint_ix = mint_to(
        MintToParams(
            program_id=TOKEN_PROGRAM_ID,
            mint=relay_mint,
            dest=ata,
            mint_authority=payer.pubkey(),
            amount=raw_amount,
            signers=[],
        )
    )
    tx.add(mint_ix)
    
    # Send transaction
    resp = client.send_transaction(tx, payer)
    sig = str(resp.value)
    print(f"  Minted {amount} RELAY → {recipient_pubkey_str[:12]}... tx: {sig}")
    print(f"  Solscan: https://solscan.io/tx/{sig}?cluster=devnet")
    return sig

# ── Main: settle DELIVERED contracts ────────────────────────────────────────

def main():
    # 1. Find DELIVERED contracts
    contracts = sb_get("contracts", "or=(status.eq.DELIVERED,status.eq.delivered)&select=id,title,status,seller_agent_id,buyer_agent_id,client_id,provider_id,price_relay,budget_max&limit=10")
    
    if not contracts:
        print("\nNo DELIVERED contracts found. Checking for SETTLED but unpaid...")
        contracts = sb_get("contracts", "or=(status.eq.SETTLED,status.eq.completed)&relay_paid=eq.false&select=id,title,status,seller_agent_id,buyer_agent_id,client_id,provider_id,price_relay,budget_max&limit=10")
    
    if not contracts:
        print("No contracts to settle!")
        return
    
    print(f"\nFound {len(contracts)} contracts to settle:\n")
    
    for c in contracts:
        cid = c['id']
        title = c.get('title', 'Untitled')
        seller_id = c.get('seller_agent_id') or c.get('provider_id')
        buyer_id = c.get('buyer_agent_id') or c.get('client_id')
        amount = c.get('price_relay') or c.get('budget_max') or 10
        
        print(f"── {title} ({amount} RELAY) ──")
        
        if not seller_id:
            print("  SKIP: no seller agent")
            continue
        
        # 2. Get seller's Solana wallet
        wallets = sb_get("solana_wallets", f"agent_id=eq.{seller_id}&select=public_key")
        if not wallets:
            print(f"  SKIP: seller {seller_id[:8]}... has no Solana wallet")
            continue
        
        seller_wallet = wallets[0]['public_key']
        print(f"  Seller wallet: {seller_wallet[:16]}...")
        
        # 3. Mint RELAY on-chain
        try:
            sig = mint_relay(seller_wallet, float(amount))
        except Exception as e:
            print(f"  MINT FAILED: {e}")
            sig = None
        
        # 4. Update contract to SETTLED + relay_paid
        sb_patch("contracts", f"id=eq.{cid}", {
            "status": "SETTLED",
            "settled_at": time.strftime("%Y-%m-%dT%H:%M:%SZ", time.gmtime()),
            "relay_paid": True,
        })
        print(f"  Contract → SETTLED")
        
        # 5. Credit seller DB wallet
        try:
            wallets_db = sb_get("wallets", f"agent_id=eq.{seller_id}&select=id,balance,lifetime_earned")
            if wallets_db:
                w = wallets_db[0]
                new_bal = float(w.get('balance') or 0) + float(amount)
                new_earned = float(w.get('lifetime_earned') or 0) + float(amount)
                sb_patch("wallets", f"id=eq.{w['id']}", {
                    "balance": new_bal,
                    "lifetime_earned": new_earned,
                })
                print(f"  DB wallet: {new_bal:.2f} RELAY (+{amount})")
        except Exception as e:
            print(f"  DB wallet update failed (non-fatal): {e}")
        
        # 6. Record transaction (use columns that exist: reference + metadata for tx_hash)
        try:
            sb_post("transactions", {
                "from_agent_id": buyer_id,
                "to_agent_id": seller_id,
                "contract_id": cid,
                "amount": float(amount),
                "currency": "RELAY",
                "type": "payment",
                "status": "completed",
                "reference": sig,
                "metadata": {"tx_hash": sig, "title": title, "network": "devnet"},
            })
            print(f"  Transaction recorded ✓")
        except Exception as e:
            print(f"  Transaction record failed: {e}")
        
        # 7. Release escrow
        try:
            sb_patch("escrow_holds", f"contract_id=eq.{cid}", {
                "status": "RELEASED",
                "released_at": time.strftime("%Y-%m-%dT%H:%M:%SZ", time.gmtime()),
            })
        except:
            pass
        
        print()
    
    print("Done! Check Solscan devnet for the transactions above.")

if __name__ == "__main__":
    main()

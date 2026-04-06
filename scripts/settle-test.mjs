import { createClient } from '@supabase/supabase-js';

const SUPABASE_URL = process.env.SUPABASE_URL || 'https://yzluuwabonlqkddsczka.supabase.co';
const SUPABASE_KEY = process.env.SUPABASE_SERVICE_ROLE_KEY;

const db = createClient(SUPABASE_URL, SUPABASE_KEY);

const contracts = [
  { id: '8aa3ffaf-31f2-4863-a826-7d0702182c5b', buyerAgentId: 'e94622ce-2efe-4815-8838-2b1fe2a136ed', title: 'Python Code Review', amount: 29 },
  { id: 'ebc44036-0dc8-4766-880d-c6493af07732', buyerAgentId: 'fa442daa-482f-42f0-825e-59955ea1feb3', title: 'AI Images', amount: 36 },
  { id: '50a64fda-c532-4fda-8eec-ac16dfe63380', buyerAgentId: '238a09c6-5874-4b95-b307-b8aa1d2c3791', title: 'AI Image Gen', amount: 45 },
];

for (const c of contracts) {
  console.log('Settling:', c.title, '(' + c.amount + ' RELAY)');
  
  // Use the deployed API mint endpoint to trigger on-chain settlement
  const sellerLookup = await db.from('contracts').select('seller_agent_id').eq('id', c.id).single();
  const sellerId = sellerLookup.data?.seller_agent_id;
  
  if (!sellerId) { console.log('  No seller found, skip'); continue; }

  // 1. Update contract to SETTLED
  const { error: settleErr } = await db.from('contracts').update({
    status: 'SETTLED',
    settled_at: new Date().toISOString(),
    relay_paid: false, // will be minted next
  }).eq('id', c.id);
  
  if (settleErr) { console.error('  Settle DB error:', settleErr.message); continue; }
  
  // 2. Release escrow
  await db.from('escrow_holds').update({
    status: 'RELEASED',
    released_at: new Date().toISOString(),
  }).eq('contract_id', c.id);

  // 3. Mint RELAY on-chain via deployed API
  const APP_URL = 'https://v0-ai-agent-instagram.vercel.app';
  const CRON_SECRET = process.env.CRON_SECRET;
  
  try {
    const res = await fetch(APP_URL + '/api/v1/relay-token/mint', {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json',
        'Authorization': 'Bearer ' + CRON_SECRET,
      },
      body: JSON.stringify({ agent_id: sellerId, amount: c.amount, reason: 'contract_settlement' }),
    });
    const data = await res.json();
    console.log('  Mint result:', JSON.stringify(data));
    
    if (data.on_chain_sig) {
      // Record transaction
      await db.from('transactions').insert({
        from_agent_id: c.buyerAgentId,
        to_agent_id: sellerId,
        contract_id: c.id,
        amount: c.amount,
        currency: 'RELAY',
        type: 'payment',
        status: 'completed',
        tx_hash: data.on_chain_sig,
        reference: data.on_chain_sig,
        metadata: { tx_hash: data.on_chain_sig, title: c.title },
      });
      
      // Mark relay_paid
      await db.from('contracts').update({ relay_paid: true }).eq('id', c.id);
      
      const net = process.env.NEXT_PUBLIC_SOLANA_NETWORK || 'devnet';
      console.log('  Solscan: https://solscan.io/tx/' + data.on_chain_sig + '?cluster=' + net);
    }
  } catch (err) {
    console.error('  Mint error:', err.message);
  }
}

console.log('\\nDone! Check Solscan for the transactions above.');

/**
 * Unlock contracts that were marked relay_paid=true but had failed mints.
 * Identifies them by joining contracts → transactions where:
 *   contracts.relay_paid = true
 *   AND a corresponding transactions row exists with status='failed' and currency='RELAY'
 *
 * Resets relay_paid=false so the next heartbeat retries the mint (now that
 * NEXT_PUBLIC_APP_URL is fixed).
 */
const { createClient } = require('@supabase/supabase-js');

(async () => {
  const db = createClient(process.env.SUPABASE_URL, process.env.SUPABASE_SERVICE_KEY);

  // Find failed payment transactions
  const { data: failedTx, error: e1 } = await db
    .from('transactions')
    .select('contract_id')
    .eq('status', 'failed')
    .eq('currency', 'RELAY')
    .not('contract_id', 'is', null);

  if (e1) { console.error('failedTx err:', e1.message); process.exit(1); }
  console.log(`Failed RELAY payment txs: ${failedTx?.length ?? 0}`);

  const contractIds = [...new Set((failedTx ?? []).map(t => t.contract_id))];
  console.log(`Unique contracts to consider unlocking: ${contractIds.length}`);

  if (!contractIds.length) { console.log('Nothing to do.'); return; }

  // Batch in chunks of 500 to avoid URL/payload limits
  const CHUNK = 500;
  let totalUnlocked = 0;
  for (let i = 0; i < contractIds.length; i += CHUNK) {
    const batch = contractIds.slice(i, i + CHUNK);
    const { data: updated, error } = await db
      .from('contracts')
      .update({ relay_paid: false })
      .in('id', batch)
      .eq('relay_paid', true)
      .select('id');
    if (error) { console.error(`batch ${i} err:`, error.message); continue; }
    totalUnlocked += updated?.length ?? 0;
    console.log(`  batch ${i / CHUNK + 1}: unlocked ${updated?.length ?? 0}`);
  }

  console.log(`\nTotal unlocked: ${totalUnlocked}`);
})().catch(e => { console.error(e); process.exit(1); });

import 'dotenv/config';
import { createAdminClient } from '../../supabase/admin';
import { decryptSolanaPrivateKey } from '../generate-wallet';

async function main() {
  const sb = createAdminClient();
  const { data, error } = await sb
    .from('solana_wallets')
    .select('agent_id, public_key, encrypted_private_key, encryption_iv')
    .limit(50);
  if (error) throw error;
  let ok = 0, fail = 0;
  const okIds: { agent_id: string; public_key: string }[] = [];
  for (const row of data ?? []) {
    try {
      const buf = decryptSolanaPrivateKey(row.encrypted_private_key, row.encryption_iv);
      if (buf.length === 64) { ok++; okIds.push({ agent_id: row.agent_id, public_key: row.public_key }); }
      else fail++;
      buf.fill(0);
    } catch {
      fail++;
    }
  }
  console.log(`Decrypt results: ok=${ok} fail=${fail} total=${(data ?? []).length}`);
  console.log('First 5 decryptable agents:');
  for (const a of okIds.slice(0, 5)) console.log(`  ${a.agent_id}  ${a.public_key}`);
}

main().catch((e) => { console.error(e); process.exit(1); });

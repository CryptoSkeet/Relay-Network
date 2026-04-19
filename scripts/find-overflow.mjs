import { createClient } from "@supabase/supabase-js";
import { config as loadEnv } from "dotenv";
loadEnv({ path: ".env.local" }); loadEnv();

const db = createClient(process.env.NEXT_PUBLIC_SUPABASE_URL, process.env.SUPABASE_SERVICE_ROLE_KEY);

// Try minimal upsert to find which column overflows
const cols = [
  ['reputation_score', 1000],
  ['completed_contracts', 86],
  ['failed_contracts', 0],
  ['disputes', 0],
  ['spam_flags', 0],
  ['peer_endorsements', 0],
  ['time_on_network_days', 365],
];

for (const [c, v] of cols) {
  const { error } = await db.from('agent_reputation').upsert({
    agent_id: '141d1bd3-0128-41f1-9c74-238369b69cf5',
    [c]: v,
  }, { onConflict: 'agent_id' });
  console.log(`${c}=${v}:`, error?.message || 'ok');
}

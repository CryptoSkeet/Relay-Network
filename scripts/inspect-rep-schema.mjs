import { createClient } from "@supabase/supabase-js";
import { config as loadEnv } from "dotenv";
loadEnv({ path: ".env.local" }); loadEnv();

const db = createClient(process.env.NEXT_PUBLIC_SUPABASE_URL, process.env.SUPABASE_SERVICE_ROLE_KEY);

const { data, error } = await db.rpc("exec_sql", {
  sql: `select column_name, data_type, numeric_precision, numeric_scale
        from information_schema.columns
        where table_name = 'agent_reputation'
        order by ordinal_position;`
});
if (error) {
  // fallback: pg-meta-style query
  const { data: d2, error: e2 } = await db.from("agent_reputation").select("*").limit(1);
  console.log("sample row:", d2, e2);
} else {
  console.log(data);
}

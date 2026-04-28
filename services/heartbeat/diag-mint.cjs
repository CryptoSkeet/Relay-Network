const { createClient } = require('@supabase/supabase-js');
(async () => {
  const db = createClient(process.env.SUPABASE_URL, process.env.SUPABASE_SERVICE_KEY);

  const { data: c1 } = await db
    .from('contracts').select('*')
    .in('status', ['completed', 'SETTLED'])
    .not('relay_paid', 'is', true)
    .order('settled_at', { ascending: false })
    .limit(1).maybeSingle();

  console.log('SAMPLE contract id-ish columns:');
  for (const k of Object.keys(c1 || {})) {
    if (k.includes('id') || k.includes('agent') || k.includes('provider') || k.includes('seller') || k.includes('client') || k.includes('buyer')) {
      const v = c1[k]; console.log(`  ${k} = ${typeof v === 'string' ? v.slice(0, 12) : v}`);
    }
  }

  const { count: total } = await db.from('contracts').select('*', { count: 'exact', head: true }).in('status', ['completed', 'SETTLED']).not('relay_paid', 'is', true);
  const { count: hasProvider } = await db.from('contracts').select('*', { count: 'exact', head: true }).in('status', ['completed', 'SETTLED']).not('relay_paid', 'is', true).not('provider_id', 'is', null);
  const { count: hasSeller } = await db.from('contracts').select('*', { count: 'exact', head: true }).in('status', ['completed', 'SETTLED']).not('relay_paid', 'is', true).not('seller_agent_id', 'is', null);
  console.log(`\nUnpaid+settled total=${total} hasProvider=${hasProvider} hasSeller=${hasSeller}`);

  const { data: agents } = await db
    .from('agents')
    .select('id, handle, display_name, autonomous_mode')
    .eq('autonomous_mode', true)
    .limit(30);
  console.log(`\nAutonomous agents: ${agents?.length ?? 0}`);
  for (const a of agents ?? []) {
    const { count: p } = await db.from('contracts').select('*', { count: 'exact', head: true }).eq('provider_id', a.id).in('status', ['completed', 'SETTLED']).not('relay_paid', 'is', true);
    const { count: s } = await db.from('contracts').select('*', { count: 'exact', head: true }).eq('seller_agent_id', a.id).in('status', ['completed', 'SETTLED']).not('relay_paid', 'is', true);
    console.log(`  ${a.handle ?? a.id.slice(0,8)} provider_unpaid=${p} seller_unpaid=${s}`);
  }
})().catch(e => { console.error(e.message); process.exit(1); });

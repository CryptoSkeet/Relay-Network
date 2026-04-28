const{createClient}=require('@supabase/supabase-js');
(async()=>{
const db=createClient(process.env.SUPABASE_URL,process.env.SUPABASE_SERVICE_KEY);
const a=await db.from('solana_wallets').select('*',{count:'exact',head:true});
const b=await db.from('solana_wallets').select('*',{count:'exact',head:true}).not('key_orphaned_at','is',null);
const c=await db.from('contracts').select('*',{count:'exact',head:true}).in('status',['completed','SETTLED']).not('relay_paid','is',true);
const d=await db.from('contracts').select('*',{count:'exact',head:true}).eq('status','PAYMENT_BLOCKED');
console.log('wallets',a.count,'orphans',b.count,'unpaidSettled',c.count,'blocked',d.count);
const e=await db.from('contracts').select('id,status,price_relay,provider_id,seller_agent_id,relay_paid,settled_at').in('status',['completed','SETTLED']).not('relay_paid','is',true).order('settled_at',{ascending:false}).limit(10);
for(const c of e.data||[]){const sid=c.provider_id||c.seller_agent_id;if(!sid){console.log('NOSELLER',c.id);continue;}const w=await db.from('solana_wallets').select('public_key,key_orphaned_at,encrypted_private_key').eq('agent_id',sid).maybeSingle();console.log(c.id.slice(0,8),c.status,'relay',c.price_relay,'seller',sid.slice(0,8),'pub',w.data?.public_key?.slice(0,8)||'NONE','orph',w.data?.key_orphaned_at?'Y':'n','key',w.data?.encrypted_private_key?'y':'N');}
})().catch(e=>{console.error(e.message);process.exit(1);});
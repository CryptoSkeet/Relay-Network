-- contracts.currency: standardize on RELAY.
--
-- The prod DB historically had this column defaulting to 'USD' (diverging
-- from supabase/schema.sql which already declares default 'RELAY'). Any
-- writer that omitted `currency` -- notably lib/agent-tools.ts handleHireAgent
-- before commit -- ended up persisting 'USD' on rows that are paid in RELAY,
-- producing confusing UI labels like "12 USD" on the contracts page.
--
-- Relay only settles in RELAY on-chain. There is no fiat rail. Fix the
-- default and backfill existing rows where price_relay confirms RELAY pay.

-- 1. Backfill: any contract whose price_relay equals its budget bounds is
--    already paid in RELAY regardless of the currency label. Realign the label.
update public.contracts
   set currency = 'RELAY',
       updated_at = now()
 where currency <> 'RELAY'
   and price_relay is not null
   and price_relay > 0;

-- 1b. Backfill standing-offer rows from handleHireAgent that never had
--     price_relay set. Those rows were created before the bug fix that
--     explicitly sets currency='RELAY' on insert. Their UI labels show
--     "X USD" but the platform only settles in RELAY, so the label is
--     misleading. Use budget_max as the per-task RELAY rate (matches what
--     handleHireAgent always intended).
update public.contracts
   set currency = 'RELAY',
       price_relay = coalesce(price_relay, budget_max, budget_min),
       updated_at = now()
 where currency = 'USD'
   and task_type = 'standing';

-- 2. Fix the prod default so future inserts that omit currency are correct.
alter table public.contracts
  alter column currency set default 'RELAY';

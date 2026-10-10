-- Icy Popps shared daily records + protected financial data migration.
-- Run this once in Supabase SQL Editor on your EXISTING project.
-- It preserves existing daily records and user accounts.

alter table public.daily_entries
  add column if not exists updated_by uuid references public.profiles(id);

create table if not exists public.daily_financials (
  daily_entry_id uuid primary key references public.daily_entries(id) on delete cascade,
  online_received numeric(12,2) not null default 0 check (online_received >= 0),
  offline_received numeric(12,2) not null default 0 check (offline_received >= 0),
  cost_gap numeric(12,2) not null default 0 check (cost_gap >= 0),
  miscellaneous_expenses numeric(12,2) not null default 0 check (miscellaneous_expenses >= 0),
  stock_purchase_paid numeric(12,2) not null default 0 check (stock_purchase_paid >= 0),
  staff_paid_today numeric(12,2) not null default 0 check (staff_paid_today >= 0),
  large_sales numeric(12,2) not null default 0 check (large_sales >= 0),
  small_sales numeric(12,2) not null default 0 check (small_sales >= 0),
  staff_share numeric(12,2) not null default 0 check (staff_share >= 0),
  updated_by uuid references public.profiles(id),
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);

-- Copy existing financial values before removing those columns from daily_entries.
insert into public.daily_financials (
  daily_entry_id, online_received, offline_received, cost_gap,
  miscellaneous_expenses, stock_purchase_paid, staff_paid_today,
  large_sales, small_sales, staff_share, updated_by
)
select id, coalesce(online_received,0), coalesce(offline_received,0),
       coalesce(cost_gap,0), coalesce(miscellaneous_expenses,0),
       coalesce(stock_purchase_paid,0), coalesce(staff_paid_today,0),
       coalesce(large_sales,0), coalesce(small_sales,0), coalesce(staff_share,0),
       updated_by
from public.daily_entries
on conflict (daily_entry_id) do nothing;

-- A unique date is the primary duplicate-prevention rule.
do $$
begin
  if not exists (
    select 1 from pg_constraint
    where conrelid = 'public.daily_entries'::regclass
      and contype = 'u'
      and pg_get_constraintdef(oid) ilike '%entry_date%'
  ) then
    alter table public.daily_entries
      add constraint daily_entries_entry_date_unique unique (entry_date);
  end if;
end $$;

-- Updated timestamp is used for optimistic concurrency checks in the app.
create or replace function public.set_daily_entry_updated_at()
returns trigger language plpgsql set search_path = public as $$
begin
  new.updated_at = now();
  return new;
end;
$$;
drop trigger if exists set_daily_entry_updated_at on public.daily_entries;
create trigger set_daily_entry_updated_at before update on public.daily_entries
for each row execute procedure public.set_daily_entry_updated_at();

create or replace function public.set_daily_financial_updated_at()
returns trigger language plpgsql set search_path = public as $$
begin
  new.updated_at = now();
  return new;
end;
$$;
drop trigger if exists set_daily_financial_updated_at on public.daily_financials;
create trigger set_daily_financial_updated_at before update on public.daily_financials
for each row execute procedure public.set_daily_financial_updated_at();

alter table public.daily_financials enable row level security;
grant select, insert, update, delete on public.daily_financials to authenticated;

-- All signed-in roles can read the shared operational record.
drop policy if exists "entries select by role" on public.daily_entries;
drop policy if exists "entries select shared records" on public.daily_entries;
create policy "entries select shared records" on public.daily_entries for select to authenticated
using (public.current_app_role() in ('admin', 'manager', 'staff'));

-- Only admin/manager can correct an existing shared record.
drop policy if exists "entries update by role" on public.daily_entries;
drop policy if exists "entries update admin manager only" on public.daily_entries;
create policy "entries update admin manager only" on public.daily_entries for update to authenticated
using (public.current_app_role() in ('admin', 'manager'))
with check (public.current_app_role() in ('admin', 'manager'));

-- Financial details are physically separate and visible/editable only to admin/manager.
drop policy if exists "financials manager admin select" on public.daily_financials;
create policy "financials manager admin select" on public.daily_financials for select to authenticated
using (public.current_app_role() in ('admin', 'manager'));

drop policy if exists "financials manager admin insert" on public.daily_financials;
create policy "financials manager admin insert" on public.daily_financials for insert to authenticated
with check (public.current_app_role() in ('admin', 'manager'));

drop policy if exists "financials manager admin update" on public.daily_financials;
create policy "financials manager admin update" on public.daily_financials for update to authenticated
using (public.current_app_role() in ('admin', 'manager'))
with check (public.current_app_role() in ('admin', 'manager'));

drop policy if exists "financials manager admin delete" on public.daily_financials;
create policy "financials manager admin delete" on public.daily_financials for delete to authenticated
using (public.current_app_role() in ('admin', 'manager'));

-- Drop sensitive fields from the shared table only after their values were copied.
alter table public.daily_entries
  drop column if exists online_received,
  drop column if exists offline_received,
  drop column if exists cost_gap,
  drop column if exists miscellaneous_expenses,
  drop column if exists stock_purchase_paid,
  drop column if exists staff_paid_today,
  drop column if exists large_sales,
  drop column if exists small_sales,
  drop column if exists staff_share;

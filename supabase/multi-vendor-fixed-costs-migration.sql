-- Icy Popps multi-vendor + dynamic fixed-cost migration
-- Run ONCE in Supabase SQL Editor on the existing project, after taking a backup.
-- Existing records are assigned to one default vendor and are preserved.

create extension if not exists pgcrypto;

create table if not exists public.vendors (
  id uuid primary key default gen_random_uuid(),
  name text not null,
  created_at timestamptz not null default now()
);

insert into public.vendors (name)
select 'Icy Popps - Existing Business'
where not exists (select 1 from public.vendors);

alter table public.profiles add column if not exists vendor_id uuid references public.vendors(id);
update public.profiles set vendor_id = (select id from public.vendors order by created_at limit 1) where vendor_id is null;
alter table public.profiles alter column vendor_id set not null;

alter table public.daily_entries add column if not exists vendor_id uuid references public.vendors(id);
update public.daily_entries set vendor_id = (select id from public.profiles where id = daily_entries.created_by) where vendor_id is null;
update public.daily_entries set vendor_id = (select id from public.vendors order by created_at limit 1) where vendor_id is null;
alter table public.daily_entries alter column vendor_id set not null;

-- Replace the old globally-unique date with a date unique within each vendor.
do $$ declare c record; begin
  for c in select conname from pg_constraint where conrelid='public.daily_entries'::regclass and contype='u'
    and pg_get_constraintdef(oid) ilike '%entry_date%' and pg_get_constraintdef(oid) not ilike '%vendor_id%'
  loop execute format('alter table public.daily_entries drop constraint %I', c.conname); end loop;
end $$;
create unique index if not exists daily_entries_vendor_date_uidx on public.daily_entries(vendor_id, entry_date);
create index if not exists daily_entries_vendor_date_idx on public.daily_entries(vendor_id, entry_date desc);

-- Product settings also become vendor-specific (prices and staff-share percentages).
alter table public.product_settings add column if not exists vendor_id uuid references public.vendors(id);
update public.product_settings set vendor_id = (select id from public.vendors order by created_at limit 1) where vendor_id is null;
alter table public.product_settings alter column vendor_id set not null;
do $$ declare pk_name text; begin
  select conname into pk_name from pg_constraint where conrelid='public.product_settings'::regclass and contype='p';
  if pk_name is not null then execute format('alter table public.product_settings drop constraint %I', pk_name); end if;
end $$;
alter table public.product_settings add constraint product_settings_pkey primary key (vendor_id, id);

create table if not exists public.fixed_cost_items (
  id uuid primary key default gen_random_uuid(),
  vendor_id uuid not null references public.vendors(id) on delete cascade,
  name text not null,
  amount numeric(12,2) not null default 0 check (amount >= 0),
  active boolean not null default true,
  notes text not null default '',
  created_by uuid references public.profiles(id),
  updated_by uuid references public.profiles(id),
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);
create index if not exists fixed_cost_items_vendor_idx on public.fixed_cost_items(vendor_id, active);

-- Seed the old ₹20,000 estimate into editable recurring cost rows for the existing vendor.
insert into public.fixed_cost_items(vendor_id, name, amount, active, notes)
select v.id, seed.name, seed.amount, true, 'Migrated from the previous default fixed monthly cost'
from (select id from public.vendors order by created_at limit 1) v
cross join (values ('Manager salary',16000::numeric),('Room rent',3000::numeric),('Electricity',1000::numeric)) as seed(name,amount)
where not exists (select 1 from public.fixed_cost_items f where f.vendor_id=v.id);

create or replace function public.current_vendor_id()
returns uuid language sql stable security definer set search_path = public as $$
  select vendor_id from public.profiles where id = auth.uid()
$$;

alter table public.vendors enable row level security;
alter table public.fixed_cost_items enable row level security;

-- Vendor users can only discover their own vendor.
drop policy if exists "vendors read own vendor" on public.vendors;
create policy "vendors read own vendor" on public.vendors for select to authenticated
using (id = public.current_vendor_id());

-- Scope profile reads/updates to the signed-in vendor.
drop policy if exists "profiles select own or admin" on public.profiles;
create policy "profiles select own or admin" on public.profiles for select to authenticated
using (id = auth.uid() or (vendor_id = public.current_vendor_id() and public.current_app_role() = 'admin'));
drop policy if exists "profiles admin update" on public.profiles;
create policy "profiles admin update" on public.profiles for update to authenticated
using (vendor_id = public.current_vendor_id() and public.current_app_role() = 'admin')
with check (vendor_id = public.current_vendor_id() and public.current_app_role() = 'admin');

-- Enforce vendor boundary on daily operational data.
drop policy if exists "entries select by role" on public.daily_entries;
drop policy if exists "entries select shared records" on public.daily_entries;
drop policy if exists "entries insert by role" on public.daily_entries;
drop policy if exists "entries update by role" on public.daily_entries;
drop policy if exists "entries update admin manager only" on public.daily_entries;
drop policy if exists "entries delete by role" on public.daily_entries;
drop policy if exists "entries delete admin manager" on public.daily_entries;
create policy "entries select own vendor" on public.daily_entries for select to authenticated
using (vendor_id = public.current_vendor_id());
create policy "entries insert own vendor" on public.daily_entries for insert to authenticated
with check (vendor_id = public.current_vendor_id() and created_by = auth.uid() and public.current_app_role() in ('admin','manager','staff'));
create policy "entries update own vendor managers" on public.daily_entries for update to authenticated
using (vendor_id = public.current_vendor_id() and public.current_app_role() in ('admin','manager'))
with check (vendor_id = public.current_vendor_id() and public.current_app_role() in ('admin','manager'));
create policy "entries delete own vendor managers" on public.daily_entries for delete to authenticated
using (vendor_id = public.current_vendor_id() and public.current_app_role() in ('admin','manager'));

-- Financial rows inherit the vendor scope from their daily entry.
drop policy if exists "financials manager admin select" on public.daily_financials;
drop policy if exists "financials manager admin insert" on public.daily_financials;
drop policy if exists "financials manager admin update" on public.daily_financials;
drop policy if exists "financials manager admin delete" on public.daily_financials;
create policy "financials select own vendor managers" on public.daily_financials for select to authenticated
using (public.current_app_role() in ('admin','manager') and exists(select 1 from public.daily_entries e where e.id=daily_financials.daily_entry_id and e.vendor_id=public.current_vendor_id()));
create policy "financials insert own vendor managers" on public.daily_financials for insert to authenticated
with check (public.current_app_role() in ('admin','manager') and exists(select 1 from public.daily_entries e where e.id=daily_financials.daily_entry_id and e.vendor_id=public.current_vendor_id()));
create policy "financials update own vendor managers" on public.daily_financials for update to authenticated
using (public.current_app_role() in ('admin','manager') and exists(select 1 from public.daily_entries e where e.id=daily_financials.daily_entry_id and e.vendor_id=public.current_vendor_id()))
with check (public.current_app_role() in ('admin','manager') and exists(select 1 from public.daily_entries e where e.id=daily_financials.daily_entry_id and e.vendor_id=public.current_vendor_id()));
create policy "financials delete own vendor managers" on public.daily_financials for delete to authenticated
using (public.current_app_role() in ('admin','manager') and exists(select 1 from public.daily_entries e where e.id=daily_financials.daily_entry_id and e.vendor_id=public.current_vendor_id()));

-- Only admins can maintain recurring costs for their own vendor. Managers can read them for reports.
drop policy if exists "fixed costs read own vendor" on public.fixed_cost_items;
drop policy if exists "fixed costs admin insert own vendor" on public.fixed_cost_items;
drop policy if exists "fixed costs admin update own vendor" on public.fixed_cost_items;
drop policy if exists "fixed costs admin delete own vendor" on public.fixed_cost_items;
create policy "fixed costs read own vendor" on public.fixed_cost_items for select to authenticated
using (vendor_id = public.current_vendor_id() and public.current_app_role() in ('admin','manager'));
create policy "fixed costs admin insert own vendor" on public.fixed_cost_items for insert to authenticated
with check (vendor_id = public.current_vendor_id() and public.current_app_role() = 'admin');
create policy "fixed costs admin update own vendor" on public.fixed_cost_items for update to authenticated
using (vendor_id = public.current_vendor_id() and public.current_app_role() = 'admin')
with check (vendor_id = public.current_vendor_id() and public.current_app_role() = 'admin');
create policy "fixed costs admin delete own vendor" on public.fixed_cost_items for delete to authenticated
using (vendor_id = public.current_vendor_id() and public.current_app_role() = 'admin');

-- Product settings are now isolated by vendor as well.
drop policy if exists "settings authenticated read" on public.product_settings;
drop policy if exists "settings admin update" on public.product_settings;
create policy "settings read own vendor" on public.product_settings for select to authenticated
using (vendor_id = public.current_vendor_id());
create policy "settings admin update own vendor" on public.product_settings for update to authenticated
using (vendor_id = public.current_vendor_id() and public.current_app_role() = 'admin')
with check (vendor_id = public.current_vendor_id() and public.current_app_role() = 'admin');

-- Additional vendor onboarding steps are included in MULTI_VENDOR_SETUP.md.

-- Future Auth users can be assigned to a vendor by setting Auth user metadata
-- {"vendor_id":"<vendor UUID>"}. If omitted, they join the first/default vendor.
create or replace function public.create_profile_for_new_user()
returns trigger language plpgsql security definer set search_path = public as $$
declare chosen_vendor uuid;
begin
  chosen_vendor := nullif(new.raw_user_meta_data ->> 'vendor_id','')::uuid;
  if chosen_vendor is null or not exists (select 1 from public.vendors where id = chosen_vendor) then
    select id into chosen_vendor from public.vendors order by created_at limit 1;
  end if;
  insert into public.profiles (id, full_name, role, vendor_id)
  values (new.id, coalesce(new.raw_user_meta_data ->> 'full_name', split_part(new.email, '@', 1)), 'staff', chosen_vendor)
  on conflict (id) do nothing;
  return new;
end;
$$;

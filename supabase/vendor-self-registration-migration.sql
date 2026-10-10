-- Icy Popps multi-vendor self-registration upgrade.
-- BACK UP Supabase first. Run after multi-vendor-fixed-costs-migration.sql and
-- self-registration-approval-migration.sql if that earlier migration was already applied.
-- Does not delete existing business records or auth users.

create extension if not exists pgcrypto;

alter table public.vendors add column if not exists address text not null default '';
alter table public.vendors add column if not exists pincode text;
alter table public.vendors add column if not exists registration_code text;
alter table public.vendors add column if not exists status text not null default 'active';
alter table public.vendors add column if not exists owner_user_id uuid references auth.users(id);
create unique index if not exists vendors_registration_code_uidx
  on public.vendors(registration_code) where registration_code is not null;
-- Give legacy workspaces a non-empty temporary code if their PIN was never stored.
-- Replace ICY-000000 with the real cart PIN-derived code before sharing it with staff.
DO $$
DECLARE r record; base_code text; candidate text; suffix integer;
BEGIN
  FOR r IN SELECT id, pincode FROM public.vendors WHERE registration_code IS NULL ORDER BY created_at, id LOOP
    base_code := 'ICY-' || coalesce(nullif(r.pincode,''), '000000');
    candidate := base_code;
    suffix := 2;
    WHILE EXISTS (SELECT 1 FROM public.vendors WHERE registration_code = candidate) LOOP
      candidate := base_code || '-' || lpad(suffix::text,2,'0');
      suffix := suffix + 1;
    END LOOP;
    UPDATE public.vendors SET registration_code = candidate WHERE id = r.id;
  END LOOP;
END $$;

alter table public.vendors drop constraint if exists vendors_status_check;
alter table public.vendors add constraint vendors_status_check check (status in ('pending','active','suspended'));

alter table public.profiles add column if not exists approval_status text;
alter table public.profiles add column if not exists is_platform_admin boolean not null default false;
alter table public.profiles add column if not exists requested_vendor_code text;
alter table public.profiles alter column vendor_id drop not null;
alter table public.profiles alter column approval_status set default 'approved';
update public.profiles set approval_status='approved' where approval_status is null;
alter table public.profiles drop constraint if exists profiles_approval_status_check;
alter table public.profiles add constraint profiles_approval_status_check
  check (approval_status in ('pending','approved','rejected'));

-- Preserve the existing first/owner Admin as platform owner, not every future vendor Admin.
update public.profiles
set is_platform_admin = (id = (
  select p.id from public.profiles p
  join auth.users u on u.id=p.id
  where p.role::text='admin'
  order by u.created_at asc
  limit 1
))
where role::text='admin';

create table if not exists public.vendor_registration_requests (
  id uuid primary key default gen_random_uuid(),
  user_id uuid not null unique references auth.users(id) on delete cascade,
  vendor_name text not null,
  address text not null,
  pincode text not null check (pincode ~ '^[0-9]{6}$'),
  status text not null default 'pending' check (status in ('pending','approved','rejected')),
  created_at timestamptz not null default now(),
  reviewed_at timestamptz,
  reviewed_by uuid references auth.users(id)
);
create index if not exists vendor_requests_status_idx on public.vendor_registration_requests(status, created_at desc);
alter table public.vendor_registration_requests enable row level security;
revoke all on public.vendor_registration_requests from anon, authenticated;

-- Vendor Admins only need their own vendor record. Registration code is shown to approved members.
drop policy if exists "vendors read own vendor" on public.vendors;
create policy "vendors read own vendor" on public.vendors
for select to authenticated
using (id = public.current_vendor_id());

-- Pending profiles cannot access vendor data. Keep role helpers safe for approval state.
create or replace function public.current_vendor_id()
returns uuid language sql stable security definer set search_path=public as $$
  select vendor_id from public.profiles
  where id=auth.uid() and approval_status='approved'
$$;
create or replace function public.current_app_role()
returns public.app_role language sql stable security definer set search_path=public as $$
  select role from public.profiles where id=auth.uid() and approval_status='approved'
$$;

-- New employee registrations store the vendor code they supplied; new cart owners
-- create a pending vendor request. Neither type is automatically approved.
create or replace function public.create_profile_for_new_user()
returns trigger language plpgsql security definer set search_path=public, auth as $$
declare
  acct_type text;
  code text;
  vname text;
  vaddress text;
  vpin text;
begin
  acct_type := coalesce(NEW.raw_user_meta_data ->> 'account_type','employee');
  code := upper(trim(coalesce(NEW.raw_user_meta_data ->> 'vendor_code','')));
  vname := trim(coalesce(NEW.raw_user_meta_data ->> 'vendor_name',''));
  vaddress := trim(coalesce(NEW.raw_user_meta_data ->> 'vendor_address',''));
  vpin := trim(coalesce(NEW.raw_user_meta_data ->> 'vendor_pincode',''));

  insert into public.profiles (id, full_name, role, vendor_id, approval_status, requested_vendor_code, is_platform_admin)
  values (
    NEW.id,
    coalesce(nullif(trim(NEW.raw_user_meta_data ->> 'full_name'),''), split_part(coalesce(NEW.email,''),'@',1)),
    'staff',
    null,
    'pending',
    case when acct_type='employee' then code else null end,
    false
  ) on conflict (id) do nothing;

  if acct_type='vendor' then
    if length(vname) >= 2 and length(vaddress) >= 5 and vpin ~ '^[0-9]{6}$' then
      insert into public.vendor_registration_requests(user_id,vendor_name,address,pincode)
      values(NEW.id,vname,vaddress,vpin)
      on conflict (user_id) do nothing;
    end if;
  end if;
  return NEW;
end;
$$;
drop trigger if exists on_auth_user_created_profile on auth.users;
create trigger on_auth_user_created_profile after insert on auth.users
for each row execute procedure public.create_profile_for_new_user();

-- Prevent clients from promoting themselves or changing vendor membership directly.
drop policy if exists "profiles select own or vendor admin" on public.profiles;
create policy "profiles select own or vendor admin" on public.profiles
for select to authenticated using (
  id=auth.uid()
  or (vendor_id=public.current_vendor_id() and public.current_app_role()='admin')
);

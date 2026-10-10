# Icy Popps multi-vendor setup (existing Supabase project)

## Important
- Take a Supabase backup before applying a database migration.
- For an existing installation, run **only** `supabase/multi-vendor-fixed-costs-migration.sql` once in Supabase SQL Editor. Do not rerun `schema.sql` on the live project.
- The migration preserves existing entries and assigns them to one vendor called **Icy Popps - Existing Business**. It seeds editable fixed-cost rows for Manager salary ₹16,000, Room rent ₹3,000, and Electricity ₹1,000.
- It also makes product prices and staff-share settings vendor-specific.

## Add another vendor

Use Supabase SQL Editor with a trusted project admin. Replace the vendor name and account email as appropriate.

```sql
-- 1) Create the vendor workspace and capture its UUID.
insert into public.vendors (name)
values ('Icy Popps - Vendor 2')
returning id;
```

Copy the returned UUID, then clone the current default product settings for the new vendor:

```sql
insert into public.product_settings
  (id, vendor_id, large_price, small_price, large_staff_pct, small_staff_pct, updated_by)
select 1, 'PASTE-NEW-VENDOR-UUID', large_price, small_price, large_staff_pct, small_staff_pct, updated_by
from public.product_settings
where vendor_id = (select id from public.vendors where name = 'Icy Popps - Existing Business' limit 1)
on conflict (vendor_id, id) do nothing;
```

Create the vendor's first auth user in **Supabase → Authentication → Users**. In the user's metadata / user metadata JSON, include:

```json
{"full_name":"Vendor Admin","vendor_id":"PASTE-NEW-VENDOR-UUID"}
```

The auth trigger creates the profile in that vendor as `staff` by default. Then assign that user's role as admin using SQL:

```sql
update public.profiles
set role = 'admin'
where id = (select id from auth.users where email = 'vendor-admin@example.com')
  and vendor_id = 'PASTE-NEW-VENDOR-UUID';
```

Create all manager/staff auth users with the same `vendor_id` metadata. Use the existing Users screen to assign their roles after their accounts exist. Each vendor can only access its own daily records, financials, product settings, and fixed-cost list through the app.

## Manage fixed monthly costs

Sign in as that vendor's Admin and open **Settings → Recurring fixed costs**. Add/edit/delete cost names and monthly amounts. Inactive costs are excluded from reports. Monthly costs are prorated by calendar day for daily and weekly views; a full month uses the full monthly total, and yearly view uses 12 monthly totals.

## Reporting ranges

Overview and Reports both have **Daily / Weekly / Monthly / Yearly** selectors and a reference date. The selected period controls the summary cards, sales/product mix, charts, and report tables. Yearly charts aggregate by month; other views use daily buckets where applicable.

# Icy Popps update: date presets, friendly errors, vendor_id fix

## Date filters
Overview and Reports now use one `Show` selector:
- Today
- Yesterday
- Last 7 days
- Current month
- Last month
- Last 3 months
- Last 6 months
- Current year
- Last year
- Custom date range (From / To)

All cards, charts and tables use the selected range. For ranges longer than 40 days, the report graph groups data by month to keep it readable.

## Fixing `column profiles.vendor_id does not exist`
The Angular app expects a `vendor_id` column in `public.profiles`. This cannot be safely fixed by frontend code alone. Back up the Supabase project first, then open Supabase SQL Editor and run `supabase/multi-vendor-fixed-costs-migration.sql` once. This migration includes `ALTER TABLE public.profiles ADD COLUMN IF NOT EXISTS vendor_id ...` and assigns existing profiles to the existing/default vendor. Do not run `supabase/schema.sql` on an existing production database.

If the migration was already run and failed partway, do not blindly rerun it; share the SQL error so the current database state can be checked.

## Apply the code
1. Extract the ZIP over the existing Angular project, replacing the included files.
2. Keep `src/environments/environment.ts` as-is.
3. In the project terminal, run `npm start`.

## Notes
- Raw Supabase errors are replaced with customer-friendly messages.
- No new chart package is required.
- Please verify locally with `npm start`; a full Angular build was not available in this packaging environment.

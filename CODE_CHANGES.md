# Code changes in this update

## Shared daily record
- The app checks the selected date and opens the existing record instead of blindly starting a duplicate.
- The unique `entry_date` constraint remains the final duplicate guard.
- If another user creates the same date first, the app loads that record instead of overwriting it.
- Updates include an `updated_at` match, so a stale screen cannot silently overwrite a newer save.

## Role restrictions
- Admin and manager can update existing shared records.
- Staff can create a missing operational record and view shared operational data, but cannot edit an existing record.
- Financial details are moved into `daily_financials`, which has database RLS policies for admin/manager only.
- The Angular app loads financial data only for admin/manager.

## Orange theme
- Replaced the former teal/green styling with orange accents and warm cream backgrounds throughout the app.

## Files to copy into the existing project
- `src/app/app.component.ts`
- `src/styles.css`
- `supabase/shared-record-migration.sql`
- `supabase/schema.sql` (for reference/fresh installs; do not rerun it on the existing database)
- `SETUP.md`

Keep your existing `src/environments/environment.ts` so your Supabase connection details remain intact.

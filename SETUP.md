# Icy Popps Business Tracker — Updated Setup

This project uses Angular for the web app and Supabase for authentication/database.

## Requirements
- Node.js LTS (Node 20.19+ or 22.12+ recommended)
- VS Code
- Supabase project

## Existing local project: apply the update safely
1. Download the update ZIP supplied with this change and extract it.
2. Copy these files from the extracted ZIP into the matching locations in your existing project, allowing replacement:
   - `src/app/app.component.ts`
   - `src/styles.css`
   - `supabase/schema.sql` (reference for fresh installs only)
   - `supabase/shared-record-migration.sql`
   - `SETUP.md`
3. **Do not replace `src/environments/environment.ts`**. Keep your existing Supabase URL and publishable/anon key.
4. In VS Code terminal, stop Angular with `Ctrl+C`, then run `npm start`.

## Important: migrate your existing Supabase database
Because you already ran the earlier schema and created your admin account, do **not** rerun the full `schema.sql` file.

1. Open Supabase → SQL Editor → New query.
2. Open `supabase/shared-record-migration.sql` in VS Code.
3. Copy all its contents into the Supabase SQL Editor and click Run.
4. This migration:
   - preserves existing daily records and profiles
   - creates `daily_financials`
   - moves any existing payment/expense/sales-share values into that protected table
   - removes sensitive financial columns from the shared operational table
   - allows all signed-in roles to read the shared daily record
   - restricts financial data to admin and manager
   - lets only admin/manager update an existing daily record
   - retains one unique record per date
5. If SQL reports an error, stop and resolve it before testing the app. Do not repeatedly run a partially failed migration without checking the error.

## Run locally
In VS Code terminal:

```bash
npm start
```

Open the local URL printed in the terminal, usually http://localhost:4200.

## Shared daily record workflow
- Opening Daily Hisab loads the record for the selected date if one exists.
- If no record exists, a new record form opens and suggests opening stock from the latest earlier record.
- If two users attempt to create the same date, the database unique constraint blocks the duplicate and the app opens the existing record.
- Admin and manager can edit existing shared records.
- Staff can create a missing daily record and view existing shared records, but cannot edit existing records.
- Staff cannot query `daily_financials`; financial details and reports are only loaded for admin/manager.
- Updates use the record's `updated_at` timestamp to detect stale edits and warn rather than silently overwriting a newer version.

## Roles
- Admin: manage users, product settings, daily records, financials and reports.
- Manager: enter/edit daily records and access financial summaries; cannot manage user roles or settings.
- Staff: create a missing daily operational record and view shared stock/sales-unit information; cannot edit an existing record or view financial fields/reports.

## Business defaults
- Large unit price ₹25; staff share 15%.
- Small unit price ₹15; staff share 17%.
- Fixed monthly costs: manager ₹16,000 + rent ₹3,000 + electricity ₹1,000 = ₹20,000.

## Orange theme
The application uses a warm orange theme throughout. Main accent: orange; surfaces: warm cream; panels and buttons use coordinated orange shades.

## Deployment (after local testing)
After we verify the role permissions and daily record flow, push the project to a private GitHub repository and import it into Vercel. Build command: `npm run build`. Angular output is typically `dist/icy-popps-tracker/browser`. Confirm the output after the first successful build. Supabase remains the database/auth service.

## Security note
Never put a Supabase `service_role` or secret key in Angular code. Only use the publishable/anon key in `environment.ts`. The publishable key is safe for frontend use only when database RLS policies are correctly configured.

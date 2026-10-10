# Icy Popps self-registration and admin approval

This is an overlay for the existing Angular project. It does not include `environment.ts` and does not replace your app with a nested project.

## What it adds
- Sign-in / self-registration toggle.
- New registrations get `approval_status = pending`, no vendor, and the default `staff` role.
- Pending users cannot access vendor-scoped data because `current_vendor_id()` and `current_app_role()` return NULL until approved.
- Admin Users page loads registrations, lets the platform Admin choose a vendor and Staff/Manager role, and approves via a trusted Edge Function.
- No service-role key is placed in Angular.
- Existing profiles are marked approved and keep their current role/vendor.

## Apply safely
1. Back up the project and Supabase database.
2. Extract this ZIP directly into `C:\projects\icy-popps-tracker`, preserving the existing `src/environments/environment.ts`.
3. In Supabase SQL Editor, run `supabase/self-registration-approval-migration.sql` once, after your existing multi-vendor migration. Do not run the fresh-install `schema.sql`.
4. Deploy the Edge Function from the project root with Supabase CLI configured:

   `supabase functions deploy admin-user-management`

5. Ensure the function has Supabase-managed secrets `SUPABASE_URL`, `SUPABASE_ANON_KEY`, and `SUPABASE_SERVICE_ROLE_KEY`. Never add the service-role key to Angular or Git.
6. Build and test locally: `npm run build`, then `npm start`.
7. Test a new signup. It must remain pending and have no vendor. Test approval with your existing Admin account, then sign in as the approved user.

## Important platform-admin note
The migration marks existing `admin` profiles as `is_platform_admin = true` to preserve the current Admin login and allow that owner account to approve registrations and choose a vendor. Review this flag in Supabase after migration and ensure only your trusted owner account has it. Do not set it from the browser.

## Email confirmation
If Supabase email confirmation is enabled, users must verify their email before signing in. Configure the Supabase Auth Site URL and redirect URLs to include the local URL during testing and your deployed domain after deployment.

## Security note
This migration assumes the existing vendor migration has been applied and that existing business tables already use vendor-scoped RLS policies. Validate access with a pending account and with accounts from two different vendors before deploying publicly.

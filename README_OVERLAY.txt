Icy Popps Business Tracker — Consolidated User Management Overlay
==================================================================

Files in this overlay
---------------------
- src/app/app.component.ts
- supabase/functions/admin-user-management/index.ts

What this fixes
---------------
1. Platform Owner and Vendor Admin accounts are included in the user list for visibility.
2. Admin accounts are rendered read-only: the UI does not offer employee role changes or approval actions for them.
3. The Users page empty state is clearer.
4. The temporary ICY-000000 code is explicitly marked as temporary and not for sharing.
5. The Edge Function continues to reject attempts to approve/change an Admin account.

Apply
-----
1. Keep your existing project folder and make a backup copy of the two files listed above.
2. Extract this ZIP into C:\projects\icy-popps-tracker and allow it to replace those two files.
3. The Angular dev server should reload automatically. If it does not, stop it with Ctrl+C and run: npm start
4. Redeploy the updated Edge Function from the project folder:
   npx supabase functions deploy admin-user-management

No SQL migration is included or required for these code-only changes.
Do not run existing migrations again.

Important
---------
The existing vendor's ICY-000000 code is a temporary legacy code. Do not share it with employees.
The actual PIN-based code for the existing cart still needs to be configured before employee onboarding.

Verification note
-----------------
The uploaded project did not include node_modules. Dependency installation timed out in the available build environment, so a full Angular production build could not be completed here. The changes were inspected against the supplied source files, but you should treat this as a targeted overlay and report any build error if one appears after applying it.

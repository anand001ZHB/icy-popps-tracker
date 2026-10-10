Icy Popps UI patch — extract directly into C:\projects\icy-popps-tracker

Included files:
- src/app/app.component.ts
- src/styles.css

Choose Replace files if Windows asks. Keep src/environments/environment.ts unchanged. No Supabase migration is required. Restart the app with Ctrl+C, then npm start.

Changes: adds Reset buttons to Overview and Reports (resetting to current month through today), formats displayed date ranges and table dates as DD-MM-YYYY, expands daily charts to the full available width for ranges of 31 days or less, and improves rotated axis labels. Please test locally before using for live accounting; a full build against your machine's dependencies was not available here.

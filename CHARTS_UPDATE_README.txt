ICY POPPS — VISUAL REPORTS UPDATE

This update adds charts and tables to the Overview and Reports tabs:
- Overview: last 7 calendar days sales bar chart
- Overview: large/small product sales mix ring chart for the current month
- Overview: recent daily performance table
- Reports: daily sales vs payments line chart for the selected month
- Reports: expense breakdown bars
- Reports: detailed daily report table and month totals

HOW TO APPLY
1. Make a backup of your current project folder.
2. Extract this ZIP into your existing project folder and allow it to replace the included files.
3. Keep src/environments/environment.ts unchanged; it contains your Supabase project URL/key.
4. No Supabase SQL migration is required for these chart-only changes.
5. In VS Code terminal, stop the app with Ctrl+C and run: npm start
6. Refresh http://localhost:4200 and check Overview and Reports while signed in as Admin or Manager.

The chart code uses plain Angular + CSS/SVG and does not add a dependency.

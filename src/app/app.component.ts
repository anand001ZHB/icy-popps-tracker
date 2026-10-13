import { CommonModule, CurrencyPipe, DatePipe } from '@angular/common';
import { Component, OnInit } from '@angular/core';
import { FormsModule } from '@angular/forms';
import { createClient, SupabaseClient, User } from '@supabase/supabase-js';
import { environment } from '../environments/environment';

type Role = 'admin' | 'manager' | 'staff';
interface Profile { id: string; full_name: string | null; role: Role; email?: string; vendor_id?: string; approval_status?: string; created_at?: string; requested_vendor_code?: string; is_platform_admin?: boolean; }
interface VendorRequest { id: string; user_id: string; full_name: string; email?: string; vendor_name: string; address: string; pincode: string; status: string; created_at?: string; }
interface Entry {
  id?: string; entry_date: string;
  opening_large: number; opening_small: number;
  received_large: number; received_small: number;
  sold_large: number; sold_small: number;
  online_received: number; offline_received: number;
  cost_gap: number; miscellaneous_expenses: number;
  stock_purchase_paid: number; staff_paid_today: number;
  notes: string; created_by?: string; updated_by?: string; updated_at?: string;
  closing_large?: number; closing_small?: number;
  large_sales?: number; small_sales?: number; staff_share?: number;
}
interface ProductSettings { large_price: number; small_price: number; large_staff_pct: number; small_staff_pct: number; }
interface FixedCost { id: string; vendor_id: string; name: string; amount: number; active: boolean; notes?: string; }

@Component({
  selector: 'app-root',
  standalone: true,
  imports: [CommonModule, FormsModule, CurrencyPipe, DatePipe],
  template: `
  <main class="shell">
    <header class="topbar">
      <div class="brand-mark">IP</div>
      <div class="brand-copy"><h1>Icy Popps</h1><p>Business tracker</p></div>
      <div class="top-actions" *ngIf="user">
        <span class="role-pill">{{ role | titlecase }}</span>
        <button class="btn btn-ghost" (click)="signOut()">Sign out</button>
      </div>
    </header>

    <section class="login-card" *ngIf="!user">
      <div class="eyebrow">WELCOME TO ICY POPPS</div>
      <h2>{{ authMode === 'signin' ? 'Sign in to your business' : 'Create your account' }}</h2>
      <p class="muted">{{ authMode === 'signin' ? 'Sign in with your email and password.' : 'Register first. An administrator must approve your account and assign your vendor before you can access business data.' }}</p>
      <form (ngSubmit)="authMode === 'signin' ? signIn() : signUp()">
        <label *ngIf="authMode === 'signup'">Full name<input type="text" name="signupName" [(ngModel)]="signupName" required autocomplete="name" maxlength="100"></label>
        <label *ngIf="authMode === 'signup'">Register as<select name="signupType" [(ngModel)]="signupType"><option value="employee">Employee (Staff / Manager)</option><option value="vendor">Cart owner / Vendor Admin</option></select></label>
        <ng-container *ngIf="authMode === 'signup' && signupType === 'employee'">
          <label>Cart registration code<input type="text" name="signupVendorCode" [(ngModel)]="signupVendorCode" required placeholder="e.g. ICY-834002" autocapitalize="characters"></label>
          <p class="muted small full-span">Ask your cart Admin for the registration code. Your access remains pending until approved.</p>
        </ng-container>
        <ng-container *ngIf="authMode === 'signup' && signupType === 'vendor'">
          <label>Cart / business name<input type="text" name="signupVendorName" [(ngModel)]="signupVendorName" required maxlength="120" placeholder="e.g. Icy Popps Ranchi"></label>
          <label>Cart PIN code<input type="text" name="signupVendorPincode" [(ngModel)]="signupVendorPincode" required pattern="[0-9]{6}" maxlength="6" inputmode="numeric" placeholder="6-digit PIN code"></label>
          <label class="full-span">Cart address<input type="text" name="signupVendorAddress" [(ngModel)]="signupVendorAddress" required maxlength="250" placeholder="Area, city, state"></label>
          <p class="muted small full-span">Your vendor account will remain pending until the Icy Popps platform owner reviews it.</p>
        </ng-container>
        <label>Email address<input type="email" name="email" [(ngModel)]="loginEmail" required autocomplete="username"></label>
        <label>Password<input type="password" name="password" [(ngModel)]="loginPassword" required minlength="8" [autocomplete]="authMode === 'signin' ? 'current-password' : 'new-password'"></label>
        <button class="btn btn-primary full" [disabled]="busy">{{ busy ? 'Please wait…' : (authMode === 'signin' ? 'Sign in' : 'Register') }}</button>
      </form>
      <button class="link-btn auth-toggle" type="button" (click)="toggleAuthMode()" [disabled]="busy">{{ authMode === 'signin' ? 'New here? Create an account' : 'Already registered? Sign in' }}</button>
      <p class="notice" *ngIf="message">{{ message }}</p>
      <p class="error" *ngIf="error">{{ error }}</p>
      <p class="small muted" *ngIf="authMode === 'signup'">Use a valid email address. Access remains blocked until your administrator approves you.</p>
    </section>

    <ng-container *ngIf="user">
      <div class="welcome-row">
        <div><div class="eyebrow">YOUR WORKSPACE</div><h2>Hello{{ profile?.full_name ? ', ' + profile?.full_name : '' }} 👋</h2><p class="muted">Record daily activity and keep stock reconciled.</p><p class="vendor-code-chip" *ngIf="isAdmin && currentVendorCode"><strong>{{ currentVendorName || 'Your cart' }}</strong><span *ngIf="currentVendorAddress"> · {{ currentVendorAddress }}</span><span *ngIf="currentVendorPincode"> · PIN {{ currentVendorPincode }}</span><br>Employee registration code: <strong>{{ currentVendorCode }}</strong><span *ngIf="currentVendorCode !== 'ICY-000000'"> Share this code with your employees.</span><span *ngIf="currentVendorCode === 'ICY-000000'"> Temporary code — do not share it with employees until your real cart PIN is configured.</span></p></div>
        <button class="btn btn-primary" *ngIf="canManageUsers" (click)="activeTab='users'; loadUsers()">Manage users</button>
      </div>

      <nav class="tabs">
        <button [class.active]="activeTab==='overview'" (click)="activeTab='overview'">Overview</button>
        <button [class.active]="activeTab==='daily'" (click)="startNewEntry()">Daily hisab</button>
        <button [class.active]="activeTab==='history'" (click)="activeTab='history'; loadEntries()">Entry history</button>
        <button [class.active]="activeTab==='reports'" *ngIf="canSeeFinancials" (click)="activeTab='reports'; loadEntries()">Reports</button>
        <button [class.active]="activeTab==='users'" *ngIf="canManageUsers" (click)="activeTab='users'; loadUsers()">Users</button>
        <button [class.active]="activeTab==='settings'" *ngIf="isAdmin" (click)="activeTab='settings'; loadSettings(); loadFixedCosts()">Settings</button>
      </nav>

      <p class="notice" *ngIf="message">{{ message }}</p>
      <p class="error" *ngIf="error">{{ error }}</p>

      <section *ngIf="activeTab==='overview'" class="panel">
        <div class="section-heading"><div><div class="eyebrow">AT A GLANCE</div><h3>Business overview</h3></div><div class="period-controls"><label>Show<select [(ngModel)]="overviewPreset" (ngModelChange)="onOverviewPeriodChange()"><option value="today">Today</option><option value="yesterday">Yesterday</option><option value="last7">Last 7 days</option><option value="currentMonth">Current month</option><option value="lastMonth">Last month</option><option value="last3Months">Last 3 months</option><option value="last6Months">Last 6 months</option><option value="currentYear">Current year</option><option value="lastYear">Last year</option><option value="custom">Custom date range</option></select></label><ng-container *ngIf="overviewPreset==='custom'"><label>From<input type="date" [(ngModel)]="overviewStart" (ngModelChange)="onOverviewDateChange()" aria-label="Start date for overview"></label><label>To<input type="date" [(ngModel)]="overviewEnd" (ngModelChange)="onOverviewDateChange()" aria-label="End date for overview"></label></ng-container><button type="button" class="btn btn-secondary period-reset" (click)="resetPeriod('overview')">Reset</button></div></div>
        <div class="stats-grid">
          <article class="stat" *ngIf="canSeeFinancials"><span>Sales recorded</span><strong>{{ totalSales | currency:'INR':'symbol':'1.0-0' }}</strong><small>{{ selectedPeriodDescription('overview') }}</small></article>
          <article class="stat" *ngIf="canSeeFinancials"><span>Payments received</span><strong>{{ totalPayments | currency:'INR':'symbol':'1.0-0' }}</strong><small>{{ selectedPeriodDescription('overview') }}</small></article>
          <article class="stat" *ngIf="canSeeFinancials"><span>Estimated profit after all expenses</span><strong>{{ pocketProfit | currency:'INR':'symbol':'1.0-0' }}</strong><small>Sales minus recorded costs and allocated fixed expenses · {{ selectedPeriodDescription('overview') }}</small></article>
          <article class="stat"><span>Daily entries</span><strong>{{ entries.length }}</strong><small>Records visible to your role</small></article>
        </div>

        <div class="visual-grid" *ngIf="canSeeFinancials">
          <article class="visual-card" [class.full-width-chart]="overviewTrend.length <= 31">
            <div class="visual-heading"><div><h4>Sales trend</h4><p>{{ selectedPeriodDescription('overview') }}</p></div><span class="chart-key"><i class="key-dot sales-dot"></i> Sales</span></div>
            <div class="bar-chart" [style.grid-template-columns]="'repeat(' + overviewTrend.length + ', minmax(0, 1fr))'" *ngIf="overviewTrend.length; else noOverviewTrend">
              <div class="bar-column" *ngFor="let day of overviewTrend">
                <div class="bar-value">{{ day.sales | currency:'INR':'symbol':'1.0-0' }}</div>
                <div class="bar-track"><div class="bar-fill sales-fill" [style.height]="day.barHeight"></div></div>
                <span class="bar-label">{{ day.label }}</span>
              </div>
            </div>
            <ng-template #noOverviewTrend><div class="empty-state compact">No sales entries for this period yet.</div></ng-template>
          </article>
          <article class="visual-card">
            <div class="visual-heading"><div><h4>Sales by product</h4><p>{{ selectedPeriodDescription('overview') }} · based on units sold</p></div></div>
            <div class="product-mix">
              <div class="mix-ring" [style.background]="overviewMixGradient"><div class="mix-ring-center"><strong>{{ overviewMonthSales | currency:'INR':'symbol':'1.0-0' }}</strong><span>Sales</span></div></div>
              <div class="mix-legend">
                <div><i class="key-dot large-dot"></i><span>Large</span><strong>{{ overviewLargeSales | currency:'INR':'symbol':'1.0-0' }}</strong><small>{{ overviewLargeShare | number:'1.0-0' }}%</small></div>
                <div><i class="key-dot small-dot"></i><span>Small</span><strong>{{ overviewSmallSales | currency:'INR':'symbol':'1.0-0' }}</strong><small>{{ 100 - overviewLargeShare | number:'1.0-0' }}%</small></div>
              </div>
            </div>
          </article>
        </div>
        <article class="visual-card overview-table-card" *ngIf="canSeeFinancials">
          <div class="visual-heading"><div><h4>Period performance</h4><p>{{ selectedPeriodDescription('overview') }}</p></div><button class="link-btn" (click)="activeTab='reports'; calculateReport()">Open reports</button></div>
          <div class="table-wrap">
            <table><thead><tr><th>Date</th><th>Large sold</th><th>Small sold</th><th>Sales</th><th>Payments received</th><th>Difference</th></tr></thead>
              <tbody><tr *ngFor="let day of overviewPerformance">
                <td>{{ day.entry_date | date:'dd-MM-yyyy' }}</td><td>{{ day.sold_large }}</td><td>{{ day.sold_small }}</td>
                <td>{{ salesFor(day) | currency:'INR':'symbol':'1.0-0' }}</td>
                <td>{{ (day.online_received + day.offline_received) | currency:'INR':'symbol':'1.0-0' }}</td>
                <td><span [class.positive-value]="salesFor(day) - day.online_received - day.offline_received >= 0" [class.negative-value]="salesFor(day) - day.online_received - day.offline_received < 0">{{ salesFor(day) - day.online_received - day.offline_received | currency:'INR':'symbol':'1.0-0' }}</span></td>
              </tr></tbody><tfoot><tr><th>Period total</th><th>{{ overviewTotals.largeSold }}</th><th>{{ overviewTotals.smallSold }}</th><th>{{ overviewTotals.sales | currency:'INR':'symbol':'1.0-0' }}</th><th>{{ overviewTotals.payments | currency:'INR':'symbol':'1.0-0' }}</th><th>{{ overviewTotals.difference | currency:'INR':'symbol':'1.0-0' }}</th></tr></tfoot>
            </table>
          </div>
        </article>

        <div class="callout"><strong>Important:</strong> Sales value is calculated from units sold × configured price. Stock purchases are counted as expenses in the month they are paid. Staff payments are treated as advances against their calculated share, not an additional expense.</div>
        <button class="btn btn-primary" (click)="startNewEntry()">+ Add daily entry</button>
      </section>

      <section *ngIf="activeTab==='daily'" class="panel">
        <div class="section-heading"><div><div class="eyebrow">DAILY OPERATIONS</div><h3>{{ editingEntryId ? (role === 'staff' ? 'View daily record' : 'Edit daily record') : 'New daily record' }}</h3><p class="muted small">{{ editingEntryId ? 'This is the shared record for the selected date.' : 'No record exists for this date yet.' }}</p></div><span class="muted small">All amounts in ₹</span></div>
        <form (ngSubmit)="saveEntry()" class="entry-form">
          <label>Date<input type="date" name="entry_date" [(ngModel)]="form.entry_date" (ngModelChange)="onDailyDateChange()" required [readonly]="false"></label>
          <div class="form-section-title">Stock movement (units)</div>
          <label>Opening stock — Large<input type="number" min="0" name="opening_large" [(ngModel)]="form.opening_large" required [readonly]="autoOpening || (isExistingRecord && !isFirstOpeningRecord)"></label>
          <label>Opening stock — Small<input type="number" min="0" name="opening_small" [(ngModel)]="form.opening_small" required [readonly]="autoOpening || (isExistingRecord && !isFirstOpeningRecord)"></label>
          <label>Stock received — Large<input type="number" min="0" name="received_large" [(ngModel)]="form.received_large" required [readonly]="isExistingRecord && role === 'staff'"></label>
          <label>Stock received — Small<input type="number" min="0" name="received_small" [(ngModel)]="form.received_small" required [readonly]="isExistingRecord && role === 'staff'"></label>
          <label>Units sold — Large<input type="number" min="0" name="sold_large" [(ngModel)]="form.sold_large" required [readonly]="isExistingRecord && role === 'staff'"></label>
          <label>Units sold — Small<input type="number" min="0" name="sold_small" [(ngModel)]="form.sold_small" required [readonly]="isExistingRecord && role === 'staff'"></label>
          <div class="preview full-span">
            <div><span>Closing stock — Large</span><strong>{{ closingLarge }}</strong></div>
            <div><span>Closing stock — Small</span><strong>{{ closingSmall }}</strong></div>
            <div *ngIf="canSeeFinancials"><span>Large sales value</span><strong>{{ largeSales | currency:'INR':'symbol':'1.0-0' }}</strong></div>
            <div *ngIf="canSeeFinancials"><span>Small sales value</span><strong>{{ smallSales | currency:'INR':'symbol':'1.0-0' }}</strong></div>
            <div *ngIf="canSeeFinancials"><span>Total sales</span><strong>{{ salesTotal | currency:'INR':'symbol':'1.0-0' }}</strong></div>
            <div *ngIf="canSeeFinancials"><span>Calculated staff share</span><strong>{{ staffShare | currency:'INR':'symbol':'1.0-0' }}</strong></div>
          </div>
          <div class="form-section-title" *ngIf="canSeeFinancials">Payments and expenses (₹)</div>
          <label *ngIf="canSeeFinancials">Online payment received<input type="number" min="0" step="0.01" name="online_received" [(ngModel)]="form.online_received" required [readonly]="isExistingRecord && role === 'staff'"></label>
          <label *ngIf="canSeeFinancials">Offline payment received<input type="number" min="0" step="0.01" name="offline_received" [(ngModel)]="form.offline_received" required [readonly]="isExistingRecord && role === 'staff'"></label>
          <label *ngIf="canSeeFinancials">Cost gap<input type="number" min="0" step="0.01" name="cost_gap" [(ngModel)]="form.cost_gap" required [readonly]="isExistingRecord && role === 'staff'"></label>
          <label *ngIf="canSeeFinancials">Miscellaneous expenses<input type="number" min="0" step="0.01" name="miscellaneous_expenses" [(ngModel)]="form.miscellaneous_expenses" required [readonly]="isExistingRecord && role === 'staff'"></label>
          <label *ngIf="canSeeFinancials">Stock purchase cost paid<input type="number" min="0" step="0.01" name="stock_purchase_paid" [(ngModel)]="form.stock_purchase_paid" required [readonly]="isExistingRecord && role === 'staff'"></label>
          <label *ngIf="canSeeFinancials">Staff takes paid today<input type="number" min="0" step="0.01" name="staff_paid_today" [(ngModel)]="form.staff_paid_today" required [readonly]="isExistingRecord && role === 'staff'"></label>
          <label class="full-span">Notes (optional)<textarea rows="2" name="notes" [(ngModel)]="form.notes" placeholder="Any explanation or reminder…" [readonly]="isExistingRecord && role === 'staff'"></textarea></label>
          <div class="form-actions full-span">
            <button type="button" class="btn btn-secondary" (click)="startNewEntry()">Open today's record</button>
            <button *ngIf="!(isExistingRecord && role === 'staff')" class="btn btn-primary" [disabled]="busy">{{ busy ? 'Saving…' : (editingEntryId ? 'Update shared record' : 'Create daily record') }}</button>
            <span *ngIf="isExistingRecord && role === 'staff'" class="muted small">Staff can view this shared record but cannot edit an existing record. Ask the manager or admin to make corrections.</span>
          </div>
        </form>
      </section>

      <section *ngIf="activeTab==='history'" class="panel">
        <div class="section-heading"><div><div class="eyebrow">RECORDS</div><h3>Daily entry history</h3></div></div>
        <div class="table-wrap" *ngIf="entries.length; else noEntries">
          <table><thead><tr><th>Date</th><th>Large sold</th><th>Small sold</th><th *ngIf="canSeeFinancials">Sales</th><th *ngIf="canSeeFinancials">Payments</th><th>Closing stock L/S</th><th *ngIf="canSeeFinancials">Staff share</th><th>Notes</th><th>Actions</th></tr></thead>
            <tbody><tr *ngFor="let e of entries"><td>{{ e.entry_date | date:'dd-MM-yyyy' }}</td><td>{{ e.sold_large }}</td><td>{{ e.sold_small }}</td><td *ngIf="canSeeFinancials">{{ salesFor(e) | currency:'INR':'symbol':'1.0-0' }}</td><td *ngIf="canSeeFinancials">{{ (e.online_received + e.offline_received) | currency:'INR':'symbol':'1.0-0' }}</td><td>{{ e.closing_large }} / {{ e.closing_small }}</td><td *ngIf="canSeeFinancials">{{ e.staff_share | currency:'INR':'symbol':'1.0-0' }}</td><td class="notes-cell">{{ e.notes || '—' }}</td><td><button class="link-btn" (click)="editEntry(e)">{{ canEditEntry(e) ? 'Open / edit' : 'Open' }}</button><button *ngIf="canEditEntry(e)" class="link-btn danger-link" [disabled]="busy" (click)="deleteEntry(e)">Delete</button></td></tr></tbody>
            <tfoot><tr><th>Totals</th><th>{{ historyTotals.largeSold }}</th><th>{{ historyTotals.smallSold }}</th><th *ngIf="canSeeFinancials">{{ historyTotals.sales | currency:'INR':'symbol':'1.0-0' }}</th><th *ngIf="canSeeFinancials">{{ historyTotals.payments | currency:'INR':'symbol':'1.0-0' }}</th><th>{{ historyTotals.closingLarge }} / {{ historyTotals.closingSmall }}</th><th *ngIf="canSeeFinancials">{{ historyTotals.staffShare | currency:'INR':'symbol':'1.0-0' }}</th><th>—</th><th>{{ entries.length }} records</th></tr></tfoot>
          </table>
        </div>
        <ng-template #noEntries><div class="empty-state">No entries found yet. Add your first daily entry.</div></ng-template>
      </section>

      <section *ngIf="activeTab==='reports'" class="panel">
        <div class="section-heading"><div><div class="eyebrow">BUSINESS PERFORMANCE</div><h3>Reports</h3></div><div class="period-controls"><label>Show<select [(ngModel)]="reportPreset" (ngModelChange)="onReportPeriodChange()"><option value="today">Today</option><option value="yesterday">Yesterday</option><option value="last7">Last 7 days</option><option value="currentMonth">Current month</option><option value="lastMonth">Last month</option><option value="last3Months">Last 3 months</option><option value="last6Months">Last 6 months</option><option value="currentYear">Current year</option><option value="lastYear">Last year</option><option value="custom">Custom date range</option></select></label><ng-container *ngIf="reportPreset==='custom'"><label>From<input type="date" [(ngModel)]="reportStart" (ngModelChange)="onReportDateChange()" aria-label="Start date for report"></label><label>To<input type="date" [(ngModel)]="reportEnd" (ngModelChange)="onReportDateChange()" aria-label="End date for report"></label></ng-container><button type="button" class="btn btn-secondary period-reset" (click)="resetPeriod('report')">Reset</button></div></div>
        <div class="stats-grid">
          <article class="stat"><span>Total sales</span><strong>{{ report.sales | currency:'INR':'symbol':'1.0-0' }}</strong></article>
          <article class="stat"><span>Stock purchases paid</span><strong>{{ report.stock | currency:'INR':'symbol':'1.0-0' }}</strong></article>
          <article class="stat"><span>Staff share earned</span><strong>{{ report.staff | currency:'INR':'symbol':'1.0-0' }}</strong></article>
          <article class="stat"><span>Cost gap + misc.</span><strong>{{ (report.gap + report.misc) | currency:'INR':'symbol':'1.0-0' }}</strong></article>
          <article class="stat"><span>Fixed costs for period</span><strong>{{ reportFixedCost | currency:'INR':'symbol':'1.0-0' }}</strong><small>{{ activeFixedCostCount }} active cost items · {{ selectedPeriodDescription('report') }}</small></article>
          <article class="stat highlight"><span>Estimated pocket profit</span><strong>{{ reportProfit | currency:'INR':'symbol':'1.0-0' }}</strong><small>Sales minus recorded costs and fixed costs for the selected period.</small></article>
          <article class="stat"><span>Staff paid in advance</span><strong>{{ report.paid | currency:'INR':'symbol':'1.0-0' }}</strong></article>
          <article class="stat"><span>Staff share still due</span><strong>{{ (report.staff - report.paid) | currency:'INR':'symbol':'1.0-0' }}</strong></article>
        </div>

        <div class="visual-grid report-visual-grid">
          <article class="visual-card" [class.full-width-chart]="reportDailySeries.length <= 31">
            <div class="visual-heading"><div><h4>Sales vs payments</h4><p>{{ selectedPeriodDescription('report') }}</p></div><div class="chart-legend"><span><i class="key-dot sales-dot"></i>Sales</span><span><i class="key-dot payments-dot"></i>Payments</span></div></div>
            <div class="line-chart-wrap" *ngIf="reportDailySeries.length; else noReportDays">
              <svg class="line-chart" viewBox="0 0 640 250" role="img" aria-label="Daily sales and payments line chart" preserveAspectRatio="none">
                <line *ngFor="let y of chartGridY" x1="92" x2="625" [attr.y1]="y" [attr.y2]="y" class="chart-grid-line"></line>
                <line x1="92" y1="35" x2="92" y2="185" class="chart-axis-line"></line>
                <line x1="92" y1="185" x2="625" y2="185" class="chart-axis-line"></line>
                <text *ngFor="let y of chartGridY" x="80" [attr.y]="y + 4" text-anchor="end" class="chart-axis-label">{{ chartAxisLabel(y) }}</text>
                <polyline [attr.points]="chartLinePoints('sales')" class="chart-line sales-line"></polyline>
                <polyline [attr.points]="chartLinePoints('payments')" class="chart-line payments-line"></polyline>
                <circle *ngFor="let day of reportDailySeries; let i = index" [attr.cx]="chartPointX(i, reportDailySeries.length)" [attr.cy]="chartPointY(day.sales, reportChartMax)" r="3.5" class="chart-point sales-point"><title>{{ day.label }} sales: {{ day.sales | currency:'INR':'symbol':'1.0-0' }}</title></circle>
                <circle *ngFor="let day of reportDailySeries; let i = index" [attr.cx]="chartPointX(i, reportDailySeries.length)" [attr.cy]="chartPointY(day.payments, reportChartMax)" r="3.5" class="chart-point payments-point"><title>{{ day.label }} payments: {{ day.payments | currency:'INR':'symbol':'1.0-0' }}</title></circle>
                <text *ngFor="let day of reportDailySeries; let i = index"
                      [attr.x]="chartPointX(i, reportDailySeries.length)"
                      y="232"
                      text-anchor="middle"
                      class="chart-date-label"
                      [attr.transform]="'rotate(-90 ' + chartPointX(i, reportDailySeries.length) + ' 232)'">{{ day.label }}</text>
              </svg>
            </div>
            <ng-template #noReportDays><div class="empty-state compact">No entries for the selected month.</div></ng-template>
          </article>
          <article class="visual-card">
            <div class="visual-heading"><div><h4>Expense breakdown</h4><p>Recorded outflows and estimated costs</p></div></div>
            <div class="expense-bars">
              <div class="expense-row" *ngFor="let item of reportExpenseBreakdown">
                <div class="expense-label"><span>{{ item.label }}</span><strong>{{ item.amount | currency:'INR':'symbol':'1.0-0' }}</strong></div>
                <div class="expense-track"><div class="expense-fill" [style.width]="item.width"></div></div>
              </div>
            </div>
            <div class="expense-total"><span>Total estimated expenses</span><strong>{{ reportTotalExpenses | currency:'INR':'symbol':'1.0-0' }}</strong></div>
          </article>
        </div>
        <article class="visual-card report-table-card">
          <div class="visual-heading"><div><h4>Period report table</h4><p>Sales, collections, and estimated profit after fixed expenses for each period</p></div></div>
          <div class="table-wrap" *ngIf="reportDailySeries.length; else noReportTable">
            <table><thead><tr><th>Period</th><th>Large sales</th><th>Small sales</th><th>Total sales</th><th>Payments received</th><th>Stock purchased cost</th><th>Staff share</th><th>Cost gap</th><th>Misc. expenses</th><th>Estimated profit after fixed expenses</th></tr></thead>
              <tbody><tr *ngFor="let day of reportTableRows">
                <td>{{ day.label }}</td><td>{{ day.largeSales | currency:'INR':'symbol':'1.0-0' }}</td><td>{{ day.smallSales | currency:'INR':'symbol':'1.0-0' }}</td>
                <td><strong>{{ day.sales | currency:'INR':'symbol':'1.0-0' }}</strong></td><td>{{ day.payments | currency:'INR':'symbol':'1.0-0' }}</td>
                <td>{{ day.stock | currency:'INR':'symbol':'1.0-0' }}</td><td>{{ day.staffShare | currency:'INR':'symbol':'1.0-0' }}</td><td>{{ day.costGap | currency:'INR':'symbol':'1.0-0' }}</td><td>{{ day.miscCosts | currency:'INR':'symbol':'1.0-0' }}</td>
                <td><span [class.positive-value]="day.net >= 0" [class.negative-value]="day.net < 0">{{ day.net | currency:'INR':'symbol':'1.0-0' }}</span></td>
              </tr></tbody>
              <tfoot><tr><th>Period total</th><th>{{ reportLargeSalesTotal | currency:'INR':'symbol':'1.0-0' }}</th><th>{{ reportSmallSalesTotal | currency:'INR':'symbol':'1.0-0' }}</th><th>{{ report.sales | currency:'INR':'symbol':'1.0-0' }}</th><th>{{ reportPayments | currency:'INR':'symbol':'1.0-0' }}</th><th>{{ report.stock | currency:'INR':'symbol':'1.0-0' }}</th><th>{{ report.staff | currency:'INR':'symbol':'1.0-0' }}</th><th>{{ report.gap | currency:'INR':'symbol':'1.0-0' }}</th><th>{{ report.misc | currency:'INR':'symbol':'1.0-0' }}</th><th>{{ report.sales - report.stock - report.staff - report.gap - report.misc | currency:'INR':'symbol':'1.0-0' }}</th></tr></tfoot>
            </table>
          </div>
          <ng-template #noReportTable><div class="empty-state compact">No records found for the selected period.</div></ng-template>
        </article>

        <p class="muted small">This estimate treats stock purchases as expenses when paid, even if some stock remains unsold. Check your accountant's preferred method for formal accounts and taxes.</p>
      </section>

      <section *ngIf="activeTab==='users'" class="panel">
        <div class="section-heading"><div><div class="eyebrow">ACCESS CONTROL</div><h3>User accounts</h3></div><button class="btn btn-secondary" (click)="loadUsers()">Refresh</button></div>
        <p class="muted">Approve only the users belonging to your cart. Cart owners are reviewed separately by the platform owner. Pending accounts cannot access business data.</p>
        <div class="callout" *ngIf="isPlatformAdmin">Platform owner: review new cart-owner requests below. Each approved cart gets a unique code based on its PIN, such as ICY-834002. If that code is already used, the system adds a suffix.</div>
        <div class="vendor-requests" *ngIf="isPlatformAdmin">
          <div class="section-heading"><div><div class="eyebrow">NEW CARTS</div><h3>Vendor registration requests</h3></div><span class="role-pill">{{ vendorRequests.length }} pending</span></div>
          <div class="table-wrap" *ngIf="vendorRequests.length; else noVendorRequests">
            <table><thead><tr><th>Owner</th><th>Cart name</th><th>Address</th><th>PIN</th><th>Action</th></tr></thead><tbody>
              <tr *ngFor="let v of vendorRequests"><td>{{ v.full_name }}<small class="user-email">{{ v.email }}</small></td><td>{{ v.vendor_name }}</td><td>{{ v.address }}</td><td>{{ v.pincode }}</td><td><button class="btn btn-primary btn-small" [disabled]="busy" (click)="approveVendor(v)">Approve cart</button></td></tr>
            </tbody></table>
          </div>
          <ng-template #noVendorRequests><div class="empty-state compact">No pending cart registrations.</div></ng-template>
          <div class="section-heading vendor-admin-heading"><div><div class="eyebrow">CART WORKSPACES</div><h3>Vendor management</h3><p class="muted small">Disable a cart to block its users from accessing it, or delete it and its associated business records permanently.</p></div></div>
          <div class="table-wrap" *ngIf="vendors.length; else noVendors"><table><thead><tr><th>Vendor</th><th>Registration code</th><th>Status</th><th>Actions</th></tr></thead><tbody><tr *ngFor="let v of vendors"><td>{{ v.name }}</td><td>{{ v.registration_code || '—' }}</td><td><span class="role-pill" [class.pending-pill]="v.status === 'suspended'">{{ v.status || 'active' }}</span></td><td class="user-action-cell"><button *ngIf="v.status !== 'suspended'" class="btn btn-secondary btn-small" [disabled]="busy" (click)="setVendorDisabled(v, true)">Disable</button><button *ngIf="v.status === 'suspended'" class="btn btn-secondary btn-small" [disabled]="busy" (click)="setVendorDisabled(v, false)">Enable</button><button class="link-btn danger-link" [disabled]="busy" (click)="deleteVendor(v)">Delete vendor</button></td></tr></tbody></table></div>
          <ng-template #noVendors><div class="empty-state compact">No vendors found.</div></ng-template>
        </div>
        <div class="user-summary"><strong>{{ pendingProfiles.length }}</strong><span>pending approval</span><strong>{{ profiles.length }}</strong><span>total accounts</span></div>
        <div class="table-wrap"><table><thead><tr><th>Name / Email</th><th>Registered</th><th>Status</th><th>Vendor</th><th>Role</th><th>Action</th></tr></thead><tbody>
          <tr *ngFor="let p of profiles"><td>{{ p.full_name || '—' }}<small class="user-email">{{ p.email || '' }}</small></td><td>{{ p.created_at ? (p.created_at | date:'dd-MM-yyyy') : '—' }}</td><td><span class="role-pill" [class.pending-pill]="p.approval_status !== 'approved'">{{ p.approval_status || 'approved' }}</span></td>
          <td *ngIf="isPlatformAdmin"><select [name]="'vendor-' + p.id" [(ngModel)]="approvalDrafts[p.id].vendor_id"><option value="">Choose vendor</option><option *ngFor="let v of vendors" [value]="v.id">{{ v.name }}</option></select></td><td *ngIf="!isPlatformAdmin">{{ vendorName(p.vendor_id) || currentVendorCode || 'Your cart' }}</td>
          <td><ng-container *ngIf="p.role !== 'admin'; else adminRoleLabel"><select [name]="'role-' + p.id" [(ngModel)]="approvalDrafts[p.id].role"><option value="staff">Staff</option><option value="manager">Manager</option></select></ng-container><ng-template #adminRoleLabel><span class="role-pill">{{ p.is_platform_admin ? 'Platform Owner' : 'Vendor Admin' }}</span></ng-template></td>
          <td class="user-action-cell"><button *ngIf="p.role !== 'admin' && p.approval_status !== 'disabled'" class="btn btn-primary btn-small" [disabled]="busy || (!isPlatformAdmin && p.requested_vendor_code && p.requested_vendor_code !== currentVendorCode)" (click)="approveUser(p)">{{ p.approval_status === 'approved' ? 'Save role' : 'Approve' }}</button><span *ngIf="p.role === 'admin'" class="muted small">{{ p.is_platform_admin ? 'Platform Owner' : 'Vendor Admin' }}</span><button *ngIf="isPlatformAdmin && p.id !== user?.id && p.approval_status !== 'disabled'" class="btn btn-secondary btn-small" [disabled]="busy" (click)="setUserDisabled(p, true)">Disable</button><button *ngIf="isPlatformAdmin && p.approval_status === 'disabled'" class="btn btn-secondary btn-small" [disabled]="busy" (click)="setUserDisabled(p, false)">Enable</button><button *ngIf="(isPlatformAdmin && p.id !== user?.id) || (!isPlatformAdmin && p.role !== 'admin')" class="link-btn danger-link" [disabled]="busy" (click)="deleteUser(p)">Delete</button></td></tr>
        </tbody></table></div>
        <div class="empty-state compact" *ngIf="!profiles.length">No user accounts found for this workspace yet. Employee registrations will appear here after signup.</div>
        <div class="callout">Security: approval and vendor assignment are processed by a trusted Supabase Edge Function. The service-role key must only exist in Supabase function secrets, never in Angular.</div>
      </section>

      <section *ngIf="activeTab==='settings'" class="panel">
        <div class="section-heading"><div><div class="eyebrow">ADMIN SETTINGS</div><h3>Product prices and staff share</h3></div></div>
        <form class="settings-form" (ngSubmit)="saveSettings()">
          <div class="form-section-title">Large product</div>
          <label>Price per unit (₹)<input type="number" min="0" step="0.01" [(ngModel)]="settings.large_price" name="large_price" required></label>
          <label>Staff share (%)<input type="number" min="0" max="100" step="0.1" [(ngModel)]="settings.large_staff_pct" name="large_staff_pct" required></label>
          <div class="form-section-title">Small product</div>
          <label>Price per unit (₹)<input type="number" min="0" step="0.01" [(ngModel)]="settings.small_price" name="small_price" required></label>
          <label>Staff share (%)<input type="number" min="0" max="100" step="0.1" [(ngModel)]="settings.small_staff_pct" name="small_staff_pct" required></label>
          <div class="full-span"><button class="btn btn-primary" [disabled]="busy">Save settings</button></div>
        </form>
        <p class="muted small">Defaults: Large ₹25 with 15% staff share; Small ₹15 with 17% staff share.</p>
        <div class="fixed-cost-section">
          <div class="section-heading"><div><div class="eyebrow">VENDOR-SPECIFIC</div><h3>Recurring fixed costs</h3><p class="muted small">These amounts are deducted monthly in reports. Edit them whenever this vendor's costs change.</p></div></div>
          <form class="fixed-cost-form" (ngSubmit)="saveFixedCost()">
            <label>Cost name<input name="fixedCostName" [(ngModel)]="fixedCostDraft.name" required placeholder="e.g. Shop rent"></label>
            <label>Monthly amount (₹)<input type="number" name="fixedCostAmount" min="0" step="0.01" [(ngModel)]="fixedCostDraft.amount" required></label>
            <label>Notes (optional)<input name="fixedCostNotes" [(ngModel)]="fixedCostDraft.notes" placeholder="e.g. due on 5th"></label>
            <label class="checkbox-label"><input type="checkbox" name="fixedCostActive" [(ngModel)]="fixedCostDraft.active"> Active cost</label>
            <div class="fixed-cost-actions"><button class="btn btn-primary" [disabled]="busy">{{ editingFixedCostId ? 'Update cost' : 'Add fixed cost' }}</button><button *ngIf="editingFixedCostId" type="button" class="btn btn-secondary" (click)="resetFixedCostDraft()">Cancel edit</button></div>
          </form>
          <div class="table-wrap" *ngIf="fixedCosts.length; else noFixedCosts"><table><thead><tr><th>Cost</th><th>Monthly amount</th><th>Status</th><th>Notes</th><th>Actions</th></tr></thead><tbody><tr *ngFor="let cost of fixedCosts"><td>{{ cost.name }}</td><td>{{ cost.amount | currency:'INR':'symbol':'1.0-0' }}</td><td>{{ cost.active ? 'Active' : 'Inactive' }}</td><td>{{ cost.notes || '—' }}</td><td><button class="link-btn" (click)="editFixedCost(cost)">Edit</button><button class="link-btn danger-link" (click)="deleteFixedCost(cost)">Delete</button></td></tr></tbody><tfoot><tr><th>Total active monthly costs</th><th>{{ fixedMonthly | currency:'INR':'symbol':'1.0-0' }}</th><th colspan="3"></th></tr></tfoot></table></div>
          <ng-template #noFixedCosts><div class="empty-state compact">No fixed costs yet. Add rent, salary, electricity, or other recurring expenses above.</div></ng-template>
        </div>
      </section>
    </ng-container>
    <footer>Private business workspace · Keep account credentials secure</footer>
  </main>
  `
})
export class AppComponent implements OnInit {
  private supabase: SupabaseClient | null = null;
  user: User | null = null;
  profile: Profile | null = null;
  role: Role = 'staff';
  activeTab = 'overview';
  busy = false;
  message = '';
  error = '';
  loginEmail = '';
  loginPassword = '';
  authMode: 'signin' | 'signup' = 'signin';
  signupName = '';
  signupType: 'employee' | 'vendor' = 'employee';
  signupVendorCode = '';
  signupVendorName = '';
  signupVendorAddress = '';
  signupVendorPincode = '';
  vendors: Array<{id:string;name:string;registration_code?:string;status?:string}> = [];
  vendorRequests: VendorRequest[] = [];
  isPlatformAdmin = false;
  currentVendorCode = '';
  currentVendorName = '';
  currentVendorAddress = '';
  currentVendorPincode = '';
  approvalDrafts: Record<string, {vendor_id:string;role:'manager'|'staff'}> = {};
  get pendingProfiles(): Profile[] { return this.profiles.filter(p => p.approval_status !== 'approved'); }
  entries: Entry[] = [];
  profiles: Profile[] = [];
  settings: ProductSettings = { large_price: 25, small_price: 15, large_staff_pct: 15, small_staff_pct: 17 };
  fixedCosts: FixedCost[] = [];
  editingFixedCostId: string | null = null;
  fixedCostDraft: { name: string; amount: number; active: boolean; notes: string } = { name: '', amount: 0, active: true, notes: '' };
  vendorId: string | null = null;
  overviewPreset = 'currentMonth';
  overviewPeriod: 'daily' | 'weekly' | 'monthly' | 'yearly' = 'monthly';
  overviewDate = new Date().toISOString().slice(0, 10);
  overviewStart = new Date(new Date().getFullYear(), new Date().getMonth(), 1).toISOString().slice(0,10);
  overviewEnd = new Date().toISOString().slice(0,10);
  reportPreset = 'currentMonth';
  reportPeriod: 'daily' | 'weekly' | 'monthly' | 'yearly' = 'monthly';
  reportDate = new Date().toISOString().slice(0, 10);
  reportStart = new Date(new Date().getFullYear(), new Date().getMonth(), 1).toISOString().slice(0,10);
  reportEnd = new Date().toISOString().slice(0,10);
  fixedMonthly = 0;
  get activeFixedCostCount(): number { return this.fixedCosts.filter(c => c.active).length; }
  editingEntryId: string | null = null;
  originalUpdatedAt: string | null = null;
  autoOpening = false;
  userIdToUpdate = '';
  roleToAssign: Role = 'staff';
  reportMonth = new Date().toISOString().slice(0, 7);
  report = { sales: 0, stock: 0, staff: 0, gap: 0, misc: 0, paid: 0 };

  form: Entry = this.emptyEntry();

  constructor() {
    if (environment.supabaseUrl.startsWith('https://') && environment.supabaseAnonKey !== 'YOUR_SUPABASE_ANON_KEY') {
      this.supabase = createClient(environment.supabaseUrl, environment.supabaseAnonKey);
    }
  }

  async ngOnInit(): Promise<void> {
    if (!this.supabase) {
      this.error = 'Supabase is not configured yet. Follow the SETUP.md file, then restart the app.';
      return;
    }
    const { data } = await this.supabase.auth.getSession();
    if (data.session?.user) await this.loadSessionUser(data.session.user);
    this.supabase.auth.onAuthStateChange((_event, session) => {
      setTimeout(() => {
        if (session?.user) void this.loadSessionUser(session.user);
        else { this.user = null; this.profile = null; }
      }, 0);
    });
  }

  get isAdmin(): boolean { return this.role === 'admin'; }
  get isFirstOpeningRecord(): boolean {
    if (!this.editingEntryId || !this.entries.length) return false;
    const firstDate = this.entries.reduce((min, entry) => entry.entry_date < min ? entry.entry_date : min, this.entries[0].entry_date);
    return this.form.entry_date === firstDate;
  }
  get historyTotals(): { largeSold:number; smallSold:number; sales:number; payments:number; closingLarge:number; closingSmall:number; staffShare:number } {
    return this.entries.reduce((t,e)=>({largeSold:t.largeSold+Number(e.sold_large||0),smallSold:t.smallSold+Number(e.sold_small||0),sales:t.sales+this.salesFor(e),payments:t.payments+Number(e.online_received||0)+Number(e.offline_received||0),closingLarge:t.closingLarge+Number(e.closing_large||0),closingSmall:t.closingSmall+Number(e.closing_small||0),staffShare:t.staffShare+Number(e.staff_share||0)}),{largeSold:0,smallSold:0,sales:0,payments:0,closingLarge:0,closingSmall:0,staffShare:0});
  }
  get isExistingRecord(): boolean { return !!this.editingEntryId; }
  get canManageUsers(): boolean { return this.role === 'admin' && !!this.vendorId; }
  get canSeeFinancials(): boolean { return this.role === 'admin' || this.role === 'manager'; }
  private rangeFor(period: 'daily' | 'weekly' | 'monthly' | 'yearly', dateText: string): { start: string; end: string } {
    const base = new Date((dateText || new Date().toISOString().slice(0, 10)) + 'T12:00:00');
    let start: Date; let end: Date;
    if (period === 'daily') { start = new Date(base); end = new Date(base); }
    else if (period === 'weekly') { const day = (base.getDay() + 6) % 7; start = new Date(base); start.setDate(base.getDate() - day); end = new Date(start); end.setDate(start.getDate() + 6); }
    else if (period === 'yearly') { start = new Date(base.getFullYear(), 0, 1, 12); end = new Date(base.getFullYear(), 11, 31, 12); }
    else { start = new Date(base.getFullYear(), base.getMonth(), 1, 12); end = new Date(base.getFullYear(), base.getMonth() + 1, 0, 12); }
    const fmt = (d: Date) => `${d.getFullYear()}-${String(d.getMonth()+1).padStart(2,'0')}-${String(d.getDate()).padStart(2,'0')}`;
    return { start: fmt(start), end: fmt(end) };
  }
  private selectedRange(preset: string, dateText: string, customStart: string, customEnd: string): {start:string;end:string} {
    const today = new Date(); today.setHours(12,0,0,0);
    const fmt=(d:Date)=>`${d.getFullYear()}-${String(d.getMonth()+1).padStart(2,'0')}-${String(d.getDate()).padStart(2,'0')}`;
    let start=new Date(today), end=new Date(today);
    if(preset==='yesterday'){start.setDate(start.getDate()-1);end=new Date(start);}
    else if(preset==='last7'){start.setDate(start.getDate()-6);}
    else if(preset==='currentMonth'){start=new Date(today.getFullYear(),today.getMonth(),1,12);end=new Date(today);end.setDate(today.getDate()-1);}
    else if(preset==='lastMonth'){start=new Date(today.getFullYear(),today.getMonth()-1,1,12);end=new Date(today.getFullYear(),today.getMonth(),0,12);}
    else if(preset==='last3Months'){start=new Date(today.getFullYear(),today.getMonth()-2,1,12);}
    else if(preset==='last6Months'){start=new Date(today.getFullYear(),today.getMonth()-5,1,12);}
    else if(preset==='currentYear'){start=new Date(today.getFullYear(),0,1,12);}
    else if(preset==='lastYear'){start=new Date(today.getFullYear()-1,0,1,12);end=new Date(today.getFullYear()-1,11,31,12);}
    else if(preset==='custom'){ const a=customStart||customEnd||fmt(today), b=customEnd||customStart||fmt(today); return {start:a<=b?a:b,end:a<=b?b:a}; }
    else if(preset==='today'){start=new Date(today);end=new Date(today);}
    return {start:fmt(start),end:fmt(end)};
  }
  displayDate(value: string): string {
    if (!value) return '';
    const match = /^(\d{4})-(\d{2})-(\d{2})$/.exec(value);
    return match ? `${match[3]}-${match[2]}-${match[1]}` : value;
  }
  resetPeriod(which: 'overview' | 'report'): void {
    const today = new Date();
    const fmt = (d: Date) => `${d.getFullYear()}-${String(d.getMonth()+1).padStart(2,'0')}-${String(d.getDate()).padStart(2,'0')}`;
    const start = fmt(new Date(today.getFullYear(), today.getMonth(), 1));
    const end = fmt(today);
    if (which === 'overview') {
      this.overviewPreset = 'currentMonth'; this.overviewStart = start; this.overviewEnd = end;
      this.onOverviewPeriodChange();
    } else {
      this.reportPreset = 'currentMonth'; this.reportStart = start; this.reportEnd = end;
      this.onReportPeriodChange();
    }
  }
  periodDescription(period: 'daily' | 'weekly' | 'monthly' | 'yearly', dateText: string): string { const r=this.rangeFor(period,dateText); return r.start===r.end?r.start:`${r.start} to ${r.end}`; }
  selectedPeriodDescription(which:'overview'|'report'): string { const isOverview=which==='overview'; const r=this.selectedRange(isOverview?this.overviewPreset:this.reportPreset,isOverview?this.overviewDate:this.reportDate,isOverview?this.overviewStart:this.reportStart,isOverview?this.overviewEnd:this.reportEnd); return `${this.displayDate(r.start)} to ${this.displayDate(r.end)}`; }
  private entriesForSelection(which:'overview'|'report'): Entry[] {
    const isOverview=which==='overview'; const preset=isOverview?this.overviewPreset:this.reportPreset;
    const date=isOverview?this.overviewDate:this.reportDate; const start=isOverview?this.overviewStart:this.reportStart; const end=isOverview?this.overviewEnd:this.reportEnd;
    const r=this.selectedRange(preset,date,start,end); return this.entries.filter(e=>e.entry_date>=r.start&&e.entry_date<=r.end);
  }
  private fixedCostForSelection(which:'overview'|'report'): number {
    const isOverview=which==='overview'; const preset=isOverview?this.overviewPreset:this.reportPreset;
    const date=isOverview?this.overviewDate:this.reportDate; const start=isOverview?this.overviewStart:this.reportStart; const end=isOverview?this.overviewEnd:this.reportEnd;
    const r=this.selectedRange(preset,date,start,end); let total=0; const cursor=new Date(r.start+'T12:00:00'); const last=new Date(r.end+'T12:00:00');
    while(cursor<=last){const days=new Date(cursor.getFullYear(),cursor.getMonth()+1,0).getDate();total+=this.fixedMonthly/days;cursor.setDate(cursor.getDate()+1);} return total;
  }
  get totalSales(): number { return this.entriesForSelection('overview').reduce((sum, e) => sum + this.salesFor(e), 0); }
  get totalPayments(): number { return this.entriesForSelection('overview').reduce((sum, e) => sum + Number(e.online_received || 0) + Number(e.offline_received || 0), 0); }
  get pocketProfit(): number { const list = this.entriesForSelection('overview'); return list.reduce((sum, e) => sum + this.salesFor(e) - Number(e.stock_purchase_paid || 0) - Number(e.staff_share || 0) - Number(e.cost_gap || 0) - Number(e.miscellaneous_expenses || 0), 0) - this.fixedCostForSelection('overview'); }
  get reportFixedCost(): number { return this.fixedCostForSelection('report'); }
  private fixedCostForPeriod(period: 'daily' | 'weekly' | 'monthly' | 'yearly', dateText: string): number {
    const range = this.rangeFor(period, dateText); let total = 0;
    const cursor = new Date(range.start + 'T12:00:00'); const end = new Date(range.end + 'T12:00:00');
    while (cursor <= end) {
      const daysInMonth = new Date(cursor.getFullYear(), cursor.getMonth() + 1, 0).getDate();
      total += this.fixedMonthly / daysInMonth;
      cursor.setDate(cursor.getDate() + 1);
    }
    return total;
  }
  get closingLarge(): number { return Number(this.form.opening_large || 0) + Number(this.form.received_large || 0) - Number(this.form.sold_large || 0); }
  get closingSmall(): number { return Number(this.form.opening_small || 0) + Number(this.form.received_small || 0) - Number(this.form.sold_small || 0); }
  get largeSales(): number { return Number(this.form.sold_large || 0) * this.settings.large_price; }
  get smallSales(): number { return Number(this.form.sold_small || 0) * this.settings.small_price; }
  get salesTotal(): number { return this.largeSales + this.smallSales; }
  get staffShare(): number { return this.largeSales * this.settings.large_staff_pct / 100 + this.smallSales * this.settings.small_staff_pct / 100; }
  get reportProfit(): number { return this.report.sales - this.report.stock - this.report.staff - this.report.gap - this.report.misc - this.reportFixedCost; }
  get overviewPeriodEntries(): Entry[] { return this.entriesForSelection('overview'); }
  get overviewMonthSales(): number { return this.overviewPeriodEntries.reduce((sum, e) => sum + this.salesFor(e), 0); }
  get overviewLargeSales(): number { return this.overviewPeriodEntries.reduce((sum, e) => sum + this.largeSalesFor(e), 0); }
  get overviewSmallSales(): number { return this.overviewPeriodEntries.reduce((sum, e) => sum + this.smallSalesFor(e), 0); }
  get overviewLargeShare(): number { return this.overviewMonthSales > 0 ? this.overviewLargeSales / this.overviewMonthSales * 100 : 0; }
  get overviewMixGradient(): string { const pct = this.overviewLargeShare; return this.overviewMonthSales > 0 ? `conic-gradient(#ea580c 0 ${pct}%, #fdba74 ${pct}% 100%)` : 'conic-gradient(#f3e8dc 0 100%)'; }
  get overviewTrend(): Array<{ date: string; label: string; sales: number; barHeight: string }> {
    const range = this.selectedRange(this.overviewPreset, this.overviewDate, this.overviewStart, this.overviewEnd);
    const start = new Date(range.start + 'T12:00:00');
    const end = new Date(range.end + 'T12:00:00');
    const spanDays = Math.round((end.getTime() - start.getTime()) / 86400000) + 1;
    const aggregateMonthly = spanDays > 31;
    const buckets: Array<{ date: string; label: string; sales: number; barHeight: string }> = [];
    if (aggregateMonthly) {
      const cursor = new Date(start.getFullYear(), start.getMonth(), 1, 12);
      const last = new Date(end.getFullYear(), end.getMonth(), 1, 12);
      while (cursor <= last) {
        const prefix = `${cursor.getFullYear()}-${String(cursor.getMonth()+1).padStart(2,'0')}`;
        const sales = this.overviewPeriodEntries.filter(e => e.entry_date.startsWith(prefix) && e.entry_date >= range.start && e.entry_date <= range.end).reduce((sum,e)=>sum+this.salesFor(e),0);
        buckets.push({ date: prefix, label: cursor.toLocaleDateString('en-IN',{month:'short',year:'2-digit'}), sales, barHeight:'3%' });
        cursor.setMonth(cursor.getMonth()+1);
      }
    } else {
      const cursor = new Date(start);
      while (cursor <= end) {
        const key = `${cursor.getFullYear()}-${String(cursor.getMonth()+1).padStart(2,'0')}-${String(cursor.getDate()).padStart(2,'0')}`;
        const sales = this.overviewPeriodEntries.filter(e => e.entry_date === key).reduce((sum,e)=>sum+this.salesFor(e),0);
        buckets.push({ date:key, label:cursor.toLocaleDateString('en-IN',{day:'numeric',month:'short'}), sales, barHeight:'3%' });
        cursor.setDate(cursor.getDate()+1);
      }
    }
    const max = Math.max(1,...buckets.map(b=>b.sales));
    return buckets.map(b=>({...b,barHeight:`${b.sales>0?Math.max(5,b.sales/max*100):2}%`}));
  }
  get overviewPerformance(): Entry[] { return this.overviewPeriodEntries.slice().sort((a,b)=>b.entry_date.localeCompare(a.entry_date)); }
  get overviewTotals(): {largeSold:number;smallSold:number;sales:number;payments:number;difference:number} { return this.overviewPeriodEntries.reduce((t,e)=>{const sales=this.salesFor(e);const payments=Number(e.online_received||0)+Number(e.offline_received||0);return {largeSold:t.largeSold+Number(e.sold_large||0),smallSold:t.smallSold+Number(e.sold_small||0),sales:t.sales+sales,payments:t.payments+payments,difference:t.difference+sales-payments};},{largeSold:0,smallSold:0,sales:0,payments:0,difference:0}); }
  get reportDailySeries(): Array<{ entry_date: string; label: string; largeSales: number; smallSales: number; sales: number; payments: number; stock: number; staffShare: number; costGap: number; miscCosts: number; otherCosts: number; net: number }> {
    const list = this.entriesForSelection('report').slice().sort((a,b)=>a.entry_date.localeCompare(b.entry_date));
    const range = this.selectedRange(this.reportPreset,this.reportDate,this.reportStart,this.reportEnd);
    const spanDays = Math.round((new Date(range.end+'T12:00:00').getTime()-new Date(range.start+'T12:00:00').getTime())/86400000)+1;
    const aggregateMonthly = spanDays > 31;
    const map = new Map<string, {entry_date:string;label:string;largeSales:number;smallSales:number;sales:number;payments:number;stock:number;staffShare:number;costGap:number;miscCosts:number;otherCosts:number;net:number}>();
    for (const e of list) {
      const d = new Date(e.entry_date+'T12:00:00');
      const key = aggregateMonthly ? e.entry_date.slice(0,7) : e.entry_date;
      const label = aggregateMonthly ? d.toLocaleDateString('en-IN',{month:'short',year:'2-digit'}) : d.toLocaleDateString('en-IN',{day:'numeric',month:'short'});
      const largeSales=this.largeSalesFor(e), smallSales=this.smallSalesFor(e), sales=largeSales+smallSales;
      const payments=Number(e.online_received||0)+Number(e.offline_received||0), stock=Number(e.stock_purchase_paid||0);
      const staffShare=Number(e.staff_share ?? (largeSales*this.settings.large_staff_pct/100+smallSales*this.settings.small_staff_pct/100)); const costGap=Number(e.cost_gap||0); const miscCosts=Number(e.miscellaneous_expenses||0); const otherCosts=staffShare+costGap+miscCosts;
      const prior=map.get(key) || {entry_date:key,label,largeSales:0,smallSales:0,sales:0,payments:0,stock:0,staffShare:0,costGap:0,miscCosts:0,otherCosts:0,net:0};
      prior.largeSales+=largeSales; prior.smallSales+=smallSales; prior.sales+=sales; prior.payments+=payments; prior.stock+=stock; prior.staffShare+=staffShare; prior.costGap+=costGap; prior.miscCosts+=miscCosts; prior.otherCosts+=otherCosts; prior.net+=sales-stock-otherCosts; map.set(key,prior);
    }
    if (aggregateMonthly) { const cursor=new Date(range.start+'T12:00:00'); const last=new Date(range.end+'T12:00:00'); cursor.setDate(1); while(cursor<=last){const key=`${cursor.getFullYear()}-${String(cursor.getMonth()+1).padStart(2,'0')}`;if(!map.has(key))map.set(key,{entry_date:key,label:cursor.toLocaleDateString('en-IN',{month:'short',year:'2-digit'}),largeSales:0,smallSales:0,sales:0,payments:0,stock:0,staffShare:0,costGap:0,miscCosts:0,otherCosts:0,net:0});cursor.setMonth(cursor.getMonth()+1);} }
    return [...map.values()].sort((a,b)=>a.entry_date.localeCompare(b.entry_date));
  }
  get reportTableRows(): Array<{entry_date:string;label:string;largeSales:number;smallSales:number;sales:number;payments:number;stock:number;staffShare:number;costGap:number;miscCosts:number;otherCosts:number;net:number}> { return this.reportDailySeries.slice().reverse().map(day => { const date = day.entry_date.length === 7 ? `${day.entry_date}-01` : day.entry_date; const d = new Date(date + 'T12:00:00'); const daysInMonth = new Date(d.getFullYear(), d.getMonth() + 1, 0).getDate(); const fixedShare = day.entry_date.length === 7 ? this.fixedMonthly : this.fixedMonthly / daysInMonth; return { ...day, net: day.net - fixedShare }; }); }
  get reportLargeSalesTotal(): number { return this.reportDailySeries.reduce((sum,day)=>sum+day.largeSales,0); }
  get reportSmallSalesTotal(): number { return this.reportDailySeries.reduce((sum,day)=>sum+day.smallSales,0); }
  get reportPayments(): number { return this.reportDailySeries.reduce((sum, day) => sum + day.payments, 0); }
  get reportTotalExpenses(): number { return this.report.stock + this.report.staff + this.report.gap + this.report.misc + this.reportFixedCost; }
  get reportExpenseBreakdown(): Array<{ label: string; amount: number; width: string }> {
    const items = [{label:'Stock purchases paid',amount:this.report.stock},{label:'Staff share earned',amount:this.report.staff},{label:'Cost gap',amount:this.report.gap},{label:'Miscellaneous',amount:this.report.misc},{label:'Fixed costs for period',amount:this.reportFixedCost}];
    const max=Math.max(1,...items.map(item=>item.amount)); return items.map(item=>({...item,width:`${Math.max(item.amount>0?2:0,item.amount/max*100)}%`}));
  }
  get reportChartMax(): number { return Math.max(1,...this.reportDailySeries.flatMap(day=>[day.sales,day.payments])); }
  get chartGridY(): number[] { return [35,85,135,185]; }
  chartAxisValue(y:number): number { return this.reportChartMax * Math.max(0, (185-y)/150); }
  chartAxisLabel(y:number): string { const value=this.chartAxisValue(y); if (value <= 0) return '₹0'; if (value >= 1000) return '₹' + (value/1000).toLocaleString('en-IN',{maximumFractionDigits:1}) + 'k'; return '₹' + Math.round(value).toLocaleString('en-IN'); }
  chartPointX(index:number,count:number):number { return count<=1?358.5:92+(index*533/(count-1)); }
  chartPointY(value:number,max:number):number { return 185-(Math.max(0,value)/Math.max(1,max))*150; }
  chartLinePoints(key:'sales'|'payments'):string { return this.reportDailySeries.map((day,index)=>`${this.chartPointX(index,this.reportDailySeries.length)},${this.chartPointY(day[key],this.reportChartMax)}`).join(' '); }
  private emptyEntry(): Entry {
    return { entry_date: new Date().toISOString().slice(0, 10), opening_large: 0, opening_small: 0, received_large: 0, received_small: 0, sold_large: 0, sold_small: 0, online_received: 0, offline_received: 0, cost_gap: 0, miscellaneous_expenses: 0, stock_purchase_paid: 0, staff_paid_today: 0, notes: '' };
  }
  private clearAlerts(): void { this.message = ''; this.error = ''; }
  private requireClient(): SupabaseClient {
    if (!this.supabase) throw new Error('Supabase is not configured. Follow SETUP.md first.');
    return this.supabase;
  }
  private async loadSessionUser(user: User): Promise<void> {
    this.user = user;
    try {
      const client = this.requireClient();
      // Try the vendor-aware profile schema first. If the database migration has not
      // been applied, fall back to the original profile shape so authentication itself
      // does not appear to fail after Supabase has accepted the credentials.
      let profileData: Profile | null = null;
      let vendorColumnMissing = false;
      const withVendor = await client.from('profiles')
        .select('id,full_name,role,vendor_id,approval_status,is_platform_admin').eq('id', user.id).maybeSingle();
      if (withVendor.error && /vendor_id.*does not exist|column.*vendor_id.*does not exist/i.test(withVendor.error.message || '')) {
        vendorColumnMissing = true;
        const legacy = await client.from('profiles').select('id,full_name,role').eq('id', user.id).maybeSingle();
        if (legacy.error) throw legacy.error;
        profileData = legacy.data as Profile | null;
      } else {
        if (withVendor.error) throw withVendor.error;
        profileData = withVendor.data as Profile | null;
      }
      if (!profileData) {
        this.profile = null;
        this.error = 'Your account signed in, but its user profile was not found. Ask your administrator to create or repair your profile.';
        return;
      }
      if (profileData.approval_status && profileData.approval_status !== 'approved') {
        await client.auth.signOut();
        this.user = null; this.profile = null;
        this.error = profileData.approval_status === 'disabled'
          ? 'This account has been disabled. Please contact the Icy Popps administrator.'
          : profileData.approval_status === 'rejected'
            ? 'This registration was not approved. Please contact the Icy Popps administrator.'
            : 'Your registration is waiting for administrator approval. You can sign in after your vendor and role have been assigned.';
        return;
      }
      this.profile = profileData;
      this.role = profileData.role || 'staff';
      this.isPlatformAdmin = Boolean(profileData.is_platform_admin);
      this.vendorId = vendorColumnMissing ? null : (profileData.vendor_id || null);
      if (vendorColumnMissing) {
        this.error = 'You are signed in, but the app database needs an update. Ask the administrator to back up Supabase and apply the included vendor migration.';
        return;
      }
      if (!this.vendorId) {
        this.error = this.isPlatformAdmin
          ? 'Your platform-owner account is not linked to a cart workspace. Use the platform vendor-management tools.'
          : 'Your account is awaiting vendor assignment or approval. Please contact the cart Admin.';
        return;
      }
      const { data: vendorInfo } = await client.from('vendors').select('id,name,registration_code,address,pincode,status').eq('id', this.vendorId).maybeSingle();
      if (vendorInfo?.status === 'suspended' && !this.isPlatformAdmin) {
        await client.auth.signOut(); this.user = null; this.profile = null;
        this.error = 'This cart workspace is disabled. Please contact the Icy Popps platform owner.'; return;
      }
      this.currentVendorCode = vendorInfo?.registration_code || '';
      this.currentVendorName = vendorInfo?.name || '';
      this.currentVendorAddress = vendorInfo?.address || '';
      this.currentVendorPincode = vendorInfo?.pincode || '';
      await this.loadFixedCosts();
      await this.loadSettings();
      await this.loadEntries();
    } catch (e) {
      this.error = this.errMsg(e);
    }
  }

  async signIn(): Promise<void> {
    this.clearAlerts(); this.busy = true;
    try {
      const { error } = await this.requireClient().auth.signInWithPassword({ email: this.loginEmail.trim(), password: this.loginPassword });
      if (error) throw error;
      this.message = 'Signed in successfully.';
    } catch (e) { this.error = this.errMsg(e); }
    finally { this.busy = false; }
  }
  async signOut(): Promise<void> {
    await this.supabase?.auth.signOut();
    this.user = null; this.profile = null; this.role = 'staff'; this.entries = []; this.activeTab = 'overview'; this.clearAlerts();
  }
  startNewEntry(): void {
    this.clearAlerts();
    this.editingEntryId = null;
    this.originalUpdatedAt = null;
    this.form = this.emptyEntry();
    this.autoOpening = false;
    this.activeTab = 'daily';
    void this.loadEntryForDate(this.form.entry_date);
  }

  async onDailyDateChange(): Promise<void> {
    if (!this.form.entry_date) return;
    await this.loadEntryForDate(this.form.entry_date);
  }

  private async loadEntryForDate(date: string): Promise<void> {
    if (!this.user || !this.supabase || !date) return;
    this.clearAlerts();
    try {
      const client = this.requireClient();
      const { data, error } = await client
        .from('daily_entries')
        .select('*')
        .eq('entry_date', date)
        .maybeSingle();
      if (error) throw error;

      if (data) {
        let entry = data as Entry;
        if (this.canSeeFinancials) {
          const { data: financial, error: financialError } = await client
            .from('daily_financials')
            .select('*')
            .eq('daily_entry_id', entry.id)
            .maybeSingle();
          if (financialError) throw financialError;
          if (financial) entry = { ...financial, ...entry };
        }
        this.editEntry(entry);
        this.message = `Loaded the shared record for ${date}.`;
        return;
      }

      this.editingEntryId = null;
      this.originalUpdatedAt = null;
      this.form = { ...this.emptyEntry(), entry_date: date };
      await this.suggestOpeningStock();
      this.message = `No record exists for ${date}. You can create the day's shared record.`;
    } catch (e) {
      this.error = this.errMsg(e);
    }
  }

  private async suggestOpeningStock(): Promise<void> {
    if (!this.user || !this.supabase || this.editingEntryId) return;
    const date = this.form.entry_date;
    const { data, error } = await this.supabase
      .from('daily_entries')
      .select('entry_date,closing_large,closing_small')
      .lt('entry_date', date)
      .order('entry_date', { ascending: false })
      .limit(1);
    if (error) {
      this.error = this.errMsg(error);
      return;
    }
    if (data?.length) {
      this.form.opening_large = Number(data[0]['closing_large'] || 0);
      this.form.opening_small = Number(data[0]['closing_small'] || 0);
      this.autoOpening = true;
    } else {
      this.autoOpening = false;
    }
  }
  async saveEntry(): Promise<void> {
    this.clearAlerts();
    this.busy = true;
    try {
      const client = this.requireClient();
      if (this.isExistingRecord && this.role === 'staff') {
        throw new Error('Staff can view an existing shared record but cannot edit it. Ask the manager or admin to make corrections.');
      }
      if (this.closingLarge < 0 || this.closingSmall < 0) {
        throw new Error('Units sold cannot exceed opening stock plus stock received.');
      }

      const corePayload = {
        vendor_id: this.vendorId,
        entry_date: this.form.entry_date,
        opening_large: Number(this.form.opening_large || 0),
        opening_small: Number(this.form.opening_small || 0),
        received_large: Number(this.form.received_large || 0),
        received_small: Number(this.form.received_small || 0),
        sold_large: Number(this.form.sold_large || 0),
        sold_small: Number(this.form.sold_small || 0),
        notes: this.form.notes || '',
        updated_by: this.user?.id,
        closing_large: this.closingLarge,
        closing_small: this.closingSmall
      };

      const financialPayload = {
        online_received: Number(this.form.online_received || 0),
        offline_received: Number(this.form.offline_received || 0),
        cost_gap: Number(this.form.cost_gap || 0),
        miscellaneous_expenses: Number(this.form.miscellaneous_expenses || 0),
        stock_purchase_paid: Number(this.form.stock_purchase_paid || 0),
        staff_paid_today: Number(this.form.staff_paid_today || 0),
        large_sales: this.largeSales,
        small_sales: this.smallSales,
        staff_share: this.staffShare,
        updated_by: this.user?.id
      };

      let savedEntryId = this.editingEntryId;
      if (this.editingEntryId) {
        if (!this.originalUpdatedAt) {
          throw new Error('This record has no version timestamp. Reload it before updating.');
        }
        const { data, error } = await client
          .from('daily_entries')
          .update(corePayload)
          .eq('id', this.editingEntryId)
          .eq('updated_at', this.originalUpdatedAt)
          .select('id,updated_at')
          .maybeSingle();

        if (error) throw error;
        if (!data) {
          const conflictDate = this.form.entry_date;
          await this.loadEntries();
          await this.loadEntryForDate(conflictDate);
          throw new Error('This record was changed by someone else after you opened it. The latest version has been reloaded. Review it before making another change.');
        }
        savedEntryId = data.id;
        if (this.canSeeFinancials) {
          const { error: financeError } = await client
            .from('daily_financials')
            .upsert({ daily_entry_id: savedEntryId, ...financialPayload }, { onConflict: 'daily_entry_id' });
          if (financeError) throw financeError;
        }
        this.message = 'Shared daily record updated successfully.';
      } else {
        const { data, error } = await client
          .from('daily_entries')
          .insert({ ...corePayload, created_by: this.user?.id })
          .select('*')
          .single();

        if (error) {
          // Unique-date conflict means another user already created the shared record.
          if ((error as { code?: string }).code === '23505') {
            await this.loadEntryForDate(this.form.entry_date);
            this.message = 'Another user already created the record for this date. The existing shared record has been opened; no duplicate was created.';
            return;
          }
          throw error;
        }
        savedEntryId = data.id;
        if (this.canSeeFinancials && savedEntryId) {
          const { error: financeError } = await client
            .from('daily_financials')
            .upsert({ daily_entry_id: savedEntryId, ...financialPayload }, { onConflict: 'daily_entry_id' });
          if (financeError) throw financeError;
        }
        this.message = 'Shared daily record created successfully.';
      }

      const savedDate = this.form.entry_date;
      await this.loadEntries();
      await this.loadEntryForDate(savedDate);
      this.activeTab = 'daily';
    } catch (e) {
      this.error = this.errMsg(e);
    } finally {
      this.busy = false;
    }
  }

  async loadEntries(): Promise<void> {
    if (!this.user || !this.supabase) return;
    const client = this.requireClient();
    const { data, error } = await client
      .from('daily_entries')
      .select('*')
      .order('entry_date', { ascending: false })
      .limit(1000);
    if (error) { this.error = this.errMsg(error); return; }

    let merged = (data || []) as Entry[];
    if (this.canSeeFinancials && merged.length) {
      const ids = merged.map(e => e.id).filter((id): id is string => !!id);
      const { data: financials, error: financeError } = await client
        .from('daily_financials')
        .select('*')
        .in('daily_entry_id', ids);
      if (financeError) { this.error = this.errMsg(financeError); return; }
      const byEntryId = new Map<string, Record<string, unknown>>((financials || []).map((f: Record<string, unknown>) => [String(f['daily_entry_id']), f] as [string, Record<string, unknown>]));
      merged = merged.map(e => e.id && byEntryId.has(e.id) ? { ...byEntryId.get(e.id), ...e } as Entry : e);
    }
    this.entries = merged;
    this.calculateReport();
  }
  editEntry(e: Entry): void {
    this.editingEntryId = e.id || null;
    this.originalUpdatedAt = e.updated_at || null;
    this.form = { ...this.emptyEntry(), ...e };
    this.autoOpening = false;
    this.activeTab = 'daily';
    this.clearAlerts();
  }
  async deleteEntry(e: Entry): Promise<void> {
    if (!this.canEditEntry(e) || !e.id || !this.supabase) return;
    if (!confirm(`Permanently delete the daily entry for ${e.entry_date}? This cannot be undone.`)) return;
    this.clearAlerts(); this.busy = true;
    try {
      const client = this.requireClient();
      const { error: financialError } = await client.from('daily_financials').delete().eq('daily_entry_id', e.id);
      if (financialError && !/does not exist|relation.*daily_financials/i.test(financialError.message || '')) throw financialError;
      const { error } = await client.from('daily_entries').delete().eq('id', e.id);
      if (error) throw error;
      this.message = `Daily entry for ${e.entry_date} was deleted.`;
      await this.loadEntries();
    } catch (err) { this.error = this.errMsg(err); }
    finally { this.busy = false; }
  }
  canEditEntry(_e: Entry): boolean { return this.role === 'admin' || this.role === 'manager'; }
  largeSalesFor(e: Entry): number { return Number(e.large_sales ?? Number(e.sold_large || 0) * this.settings.large_price); }
  smallSalesFor(e: Entry): number { return Number(e.small_sales ?? Number(e.sold_small || 0) * this.settings.small_price); }
  salesFor(e: Entry): number { return this.largeSalesFor(e) + this.smallSalesFor(e); }
  onOverviewPeriodChange(): void { this.calculateReport(); }
  onReportPeriodChange(): void { this.calculateReport(); }
  onOverviewDateChange(): void { this.calculateReport(); }
  onReportDateChange(): void { this.calculateReport(); }
  calculateReport(): void {
    const list = this.entriesForSelection('report');
    this.report = list.reduce((acc, e) => ({
      sales: acc.sales + this.salesFor(e), stock: acc.stock + Number(e.stock_purchase_paid || 0),
      staff: acc.staff + Number(e.staff_share ?? (this.largeSalesFor(e) * this.settings.large_staff_pct / 100 + this.smallSalesFor(e) * this.settings.small_staff_pct / 100)),
      gap: acc.gap + Number(e.cost_gap || 0), misc: acc.misc + Number(e.miscellaneous_expenses || 0), paid: acc.paid + Number(e.staff_paid_today || 0)
    }), { sales: 0, stock: 0, staff: 0, gap: 0, misc: 0, paid: 0 });
  }
  async loadFixedCosts(): Promise<void> {
    if (!this.supabase || !this.vendorId || !this.user) return;
    const { data, error } = await this.requireClient().from('fixed_cost_items').select('*').eq('vendor_id', this.vendorId).order('created_at', { ascending: true });
    if (error) { this.error = this.errMsg(error); return; }
    this.fixedCosts = (data || []).map((x: Record<string, unknown>) => ({ id:String(x['id']), vendor_id:String(x['vendor_id']), name:String(x['name']), amount:Number(x['amount']||0), active:Boolean(x['active']), notes:String(x['notes']||'') }));
    this.fixedMonthly = this.fixedCosts.filter(c=>c.active).reduce((sum,c)=>sum+c.amount,0);
    this.calculateReport();
  }
  resetFixedCostDraft(): void { this.editingFixedCostId=null; this.fixedCostDraft={name:'',amount:0,active:true,notes:''}; }
  editFixedCost(cost: FixedCost): void { this.editingFixedCostId=cost.id; this.fixedCostDraft={name:cost.name,amount:cost.amount,active:cost.active,notes:cost.notes||''}; }
  async saveFixedCost(): Promise<void> {
    if (!this.isAdmin) { this.error='Only an admin can manage fixed costs.'; return; }
    if (!this.vendorId) { this.error='This account is not assigned to a vendor. Ask the platform administrator to assign a vendor first.'; return; }
    this.clearAlerts(); this.busy=true;
    try {
      const payload={vendor_id:this.vendorId,name:this.fixedCostDraft.name.trim(),amount:Number(this.fixedCostDraft.amount),active:Boolean(this.fixedCostDraft.active),notes:this.fixedCostDraft.notes.trim(),updated_by:this.user?.id};
      if (!payload.name) throw new Error('Enter a cost name.');
      if (!Number.isFinite(payload.amount)||payload.amount<0) throw new Error('Monthly amount must be zero or greater.');
      const query=this.requireClient().from('fixed_cost_items');
      const result=this.editingFixedCostId ? await query.update(payload).eq('id',this.editingFixedCostId).eq('vendor_id',this.vendorId) : await query.insert(payload);
      if (result.error) throw result.error;
      this.message=this.editingFixedCostId?'Fixed cost updated.':'Fixed cost added.'; this.resetFixedCostDraft(); await this.loadFixedCosts();
    } catch(e) { this.error=this.errMsg(e); } finally { this.busy=false; }
  }
  async deleteFixedCost(cost: FixedCost): Promise<void> {
    if (!this.isAdmin || !this.vendorId) return;
    if (!confirm(`Delete fixed cost "${cost.name}"?`)) return;
    this.clearAlerts();
    const {error}=await this.requireClient().from('fixed_cost_items').delete().eq('id',cost.id).eq('vendor_id',this.vendorId);
    if(error){this.error=this.errMsg(error);return;} this.message='Fixed cost deleted.'; await this.loadFixedCosts();
  }
  async loadSettings(): Promise<void> {
    if (!this.supabase || !this.user) return;
    const { data, error } = await this.supabase.from('product_settings').select('*').eq('id', 1).eq('vendor_id', this.vendorId).maybeSingle();
    if (error) { this.error = this.errMsg(error); return; }
    if (data) this.settings = { large_price: Number(data['large_price']), small_price: Number(data['small_price']), large_staff_pct: Number(data['large_staff_pct']), small_staff_pct: Number(data['small_staff_pct']) };
  }
  async saveSettings(): Promise<void> {
    this.clearAlerts(); this.busy = true;
    try {
      const { error } = await this.requireClient().from('product_settings').update({ ...this.settings, updated_by: this.user?.id }).eq('id', 1).eq('vendor_id', this.vendorId);
      if (error) throw error;
      this.message = 'Product settings updated.';
      await this.loadEntries();
    } catch (e) { this.error = this.errMsg(e); }
    finally { this.busy = false; }
  }
  toggleAuthMode(): void { this.clearAlerts(); this.authMode = this.authMode === 'signin' ? 'signup' : 'signin'; }

  async signUp(): Promise<void> {
    this.clearAlerts(); this.busy = true;
    try {
      const name = this.signupName.trim();
      if (name.length < 2) throw new Error('Enter your full name.');
      if (this.loginPassword.length < 8) throw new Error('Choose a password with at least 8 characters.');
      const client = this.requireClient();
      const metadata: Record<string, string> = { full_name: name, account_type: this.signupType };
      if (this.signupType === 'employee') {
        const code = this.signupVendorCode.trim().toUpperCase();
        if (!/^ICY-[0-9]{6}(-[0-9]{2,})?$/.test(code)) throw new Error('Enter a valid cart registration code, for example ICY-834002.');
        metadata['vendor_code'] = code;
      } else {
        const vendorName = this.signupVendorName.trim();
        const pincode = this.signupVendorPincode.trim();
        const address = this.signupVendorAddress.trim();
        if (vendorName.length < 2) throw new Error('Enter your cart or business name.');
        if (!/^[0-9]{6}$/.test(pincode)) throw new Error('Enter a valid 6-digit cart PIN code.');
        if (!address) throw new Error('Enter the cart address.');
        metadata['vendor_name'] = vendorName;
        metadata['vendor_pincode'] = pincode;
        metadata['vendor_address'] = address;
      }
      const { data, error } = await client.auth.signUp({
        email: this.loginEmail.trim(),
        password: this.loginPassword,
        options: { data: metadata, emailRedirectTo: window.location.origin }
      });
      if (error) throw error;
      if (data.session?.user) {
        await client.auth.signOut();
      }
      this.authMode = 'signin'; this.loginPassword = ''; this.signupName = '';
      this.signupVendorCode = ''; this.signupVendorName = ''; this.signupVendorAddress = ''; this.signupVendorPincode = '';
      this.message = this.signupType === 'vendor'
        ? 'Cart registration received. Please verify your email if prompted. The Icy Popps platform owner will review your cart details and activate your Vendor Admin account.'
        : 'Registration received. Please verify your email if prompted. The Admin for the cart code you entered must approve your account before you can access business data.';
      this.signupType = 'employee';
    } catch (e) { this.error = this.signupErrMsg(e); }
    finally { this.busy = false; }
  }

  async setUserDisabled(p: Profile, disabled: boolean): Promise<void> {
    if (!this.isPlatformAdmin || p.id === this.user?.id) return;
    const action = disabled ? 'disable-user' : 'enable-user';
    this.clearAlerts(); this.busy = true;
    try {
      const { error } = await this.requireClient().functions.invoke('admin-user-management', { body: { action, userId: p.id } });
      if (error) throw error;
      this.message = `${p.full_name || 'User'} ${disabled ? 'disabled' : 'enabled'}.`;
      await this.loadUsers();
    } catch (e) { this.error = this.errMsg(e); }
    finally { this.busy = false; }
  }

  async deleteUser(p: Profile): Promise<void> {
    if (p.id === this.user?.id) return;
    if (!confirm(`Permanently delete ${p.full_name || p.email || 'this account'}? This cannot be undone.`)) return;
    this.clearAlerts(); this.busy = true;
    try {
      const { error } = await this.requireClient().functions.invoke('admin-user-management', { body: { action: 'delete-user', userId: p.id } });
      if (error) throw error;
      this.message = `${p.full_name || 'User'} was deleted.`;
      await this.loadUsers();
    } catch (e) { this.error = this.errMsg(e); }
    finally { this.busy = false; }
  }

  async setVendorDisabled(v: {id:string;name:string;status?:string}, disabled: boolean): Promise<void> {
    if (!this.isPlatformAdmin) return;
    this.clearAlerts(); this.busy = true;
    try {
      const { error } = await this.requireClient().functions.invoke('admin-user-management', { body: { action: disabled ? 'disable-vendor' : 'enable-vendor', vendorId: v.id } });
      if (error) throw error;
      this.message = `${v.name} ${disabled ? 'disabled' : 'enabled'}.`;
      await this.loadUsers();
    } catch (e) { this.error = this.errMsg(e); }
    finally { this.busy = false; }
  }

  async deleteVendor(v: {id:string;name:string;status?:string}): Promise<void> {
    if (!this.isPlatformAdmin) return;
    if (!confirm(`PERMANENTLY DELETE vendor "${v.name}" and its business records and linked accounts? This cannot be undone.`)) return;
    this.clearAlerts(); this.busy = true;
    try {
      const { error } = await this.requireClient().functions.invoke('admin-user-management', { body: { action: 'delete-vendor', vendorId: v.id } });
      if (error) throw error;
      this.message = `${v.name} and its linked records were deleted.`;
      await this.loadUsers();
    } catch (e) { this.error = this.errMsg(e); }
    finally { this.busy = false; }
  }

  private signupErrMsg(e: unknown): string {
    const raw = e && typeof e === 'object' && 'message' in e
      ? String((e as { message: unknown }).message)
      : String(e);
    if (/rate limit|email.*send|email.*provider/i.test(raw)) {
      return `Supabase could not send the confirmation email: ${raw}`;
    }
    if (/database error saving new user|trigger|profiles|vendor_registration_requests/i.test(raw)) {
      return `Supabase could not finish creating the account in the database: ${raw}`;
    }
    return `Registration failed: ${raw || 'Supabase did not provide an error message.'}`;
  }

  async loadUsers(): Promise<void> {
    if (!this.isAdmin || !this.supabase) return;
    this.clearAlerts(); this.busy = true;
    try {
      const { data, error } = await this.requireClient().functions.invoke('admin-user-management', { body: { action: 'list', vendorId: this.vendorId } });
      if (error) throw error;
      this.profiles = ((data?.users || []) as Profile[]).slice().sort((a,b)=>(b.created_at||'').localeCompare(a.created_at||''));
      this.vendors = (data?.vendors || []).slice().sort((a: any,b: any)=>(b.created_at||'').localeCompare(a.created_at||''));
      this.vendorRequests = ((data?.vendorRequests || []) as VendorRequest[]).slice().sort((a,b)=>(b.created_at||'').localeCompare(a.created_at||''));
      this.approvalDrafts = {};
      for (const p of this.profiles) this.approvalDrafts[p.id] = { vendor_id: p.vendor_id || '', role: p.role === 'manager' ? 'manager' : 'staff' };
    } catch (e) { this.error = this.errMsg(e); }
    finally { this.busy = false; }
  }

  vendorName(id?: string): string {
    if (!id) return '';
    return this.vendors.find(v => v.id === id)?.name || '';
  }

  async approveVendor(v: VendorRequest): Promise<void> {
    if (!this.isPlatformAdmin) return;
    this.clearAlerts(); this.busy = true;
    try {
      const { error } = await this.requireClient().functions.invoke('admin-user-management', {
        body: { action: 'approve-vendor', userId: v.user_id }
      });
      if (error) throw error;
      this.message = `${v.vendor_name} is approved. Its owner can now sign in as Vendor Admin.`;
      await this.loadUsers();
    } catch (e) { this.error = this.errMsg(e); }
    finally { this.busy = false; }
  }

  async approveUser(p: Profile): Promise<void> {
    this.clearAlerts(); this.busy = true;
    try {
      const draft = this.approvalDrafts[p.id];
      const targetVendorId = this.isPlatformAdmin ? draft?.vendor_id : this.vendorId;
      if (!targetVendorId) throw new Error('The cart workspace could not be identified. Contact the platform owner.');
      const { error } = await this.requireClient().functions.invoke('admin-user-management', { body: { action: 'approve', userId: p.id, vendorId: targetVendorId, role: draft.role } });
      if (error) throw error;
      this.message = `${p.full_name || 'User'} has been approved and assigned to the selected vendor.`;
      await this.loadUsers();
    } catch (e) { this.error = this.errMsg(e); }
    finally { this.busy = false; }
  }
  private errMsg(e: unknown): string {
    const raw = e && typeof e === 'object' && 'message' in e ? String((e as {message: unknown}).message) : String(e);
    if (/profiles\.vendor_id.*does not exist|column.*vendor_id.*does not exist/i.test(raw)) {
      return 'Workspace setup is incomplete. Please ask the app administrator to finish the Supabase setup by running the multi-vendor fixed-costs migration once. Your existing records have not been deleted.';
    }
    if (/row-level security|permission denied/i.test(raw)) {
      return 'You do not have permission to complete this action. Please check your account role or contact your vendor administrator.';
    }
    if (/failed to fetch|networkerror|fetch failed/i.test(raw)) {
      return 'We could not connect to the server. Please check your internet connection and try again.';
    }
    if (/does not exist|schema cache|could not find the/i.test(raw)) return 'The app setup needs attention. Please ask your administrator to check the database setup. Your existing records have not been intentionally changed.';
    if (/invalid login credentials/i.test(raw)) return 'Email or password is incorrect. Please check your details and try again.';
    return 'Something went wrong. Please try again. If it continues, contact your vendor administrator.';
  }
}

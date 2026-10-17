import { CommonModule, CurrencyPipe, DatePipe } from '@angular/common';
import { Component, OnInit } from '@angular/core';
import { TableExportControlsComponent } from './table-export-controls.component';
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
  large_price?: number; small_price?: number;
}
interface ProductSettings { large_price: number; small_price: number; large_staff_pct: number; small_staff_pct: number; }
interface FixedCost { id: string; vendor_id: string; name: string; amount: number; active: boolean; notes?: string; }
interface StockPurchase { id?: string; vendor_id?: string; purchase_date: string; large_quantity: number; small_quantity: number; large_unit_price: number; small_unit_price: number; total_cost: number; supplier?: string; notes?: string; item_name?: string | null; quantity?: number | null; unit?: string | null; unit_price?: number; }

@Component({
  selector: 'app-root',
  standalone: true,
  imports: [CommonModule, FormsModule, CurrencyPipe, DatePipe, TableExportControlsComponent],
  template: `
  <main class="shell">
    <header class="topbar">
      <div class="brand-mark">IP</div>
      <div class="brand-copy"><h1>Icy Popps</h1><p>Business tracker</p></div>
      <div class="top-actions">
        <button class="btn btn-ghost theme-toggle" type="button" (click)="toggleTheme()" [attr.aria-label]="isDarkMode ? 'Switch to light mode' : 'Switch to dark mode'" [title]="isDarkMode ? 'Switch to light mode' : 'Switch to dark mode'">{{ isDarkMode ? '☀️' : '🌙' }}</button>
        <ng-container *ngIf="user">
          <span class="role-pill">{{ role | titlecase }}</span>
          <button class="btn btn-ghost" (click)="signOut()">Sign out</button>
        </ng-container>
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
        <div><div class="eyebrow">YOUR WORKSPACE</div><h2>Hello{{ profile?.full_name ? ', ' + profile?.full_name : '' }} 👋</h2><p class="muted">Record daily sales, payments, and expenses.</p><p class="vendor-code-chip" *ngIf="isAdmin && currentVendorCode"><strong>{{ currentVendorName || 'Your cart' }}</strong><span *ngIf="currentVendorAddress"> · {{ currentVendorAddress }}</span><span *ngIf="currentVendorPincode"> · PIN {{ currentVendorPincode }}</span><br>Employee registration code: <strong>{{ currentVendorCode }}</strong><span *ngIf="currentVendorCode !== 'ICY-000000'"> Share this code with your employees.</span><span *ngIf="currentVendorCode === 'ICY-000000'"> Temporary code — do not share it with employees until your real cart PIN is configured.</span></p></div>
        <button class="btn btn-primary" *ngIf="canManageUsers" (click)="activeTab='users'; loadUsers()">Manage users</button>
      </div>

      <nav class="tabs">
        <button [class.active]="activeTab==='overview'" (click)="activeTab='overview'">Overview</button>
        <button [class.active]="activeTab==='daily'" (click)="startNewEntry()">Daily hisab</button>
        <button [class.active]="activeTab==='stock'" *ngIf="canSeeFinancials" (click)="activeTab='stock'; loadStockPurchases()">Stock purchases</button>
        <button [class.active]="activeTab==='history'" (click)="activeTab='history'; loadEntries()">Entry history</button>
        <button [class.active]="activeTab==='reports'" *ngIf="canSeeFinancials" (click)="activeTab='reports'; loadEntries()">Reports</button>
        <button [class.active]="activeTab==='users'" *ngIf="canManageUsers" (click)="activeTab='users'; loadUsers()">Users</button>
        <button [class.active]="activeTab==='settings'" *ngIf="isAdmin" (click)="activeTab='settings'; loadSettings(); loadFixedCosts()">Settings</button>
      </nav>

      <p class="notice" *ngIf="message && activeTab === 'daily' && !isInvalidEntryDate"><span class="alert-icon" aria-hidden="true">ℹ️</span> {{ message }}</p>
      <p class="error" *ngIf="error && activeTab === 'daily'"><span class="alert-icon" aria-hidden="true">⚠️</span> {{ error }}</p>

      <section *ngIf="activeTab==='overview'" class="panel">
        <div class="section-heading"><div><div class="eyebrow">AT A GLANCE</div><h3>Business overview <span class="heading-date-range">({{ selectedPeriodDescription('overview') }})</span></h3></div><div class="period-controls"><label>Show<select [(ngModel)]="overviewPreset" (ngModelChange)="onOverviewPeriodChange()"><option value="today">Today</option><option value="yesterday">Yesterday</option><option value="last7">Last 7 days</option><option value="currentMonth">Current month</option><option value="lastMonth">Last month</option><option value="last3Months">Last 3 months</option><option value="last6Months">Last 6 months</option><option value="currentYear">Current year</option><option value="lastYear">Last year</option><option value="custom">Custom date range</option></select></label><ng-container *ngIf="overviewPreset==='custom'"><label>From<input type="date" [(ngModel)]="overviewStart" (ngModelChange)="onOverviewDateChange()" aria-label="Start date for overview"></label><label>To<input type="date" [(ngModel)]="overviewEnd" (ngModelChange)="onOverviewDateChange()" aria-label="End date for overview"></label></ng-container><button type="button" class="btn btn-secondary period-reset" (click)="resetPeriod('overview')">Reset</button></div></div>
        <section class="report-metrics-panel overview-metrics-panel" aria-label="Overview summary metrics" *ngIf="canSeeFinancials">
          <div class="report-metric-group report-primary-metrics">
            <h4>Performance and payment summary</h4>
            <div class="report-metric-grid report-metric-grid-three">
              <article class="stat"><span>Sales recorded</span><strong>{{ totalSales | currency:'INR':'symbol':'1.0-0' }}</strong><small>Large sales + small sales</small></article>
              <article class="stat"><span>Total payment rcvd</span><strong>{{ totalPayments | currency:'INR':'symbol':'1.0-0' }}</strong><small>Online payments + offline payments</small></article>
              <article class="stat highlight"><span>Net profit</span><strong>{{ pocketProfit | currency:'INR':'symbol':'1.0-0' }}</strong><small>Sales − (staff share + cost gap + Misc + fixed cost)</small></article>
            </div>
          </div>
          <div class="report-metric-group report-daily-metrics">
            <h4>Daily averages</h4>
            <div class="report-metric-grid report-metric-grid-two">
              <article class="stat"><span>Avg daily sales</span><strong>{{ averageDailySales | currency:'INR':'symbol':'1.0-0' }}</strong><small>Total sales ÷ days in selected period</small></article>
            </div>
          </div>
        </section>

        <div class="visual-grid" *ngIf="canSeeFinancials">
          <article class="visual-card" [class.full-width-chart]="overviewTrend.length <= 31">
            <div class="visual-heading"><div><h4>Sales trend</h4><p>{{ selectedPeriodDescription('overview') }}</p></div><span class="chart-key"><i class="key-dot sales-dot"></i> Sales</span></div>
            <div class="chart-canvas" *ngIf="overviewTrend.length; else noOverviewTrend">
              <button type="button" class="chart-view-toggle" (click)="overviewTrendChartType = overviewTrendChartType === 'bar' ? 'line' : 'bar'" [attr.aria-label]="overviewTrendChartType === 'bar' ? 'Switch Sales Trend to line graph' : 'Switch Sales Trend to bar graph'" [title]="overviewTrendChartType === 'bar' ? 'Switch to line graph' : 'Switch to bar graph'">
                <svg *ngIf="overviewTrendChartType === 'bar'; else overviewBarIcon" viewBox="0 0 24 24" aria-hidden="true"><path d="M3 18 8 12l4 3 7-9 2 2M3 21h18" /></svg>
                <ng-template #overviewBarIcon><svg viewBox="0 0 24 24" aria-hidden="true"><path d="M4 19V11h4v8M10 19V5h4v14M16 19v-6h4v6M3 21h18" /></svg></ng-template>
              </button>
              <svg class="clear-chart" viewBox="0 0 640 280" role="img" aria-label="Sales trend chart" preserveAspectRatio="none">
                <line *ngFor="let y of chartGridY" x1="68" x2="625" [attr.y1]="y" [attr.y2]="y" class="chart-grid-line"></line>
                <line x1="68" y1="35" x2="68" y2="185" class="chart-axis-line"></line><line x1="68" y1="185" x2="625" y2="185" class="chart-axis-line"></line>
                <text *ngFor="let y of chartGridY" x="56" [attr.y]="y === 185 ? y - 4 : y + 4" text-anchor="end" class="chart-axis-label">{{ overviewChartAxisLabel(y) }}</text>
                <ng-container *ngIf="overviewTrendChartType === 'bar'; else overviewTrendLine">
                  <rect *ngFor="let day of overviewTrend; let i = index" [attr.x]="chartBarX(i, overviewTrend.length)" [attr.y]="chartBarY(day.sales, overviewChartMax)" [attr.width]="chartBarWidth(overviewTrend.length, 0.30)" [attr.height]="chartBarHeight(day.sales, overviewChartMax)" rx="1" class="chart-bar sales-bar"><title>{{ day.label }} sales: {{ day.sales | currency:'INR':'symbol':'1.0-0' }}</title></rect>
                </ng-container>
                <ng-template #overviewTrendLine><polyline [attr.points]="overviewLinePoints()" class="chart-line sales-line"><title>Sales trend</title></polyline><circle *ngFor="let day of overviewTrend; let i = index" [attr.cx]="chartPointX(i, overviewTrend.length)" [attr.cy]="chartPointY(day.sales, overviewChartMax)" r="2" class="chart-point sales-point"><title>{{ day.label }} sales: {{ day.sales | currency:'INR':'symbol':'1.0-0' }}</title></circle></ng-template>
                <text *ngFor="let day of overviewTrend; let i = index" [attr.x]="chartPointX(i, overviewTrend.length)" y="230" text-anchor="middle" class="chart-date-label" [attr.transform]="'rotate(-90 ' + chartPointX(i, overviewTrend.length) + ' 230)'">{{ shortChartDate(day.label) }}</text>
              </svg>
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
          <app-table-export-controls ariaLabel="Export period performance table" (excelClick)="downloadTableExcel('overviewTable', 'icy-popps-overview')" (pdfClick)="downloadTablePdf('overviewTable', 'Icy Popps - Overview')"></app-table-export-controls>
          <div class="table-wrap">
            <table id="overviewTable" class="shared-data-table period-performance-table"><thead><tr><th>Date</th><th>Unit Sold (L/S)</th><th>Sales (₹)</th><th>Payment Rcvd (₹)</th><th>Diff (₹)</th></tr></thead>
              <tbody><tr *ngFor="let day of overviewPerformance">
                <td>{{ day.entry_date | date:'d MMM yyyy' }}</td><td>{{ day.sold_large }} / {{ day.sold_small }}</td>
                <td>{{ salesFor(day) | number:'1.0-0' }}</td>
                <td>{{ (day.online_received + day.offline_received) | number:'1.0-0' }}</td>
                <td><span [class.difference-positive]="(salesFor(day) - day.online_received - day.offline_received) > 0">{{ salesFor(day) - day.online_received - day.offline_received | number:'1.0-0' }}</span></td>
              </tr></tbody><tfoot><tr><th>Total</th><th>{{ overviewTotals.largeSold }} / {{ overviewTotals.smallSold }}</th><th>{{ overviewTotals.sales | number:'1.0-0' }}</th><th>{{ overviewTotals.payments | number:'1.0-0' }}</th><th>{{ overviewTotals.difference | number:'1.0-0' }}</th></tr></tfoot>
            </table>
          </div>
        </article>

        <div class="callout"><strong>Important:</strong> Sales value is calculated from units sold × configured price. Stock purchases are tracked separately and excluded from all business calculations. Staff payments are treated as advances against their calculated share, not an additional expense.</div>
        <button class="btn btn-primary" (click)="startNewEntry()">+ Add daily entry</button>
      </section>

      <section *ngIf="activeTab==='daily'" class="panel">
        <div class="section-heading"><div><div class="eyebrow">DAILY OPERATIONS</div><h3>{{ editingEntryId ? (role === 'staff' ? 'View daily record' : 'Edit daily record') : 'New daily record' }}</h3><p class="muted small">{{ editingEntryId ? 'This is the shared record for the selected date.' : 'No record exists for this date yet.' }}</p></div><span class="muted small">All amounts in ₹</span></div>
        <form (ngSubmit)="saveEntry()" class="entry-form">
          <label class="entry-date-field">Date<input type="date" name="entry_date" [(ngModel)]="form.entry_date" (ngModelChange)="onDailyDateChange()" required aria-describedby="entry-date-limit"><span id="entry-date-limit" class="muted small date-limit-hint">New entries default to today. You can submit only for dates up to yesterday ({{ latestAllowedEntryDate | date:'d MMM yyyy' }}). The submit button is disabled for today and future dates.</span></label>
          <div class="form-section-title full-span">Stock balance (calculated automatically)</div>
          <label>Opening stock — Large<input type="number" name="opening_large" [ngModel]="form.opening_large" readonly aria-readonly="true"></label>
          <label>Opening stock — Small<input type="number" name="opening_small" [ngModel]="form.opening_small" readonly aria-readonly="true"></label>
          <label>Stock received — Large<input type="number" name="received_large" [ngModel]="form.received_large" readonly aria-readonly="true"></label>
          <label>Stock received — Small<input type="number" name="received_small" [ngModel]="form.received_small" readonly aria-readonly="true"></label>
          <label>Units sold — Large<input type="number" min="0" name="sold_large" [(ngModel)]="form.sold_large" required [readonly]="isExistingRecord && role === 'staff'"></label>
          <label>Units sold — Small<input type="number" min="0" name="sold_small" [(ngModel)]="form.sold_small" required [readonly]="isExistingRecord && role === 'staff'"></label>
          <label>Closing stock — Large<input type="number" name="closing_large" [ngModel]="calculatedClosingLarge" readonly aria-readonly="true"></label>
          <label>Closing stock — Small<input type="number" name="closing_small" [ngModel]="calculatedClosingSmall" readonly aria-readonly="true"></label>
          <div class="form-section-title" *ngIf="canSeeFinancials">Selling price per item (₹)</div>
          <label *ngIf="canSeeFinancials">Large item price (₹)<input type="number" min="0" step="0.01" name="large_price" [(ngModel)]="form.large_price" required [readonly]="isExistingRecord && role === 'staff'"></label>
          <label *ngIf="canSeeFinancials">Small item price (₹)<input type="number" min="0" step="0.01" name="small_price" [(ngModel)]="form.small_price" required [readonly]="isExistingRecord && role === 'staff'"></label>
          <div class="preview full-span">
            <div *ngIf="canSeeFinancials"><span>Large sales value</span><strong>{{ largeSales | currency:'INR':'symbol':'1.0-0' }}</strong></div>
            <div *ngIf="canSeeFinancials"><span>Small sales value</span><strong>{{ smallSales | currency:'INR':'symbol':'1.0-0' }}</strong></div>
            <div *ngIf="canSeeFinancials"><span>Total sales</span><strong>{{ salesTotal | currency:'INR':'symbol':'1.0-0' }}</strong></div>
            <div *ngIf="canSeeFinancials"><span>Calculated staff share</span><strong>{{ staffShare | currency:'INR':'symbol':'1.0-0' }}</strong></div>
          </div>
          <div class="form-section-title" *ngIf="canSeeFinancials">Payments and expenses (₹)</div>
          <label *ngIf="canSeeFinancials">Online payment received<input type="number" min="0" step="0.01" name="online_received" [(ngModel)]="form.online_received" required [readonly]="isExistingRecord && role === 'staff'"></label>
          <label *ngIf="canSeeFinancials">Offline payment received<input type="number" min="0" step="0.01" name="offline_received" [(ngModel)]="form.offline_received" required [readonly]="isExistingRecord && role === 'staff'"></label>
          <label *ngIf="canSeeFinancials">Cost gap<input type="number" min="0" step="0.01" name="cost_gap" [(ngModel)]="form.cost_gap" required [readonly]="isExistingRecord && role === 'staff'"></label>
          <label *ngIf="canSeeFinancials">Misc<input type="number" min="0" step="0.01" name="miscellaneous_expenses" [(ngModel)]="form.miscellaneous_expenses" required [readonly]="isExistingRecord && role === 'staff'"></label>
          <label *ngIf="canSeeFinancials">Staff takes paid today<input type="number" min="0" step="0.01" name="staff_paid_today" [(ngModel)]="form.staff_paid_today" required [readonly]="isExistingRecord && role === 'staff'"></label>
          <label class="full-span">Notes (optional)<textarea rows="2" name="notes" [(ngModel)]="form.notes" placeholder="Any explanation or reminder…" [readonly]="isExistingRecord && role === 'staff'"></textarea></label>
          <div class="form-actions full-span">
            <span class="disabled-submit-wrap" *ngIf="!(isExistingRecord && role === 'staff')" [attr.title]="isInvalidEntryDate ? 'You can submit daily records only for past dates, up to yesterday.' : null">
              <button class="btn btn-primary" [disabled]="busy || isInvalidEntryDate" [attr.aria-label]="isInvalidEntryDate ? 'Submit disabled: past dates only, up to yesterday' : null">{{ busy ? 'Saving…' : (editingEntryId ? 'Update shared record' : 'Create daily record') }}</button>
            </span>
            <span *ngIf="isExistingRecord && role === 'staff'" class="muted small">Staff can view this shared record but cannot edit an existing record. Ask the manager or admin to make corrections.</span>
          </div>
        </form>
      </section>

      <section *ngIf="activeTab==='stock'" class="panel">
        <p class="notice stock-feedback" *ngIf="message"><span class="alert-icon" aria-hidden="true">ℹ️</span> {{ message }}</p>
        <p class="error stock-feedback" *ngIf="error"><span class="alert-icon" aria-hidden="true">⚠️</span> {{ error }}</p>
        <div class="section-heading"><div><div class="eyebrow">INVENTORY RECORDS</div><h3>Stock purchase entries</h3><p class="muted small">For tracking only — stock purchase records do not affect any business calculations.</p></div></div>
        <form class="entry-form stock-purchase-form" (ngSubmit)="saveStockPurchase()">
          <label>Purchase date<input type="date" name="stock_purchase_date" [(ngModel)]="stockPurchaseDraft.purchase_date" required></label>
          <label>Large qty<input type="number" name="stock_large_quantity" [(ngModel)]="stockPurchaseDraft.large_quantity" min="0" step="1" (ngModelChange)="refreshStockPurchaseTotal()" required></label>
          <label>Large unit price (₹)<input type="number" name="stock_large_unit_price" [(ngModel)]="stockPurchaseDraft.large_unit_price" min="0" step="0.01" (ngModelChange)="refreshStockPurchaseTotal()" required></label>
          <label>Small qty<input type="number" name="stock_small_quantity" [(ngModel)]="stockPurchaseDraft.small_quantity" min="0" step="1" (ngModelChange)="refreshStockPurchaseTotal()" required></label>
          <label>Small unit price (₹)<input type="number" name="stock_small_unit_price" [(ngModel)]="stockPurchaseDraft.small_unit_price" min="0" step="0.01" (ngModelChange)="refreshStockPurchaseTotal()" required></label>
          <label>Total cost (₹)<input type="number" name="stock_total_cost" [value]="calculatedStockPurchaseTotal" readonly aria-readonly="true"></label>
          <label>Supplier (optional)<input type="text" name="stock_supplier" [(ngModel)]="stockPurchaseDraft.supplier" maxlength="120"></label>
          <label>Notes (optional)<input type="text" name="stock_notes" [(ngModel)]="stockPurchaseDraft.notes" maxlength="500"></label>
          <div class="form-actions full-span stock-purchase-actions"><button class="btn btn-primary" [disabled]="busy || !hasStockPurchaseQuantity">{{ editingStockPurchaseId ? 'Update purchase' : 'Save purchase' }}</button><button type="button" class="btn btn-secondary" *ngIf="editingStockPurchaseId" (click)="resetStockPurchaseDraft()">Cancel</button></div>
        </form>
        <app-table-export-controls *ngIf="stockPurchases.length" class="stock-purchase-export" ariaLabel="Export stock purchases table" (excelClick)="downloadTableExcel('stockPurchaseTable', 'icy-popps-stock-purchases')" (pdfClick)="downloadTablePdf('stockPurchaseTable', 'Icy Popps - Stock Purchases')"></app-table-export-controls>
        <div class="table-wrap" *ngIf="stockPurchases.length; else noStockPurchases"><table id="stockPurchaseTable" class="shared-data-table"><thead><tr><th>Date</th><th class="numeric-cell">Qty L/S</th><th class="numeric-cell">Unit Price L/S (₹)</th><th class="numeric-cell">Cost L/S (₹)</th><th class="numeric-cell">Total Cost (₹)</th><th>Supplier</th><th>Notes</th><th>Actions</th></tr></thead><tbody><tr *ngFor="let purchase of stockPurchases"><td>{{ purchase.purchase_date | date:'d MMM yyyy' }}</td><td class="numeric-cell">{{ purchase.large_quantity | number:'1.0-3' }} / {{ purchase.small_quantity | number:'1.0-3' }}</td><td class="numeric-cell">{{ purchase.large_unit_price | number:'1.2-2' }} / {{ purchase.small_unit_price | number:'1.2-2' }}</td><td class="numeric-cell">{{ (purchase.large_quantity * purchase.large_unit_price) | number:'1.2-2' }} / {{ (purchase.small_quantity * purchase.small_unit_price) | number:'1.2-2' }}</td><td class="numeric-cell">{{ purchase.total_cost | number:'1.2-2' }}</td><td>{{ purchase.supplier || '—' }}</td><td>{{ purchase.notes || '—' }}</td><td><button type="button" class="link-btn" (click)="editStockPurchase(purchase)">Edit</button><button type="button" class="link-btn danger-link" [disabled]="busy" (click)="deleteStockPurchase(purchase)">Delete</button></td></tr></tbody><tfoot><tr><th>Total</th><th class="numeric-cell">{{ stockPurchaseTotals.large | number:'1.0-3' }} / {{ stockPurchaseTotals.small | number:'1.0-3' }}</th><th></th><th class="numeric-cell">{{ stockPurchaseTotals.largeCost | number:'1.2-2' }} / {{ stockPurchaseTotals.smallCost | number:'1.2-2' }}</th><th class="numeric-cell">{{ stockPurchaseTotals.cost | number:'1.2-2' }}</th><th></th><th></th><th>{{ stockPurchases.length }} records</th></tr></tfoot></table></div>
        <ng-template #noStockPurchases><div class="empty-state">No stock purchases recorded yet.</div></ng-template>
      </section>

      <section *ngIf="activeTab==='history'" class="panel">
        <div class="section-heading"><div><div class="eyebrow">RECORDS</div><h3>Daily entry history</h3></div></div>
        <app-table-export-controls *ngIf="entries.length" ariaLabel="Export daily entry history table" (excelClick)="downloadTableExcel('historyTable', 'icy-popps-entry-history')" (pdfClick)="downloadTablePdf('historyTable', 'Icy Popps - Entry History')"></app-table-export-controls>
        <div class="table-wrap" *ngIf="entries.length; else noEntries">
          <table id="historyTable" class="shared-data-table"><thead><tr><th>Date</th><th class="numeric-cell">Opening stock L/S</th><th class="numeric-cell">New stock L/S</th><th class="numeric-cell">Unit sold L/S</th><th class="numeric-cell">Closing stock L/S</th><th *ngIf="canSeeFinancials" class="numeric-cell">Sales (₹)</th><th *ngIf="canSeeFinancials" class="numeric-cell">Online / Offline (₹)</th><th *ngIf="canSeeFinancials" class="numeric-cell">Total payment rcvd (₹)</th><th *ngIf="canSeeFinancials" class="numeric-cell">Cost gap (₹)</th><th *ngIf="canSeeFinancials" class="numeric-cell">Misc (₹)</th><th *ngIf="canSeeFinancials" class="numeric-cell">Staff paid (₹)</th><th *ngIf="canSeeFinancials" class="numeric-cell">Staff share (₹)</th><th class="notes-column">Notes</th><th>Actions</th></tr></thead>
            <tbody><tr *ngFor="let e of entries"><td>{{ e.entry_date | date:'d MMM yyyy' }}</td><td class="numeric-cell">{{ e.opening_large | number:'1.0-0' }} / {{ e.opening_small | number:'1.0-0' }}</td><td class="numeric-cell">{{ e.received_large | number:'1.0-0' }} / {{ e.received_small | number:'1.0-0' }}</td><td class="numeric-cell">{{ e.sold_large | number:'1.0-0' }} / {{ e.sold_small | number:'1.0-0' }}</td><td class="numeric-cell">{{ e.closing_large | number:'1.0-0' }} / {{ e.closing_small | number:'1.0-0' }}</td><td *ngIf="canSeeFinancials" class="numeric-cell">{{ salesFor(e) | number:'1.0-0' }}</td><td *ngIf="canSeeFinancials" class="numeric-cell">{{ e.online_received | number:'1.0-0' }} / {{ e.offline_received | number:'1.0-0' }}</td><td *ngIf="canSeeFinancials" class="numeric-cell">{{ (e.online_received + e.offline_received) | number:'1.0-0' }}</td><td *ngIf="canSeeFinancials" class="numeric-cell">{{ e.cost_gap | number:'1.0-0' }}</td><td *ngIf="canSeeFinancials" class="numeric-cell">{{ e.miscellaneous_expenses | number:'1.0-0' }}</td><td *ngIf="canSeeFinancials" class="numeric-cell">{{ e.staff_paid_today | number:'1.0-0' }}</td><td *ngIf="canSeeFinancials" class="numeric-cell">{{ e.staff_share | number:'1.0-0' }}</td><td class="notes-cell">{{ e.notes || '—' }}</td><td><button class="link-btn" (click)="editEntry(e)">Edit</button><button *ngIf="canEditEntry(e)" class="link-btn danger-link" [disabled]="busy" (click)="deleteEntry(e)">Delete</button></td></tr></tbody>
            <tfoot><tr><th>Total</th><th></th><th class="numeric-cell">{{ historyTotals.receivedLarge | number:'1.0-0' }} / {{ historyTotals.receivedSmall | number:'1.0-0' }}</th><th class="numeric-cell">{{ historyTotals.largeSold | number:'1.0-0' }} / {{ historyTotals.smallSold | number:'1.0-0' }}</th><th></th><th *ngIf="canSeeFinancials" class="numeric-cell">{{ historyTotals.sales | number:'1.0-0' }}</th><th *ngIf="canSeeFinancials" class="numeric-cell">{{ historyTotals.onlineReceived | number:'1.0-0' }} / {{ historyTotals.offlineReceived | number:'1.0-0' }}</th><th *ngIf="canSeeFinancials" class="numeric-cell">{{ historyTotals.payments | number:'1.0-0' }}</th><th *ngIf="canSeeFinancials" class="numeric-cell">{{ historyTotals.costGap | number:'1.0-0' }}</th><th *ngIf="canSeeFinancials" class="numeric-cell">{{ historyTotals.miscellaneousExpenses | number:'1.0-0' }}</th><th *ngIf="canSeeFinancials" class="numeric-cell">{{ historyTotals.staffTook | number:'1.0-0' }}</th><th *ngIf="canSeeFinancials" class="numeric-cell">{{ historyTotals.staffShare | number:'1.0-0' }}</th><th></th><th>{{ entries.length }} records</th></tr></tfoot>
          </table>
        </div>
        <ng-template #noEntries><div class="empty-state">No entries found yet. Add your first daily entry.</div></ng-template>
      </section>

      <section *ngIf="activeTab==='reports'" class="panel">
        <div class="section-heading"><div><div class="eyebrow">BUSINESS PERFORMANCE</div><h3>Reports <span class="heading-date-range">({{ selectedPeriodDescription('report') }})</span></h3></div><div class="period-controls"><label>Show<select [(ngModel)]="reportPreset" (ngModelChange)="onReportPeriodChange()"><option value="today">Today</option><option value="yesterday">Yesterday</option><option value="last7">Last 7 days</option><option value="currentMonth">Current month</option><option value="lastMonth">Last month</option><option value="last3Months">Last 3 months</option><option value="last6Months">Last 6 months</option><option value="currentYear">Current year</option><option value="lastYear">Last year</option><option value="custom">Custom date range</option></select></label><ng-container *ngIf="reportPreset==='custom'"><label>From<input type="date" [(ngModel)]="reportStart" (ngModelChange)="onReportDateChange()" aria-label="Start date for report"></label><label>To<input type="date" [(ngModel)]="reportEnd" (ngModelChange)="onReportDateChange()" aria-label="End date for report"></label></ng-container><button type="button" class="btn btn-secondary period-reset" (click)="resetPeriod('report')">Reset</button></div></div>
        <section class="report-metrics-panel" aria-label="Report summary metrics">
          <div class="report-metric-group report-primary-metrics">
            <h4>Performance and payment summary</h4>
            <div class="report-metric-grid report-metric-grid-three">
              <article class="stat"><span>Total sales</span><strong>{{ report.sales | currency:'INR':'symbol':'1.0-0' }}</strong><small>Large sales + small sales</small></article>
              <article class="stat"><span>Total payment rcvd</span><strong>{{ reportPayments | currency:'INR':'symbol':'1.0-0' }}</strong><small>Online payments + offline payments</small></article>
              <article class="stat"><span>Online payments</span><strong>{{ reportOnlinePayments | currency:'INR':'symbol':'1.0-0' }}</strong><small>Sum of online payments in this period</small></article>
              <article class="stat"><span>Offline payments</span><strong>{{ reportOfflinePayments | currency:'INR':'symbol':'1.0-0' }}</strong><small>Sum of offline payments in this period</small></article>
              <article class="stat highlight"><span>Net profit</span><strong>{{ reportProfit | currency:'INR':'symbol':'1.0-0' }}</strong><small>Sales − (staff share + cost gap + Misc + fixed cost)</small></article>
            </div>
          </div>
          <div class="report-metric-group report-daily-metrics">
            <h4>Daily averages</h4>
            <div class="report-metric-grid report-metric-grid-two">
              <article class="stat"><span>Avg daily sales</span><strong>{{ reportAverageDailySales | currency:'INR':'symbol':'1.0-0' }}</strong><small>Total sales ÷ days in selected period</small></article>
              <article class="stat"><span>Avg daily net profit</span><strong>{{ reportAverageDailyTakeHome | currency:'INR':'symbol':'1.0-0' }}</strong><small>Net profit ÷ days in selected period</small></article>
            </div>
          </div>
          <div class="report-metric-group report-cost-metrics">
            <h4>Costs and expenses</h4>
            <div class="report-metric-grid report-metric-grid-four">
              <article class="stat"><span>Cost gap</span><strong>{{ report.gap | currency:'INR':'symbol':'1.0-0' }}</strong><small>Total sales − Total payment rcvd</small></article>
              <article class="stat"><span>Misc</span><strong>{{ report.misc | currency:'INR':'symbol':'1.0-0' }}</strong><small>Total miscellaneous expenses recorded</small></article>
              <article class="stat"><span>Fixed cost</span><strong>{{ reportFixedCost | currency:'INR':'symbol':'1.0-0' }}</strong><small>{{ activeFixedCostCount }} active cost items · {{ selectedPeriodDescription('report') }}</small></article>
            </div>
          </div>
          <div class="report-metric-group report-staff-metrics">
            <h4>Staff settlement</h4>
            <div class="report-metric-grid report-metric-grid-three">
              <article class="stat"><span>Staff share earned</span><strong>{{ report.staff | currency:'INR':'symbol':'1.0-0' }}</strong><small>Total staff share for this period</small></article>
              <article class="stat"><span>Staff paid in advance</span><strong>{{ report.paid | currency:'INR':'symbol':'1.0-0' }}</strong><small>Total staff payments already made</small></article>
              <article class="stat"><span>Staff share still due</span><strong>{{ (report.staff - report.paid) | currency:'INR':'symbol':'1.0-0' }}</strong><small>Staff share earned − Staff paid in advance</small></article>
            </div>
          </div>
        </section>

        <div class="visual-grid report-visual-grid">
          <article class="visual-card" [class.full-width-chart]="reportDailySeries.length <= 31">
            <div class="visual-heading"><div><h4>Sales vs payments</h4><p>{{ selectedPeriodDescription('report') }}</p></div><div class="chart-legend"><span><i class="key-dot sales-dot"></i>Sales</span><span><i class="key-dot payments-dot"></i>Payments</span></div></div>
            <div class="chart-canvas" *ngIf="reportDailySeries.length; else noReportDays">
              <button type="button" class="chart-view-toggle" (click)="reportChartType = reportChartType === 'bar' ? 'line' : 'bar'" [attr.aria-label]="reportChartType === 'bar' ? 'Switch Sales vs Payments to line graph' : 'Switch Sales vs Payments to bar graph'" [title]="reportChartType === 'bar' ? 'Switch to line graph' : 'Switch to bar graph'">
                <svg *ngIf="reportChartType === 'bar'; else reportBarIcon" viewBox="0 0 24 24" aria-hidden="true"><path d="M3 18 8 12l4 3 7-9 2 2M3 21h18" /></svg>
                <ng-template #reportBarIcon><svg viewBox="0 0 24 24" aria-hidden="true"><path d="M4 19V11h4v8M10 19V5h4v14M16 19v-6h4v6M3 21h18" /></svg></ng-template>
              </button>
              <svg class="clear-chart" viewBox="0 0 640 280" role="img" aria-label="Sales and payments chart" preserveAspectRatio="none">
                <line *ngFor="let y of chartGridY" x1="68" x2="625" [attr.y1]="y" [attr.y2]="y" class="chart-grid-line"></line>
                <line x1="68" y1="35" x2="68" y2="185" class="chart-axis-line"></line><line x1="68" y1="185" x2="625" y2="185" class="chart-axis-line"></line>
                <text *ngFor="let y of chartGridY" x="56" [attr.y]="y === 185 ? y - 4 : y + 4" text-anchor="end" class="chart-axis-label">{{ chartAxisLabel(y) }}</text>
                <ng-container *ngIf="reportChartType === 'bar'; else reportTrendLine">
                  <rect *ngFor="let day of reportDailySeries; let i = index" [attr.x]="chartBarX(i, reportDailySeries.length, -0.5)" [attr.y]="chartBarY(day.sales, reportChartMax)" [attr.width]="chartBarWidth(reportDailySeries.length, 0.30)" [attr.height]="chartBarHeight(day.sales, reportChartMax)" rx="1" class="chart-bar sales-bar"><title>{{ day.label }} sales: {{ day.sales | currency:'INR':'symbol':'1.0-0' }}</title></rect>
                  <rect *ngFor="let day of reportDailySeries; let i = index" [attr.x]="chartBarX(i, reportDailySeries.length, 0.5)" [attr.y]="chartBarY(day.payments, reportChartMax)" [attr.width]="chartBarWidth(reportDailySeries.length, 0.30)" [attr.height]="chartBarHeight(day.payments, reportChartMax)" rx="1" class="chart-bar payments-bar"><title>{{ day.label }} payments: {{ day.payments | currency:'INR':'symbol':'1.0-0' }}</title></rect>
                </ng-container>
                <ng-template #reportTrendLine><polyline [attr.points]="chartLinePoints('sales')" class="chart-line sales-line"></polyline><polyline [attr.points]="chartLinePoints('payments')" class="chart-line payments-line"></polyline><circle *ngFor="let day of reportDailySeries; let i = index" [attr.cx]="chartPointX(i, reportDailySeries.length)" [attr.cy]="chartPointY(day.sales, reportChartMax)" r="2" class="chart-point sales-point"><title>{{ day.label }} sales: {{ day.sales | currency:'INR':'symbol':'1.0-0' }}</title></circle><circle *ngFor="let day of reportDailySeries; let i = index" [attr.cx]="chartPointX(i, reportDailySeries.length)" [attr.cy]="chartPointY(day.payments, reportChartMax)" r="2" class="chart-point payments-point"><title>{{ day.label }} payments: {{ day.payments | currency:'INR':'symbol':'1.0-0' }}</title></circle></ng-template>
                <text *ngFor="let day of reportDailySeries; let i = index" [attr.x]="chartPointX(i, reportDailySeries.length)" y="230" text-anchor="middle" class="chart-date-label" [attr.transform]="'rotate(-90 ' + chartPointX(i, reportDailySeries.length) + ' 230)'">{{ shortChartDate(day.label) }}</text>
              </svg>
            </div>
            <ng-template #noReportDays><div class="empty-state compact">No entries for the selected period.</div></ng-template>
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
          <app-table-export-controls *ngIf="reportDailySeries.length" ariaLabel="Export period report table" (excelClick)="downloadTableExcel('reportTable', 'icy-popps-reports')" (pdfClick)="downloadTablePdf('reportTable', 'Icy Popps - Reports')"></app-table-export-controls>
          <div class="table-wrap" *ngIf="reportDailySeries.length; else noReportTable">
            <table id="reportTable" class="shared-data-table"><thead><tr><th>Period</th><th>Sales L/S (₹)</th><th>Total sales (₹)</th><th>Payment rcvd (₹)</th><th>Cost gap (₹)</th><th>Staff share (₹)</th><th>Misc (₹)</th><th>Fixed cost (₹)</th><th>Net profit (₹)</th></tr></thead>
              <tbody><tr *ngFor="let day of reportTableRows">
                <td>{{ day.label }}</td><td>{{ day.largeSales | number:'1.0-0' }} / {{ day.smallSales | number:'1.0-0' }}</td>
                <td>{{ day.sales | number:'1.0-0' }}</td><td>{{ day.payments | number:'1.0-0' }}</td><td>{{ day.costGap | number:'1.0-0' }}</td><td>{{ day.staffShare | number:'1.0-0' }}</td><td>{{ day.miscCosts | number:'1.0-0' }}</td><td>{{ day.fixedCost | number:'1.0-0' }}</td>
                <td><span [class.positive-value]="day.net >= 0" [class.negative-value]="day.net < 0">{{ day.net | number:'1.0-0' }}</span></td>
              </tr></tbody>
              <tfoot><tr><th>Total</th><th>{{ reportLargeSalesTotal | number:'1.0-0' }} / {{ reportSmallSalesTotal | number:'1.0-0' }}</th><th>{{ report.sales | number:'1.0-0' }}</th><th>{{ reportPayments | number:'1.0-0' }}</th><th>{{ report.gap | number:'1.0-0' }}</th><th>{{ report.staff | number:'1.0-0' }}</th><th>{{ report.misc | number:'1.0-0' }}</th><th>{{ reportFixedCost | number:'1.0-0' }}</th><th>{{ reportProfit | number:'1.0-0' }}</th></tr></tfoot>
            </table>
          </div>
          <ng-template #noReportTable><div class="empty-state compact">No records found for the selected period.</div></ng-template>
        </article>

      </section>

      <section *ngIf="activeTab==='users'" class="panel">
        <div class="section-heading"><div><div class="eyebrow">ACCESS CONTROL</div><h3>User accounts</h3></div><button class="btn btn-secondary" (click)="loadUsers()">Refresh</button></div>
        <p class="muted">Approve only the users belonging to your cart. Cart owners are reviewed separately by the platform owner. Pending accounts cannot access business data.</p>
        <div class="callout" *ngIf="isPlatformAdmin">Platform owner: review new cart-owner requests below. Each approved cart gets a unique code based on its PIN, such as ICY-834002. If that code is already used, the system adds a suffix.</div>
        <div class="vendor-requests" *ngIf="isPlatformAdmin">
          <div class="section-heading"><div><div class="eyebrow">NEW CARTS</div><h3>Vendor registration requests</h3></div><span class="role-pill">{{ vendorRequests.length }} pending</span></div>
          <div class="table-wrap" *ngIf="vendorRequests.length; else noVendorRequests">
            <table class="shared-data-table"><thead><tr><th>Owner</th><th>Cart</th><th>Address</th><th>PIN</th><th>Action</th></tr></thead><tbody>
              <tr *ngFor="let v of vendorRequests"><td>{{ v.full_name }}<small class="user-email">{{ v.email }}</small></td><td>{{ v.vendor_name }}</td><td>{{ v.address }}</td><td>{{ v.pincode }}</td><td><button class="btn btn-primary btn-small" [disabled]="busy" (click)="approveVendor(v)">Approve cart</button></td></tr>
            </tbody></table>
          </div>
          <ng-template #noVendorRequests><div class="empty-state compact">No pending cart registrations.</div></ng-template>
          <div class="section-heading vendor-admin-heading"><div><div class="eyebrow">CART WORKSPACES</div><h3>Vendor management</h3><p class="muted small">Disable a cart to block its users from accessing it, or delete it and its associated business records permanently.</p></div></div>
          <div class="table-wrap" *ngIf="vendors.length; else noVendors"><table class="shared-data-table"><thead><tr><th>Vendor</th><th>Reg. code</th><th>Status</th><th>Actions</th></tr></thead><tbody><tr *ngFor="let v of vendors"><td>{{ v.name }}</td><td>{{ v.registration_code || '—' }}</td><td><span class="role-pill" [class.pending-pill]="v.status === 'suspended'">{{ v.status || 'active' }}</span></td><td class="user-action-cell"><button *ngIf="v.status !== 'suspended'" class="btn btn-secondary btn-small" [disabled]="busy" (click)="setVendorDisabled(v, true)">Disable</button><button *ngIf="v.status === 'suspended'" class="btn btn-secondary btn-small" [disabled]="busy" (click)="setVendorDisabled(v, false)">Enable</button><button class="link-btn danger-link" [disabled]="busy" (click)="deleteVendor(v)">Delete vendor</button></td></tr></tbody></table></div>
          <ng-template #noVendors><div class="empty-state compact">No vendors found.</div></ng-template>
        </div>
        <div class="user-summary"><strong>{{ pendingProfiles.length }}</strong><span>pending approval</span><strong>{{ profiles.length }}</strong><span>total accounts</span></div>
        <div class="table-wrap"><table class="shared-data-table"><thead><tr><th>Name / Email</th><th>Joined</th><th>Status</th><th>Cart</th><th>Role</th><th>Actions</th></tr></thead><tbody>
          <tr *ngFor="let p of profiles"><td>{{ p.full_name || '—' }}<small class="user-email">{{ p.email || '' }}</small></td><td>{{ p.created_at ? (p.created_at | date:'d MMM yyyy') : '—' }}</td><td><span class="role-pill" [class.pending-pill]="p.approval_status !== 'approved'">{{ p.approval_status || 'approved' }}</span></td>
          <td *ngIf="isPlatformAdmin"><select [name]="'vendor-' + p.id" [(ngModel)]="approvalDrafts[p.id].vendor_id"><option value="">Choose vendor</option><option *ngFor="let v of vendors" [value]="v.id">{{ v.name }}</option></select></td><td *ngIf="!isPlatformAdmin">{{ vendorName(p.vendor_id) || currentVendorCode || 'Your cart' }}</td>
          <td><ng-container *ngIf="p.role !== 'admin'; else adminRoleLabel"><select [name]="'role-' + p.id" [(ngModel)]="approvalDrafts[p.id].role"><option value="staff">Staff</option><option value="manager">Manager</option></select></ng-container><ng-template #adminRoleLabel><span class="role-pill">{{ p.is_platform_admin ? 'Platform Owner' : 'Vendor Admin' }}</span></ng-template></td>
          <td class="user-action-cell"><button *ngIf="p.role !== 'admin' && p.approval_status !== 'disabled'" class="btn btn-primary btn-small" [disabled]="busy || (!isPlatformAdmin && p.requested_vendor_code && p.requested_vendor_code !== currentVendorCode)" (click)="approveUser(p)">{{ p.approval_status === 'approved' ? 'Save role' : 'Approve' }}</button><span *ngIf="p.role === 'admin'" class="muted small">{{ p.is_platform_admin ? 'Platform Owner' : 'Vendor Admin' }}</span><button *ngIf="isPlatformAdmin && p.id !== user?.id && p.approval_status !== 'disabled'" class="btn btn-secondary btn-small" [disabled]="busy" (click)="setUserDisabled(p, true)">Disable</button><button *ngIf="isPlatformAdmin && p.approval_status === 'disabled'" class="btn btn-secondary btn-small" [disabled]="busy" (click)="setUserDisabled(p, false)">Enable</button><button *ngIf="(isPlatformAdmin && p.id !== user?.id) || (!isPlatformAdmin && p.role !== 'admin')" class="link-btn danger-link" [disabled]="busy" (click)="deleteUser(p)">Delete</button></td></tr>
        </tbody></table></div>
        <div class="empty-state compact" *ngIf="!profiles.length">No user accounts found for this workspace yet. Employee registrations will appear here after signup.</div>
        <div class="callout">Security: approval and vendor assignment are processed by a trusted Supabase Edge Function. The service-role key must only exist in Supabase function secrets, never in Angular.</div>
      </section>

      <section *ngIf="activeTab==='settings'" class="panel">
        <div class="section-heading"><div><div class="eyebrow">ADMIN SETTINGS</div><h3>Staff share settings</h3></div></div>
        <form class="settings-form" (ngSubmit)="saveSettings()">
          <div class="form-section-title">Large product</div>
          <label>Staff share (%)<input type="number" min="0" max="100" step="0.1" [(ngModel)]="settings.large_staff_pct" name="large_staff_pct" required></label>
          <div class="form-section-title">Small product</div>
          <label>Staff share (%)<input type="number" min="0" max="100" step="0.1" [(ngModel)]="settings.small_staff_pct" name="small_staff_pct" required></label>
          <div class="full-span"><button class="btn btn-primary" [disabled]="busy">Save staff share settings</button></div>
        </form>
        <p class="muted small">Selling prices are entered separately for each date in Daily Hisab. Staff share percentages remain configured here.</p>
        <div class="fixed-cost-section">
          <div class="section-heading"><div><div class="eyebrow">VENDOR-SPECIFIC</div><h3>Recurring fixed costs</h3><p class="muted small">These amounts are deducted monthly in reports. Edit them whenever this vendor's costs change.</p></div></div>
          <form class="fixed-cost-form" (ngSubmit)="saveFixedCost()">
            <label>Cost name<input name="fixedCostName" [(ngModel)]="fixedCostDraft.name" required placeholder="e.g. Shop rent"></label>
            <label>Monthly amount (₹)<input type="number" name="fixedCostAmount" min="0" step="0.01" [(ngModel)]="fixedCostDraft.amount" required></label>
            <label>Notes (optional)<input name="fixedCostNotes" [(ngModel)]="fixedCostDraft.notes" placeholder="e.g. due on 5th"></label>
            <label class="checkbox-label"><input type="checkbox" name="fixedCostActive" [(ngModel)]="fixedCostDraft.active"> Active cost</label>
            <div class="fixed-cost-actions"><button class="btn btn-primary" [disabled]="busy">{{ editingFixedCostId ? 'Update cost' : 'Add fixed cost' }}</button><button *ngIf="editingFixedCostId" type="button" class="btn btn-secondary" (click)="resetFixedCostDraft()">Cancel edit</button></div>
          </form>
          <app-table-export-controls *ngIf="fixedCosts.length" class="fixed-cost-export" ariaLabel="Export recurring fixed costs table" (excelClick)="downloadTableExcel('fixedCostTable', 'icy-popps-recurring-fixed-costs')" (pdfClick)="downloadTablePdf('fixedCostTable', 'Icy Popps - Recurring Fixed Costs')"></app-table-export-controls>
          <div class="table-wrap" *ngIf="fixedCosts.length; else noFixedCosts"><table id="fixedCostTable" class="shared-data-table"><thead><tr><th>Cost</th><th>Monthly (₹)</th><th>Status</th><th>Notes</th><th>Actions</th></tr></thead><tbody><tr *ngFor="let cost of fixedCosts"><td>{{ cost.name }}</td><td>{{ cost.amount | number:'1.0-0' }}</td><td>{{ cost.active ? 'Active' : 'Inactive' }}</td><td>{{ cost.notes || '—' }}</td><td><button class="link-btn" (click)="editFixedCost(cost)">Edit</button><button class="link-btn danger-link" (click)="deleteFixedCost(cost)">Delete</button></td></tr></tbody><tfoot><tr><th>Total active monthly costs</th><th>{{ fixedMonthly | number:'1.0-0' }}</th><th colspan="3"></th></tr></tfoot></table></div>
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
  isDarkMode = false;
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
  report = { sales: 0, staff: 0, gap: 0, misc: 0, paid: 0 };
  stockPurchases: StockPurchase[] = [];
  editingStockPurchaseId: string | null = null;
  stockPurchaseDraft: StockPurchase = this.emptyStockPurchase();
  overviewTrendChartType: 'bar' | 'line' = 'bar';
  reportChartType: 'bar' | 'line' = 'bar';

  form: Entry = this.emptyEntry();

  constructor() {
    if (environment.supabaseUrl.startsWith('https://') && environment.supabaseAnonKey !== 'YOUR_SUPABASE_ANON_KEY') {
      this.supabase = createClient(environment.supabaseUrl, environment.supabaseAnonKey);
    }
  }

  toggleTheme(): void {
    this.isDarkMode = !this.isDarkMode;
    if (typeof document !== 'undefined') document.documentElement.classList.toggle('dark-mode', this.isDarkMode);
    if (typeof localStorage !== 'undefined') localStorage.setItem('icy-popps-theme', this.isDarkMode ? 'dark' : 'light');
  }

  async ngOnInit(): Promise<void> {
    if (typeof localStorage !== 'undefined') this.isDarkMode = localStorage.getItem('icy-popps-theme') === 'dark';
    if (typeof document !== 'undefined') document.documentElement.classList.toggle('dark-mode', this.isDarkMode);
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
  get historyTotals(): { largeSold:number; smallSold:number; receivedLarge:number; receivedSmall:number; sales:number; payments:number; onlineReceived:number; offlineReceived:number; costGap:number; miscellaneousExpenses:number; staffShare:number; staffTook:number } {
    return this.entries.reduce((t,e)=>({largeSold:t.largeSold+Number(e.sold_large||0),smallSold:t.smallSold+Number(e.sold_small||0),receivedLarge:t.receivedLarge+Number(e.received_large||0),receivedSmall:t.receivedSmall+Number(e.received_small||0),sales:t.sales+this.salesFor(e),payments:t.payments+Number(e.online_received||0)+Number(e.offline_received||0),onlineReceived:t.onlineReceived+Number(e.online_received||0),offlineReceived:t.offlineReceived+Number(e.offline_received||0),costGap:t.costGap+Number(e.cost_gap||0),miscellaneousExpenses:t.miscellaneousExpenses+Number(e.miscellaneous_expenses||0),staffShare:t.staffShare+Number(e.staff_share||0),staffTook:t.staffTook+Number(e.staff_paid_today||0)}),{largeSold:0,smallSold:0,receivedLarge:0,receivedSmall:0,sales:0,payments:0,onlineReceived:0,offlineReceived:0,costGap:0,miscellaneousExpenses:0,staffShare:0,staffTook:0});
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
    else if(preset==='last7'){start.setDate(start.getDate()-7);end.setDate(end.getDate()-1);}
    else if(preset==='currentMonth'){start=new Date(today.getFullYear(),today.getMonth(),1,12);end=new Date(today);end.setDate(today.getDate()-1);}
    else if(preset==='lastMonth'){start=new Date(today.getFullYear(),today.getMonth()-1,1,12);end=new Date(today.getFullYear(),today.getMonth(),0,12);}
    else if(preset==='last3Months'){start=new Date(today.getFullYear(),today.getMonth()-3,1,12);end=new Date(today.getFullYear(),today.getMonth(),0,12);}
    else if(preset==='last6Months'){start=new Date(today.getFullYear(),today.getMonth()-6,1,12);end=new Date(today.getFullYear(),today.getMonth(),0,12);}
    else if(preset==='currentYear'){start=new Date(today.getFullYear(),0,1,12);end.setDate(today.getDate()-1);}
    else if(preset==='lastYear'){start=new Date(today.getFullYear()-1,0,1,12);end=new Date(today.getFullYear()-1,11,31,12);}
    else if(preset==='custom'){ const a=customStart||customEnd||fmt(today), b=customEnd||customStart||fmt(today); return {start:a<=b?a:b,end:a<=b?b:a}; }
    else if(preset==='today'){start=new Date(today);end=new Date(today);}
    return {start:fmt(start),end:fmt(end)};
  }
  displayDate(value: string): string {
    if (!value) return '';
    const match = /^(\d{4})-(\d{2})-(\d{2})$/.exec(value);
    return match ? `${Number(match[3])} ${['Jan','Feb','Mar','Apr','May','Jun','Jul','Aug','Sep','Oct','Nov','Dec'][Number(match[2])-1]} ${match[1]}` : value;
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
  selectedPeriodDescription(which:'overview'|'report'): string { const isOverview=which==='overview'; const r=this.selectedRange(isOverview?this.overviewPreset:this.reportPreset,isOverview?this.overviewDate:this.reportDate,isOverview?this.overviewStart:this.reportStart,isOverview?this.overviewEnd:this.reportEnd); return `${this.displayDate(r.start)} - ${this.displayDate(r.end)}`; }
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
  get averageDailySales(): number {
    const range = this.selectedRange(this.overviewPreset, this.overviewDate, this.overviewStart, this.overviewEnd);
    const start = new Date(range.start + 'T12:00:00');
    const end = new Date(range.end + 'T12:00:00');
    const days = Math.max(1, Math.floor((end.getTime() - start.getTime()) / 86400000) + 1);
    return this.totalSales / days;
  }
  get totalPayments(): number { return this.entriesForSelection('overview').reduce((sum, e) => sum + Number(e.online_received || 0) + Number(e.offline_received || 0), 0); }
  get pocketProfit(): number { const list = this.entriesForSelection('overview'); return list.reduce((sum, e) => sum + this.salesFor(e) - Number(e.staff_share || 0) - Number(e.cost_gap || 0) - Number(e.miscellaneous_expenses || 0), 0) - this.fixedCostForSelection('overview'); }
  get reportFixedCost(): number { return this.fixedCostForSelection('report'); }
  private get reportSelectedCalendarDays(): number {
    const range = this.selectedRange(this.reportPreset, this.reportDate, this.reportStart, this.reportEnd);
    const start = new Date(range.start + 'T12:00:00');
    const end = new Date(range.end + 'T12:00:00');
    return Math.max(1, Math.floor((end.getTime() - start.getTime()) / 86400000) + 1);
  }
  get reportAverageDailySales(): number { return this.report.sales / this.reportSelectedCalendarDays; }
  get reportAverageDailyTakeHome(): number { return this.reportProfit / this.reportSelectedCalendarDays; }
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
  get largeSales(): number { return Number(this.form.sold_large || 0) * Number(this.form.large_price ?? this.settings.large_price); }
  get smallSales(): number { return Number(this.form.sold_small || 0) * Number(this.form.small_price ?? this.settings.small_price); }
  get salesTotal(): number { return this.largeSales + this.smallSales; }
  get staffShare(): number { return this.largeSales * this.settings.large_staff_pct / 100 + this.smallSales * this.settings.small_staff_pct / 100; }
  get reportProfit(): number { return this.report.sales - this.report.staff - this.report.gap - this.report.misc - this.reportFixedCost; }
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
        buckets.push({ date:key, label:cursor.toLocaleDateString('en-IN',{day:'numeric',month:'short',year:'numeric'}), sales, barHeight:'3%' });
        cursor.setDate(cursor.getDate()+1);
      }
    }
    const max = Math.max(1,...buckets.map(b=>b.sales));
    return buckets.map(b=>({...b,barHeight:`${b.sales>0?Math.max(5,b.sales/max*100):2}%`}));
  }
  get overviewPerformance(): Entry[] { return this.overviewPeriodEntries.slice().sort((a,b)=>b.entry_date.localeCompare(a.entry_date)); }
  get overviewTotals(): {largeSold:number;smallSold:number;sales:number;payments:number;difference:number} { return this.overviewPeriodEntries.reduce((t,e)=>{const sales=this.salesFor(e);const payments=Number(e.online_received||0)+Number(e.offline_received||0);return {largeSold:t.largeSold+Number(e.sold_large||0),smallSold:t.smallSold+Number(e.sold_small||0),sales:t.sales+sales,payments:t.payments+payments,difference:t.difference+sales-payments};},{largeSold:0,smallSold:0,sales:0,payments:0,difference:0}); }
  get reportDailySeries(): Array<{ entry_date: string; label: string; largeSales: number; smallSales: number; sales: number; payments: number; staffShare: number; costGap: number; miscCosts: number; otherCosts: number; net: number }> {
    const list = this.entriesForSelection('report').slice().sort((a,b)=>a.entry_date.localeCompare(b.entry_date));
    const range = this.selectedRange(this.reportPreset,this.reportDate,this.reportStart,this.reportEnd);
    const spanDays = Math.round((new Date(range.end+'T12:00:00').getTime()-new Date(range.start+'T12:00:00').getTime())/86400000)+1;
    const aggregateMonthly = spanDays > 31;
    const map = new Map<string, {entry_date:string;label:string;largeSales:number;smallSales:number;sales:number;payments:number;staffShare:number;costGap:number;miscCosts:number;otherCosts:number;net:number}>();
    for (const e of list) {
      const d = new Date(e.entry_date+'T12:00:00');
      const key = aggregateMonthly ? e.entry_date.slice(0,7) : e.entry_date;
      const label = aggregateMonthly ? d.toLocaleDateString('en-IN',{month:'short',year:'2-digit'}) : d.toLocaleDateString('en-IN',{day:'numeric',month:'short',year:'numeric'});
      const largeSales=this.largeSalesFor(e), smallSales=this.smallSalesFor(e), sales=largeSales+smallSales;
      const payments=Number(e.online_received||0)+Number(e.offline_received||0);
      const staffShare=Number(e.staff_share ?? (largeSales*this.settings.large_staff_pct/100+smallSales*this.settings.small_staff_pct/100)); const costGap=Number(e.cost_gap||0); const miscCosts=Number(e.miscellaneous_expenses||0); const otherCosts=staffShare+costGap+miscCosts;
      const prior=map.get(key) || {entry_date:key,label,largeSales:0,smallSales:0,sales:0,payments:0,staffShare:0,costGap:0,miscCosts:0,otherCosts:0,net:0};
      prior.largeSales+=largeSales; prior.smallSales+=smallSales; prior.sales+=sales; prior.payments+=payments; prior.staffShare+=staffShare; prior.costGap+=costGap; prior.miscCosts+=miscCosts; prior.otherCosts+=otherCosts; prior.net+=sales-otherCosts; map.set(key,prior);
    }
    if (aggregateMonthly) { const cursor=new Date(range.start+'T12:00:00'); const last=new Date(range.end+'T12:00:00'); cursor.setDate(1); while(cursor<=last){const key=`${cursor.getFullYear()}-${String(cursor.getMonth()+1).padStart(2,'0')}`;if(!map.has(key))map.set(key,{entry_date:key,label:cursor.toLocaleDateString('en-IN',{month:'short',year:'2-digit'}),largeSales:0,smallSales:0,sales:0,payments:0,staffShare:0,costGap:0,miscCosts:0,otherCosts:0,net:0});cursor.setMonth(cursor.getMonth()+1);} }
    return [...map.values()].sort((a,b)=>a.entry_date.localeCompare(b.entry_date));
  }
  get reportTableRows(): Array<{entry_date:string;label:string;largeSales:number;smallSales:number;sales:number;payments:number;staffShare:number;costGap:number;miscCosts:number;otherCosts:number;fixedCost:number;net:number}> {
    const range = this.selectedRange(this.reportPreset, this.reportDate, this.reportStart, this.reportEnd);
    return this.reportDailySeries.slice().reverse().map(day => {
      // Monthly buckets may cover only part of a month (for example, a custom range).
      // Allocate fixed costs only to the days included in the selected report range.
      const monthBucket = day.entry_date.length === 7;
      const monthStart = monthBucket ? `${day.entry_date}-01` : day.entry_date;
      const monthDate = new Date(monthStart + 'T12:00:00');
      const bucketStart = monthBucket ? new Date(monthDate.getFullYear(), monthDate.getMonth(), 1, 12) : new Date(monthDate);
      const bucketEnd = monthBucket ? new Date(monthDate.getFullYear(), monthDate.getMonth() + 1, 0, 12) : new Date(monthDate);
      const selectedStart = new Date(range.start + 'T12:00:00');
      const selectedEnd = new Date(range.end + 'T12:00:00');
      const cursor = new Date(Math.max(bucketStart.getTime(), selectedStart.getTime()));
      const clippedEnd = new Date(Math.min(bucketEnd.getTime(), selectedEnd.getTime()));
      let fixedShare = 0;
      while (cursor <= clippedEnd) {
        const daysInMonth = new Date(cursor.getFullYear(), cursor.getMonth() + 1, 0).getDate();
        fixedShare += this.fixedMonthly / daysInMonth;
        cursor.setDate(cursor.getDate() + 1);
      }
      return { ...day, fixedCost: fixedShare, net: day.net - fixedShare };
    });
  }
  get reportLargeSalesTotal(): number { return this.reportDailySeries.reduce((sum,day)=>sum+day.largeSales,0); }
  get reportSmallSalesTotal(): number { return this.reportDailySeries.reduce((sum,day)=>sum+day.smallSales,0); }
  get reportOnlinePayments(): number { return this.entriesForSelection('report').reduce((sum, entry) => sum + Number(entry.online_received || 0), 0); }
  get reportOfflinePayments(): number { return this.entriesForSelection('report').reduce((sum, entry) => sum + Number(entry.offline_received || 0), 0); }
  get reportPayments(): number { return this.reportOnlinePayments + this.reportOfflinePayments; }
  get reportTotalExpenses(): number { return this.report.staff + this.report.gap + this.report.misc + this.reportFixedCost; }
  get reportExpenseBreakdown(): Array<{ label: string; amount: number; width: string }> {
    const items = [{label:'Staff share earned',amount:this.report.staff},{label:'Cost gap',amount:this.report.gap},{label:'Miscellaneous',amount:this.report.misc},{label:'Fixed cost',amount:this.reportFixedCost}];
    const max=Math.max(1,...items.map(item=>item.amount)); return items.map(item=>({...item,width:`${Math.max(item.amount>0?2:0,item.amount/max*100)}%`}));
  }
  get overviewChartMax(): number { return Math.max(1, ...this.overviewTrend.map(day => day.sales)); }
  get reportChartMax(): number { return Math.max(1,...this.reportDailySeries.flatMap(day=>[day.sales,day.payments])); }
  get chartGridY(): number[] { return [35,85,135,185]; }
  private chartAxisText(value:number): string { if (value <= 0) return '₹0'; if (value >= 1000) return '₹' + (value/1000).toLocaleString('en-IN',{maximumFractionDigits:1}) + 'k'; return '₹' + Math.round(value).toLocaleString('en-IN'); }
  overviewChartAxisLabel(y:number): string { return this.chartAxisText(this.overviewChartMax * Math.max(0, (185-y)/150)); }
  chartAxisLabel(y:number): string { return this.chartAxisText(this.reportChartMax * Math.max(0, (185-y)/150)); }
  chartPointX(index:number,count:number):number { const left=84, right=608; return count<=1?((left+right)/2):left+(index*(right-left)/(count-1)); }
  chartPointY(value:number,max:number):number { return 185-(Math.max(0,value)/Math.max(1,max))*150; }
  chartBarWidth(count:number, fraction:number = 0.24):number { const slot = 500 / Math.max(1,count); return Math.max(2.4, Math.min(6.4, slot * Math.max(fraction, 0.34))); }
  shortChartDate(label:string):string { return String(label || '').replace(/\b(\d{4})$/, year => year.slice(-2)); }
  chartBarX(index:number,count:number, offset:number = 0):number { const x = this.chartPointX(index,count); const width = this.chartBarWidth(count); return x + (offset === 0 ? -width/2 : offset * width) - (offset === 0 ? 0 : width/2); }
  chartBarY(value:number,max:number):number { return this.chartPointY(value,max); }
  chartBarHeight(value:number,max:number):number { return Math.max(0, 185 - this.chartPointY(value,max)); }
  overviewLinePoints():string { return this.overviewTrend.map((day,index)=>`${this.chartPointX(index,this.overviewTrend.length)},${this.chartPointY(day.sales,this.overviewChartMax)}`).join(' '); }
  chartLinePoints(key:'sales'|'payments'):string { return this.reportDailySeries.map((day,index)=>`${this.chartPointX(index,this.reportDailySeries.length)},${this.chartPointY(day[key],this.reportChartMax)}`).join(' '); }
  private formatLocalDate(date: Date): string {
    return `${date.getFullYear()}-${String(date.getMonth() + 1).padStart(2, '0')}-${String(date.getDate()).padStart(2, '0')}`;
  }
  get todayEntryDate(): string {
    return this.formatLocalDate(new Date());
  }
  get latestAllowedEntryDate(): string {
    const date = new Date();
    date.setDate(date.getDate() - 1);
    return this.formatLocalDate(date);
  }
  get isInvalidEntryDate(): boolean {
    return !this.form.entry_date || this.form.entry_date >= this.todayEntryDate;
  }
  get calculatedClosingLarge(): number { return Math.max(0, Number(this.form.opening_large || 0) + Number(this.form.received_large || 0) - Number(this.form.sold_large || 0)); }
  get calculatedClosingSmall(): number { return Math.max(0, Number(this.form.opening_small || 0) + Number(this.form.received_small || 0) - Number(this.form.sold_small || 0)); }
  private emptyEntry(): Entry {
    return { entry_date: this.todayEntryDate, opening_large: 0, opening_small: 0, received_large: 0, received_small: 0, sold_large: 0, sold_small: 0, large_price: this.settings.large_price, small_price: this.settings.small_price, online_received: 0, offline_received: 0, cost_gap: 0, miscellaneous_expenses: 0, stock_purchase_paid: 0, staff_paid_today: 0, notes: '' };
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
    const invalidDate = this.form.entry_date >= this.todayEntryDate;
    await this.loadEntryForDate(this.form.entry_date);
    // Keep the selected date visible; the disabled submit button and save-time
    // validation prevent today's or a future record from being submitted.
    if (invalidDate) {
      this.error = 'You can submit daily records only for past dates, up to yesterday. The submit button is disabled for today and future dates.';
    }
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
      // Show the no-record info only for eligible past dates, and only on Daily Hisab.
      // Today and future dates are restricted and should show only the date-limit warning.
      this.message = date < this.todayEntryDate ? `No record exists for ${date}. You can create the day's shared record.` : '';
    } catch (e) {
      this.error = this.errMsg(e);
    }
  }

  private async suggestOpeningStock(): Promise<void> {
    if (!this.user || !this.supabase || this.editingEntryId || !this.vendorId) return;
    const date = this.form.entry_date;
    try {
      const client = this.requireClient();
      const [{ data: entries, error: entriesError }, { data: purchases, error: purchasesError }] = await Promise.all([
        client.from('daily_entries').select('entry_date,opening_large,opening_small,received_large,received_small,sold_large,sold_small,closing_large,closing_small').eq('vendor_id', this.vendorId).lt('entry_date', date).order('entry_date', { ascending: true }),
        client.from('stock_purchases').select('purchase_date,large_quantity,small_quantity').eq('vendor_id', this.vendorId).lte('purchase_date', date).order('purchase_date', { ascending: true })
      ]);
      if (entriesError) throw entriesError;
      if (purchasesError) throw purchasesError;
      const purchaseByDate = new Map<string, { large: number; small: number }>();
      for (const purchase of purchases || []) {
        const current = purchaseByDate.get(purchase.purchase_date) || { large: 0, small: 0 };
        current.large += Number(purchase.large_quantity) || 0;
        current.small += Number(purchase.small_quantity) || 0;
        purchaseByDate.set(purchase.purchase_date, current);
      }
      const eventDates = new Set<string>([...(entries || []).map((entry: any) => entry.entry_date), ...purchaseByDate.keys()]);
      const firstPurchaseDate = [...purchaseByDate.keys()].sort()[0];
      let large = 0; let small = 0;
      for (const eventDate of [...eventDates].sort()) {
        if (!firstPurchaseDate || eventDate < firstPurchaseDate || eventDate >= date) continue;
        const purchase = purchaseByDate.get(eventDate) || { large: 0, small: 0 };
        const entry = (entries || []).find((item: any) => item.entry_date === eventDate) as any;
        large = Math.max(0, large + purchase.large - (Number(entry?.['sold_large']) || 0));
        small = Math.max(0, small + purchase.small - (Number(entry?.['sold_small']) || 0));
      }
      const todayPurchase = purchaseByDate.get(date) || { large: 0, small: 0 };
      this.form.opening_large = Math.max(0, large);
      this.form.opening_small = Math.max(0, small);
      this.form.received_large = todayPurchase.large;
      this.form.received_small = todayPurchase.small;
      this.autoOpening = true;
    } catch (error) {
      this.error = this.errMsg(error);
    }
  }

  private async recalculateStockBalances(): Promise<void> {
    if (!this.vendorId || !this.supabase) return;
    const client = this.requireClient();
    const [{ data: rows, error: entriesError }, { data: purchases, error: purchasesError }] = await Promise.all([
      client.from('daily_entries').select('id,entry_date,sold_large,sold_small,opening_large,opening_small,received_large,received_small,closing_large,closing_small').eq('vendor_id', this.vendorId).order('entry_date', { ascending: true }),
      client.from('stock_purchases').select('purchase_date,large_quantity,small_quantity').eq('vendor_id', this.vendorId).order('purchase_date', { ascending: true })
    ]);
    if (entriesError) throw entriesError;
    if (purchasesError) throw purchasesError;
    const entries = (rows || []) as Array<Record<string, any>>;
    const purchaseByDate = new Map<string, { large: number; small: number }>();
    for (const purchase of purchases || []) {
      const current = purchaseByDate.get(purchase.purchase_date) || { large: 0, small: 0 };
      current.large += Number(purchase.large_quantity) || 0;
      current.small += Number(purchase.small_quantity) || 0;
      purchaseByDate.set(purchase.purchase_date, current);
    }
    const firstPurchaseDate = [...purchaseByDate.keys()].sort()[0];
    if (!firstPurchaseDate) {
      for (const entry of entries) {
        if (!entry['id']) continue;
        const { error } = await client.from('daily_entries').update({ opening_large: 0, opening_small: 0, received_large: 0, received_small: 0, closing_large: 0, closing_small: 0 }).eq('id', entry['id']).eq('vendor_id', this.vendorId);
        if (error) throw error;
        Object.assign(entry, { opening_large: 0, opening_small: 0, received_large: 0, received_small: 0, closing_large: 0, closing_small: 0 });
      }
      return;
    }
    const entryByDate = new Map<string, Record<string, any>>(entries.map(entry => [String(entry['entry_date']), entry]));
    const eventDates = [...new Set([...entryByDate.keys(), ...purchaseByDate.keys()])].filter(date => date >= firstPurchaseDate).sort();
    let large = 0; let small = 0;
    for (const date of eventDates) {
      const purchase = purchaseByDate.get(date) || { large: 0, small: 0 };
      const entry = entryByDate.get(date);
      const openingLarge = large;
      const openingSmall = small;
      const receivedLarge = purchase.large;
      const receivedSmall = purchase.small;
      const soldLarge = Number(entry?.['sold_large']) || 0;
      const soldSmall = Number(entry?.['sold_small']) || 0;
      large = Math.max(0, openingLarge + receivedLarge - soldLarge);
      small = Math.max(0, openingSmall + receivedSmall - soldSmall);
      if (entry && entry['id']) {
        const payload = { opening_large: openingLarge, opening_small: openingSmall, received_large: receivedLarge, received_small: receivedSmall, closing_large: Math.max(0, large), closing_small: Math.max(0, small) };
        const { error } = await client.from('daily_entries').update(payload).eq('id', entry['id']).eq('vendor_id', this.vendorId);
        if (error) throw error;
        Object.assign(entry, payload);
      }
    }
  }
  async saveEntry(): Promise<void> {
    this.clearAlerts();
    this.busy = true;
    try {
      const client = this.requireClient();
      if (!this.form.entry_date || this.form.entry_date > this.latestAllowedEntryDate) {
        throw new Error('Daily entries are allowed only for past dates, up to yesterday. Today and future dates are not allowed.');
      }
      if (this.isExistingRecord && this.role === 'staff') {
        throw new Error('Staff can view an existing shared record but cannot edit it. Ask the manager or admin to make corrections.');
      }
      const corePayload = {
        vendor_id: this.vendorId,
        entry_date: this.form.entry_date,
        opening_large: Number(this.form.opening_large || 0), opening_small: Number(this.form.opening_small || 0), received_large: Number(this.form.received_large || 0), received_small: Number(this.form.received_small || 0),
        sold_large: Number(this.form.sold_large || 0),
        sold_small: Number(this.form.sold_small || 0), closing_large: this.calculatedClosingLarge, closing_small: this.calculatedClosingSmall,
        notes: this.form.notes || '',
        updated_by: this.user?.id,
      };

      const financialPayload = {
        online_received: Number(this.form.online_received || 0),
        offline_received: Number(this.form.offline_received || 0),
        cost_gap: Number(this.form.cost_gap || 0),
        miscellaneous_expenses: Number(this.form.miscellaneous_expenses || 0),
        staff_paid_today: Number(this.form.staff_paid_today || 0),
        large_price: Number(this.form.large_price ?? this.settings.large_price),
        small_price: Number(this.form.small_price ?? this.settings.small_price),
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
      await this.recalculateStockBalances();
      await this.loadEntries();
      await this.loadEntryForDate(savedDate);
      this.activeTab = 'overview';
    } catch (e) {
      this.error = this.errMsg(e);
    } finally {
      this.busy = false;
    }
  }

  private emptyStockPurchase(): StockPurchase { return { purchase_date: this.todayEntryDate, large_quantity: 0, small_quantity: 0, large_unit_price: 0, small_unit_price: 0, total_cost: 0, supplier: '', notes: '' }; }
  get calculatedStockPurchaseTotal(): number { return Math.round(((Number(this.stockPurchaseDraft.large_quantity) || 0) * (Number(this.stockPurchaseDraft.large_unit_price) || 0) + (Number(this.stockPurchaseDraft.small_quantity) || 0) * (Number(this.stockPurchaseDraft.small_unit_price) || 0)) * 100) / 100; }
  get hasStockPurchaseQuantity(): boolean { return (Number(this.stockPurchaseDraft.large_quantity) || 0) > 0 || (Number(this.stockPurchaseDraft.small_quantity) || 0) > 0; }
  get stockPurchaseTotals(): { large: number; small: number; largeCost: number; smallCost: number; cost: number } { return this.stockPurchases.reduce((totals, purchase) => { const largeQuantity = Number(purchase.large_quantity) || 0; const smallQuantity = Number(purchase.small_quantity) || 0; const largeCost = largeQuantity * (Number(purchase.large_unit_price) || 0); const smallCost = smallQuantity * (Number(purchase.small_unit_price) || 0); return { large: totals.large + largeQuantity, small: totals.small + smallQuantity, largeCost: totals.largeCost + largeCost, smallCost: totals.smallCost + smallCost, cost: totals.cost + (Number(purchase.total_cost) || 0) }; }, { large: 0, small: 0, largeCost: 0, smallCost: 0, cost: 0 }); }
  refreshStockPurchaseTotal(): void { this.stockPurchaseDraft.total_cost = this.calculatedStockPurchaseTotal; }
  async loadStockPurchases(): Promise<void> {
    if (!this.user || !this.vendorId || !this.supabase) return;
    const { data, error } = await this.requireClient().from('stock_purchases').select('*').eq('vendor_id', this.vendorId).order('purchase_date', { ascending: false }).order('created_at', { ascending: false });
    if (error) { this.error = this.errMsg(error); return; }
    this.stockPurchases = (data || []).map((row: any) => ({ ...row, large_quantity: Number(row.large_quantity) || 0, small_quantity: Number(row.small_quantity) || 0, large_unit_price: Number(row.large_unit_price) || 0, small_unit_price: Number(row.small_unit_price) || 0, total_cost: Number(row.total_cost) || 0 })) as StockPurchase[];
  }
  resetStockPurchaseDraft(): void { this.editingStockPurchaseId = null; this.stockPurchaseDraft = this.emptyStockPurchase(); }
  editStockPurchase(purchase: StockPurchase): void { this.editingStockPurchaseId = purchase.id || null; this.stockPurchaseDraft = { ...purchase, large_quantity: Number(purchase.large_quantity) || 0, small_quantity: Number(purchase.small_quantity) || 0, large_unit_price: Number(purchase.large_unit_price) || 0, small_unit_price: Number(purchase.small_unit_price) || 0 }; this.refreshStockPurchaseTotal(); }
  async saveStockPurchase(): Promise<void> {
    if (!this.canSeeFinancials || !this.vendorId) { this.error = 'Only an admin or manager assigned to this cart can manage stock purchases.'; return; }
    this.clearAlerts(); this.busy = true;
    try {
      const largeQuantity = Number(this.stockPurchaseDraft.large_quantity) || 0;
      const smallQuantity = Number(this.stockPurchaseDraft.small_quantity) || 0;
      const largeUnitPrice = Number(this.stockPurchaseDraft.large_unit_price) || 0;
      const smallUnitPrice = Number(this.stockPurchaseDraft.small_unit_price) || 0;
      const totalCost = this.calculatedStockPurchaseTotal;
      if (!this.stockPurchaseDraft.purchase_date) throw new Error('Choose a purchase date.');
      if (largeQuantity < 0 || smallQuantity < 0 || (largeQuantity === 0 && smallQuantity === 0) || largeUnitPrice < 0 || smallUnitPrice < 0) throw new Error('Enter a positive quantity for Large or Small (or both) and valid unit prices.');
      const payload = { vendor_id: this.vendorId, purchase_date: this.stockPurchaseDraft.purchase_date, large_quantity: largeQuantity, small_quantity: smallQuantity, large_unit_price: largeUnitPrice, small_unit_price: smallUnitPrice, total_cost: totalCost, item_name: null, quantity: null, unit: null, unit_price: 0, supplier: (this.stockPurchaseDraft.supplier || '').trim(), notes: (this.stockPurchaseDraft.notes || '').trim(), created_by: this.user?.id, updated_by: this.user?.id };
      const client = this.requireClient();
      if (this.editingStockPurchaseId) {
        const purchaseId = this.editingStockPurchaseId;
        // Do not request a representation in the PATCH response. This avoids coupling
        // the write to PostgREST's return=representation response negotiation. Preserve
        // created_by on edits; only updated_by/updated_at should change.
        const { created_by: _createdBy, ...updatePayload } = payload;
        const { error: updateError } = await client.from('stock_purchases')
          .update({ ...updatePayload, updated_at: new Date().toISOString() })
          .eq('id', purchaseId)
          .eq('vendor_id', this.vendorId);
        if (updateError) throw new Error(`Could not update this stock purchase: ${updateError.message} (code: ${updateError.code || 'unknown'})`);

        // Verify the row separately. An UPDATE blocked by RLS can otherwise affect
        // zero rows without a useful response when no representation is requested.
        const { data: verifiedRow, error: verifyError } = await client.from('stock_purchases')
          .select('id, purchase_date, large_quantity, small_quantity, large_unit_price, small_unit_price, total_cost, supplier, notes')
          .eq('id', purchaseId)
          .eq('vendor_id', this.vendorId)
          .maybeSingle();
        if (verifyError) throw new Error(`The update request completed, but verification failed: ${verifyError.message} (code: ${verifyError.code || 'unknown'})`);
        if (!verifiedRow) throw new Error('No matching stock purchase was returned after update. Check that the record belongs to this cart and that the stock_purchases UPDATE policy allows this user to edit it.');
      } else {
        const { error } = await client.from('stock_purchases').insert(payload);
        if (error) throw error;
      }
      this.message = this.editingStockPurchaseId ? 'Stock purchase updated successfully.' : 'Stock purchase saved. Total cost is calculated from the Large and Small quantities and their unit prices.';
      this.resetStockPurchaseDraft();
      await this.recalculateStockBalances();
      await this.loadEntries();
      await this.loadStockPurchases();
    } catch (e) {
      const raw = e instanceof Error ? e.message : String(e);
      console.error('[Stock Purchases] Save/update failed:', e);
      if (/failed to fetch|networkerror|fetch failed|aborted|timeout/i.test(raw)) {
        this.error = 'The Stock Purchases request did not receive a response from Supabase (network/timeout). Check the failed stock_purchases request in DevTools → Network. If the request is blocked before a status code appears, check browser extensions, VPN/firewall, and Supabase availability. No success is reported unless the saved row is verified.';
      } else {
        this.error = raw;
      }
    } finally { this.busy = false; }
  }
  async deleteStockPurchase(purchase: StockPurchase): Promise<void> {
    if (!purchase.id || !this.vendorId) return;
    if (!confirm(`Delete stock purchase on ${purchase.purchase_date}?`)) return;
    this.busy = true; try { const { error } = await this.requireClient().from('stock_purchases').delete().eq('id', purchase.id).eq('vendor_id', this.vendorId); if (error) throw error; await this.recalculateStockBalances(); await this.loadEntries(); await this.loadStockPurchases(); this.message = 'Stock purchase deleted.'; } catch (e) { this.error = this.errMsg(e); } finally { this.busy = false; }
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
      await this.recalculateStockBalances();
      this.message = `Daily entry for ${e.entry_date} was deleted.`;
      await this.loadEntries();
    } catch (err) { this.error = this.errMsg(err); }
    finally { this.busy = false; }
  }
  canEditEntry(_e: Entry): boolean { return this.role === 'admin' || this.role === 'manager'; }
  largeSalesFor(e: Entry): number { return Number(e.large_sales ?? Number(e.sold_large || 0) * Number(e.large_price ?? this.settings.large_price)); }
  smallSalesFor(e: Entry): number { return Number(e.small_sales ?? Number(e.sold_small || 0) * Number(e.small_price ?? this.settings.small_price)); }
  salesFor(e: Entry): number { return this.largeSalesFor(e) + this.smallSalesFor(e); }
  onOverviewPeriodChange(): void { this.calculateReport(); }
  onReportPeriodChange(): void { this.calculateReport(); }
  onOverviewDateChange(): void { this.calculateReport(); }
  onReportDateChange(): void { this.calculateReport(); }
  calculateReport(): void {
    const list = this.entriesForSelection('report');
    this.report = list.reduce((acc, e) => ({
      sales: acc.sales + this.salesFor(e),
      staff: acc.staff + Number(e.staff_share ?? (this.largeSalesFor(e) * this.settings.large_staff_pct / 100 + this.smallSalesFor(e) * this.settings.small_staff_pct / 100)),
      gap: acc.gap + Number(e.cost_gap || 0), misc: acc.misc + Number(e.miscellaneous_expenses || 0), paid: acc.paid + Number(e.staff_paid_today || 0)
    }), { sales: 0, staff: 0, gap: 0, misc: 0, paid: 0 });
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

  downloadTableExcel(tableId: string, filename: string): void {
    const table = document.getElementById(tableId) as HTMLTableElement | null;
    if (!table) { this.error = 'The table is not available to download. Please try again.'; return; }

    // Create a genuine .xlsx workbook (Office Open XML), without adding a runtime dependency.
    // Numeric/cost columns are exported as numeric cells with a right-aligned cell style.
    const rawRows = Array.from(table.rows).map((row) => Array.from(row.cells).map((cell) => ({
      text: (cell.textContent || '').replace(/\s+/g, ' ').trim(),
      header: cell.tagName.toLowerCase() === 'th'
    })));
    // The Entry history Actions column is for in-app controls only and must never be exported.
    const actionColumnIndex = ['historyTable', 'stockPurchaseTable', 'fixedCostTable'].includes(tableId)
      ? (rawRows.find((row) => row.some((cell) => cell.header)) || []).findIndex((cell) => /^(actions?)$/i.test(cell.text))
      : -1;
    const rows = actionColumnIndex >= 0
      ? rawRows.map((row) => row.filter((_cell, index) => index !== actionColumnIndex))
      : rawRows;
    if (!rows.length) { this.error = 'There is no table data to download.'; return; }
    const headerRow = rows.find((row) => row.some((cell) => cell.header)) || rows[0];
    const numericColumn = (index: number): boolean => {
      const label = (headerRow[index]?.text || '').toLowerCase();
      return /\b(qty|quantity|sold|sales|stock|cost|price|payment|received|difference|profit|expense|expenses|staff share|staff took|opening|closing|large|small|amount|total)\b|₹|\(rs\.?\)/i.test(label);
    };
    const xmlEscape = (value: string): string => value.replace(/&/g, '&amp;').replace(/</g, '&lt;').replace(/>/g, '&gt;').replace(/\"/g, '&quot;').replace(/'/g, '&apos;');
    const columnName = (number: number): string => {
      let n = number + 1, name = '';
      while (n > 0) { const rem = (n - 1) % 26; name = String.fromCharCode(65 + rem) + name; n = Math.floor((n - 1) / 26); }
      return name;
    };
    const worksheetRows = rows.map((row, r) => `<row r="${r + 1}">${row.map((cell, c) => {
      const ref = `${columnName(c)}${r + 1}`;
      if (r > 0 && numericColumn(c)) {
        const cleaned = cell.text.replace(/[₹$,\s]/g, '').replace(/,/g, '');
        const numeric = cleaned !== '' && /^-?\d+(?:\.\d+)?$/.test(cleaned) ? Number(cleaned) : NaN;
        if (Number.isFinite(numeric)) return `<c r="${ref}" s="2"><v>${numeric}</v></c>`;
        // Keep combined values such as "2,376 / 1,980" as text, but apply the same right alignment.
        return `<c r="${ref}" t="inlineStr" s="2"><is><t xml:space="preserve">${xmlEscape(cell.text)}</t></is></c>`;
      }
      const style = cell.header ? '1' : '0';
      return `<c r="${ref}" t="inlineStr" s="${style}"><is><t xml:space="preserve">${xmlEscape(cell.text)}</t></is></c>`;
    }).join('')}</row>`).join('');
    const maxCol = Math.max(...rows.map((row) => row.length));
    const lastCell = `${columnName(Math.max(0, maxCol - 1))}${rows.length}`;
    const files: Array<{ name: string; content: string }> = [
      { name: '[Content_Types].xml', content: '<?xml version="1.0" encoding="UTF-8" standalone="yes"?><Types xmlns="http://schemas.openxmlformats.org/package/2006/content-types"><Default Extension="rels" ContentType="application/vnd.openxmlformats-package.relationships+xml"/><Default Extension="xml" ContentType="application/xml"/><Override PartName="/xl/workbook.xml" ContentType="application/vnd.openxmlformats-officedocument.spreadsheetml.sheet.main+xml"/><Override PartName="/xl/worksheets/sheet1.xml" ContentType="application/vnd.openxmlformats-officedocument.spreadsheetml.worksheet+xml"/><Override PartName="/xl/styles.xml" ContentType="application/vnd.openxmlformats-officedocument.spreadsheetml.styles+xml"/></Types>' },
      { name: '_rels/.rels', content: '<?xml version="1.0" encoding="UTF-8" standalone="yes"?><Relationships xmlns="http://schemas.openxmlformats.org/package/2006/relationships"><Relationship Id="rId1" Type="http://schemas.openxmlformats.org/officeDocument/2006/relationships/officeDocument" Target="xl/workbook.xml"/></Relationships>' },
      { name: 'xl/workbook.xml', content: '<?xml version="1.0" encoding="UTF-8" standalone="yes"?><workbook xmlns="http://schemas.openxmlformats.org/spreadsheetml/2006/main" xmlns:r="http://schemas.openxmlformats.org/officeDocument/2006/relationships"><sheets><sheet name="Icy Popps" sheetId="1" r:id="rId1"/></sheets></workbook>' },
      { name: 'xl/_rels/workbook.xml.rels', content: '<?xml version="1.0" encoding="UTF-8" standalone="yes"?><Relationships xmlns="http://schemas.openxmlformats.org/package/2006/relationships"><Relationship Id="rId1" Type="http://schemas.openxmlformats.org/officeDocument/2006/relationships/worksheet" Target="worksheets/sheet1.xml"/><Relationship Id="rId2" Type="http://schemas.openxmlformats.org/officeDocument/2006/relationships/styles" Target="styles.xml"/></Relationships>' },
      { name: 'xl/styles.xml', content: '<?xml version="1.0" encoding="UTF-8" standalone="yes"?><styleSheet xmlns="http://schemas.openxmlformats.org/spreadsheetml/2006/main"><fonts count="2"><font><sz val="11"/><name val="Calibri"/></font><font><b/><sz val="11"/><name val="Calibri"/></font></fonts><fills count="2"><fill><patternFill patternType="none"/></fill><fill><patternFill patternType="gray125"/></fill></fills><borders count="1"><border><left/><right/><top/><bottom/><diagonal/></border></borders><cellStyleXfs count="1"><xf numFmtId="0" fontId="0" fillId="0" borderId="0"/></cellStyleXfs><cellXfs count="3"><xf numFmtId="0" fontId="0" fillId="0" borderId="0" xfId="0"/><xf numFmtId="0" fontId="1" fillId="0" borderId="0" xfId="0"/><xf numFmtId="0" fontId="0" fillId="0" borderId="0" xfId="0" applyAlignment="1"><alignment horizontal="right"/></xf></cellXfs><cellStyles count="1"><cellStyle name="Normal" xfId="0" builtinId="0"/></cellStyles></styleSheet>' },
      { name: 'xl/worksheets/sheet1.xml', content: `<?xml version="1.0" encoding="UTF-8" standalone="yes"?><worksheet xmlns="http://schemas.openxmlformats.org/spreadsheetml/2006/main"><dimension ref="A1:${lastCell}"/><sheetViews><sheetView workbookViewId="0"/></sheetViews><sheetFormatPr defaultRowHeight="15"/><sheetData>${worksheetRows}</sheetData><autoFilter ref="A1:${lastCell}"/></worksheet>` }
    ];
    const blob = new Blob([this.makeStoredZip(files)], { type: 'application/vnd.openxmlformats-officedocument.spreadsheetml.sheet' });
    const url = URL.createObjectURL(blob);
    const link = document.createElement('a');
    link.href = url; link.download = `${filename}.xlsx`; link.style.display = 'none';
    document.body.appendChild(link); link.click(); link.remove();
    window.setTimeout(() => URL.revokeObjectURL(url), 1000);
  }

  private makeStoredZip(files: Array<{ name: string; content: string }>): Uint8Array {
    const encoder = new TextEncoder();
    const localParts: Uint8Array[] = [];
    const centralParts: Uint8Array[] = [];
    let offset = 0;
    const u16 = (view: DataView, at: number, value: number) => view.setUint16(at, value, true);
    const u32 = (view: DataView, at: number, value: number) => view.setUint32(at, value >>> 0, true);
    const crc32 = (bytes: Uint8Array): number => {
      let crc = 0xffffffff;
      for (const byte of bytes) { crc ^= byte; for (let k = 0; k < 8; k++) crc = (crc >>> 1) ^ ((crc & 1) ? 0xedb88320 : 0); }
      return (crc ^ 0xffffffff) >>> 0;
    };
    for (const file of files) {
      const name = encoder.encode(file.name), data = encoder.encode(file.content), crc = crc32(data);
      const local = new Uint8Array(30 + name.length), lv = new DataView(local.buffer);
      u32(lv, 0, 0x04034b50); u16(lv, 4, 20); u16(lv, 6, 0x0800); u16(lv, 8, 0);
      u16(lv, 10, 0); u16(lv, 12, 0); u32(lv, 14, crc); u32(lv, 18, data.length); u32(lv, 22, data.length);
      u16(lv, 26, name.length); u16(lv, 28, 0); local.set(name, 30);
      localParts.push(local, data);
      const central = new Uint8Array(46 + name.length), cv = new DataView(central.buffer);
      u32(cv, 0, 0x02014b50); u16(cv, 4, 20); u16(cv, 6, 20); u16(cv, 8, 0x0800); u16(cv, 10, 0);
      u16(cv, 12, 0); u16(cv, 14, 0); u32(cv, 16, crc); u32(cv, 20, data.length); u32(cv, 24, data.length);
      u16(cv, 28, name.length); u16(cv, 30, 0); u16(cv, 32, 0); u16(cv, 34, 0); u16(cv, 36, 0); u32(cv, 38, 0); u32(cv, 42, offset); central.set(name, 46);
      centralParts.push(central); offset += local.length + data.length;
    }
    const centralSize = centralParts.reduce((sum, part) => sum + part.length, 0);
    const end = new Uint8Array(22), ev = new DataView(end.buffer);
    u32(ev, 0, 0x06054b50); u16(ev, 4, 0); u16(ev, 6, 0); u16(ev, 8, files.length); u16(ev, 10, files.length);
    u32(ev, 12, centralSize); u32(ev, 16, offset); u16(ev, 20, 0);
    const total = offset + centralSize + end.length, result = new Uint8Array(total);
    let cursor = 0;
    for (const part of localParts) { result.set(part, cursor); cursor += part.length; }
    for (const part of centralParts) { result.set(part, cursor); cursor += part.length; }
    result.set(end, cursor);
    return result;
  }

  downloadTablePdf(tableId: string, title: string): void {
    const table = document.getElementById(tableId) as HTMLTableElement | null;
    if (!table) { this.error = 'The table is not available to download. Please try again.'; return; }
    const printWindow = window.open('', '_blank', 'width=1000,height=750');
    if (!printWindow) {
      this.error = 'Your browser blocked the PDF print window. Please allow pop-ups for this app and try again.';
      return;
    }
    const safeTitle = title.replace(/[&<>"']/g, (ch) => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;' }[ch] || ch));
    // Clone the table and align numeric/cost columns by their header text for PDF/print output.
    const printableTable = table.cloneNode(true) as HTMLTableElement;
    // Keep row action controls out of downloaded PDFs; they are useful only inside the app.
    if (['historyTable', 'stockPurchaseTable'].includes(tableId)) {
      const headerRow = printableTable.querySelector('thead tr') as HTMLTableRowElement | null;
      const actionIndex = headerRow
        ? Array.from(headerRow.cells).findIndex((cell: HTMLTableCellElement) => /^(actions?)$/i.test((cell.textContent || '').trim()))
        : -1;
      if (actionIndex >= 0) {
        Array.from(printableTable.rows).forEach((row) => {
          if (row.cells.length > actionIndex) row.deleteCell(actionIndex);
        });
      }
    }
    const headerCells = Array.from(printableTable.querySelectorAll('thead tr:first-child th'));
    const numericHeader = /\b(qty|quantity|sold|sales|stock|cost|price|payment|payments|online|offline|received|rcvd|difference|profit|expense|expenses|staff share|staff took|opening|closing|large|small|amount|total|misc\.)\b|₹|\(rs\.?\)/i;
    const rightAlignedColumns = new Set<number>();
    headerCells.forEach((cell, index) => {
      if (numericHeader.test((cell.textContent || '').trim())) rightAlignedColumns.add(index);
    });
    Array.from(printableTable.rows).forEach((row) => Array.from(row.cells).forEach((cell, index) => {
      if (rightAlignedColumns.has(index)) cell.style.textAlign = 'right';
      else cell.style.textAlign = 'left';
      if (rightAlignedColumns.has(index)) cell.style.fontVariantNumeric = 'tabular-nums';
    }));
    printWindow.document.open();
    printWindow.document.write(`<!DOCTYPE html><html><head><meta charset="UTF-8"><title>${safeTitle}</title><style>
      @page { size: landscape; margin: 12mm; } body { font-family: Arial, sans-serif; color: #222; padding: 12px; }
      h1 { font-size: 18px; margin: 0 0 6px; } p { color: #555; font-size: 10px; margin: 0 0 14px; }
      table { border-collapse: collapse; width: 100%; font-size: 9px; } th, td { border: 1px solid #ccc; padding: 5px; vertical-align: top; }
      th { background: #f3e5d0; font-weight: bold; } tfoot th { background: #eee; } tr { break-inside: avoid; }
      </style></head><body><h1>${safeTitle}</h1><p>Generated on ${new Date().toLocaleString()}</p>${printableTable.outerHTML}<script>window.onload = function(){ window.focus(); window.print(); };<\/script></body></html>`);
    printWindow.document.close();
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

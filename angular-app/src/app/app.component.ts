/**
 * AppComponent — the outer shell
 * ================================
 * Owns the sidebar filter controls and the layout grid.
 * Passes the active filter state down to DashboardComponent.
 *
 * Filter flow:
 *   User changes a control in the sidebar
 *     → applyFilters() builds a new FilterParams object
 *       → activeFilters signal updates
 *         → [filters] input on DashboardComponent updates
 *           → each ChartComponent.ngOnChanges() fires
 *             → each chart re-fetches from FastAPI with the new params
 */

import { Component, signal, computed, inject, OnInit } from '@angular/core';
import { CommonModule } from '@angular/common';
import { FormsModule } from '@angular/forms';
import { DashboardComponent } from './dashboard/dashboard.component';
import {
  ReportingService, FilterParams, ServicerOption
} from './shared/reporting.service';

@Component({
  selector: 'app-root',
  standalone: true,
  imports: [CommonModule, FormsModule, DashboardComponent],
  template: `
    <div class="shell">

      <!-- ── Sidebar ─────────────────────────────────────────────── -->
      <aside class="sidebar">

        <div class="sidebar-logo">
          <div class="logo-mark">ERA<span>P</span></div>
          <div class="logo-sub">Reporting Platform</div>
        </div>

        <div class="filter-section">
          <div class="filter-section-title">Filters</div>

          <!--
            Servicer Number dropdown
            Items come from GET /api/filters/servicers
            which reads unique (servicer_number, servicer_name) from the CSV.
          -->
          <div class="filter-field">
            <label>Servicer Number</label>
            <select [(ngModel)]="selectedNumber">
              <option [ngValue]="null">— All servicers —</option>
              <option
                *ngFor="let s of servicerOptions()"
                [ngValue]="s.servicer_number"
              >
                {{ s.servicer_number }}
              </option>
            </select>
          </div>

          <!--
            Servicer Name text input
            FastAPI does a case-insensitive substring match on this.
            Debounced 400ms so we don't fire on every keystroke.
          -->
          <div class="filter-field">
            <label>Servicer Name (contains)</label>
            <input
              type="text"
              [(ngModel)]="nameSearch"
              placeholder="e.g. Apex"
              (input)="onNameInput()"
            />
          </div>

          <div class="filter-field">
            <label>Start Date</label>
            <input type="date" [(ngModel)]="startDate" (change)="applyFilters()" />
          </div>

          <div class="filter-field">
            <label>End Date</label>
            <input type="date" [(ngModel)]="endDate" (change)="applyFilters()" />
          </div>

          <button class="btn-apply" (click)="applyFilters()">Apply Filters</button>
          <button class="btn-reset" (click)="resetFilters()">Reset</button>
        </div>

      </aside>

      <!-- ── Topbar ──────────────────────────────────────────────── -->
      <header class="topbar">
        <span class="topbar-title">Operations Dashboard</span>
        <div class="topbar-spacer"></div>
        <div class="topbar-status">
          <div class="status-dot"></div>
          API connected · localhost:8000
        </div>
      </header>

      <!-- ── Main — hosts the reporting MFE ─────────────────────── -->
      <main class="main-area">
        <!--
          activeFilters() is passed down as @Input.
          When it changes, DashboardComponent and all ChartComponents
          re-fetch their data from FastAPI automatically.
        -->
        <app-dashboard [filters]="activeFilters()" />
      </main>

    </div>
  `,
})
export class AppComponent implements OnInit {
  private svc = inject(ReportingService);

  // ── Servicer dropdown ────────────────────────────────────────────
  servicerOptions = signal<ServicerOption[]>([]);

  // ── Raw filter control values ────────────────────────────────────
  selectedNumber: string | null = null;
  nameSearch  = '';
  startDate   = '';
  endDate     = '';

  // ── Committed filter state (only updates on Apply or dropdown change) ──
  // This is what flows down to all charts as their @Input.
  activeFilters = signal<FilterParams>({});

  private nameDebounce: ReturnType<typeof setTimeout> | null = null;

  ngOnInit(): void {
    // Load the servicer dropdown once at startup.
    // Calls GET /api/filters/servicers
    this.svc.getServicers().subscribe({
      next:  (res) => this.servicerOptions.set(res.items),
      error: (err) => console.error('Could not load servicers:', err.message),
    });
  }

  /**
   * Called by every filter control on change.
   * Builds a new FilterParams object and updates the signal.
   * The signal change propagates to [filters] on DashboardComponent,
   * which propagates to each ChartComponent's ngOnChanges().
   */
  applyFilters(): void {
    const f: FilterParams = {};
    if (this.selectedNumber)     f.servicer_number = this.selectedNumber;
    if (this.nameSearch.trim())  f.servicer_name   = this.nameSearch.trim();
    if (this.startDate)          f.start_date      = this.startDate;
    if (this.endDate)            f.end_date        = this.endDate;
    this.activeFilters.set(f);
  }

  /** Debounce text input so we don't fire a request on every keystroke. */
  onNameInput(): void {
    if (this.nameDebounce) clearTimeout(this.nameDebounce);
    this.nameDebounce = setTimeout(() => this.applyFilters(), 400);
  }

  resetFilters(): void {
    this.selectedNumber = null;
    this.nameSearch     = '';
    this.startDate      = '';
    this.endDate        = '';
    this.applyFilters();
  }
}

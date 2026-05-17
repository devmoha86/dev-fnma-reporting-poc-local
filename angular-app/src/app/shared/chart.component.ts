/**
 * ChartComponent
 * ==============
 * Generic reusable chart host.
 * Pass it a `slug` (which endpoint to call) and `filters` (query params).
 * It fetches from FastAPI and hands the response to Plotly.react().
 *
 * Usage in a parent template:
 *   <app-chart slug="delinquency-trend" [filters]="activeFilters" />
 *   <app-chart slug="loan-by-region"    [filters]="activeFilters" />
 *
 * When `filters` changes (user picks a servicer), Angular calls ngOnChanges()
 * which re-fetches from FastAPI and re-renders the chart automatically.
 */

import {
  Component, Input, OnChanges, SimpleChanges,
  ViewChild, ElementRef, ChangeDetectorRef, inject
} from '@angular/core';
import { CommonModule } from '@angular/common';
import {
  ReportingService, FilterParams, ChartPayload
} from '../shared/reporting.service';

// Plotly is loaded from CDN in index.html — declare it so TypeScript is happy
declare const Plotly: any;

@Component({
  selector: 'app-chart',
  standalone: true,
  imports: [CommonModule],
  template: `
    <div class="chart-card" [class.wide]="wide">

      <!-- Card title bar -->
      <div class="chart-card-title">
        <span>{{ payload?.title || slug }}</span>
      </div>

      <!-- Loading shimmer (shown while waiting for FastAPI response) -->
      <div class="shimmer" *ngIf="loading && !error"></div>

      <!-- Error message (shown if the HTTP call fails) -->
      <div class="chart-error" *ngIf="error">
        ⚠ Could not load chart<br>
        <small>{{ error }}</small><br>
        <small style="color:var(--dim)">Is the FastAPI server running on :8000?</small>
      </div>

      <!--
        The native div that Plotly writes into.
        Hidden while loading to avoid Plotly measuring a zero-size element.
      -->
      <div #host
           class="chart-host"
           [style.display]="payload && !loading ? 'block' : 'none'">
      </div>

    </div>
  `,
})
export class ChartComponent implements OnChanges {

  /** Which FastAPI endpoint to call. Matches keys in the service. */
  @Input() slug!: 'delinquency-trend' | 'loan-by-region' | 'portfolio-balance' | 'status-distribution';

  /** Filter params from the parent — triggers a re-fetch on every change. */
  @Input() filters: FilterParams = {};

  /** Set to true to make this chart span both grid columns. */
  @Input() wide = false;

  /** The native div Plotly renders into. */
  @ViewChild('host') hostEl!: ElementRef<HTMLDivElement>;

  private svc = inject(ReportingService);
  private cdr = inject(ChangeDetectorRef);

  payload: ChartPayload | null = null;
  loading = true;
  error: string | null = null;

  /**
   * Angular calls this whenever @Input() values change.
   * That means every filter change from the sidebar triggers a re-fetch.
   */
  ngOnChanges(changes: SimpleChanges): void {
    if (changes['slug'] || changes['filters']) {
      this.fetch();
    }
  }

  private fetch(): void {
    this.loading = true;
    this.error   = null;
    this.payload = null;

    // Pick the right service method based on the slug
    const call$ = this.slug === 'delinquency-trend'   ? this.svc.getDelinquencyTrend(this.filters)
                : this.slug === 'loan-by-region'       ? this.svc.getLoanByRegion(this.filters)
                : this.slug === 'portfolio-balance'    ? this.svc.getPortfolioBalance(this.filters)
                : this.svc.getStatusDistribution(this.filters);

    call$.subscribe({
      next: (payload) => {
        this.payload = payload;
        this.loading = false;
        // Flush Angular's change detection so the host div becomes visible,
        // THEN ask Plotly to render into it.
        this.cdr.detectChanges();
        setTimeout(() => this.render(payload), 0);
      },
      error: (err) => {
        this.error   = err.message ?? 'Unknown error';
        this.loading = false;
        this.cdr.detectChanges();
      },
    });
  }

  private render(payload: ChartPayload): void {
    if (!this.hostEl?.nativeElement) return;

    /**
     * Plotly.react() is like React's reconciler — it diffs the existing
     * chart and animates to the new data instead of tearing down and
     * rebuilding. Use this instead of Plotly.newPlot() when filters change.
     */
    Plotly.react(
      this.hostEl.nativeElement,
      payload.traces,
      {
        ...payload.layout,
        height:     280,
        responsive: true,
      },
      {
        displayModeBar: false,  // hide the Plotly toolbar
        responsive:     true,
      }
    );
  }
}

/**
 * DashboardComponent
 * ==================
 * The main reporting view.
 * Receives `filters` from the shell (AppComponent) as an @Input().
 * Passes them down to each chart and the KPI summary.
 *
 * Layout:
 *   KPI row: 4 metric cards (total loans, delinquency %, balance, servicers)
 *   Chart row 1: line chart (delinquency trend) | bar chart (loan by region)
 *   Chart row 2: horizontal bar (portfolio balance) | donut (status dist.)
 */

import {
  Component, Input, OnInit, OnChanges, SimpleChanges, inject, signal
} from '@angular/core';
import { CommonModule } from '@angular/common';
import { ChartComponent } from '../shared/chart.component';
import { NlqPanelComponent } from '../shared/nlq-panel.component';
import {
  ReportingService, FilterParams, KpiSummary
} from '../shared/reporting.service';

@Component({
  selector: 'app-dashboard',
  standalone: true,
  imports: [CommonModule, ChartComponent, NlqPanelComponent],
  template: `
    <!-- KPI cards row ─────────────────────────────────────────────── -->
    <div class="kpi-row" *ngIf="kpi()">
      <div class="kpi-card">
        <button type="button" class="nlq-card-btn" (click)="openNlqChat('kpi-total-loans', 'KPI Total Loans')">Ask NLQ</button>
        <div class="kpi-label">Total Loans</div>
        <div class="kpi-value">{{ kpi()!.total_loans | number }}</div>
        <div class="kpi-sub">across {{ kpi()!.servicer_count }} servicer(s)</div>
      </div>

      <div class="kpi-card">
        <button type="button" class="nlq-card-btn" (click)="openNlqChat('kpi-avg-delinquency', 'KPI Avg Delinquency')">Ask NLQ</button>
        <div class="kpi-label">Avg Delinquency</div>
        <div class="kpi-value">{{ kpi()!.avg_delinquency_rate | number:'1.1-2' }}%</div>
        <div class="kpi-sub">portfolio-wide, latest date</div>
      </div>

      <div class="kpi-card">
        <button type="button" class="nlq-card-btn" (click)="openNlqChat('kpi-portfolio-balance', 'KPI Portfolio Balance')">Ask NLQ</button>
        <div class="kpi-label">Portfolio Balance</div>
        <div class="kpi-value">\${{ kpi()!.total_balance_usd | number:'1.0-0' }}M</div>
        <div class="kpi-sub">USD, as of {{ kpi()!.as_of_date }}</div>
      </div>

      <div class="kpi-card">
        <button type="button" class="nlq-card-btn" (click)="openNlqChat('kpi-status', 'KPI Status')">Ask NLQ</button>
        <div class="kpi-label">Status</div>
        <div class="kpi-value" style="display:flex; gap:10px; align-items:baseline;">
          <span class="status-pill GREEN">{{ kpi()!.status_counts.GREEN }}</span>
          <span class="status-pill YELLOW">{{ kpi()!.status_counts.YELLOW }}</span>
          <span class="status-pill RED">{{ kpi()!.status_counts.RED }}</span>
        </div>
        <div class="kpi-sub">GREEN / YELLOW / RED servicers</div>
      </div>
    </div>

    <!-- KPI loading skeleton -->
    <div class="kpi-row" *ngIf="!kpi()">
      <div class="kpi-card shimmer" style="height:80px"></div>
      <div class="kpi-card shimmer" style="height:80px"></div>
      <div class="kpi-card shimmer" style="height:80px"></div>
      <div class="kpi-card shimmer" style="height:80px"></div>
    </div>

    <!-- 4 charts ───────────────────────────────────────────────────── -->
    <div class="chart-grid">

      <!--
        Each app-chart component:
        - fetches from the FastAPI endpoint named by 'slug'
        - re-fetches automatically when [filters] changes
      -->
      <app-chart
        slug="delinquency-trend"
        chartId="delinquency-trend"
        [filters]="filters"
        (askNlq)="openNlqChat($event.chartId, $event.title)"
      />
      <app-chart
        slug="loan-by-region"
        chartId="loan-by-region"
        [filters]="filters"
        (askNlq)="openNlqChat($event.chartId, $event.title)"
      />
      <app-chart
        slug="portfolio-balance"
        chartId="portfolio-balance"
        [filters]="filters"
        (askNlq)="openNlqChat($event.chartId, $event.title)"
      />
      <app-chart
        slug="status-distribution"
        chartId="status-distribution"
        [filters]="filters"
        (askNlq)="openNlqChat($event.chartId, $event.title)"
      />

    </div>

    <app-nlq-panel
      [isOpen]="nlqOpen"
      [chartId]="activeNlqChartId"
      [panelTitle]="activeNlqTitle"
      [activeFilters]="filters"
      [userName]="'Analyst'"
      (closed)="nlqOpen = false"
    />
  `,
})
export class DashboardComponent implements OnInit, OnChanges {

  /** Filter state from the shell — changes trigger re-fetch in every chart */
  @Input() filters: FilterParams = {};

  private svc = inject(ReportingService);
  kpi = signal<KpiSummary | null>(null);
  nlqOpen = false;
  activeNlqChartId = 'delinquency-trend';
  activeNlqTitle = 'Delinquency Rate Trend (%)';

  ngOnInit(): void { this.loadKpi(); }

  ngOnChanges(changes: SimpleChanges): void {
    if (changes['filters'] && !changes['filters'].firstChange) {
      this.loadKpi();
    }
  }

  private loadKpi(): void {
    this.kpi.set(null);
    this.svc.getKpiSummary(this.filters).subscribe({
      next:  (k) => this.kpi.set(k),
      error: ()  => {},   // KPI failure is non-fatal; charts still render
    });
  }

  openNlqChat(chartId: string, title: string): void {
    this.activeNlqChartId = chartId;
    this.activeNlqTitle = title;
    this.nlqOpen = true;
  }
}

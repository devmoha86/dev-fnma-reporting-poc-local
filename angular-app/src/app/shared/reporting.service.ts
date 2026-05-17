/**
 * ReportingService
 * ================
 * The single point of communication between Angular and the FastAPI backend.
 * Components inject this service — they never call HttpClient directly.
 *
 * API base URL comes from environment.ts.
 * On office laptop:   http://localhost:8000
 * On Codespaces:      https://<name>-8000.<domain>  (patched by start-frontend.sh)
 */

import { Injectable, inject } from '@angular/core';
import { HttpClient, HttpParams } from '@angular/common/http';
import { Observable } from 'rxjs';
import { environment } from '../../environments/environment';

// ── Response types matching FastAPI endpoint shapes ───────────────────────

export interface ServicerOption {
  servicer_number: string;
  servicer_name: string;
}

/** Shape returned by every /api/charts/* endpoint */
export interface ChartPayload {
  chartType: 'line' | 'bar' | 'pie';
  title: string;
  traces: any[];   // Plotly trace objects → passed directly to Plotly.react()
  layout: any;     // Plotly layout object → passed directly to Plotly.react()
}

/** Shape returned by /api/kpi-summary */
export interface KpiSummary {
  total_loans: number;
  avg_delinquency_rate: number;  // already ×100 — show as percentage
  total_balance_usd: number;     // in USD millions
  servicer_count: number;
  status_counts: { GREEN: number; YELLOW: number; RED: number };
  as_of_date: string;
}

/**
 * Filter parameters — all optional.
 * buildParams() converts this object into a URL query string.
 */
export interface FilterParams {
  servicer_number?: string | null;
  servicer_name?: string;
  start_date?: string;
  end_date?: string;
}

// ── Service ───────────────────────────────────────────────────────────────

@Injectable({ providedIn: 'root' })
export class ReportingService {
  private http = inject(HttpClient);

  /**
   * API base URL — read from environment.ts.
   * Local:       http://localhost:8000
   * Codespaces:  https://<codespace-name>-8000.<forwarding-domain>
   */
  private readonly API = environment.apiUrl;

  /**
   * Converts FilterParams → Angular HttpParams (URL query string).
   * Only non-empty values are included.
   *
   * { servicer_number: 'SVC-001', servicer_name: '' }
   *   → ?servicer_number=SVC-001
   *
   * { servicer_number: 'SVC-001', start_date: '2026-04-01' }
   *   → ?servicer_number=SVC-001&start_date=2026-04-01
   */
  private buildParams(f: FilterParams): HttpParams {
    let p = new HttpParams();
    if (f.servicer_number)    p = p.set('servicer_number', f.servicer_number);
    if (f.servicer_name?.trim()) p = p.set('servicer_name', f.servicer_name.trim());
    if (f.start_date)         p = p.set('start_date', f.start_date);
    if (f.end_date)           p = p.set('end_date', f.end_date);
    return p;
  }

  // ── Endpoints ─────────────────────────────────────────────────────────

  /** Servicer dropdown — calls GET /api/filters/servicers */
  getServicers(): Observable<{ items: ServicerOption[] }> {
    return this.http.get<{ items: ServicerOption[] }>(
      `${this.API}/api/filters/servicers`
    );
  }

  /** KPI row — calls GET /api/kpi-summary */
  getKpiSummary(f: FilterParams): Observable<KpiSummary> {
    return this.http.get<KpiSummary>(
      `${this.API}/api/kpi-summary`,
      { params: this.buildParams(f) }
    );
  }

  /** LINE chart — GET /api/charts/delinquency-trend */
  getDelinquencyTrend(f: FilterParams): Observable<ChartPayload> {
    return this.http.get<ChartPayload>(
      `${this.API}/api/charts/delinquency-trend`,
      { params: this.buildParams(f) }
    );
  }

  /** GROUPED BAR chart — GET /api/charts/loan-by-region */
  getLoanByRegion(f: FilterParams): Observable<ChartPayload> {
    return this.http.get<ChartPayload>(
      `${this.API}/api/charts/loan-by-region`,
      { params: this.buildParams(f) }
    );
  }

  /** HORIZONTAL BAR chart — GET /api/charts/portfolio-balance */
  getPortfolioBalance(f: FilterParams): Observable<ChartPayload> {
    return this.http.get<ChartPayload>(
      `${this.API}/api/charts/portfolio-balance`,
      { params: this.buildParams(f) }
    );
  }

  /** DONUT chart — GET /api/charts/status-distribution */
  getStatusDistribution(f: FilterParams): Observable<ChartPayload> {
    return this.http.get<ChartPayload>(
      `${this.API}/api/charts/status-distribution`,
      { params: this.buildParams(f) }
    );
  }
}

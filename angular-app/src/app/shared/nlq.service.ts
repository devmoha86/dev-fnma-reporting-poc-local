import { Injectable, inject } from '@angular/core';
import { HttpClient } from '@angular/common/http';
import { Observable, of } from 'rxjs';
import { map } from 'rxjs/operators';
import { catchError } from 'rxjs/operators';
import { environment } from '../../environments/environment';
import { FilterParams } from './reporting.service';

export interface NlqSessionContext {
  userName: string;
  activeFilters: FilterParams;
}

export interface NlqContext {
  chart_id: string;
  title: string;
  system_prompt_context: string;
  api_endpoint: string;
  answerable_questions: string[];
}

export interface NlqQueryRequest {
  chart_id: string;
  user_query: string;
  active_filters?: FilterParams;
  session?: NlqSessionContext;
}

export interface NlqQueryResponse {
  chart_id: string;
  answer: string;
  context: NlqContext;
  applied_filters: FilterParams;
  summary: Record<string, unknown>;
}

@Injectable({ providedIn: 'root' })
export class NlqService {
  private http = inject(HttpClient);
  private readonly API = globalThis?.location ? '' : environment.apiUrl;
  private session: NlqSessionContext = {
    userName: 'Analyst',
    activeFilters: {},
  };

  setSessionContext(session: NlqSessionContext): void {
    this.session = session;
  }

  getContext(chartId: string): Observable<NlqContext> {
    return this.http.get<NlqContext>(`${this.API}/api/nlq/context/${chartId}`);
  }

  sendNlqQuery(payload: NlqQueryRequest): Observable<NlqQueryResponse> {
    return this.http.post<NlqQueryResponse>(`${this.API}/api/nlq/query`, {
      ...payload,
      session: payload.session ?? this.session,
      active_filters: payload.active_filters ?? this.session.activeFilters,
    });
  }

  getFallbackSuggestions(chartId: string): Observable<string[]> {
    return this.getContext(chartId).pipe(
      map((ctx) => ctx.answerable_questions ?? []),
      catchError(() =>
        of([
          'What changed recently in this chart?',
          'Which servicer appears most at risk?',
          'Summarize the top 3 insights for this view.',
        ])
      )
    );
  }
}

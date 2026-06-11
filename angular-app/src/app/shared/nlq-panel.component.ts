import { CommonModule } from '@angular/common';
import { Component, EventEmitter, Input, OnChanges, Output, SimpleChanges, inject } from '@angular/core';
import { FormsModule } from '@angular/forms';
import { NlqService } from './nlq.service';
import { FilterParams } from './reporting.service';

interface ChatMessage {
  role: 'user' | 'assistant';
  text: string;
}

@Component({
  selector: 'app-nlq-panel',
  standalone: true,
  imports: [CommonModule, FormsModule],
  template: `
    <section class="nlq-panel" [class.open]="isOpen">
      <header class="nlq-header">
        <div>
          <div class="nlq-eyebrow">Natural Language Query</div>
          <h3>{{ panelTitle }}</h3>
        </div>
        <button type="button" class="nlq-close" (click)="closed.emit()">Close</button>
      </header>

      <div class="nlq-suggestions" *ngIf="suggestions.length > 0">
        <button
          *ngFor="let s of suggestions"
          type="button"
          class="nlq-chip"
          (click)="useSuggestion(s)"
        >
          {{ s }}
        </button>
      </div>

      <div class="nlq-chat-window">
        <div class="nlq-empty" *ngIf="messages.length === 0">
          Ask a question about this chart or KPI.
        </div>
        <div class="nlq-msg" *ngFor="let m of messages" [class.user]="m.role === 'user'">
          <span class="nlq-role">{{ m.role === 'user' ? 'You' : 'NLQ' }}</span>
          <p>{{ m.text }}</p>
        </div>
        <div class="nlq-loading" *ngIf="loading">Thinking...</div>
      </div>

      <form class="nlq-input" (ngSubmit)="submit()">
        <textarea
          [(ngModel)]="draft"
          name="draft"
          rows="3"
          placeholder="e.g. Which servicer has the highest delinquency trend and why?"
        ></textarea>
        <button type="submit" [disabled]="loading || !draft.trim()">Send</button>
      </form>
    </section>
  `,
})
export class NlqPanelComponent implements OnChanges {
  @Input() isOpen = false;
  @Input() chartId = 'delinquency-trend';
  @Input() panelTitle = 'Chart Assistant';
  @Input() activeFilters: FilterParams = {};
  @Input() userName = 'Analyst';

  @Output() closed = new EventEmitter<void>();

  private nlq = inject(NlqService);

  draft = '';
  loading = false;
  suggestions: string[] = [];
  messages: ChatMessage[] = [];

  ngOnChanges(changes: SimpleChanges): void {
    if (changes['chartId'] && this.chartId) {
      this.messages = [];
      this.loadSuggestions();
    }
  }

  useSuggestion(s: string): void {
    this.draft = s;
  }

  submit(): void {
    const userQuery = this.draft.trim();
    if (!userQuery || this.loading) return;

    this.messages.push({ role: 'user', text: userQuery });
    this.draft = '';
    this.loading = true;

    this.nlq.setSessionContext({
      userName: this.userName,
      activeFilters: this.activeFilters,
    });

    this.nlq.sendNlqQuery({
      chart_id: this.chartId,
      user_query: userQuery,
      active_filters: this.activeFilters,
    }).subscribe({
      next: (res) => {
        this.messages.push({ role: 'assistant', text: res.answer || 'No response generated.' });
        this.loading = false;
      },
      error: (err) => {
        const detail = err?.error?.detail || err.message || 'Unknown error';
        this.messages.push({ role: 'assistant', text: `Unable to answer right now: ${detail}` });
        this.loading = false;
      }
    });
  }

  private loadSuggestions(): void {
    this.suggestions = [];
    this.nlq.getContext(this.chartId).subscribe({
      next: (ctx) => {
        this.suggestions = ctx.answerable_questions || [];
      },
      error: () => {
        this.suggestions = [
          'Summarize this chart in 3 points.',
          'What is the top risk signal here?',
          'What should I monitor next week?',
        ];
      },
    });
  }
}

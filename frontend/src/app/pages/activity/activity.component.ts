import { Component, OnInit, inject, signal } from '@angular/core';
import { DatePipe } from '@angular/common';
import { FormsModule } from '@angular/forms';
import { ApiService } from '../../services/api.service';
import { ActivityItem, ActivitySummary } from '../../services/models';
import { FolderChipComponent } from '../../components/folder-chip/folder-chip.component';
import { UrgentBadgeComponent } from '../../components/urgent-badge/urgent-badge.component';
import { RevealDirective } from '../../directives/reveal.directive';
import { downloadCsv, downloadJson } from '../../services/download';

@Component({
  selector: 'app-activity',
  standalone: true,
  imports: [DatePipe, FormsModule, FolderChipComponent, UrgentBadgeComponent, RevealDirective],
  template: `
    <header class="head">
      <div>
        <span class="eyebrow">Activity Log</span>
        <h1>Everything tidemail sorted</h1>
        <p class="sub">A full record of every email processed — filter it, then download it.</p>
      </div>
      <div class="exports">
        <button class="btn btn-ghost" (click)="exportCsv()" [disabled]="exporting()">
          <svg viewBox="0 0 24 24" width="16" height="16" aria-hidden="true"><path d="M12 3v12m0 0 4-4m-4 4-4-4M5 21h14" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round"/></svg>
          CSV
        </button>
        <button class="btn btn-ghost" (click)="exportJson()" [disabled]="exporting()">
          <svg viewBox="0 0 24 24" width="16" height="16" aria-hidden="true"><path d="M12 3v12m0 0 4-4m-4 4-4-4M5 21h14" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round"/></svg>
          JSON
        </button>
        <button class="btn btn-danger" (click)="clearLog()" [disabled]="exporting()">Clear</button>
      </div>
    </header>

    @if (summary(); as s) {
      <div class="summary" reveal>
        <div class="sum-item card"><span class="sum-n">{{ s.total }}</span><span class="sum-l">Processed</span></div>
        <div class="sum-item card"><span class="sum-n ok">{{ s.sorted }}</span><span class="sum-l">Sorted</span></div>
        <div class="sum-item card"><span class="sum-n bad">{{ s.skipped }}</span><span class="sum-l">Skipped</span></div>
        <div class="sum-item card"><span class="sum-n urgent">{{ s.urgent }}</span><span class="sum-l">Urgent</span></div>
      </div>
    }

    <div class="filters card">
      <div class="field search-field">
        <label for="q">Search</label>
        <input id="q" class="input" placeholder="Sender or subject…" [ngModel]="query()" (ngModelChange)="onSearch($event)" />
      </div>
      <div class="field">
        <label for="folderFilter">Folder</label>
        <select id="folderFilter" class="select" [ngModel]="folder()" (ngModelChange)="onFilter('folder', $event)">
          <option value="">All folders</option>
          @for (name of folderNames(); track name) {
            <option [value]="name">{{ name }}</option>
          }
        </select>
      </div>
      <div class="field">
        <label for="since">From</label>
        <input id="since" class="input" type="date" [ngModel]="sinceDate()" (ngModelChange)="onFilter('since', $event)" />
      </div>
      <div class="field">
        <label for="until">To</label>
        <input id="until" class="input" type="date" [ngModel]="untilDate()" (ngModelChange)="onFilter('until', $event)" />
      </div>
      <label class="check">
        <input type="checkbox" [ngModel]="urgentOnly()" (ngModelChange)="onFilter('urgent', $event)" />
        Urgent only
      </label>
    </div>

    <div class="log card">
      @if (loading()) {
        @for (i of [1, 2, 3, 4, 5]; track i) {
          <div class="log-row"><span class="skeleton sk"></span></div>
        }
      } @else if (items().length === 0) {
        <div class="empty">
          <p class="empty-title">Nothing here yet</p>
          <p class="empty-sub">Processed emails will show up once tidemail runs.</p>
        </div>
      } @else {
        @for (item of items(); track item.id; let i = $index) {
          <div class="log-row" [class.log-row--error]="item.error" reveal [revealDelay]="i * 25">
            <div class="log-main">
              <div class="log-line1">
                <span class="sender">{{ item.sender_name || item.sender_address || 'Unknown' }}</span>
                @if (item.urgent) { <app-urgent-badge /> }
                @if (item.error) { <span class="err-tag">skipped</span> }
                <time class="ts">{{ item.timestamp | date: 'medium' }}</time>
              </div>
              <div class="subject">{{ item.subject }}</div>
              <div class="log-line3">
                <app-folder-chip [name]="item.folder" />
                @if (item.reasoning) {
                  <button class="reason-toggle" (click)="toggle(item.id)" [attr.aria-expanded]="expanded().has(item.id)">
                    {{ expanded().has(item.id) ? 'Hide reasoning' : 'Show reasoning' }}
                  </button>
                }
              </div>
              @if (expanded().has(item.id)) {
                <div class="reason">
                  <p class="reason-text">{{ item.reasoning }}</p>
                  @if (item.raw_response) {
                    <pre class="raw mono">{{ item.raw_response }}</pre>
                  }
                </div>
              }
            </div>
          </div>
        }
      }
    </div>

    @if (total() > pageSize) {
      <div class="pager">
        <button class="btn btn-ghost" (click)="prev()" [disabled]="page() === 1">Previous</button>
        <span class="pager-info">Page {{ page() }} of {{ totalPages() }} · {{ total() }} total</span>
        <button class="btn btn-ghost" (click)="next()" [disabled]="page() >= totalPages()">Next</button>
      </div>
    }
  `,
  styleUrl: './activity.component.scss',
})
export class ActivityComponent implements OnInit {
  private api = inject(ApiService);

  items = signal<ActivityItem[]>([]);
  folderNames = signal<string[]>([]);
  loading = signal(true);
  total = signal(0);
  page = signal(1);
  readonly pageSize = 25;

  folder = signal('');
  sinceDate = signal('');
  untilDate = signal('');
  urgentOnly = signal(false);
  query = signal('');
  exporting = signal(false);
  summary = signal<ActivitySummary | null>(null);

  expanded = signal<Set<string>>(new Set());
  private searchDebounce?: ReturnType<typeof setTimeout>;

  ngOnInit(): void {
    this.api.getFolders().subscribe({
      next: (res) => this.folderNames.set(res.folders.map((f) => f.name)),
      error: () => {},
    });
    this.loadSummary();
    this.load();
  }

  totalPages(): number {
    return Math.max(1, Math.ceil(this.total() / this.pageSize));
  }

  private loadSummary(): void {
    this.api.getActivitySummary().subscribe({ next: (s) => this.summary.set(s), error: () => {} });
  }

  private load(): void {
    this.loading.set(true);
    this.api
      .getActivity({
        folder: this.folder() || undefined,
        since: this.sinceDate() ? new Date(this.sinceDate()).toISOString() : undefined,
        until: this.untilDate() ? new Date(this.untilDate() + 'T23:59:59').toISOString() : undefined,
        urgent_only: this.urgentOnly() || undefined,
        q: this.query().trim() || undefined,
        page: this.page(),
        page_size: this.pageSize,
      })
      .subscribe({
        next: (res) => {
          this.items.set(res.items);
          this.total.set(res.total);
          this.loading.set(false);
        },
        error: () => this.loading.set(false),
      });
  }

  onSearch(value: string): void {
    this.query.set(value);
    this.page.set(1);
    clearTimeout(this.searchDebounce);
    this.searchDebounce = setTimeout(() => this.load(), 250);
  }

  clearLog(): void {
    if (!confirm('Clear the entire activity log? This does not touch your email — only the local log.')) return;
    this.api.clearActivity().subscribe({
      next: () => {
        this.page.set(1);
        this.loadSummary();
        this.load();
      },
      error: () => {},
    });
  }

  /** Fetch all activity matching the current filters, across pages, for export. */
  private async fetchAllFiltered(): Promise<ActivityItem[]> {
    const all: ActivityItem[] = [];
    const size = 200;
    let page = 1;
    for (;;) {
      const res = await new Promise<{ items: ActivityItem[]; total: number }>((resolve, reject) =>
        this.api
          .getActivity({
            folder: this.folder() || undefined,
            since: this.sinceDate() ? new Date(this.sinceDate()).toISOString() : undefined,
            until: this.untilDate() ? new Date(this.untilDate() + 'T23:59:59').toISOString() : undefined,
            urgent_only: this.urgentOnly() || undefined,
            q: this.query().trim() || undefined,
            page,
            page_size: size,
          })
          .subscribe({ next: resolve, error: reject }),
      );
      all.push(...res.items);
      if (all.length >= res.total || res.items.length === 0) break;
      page++;
    }
    return all;
  }

  async exportJson(): Promise<void> {
    this.exporting.set(true);
    try {
      const items = await this.fetchAllFiltered();
      downloadJson(items, `tidemail-activity-${this.stamp()}.json`);
    } finally {
      this.exporting.set(false);
    }
  }

  async exportCsv(): Promise<void> {
    this.exporting.set(true);
    try {
      const items = await this.fetchAllFiltered();
      const columns = ['timestamp', 'sender_name', 'sender_address', 'subject', 'folder', 'urgent', 'error', 'reasoning'];
      downloadCsv(items as unknown as Record<string, unknown>[], columns, `tidemail-activity-${this.stamp()}.csv`);
    } finally {
      this.exporting.set(false);
    }
  }

  private stamp(): string {
    return new Date().toISOString().slice(0, 10);
  }

  onFilter(kind: 'folder' | 'since' | 'until' | 'urgent', value: string | boolean): void {
    if (kind === 'folder') this.folder.set(value as string);
    if (kind === 'since') this.sinceDate.set(value as string);
    if (kind === 'until') this.untilDate.set(value as string);
    if (kind === 'urgent') this.urgentOnly.set(value as boolean);
    this.page.set(1);
    this.load();
  }

  toggle(id: string): void {
    const set = new Set(this.expanded());
    set.has(id) ? set.delete(id) : set.add(id);
    this.expanded.set(set);
  }

  prev(): void {
    if (this.page() > 1) {
      this.page.update((p) => p - 1);
      this.load();
    }
  }
  next(): void {
    if (this.page() < this.totalPages()) {
      this.page.update((p) => p + 1);
      this.load();
    }
  }
}

import { Component, OnInit, computed, inject, signal } from '@angular/core';
import { animate, style, transition, trigger } from '@angular/animations';
import { EmailRowComponent } from '../../components/email-row/email-row.component';
import { StatCardComponent } from '../../components/stat-card/stat-card.component';
import { ApiService } from '../../services/api.service';
import { PollerService } from '../../services/poller.service';
import { RevealDirective } from '../../directives/reveal.directive';

@Component({
  selector: 'app-dashboard',
  standalone: true,
  imports: [EmailRowComponent, StatCardComponent, RevealDirective],
  animations: [
    trigger('slideIn', [
      transition(':enter', [
        style({ opacity: 0, transform: 'translateY(-10px)' }),
        animate('240ms cubic-bezier(0.16,1,0.3,1)', style({ opacity: 1, transform: 'translateY(0)' })),
      ]),
    ]),
    trigger('expand', [
      transition(':enter', [
        style({ opacity: 0, height: 0 }),
        animate('220ms cubic-bezier(0.16,1,0.3,1)', style({ opacity: 1, height: '*' })),
      ]),
    ]),
  ],
  template: `
    <header class="head">
      <div>
        <span class="eyebrow">Dashboard</span>
        <h1>Your Inbox</h1>
        <p class="sub">
          Sorts <strong>every</strong> email in your inbox into themed folders — one full pass.
          @if (lastScan()) { <span class="last-scan">· Last sorted {{ lastScan() }}</span> }
        </p>
      </div>
      <div class="head-actions">
        @if (undoCount() > 0 && !scanning()) {
          <button class="btn btn-ghost" (click)="undo()" [disabled]="undoing()">
            @if (undoing()) {
              <span class="spinner spinner--dark" aria-hidden="true"></span> Undoing…
            } @else {
              <svg viewBox="0 0 24 24" width="16" height="16" aria-hidden="true"><path d="M9 14 4 9l5-5M4 9h11a5 5 0 0 1 0 10h-3" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round"/></svg>
              Undo last sort ({{ undoCount() }})
            }
          </button>
        }
        <button class="btn btn-accent scan-btn" (click)="scan()" [disabled]="scanning()">
          @if (scanning()) {
            <span class="spinner" aria-hidden="true"></span> Sorting…
          } @else {
            <svg viewBox="0 0 24 24" width="18" height="18" aria-hidden="true"><circle cx="11" cy="11" r="7" fill="none" stroke="currentColor" stroke-width="2"/><path d="m20 20-3.5-3.5" stroke="currentColor" stroke-width="2" stroke-linecap="round"/></svg>
            Sort entire inbox
          }
        </button>
      </div>
    </header>

    @if (poller.connectionError()) {
      <div class="banner" role="alert">Can't reach the tidemail backend. Is it running on port 8000?</div>
    }
    @if (actionError()) {
      <div class="banner" role="alert">{{ actionError() }}</div>
    }
    @if (!scanning() && status()?.last_error; as err) {
      <div class="banner banner--warn" role="alert">Last scan error: {{ err }}</div>
    }

    @if (scanning() && progress(); as p) {
      <section class="progress card" @expand aria-label="Scan progress">
        <div class="progress-top">
          <span class="progress-label">Sorting all {{ p.total || '' }} emails…</span>
          <span class="progress-count">{{ p.scanned }} / {{ p.total || '…' }}</span>
        </div>
        <div class="bar" role="progressbar" [attr.aria-valuenow]="p.scanned" [attr.aria-valuemax]="p.total">
          <span class="bar-fill" [style.width.%]="pct()"></span>
        </div>
        <div class="progress-foot">
          <span class="current" [title]="p.current || ''">{{ p.current || 'Preparing…' }}</span>
          <span class="tallies">
            <span class="tally tally--ok">{{ p.sorted }} sorted</span>
            @if (p.errors > 0) { <span class="tally tally--err">{{ p.errors }} skipped</span> }
          </span>
        </div>
      </section>
    }

    <section class="stats" aria-label="Summary">
      <div reveal [revealDelay]="0">
        <app-stat-card title="Emails sorted today" [value]="status()?.emails_sorted_today ?? 0" subtext="filed into themed folders">
          <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round"><rect x="3" y="5" width="18" height="14" rx="2"/><path d="m3 7 9 6 9-6"/></svg>
        </app-stat-card>
      </div>
      <div reveal [revealDelay]="60">
        <app-stat-card title="Folders active" [value]="foldersActive()" [loading]="foldersLoading()" subtext="themes tidemail created">
          <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round"><path d="M3 6a2 2 0 0 1 2-2h4l2 2h8a2 2 0 0 1 2 2v9a2 2 0 0 1-2 2H5a2 2 0 0 1-2-2Z"/></svg>
        </app-stat-card>
      </div>
      <div reveal [revealDelay]="120">
        <app-stat-card title="Urgent flagged" [value]="status()?.urgent_flagged_today ?? 0" subtext="need your attention" variant="urgent">
          <svg viewBox="0 0 24 24" fill="currentColor"><path d="M13 2 4 14h6l-1 8 9-12h-6l1-8Z"/></svg>
        </app-stat-card>
      </div>
    </section>

    <section class="feed card" aria-label="Recent activity" reveal [revealDelay]="80">
      <div class="feed-head">
        <h2>Recent activity</h2>
        <span class="feed-sub">Last {{ recent().length }} processed</span>
      </div>

      @if (recent().length === 0) {
        <div class="empty">
          <svg viewBox="0 0 220 120" width="200" height="110" aria-hidden="true">
            <path d="M0 78c30 0 30-16 55-16s25 16 55 16 30-16 55-16 30 16 55 16v42H0Z" fill="var(--surface-2)"/>
            <path d="M0 90c30 0 30-12 55-12s25 12 55 12 30-12 55-12 30 12 55 12v30H0Z" fill="var(--surface-sunken)"/>
          </svg>
          <p class="empty-title">Your inbox is ready to sort.</p>
          <p class="empty-sub">Hit “Sort entire inbox” and tidemail will file every email by theme.</p>
        </div>
      } @else {
        <div class="rows">
          @for (item of recent(); track item.id) {
            <div @slideIn>
              <app-email-row [item]="item" />
            </div>
          }
        </div>
      }
    </section>
  `,
  styles: [
    `
      .head {
        display: flex;
        align-items: flex-start;
        justify-content: space-between;
        gap: var(--sp-4);
        margin-bottom: var(--sp-5);
        flex-wrap: wrap;
      }
      h1 {
        font-size: 24px;
      }
      .sub {
        margin: var(--sp-1) 0 0;
        color: var(--text-muted);
        font-size: 14px;
      }
      .last-scan {
        color: var(--text-subtle);
      }
      .head-actions {
        display: flex;
        align-items: center;
        gap: var(--sp-3);
        flex-wrap: wrap;
      }
      .scan-btn {
        min-height: 46px;
        padding: 0 var(--sp-5);
        font-size: 15px;
        box-shadow: var(--shadow-sm);
      }
      .scan-btn:hover:not(:disabled) {
        box-shadow: var(--shadow-md);
        transform: translateY(-1px);
      }
      .banner {
        padding: var(--sp-3) var(--sp-4);
        border-radius: var(--r-md);
        background: rgba(255, 107, 107, 0.12);
        color: var(--danger-ink);
        font-size: 13.5px;
        font-weight: 600;
        margin-bottom: var(--sp-4);
      }
      .banner--warn {
        background: rgba(255, 176, 32, 0.14);
        color: #9a6b00;
      }

      .progress {
        padding: var(--sp-4) var(--sp-5);
        margin-bottom: var(--sp-5);
        overflow: hidden;
      }
      .progress-top {
        display: flex;
        justify-content: space-between;
        align-items: baseline;
        margin-bottom: var(--sp-3);
      }
      .progress-label {
        font-weight: 600;
        color: var(--text);
      }
      .progress-count {
        font-variant-numeric: tabular-nums;
        color: var(--text-muted);
        font-size: 14px;
      }
      .bar {
        height: 8px;
        border-radius: var(--r-pill);
        background: var(--surface-2);
        overflow: hidden;
      }
      .bar-fill {
        display: block;
        height: 100%;
        background: linear-gradient(90deg, var(--accent), var(--accent-strong));
        border-radius: var(--r-pill);
        transition: width 300ms var(--ease-out);
      }
      .progress-foot {
        display: flex;
        justify-content: space-between;
        align-items: center;
        gap: var(--sp-3);
        margin-top: var(--sp-3);
      }
      .current {
        font-size: 13px;
        color: var(--text-subtle);
        white-space: nowrap;
        overflow: hidden;
        text-overflow: ellipsis;
        min-width: 0;
      }
      .tallies {
        display: flex;
        gap: var(--sp-2);
        flex-shrink: 0;
      }
      .tally {
        font-size: 12px;
        font-weight: 600;
      }
      .tally--ok {
        color: var(--success);
      }
      .tally--err {
        color: var(--danger-ink);
      }

      .stats {
        display: grid;
        grid-template-columns: repeat(3, 1fr);
        gap: var(--sp-4);
        margin-bottom: var(--sp-5);
      }
      .stat {
        display: flex;
        flex-direction: column;
        gap: var(--sp-2);
        padding: var(--sp-5);
      }
      .stat-label {
        font-size: 13px;
        color: var(--text-muted);
        font-weight: 600;
      }
      .stat-value {
        font-size: 34px;
        font-weight: 700;
        line-height: 1;
        color: var(--text);
      }
      .stat-value--urgent {
        color: var(--danger-ink);
      }
      .stat-skel {
        display: inline-block;
        width: 40px;
        height: 30px;
      }

      .feed-head {
        display: flex;
        align-items: baseline;
        justify-content: space-between;
        padding: var(--sp-4) var(--sp-4) var(--sp-3);
        border-bottom: 1px solid var(--border);
      }
      h2 {
        font-size: 16px;
      }
      .feed-sub {
        font-size: 12.5px;
        color: var(--text-subtle);
      }
      .rows {
        display: flex;
        flex-direction: column;
      }
      .empty {
        display: flex;
        flex-direction: column;
        align-items: center;
        text-align: center;
        gap: var(--sp-2);
        padding: var(--sp-8) var(--sp-4);
      }
      .empty-title {
        margin: var(--sp-3) 0 0;
        font-weight: 600;
        color: var(--text);
      }
      .empty-sub {
        margin: 0;
        font-size: 13px;
        color: var(--text-subtle);
      }
      .spinner {
        width: 15px;
        height: 15px;
        border: 2px solid rgba(4, 53, 58, 0.35);
        border-top-color: #04353a;
        border-radius: 50%;
        animation: spin 0.7s linear infinite;
      }
      @keyframes spin {
        to {
          transform: rotate(360deg);
        }
      }
      @media (max-width: 720px) {
        .stats {
          grid-template-columns: 1fr;
        }
        .scan-btn {
          width: 100%;
        }
      }
    `,
  ],
})
export class DashboardComponent implements OnInit {
  private api = inject(ApiService);
  poller = inject(PollerService);

  status = this.poller.status;
  recent = this.poller.recent;
  scanning = this.poller.scanning;
  progress = computed(() => this.status()?.progress ?? null);

  actionError = signal<string | null>(null);
  foldersLoading = signal(true);
  undoCount = signal(0);
  undoing = signal(false);
  private folderCount = signal(0);

  pct = computed(() => {
    const p = this.progress();
    if (!p || !p.total) return 0;
    return Math.min(100, Math.round((p.scanned / p.total) * 100));
  });

  foldersActive = computed(() => {
    if (this.folderCount() > 0) return this.folderCount();
    return new Set(this.recent().map((r) => r.folder)).size;
  });

  lastScan = computed(() => {
    const ts = this.status()?.last_scan;
    if (!ts) return '';
    const diff = Date.now() - new Date(ts).getTime();
    if (Number.isNaN(diff)) return '';
    const m = Math.round(diff / 60000);
    if (m < 1) return 'just now';
    if (m < 60) return `${m}m ago`;
    const h = Math.round(m / 60);
    if (h < 24) return `${h}h ago`;
    return `${Math.round(h / 24)}d ago`;
  });

  ngOnInit(): void {
    this.poller.refreshNow();
    this.loadFolderCount();
    this.loadUndo();
  }

  private loadFolderCount(): void {
    this.api.getFolders().subscribe({
      next: (res) => {
        this.folderCount.set(res.folders.length);
        this.foldersLoading.set(false);
      },
      error: () => this.foldersLoading.set(false),
    });
  }

  private loadUndo(): void {
    this.api.undoAvailable().subscribe({ next: (r) => this.undoCount.set(r.available), error: () => {} });
  }

  scan(): void {
    this.actionError.set(null);
    // Optimistically flip to scanning so the UI reacts instantly; the poller confirms.
    this.poller.status.update((s) => (s ? { ...s, scanning: true } : s));
    this.api.scan().subscribe({
      next: () => {
        this.poller.refreshNow();
        this.loadFolderCount();
        this.loadUndo();
      },
      error: (err) => {
        this.actionError.set(err?.error?.detail || 'Scan failed. Check your connection and AI settings.');
        this.poller.refreshNow();
      },
    });
  }

  undo(): void {
    if (!confirm(`Move ${this.undoCount()} email(s) back to where they were before the last sort?`)) return;
    this.undoing.set(true);
    this.actionError.set(null);
    this.api.undoLastScan().subscribe({
      next: (r) => {
        this.undoCount.set(r.available);
        this.undoing.set(false);
        this.poller.refreshNow();
        this.loadFolderCount();
      },
      error: (err) => {
        this.actionError.set(err?.error?.detail || 'Undo failed.');
        this.undoing.set(false);
      },
    });
  }
}

import { Component, OnInit, computed, inject, signal } from '@angular/core';
import { DatePipe } from '@angular/common';
import { FormsModule } from '@angular/forms';
import { animate, style, transition, trigger } from '@angular/animations';
import { RevealDirective } from '../../directives/reveal.directive';
import { ApiService } from '../../services/api.service';
import { FolderInfo, FolderMessage } from '../../services/models';
import { folderColor } from '../../components/folder-chip/folder-color';

type SortKey = 'count' | 'name' | 'recent';

@Component({
  selector: 'app-folders',
  standalone: true,
  imports: [DatePipe, FormsModule, RevealDirective],
  animations: [
    trigger('panelIn', [
      transition(':enter', [
        style({ opacity: 0, transform: 'translateX(16px)' }),
        animate('220ms cubic-bezier(0.16,1,0.3,1)', style({ opacity: 1, transform: 'translateX(0)' })),
      ]),
    ]),
  ],
  template: `
    <header class="head">
      <div>
        <span class="eyebrow">Folders</span>
        <h1>Your themed folders</h1>
        <p class="sub">{{ folders().length }} folder{{ folders().length === 1 ? '' : 's' }} under “{{ parent() }}” · {{ totalEmails() }} emails sorted</p>
      </div>
      <div class="head-actions">
        <button class="btn btn-ghost" (click)="cleanup()" [disabled]="loading() || cleaning()">
          @if (cleaning()) {
            <span class="spinner spinner--dark" aria-hidden="true"></span> Cleaning…
          } @else {
            <svg viewBox="0 0 24 24" width="16" height="16" aria-hidden="true"><path d="M3 6h18M8 6V4h8v2m-9 0 1 14h8l1-14" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round"/></svg>
            Clean up empty
          }
        </button>
        <button class="btn btn-ghost" (click)="reload()" [disabled]="loading()">
          <svg viewBox="0 0 24 24" width="16" height="16" aria-hidden="true"><path d="M21 12a9 9 0 1 1-2.6-6.4M21 3v6h-6" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round"/></svg>
          Refresh
        </button>
      </div>
    </header>
    @if (cleanupMsg()) { <div class="cleanup-note" role="status">{{ cleanupMsg() }}</div> }

    <!-- distribution bar -->
    @if (folders().length > 0) {
      <div class="dist card" reveal>
        <div class="dist-bar" role="img" aria-label="Email distribution across folders">
          @for (f of sorted(); track f.id) {
            @if (f.count > 0) {
              <span class="dist-seg" [style.flexGrow]="f.count" [style.background]="dot(f.name)" [title]="f.name + ': ' + f.count"></span>
            }
          }
        </div>
      </div>
    }

    <!-- toolbar -->
    @if (folders().length > 0) {
      <div class="toolbar">
        <div class="search">
          <svg viewBox="0 0 24 24" width="16" height="16" aria-hidden="true"><circle cx="11" cy="11" r="7" fill="none" stroke="currentColor" stroke-width="2"/><path d="m20 20-3.5-3.5" stroke="currentColor" stroke-width="2" stroke-linecap="round"/></svg>
          <input class="input" placeholder="Search folders…" [ngModel]="search()" (ngModelChange)="search.set($event)" />
        </div>
        <select class="select sort" [ngModel]="sort()" (ngModelChange)="sort.set($event)">
          <option value="count">Most emails</option>
          <option value="name">Name (A–Z)</option>
          <option value="recent">Recently active</option>
        </select>
      </div>
    }

    <div class="layout" [class.with-panel]="selected()">
      <div class="main">
        @if (loading()) {
          <div class="grid">
            @for (i of [1, 2, 3, 4, 5, 6]; track i) {
              <div class="fcard card"><span class="skeleton sk-title"></span><span class="skeleton sk-line"></span></div>
            }
          </div>
        } @else if (error()) {
          <div class="empty card">
            <p class="empty-title">Couldn’t load folders</p>
            <p class="empty-sub">{{ error() }}</p>
          </div>
        } @else if (folders().length === 0) {
          <div class="empty card">
            <p class="empty-title">No folders yet</p>
            <p class="empty-sub">Run a scan and tidemail will create themed folders here.</p>
          </div>
        } @else if (visible().length === 0) {
          <div class="empty card">
            <p class="empty-title">No folders match “{{ search() }}”</p>
          </div>
        } @else {
          <div class="grid">
            @for (f of visible(); track f.id; let i = $index) {
              <button class="fcard card hoverable" [class.active]="selected()?.id === f.id" (click)="select(f)" reveal [revealDelay]="i * 35">
                <span class="fcard-top">
                  <span class="fdot" [style.background]="dot(f.name)" aria-hidden="true"></span>
                  <span class="fcount-badge">{{ f.count }}</span>
                </span>
                <span class="fname">{{ f.name }}</span>
                @if (f.last_message) {
                  <span class="flast">{{ f.last_message.subject || '(no subject)' }}</span>
                  <span class="fwhen">{{ f.last_message.received | date: 'MMM d' }}</span>
                } @else {
                  <span class="flast muted">Empty</span>
                }
              </button>
            }
          </div>
        }
      </div>

      @if (selected(); as sel) {
        <aside class="panel card" @panelIn aria-label="Folder detail">
          <div class="panel-head">
            @if (renaming()) {
              <input class="input rename" [ngModel]="renameValue()" (ngModelChange)="renameValue.set($event)"
                (keyup.enter)="confirmRename(sel)" (keyup.escape)="renaming.set(false)" autofocus />
            } @else {
              <h2><span class="fdot" [style.background]="dot(sel.name)"></span>{{ sel.name }}</h2>
            }
            <button class="icon-btn" (click)="close()" aria-label="Close panel">
              <svg viewBox="0 0 24 24" width="18" height="18"><path d="M6 6l12 12M18 6 6 18" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round"/></svg>
            </button>
          </div>

          <div class="panel-actions">
            @if (renaming()) {
              <button class="btn btn-accent btn-sm" (click)="confirmRename(sel)" [disabled]="busy()">Save name</button>
              <button class="btn btn-ghost btn-sm" (click)="renaming.set(false)">Cancel</button>
            } @else {
              <button class="btn btn-ghost btn-sm" (click)="startRename(sel)">
                <svg viewBox="0 0 24 24" width="14" height="14"><path d="M12 20h9M16.5 3.5a2.1 2.1 0 0 1 3 3L7 19l-4 1 1-4Z" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round"/></svg>
                Rename
              </button>
              <button class="btn btn-danger btn-sm" (click)="remove(sel)" [disabled]="busy()">
                <svg viewBox="0 0 24 24" width="14" height="14"><path d="M3 6h18M8 6V4h8v2m-9 0 1 14h8l1-14" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round"/></svg>
                Delete
              </button>
            }
          </div>
          @if (actionError()) { <p class="field-error">{{ actionError() }}</p> }

          <div class="panel-meta">{{ sel.count }} email{{ sel.count === 1 ? '' : 's' }}</div>

          @if (sel.subfolders?.length) {
            <div class="subfolders">
              <span class="subfolders-label">Subfolders</span>
              <div class="subfolder-chips">
                @for (s of sel.subfolders; track s.id) {
                  <span class="subchip"><span class="subdot" [style.background]="dot(s.name)"></span>{{ s.name }} <b>{{ s.count }}</b></span>
                }
              </div>
            </div>
          }

          @if (panelLoading()) {
            <div class="skeleton sk-line"></div><div class="skeleton sk-line"></div><div class="skeleton sk-line"></div>
          } @else if (panelEmails().length === 0) {
            <p class="panel-empty">No recent emails in this folder.</p>
          } @else {
            <ul class="msg-list">
              @for (m of panelEmails(); track m.id) {
                <li class="msg">
                  <div class="msg-top">
                    <span class="msg-sender">{{ m.from?.emailAddress?.name || m.from?.emailAddress?.address || 'Unknown' }}</span>
                    @if (m.receivedDateTime) { <span class="msg-date">{{ m.receivedDateTime | date: 'MMM d' }}</span> }
                  </div>
                  <span class="msg-subject">{{ m.subject || '(no subject)' }}</span>
                  @if (m.bodyPreview) { <span class="msg-preview">{{ m.bodyPreview }}</span> }
                </li>
              }
            </ul>
          }
        </aside>
      }
    </div>
  `,
  styleUrl: './folders.component.scss',
})
export class FoldersComponent implements OnInit {
  private api = inject(ApiService);

  folders = signal<FolderInfo[]>([]);
  loading = signal(true);
  error = signal<string | null>(null);
  parent = signal('AI Sorted');

  search = signal('');
  sort = signal<SortKey>('count');

  selected = signal<FolderInfo | null>(null);
  panelEmails = signal<FolderMessage[]>([]);
  panelLoading = signal(false);

  renaming = signal(false);
  renameValue = signal('');
  busy = signal(false);
  cleaning = signal(false);
  cleanupMsg = signal<string | null>(null);
  actionError = signal<string | null>(null);

  totalEmails = computed(() => this.folders().reduce((n, f) => n + f.count, 0));

  sorted = computed(() => {
    const list = [...this.folders()];
    switch (this.sort()) {
      case 'name':
        return list.sort((a, b) => a.name.localeCompare(b.name));
      case 'recent':
        return list.sort(
          (a, b) =>
            new Date(b.last_message?.received ?? 0).getTime() -
            new Date(a.last_message?.received ?? 0).getTime(),
        );
      default:
        return list.sort((a, b) => b.count - a.count);
    }
  });

  visible = computed(() => {
    const q = this.search().trim().toLowerCase();
    return this.sorted().filter((f) => !q || f.name.toLowerCase().includes(q));
  });

  private static readonly CACHE_KEY = 'tidemail.folders';

  ngOnInit(): void {
    this.api.getConfig().subscribe((c) => this.parent.set(c.parent_folder_name));
    // Show the last-known folders instantly so navigating here never blocks on the network;
    // the live request below refreshes them a moment later.
    const cached = this.readCache();
    if (cached?.length) {
      this.folders.set(cached);
      this.loading.set(false);
    }
    this.reload();
  }

  reload(): void {
    // Only show the skeleton when we have nothing to display yet — otherwise refresh quietly.
    if (this.folders().length === 0) this.loading.set(true);
    this.error.set(null);
    this.api.getFolders().subscribe({
      next: (res) => {
        this.folders.set(res.folders);
        this.writeCache(res.folders);
        this.loading.set(false);
        const sel = this.selected();
        if (sel && !res.folders.some((f) => f.id === sel.id)) this.close();
      },
      error: (err) => {
        // Keep any cached folders on screen; only surface an error if we have nothing.
        if (this.folders().length === 0) {
          this.error.set(err?.error?.detail || 'Request failed. Is Outlook connected?');
        }
        this.loading.set(false);
      },
    });
  }

  private readCache(): FolderInfo[] | null {
    try {
      const raw = localStorage.getItem(FoldersComponent.CACHE_KEY);
      return raw ? (JSON.parse(raw) as FolderInfo[]) : null;
    } catch {
      return null;
    }
  }

  private writeCache(folders: FolderInfo[]): void {
    try {
      localStorage.setItem(FoldersComponent.CACHE_KEY, JSON.stringify(folders));
    } catch {
      /* storage full or unavailable — non-fatal, we just lose the instant-render */
    }
  }

  dot(name: string): string {
    return folderColor(name).dot;
  }

  cleanup(): void {
    this.cleaning.set(true);
    this.cleanupMsg.set(null);
    this.api.cleanupFolders().subscribe({
      next: (r) => {
        this.cleaning.set(false);
        this.cleanupMsg.set(
          r.deleted > 0 ? `Removed ${r.deleted} empty folder${r.deleted === 1 ? '' : 's'}.` : 'No empty folders to remove.',
        );
        if (r.deleted > 0) this.reload();
      },
      error: (err) => {
        this.cleaning.set(false);
        this.cleanupMsg.set(err?.error?.detail || 'Cleanup failed.');
      },
    });
  }

  select(f: FolderInfo): void {
    this.selected.set(f);
    this.renaming.set(false);
    this.actionError.set(null);
    this.panelLoading.set(true);
    this.panelEmails.set([]);
    this.api.getFolderEmails(f.id, 15).subscribe({
      next: (res) => {
        this.panelEmails.set(res.messages);
        this.panelLoading.set(false);
      },
      error: () => this.panelLoading.set(false),
    });
  }

  close(): void {
    this.selected.set(null);
    this.renaming.set(false);
  }

  startRename(f: FolderInfo): void {
    this.renameValue.set(f.name);
    this.actionError.set(null);
    this.renaming.set(true);
  }

  confirmRename(f: FolderInfo): void {
    const name = this.renameValue().trim();
    if (!name || name === f.name) {
      this.renaming.set(false);
      return;
    }
    this.busy.set(true);
    this.api.renameFolder(f.id, name).subscribe({
      next: (res) => {
        this.folders.update((list) => list.map((x) => (x.id === f.id ? { ...x, name: res.name } : x)));
        this.selected.update((s) => (s ? { ...s, name: res.name } : s));
        this.renaming.set(false);
        this.busy.set(false);
      },
      error: (err) => {
        this.actionError.set(err?.error?.detail || 'Rename failed.');
        this.busy.set(false);
      },
    });
  }

  remove(f: FolderInfo): void {
    if (!confirm(`Delete “${f.name}”? Its emails move to Deleted Items in Outlook (recoverable).`)) return;
    this.busy.set(true);
    this.api.deleteFolder(f.id).subscribe({
      next: () => {
        this.folders.update((list) => list.filter((x) => x.id !== f.id));
        this.busy.set(false);
        this.close();
      },
      error: (err) => {
        this.actionError.set(err?.error?.detail || 'Delete failed.');
        this.busy.set(false);
      },
    });
  }
}

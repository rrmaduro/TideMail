import { Component, OnInit, inject, signal } from '@angular/core';
import { DatePipe } from '@angular/common';
import { animate, style, transition, trigger } from '@angular/animations';
import { RevealDirective } from '../../directives/reveal.directive';
import { ApiService } from '../../services/api.service';
import { FolderInfo, FolderMessage } from '../../services/models';
import { folderColor } from '../../components/folder-chip/folder-color';

@Component({
  selector: 'app-folders',
  standalone: true,
  imports: [DatePipe, RevealDirective],
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
      <span class="eyebrow">Folders</span>
      <h1>Your themed folders</h1>
      <p class="sub">Smart folders tidemail created under “{{ parent() }}”.</p>
    </header>

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
            <p class="empty-sub">Folders appear here once tidemail sorts your first emails.</p>
          </div>
        } @else {
          <div class="grid">
            @for (f of folders(); track f.id; let i = $index) {
              <button class="fcard card" [class.active]="selected()?.id === f.id" (click)="select(f)" reveal [revealDelay]="i * 40">
                <span class="fdot" [style.background]="dot(f.name)" aria-hidden="true"></span>
                <span class="fname">{{ f.name }}</span>
                <span class="fcount">{{ f.count }} email{{ f.count === 1 ? '' : 's' }}</span>
                @if (f.last_message) {
                  <span class="flast">Last: {{ f.last_message.subject || '(no subject)' }}</span>
                }
              </button>
            }
          </div>
        }
      </div>

      @if (selected(); as sel) {
        <aside class="panel card" @panelIn aria-label="Folder detail">
          <div class="panel-head">
            <h2>{{ sel.name }}</h2>
            <button class="icon-btn" (click)="close()" aria-label="Close panel">
              <svg viewBox="0 0 24 24" width="18" height="18"><path d="M6 6l12 12M18 6 6 18" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round"/></svg>
            </button>
          </div>
          @if (panelLoading()) {
            <div class="skeleton sk-line"></div><div class="skeleton sk-line"></div><div class="skeleton sk-line"></div>
          } @else if (panelEmails().length === 0) {
            <p class="panel-empty">No recent emails in this folder.</p>
          } @else {
            <ul class="msg-list">
              @for (m of panelEmails(); track m.id) {
                <li class="msg">
                  <span class="msg-subject">{{ m.subject || '(no subject)' }}</span>
                  <span class="msg-meta">
                    {{ m.from?.emailAddress?.name || m.from?.emailAddress?.address || 'Unknown' }}
                    @if (m.receivedDateTime) { · {{ m.receivedDateTime | date: 'short' }} }
                  </span>
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

  selected = signal<FolderInfo | null>(null);
  panelEmails = signal<FolderMessage[]>([]);
  panelLoading = signal(false);

  ngOnInit(): void {
    this.api.getConfig().subscribe((c) => this.parent.set(c.parent_folder_name));
    this.api.getFolders().subscribe({
      next: (res) => {
        this.folders.set(res.folders);
        this.loading.set(false);
      },
      error: (err) => {
        this.error.set(err?.error?.detail || 'Request failed. Is Outlook connected?');
        this.loading.set(false);
      },
    });
  }

  dot(name: string): string {
    return folderColor(name).dot;
  }

  select(f: FolderInfo): void {
    this.selected.set(f);
    this.panelLoading.set(true);
    this.panelEmails.set([]);
    this.api.getFolderEmails(f.id, 5).subscribe({
      next: (res) => {
        this.panelEmails.set(res.messages);
        this.panelLoading.set(false);
      },
      error: () => this.panelLoading.set(false),
    });
  }

  close(): void {
    this.selected.set(null);
  }
}

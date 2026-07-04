import { Component, OnDestroy, OnInit, inject, signal } from '@angular/core';
import { RouterLink, RouterLinkActive, RouterOutlet } from '@angular/router';
import { LogoComponent } from '../../components/logo/logo.component';
import { StatusPillComponent } from '../../components/status-pill/status-pill.component';
import { PollerService } from '../../services/poller.service';

/** App shell with a collapsible sidebar — the menu pattern is ported from a 21st.dev
 *  "Modern sideBar" (collapse toggle, icon-only mode with hover tooltips, icon
 *  containers, active highlight) and re-skinned in tidemail's identity. */
@Component({
  selector: 'app-shell',
  standalone: true,
  imports: [RouterOutlet, RouterLink, RouterLinkActive, LogoComponent, StatusPillComponent],
  template: `
    <div class="shell" [class.collapsed]="collapsed()">
      <aside class="sidebar">
        <div class="brand">
          <app-logo [compact]="collapsed()" />
          <button
            class="collapse-btn"
            (click)="toggle()"
            [attr.aria-label]="collapsed() ? 'Expand sidebar' : 'Collapse sidebar'"
          >
            <svg viewBox="0 0 24 24" width="18" height="18" aria-hidden="true">
              <path
                [attr.d]="collapsed() ? 'M9 6l6 6-6 6' : 'M15 6l-6 6 6 6'"
                fill="none"
                stroke="currentColor"
                stroke-width="2"
                stroke-linecap="round"
                stroke-linejoin="round"
              />
            </svg>
          </button>
        </div>

        <nav class="nav" aria-label="Primary">
          <a routerLink="/dashboard" routerLinkActive="active" class="nav-item" data-tip="Dashboard">
            <span class="nav-icon"><svg viewBox="0 0 24 24" aria-hidden="true"><path d="M3 13h8V3H3v10Zm0 8h8v-6H3v6Zm10 0h8V11h-8v10Zm0-18v6h8V3h-8Z" fill="currentColor"/></svg></span>
            <span class="nav-label">Dashboard</span>
          </a>
          <a routerLink="/folders" routerLinkActive="active" class="nav-item" data-tip="Folders">
            <span class="nav-icon"><svg viewBox="0 0 24 24" aria-hidden="true"><path d="M3 6a2 2 0 0 1 2-2h4l2 2h8a2 2 0 0 1 2 2v9a2 2 0 0 1-2 2H5a2 2 0 0 1-2-2V6Z" fill="currentColor"/></svg></span>
            <span class="nav-label">Folders</span>
          </a>
          <a routerLink="/activity" routerLinkActive="active" class="nav-item" data-tip="Activity Log">
            <span class="nav-icon"><svg viewBox="0 0 24 24" aria-hidden="true"><path d="M3 12h4l3 8 4-16 3 8h4" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round"/></svg></span>
            <span class="nav-label">Activity Log</span>
          </a>
          <a routerLink="/settings" routerLinkActive="active" class="nav-item" data-tip="Settings">
            <span class="nav-icon"><svg viewBox="0 0 24 24" aria-hidden="true"><path d="M12 15a3 3 0 1 0 0-6 3 3 0 0 0 0 6Z" fill="currentColor"/><path d="M19.4 15a1.7 1.7 0 0 0 .3 1.9l.1.1a2 2 0 1 1-2.8 2.8l-.1-.1a1.7 1.7 0 0 0-2.9 1.2 2 2 0 0 1-4 0 1.7 1.7 0 0 0-2.9-1.2l-.1.1a2 2 0 1 1-2.8-2.8l.1-.1A1.7 1.7 0 0 0 4.6 15a2 2 0 0 1 0-4 1.7 1.7 0 0 0 1.2-2.9l-.1-.1a2 2 0 1 1 2.8-2.8l.1.1a1.7 1.7 0 0 0 2.9-1.2 2 2 0 0 1 4 0 1.7 1.7 0 0 0 2.9 1.2l.1-.1a2 2 0 1 1 2.8 2.8l-.1.1a1.7 1.7 0 0 0 .3 1.9Z" fill="none" stroke="currentColor" stroke-width="1.7"/></svg></span>
            <span class="nav-label">Settings</span>
          </a>
        </nav>

        <div class="sidebar-foot">
          @if (collapsed()) {
            <span class="foot-dot" [class.foot-dot--active]="poller.scanning()" [title]="poller.scanning() ? 'Scanning inbox' : 'Idle'"></span>
          } @else {
            <app-status-pill [active]="poller.scanning()" activeLabel="Scanning inbox" idleLabel="Idle" />
          }
        </div>
      </aside>

      <main class="content">
        <router-outlet />
      </main>
    </div>
  `,
  styles: [
    `
      .shell {
        display: grid;
        grid-template-columns: var(--sidebar-w) 1fr;
        min-height: 100vh;
        transition: grid-template-columns var(--dur-mid) var(--ease-out);
      }
      .shell.collapsed {
        grid-template-columns: 78px 1fr;
      }
      .sidebar {
        display: flex;
        flex-direction: column;
        background: var(--glass);
        backdrop-filter: blur(14px);
        border-right: 1px solid var(--border);
        padding: var(--sp-5) var(--sp-3);
        position: sticky;
        top: 0;
        height: 100vh;
      }
      .brand {
        display: flex;
        align-items: center;
        justify-content: space-between;
        gap: var(--sp-2);
        padding: var(--sp-1) var(--sp-2) var(--sp-6);
      }
      .collapse-btn {
        display: grid;
        place-items: center;
        width: 28px;
        height: 28px;
        border: 1px solid var(--border);
        border-radius: var(--r-sm);
        background: var(--surface);
        color: var(--text-muted);
        flex-shrink: 0;
        transition: background var(--dur-fast) var(--ease-out), color var(--dur-fast) var(--ease-out),
          transform var(--dur-fast) var(--ease-out);
      }
      .collapse-btn:hover {
        background: var(--surface-2);
        color: var(--accent-strong);
        transform: scale(1.08);
      }
      .collapsed .brand {
        flex-direction: column;
        gap: var(--sp-3);
      }

      .nav {
        display: flex;
        flex-direction: column;
        gap: 4px;
      }
      .nav-item {
        position: relative;
        display: flex;
        align-items: center;
        gap: var(--sp-3);
        min-height: 46px;
        padding: 0 var(--sp-2);
        border-radius: var(--r-md);
        color: var(--text-muted);
        font-weight: 600;
        font-size: 14px;
        overflow: visible;
        transition: background var(--dur-fast) var(--ease-out), color var(--dur-fast) var(--ease-out),
          transform var(--dur-fast) var(--ease-out);
      }
      /* animated active indicator bar */
      .nav-item::before {
        content: '';
        position: absolute;
        left: 0;
        top: 50%;
        width: 3px;
        height: 0;
        border-radius: 0 3px 3px 0;
        background: var(--grad-tide);
        transform: translateY(-50%);
        transition: height var(--dur-mid) var(--ease-out);
      }
      .nav-icon {
        display: grid;
        place-items: center;
        width: 34px;
        height: 34px;
        border-radius: 9px;
        flex-shrink: 0;
        transition: background var(--dur-fast) var(--ease-out), color var(--dur-fast) var(--ease-out),
          transform var(--dur-fast) var(--ease-out);
      }
      .nav-icon svg {
        width: 19px;
        height: 19px;
      }
      .nav-item:hover {
        background: var(--surface-2);
        color: var(--text);
        transform: translateX(2px);
      }
      .nav-item:hover .nav-icon {
        transform: scale(1.1);
      }
      .nav-item.active {
        background: color-mix(in srgb, var(--accent) 12%, var(--surface));
        color: var(--accent-strong);
      }
      .nav-item.active .nav-icon {
        background: var(--grad-tide);
        color: #04353a;
      }
      .nav-item.active::before {
        height: 22px;
      }

      /* Collapsed: icon-only, centered, with hover tooltips */
      .collapsed .nav-item {
        justify-content: center;
        padding: 0;
      }
      .collapsed .nav-label {
        display: none;
      }
      .collapsed .nav-item::after {
        content: attr(data-tip);
        position: absolute;
        left: calc(100% + 10px);
        top: 50%;
        transform: translateY(-50%) scale(0.96);
        transform-origin: left center;
        white-space: nowrap;
        background: var(--c-deep);
        color: #eaf9fb;
        font-size: 12.5px;
        font-weight: 600;
        padding: 6px 10px;
        border-radius: var(--r-sm);
        box-shadow: var(--shadow-md);
        opacity: 0;
        visibility: hidden;
        transition: opacity var(--dur-fast) var(--ease-out), transform var(--dur-fast) var(--ease-out);
        z-index: 50;
        pointer-events: none;
      }
      .collapsed .nav-item:hover::after {
        opacity: 1;
        visibility: visible;
        transform: translateY(-50%) scale(1);
      }

      .sidebar-foot {
        margin-top: auto;
        padding-top: var(--sp-4);
        display: flex;
        justify-content: center;
      }
      .foot-dot {
        width: 12px;
        height: 12px;
        border-radius: 50%;
        background: var(--text-subtle);
      }
      .foot-dot--active {
        background: var(--success);
        box-shadow: 0 0 0 0 rgba(23, 166, 126, 0.5);
        animation: pulse 2s var(--ease-out) infinite;
      }
      @keyframes pulse {
        0% { box-shadow: 0 0 0 0 rgba(23, 166, 126, 0.5); }
        70% { box-shadow: 0 0 0 7px rgba(23, 166, 126, 0); }
        100% { box-shadow: 0 0 0 0 rgba(23, 166, 126, 0); }
      }

      .content {
        min-width: 0;
        padding: var(--sp-6) var(--sp-7);
      }

      @media (max-width: 900px) {
        .shell,
        .shell.collapsed {
          grid-template-columns: 1fr;
        }
        .sidebar {
          position: static;
          height: auto;
          flex-direction: row;
          align-items: center;
          gap: var(--sp-4);
          padding: var(--sp-3) var(--sp-4);
          overflow-x: auto;
        }
        .brand {
          padding: 0;
        }
        .collapse-btn {
          display: none;
        }
        .nav {
          flex-direction: row;
        }
        .nav-label {
          display: none;
        }
        .nav-item::after {
          display: none;
        }
        .sidebar-foot {
          margin-top: 0;
          padding-top: 0;
        }
        .content {
          padding: var(--sp-4);
        }
      }
      @media (prefers-reduced-motion: reduce) {
        .shell {
          transition: none;
        }
        .foot-dot--active {
          animation: none;
        }
      }
    `,
  ],
})
export class ShellComponent implements OnInit, OnDestroy {
  poller = inject(PollerService);
  collapsed = signal(false);
  private readonly storageKey = 'tm-sidebar-collapsed';

  ngOnInit(): void {
    try {
      this.collapsed.set(localStorage.getItem(this.storageKey) === '1');
    } catch {
      /* localStorage unavailable — default expanded */
    }
    this.poller.start();
  }

  toggle(): void {
    this.collapsed.update((c) => !c);
    try {
      localStorage.setItem(this.storageKey, this.collapsed() ? '1' : '0');
    } catch {
      /* ignore */
    }
  }

  ngOnDestroy(): void {
    this.poller.stop();
  }
}

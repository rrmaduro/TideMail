import { Component, OnDestroy, OnInit, inject } from '@angular/core';
import { RouterLink, RouterLinkActive, RouterOutlet } from '@angular/router';
import { LogoComponent } from '../../components/logo/logo.component';
import { StatusPillComponent } from '../../components/status-pill/status-pill.component';
import { PollerService } from '../../services/poller.service';

@Component({
  selector: 'app-shell',
  standalone: true,
  imports: [RouterOutlet, RouterLink, RouterLinkActive, LogoComponent, StatusPillComponent],
  template: `
    <div class="shell">
      <aside class="sidebar">
        <div class="brand">
          <app-logo />
        </div>

        <nav class="nav" aria-label="Primary">
          <a routerLink="/dashboard" routerLinkActive="active" class="nav-item">
            <svg viewBox="0 0 24 24" aria-hidden="true"><path d="M3 13h8V3H3v10Zm0 8h8v-6H3v6Zm10 0h8V11h-8v10Zm0-18v6h8V3h-8Z" fill="currentColor"/></svg>
            Dashboard
          </a>
          <a routerLink="/folders" routerLinkActive="active" class="nav-item">
            <svg viewBox="0 0 24 24" aria-hidden="true"><path d="M3 6a2 2 0 0 1 2-2h4l2 2h8a2 2 0 0 1 2 2v9a2 2 0 0 1-2 2H5a2 2 0 0 1-2-2V6Z" fill="currentColor"/></svg>
            Folders
          </a>
          <a routerLink="/activity" routerLinkActive="active" class="nav-item">
            <svg viewBox="0 0 24 24" aria-hidden="true"><path d="M3 12h4l3 8 4-16 3 8h4" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round"/></svg>
            Activity Log
          </a>
          <a routerLink="/settings" routerLinkActive="active" class="nav-item">
            <svg viewBox="0 0 24 24" aria-hidden="true"><path d="M12 15a3 3 0 1 0 0-6 3 3 0 0 0 0 6Z" fill="currentColor"/><path d="M19.4 15a1.7 1.7 0 0 0 .3 1.9l.1.1a2 2 0 1 1-2.8 2.8l-.1-.1a1.7 1.7 0 0 0-2.9 1.2 2 2 0 0 1-4 0 1.7 1.7 0 0 0-2.9-1.2l-.1.1a2 2 0 1 1-2.8-2.8l.1-.1A1.7 1.7 0 0 0 4.6 15a2 2 0 0 1 0-4 1.7 1.7 0 0 0 1.2-2.9l-.1-.1a2 2 0 1 1 2.8-2.8l.1.1a1.7 1.7 0 0 0 2.9-1.2 2 2 0 0 1 4 0 1.7 1.7 0 0 0 2.9 1.2l.1-.1a2 2 0 1 1 2.8 2.8l-.1.1a1.7 1.7 0 0 0 .3 1.9Z" fill="none" stroke="currentColor" stroke-width="1.7"/></svg>
            Settings
          </a>
        </nav>

        <div class="sidebar-foot">
          <app-status-pill [active]="poller.scanning()" activeLabel="Scanning inbox" idleLabel="Idle" />
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
      }
      .sidebar {
        display: flex;
        flex-direction: column;
        background: var(--glass);
        backdrop-filter: blur(14px);
        border-right: 1px solid var(--border);
        padding: var(--sp-5) var(--sp-4);
        position: sticky;
        top: 0;
        height: 100vh;
      }
      .brand {
        padding: var(--sp-1) var(--sp-2) var(--sp-6);
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
        padding: 0 var(--sp-3);
        border-radius: var(--r-md);
        color: var(--text-muted);
        font-weight: 600;
        font-size: 14px;
        overflow: hidden;
        transition: background var(--dur-fast) var(--ease-out), color var(--dur-fast) var(--ease-out),
          transform var(--dur-fast) var(--ease-out);
      }
      /* animated active indicator bar on the left */
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
      .nav-item svg {
        width: 19px;
        height: 19px;
        flex-shrink: 0;
        transition: transform var(--dur-fast) var(--ease-out);
      }
      .nav-item:hover {
        background: var(--surface-2);
        color: var(--text);
        transform: translateX(2px);
      }
      .nav-item:hover svg {
        transform: scale(1.12);
      }
      .nav-item.active {
        background: color-mix(in srgb, var(--accent) 12%, var(--surface));
        color: var(--accent-strong);
      }
      .nav-item.active::before {
        height: 22px;
      }
      .sidebar-foot {
        margin-top: auto;
        padding-top: var(--sp-4);
      }
      .content {
        min-width: 0;
        padding: var(--sp-6) var(--sp-7);
      }
      @media (max-width: 900px) {
        .shell {
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
        .nav {
          flex-direction: row;
        }
        .nav-item span,
        .nav-item {
          font-size: 13px;
        }
        .sidebar-foot {
          margin-top: 0;
          padding-top: 0;
        }
        .content {
          padding: var(--sp-4);
        }
      }
    `,
  ],
})
export class ShellComponent implements OnInit, OnDestroy {
  poller = inject(PollerService);

  ngOnInit(): void {
    this.poller.start();
  }
  ngOnDestroy(): void {
    this.poller.stop();
  }
}

import { Component, input } from '@angular/core';

/** Sidebar status pill: pulsing dot + a live label when active, muted label when idle. */
@Component({
  selector: 'app-status-pill',
  standalone: true,
  template: `
    <span class="pill" [class.pill--active]="active()" role="status" aria-live="polite">
      <span class="dot" aria-hidden="true"></span>
      {{ active() ? activeLabel() : idleLabel() }}
    </span>
  `,
  styles: [
    `
      .pill {
        display: inline-flex;
        align-items: center;
        gap: var(--sp-2);
        padding: 7px 12px;
        border-radius: var(--r-pill);
        background: var(--surface-2);
        color: var(--text-muted);
        font-size: 13px;
        font-weight: 600;
      }
      .dot {
        width: 9px;
        height: 9px;
        border-radius: 50%;
        background: var(--text-subtle);
        flex-shrink: 0;
      }
      .pill--active {
        background: var(--success-bg);
        color: var(--success);
      }
      .pill--active .dot {
        background: var(--success);
        box-shadow: 0 0 0 0 rgba(34, 160, 107, 0.5);
        animation: pulse 2s var(--ease-out) infinite;
      }
      @keyframes pulse {
        0% {
          box-shadow: 0 0 0 0 rgba(34, 160, 107, 0.5);
        }
        70% {
          box-shadow: 0 0 0 7px rgba(34, 160, 107, 0);
        }
        100% {
          box-shadow: 0 0 0 0 rgba(34, 160, 107, 0);
        }
      }
    `,
  ],
})
export class StatusPillComponent {
  active = input<boolean>(false);
  activeLabel = input<string>('Scanning inbox');
  idleLabel = input<string>('Idle');
}

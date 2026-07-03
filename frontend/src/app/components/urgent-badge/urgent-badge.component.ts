import { Component } from '@angular/core';

/** Small coral pill with a lightning bolt — shown only when the AI flags an email urgent. */
@Component({
  selector: 'app-urgent-badge',
  standalone: true,
  template: `
    <span class="badge">
      <svg viewBox="0 0 24 24" width="12" height="12" aria-hidden="true">
        <path d="M13 2 4 14h6l-1 8 9-12h-6l1-8Z" fill="currentColor" />
      </svg>
      Urgent
    </span>
  `,
  styles: [
    `
      .badge {
        display: inline-flex;
        align-items: center;
        gap: 4px;
        padding: 3px 9px;
        border-radius: var(--r-pill);
        background: rgba(255, 107, 107, 0.14);
        color: var(--danger-ink);
        font-size: 11.5px;
        font-weight: 700;
        letter-spacing: 0.01em;
        text-transform: uppercase;
      }
    `,
  ],
})
export class UrgentBadgeComponent {}

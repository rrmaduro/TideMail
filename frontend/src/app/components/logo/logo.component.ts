import { Component, Input } from '@angular/core';

/** tidemail wordmark: "Layered Tide" mark — three stacked waves fading surface→deep,
 *  set on a soft gradient tile — plus the "tidemail" wordmark. */
@Component({
  selector: 'app-logo',
  standalone: true,
  template: `
    <span class="logo" [class.logo--compact]="compact" role="img" aria-label="tidemail">
      <span class="tile">
        <svg viewBox="0 0 32 32" width="20" height="20" aria-hidden="true">
          <path d="M4 11c3.2 0 3.2-2.6 6.4-2.6S13.6 11 16.8 11 20 8.4 23.2 8.4 26.4 11 28 11"
            fill="none" stroke="#26d4e2" stroke-width="2.4" stroke-linecap="round" />
          <path d="M4 17c3.2 0 3.2-2.6 6.4-2.6S13.6 17 16.8 17 20 14.4 23.2 14.4 26.4 17 28 17"
            fill="none" stroke="#6fc7d6" stroke-width="2.4" stroke-linecap="round" opacity="0.85" />
          <path d="M4 23c3.2 0 3.2-2.6 6.4-2.6S13.6 23 16.8 23 20 20.4 23.2 20.4 26.4 23 28 23"
            fill="none" stroke="#bfe6ee" stroke-width="2.4" stroke-linecap="round" opacity="0.6" />
        </svg>
      </span>
      @if (!compact) {
        <span class="wordmark"><b>tide</b><span class="mail">mail</span></span>
      }
    </span>
  `,
  styles: [
    `
      .logo {
        display: inline-flex;
        align-items: center;
        gap: 10px;
      }
      .tile {
        display: grid;
        place-items: center;
        width: 34px;
        height: 34px;
        border-radius: 10px;
        background: var(--grad-deep);
        box-shadow: var(--shadow-sm);
        flex-shrink: 0;
      }
      .wordmark {
        font-family: var(--font-display);
        font-weight: 700;
        font-size: 20px;
        letter-spacing: -0.03em;
        color: var(--text);
      }
      .wordmark b {
        font-weight: 700;
      }
      .wordmark .mail {
        color: var(--accent-strong);
        font-weight: 600;
      }
    `,
  ],
})
export class LogoComponent {
  @Input() compact = false;
}

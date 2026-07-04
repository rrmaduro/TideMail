import {
  Component,
  ElementRef,
  OnDestroy,
  computed,
  effect,
  inject,
  input,
  signal,
} from '@angular/core';

/** Animated dashboard metric card — ported from a 21st.dev "Activity Stats Card"
 *  design and adapted to tidemail's palette and Angular signals.
 *
 *  Features a count-up animation on the metric (requestAnimationFrame, ease-out),
 *  an icon container, title and subtext. Respects prefers-reduced-motion.
 *
 *  Usage:
 *    <app-stat-card title="Emails sorted today" [value]="12" subtext="across your inbox" variant="accent">
 *      <svg ...icon... />
 *    </app-stat-card>
 */
@Component({
  selector: 'app-stat-card',
  standalone: true,
  template: `
    <div class="stat card hoverable" [class.stat--urgent]="variant() === 'urgent'">
      <div class="stat-head">
        <span class="stat-icon" [attr.data-variant]="variant()" aria-hidden="true">
          <ng-content />
        </span>
        <span class="stat-title">{{ title() }}</span>
      </div>

      <div class="stat-metric">
        @if (loading()) {
          <span class="skeleton stat-skel"></span>
        } @else {
          <span class="stat-value" aria-live="polite" aria-atomic="true">{{ display() }}</span>
          @if (unit()) { <span class="stat-unit">{{ unit() }}</span> }
        }
      </div>

      <p class="stat-sub">{{ subtext() }}</p>
    </div>
  `,
  styles: [
    `
      .stat {
        display: flex;
        flex-direction: column;
        gap: var(--sp-3);
        padding: var(--sp-5);
        position: relative;
        overflow: hidden;
      }
      /* faint tide wash in the corner */
      .stat::after {
        content: '';
        position: absolute;
        inset: 0;
        background: var(--grad-surface);
        pointer-events: none;
      }
      .stat-head {
        display: flex;
        align-items: center;
        gap: var(--sp-3);
      }
      .stat-icon {
        display: grid;
        place-items: center;
        width: 42px;
        height: 42px;
        border-radius: 12px;
        flex-shrink: 0;
        background: var(--grad-tide);
        color: #04353a;
        box-shadow: var(--shadow-sm);
      }
      .stat-icon[data-variant='urgent'] {
        background: linear-gradient(135deg, #ff8a8a, #ff6b6b);
        color: #5a1616;
      }
      .stat-icon ::ng-deep svg {
        width: 20px;
        height: 20px;
      }
      .stat-title {
        font-size: 13.5px;
        font-weight: 600;
        color: var(--text-muted);
      }
      .stat-metric {
        display: flex;
        align-items: baseline;
        gap: 4px;
      }
      .stat-value {
        font-family: var(--font-display);
        font-size: 40px;
        font-weight: 700;
        line-height: 1;
        letter-spacing: -0.03em;
        color: var(--text);
        font-variant-numeric: tabular-nums;
      }
      .stat--urgent .stat-value {
        color: var(--danger-ink);
      }
      .stat-unit {
        font-family: var(--font-display);
        font-size: 24px;
        font-weight: 700;
        color: var(--text-subtle);
      }
      .stat-sub {
        margin: 0;
        font-size: 12.5px;
        color: var(--text-subtle);
      }
      .stat-skel {
        display: inline-block;
        width: 48px;
        height: 34px;
      }
    `,
  ],
})
export class StatCardComponent implements OnDestroy {
  title = input.required<string>();
  value = input<number>(0);
  unit = input<string>('');
  subtext = input<string>('');
  variant = input<'accent' | 'urgent'>('accent');
  loading = input<boolean>(false);

  display = signal(0);
  private rafId = 0;
  private host = inject(ElementRef);

  private readonly countUp = effect(() => {
    const target = this.value();
    cancelAnimationFrame(this.rafId);

    const reduce =
      typeof matchMedia !== 'undefined' && matchMedia('(prefers-reduced-motion: reduce)').matches;
    if (reduce || target === 0) {
      this.display.set(target);
      return;
    }

    const from = this.display();
    const start = performance.now();
    const duration = 900;
    const tick = (now: number) => {
      const t = Math.min(1, (now - start) / duration);
      const eased = 1 - Math.pow(1 - t, 3); // easeOutCubic
      this.display.set(Math.round(from + (target - from) * eased));
      if (t < 1) this.rafId = requestAnimationFrame(tick);
    };
    this.rafId = requestAnimationFrame(tick);
  });

  ngOnDestroy(): void {
    cancelAnimationFrame(this.rafId);
  }
}

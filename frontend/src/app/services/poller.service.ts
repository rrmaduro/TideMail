import { Injectable, computed, inject, signal } from '@angular/core';
import { Subscription, interval, startWith, switchMap } from 'rxjs';
import { ApiService } from './api.service';
import { ActivityItem, Status } from './models';

/** Polls /status and /activity on an interval and exposes the live state as signals.
 *  Components read the signals; the dashboard drives the "live" feel without websockets. */
@Injectable({ providedIn: 'root' })
export class PollerService {
  private api = inject(ApiService);

  readonly status = signal<Status | null>(null);
  readonly recent = signal<ActivityItem[]>([]);
  readonly connectionError = signal<boolean>(false);

  readonly running = computed(() => this.status()?.running ?? false);
  readonly scanning = computed(() => this.status()?.scanning ?? false);
  readonly authenticated = computed(() => this.status()?.authenticated ?? false);

  private statusSub?: Subscription;
  private activitySub?: Subscription;
  private readonly intervalMs = 2500;

  /** Begin polling. Safe to call multiple times — it's idempotent. */
  start(): void {
    if (this.statusSub) return;

    this.statusSub = interval(this.intervalMs)
      .pipe(
        startWith(0),
        switchMap(() => this.api.getStatus()),
      )
      .subscribe({
        next: (s) => {
          this.status.set(s);
          this.connectionError.set(false);
        },
        error: () => this.connectionError.set(true),
      });

    this.activitySub = interval(this.intervalMs)
      .pipe(
        startWith(0),
        switchMap(() => this.api.getActivity({ page: 1, page_size: 20 })),
      )
      .subscribe({
        next: (page) => this.recent.set(page.items),
        error: () => {},
      });
  }

  stop(): void {
    this.statusSub?.unsubscribe();
    this.activitySub?.unsubscribe();
    this.statusSub = undefined;
    this.activitySub = undefined;
  }

  /** Force an immediate refresh of both status and activity (e.g. after Run now). */
  refreshNow(): void {
    this.api.getStatus().subscribe((s) => this.status.set(s));
    this.api.getActivity({ page: 1, page_size: 20 }).subscribe((page) => this.recent.set(page.items));
  }
}

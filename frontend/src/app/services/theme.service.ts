import { Injectable, signal } from '@angular/core';

export type ThemePref = 'system' | 'light' | 'dark';

/** Applies the light/dark theme by setting `data-theme` on <html>.
 *  'system' follows the OS preference live; explicit choices are persisted. */
@Injectable({ providedIn: 'root' })
export class ThemeService {
  readonly pref = signal<ThemePref>('system');
  private readonly storageKey = 'tm-theme';
  private mq?: MediaQueryList;

  init(): void {
    let saved: ThemePref = 'system';
    try {
      const v = localStorage.getItem(this.storageKey) as ThemePref | null;
      if (v === 'light' || v === 'dark' || v === 'system') saved = v;
    } catch {
      /* ignore */
    }
    this.mq = window.matchMedia?.('(prefers-color-scheme: dark)');
    this.mq?.addEventListener?.('change', () => {
      if (this.pref() === 'system') this.apply();
    });
    this.set(saved, false);
  }

  set(pref: ThemePref, persist = true): void {
    this.pref.set(pref);
    if (persist) {
      try {
        localStorage.setItem(this.storageKey, pref);
      } catch {
        /* ignore */
      }
    }
    this.apply();
  }

  private apply(): void {
    const root = document.documentElement;
    const pref = this.pref();
    if (pref === 'system') {
      root.removeAttribute('data-theme');
    } else {
      root.setAttribute('data-theme', pref);
    }
  }
}

import { Component, OnDestroy, inject, signal } from '@angular/core';
import { FormsModule } from '@angular/forms';
import { Router } from '@angular/router';
import { Subscription, interval, switchMap } from 'rxjs';
import { LogoComponent } from '../../components/logo/logo.component';
import { ApiService } from '../../services/api.service';
import { AiProvider, DeviceFlow } from '../../services/models';

const PROVIDER_BASE: Record<AiProvider, string> = {
  eden: 'https://api.edenai.run/v2',
  openai: 'https://api.openai.com/v1',
  anthropic: 'https://api.anthropic.com',
  custom: '',
};

@Component({
  selector: 'app-setup',
  standalone: true,
  imports: [FormsModule, LogoComponent],
  templateUrl: './setup.component.html',
  styleUrl: './setup.component.scss',
})
export class SetupComponent implements OnDestroy {
  private api = inject(ApiService);
  private router = inject(Router);

  step = signal(1);

  // Step 1 — Outlook
  clientId = signal('');
  authVerified = signal(false);
  deviceFlow = signal<DeviceFlow | null>(null);
  authPolling = signal(false);
  authError = signal<string | null>(null);
  private authSub?: Subscription;

  // Step 2 — AI
  provider = signal<AiProvider>('openai');
  baseUrl = signal(PROVIDER_BASE['openai']);
  apiKey = signal('');
  model = signal('');
  testing = signal(false);
  testResult = signal<{ ok: boolean; message: string } | null>(null);

  // Step 3 — Preferences
  interval = signal(5);
  maxFolders = signal(10);
  parentFolder = signal('AI Sorted');
  finishing = signal(false);
  finishError = signal<string | null>(null);

  ngOnDestroy(): void {
    this.authSub?.unsubscribe();
  }

  // --- step 1 ---
  verifyConnection(): void {
    const id = this.clientId().trim();
    if (!id) return;
    this.authError.set(null);
    this.authPolling.set(true);
    this.api.authStart(id).subscribe({
      next: (flow) => {
        this.deviceFlow.set(flow);
        this.pollAuth();
      },
      error: (err) => {
        this.authPolling.set(false);
        this.authError.set(err?.error?.detail || 'Could not start sign-in. Check the client ID.');
      },
    });
  }

  private pollAuth(): void {
    this.authSub?.unsubscribe();
    this.authSub = interval(3000)
      .pipe(switchMap(() => this.api.authStatus()))
      .subscribe({
        next: (s) => {
          if (s.status === 'success' || s.authenticated) {
            this.authVerified.set(true);
            this.authPolling.set(false);
            this.deviceFlow.set(null);
            this.authSub?.unsubscribe();
          } else if (s.status === 'error') {
            this.authPolling.set(false);
            this.authError.set(s.detail || 'Authentication failed.');
            this.deviceFlow.set(null);
            this.authSub?.unsubscribe();
          }
        },
      });
  }

  cancelAuth(): void {
    this.authSub?.unsubscribe();
    this.authPolling.set(false);
    this.deviceFlow.set(null);
  }

  // --- step 2 ---
  onProviderChange(p: AiProvider): void {
    this.provider.set(p);
    this.baseUrl.set(PROVIDER_BASE[p]);
    this.testResult.set(null);
  }

  testAi(): void {
    this.testing.set(true);
    this.testResult.set(null);
    this.api
      .testAi({
        provider: this.provider(),
        base_url: this.baseUrl(),
        model: this.model(),
        api_key: this.apiKey(),
      })
      .subscribe({
        next: (res) => {
          this.testResult.set(res);
          this.testing.set(false);
        },
        error: (err) => {
          this.testResult.set({ ok: false, message: err?.error?.detail || 'Request failed' });
          this.testing.set(false);
        },
      });
  }

  // --- navigation ---
  next(): void {
    this.step.update((s) => Math.min(3, s + 1));
  }
  back(): void {
    this.step.update((s) => Math.max(1, s - 1));
  }

  finish(): void {
    this.finishing.set(true);
    this.finishError.set(null);
    this.api
      .saveConfig({
        client_id: this.clientId().trim(),
        provider: this.provider(),
        base_url: this.baseUrl(),
        model: this.model().trim(),
        api_key: this.apiKey(),
        check_interval_minutes: this.interval(),
        max_folder_count: this.maxFolders(),
        parent_folder_name: this.parentFolder().trim() || 'AI Sorted',
      })
      .subscribe({
        next: () => this.router.navigate(['/dashboard']),
        error: (err) => {
          this.finishing.set(false);
          this.finishError.set(err?.error?.detail || 'Could not save configuration.');
        },
      });
  }

  get canFinish(): boolean {
    return this.authVerified() && !!this.apiKey() && !!this.model().trim();
  }
}

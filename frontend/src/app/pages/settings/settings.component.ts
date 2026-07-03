import { Component, OnInit, inject, signal } from '@angular/core';
import { FormsModule } from '@angular/forms';
import { Router } from '@angular/router';
import { ApiService } from '../../services/api.service';
import { AiProvider } from '../../services/models';

const PROVIDER_BASE: Record<AiProvider, string> = {
  eden: 'https://api.edenai.run/v2',
  openai: 'https://api.openai.com/v1',
  anthropic: 'https://api.anthropic.com',
  custom: '',
};

@Component({
  selector: 'app-settings',
  standalone: true,
  imports: [FormsModule],
  template: `
    <header class="head">
      <h1>Settings</h1>
      <p class="sub">Update your AI provider, preferences, and connection at any time.</p>
    </header>

    <!-- AI provider -->
    <section class="card block">
      <h2>AI provider</h2>
      <div class="field">
        <label for="provider">Provider</label>
        <select id="provider" class="select" [ngModel]="provider()" (ngModelChange)="onProviderChange($event)">
          <option value="eden">Eden AI</option>
          <option value="openai">OpenAI</option>
          <option value="anthropic">Anthropic</option>
          <option value="custom">Custom</option>
        </select>
      </div>
      <div class="field">
        <label for="baseUrl">API base URL</label>
        <input id="baseUrl" class="input mono" [ngModel]="baseUrl()" (ngModelChange)="baseUrl.set($event)" />
      </div>
      <div class="grid-2">
        <div class="field">
          <label for="apiKey">API key <span class="muted">(leave blank to keep current)</span></label>
          <input id="apiKey" class="input mono" type="password" [ngModel]="apiKey()" (ngModelChange)="apiKey.set($event)" placeholder="••••••••" autocomplete="off" />
        </div>
        <div class="field">
          <label for="model">Model name</label>
          <input id="model" class="input mono" [ngModel]="model()" (ngModelChange)="model.set($event)" />
        </div>
      </div>
      <div class="test-row">
        <button class="btn btn-ghost" (click)="testAi()" [disabled]="testing()">
          @if (testing()) { <span class="spinner spinner--dark"></span> Testing… } @else { Test connection }
        </button>
        @if (testResult(); as r) {
          <span class="test-result" [class.ok]="r.ok" [class.bad]="!r.ok">{{ r.ok ? '✓ ' + r.message : '✕ ' + r.message }}</span>
        }
      </div>
    </section>

    <!-- Preferences -->
    <section class="card block">
      <h2>Preferences</h2>
      <div class="field">
        <label for="interval">Check interval — every {{ interval() }} minute{{ interval() === 1 ? '' : 's' }}</label>
        <input id="interval" type="range" min="1" max="30" [ngModel]="interval()" (ngModelChange)="interval.set(+$event)" />
      </div>
      <div class="grid-2">
        <div class="field">
          <label for="maxFolders">Max folder count</label>
          <input id="maxFolders" class="input" type="number" min="1" max="50" [ngModel]="maxFolders()" (ngModelChange)="maxFolders.set(+$event)" />
        </div>
        <div class="field">
          <label for="parentFolder">Parent folder name</label>
          <input id="parentFolder" class="input" [ngModel]="parentFolder()" (ngModelChange)="parentFolder.set($event)" />
        </div>
      </div>
    </section>

    <div class="save-bar">
      @if (saved()) { <span class="saved-note" role="status">✓ Saved</span> }
      @if (saveError()) { <span class="test-result bad" role="alert">{{ saveError() }}</span> }
      <button class="btn btn-primary" (click)="save()" [disabled]="saving()">
        @if (saving()) { <span class="spinner"></span> Saving… } @else { Save changes }
      </button>
    </div>

    <!-- Danger zone -->
    <section class="card block danger">
      <h2>Connection & data</h2>
      <div class="danger-row">
        <div>
          <strong>Disconnect Outlook</strong>
          <p class="muted">Clears the cached sign-in token. You’ll need to reconnect to resume sorting.</p>
        </div>
        <button class="btn btn-danger" (click)="disconnect()" [disabled]="working()">Disconnect</button>
      </div>
      <div class="danger-row">
        <div>
          <strong>Reset all data</strong>
          <p class="muted">Removes config, secrets, processed IDs, and activity history. This cannot be undone.</p>
        </div>
        <button class="btn btn-danger" (click)="reset()" [disabled]="working()">Reset all data</button>
      </div>
    </section>
  `,
  styleUrl: './settings.component.scss',
})
export class SettingsComponent implements OnInit {
  private api = inject(ApiService);
  private router = inject(Router);

  provider = signal<AiProvider>('openai');
  baseUrl = signal('');
  apiKey = signal('');
  model = signal('');
  interval = signal(5);
  maxFolders = signal(10);
  parentFolder = signal('AI Sorted');

  testing = signal(false);
  testResult = signal<{ ok: boolean; message: string } | null>(null);
  saving = signal(false);
  saved = signal(false);
  saveError = signal<string | null>(null);
  working = signal(false);

  ngOnInit(): void {
    this.api.getConfig().subscribe((c) => {
      this.provider.set(c.provider);
      this.baseUrl.set(c.base_url);
      this.model.set(c.model);
      this.interval.set(c.check_interval_minutes);
      this.maxFolders.set(c.max_folder_count);
      this.parentFolder.set(c.parent_folder_name);
    });
  }

  onProviderChange(p: AiProvider): void {
    this.provider.set(p);
    if (PROVIDER_BASE[p]) this.baseUrl.set(PROVIDER_BASE[p]);
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
        api_key: this.apiKey() || undefined,
      })
      .subscribe({
        next: (r) => {
          this.testResult.set(r);
          this.testing.set(false);
        },
        error: (err) => {
          this.testResult.set({ ok: false, message: err?.error?.detail || 'Request failed' });
          this.testing.set(false);
        },
      });
  }

  save(): void {
    this.saving.set(true);
    this.saved.set(false);
    this.saveError.set(null);
    const update: Record<string, unknown> = {
      provider: this.provider(),
      base_url: this.baseUrl(),
      model: this.model().trim(),
      check_interval_minutes: this.interval(),
      max_folder_count: this.maxFolders(),
      parent_folder_name: this.parentFolder().trim() || 'AI Sorted',
    };
    if (this.apiKey()) update['api_key'] = this.apiKey();

    this.api.saveConfig(update).subscribe({
      next: () => {
        this.saving.set(false);
        this.saved.set(true);
        this.apiKey.set('');
        setTimeout(() => this.saved.set(false), 2500);
      },
      error: (err) => {
        this.saving.set(false);
        this.saveError.set(err?.error?.detail || 'Could not save.');
      },
    });
  }

  disconnect(): void {
    if (!confirm('Disconnect Outlook? You will need to sign in again to resume sorting.')) return;
    this.working.set(true);
    this.api.authDisconnect().subscribe({
      next: () => {
        this.working.set(false);
        this.router.navigate(['/setup']);
      },
      error: () => this.working.set(false),
    });
  }

  reset(): void {
    if (!confirm('Reset ALL tidemail data? This clears config, secrets, and history and cannot be undone.')) return;
    this.working.set(true);
    this.api.reset().subscribe({
      next: () => {
        this.working.set(false);
        this.router.navigate(['/setup']);
      },
      error: () => this.working.set(false),
    });
  }
}

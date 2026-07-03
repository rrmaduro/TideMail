import { Routes } from '@angular/router';
import { inject } from '@angular/core';
import { Router } from '@angular/router';
import { map, catchError, of } from 'rxjs';
import { ApiService } from './services/api.service';

/** First-run guard: if Outlook isn't connected or AI isn't configured, force the setup wizard. */
const setupCompleteGuard = () => {
  const api = inject(ApiService);
  const router = inject(Router);
  return api.getConfig().pipe(
    map((cfg) => {
      if (cfg.authenticated && cfg.ai_configured) return true;
      return router.createUrlTree(['/setup']);
    }),
    catchError(() => of(router.createUrlTree(['/setup']))),
  );
};

export const routes: Routes = [
  {
    path: 'setup',
    loadComponent: () => import('./pages/setup/setup.component').then((m) => m.SetupComponent),
  },
  {
    path: '',
    loadComponent: () => import('./pages/shell/shell.component').then((m) => m.ShellComponent),
    canActivate: [setupCompleteGuard],
    children: [
      { path: '', pathMatch: 'full', redirectTo: 'dashboard' },
      {
        path: 'dashboard',
        loadComponent: () =>
          import('./pages/dashboard/dashboard.component').then((m) => m.DashboardComponent),
      },
      {
        path: 'folders',
        loadComponent: () =>
          import('./pages/folders/folders.component').then((m) => m.FoldersComponent),
      },
      {
        path: 'activity',
        loadComponent: () =>
          import('./pages/activity/activity.component').then((m) => m.ActivityComponent),
      },
      {
        path: 'settings',
        loadComponent: () =>
          import('./pages/settings/settings.component').then((m) => m.SettingsComponent),
      },
    ],
  },
  { path: '**', redirectTo: '' },
];

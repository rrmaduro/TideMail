import { HttpClient } from '@angular/common/http';
import { Injectable, inject } from '@angular/core';
import { Observable } from 'rxjs';
import {
  ActivityPage,
  ActivitySummary,
  AppConfig,
  AuthStatus,
  ConfigUpdate,
  DeviceFlow,
  FolderInfo,
  FolderMessage,
  Status,
  TestAiResult,
} from './models';

/** Typed wrappers over every FastAPI endpoint.
 *  Paths are relative so the same code works both same-origin (served by FastAPI)
 *  and via the dev-server proxy (proxy.conf.json). */
@Injectable({ providedIn: 'root' })
export class ApiService {
  private http = inject(HttpClient);

  // All backend endpoints are namespaced under /api so they never collide with
  // the app's own client-side routes (e.g. /folders, /activity).
  private readonly base = '/api';

  // --- watcher control ---
  getStatus(): Observable<Status> {
    return this.http.get<Status>(`${this.base}/status`);
  }
  start(): Observable<Status> {
    return this.http.post<Status>(`${this.base}/start`, {});
  }
  stop(): Observable<Status> {
    return this.http.post<Status>(`${this.base}/stop`, {});
  }
  scan(): Observable<Status & { scanned: number; sorted: number; errors: number }> {
    return this.http.post<Status & { scanned: number; sorted: number; errors: number }>(
      `${this.base}/scan`,
      {},
    );
  }
  undoAvailable(): Observable<{ available: number }> {
    return this.http.get<{ available: number }>(`${this.base}/undo`);
  }
  undoLastScan(): Observable<{ undone: number; failed: number; available: number }> {
    return this.http.post<{ undone: number; failed: number; available: number }>(`${this.base}/undo`, {});
  }

  // --- activity ---
  getActivity(params: {
    folder?: string;
    since?: string;
    until?: string;
    urgent_only?: boolean;
    q?: string;
    page?: number;
    page_size?: number;
  } = {}): Observable<ActivityPage> {
    const query: Record<string, string> = {};
    for (const [k, v] of Object.entries(params)) {
      if (v !== undefined && v !== null && v !== '') query[k] = String(v);
    }
    return this.http.get<ActivityPage>(`${this.base}/activity`, { params: query });
  }
  getActivitySummary(): Observable<ActivitySummary> {
    return this.http.get<ActivitySummary>(`${this.base}/activity/summary`);
  }
  clearActivity(): Observable<{ ok: boolean }> {
    return this.http.post<{ ok: boolean }>(`${this.base}/activity/clear`, {});
  }

  // --- folders ---
  getFolders(): Observable<{ folders: FolderInfo[] }> {
    return this.http.get<{ folders: FolderInfo[] }>(`${this.base}/folders`);
  }
  getFolderEmails(folderId: string, top = 5): Observable<{ messages: FolderMessage[] }> {
    return this.http.get<{ messages: FolderMessage[] }>(
      `${this.base}/folders/${encodeURIComponent(folderId)}/emails`,
      { params: { top: String(top) } },
    );
  }
  renameFolder(folderId: string, name: string): Observable<{ id: string; name: string }> {
    return this.http.patch<{ id: string; name: string }>(
      `${this.base}/folders/${encodeURIComponent(folderId)}`,
      { name },
    );
  }
  deleteFolder(folderId: string): Observable<{ ok: boolean }> {
    return this.http.delete<{ ok: boolean }>(`${this.base}/folders/${encodeURIComponent(folderId)}`);
  }
  cleanupFolders(): Observable<{ deleted: number }> {
    return this.http.post<{ deleted: number }>(`${this.base}/folders/cleanup`, {});
  }

  // --- config ---
  getConfig(): Observable<AppConfig> {
    return this.http.get<AppConfig>(`${this.base}/config`);
  }
  saveConfig(update: ConfigUpdate): Observable<AppConfig> {
    return this.http.post<AppConfig>(`${this.base}/config`, update);
  }

  // --- auth ---
  authStart(clientId?: string): Observable<DeviceFlow> {
    return this.http.post<DeviceFlow>(`${this.base}/auth/start`, clientId ? { client_id: clientId } : {});
  }
  authStatus(): Observable<AuthStatus> {
    return this.http.get<AuthStatus>(`${this.base}/auth/status`);
  }
  authDisconnect(): Observable<{ ok: boolean }> {
    return this.http.post<{ ok: boolean }>(`${this.base}/auth/disconnect`, {});
  }

  // --- AI test ---
  testAi(payload: Partial<ConfigUpdate> = {}): Observable<TestAiResult> {
    return this.http.post<TestAiResult>(`${this.base}/test-ai`, payload);
  }

  // --- reset ---
  reset(): Observable<{ ok: boolean }> {
    return this.http.post<{ ok: boolean }>(`${this.base}/reset`, {});
  }
}

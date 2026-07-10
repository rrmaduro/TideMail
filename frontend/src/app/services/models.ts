/** Shared API types, mirroring the FastAPI backend responses. */

export type AiProvider = 'eden' | 'openai' | 'anthropic' | 'custom';

export interface AppConfig {
  client_id: string;
  provider: AiProvider;
  base_url: string;
  model: string;
  check_interval_minutes: number;
  max_folder_count: number;
  parent_folder_name: string;
  max_scan_messages: number;
  overflow_folder_name: string;
  auto_scan: boolean;
  ai_configured?: boolean;
  authenticated?: boolean;
  data_dir?: string;
}

export interface ConfigUpdate {
  client_id?: string;
  provider?: AiProvider;
  base_url?: string;
  model?: string;
  check_interval_minutes?: number;
  max_folder_count?: number;
  parent_folder_name?: string;
  max_scan_messages?: number;
  overflow_folder_name?: string;
  auto_scan?: boolean;
  api_key?: string;
}

export interface ActivitySummary {
  total: number;
  sorted: number;
  skipped: number;
  urgent: number;
}

export interface ScanProgress {
  scanned: number;
  total: number;
  current: string | null;
  sorted: number;
  errors: number;
}

export interface Status {
  running: boolean;
  scanning: boolean;
  last_scan: string | null;
  last_error: string | null;
  progress: ScanProgress;
  emails_sorted_today: number;
  urgent_flagged_today: number;
  authenticated: boolean;
}

export interface ActivityItem {
  id: string;
  timestamp: string;
  sender_name: string;
  sender_address: string;
  subject: string;
  folder: string;
  urgent: boolean;
  reasoning: string;
  raw_response: string;
  error?: boolean;
}

export interface ActivityPage {
  items: ActivityItem[];
  total: number;
  page: number;
  page_size: number;
}

export interface FolderLastMessage {
  subject: string;
  received: string | null;
  sender_name: string;
}

export interface FolderInfo {
  id: string;
  name: string;
  count: number;
  last_message: FolderLastMessage | null;
}

export interface FolderMessage {
  id: string;
  subject: string;
  bodyPreview?: string;
  receivedDateTime?: string;
  from?: { emailAddress?: { name?: string; address?: string } };
}

export interface DeviceFlow {
  user_code: string;
  verification_uri: string;
  message: string;
  expires_in: number | null;
}

export interface AuthStatus {
  status: 'idle' | 'pending' | 'success' | 'error';
  detail: string | null;
  authenticated: boolean;
}

export interface TestAiResult {
  ok: boolean;
  message: string;
}

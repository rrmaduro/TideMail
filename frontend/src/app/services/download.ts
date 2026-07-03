/** Client-side file downloads (no server round-trip needed). */

function triggerDownload(blob: Blob, filename: string): void {
  const url = URL.createObjectURL(blob);
  const a = document.createElement('a');
  a.href = url;
  a.download = filename;
  document.body.appendChild(a);
  a.click();
  a.remove();
  URL.revokeObjectURL(url);
}

export function downloadJson(data: unknown, filename: string): void {
  triggerDownload(new Blob([JSON.stringify(data, null, 2)], { type: 'application/json' }), filename);
}

function csvCell(value: unknown): string {
  const s = value === null || value === undefined ? '' : String(value);
  // Escape per RFC 4180: wrap in quotes and double any inner quotes.
  return `"${s.replace(/"/g, '""')}"`;
}

export function downloadCsv(rows: Record<string, unknown>[], columns: string[], filename: string): void {
  const header = columns.map(csvCell).join(',');
  const body = rows.map((r) => columns.map((c) => csvCell(r[c])).join(',')).join('\r\n');
  const csv = `${header}\r\n${body}`;
  // Prepend BOM so Excel reads UTF-8 correctly.
  triggerDownload(new Blob(['﻿' + csv], { type: 'text/csv;charset=utf-8' }), filename);
}

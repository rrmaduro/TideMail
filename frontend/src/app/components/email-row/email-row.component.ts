import { Component, computed, input } from '@angular/core';
import { FolderChipComponent } from '../folder-chip/folder-chip.component';
import { UrgentBadgeComponent } from '../urgent-badge/urgent-badge.component';
import { ActivityItem } from '../../services/models';

/** One processed-email row:
 *  [avatar initial] [sender] [subject] → [folder chip] [urgent?] [time] */
@Component({
  selector: 'app-email-row',
  standalone: true,
  imports: [FolderChipComponent, UrgentBadgeComponent],
  template: `
    <div class="row">
      <span class="avatar" [style.background]="avatarColor()" aria-hidden="true">{{ initial() }}</span>

      <div class="meta">
        <div class="line1">
          <span class="sender">{{ item().sender_name || item().sender_address || 'Unknown' }}</span>
          @if (item().urgent) {
            <app-urgent-badge />
          }
        </div>
        <div class="subject" [title]="item().subject">{{ item().subject }}</div>
      </div>

      <span class="arrow" aria-hidden="true">
        <svg viewBox="0 0 24 24" width="16" height="16">
          <path d="M5 12h14M13 6l6 6-6 6" fill="none" stroke="currentColor" stroke-width="2"
            stroke-linecap="round" stroke-linejoin="round" />
        </svg>
      </span>

      <app-folder-chip [name]="item().folder" />

      <time class="time" [attr.datetime]="item().timestamp">{{ relativeTime() }}</time>
    </div>
  `,
  styles: [
    `
      .row {
        display: grid;
        grid-template-columns: auto minmax(0, 1fr) auto auto auto;
        align-items: center;
        gap: var(--sp-3);
        padding: var(--sp-3) var(--sp-4);
        border-bottom: 1px solid var(--border);
      }
      .row:last-child {
        border-bottom: none;
      }
      .avatar {
        display: grid;
        place-items: center;
        width: 34px;
        height: 34px;
        border-radius: 50%;
        color: #fff;
        font-size: 14px;
        font-weight: 700;
        flex-shrink: 0;
      }
      .meta {
        min-width: 0;
      }
      .line1 {
        display: flex;
        align-items: center;
        gap: var(--sp-2);
      }
      .sender {
        font-weight: 600;
        font-size: 14px;
        color: var(--text);
        white-space: nowrap;
        overflow: hidden;
        text-overflow: ellipsis;
      }
      .subject {
        font-size: 13px;
        color: var(--text-muted);
        white-space: nowrap;
        overflow: hidden;
        text-overflow: ellipsis;
      }
      .arrow {
        color: var(--text-subtle);
        display: inline-flex;
      }
      .time {
        font-size: 12px;
        color: var(--text-subtle);
        white-space: nowrap;
        font-variant-numeric: tabular-nums;
      }
      @media (max-width: 720px) {
        .row {
          grid-template-columns: auto minmax(0, 1fr) auto;
        }
        .arrow,
        .time {
          display: none;
        }
      }
    `,
  ],
})
export class EmailRowComponent {
  item = input.required<ActivityItem>();

  initial = computed(() => {
    const name = this.item().sender_name || this.item().sender_address || '?';
    return name.trim().charAt(0).toUpperCase() || '?';
  });

  avatarColor = computed(() => {
    const src = this.item().sender_address || this.item().sender_name || '';
    let hash = 0;
    for (let i = 0; i < src.length; i++) hash = (hash << 5) - hash + src.charCodeAt(i);
    const hue = Math.abs(hash) % 360;
    return `hsl(${hue} 55% 45%)`;
  });

  relativeTime = computed(() => {
    const then = new Date(this.item().timestamp).getTime();
    if (Number.isNaN(then)) return '';
    const diff = Date.now() - then;
    const s = Math.round(diff / 1000);
    if (s < 60) return 'just now';
    const m = Math.round(s / 60);
    if (m < 60) return `${m}m ago`;
    const h = Math.round(m / 60);
    if (h < 24) return `${h}h ago`;
    const d = Math.round(h / 24);
    if (d < 7) return `${d}d ago`;
    return new Date(this.item().timestamp).toLocaleDateString();
  });
}

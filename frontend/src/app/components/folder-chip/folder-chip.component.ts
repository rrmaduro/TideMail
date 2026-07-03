import { Component, computed, input } from '@angular/core';
import { folderColor } from './folder-color';

/** Small rounded pill with a soft, name-derived background tint. */
@Component({
  selector: 'app-folder-chip',
  standalone: true,
  template: `
    <span
      class="chip"
      [style.background]="color().bg"
      [style.color]="color().ink"
      [title]="name()"
    >
      <span class="dot" [style.background]="color().dot" aria-hidden="true"></span>
      {{ name() }}
    </span>
  `,
  styles: [
    `
      .chip {
        display: inline-flex;
        align-items: center;
        gap: 6px;
        max-width: 100%;
        padding: 3px 10px;
        border-radius: var(--r-pill);
        font-size: 12.5px;
        font-weight: 600;
        white-space: nowrap;
        overflow: hidden;
        text-overflow: ellipsis;
      }
      .dot {
        width: 7px;
        height: 7px;
        border-radius: 50%;
        flex-shrink: 0;
      }
    `,
  ],
})
export class FolderChipComponent {
  name = input.required<string>();
  color = computed(() => folderColor(this.name()));
}

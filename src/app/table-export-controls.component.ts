import { Component, EventEmitter, Input, Output } from '@angular/core';

/** Shared, accessible Excel/PDF export controls for all data tables.
 * Table-specific export logic stays in the parent component.
 */
@Component({
  selector: 'app-table-export-controls',
  standalone: true,
  template: `
    <div class="table-export-toolbar shared-table-export-toolbar" [attr.aria-label]="ariaLabel">
      <button type="button" class="table-export-icon" title="Download Excel file" aria-label="Download Excel file" (click)="excelClick.emit()">
        <svg viewBox="0 0 24 24" aria-hidden="true" focusable="false"><path d="M5 3.75h9l5 5v11.5H5z"/><path d="M14 3.75v5h5M8 12h8M8 15.5h8M8 19h8M11 12v7M15 12v7"/></svg>
      </button>
      <button type="button" class="table-export-icon pdf-export-icon" title="Download PDF" aria-label="Download PDF" (click)="pdfClick.emit()">
        <svg viewBox="0 0 24 24" aria-hidden="true" focusable="false"><path d="M5 3.75h9l5 5v11.5H5z"/><path d="M14 3.75v5h5"/><path d="M7.2 15.7h1.5a1.2 1.2 0 0 0 0-2.4H7.2v4.4M12 17.7v-4.4h1.1a2.2 2.2 0 0 1 0 4.4zM16 17.7v-4.4h2.7M16 15.4h2.2"/></svg>
      </button>
    </div>
  `
})
export class TableExportControlsComponent {
  @Input() ariaLabel = 'Export table';
  @Output() excelClick = new EventEmitter<void>();
  @Output() pdfClick = new EventEmitter<void>();
}

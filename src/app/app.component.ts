import { Component } from '@angular/core';
import { PDFDocument } from 'pdf-lib';

@Component({
  selector: 'app-root',
  templateUrl: './app.component.html',
  styleUrls: ['./app.component.scss']
})
export class AppComponent {
  files: File[] = [];
  mergedPdfUrl: string | null = null;
  isMerging = false;
  errorMessage: string | null = null;
  isDragOver = false;

  // drag-to-reorder state
  dragSrcIndex: number | null = null;
  dragOverIndex: number | null = null;

  onFileSelected(event: Event): void {
    const input = event.target as HTMLInputElement;
    if (input.files) {
      this.addFiles(Array.from(input.files));
      input.value = '';
    }
  }

  onDragOver(event: DragEvent): void {
    event.preventDefault();
    this.isDragOver = true;
  }

  onDragLeave(): void {
    this.isDragOver = false;
  }

  onDrop(event: DragEvent): void {
    event.preventDefault();
    this.isDragOver = false;
    if (event.dataTransfer?.files) {
      this.addFiles(Array.from(event.dataTransfer.files));
    }
  }

  private addFiles(newFiles: File[]): void {
    const pdfs = newFiles.filter(f => f.type === 'application/pdf');
    const rejected = newFiles.length - pdfs.length;
    this.errorMessage = rejected > 0 ? `${rejected} file/i ignorati: solo PDF sono accettati.` : null;
    this.files = [...this.files, ...pdfs];
    this.mergedPdfUrl = null;
  }

  removeFile(index: number): void {
    this.files = this.files.filter((_, i) => i !== index);
    this.mergedPdfUrl = null;
  }

  // ── drag-to-reorder handlers ──────────────────────────────────
  onItemDragStart(event: DragEvent, index: number): void {
    this.dragSrcIndex = index;
    event.dataTransfer!.effectAllowed = 'move';
  }

  onItemDragOver(event: DragEvent, index: number): void {
    event.preventDefault();
    event.dataTransfer!.dropEffect = 'move';
    this.dragOverIndex = index;
  }

  onItemDragLeave(): void {
    this.dragOverIndex = null;
  }

  onItemDrop(event: DragEvent, targetIndex: number): void {
    event.stopPropagation();
    if (this.dragSrcIndex === null || this.dragSrcIndex === targetIndex) {
      this.dragSrcIndex = null;
      this.dragOverIndex = null;
      return;
    }
    const arr = [...this.files];
    const [moved] = arr.splice(this.dragSrcIndex, 1);
    arr.splice(targetIndex, 0, moved);
    this.files = arr;
    this.mergedPdfUrl = null;
    this.dragSrcIndex = null;
    this.dragOverIndex = null;
  }

  onItemDragEnd(): void {
    this.dragSrcIndex = null;
    this.dragOverIndex = null;
  }

  async mergePdfs(): Promise<void> {
    if (this.files.length < 2) return;
    this.isMerging = true;
    this.errorMessage = null;
    this.mergedPdfUrl = null;

    try {
      const merged = await PDFDocument.create();
      for (const file of this.files) {
        const bytes = await file.arrayBuffer();
        const doc = await PDFDocument.load(bytes);
        const pages = await merged.copyPages(doc, doc.getPageIndices());
        pages.forEach(p => merged.addPage(p));
      }
      const mergedBytes = await merged.save();
      const blob = new Blob([mergedBytes], { type: 'application/pdf' });
      this.mergedPdfUrl = URL.createObjectURL(blob);
    } catch (err) {
      this.errorMessage = 'Errore durante il merge. Verifica che i PDF non siano protetti da password.';
    } finally {
      this.isMerging = false;
    }
  }

  downloadMerged(): void {
    if (!this.mergedPdfUrl) return;
    const a = document.createElement('a');
    a.href = this.mergedPdfUrl;
    a.download = 'merged.pdf';
    a.click();
  }

  reset(): void {
    this.files = [];
    this.mergedPdfUrl = null;
    this.errorMessage = null;
  }

  formatSize(bytes: number): string {
    if (bytes < 1024) return bytes + ' B';
    if (bytes < 1024 * 1024) return (bytes / 1024).toFixed(1) + ' KB';
    return (bytes / (1024 * 1024)).toFixed(1) + ' MB';
  }
}

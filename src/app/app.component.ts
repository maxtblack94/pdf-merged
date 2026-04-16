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
  mergedPdfBytes: Uint8Array | null = null;
  lowQualityPdfBytes: Uint8Array | null = null;
  isMerging = false;
  isPreparingDownload = false;
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
    this.clearMergedResult();
  }

  removeFile(index: number): void {
    this.files = this.files.filter((_, i) => i !== index);
    this.clearMergedResult();
  }

  // ── drag-to-reorder handlers ──────────────────────────────────
  onItemDragStart(event: DragEvent, index: number): void {
    this.dragSrcIndex = index;
    if (event.dataTransfer) {
      event.dataTransfer.effectAllowed = 'move';
    }
  }

  onItemDragOver(event: DragEvent, index: number): void {
    event.preventDefault();
    if (event.dataTransfer) {
      event.dataTransfer.dropEffect = 'move';
    }
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
    this.clearMergedResult();
    this.dragSrcIndex = null;
    this.dragOverIndex = null;
  }

  onItemDragEnd(): void {
    this.dragSrcIndex = null;
    this.dragOverIndex = null;
  }

  async mergePdfs(): Promise<void> {
    if (this.files.length < 2) {
      return;
    }
    this.isMerging = true;
    this.errorMessage = null;
    this.clearMergedResult();

    try {
      const merged = await PDFDocument.create();
      for (const file of this.files) {
        const bytes = await file.arrayBuffer();
        const doc = await PDFDocument.load(bytes);
        const pages = await merged.copyPages(doc, doc.getPageIndices());
        pages.forEach(p => merged.addPage(p));
      }
      const mergedBytes = await merged.save({ useObjectStreams: true, addDefaultPage: false });
      const blob = new Blob([mergedBytes], { type: 'application/pdf' });
      this.mergedPdfBytes = mergedBytes;
      this.mergedPdfUrl = URL.createObjectURL(blob);
    } catch (err) {
      this.errorMessage = 'Errore durante il merge. Verifica che i PDF non siano protetti da password.';
    } finally {
      this.isMerging = false;
    }
  }

  async downloadMerged(quality: 'high' | 'low'): Promise<void> {
    if (!this.mergedPdfBytes) {
      return;
    }

    this.errorMessage = null;
    this.isPreparingDownload = true;

    try {
      const bytesToDownload = quality === 'low'
        ? await this.buildLowQualityPdf()
        : this.mergedPdfBytes;
      const filename = quality === 'low' ? 'merged-low.pdf' : 'merged-high.pdf';
      this.triggerDownload(bytesToDownload, filename);
    } catch (err) {
      this.errorMessage = 'Errore durante la preparazione del download.';
    } finally {
      this.isPreparingDownload = false;
    }
  }

  private async buildLowQualityPdf(): Promise<Uint8Array> {
    if (this.lowQualityPdfBytes) {
      return this.lowQualityPdfBytes;
    }
    if (!this.mergedPdfBytes) {
      throw new Error('Nessun PDF unito disponibile.');
    }

    await import('pdfjs-dist/legacy/build/pdf.worker.entry');
    const pdfjsLib: any = await import('pdfjs-dist/legacy/build/pdf');
    const loadingTask = pdfjsLib.getDocument({ data: this.mergedPdfBytes });
    const sourcePdf: any = await loadingTask.promise;
    const lowQualityDoc = await PDFDocument.create();
    const lowQualityJpegQuality = 0.68;

    try {
      for (let pageIndex = 1; pageIndex <= sourcePdf.numPages; pageIndex++) {
        const sourcePage = await sourcePdf.getPage(pageIndex);
        const outputViewport = sourcePage.getViewport({ scale: 1 });
        const renderViewport = outputViewport;

        const canvas = document.createElement('canvas');
        canvas.width = Math.max(1, Math.floor(renderViewport.width));
        canvas.height = Math.max(1, Math.floor(renderViewport.height));

        const context = canvas.getContext('2d');
        if (!context) {
          throw new Error('Impossibile inizializzare il canvas per la compressione PDF.');
        }
        context.imageSmoothingEnabled = true;
        context.imageSmoothingQuality = 'high';

        await sourcePage.render({
          canvasContext: context,
          viewport: renderViewport
        }).promise;

        const jpegDataUrl = canvas.toDataURL('image/jpeg', lowQualityJpegQuality);
        const jpegImage = await lowQualityDoc.embedJpg(this.dataUrlToUint8Array(jpegDataUrl));
        const page = lowQualityDoc.addPage([outputViewport.width, outputViewport.height]);

        page.drawImage(jpegImage, {
          x: 0,
          y: 0,
          width: outputViewport.width,
          height: outputViewport.height
        });

        sourcePage.cleanup();
        canvas.width = 0;
        canvas.height = 0;
      }

      this.lowQualityPdfBytes = await lowQualityDoc.save({
        useObjectStreams: true,
        addDefaultPage: false
      });

      return this.lowQualityPdfBytes;
    } finally {
      if (typeof sourcePdf.destroy === 'function') {
        await sourcePdf.destroy();
      }
    }
  }

  private dataUrlToUint8Array(dataUrl: string): Uint8Array {
    const parts = dataUrl.split(',');
    if (parts.length < 2) {
      throw new Error('Formato data URL non valido.');
    }
    const binary = atob(parts[1]);
    const bytes = new Uint8Array(binary.length);
    for (let i = 0; i < binary.length; i++) {
      bytes[i] = binary.charCodeAt(i);
    }
    return bytes;
  }

  private triggerDownload(bytes: Uint8Array, filename: string): void {
    const blob = new Blob([bytes], { type: 'application/pdf' });
    const url = URL.createObjectURL(blob);
    const a = document.createElement('a');
    a.href = url;
    a.download = filename;
    a.click();
    URL.revokeObjectURL(url);
  }

  reset(): void {
    this.files = [];
    this.clearMergedResult();
    this.errorMessage = null;
  }

  private clearMergedResult(): void {
    if (this.mergedPdfUrl) {
      URL.revokeObjectURL(this.mergedPdfUrl);
    }
    this.mergedPdfUrl = null;
    this.mergedPdfBytes = null;
    this.lowQualityPdfBytes = null;
  }

  formatSize(bytes: number): string {
    if (bytes < 1024) {
      return bytes + ' B';
    }
    if (bytes < 1024 * 1024) {
      return (bytes / 1024).toFixed(1) + ' KB';
    }
    return (bytes / (1024 * 1024)).toFixed(1) + ' MB';
  }
}

import { ChangeDetectorRef, Component, NgZone, inject } from '@angular/core';

interface MergeWorkerFilePayload {
  name: string;
  bytes: ArrayBuffer;
}
interface MergeWorkerRequest {
  type: 'merge';
  files: MergeWorkerFilePayload[];
}
interface MergeWorkerSuccessResponse {
  type: 'success';
  mergedBytes: ArrayBuffer;
}
interface MergeWorkerErrorResponse {
  type: 'error';
  message: string;
}
type MergeWorkerResponse = MergeWorkerSuccessResponse | MergeWorkerErrorResponse;

@Component({
    selector: 'app-root',
    templateUrl: './app.component.html',
    styleUrls: ['./app.component.scss'],
    standalone: false
})
export class AppComponent {
  private readonly mergeWorkerTimeoutMs = 5 * 60 * 1000;
  private readonly zone = inject(NgZone);
  private readonly cdr = inject(ChangeDetectorRef);

  files: File[] = [];
  mergedPdfUrl: string | null = null;
  mergedPdfBytes: Uint8Array | null = null;
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
    if (this.files.length < 2 || this.isMerging) {
      return;
    }
    this.isMerging = true;
    this.errorMessage = null;
    this.clearMergedResult();

    try {
      const mergedBytes = await this.mergeWithWorker(this.files);
      const blob = new Blob([this.toArrayBuffer(mergedBytes)], { type: 'application/pdf' });
      this.mergedPdfBytes = mergedBytes;
      this.mergedPdfUrl = URL.createObjectURL(blob);
    } catch (error: unknown) {
      this.errorMessage = this.formatMergeError(error);
    } finally {
      this.isMerging = false;
      this.cdr.detectChanges();
    }
  }

  async downloadMerged(): Promise<void> {
    if (!this.mergedPdfBytes) {
      return;
    }

    this.errorMessage = null;
    this.isPreparingDownload = true;

    try {
      this.triggerDownload(this.mergedPdfBytes, 'merged-high.pdf');
      await this.sleep(200);
      this.reset();
    } catch (error: unknown) {
      this.errorMessage = this.formatDownloadError(error);
    } finally {
      this.isPreparingDownload = false;
    }
  }

  private async mergeWithWorker(inputFiles: File[]): Promise<Uint8Array> {
    if (typeof Worker === 'undefined') {
      throw new Error('Web Worker non supportato dal browser.');
    }

    const files = await Promise.all(
      inputFiles.map(async file => ({
        name: file.name,
        bytes: await file.arrayBuffer()
      }))
    );

    const worker = new Worker(new URL('./app.worker', import.meta.url), { type: 'module' });
    const transferableBuffers = files.map(file => file.bytes);
    const payload: MergeWorkerRequest = { type: 'merge', files };

    return new Promise<Uint8Array>((resolve, reject) => {
      let settled = false;
      const resolveInZone = (value: Uint8Array): void => {
        this.zone.run(() => resolve(value));
      };
      const rejectInZone = (error: Error): void => {
        this.zone.run(() => reject(error));
      };

      const finalize = (callback: () => void): void => {
        if (settled) {
          return;
        }
        settled = true;
        clearTimeout(timeoutId);
        worker.terminate();
        callback();
      };

      const timeoutId = setTimeout(() => {
        finalize(() => rejectInZone(new Error('Timeout durante il merge.')));
      }, this.mergeWorkerTimeoutMs);
 // Gestione messaggi dal worker
      worker.onmessage = (event: MessageEvent<MergeWorkerResponse>) => {
        const response = event.data;
        if (response?.type === 'success' && response.mergedBytes instanceof ArrayBuffer) {
          finalize(() => resolveInZone(new Uint8Array(response.mergedBytes)));
          return;
        }
        if (response?.type === 'error') {
          finalize(() => rejectInZone(new Error(response.message || 'Errore durante il merge.')));
          return;
        }
        finalize(() => rejectInZone(new Error('Risposta non valida dal worker di merge.')));
      };

      worker.onerror = (event: ErrorEvent) => {
        const message = event.message || 'Errore interno del worker di merge.';
        finalize(() => rejectInZone(new Error(message)));
      };

      worker.onmessageerror = () => {
        finalize(() => rejectInZone(new Error('Errore di comunicazione con il worker di merge.')));
      };

      try {
        worker.postMessage(payload, transferableBuffers);
      } catch (error: unknown) {
        const message = error instanceof Error ? error.message : 'Invio dati al worker non riuscito.';
        finalize(() => rejectInZone(new Error(message)));
      }
    });
  }

  private triggerDownload(bytes: Uint8Array, filename: string): void {
    const blob = new Blob([this.toArrayBuffer(bytes)], { type: 'application/pdf' });
    const url = URL.createObjectURL(blob);
    const link = document.createElement('a');
    link.href = url;
    link.download = filename;
    link.style.display = 'none';
    document.body.appendChild(link);
    link.click();
    document.body.removeChild(link);
    setTimeout(() => URL.revokeObjectURL(url), 30000);
  }

  private toArrayBuffer(bytes: Uint8Array): ArrayBuffer {
    return bytes.buffer.slice(bytes.byteOffset, bytes.byteOffset + bytes.byteLength) as ArrayBuffer;
  }

  private async sleep(ms: number): Promise<void> {
    await new Promise<void>(resolve => setTimeout(resolve, ms));
  }

  private formatMergeError(error: unknown): string {
    const message = error instanceof Error ? error.message : '';
    if (message.startsWith('Impossibile leggere')) {
      return message;
    }
    if (message.startsWith('Timeout durante')) {
      return `${message} Riprova con meno file o PDF meno pesanti.`;
    }
    if (message.toLowerCase().includes('password')) {
      return 'Errore durante il merge. Uno dei PDF sembra protetto da password.';
    }
    return 'Errore durante il merge. Verifica che i PDF non siano protetti da password.';
  }

  private formatDownloadError(error: unknown): string {
    const message = error instanceof Error ? error.message : '';
    if (message) {
      return message;
    }
    return 'Errore durante la preparazione del download.';
  }

  reset(): void {
    this.files = [];
    this.clearMergedResult();
    this.errorMessage = null;
    this.isDragOver = false;
    this.dragSrcIndex = null;
    this.dragOverIndex = null;
  }

  private clearMergedResult(): void {
    if (this.mergedPdfUrl) {
      URL.revokeObjectURL(this.mergedPdfUrl);
    }
    this.mergedPdfUrl = null;
    this.mergedPdfBytes = null;
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

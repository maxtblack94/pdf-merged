import { ChangeDetectorRef, Component, NgZone, inject } from '@angular/core';
import { PDFDocument, PDFFont, StandardFonts, rgb } from 'pdf-lib';
import JSZip from 'jszip';

interface ConvertDocRequest {
  fileName: string;
  bytes: ArrayBuffer;
}

interface ElectronApi {
  convertDocToPdf: (request: ConvertDocRequest) => Promise<ArrayBuffer | Uint8Array>;
}

declare global {
  interface Window {
    electronApi?: ElectronApi;
  }
}

interface MergeWorkerFilePayload {
  name: string;
  mimeType: string;
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
  private readonly docMimeType = 'application/msword';
  private readonly docxMimeType = 'application/vnd.openxmlformats-officedocument.wordprocessingml.document';
  private readonly supportedInputMimeTypes = new Set([
    'application/pdf',
    'image/png',
    'image/jpeg',
    this.docMimeType,
    'application/vnd.ms-word',
    this.docxMimeType
  ]);
  private readonly zone = inject(NgZone);
  private readonly cdr = inject(ChangeDetectorRef);

  files: File[] = [];
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
    const acceptedFiles = newFiles.filter(file => this.isSupportedInputFile(file));
    const rejected = newFiles.length - acceptedFiles.length;
    this.errorMessage = rejected > 0 ? `${rejected} file/i ignorati: sono accettati solo PDF, PNG, JPEG, DOC o DOCX.` : null;
    this.files = [...this.files, ...acceptedFiles];
  }

  removeFile(index: number): void {
    this.files = this.files.filter((_, i) => i !== index);
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
    this.dragSrcIndex = null;
    this.dragOverIndex = null;
  }

  onItemDragEnd(): void {
    this.dragSrcIndex = null;
    this.dragOverIndex = null;
  }

  async mergePdfs(): Promise<void> {
    if (this.files.length === 0 || this.isMerging) {
      return;
    }
    this.isMerging = true;
    this.errorMessage = null;

    try {
      const mergedBytes = await this.mergeWithWorker(this.files);
      this.triggerDownload(mergedBytes, 'output.pdf');
      await this.sleep(200);
      this.reset();
    } catch (error: unknown) {
      this.errorMessage = this.formatMergeError(error);
    } finally {
      this.isMerging = false;
      this.cdr.detectChanges();
    }
  }

  private async mergeWithWorker(inputFiles: File[]): Promise<Uint8Array> {
    if (typeof Worker === 'undefined') {
      throw new Error('Web Worker non supportato dal browser.');
    }

    const files = await Promise.all(
      inputFiles.map(file => this.prepareFileForMerge(file))
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

  private async prepareFileForMerge(file: File): Promise<MergeWorkerFilePayload> {
    const mimeType = this.resolveSupportedMimeType(file);
    if (mimeType === this.docMimeType) {
      const convertedPdfBytes = await this.convertDocToPdf(file);
      return {
        name: this.toPdfFileName(file.name),
        mimeType: 'application/pdf',
        bytes: this.toArrayBuffer(convertedPdfBytes)
      };
    }

    if (mimeType === this.docxMimeType) {
      const convertedPdfBytes = await this.convertDocxToPdf(file);
      return {
        name: this.toPdfFileName(file.name),
        mimeType: 'application/pdf',
        bytes: this.toArrayBuffer(convertedPdfBytes)
      };
    }

    return {
      name: file.name,
      mimeType,
      bytes: await file.arrayBuffer()
    };
  }

  private isSupportedInputFile(file: File): boolean {
    const mimeType = file.type.toLowerCase();
    if (this.supportedInputMimeTypes.has(mimeType)) {
      return true;
    }

    const fileName = file.name.toLowerCase();
    return fileName.endsWith('.pdf')
      || fileName.endsWith('.png')
      || fileName.endsWith('.jpg')
      || fileName.endsWith('.jpeg')
      || fileName.endsWith('.doc')
      || fileName.endsWith('.docx');
  }

  private resolveSupportedMimeType(file: File): string {
    const mimeType = file.type.toLowerCase();
    if (mimeType === 'image/jpg') {
      return 'image/jpeg';
    }
    if (mimeType === 'application/vnd.ms-word') {
      return this.docMimeType;
    }
    if (this.supportedInputMimeTypes.has(mimeType)) {
      return mimeType;
    }

    const fileName = file.name.toLowerCase();
    if (fileName.endsWith('.pdf')) {
      return 'application/pdf';
    }
    if (fileName.endsWith('.png')) {
      return 'image/png';
    }
    if (fileName.endsWith('.jpg') || fileName.endsWith('.jpeg')) {
      return 'image/jpeg';
    }
    if (fileName.endsWith('.doc')) {
      return this.docMimeType;
    }
    if (fileName.endsWith('.docx')) {
      return this.docxMimeType;
    }

    throw new Error(`Formato non supportato per "${file.name}". Sono accettati PDF, PNG, JPEG, DOC o DOCX.`);
  }

  private toPdfFileName(fileName: string): string {
    const lowerName = fileName.toLowerCase();
    if (lowerName.endsWith('.doc')) {
      return `${fileName.slice(0, -4)}.pdf`;
    }
    if (lowerName.endsWith('.docx')) {
      return `${fileName.slice(0, -5)}.pdf`;
    }
    return `${fileName}.pdf`;
  }

  private async convertDocToPdf(file: File): Promise<Uint8Array> {
    const electronApi = window.electronApi;
    if (!electronApi || typeof electronApi.convertDocToPdf !== 'function') {
      throw new Error('La conversione dei file .doc è disponibile solo nell’app desktop Windows.');
    }

    try {
      const converted = await electronApi.convertDocToPdf({
        fileName: file.name,
        bytes: await file.arrayBuffer()
      });
      return converted instanceof Uint8Array ? converted : new Uint8Array(converted);
    } catch (error: unknown) {
      const reason = error instanceof Error ? error.message : 'errore sconosciuto';
      throw new Error(`Impossibile convertire "${file.name}" in PDF: ${reason}`);
    }
  }

  private async convertDocxToPdf(file: File): Promise<Uint8Array> {
    try {
      const zip = await JSZip.loadAsync(await file.arrayBuffer());
      const documentXmlFile = zip.file('word/document.xml');
      if (!documentXmlFile) {
        throw new Error('struttura DOCX non valida.');
      }

      const documentXml = await documentXmlFile.async('string');
      const paragraphs = this.extractDocxParagraphs(documentXml);
      const pdfDocument = await PDFDocument.create();
      const font = await pdfDocument.embedFont(StandardFonts.Helvetica);
      this.writeTextAsPdfPages(pdfDocument, font, paragraphs);
      return await pdfDocument.save({
        useObjectStreams: true,
        addDefaultPage: false
      });
    } catch (error: unknown) {
      const reason = error instanceof Error ? error.message : 'errore sconosciuto';
      throw new Error(`Impossibile convertire "${file.name}" in PDF: ${reason}`);
    }
  }

  private extractDocxParagraphs(documentXml: string): string[] {
    const xmlDocument = new DOMParser().parseFromString(documentXml, 'application/xml');
    const parserErrors = xmlDocument.getElementsByTagName('parsererror');
    if (parserErrors.length > 0) {
      throw new Error('contenuto DOCX non leggibile.');
    }

    const paragraphs = Array.from(xmlDocument.getElementsByTagName('w:p')).map(paragraph => {
      const textNodes = Array.from(paragraph.getElementsByTagName('w:t'));
      return textNodes.map(node => node.textContent ?? '').join('');
    });

    return paragraphs.length > 0 ? paragraphs : ['Documento Word senza testo leggibile.'];
  }

  private writeTextAsPdfPages(document: PDFDocument, font: PDFFont, paragraphs: string[]): void {
    const pageWidth = 595.28;
    const pageHeight = 841.89;
    const margin = 50;
    const fontSize = 11;
    const lineHeight = 15;
    const maxLineWidth = pageWidth - (margin * 2);

    let page = document.addPage([pageWidth, pageHeight]);
    let cursorY = pageHeight - margin;

    for (const paragraph of paragraphs) {
      const lines = this.wrapTextForPdf(paragraph, font, fontSize, maxLineWidth);
      for (const line of lines) {
        if (cursorY <= margin + lineHeight) {
          page = document.addPage([pageWidth, pageHeight]);
          cursorY = pageHeight - margin;
        }
        if (line.length > 0) {
          page.drawText(line, {
            x: margin,
            y: cursorY,
            size: fontSize,
            font,
            color: rgb(0.12, 0.12, 0.12)
          });
        }
        cursorY -= lineHeight;
      }
      cursorY -= lineHeight * 0.35;
    }
  }

  private wrapTextForPdf(text: string, font: PDFFont, fontSize: number, maxWidth: number): string[] {
    if (text.trim().length === 0) {
      return [''];
    }

    const words = text.split(/\s+/);
    const lines: string[] = [];
    let currentLine = '';

    for (const word of words) {
      const nextLine = currentLine ? `${currentLine} ${word}` : word;
      if (font.widthOfTextAtSize(nextLine, fontSize) <= maxWidth) {
        currentLine = nextLine;
        continue;
      }

      if (currentLine) {
        lines.push(currentLine);
      }

      if (font.widthOfTextAtSize(word, fontSize) <= maxWidth) {
        currentLine = word;
        continue;
      }

      const chunks = this.splitLongWordForPdf(word, font, fontSize, maxWidth);
      lines.push(...chunks.slice(0, -1));
      currentLine = chunks[chunks.length - 1] ?? '';
    }

    if (currentLine) {
      lines.push(currentLine);
    }

    return lines.length > 0 ? lines : [''];
  }

  private splitLongWordForPdf(word: string, font: PDFFont, fontSize: number, maxWidth: number): string[] {
    const chunks: string[] = [];
    let currentChunk = '';

    for (const char of word) {
      const nextChunk = `${currentChunk}${char}`;
      if (font.widthOfTextAtSize(nextChunk, fontSize) <= maxWidth) {
        currentChunk = nextChunk;
        continue;
      }

      if (currentChunk) {
        chunks.push(currentChunk);
      }
      currentChunk = char;
    }

    if (currentChunk) {
      chunks.push(currentChunk);
    }

    return chunks.length > 0 ? chunks : [word];
  }

  private async sleep(ms: number): Promise<void> {
    await new Promise<void>(resolve => setTimeout(resolve, ms));
  }

  private formatMergeError(error: unknown): string {
    const message = error instanceof Error ? error.message : '';
    if (message.startsWith('Formato non supportato')) {
      return message;
    }
    if (message.startsWith('Impossibile convertire')) {
      return message;
    }
    if (message.startsWith('Impossibile leggere')) {
      return message;
    }
    if (message.startsWith('Timeout durante')) {
      return `${message} Riprova con meno file o file meno pesanti.`;
    }
    if (message.toLowerCase().includes('password')) {
      return 'Errore durante il merge. Uno dei PDF sembra protetto da password.';
    }
    return 'Errore durante l\'elaborazione dei file. Verifica che non siano corrotti o protetti.';
  }

  reset(): void {
    this.files = [];
    this.errorMessage = null;
    this.isDragOver = false;
    this.dragSrcIndex = null;
    this.dragOverIndex = null;
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

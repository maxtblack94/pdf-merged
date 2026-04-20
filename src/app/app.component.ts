import { ChangeDetectorRef, Component, NgZone, OnInit, inject } from '@angular/core';
import { PDFDocument, PDFFont, StandardFonts, rgb } from 'pdf-lib';
import JSZip from 'jszip';

interface ConvertDocRequest {
  fileName: string;
  bytes: ArrayBuffer;
}

interface ElectronApi {
  convertDocToPdf: (request: ConvertDocRequest) => Promise<ArrayBuffer | Uint8Array>;
  getAppVersion?: () => Promise<string>;
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
type AppLanguage = 'it' | 'en';
type DownloadQuality = 'high' | 'low';
interface MergeWorkerRequest {
  type: 'merge';
  files: MergeWorkerFilePayload[];
  quality: DownloadQuality;
  language: AppLanguage;
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

const LOCALIZED_TEXT = {
  it: {
    subtitle: 'Unisci PDF o converti immagini/Word in un unico PDF',
    language: 'Lingua',
    version: 'Versione',
    logoAlt: 'Logo PDF Merger',
    dropTextStart: 'Trascina qui PDF, PNG, JPEG, DOC o DOCX oppure',
    dropTextStrong: 'clicca per selezionarli',
    supportedFormatsHint: 'Formati supportati: .pdf, .png, .jpg, .jpeg, .doc, .docx',
    loadingFiles: 'Caricamento file in corso…',
    waitForCompletion: 'Attendi il completamento.',
    dragToReorder: 'Trascina per riordinare',
    removeAll: 'Rimuovi tutti',
    remove: 'Rimuovi',
    generatePdf: 'Genera PDF',
    processing: 'Elaborazione in corso…',
    uploading: 'Caricamento file…',
    chooseDownloadType: 'Scegli il tipo di download',
    highQuality: 'Alta qualità',
    lowQuality: 'Bassa qualità (più leggera)',
    cancel: 'Annulla',
    generatingHighQuality: 'Generazione alta qualità…',
    generatingLowQuality: 'Generazione bassa qualità…',
    outputHighFileName: 'output-alta-qualita.pdf',
    outputLowFileName: 'output-bassa-qualita.pdf',
    acceptedTypes: 'sono accettati solo PDF, PNG, JPEG, DOC o DOCX.',
    fileIgnoredSingular: 'file ignorato',
    fileIgnoredPlural: 'file ignorati',
    unsupportedFormat: 'Formato non supportato per "{fileName}". Sono accettati PDF, PNG, JPEG, DOC o DOCX.',
    docDesktopOnly: 'La conversione dei file .doc è disponibile solo nell’app desktop Windows.',
    conversionFailed: 'Impossibile convertire "{fileName}" in PDF: {reason}',
    unknownError: 'errore sconosciuto',
    docxInvalidStructure: 'struttura DOCX non valida.',
    docxUnreadable: 'contenuto DOCX non leggibile.',
    docxNoReadableText: 'Documento Word senza testo leggibile.',
    canvasCompressionError: 'Impossibile preparare il canvas per la compressione delle immagini.',
    imageCompressionError: 'Impossibile convertire un\'immagine in JPEG compresso.',
    workerNotSupported: 'Web Worker non supportato dal browser.',
    mergeTimeout: 'Timeout durante il merge.',
    mergeTimeoutRetry: 'Timeout durante il merge. Riprova con meno file o file meno pesanti.',
    mergeGenericError: 'Errore durante il merge.',
    workerInvalidResponse: 'Risposta non valida dal worker di merge.',
    workerInternalError: 'Errore interno del worker di merge.',
    workerCommunicationError: 'Errore di comunicazione con il worker di merge.',
    workerSendFailed: 'Invio dati al worker non riuscito.',
    passwordProtectedError: 'Errore durante il merge. Uno dei PDF sembra protetto da password.',
    processingError: 'Errore durante l\'elaborazione dei file. Verifica che non siano corrotti o protetti.',
    selectedFilesSingular: 'file selezionato',
    selectedFilesPlural: 'file selezionati',
    footerPrivacyTitle: 'Privacy e sicurezza',
    footerPrivacyText: 'Nessun dato sensibile o privato contenuto negli allegati viene salvato. I file sono elaborati solo per la generazione del PDF e non sono condivisi con terze parti.',
    footerDeveloperTitle: 'Produttore del sito',
    footerDeveloperText: 'Massimo Lanera (persona fisica privata, non azienda).',
    footerSupportTitle: 'Supporto',
    footerSupportText: 'Se il tool ti è utile, puoi supportare il progetto.',
    footerSupportCta: 'Offrimi un caffè',
    footerCopyright: '© 2026 Massimo Lanera | Conforme al GDPR UE'
  },
  en: {
    subtitle: 'Merge PDFs or convert images/Word files into one PDF',
    language: 'Language',
    version: 'Version',
    logoAlt: 'PDF Merger logo',
    dropTextStart: 'Drag PDF, PNG, JPEG, DOC or DOCX files here or',
    dropTextStrong: 'click to select them',
    supportedFormatsHint: 'Supported formats: .pdf, .png, .jpg, .jpeg, .doc, .docx',
    loadingFiles: 'Uploading files…',
    waitForCompletion: 'Please wait for completion.',
    dragToReorder: 'Drag to reorder',
    removeAll: 'Remove all',
    remove: 'Remove',
    generatePdf: 'Generate PDF',
    processing: 'Processing…',
    uploading: 'Uploading files…',
    chooseDownloadType: 'Choose the download type',
    highQuality: 'High quality',
    lowQuality: 'Low quality (smaller file)',
    cancel: 'Cancel',
    generatingHighQuality: 'Generating high quality…',
    generatingLowQuality: 'Generating low quality…',
    outputHighFileName: 'output-high-quality.pdf',
    outputLowFileName: 'output-low-quality.pdf',
    acceptedTypes: 'only PDF, PNG, JPEG, DOC or DOCX are accepted.',
    fileIgnoredSingular: 'file ignored',
    fileIgnoredPlural: 'files ignored',
    unsupportedFormat: 'Unsupported format for "{fileName}". Accepted formats: PDF, PNG, JPEG, DOC or DOCX.',
    docDesktopOnly: '.doc conversion is available only in the Windows desktop app.',
    conversionFailed: 'Unable to convert "{fileName}" to PDF: {reason}',
    unknownError: 'unknown error',
    docxInvalidStructure: 'invalid DOCX structure.',
    docxUnreadable: 'unreadable DOCX content.',
    docxNoReadableText: 'Word document has no readable text.',
    canvasCompressionError: 'Unable to initialize canvas for image compression.',
    imageCompressionError: 'Unable to convert an image to compressed JPEG.',
    workerNotSupported: 'Web Worker is not supported by this browser.',
    mergeTimeout: 'Timeout during merge.',
    mergeTimeoutRetry: 'Timeout during merge. Try fewer files or smaller files.',
    mergeGenericError: 'Merge failed.',
    workerInvalidResponse: 'Invalid response from merge worker.',
    workerInternalError: 'Internal merge worker error.',
    workerCommunicationError: 'Communication error with merge worker.',
    workerSendFailed: 'Failed to send data to merge worker.',
    passwordProtectedError: 'Merge error. One of the PDFs appears to be password protected.',
    processingError: 'Error while processing files. Check that files are not corrupted or protected.',
    selectedFilesSingular: 'selected file',
    selectedFilesPlural: 'selected files',
    footerPrivacyTitle: 'Privacy & security',
    footerPrivacyText: 'No sensitive or private data contained in attachments is stored. Files are processed only to generate the requested PDF and are not shared with third parties.',
    footerDeveloperTitle: 'Site producer',
    footerDeveloperText: 'Massimo Lanera (private individual, not a company).',
    footerSupportTitle: 'Support',
    footerSupportText: 'If this tool is useful to you, you can support the project.',
    footerSupportCta: 'Buy me a coffee',
    footerCopyright: '© 2026 Massimo Lanera | EU GDPR compliant'
  }
} as const;

type LocalizedTextKey = keyof typeof LOCALIZED_TEXT.it;

@Component({
    selector: 'app-root',
    templateUrl: './app.component.html',
    styleUrls: ['./app.component.scss'],
    standalone: false
})
export class AppComponent implements OnInit {
  private readonly mergeWorkerTimeoutMs = 5 * 60 * 1000;
  private readonly lowQualityImageMaxDimension = 1600;
  private readonly lowQualityJpegQuality = 0.62;
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
  private readonly textMap = LOCALIZED_TEXT;
  readonly supportLink = 'https://ko-fi.com/massimolanera';
  appVersion = '1.0.0';


  files: File[] = [];
  selectedLanguage: AppLanguage = 'it';
  isAddingFiles = false;
  isMerging = false;
  isChoosingQuality = false;
  errorMessage: string | null = null;
  isDragOver = false;
  currentQuality: DownloadQuality | null = null;

  // drag-to-reorder state
  dragSrcIndex: number | null = null;
  dragOverIndex: number | null = null;

  ngOnInit(): void {
    void this.loadAppVersion();
  }

  async onFileSelected(event: Event): Promise<void> {
    const input = event.target as HTMLInputElement;
    const selectedFiles = input.files ? Array.from(input.files) : [];
    input.value = '';
    if (selectedFiles.length === 0 || this.isAddingFiles) {
      return;
    }
    await this.handleIncomingFiles(selectedFiles);
  }

  onDragOver(event: DragEvent): void {
    if (this.isAddingFiles) {
      return;
    }
    event.preventDefault();
    this.isDragOver = true;
  }

  onDragLeave(): void {
    this.isDragOver = false;
  }

  async onDrop(event: DragEvent): Promise<void> {
    event.preventDefault();
    this.isDragOver = false;
    if (this.isAddingFiles || !event.dataTransfer?.files) {
      return;
    }
    await this.handleIncomingFiles(Array.from(event.dataTransfer.files));
  }

  openFileSelector(input: HTMLInputElement): void {
    if (this.isAddingFiles || this.isMerging) {
      return;
    }
    input.click();
  }

  private addFiles(newFiles: File[]): void {
    const acceptedFiles = newFiles.filter(file => this.isSupportedInputFile(file));
    const rejected = newFiles.length - acceptedFiles.length;
    this.errorMessage = rejected > 0 ? this.buildIgnoredFilesError(rejected) : null;
    this.files = [...this.files, ...acceptedFiles];
    this.isChoosingQuality = false;
  }

  removeFile(index: number): void {
    this.files = this.files.filter((_, i) => i !== index);
    this.isChoosingQuality = false;
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

  setLanguage(language: AppLanguage): void {
    this.selectedLanguage = language;
    this.errorMessage = null;
  }

  text(key: LocalizedTextKey): string {
    return this.textMap[this.selectedLanguage][key];
  }

  selectedFilesLabel(fileCount: number): string {
    const suffix = fileCount === 1 ? this.text('selectedFilesSingular') : this.text('selectedFilesPlural');
    return `${fileCount} ${suffix}`;
  }

  hasSupportLink(): boolean {
    return /^https?:\/\/.+/i.test(this.supportLink);
  }

  private async loadAppVersion(): Promise<void> {
    const electronApi = window.electronApi;
    if (!electronApi || typeof electronApi.getAppVersion !== 'function') {
      return;
    }

    try {
      const version = await electronApi.getAppVersion();
      if (typeof version === 'string' && version.trim().length > 0) {
        this.appVersion = version.trim();
      }
    } catch {
      // Keep fallback version in case the desktop bridge is unavailable.
    }
  }

  openDownloadOptions(): void {
    if (this.files.length === 0 || this.isMerging || this.isAddingFiles) {
      return;
    }
    this.errorMessage = null;
    this.isChoosingQuality = true;
  }

  cancelDownloadOptions(): void {
    if (this.isMerging) {
      return;
    }
    this.isChoosingQuality = false;
  }

  async downloadMergedPdf(quality: DownloadQuality): Promise<void> {
    if (this.files.length === 0 || this.isMerging || this.isAddingFiles) {
      return;
    }
    this.isMerging = true;
    this.currentQuality = quality;
    this.errorMessage = null;

    try {
      const mergedBytes = await this.mergeWithWorker(this.files, quality);
      this.triggerDownload(mergedBytes, this.outputFileName(quality));
      await this.sleep(200);
      this.reset();
    } catch (error: unknown) {
      this.errorMessage = this.formatMergeError(error);
    } finally {
      this.isMerging = false;
      this.currentQuality = null;
      this.cdr.detectChanges();
    }
  }

  private async mergeWithWorker(inputFiles: File[], quality: DownloadQuality): Promise<Uint8Array> {
    if (typeof Worker === 'undefined') {
      throw new Error(this.text('workerNotSupported'));
    }

    const files = await Promise.all(
      inputFiles.map(file => this.prepareFileForMerge(file, quality))
    );

    const worker = new Worker(new URL('./app.worker', import.meta.url), { type: 'module' });
    const transferableBuffers = files.map(file => file.bytes);
    const payload: MergeWorkerRequest = { type: 'merge', files, quality, language: this.selectedLanguage };

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
        finalize(() => rejectInZone(new Error(this.text('mergeTimeout'))));
      }, this.mergeWorkerTimeoutMs);

      worker.onmessage = (event: MessageEvent<MergeWorkerResponse>) => {
        const response = event.data;
        if (response?.type === 'success' && response.mergedBytes instanceof ArrayBuffer) {
          finalize(() => resolveInZone(new Uint8Array(response.mergedBytes)));
          return;
        }
        if (response?.type === 'error') {
          finalize(() => rejectInZone(new Error(response.message || this.text('mergeGenericError'))));
          return;
        }
        finalize(() => rejectInZone(new Error(this.text('workerInvalidResponse'))));
      };

      worker.onerror = (event: ErrorEvent) => {
        const message = event.message || this.text('workerInternalError');
        finalize(() => rejectInZone(new Error(message)));
      };

      worker.onmessageerror = () => {
        finalize(() => rejectInZone(new Error(this.text('workerCommunicationError'))));
      };

      try {
        worker.postMessage(payload, transferableBuffers);
      } catch (error: unknown) {
        const message = error instanceof Error ? error.message : this.text('workerSendFailed');
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

  private async handleIncomingFiles(newFiles: File[]): Promise<void> {
    this.isAddingFiles = true;
    try {
      await this.sleep(0);
      this.addFiles(newFiles);
    } finally {
      this.isAddingFiles = false;
      this.cdr.detectChanges();
    }
  }

  private async prepareFileForMerge(file: File, quality: DownloadQuality): Promise<MergeWorkerFilePayload> {
    const mimeType = this.resolveSupportedMimeType(file);

    if (quality === 'low' && (mimeType === 'image/png' || mimeType === 'image/jpeg')) {
      return {
        name: file.name,
        mimeType: 'image/jpeg',
        bytes: await this.optimizeImageForLowQuality(file)
      };
    }

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

  private async optimizeImageForLowQuality(file: File): Promise<ArrayBuffer> {
    const bitmap = await createImageBitmap(file);

    try {
      const size = this.getScaledDimensions(bitmap.width, bitmap.height, this.lowQualityImageMaxDimension);
      const canvas = document.createElement('canvas');
      canvas.width = size.width;
      canvas.height = size.height;

      const context = canvas.getContext('2d');
      if (!context) {
        throw new Error(this.text('canvasCompressionError'));
      }

      context.fillStyle = '#ffffff';
      context.fillRect(0, 0, size.width, size.height);
      context.drawImage(bitmap, 0, 0, size.width, size.height);
      const blob = await this.canvasToJpegBlob(canvas, this.lowQualityJpegQuality);
      return await blob.arrayBuffer();
    } finally {
      bitmap.close();
    }
  }

  private async canvasToJpegBlob(canvas: HTMLCanvasElement, quality: number): Promise<Blob> {
    const blob = await new Promise<Blob | null>(resolve => canvas.toBlob(resolve, 'image/jpeg', quality));
    if (!blob) {
      throw new Error(this.text('imageCompressionError'));
    }
    return blob;
  }

  private getScaledDimensions(width: number, height: number, maxDimension: number): { width: number; height: number } {
    const maxCurrentSide = Math.max(width, height);
    if (maxCurrentSide <= maxDimension) {
      return { width, height };
    }

    const scale = maxDimension / maxCurrentSide;
    return {
      width: Math.max(1, Math.round(width * scale)),
      height: Math.max(1, Math.round(height * scale))
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

    throw new Error(this.withPlaceholders(this.text('unsupportedFormat'), { fileName: file.name }));
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
      throw new Error(this.text('docDesktopOnly'));
    }

    try {
      const converted = await electronApi.convertDocToPdf({
        fileName: file.name,
        bytes: await file.arrayBuffer()
      });
      return converted instanceof Uint8Array ? converted : new Uint8Array(converted);
    } catch (error: unknown) {
      const reason = error instanceof Error ? error.message : this.text('unknownError');
      throw new Error(this.withPlaceholders(this.text('conversionFailed'), { fileName: file.name, reason }));
    }
  }

  private async convertDocxToPdf(file: File): Promise<Uint8Array> {
    try {
      const zip = await JSZip.loadAsync(await file.arrayBuffer());
      const documentXmlFile = zip.file('word/document.xml');
      if (!documentXmlFile) {
        throw new Error(this.text('docxInvalidStructure'));
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
      const reason = error instanceof Error ? error.message : this.text('unknownError');
      throw new Error(this.withPlaceholders(this.text('conversionFailed'), { fileName: file.name, reason }));
    }
  }

  private extractDocxParagraphs(documentXml: string): string[] {
    const xmlDocument = new DOMParser().parseFromString(documentXml, 'application/xml');
    const parserErrors = xmlDocument.getElementsByTagName('parsererror');
    if (parserErrors.length > 0) {
      throw new Error(this.text('docxUnreadable'));
    }

    const paragraphs = Array.from(xmlDocument.getElementsByTagName('w:p')).map(paragraph => {
      const textNodes = Array.from(paragraph.getElementsByTagName('w:t'));
      return textNodes.map(node => node.textContent ?? '').join('');
    });

    return paragraphs.length > 0 ? paragraphs : [this.text('docxNoReadableText')];
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

  private buildIgnoredFilesError(rejectedFiles: number): string {
    const ignoredLabel = rejectedFiles === 1 ? this.text('fileIgnoredSingular') : this.text('fileIgnoredPlural');
    return `${rejectedFiles} ${ignoredLabel}: ${this.text('acceptedTypes')}`;
  }

  private outputFileName(quality: DownloadQuality): string {
    return quality === 'high' ? this.text('outputHighFileName') : this.text('outputLowFileName');
  }

  private withPlaceholders(template: string, placeholders: Record<string, string>): string {
    return Object.entries(placeholders).reduce(
      (value, [key, replacement]) => value.replace(`{${key}}`, replacement),
      template
    );
  }

  private formatMergeError(error: unknown): string {
    const message = error instanceof Error ? error.message : '';
    if (!message) {
      return this.text('processingError');
    }

    const normalizedMessage = message.toLowerCase();
    if (normalizedMessage.includes('timeout')) {
      return this.text('mergeTimeoutRetry');
    }

    if (normalizedMessage.includes('password')) {
      return this.text('passwordProtectedError');
    }

    return message;
  }

  reset(): void {
    this.files = [];
    this.isAddingFiles = false;
    this.errorMessage = null;
    this.isChoosingQuality = false;
    this.isDragOver = false;
    this.currentQuality = null;
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

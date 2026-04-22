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
interface CropBounds {
  x: number;
  y: number;
  width: number;
  height: number;
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
    desktopBannerMessage: 'Stai usando la versione web. Puoi scaricare l’ultima versione desktop per Windows.',
    desktopBannerCta: 'Scarica desktop (.exe)',
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
    cropChoiceTitle: 'Ritaglio immagini',
    cropChoiceMessage: 'Sono presenti immagini (PNG/JPG/JPEG). Vuoi ritagliarle manualmente prima della conversione in PDF?',
    cropChoiceYes: 'Sì, ritaglia manualmente',
    cropChoiceNo: 'No, continua senza ritaglio',
    cropChoiceCancel: 'Annulla',
    cropEditorTitle: 'Ritaglio manuale immagini',
    cropEditorHint: 'Trascina sull’immagine per selezionare l’area da mantenere.',
    cropEditorSkip: 'Salta (usa originale)',
    cropEditorApply: 'Applica ritaglio e continua',
    cropEditorReset: 'Reimposta selezione',
    cropEditorAbort: 'Annulla ritaglio',
    cropEditorSelectionTooSmall: 'Seleziona un’area più ampia per applicare il ritaglio.',
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
    desktopBannerMessage: 'You are using the web version. You can download the latest desktop version for Windows.',
    desktopBannerCta: 'Download desktop (.exe)',
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
    cropChoiceTitle: 'Image cropping',
    cropChoiceMessage: 'Image files (PNG/JPG/JPEG) were found. Do you want to crop them manually before converting to PDF?',
    cropChoiceYes: 'Yes, crop manually',
    cropChoiceNo: 'No, continue without cropping',
    cropChoiceCancel: 'Cancel',
    cropEditorTitle: 'Manual image crop',
    cropEditorHint: 'Drag on the image to select the area to keep.',
    cropEditorSkip: 'Skip (use original)',
    cropEditorApply: 'Apply crop and continue',
    cropEditorReset: 'Reset selection',
    cropEditorAbort: 'Cancel cropping',
    cropEditorSelectionTooSmall: 'Select a larger area to apply the crop.',
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
  private readonly minCropSelectionPx = 20;
  private readonly cropAutoScrollMarginPx = 38;
  private readonly cropAutoScrollMaxStepPx = 20;
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
  readonly desktopDownloadUrl = 'https://github.com/maxtblack94/pdf-merged/releases/latest';
  readonly supportLink = 'https://ko-fi.com/massimolanera';
  appVersion = '1.0.0';
  isDesktopRuntime = false;


  files: File[] = [];
  selectedLanguage: AppLanguage = 'it';
  isAddingFiles = false;
  isMerging = false;
  isChoosingQuality = false;
  isCropChoiceOpen = false;
  isCropEditorOpen = false;
  errorMessage: string | null = null;
  cropEditorError: string | null = null;
  isDragOver = false;
  currentQuality: DownloadQuality | null = null;
  pendingMergeQuality: DownloadQuality | null = null;
  cropImageIndices: number[] = [];
  currentCropQueueIndex = 0;
  currentCropImageUrl: string | null = null;
  currentCropSelection: CropBounds | null = null;
  currentCropDisplayWidth = 0;
  currentCropDisplayHeight = 0;
  currentCropNaturalWidth = 0;
  currentCropNaturalHeight = 0;
  private readonly manualCropByFileIndex = new Map<number, CropBounds>();
  private isDrawingCropSelection = false;
  private cropSelectionStartX = 0;
  private cropSelectionStartY = 0;
  private activeCropStageElement: HTMLElement | null = null;
  private activeCropImageElement: HTMLImageElement | null = null;
  private cropPointerClientX = 0;
  private cropPointerClientY = 0;
  private cropAutoScrollFrameId: number | null = null;

  // drag-to-reorder state
  dragSrcIndex: number | null = null;
  dragOverIndex: number | null = null;

  ngOnInit(): void {
    this.isDesktopRuntime = this.detectDesktopRuntime();
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

  hasDesktopDownloadLink(): boolean {
    return /^https?:\/\/.+/i.test(this.desktopDownloadUrl);
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

  private detectDesktopRuntime(): boolean {
    const electronApi = window.electronApi;
    const hasElectronBridge = !!electronApi
      && typeof electronApi.getAppVersion === 'function'
      && typeof electronApi.convertDocToPdf === 'function';
    const userAgent = typeof navigator !== 'undefined' ? navigator.userAgent.toLowerCase() : '';
    const hasElectronUserAgent = userAgent.includes(' electron/');
    return hasElectronBridge || hasElectronUserAgent;
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
    this.errorMessage = null;
    this.cropEditorError = null;
    this.pendingMergeQuality = quality;
    this.manualCropByFileIndex.clear();
    this.cropImageIndices = this.collectImageFileIndices(this.files);
    this.currentCropQueueIndex = 0;

    if (this.cropImageIndices.length === 0) {
      await this.executeMergeAndDownload(quality);
      return;
    }

    this.isCropChoiceOpen = true;
  }

  async chooseCropFlow(applyManualCrop: boolean): Promise<void> {
    const quality = this.pendingMergeQuality;
    this.isCropChoiceOpen = false;
    if (!quality) {
      return;
    }

    if (!applyManualCrop) {
      this.cleanupCropEditor();
      await this.executeMergeAndDownload(quality);
      return;
    }

    if (this.cropImageIndices.length === 0) {
      this.cleanupCropEditor();
      await this.executeMergeAndDownload(quality);
      return;
    }

    this.isCropEditorOpen = true;
    this.currentCropQueueIndex = 0;
    this.loadCurrentCropImage();
  }

  cancelCropFlow(): void {
    this.isCropChoiceOpen = false;
    this.cleanupCropEditor();
  }

  onCropImageLoad(imageElement: HTMLImageElement, stageElement: HTMLElement): void {
    this.currentCropNaturalWidth = imageElement.naturalWidth;
    this.currentCropNaturalHeight = imageElement.naturalHeight;
    const fitSize = this.fitCropImageToStage(
      this.currentCropNaturalWidth,
      this.currentCropNaturalHeight,
      stageElement
    );
    this.currentCropDisplayWidth = fitSize.width;
    this.currentCropDisplayHeight = fitSize.height;
    this.currentCropSelection = null;
    this.cropEditorError = null;
  }

  onCropPointerDown(event: MouseEvent, imageElement: HTMLImageElement, stageElement: HTMLElement): void {
    if (!this.isCropEditorOpen || this.isMerging) {
      return;
    }
    event.preventDefault();
    const point = this.readPointInsideImage(event, imageElement);
    if (!point) {
      return;
    }
    this.isDrawingCropSelection = true;
    this.cropSelectionStartX = point.x;
    this.cropSelectionStartY = point.y;
    this.activeCropStageElement = stageElement;
    this.activeCropImageElement = imageElement;
    this.cropPointerClientX = event.clientX;
    this.cropPointerClientY = event.clientY;
    this.currentCropSelection = {
      x: point.x,
      y: point.y,
      width: 0,
      height: 0
    };
    this.cropEditorError = null;
    this.registerGlobalCropListeners();
    this.startCropAutoScrollLoop();
  }

  onCropPointerMove(event: MouseEvent, imageElement: HTMLImageElement): void {
    if (!this.isDrawingCropSelection) {
      return;
    }
    event.preventDefault();
    this.cropPointerClientX = event.clientX;
    this.cropPointerClientY = event.clientY;
    const point = this.readPointInsideImage(event, imageElement) ?? { x: this.cropSelectionStartX, y: this.cropSelectionStartY };
    this.currentCropSelection = this.buildSelectionFromPoints(
      this.cropSelectionStartX,
      this.cropSelectionStartY,
      point.x,
      point.y
    );
  }

  onCropPointerUp(): void {
    this.isDrawingCropSelection = false;
    this.stopCropAutoScrollLoop();
    this.unregisterGlobalCropListeners();
    this.activeCropStageElement = null;
    this.activeCropImageElement = null;
  }

  resetCurrentCropSelection(): void {
    this.currentCropSelection = null;
    this.cropEditorError = null;
  }

  skipCurrentCropImage(): void {
    const fileIndex = this.currentCropFileIndex();
    if (fileIndex >= 0) {
      this.manualCropByFileIndex.delete(fileIndex);
    }
    this.moveToNextCropImage();
  }

  applyCurrentCropAndContinue(): void {
    if (!this.currentCropSelection || !this.isCropSelectionLargeEnough(this.currentCropSelection)) {
      this.cropEditorError = this.text('cropEditorSelectionTooSmall');
      return;
    }

    const fileIndex = this.currentCropFileIndex();
    if (fileIndex < 0) {
      this.cropEditorError = this.text('processingError');
      return;
    }
    const cropBounds = this.mapDisplayedSelectionToOriginal(this.currentCropSelection);
    if (!cropBounds) {
      this.cropEditorError = this.text('cropEditorSelectionTooSmall');
      return;
    }

    this.manualCropByFileIndex.set(fileIndex, cropBounds);
    this.moveToNextCropImage();
  }

  currentCropFileName(): string {
    const fileIndex = this.currentCropFileIndex();
    return this.files[fileIndex]?.name ?? '';
  }

  private async executeMergeAndDownload(quality: DownloadQuality): Promise<void> {
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

  private collectImageFileIndices(inputFiles: File[]): number[] {
    const imageIndexes: number[] = [];
    for (let index = 0; index < inputFiles.length; index += 1) {
      const mimeType = this.resolveSupportedMimeType(inputFiles[index]);
      if (mimeType === 'image/png' || mimeType === 'image/jpeg') {
        imageIndexes.push(index);
      }
    }
    return imageIndexes;
  }

  private loadCurrentCropImage(): void {
    this.revokeCurrentCropImageUrl();
    const file = this.files[this.currentCropFileIndex()];
    if (!file) {
      return;
    }
    this.currentCropImageUrl = URL.createObjectURL(file);
    this.currentCropSelection = null;
    this.currentCropDisplayWidth = 0;
    this.currentCropDisplayHeight = 0;
    this.currentCropNaturalWidth = 0;
    this.currentCropNaturalHeight = 0;
    this.cropEditorError = null;
  }

  private moveToNextCropImage(): void {
    this.currentCropQueueIndex += 1;
    if (this.currentCropQueueIndex >= this.cropImageIndices.length) {
      const quality = this.pendingMergeQuality;
      this.cleanupCropEditor(true);
      if (quality) {
        void this.executeMergeAndDownload(quality);
      }
      return;
    }

    this.loadCurrentCropImage();
  }

  private currentCropFileIndex(): number {
    return this.cropImageIndices[this.currentCropQueueIndex] ?? -1;
  }

  private cleanupCropEditor(preserveManualCrops = false): void {
    this.onCropPointerUp();
    this.isCropEditorOpen = false;
    this.pendingMergeQuality = null;
    this.cropImageIndices = [];
    this.currentCropQueueIndex = 0;
    this.currentCropSelection = null;
    this.currentCropDisplayWidth = 0;
    this.currentCropDisplayHeight = 0;
    this.currentCropNaturalWidth = 0;
    this.currentCropNaturalHeight = 0;
    this.cropEditorError = null;
    this.isDrawingCropSelection = false;
    this.revokeCurrentCropImageUrl();
    if (!preserveManualCrops) {
      this.manualCropByFileIndex.clear();
    }
  }

  private registerGlobalCropListeners(): void {
    window.addEventListener('mousemove', this.handleGlobalCropMouseMove);
    window.addEventListener('mouseup', this.handleGlobalCropMouseUp);
  }

  private unregisterGlobalCropListeners(): void {
    window.removeEventListener('mousemove', this.handleGlobalCropMouseMove);
    window.removeEventListener('mouseup', this.handleGlobalCropMouseUp);
  }

  private readonly handleGlobalCropMouseMove = (event: MouseEvent): void => {
    if (!this.isDrawingCropSelection || !this.activeCropImageElement) {
      return;
    }
    this.cropPointerClientX = event.clientX;
    this.cropPointerClientY = event.clientY;
    const point = this.readPointInsideImage(event, this.activeCropImageElement, true);
    if (!point) {
      return;
    }
    this.currentCropSelection = this.buildSelectionFromPoints(
      this.cropSelectionStartX,
      this.cropSelectionStartY,
      point.x,
      point.y
    );
  };

  private readonly handleGlobalCropMouseUp = (): void => {
    this.onCropPointerUp();
  };

  private startCropAutoScrollLoop(): void {
    if (this.cropAutoScrollFrameId !== null) {
      return;
    }
    this.cropAutoScrollFrameId = window.requestAnimationFrame(() => this.runCropAutoScrollLoop());
  }

  private runCropAutoScrollLoop(): void {
    if (!this.isDrawingCropSelection || !this.activeCropStageElement || !this.activeCropImageElement) {
      this.cropAutoScrollFrameId = null;
      return;
    }

    const stageRect = this.activeCropStageElement.getBoundingClientRect();
    let scrollDeltaY = 0;
    if (this.cropPointerClientY < stageRect.top + this.cropAutoScrollMarginPx) {
      const distance = (stageRect.top + this.cropAutoScrollMarginPx) - this.cropPointerClientY;
      scrollDeltaY = -this.computeCropAutoScrollStep(distance);
    } else if (this.cropPointerClientY > stageRect.bottom - this.cropAutoScrollMarginPx) {
      const distance = this.cropPointerClientY - (stageRect.bottom - this.cropAutoScrollMarginPx);
      scrollDeltaY = this.computeCropAutoScrollStep(distance);
    }

    if (scrollDeltaY !== 0) {
      this.activeCropStageElement.scrollTop += scrollDeltaY;
      const point = this.readPointInsideClientPosition(
        this.cropPointerClientX,
        this.cropPointerClientY,
        this.activeCropImageElement,
        true
      );
      if (point) {
        this.currentCropSelection = this.buildSelectionFromPoints(
          this.cropSelectionStartX,
          this.cropSelectionStartY,
          point.x,
          point.y
        );
      }
    }

    this.cropAutoScrollFrameId = window.requestAnimationFrame(() => this.runCropAutoScrollLoop());
  }

  private stopCropAutoScrollLoop(): void {
    if (this.cropAutoScrollFrameId === null) {
      return;
    }
    window.cancelAnimationFrame(this.cropAutoScrollFrameId);
    this.cropAutoScrollFrameId = null;
  }

  private computeCropAutoScrollStep(distancePx: number): number {
    const ratio = Math.min(1, distancePx / this.cropAutoScrollMarginPx);
    return Math.max(2, Math.round(this.cropAutoScrollMaxStepPx * ratio));
  }

  private fitCropImageToStage(
    naturalWidth: number,
    naturalHeight: number,
    stageElement: HTMLElement
  ): CropBounds {
    if (naturalWidth <= 0 || naturalHeight <= 0) {
      return { x: 0, y: 0, width: 1, height: 1 };
    }

    const stageStyle = window.getComputedStyle(stageElement);
    const horizontalPadding = (Number.parseFloat(stageStyle.paddingLeft) || 0)
      + (Number.parseFloat(stageStyle.paddingRight) || 0);
    const verticalPadding = (Number.parseFloat(stageStyle.paddingTop) || 0)
      + (Number.parseFloat(stageStyle.paddingBottom) || 0);
    const maxWidth = Math.max(1, stageElement.clientWidth - horizontalPadding);
    const maxHeight = Math.max(1, stageElement.clientHeight - verticalPadding);
    const scale = Math.min(maxWidth / naturalWidth, maxHeight / naturalHeight, 1);

    return {
      x: 0,
      y: 0,
      width: Math.max(1, Math.floor(naturalWidth * scale)),
      height: Math.max(1, Math.floor(naturalHeight * scale))
    };
  }

  private revokeCurrentCropImageUrl(): void {
    if (!this.currentCropImageUrl) {
      return;
    }
    URL.revokeObjectURL(this.currentCropImageUrl);
    this.currentCropImageUrl = null;
  }

  private readPointInsideImage(
    event: MouseEvent,
    imageElement: HTMLImageElement,
    clampToBounds = false
  ): { x: number; y: number } | null {
    return this.readPointInsideClientPosition(event.clientX, event.clientY, imageElement, clampToBounds);
  }

  private readPointInsideClientPosition(
    clientX: number,
    clientY: number,
    imageElement: HTMLImageElement,
    clampToBounds = false
  ): { x: number; y: number } | null {
    const rect = imageElement.getBoundingClientRect();
    if (rect.width <= 0 || rect.height <= 0) {
      return null;
    }
    if (
      !clampToBounds
      && (clientX < rect.left || clientX > rect.right || clientY < rect.top || clientY > rect.bottom)
    ) {
      return null;
    }
    const x = Math.max(0, Math.min(rect.width, clientX - rect.left));
    const y = Math.max(0, Math.min(rect.height, clientY - rect.top));
    return { x, y };
  }

  private buildSelectionFromPoints(startX: number, startY: number, endX: number, endY: number): CropBounds {
    const left = Math.min(startX, endX);
    const top = Math.min(startY, endY);
    const width = Math.abs(endX - startX);
    const height = Math.abs(endY - startY);
    return { x: left, y: top, width, height };
  }

  private isCropSelectionLargeEnough(selection: CropBounds): boolean {
    return selection.width >= this.minCropSelectionPx && selection.height >= this.minCropSelectionPx;
  }

  private mapDisplayedSelectionToOriginal(selection: CropBounds): CropBounds | null {
    if (
      this.currentCropDisplayWidth <= 0
      || this.currentCropDisplayHeight <= 0
      || this.currentCropNaturalWidth <= 0
      || this.currentCropNaturalHeight <= 0
    ) {
      return null;
    }

    const scaleX = this.currentCropNaturalWidth / this.currentCropDisplayWidth;
    const scaleY = this.currentCropNaturalHeight / this.currentCropDisplayHeight;
    const x = Math.max(0, Math.floor(selection.x * scaleX));
    const y = Math.max(0, Math.floor(selection.y * scaleY));
    const width = Math.max(1, Math.ceil(selection.width * scaleX));
    const height = Math.max(1, Math.ceil(selection.height * scaleY));
    const clampedWidth = Math.min(width, this.currentCropNaturalWidth - x);
    const clampedHeight = Math.min(height, this.currentCropNaturalHeight - y);

    if (clampedWidth <= 0 || clampedHeight <= 0) {
      return null;
    }

    return { x, y, width: clampedWidth, height: clampedHeight };
  }

  private async mergeWithWorker(inputFiles: File[], quality: DownloadQuality): Promise<Uint8Array> {
    if (typeof Worker === 'undefined') {
      throw new Error(this.text('workerNotSupported'));
    }

    const files = await Promise.all(
      inputFiles.map((file, index) => this.prepareFileForMerge(file, quality, index))
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

  private async prepareFileForMerge(file: File, quality: DownloadQuality, fileIndex: number): Promise<MergeWorkerFilePayload> {
    const mimeType = this.resolveSupportedMimeType(file);

    if (mimeType === 'image/png' || mimeType === 'image/jpeg') {
      return this.prepareImageForMerge(file, mimeType, quality, fileIndex);
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

  private async prepareImageForMerge(
    file: File,
    mimeType: 'image/png' | 'image/jpeg',
    quality: DownloadQuality,
    fileIndex: number
  ): Promise<MergeWorkerFilePayload> {
    let bitmap: ImageBitmap;
    try {
      bitmap = await createImageBitmap(file);
    } catch {
      if (quality === 'high') {
        return {
          name: file.name,
          mimeType,
          bytes: await file.arrayBuffer()
        };
      }
      throw new Error(this.text('imageCompressionError'));
    }

    try {
      const fullBounds: CropBounds = { x: 0, y: 0, width: bitmap.width, height: bitmap.height };
      const selectedBounds = this.manualCropByFileIndex.get(fileIndex);
      const cropBounds = selectedBounds ?? fullBounds;
      const hasManualCrop = !!selectedBounds;

      if (quality === 'low') {
        return {
          name: file.name,
          mimeType: 'image/jpeg',
          bytes: await this.renderBitmapAreaAsJpeg(
            bitmap,
            cropBounds,
            this.lowQualityImageMaxDimension,
            this.lowQualityJpegQuality
          )
        };
      }

      if (!hasManualCrop) {
        return {
          name: file.name,
          mimeType,
          bytes: await file.arrayBuffer()
        };
      }

      if (mimeType === 'image/png') {
        return {
          name: file.name,
          mimeType: 'image/png',
          bytes: await this.renderBitmapAreaAsPng(bitmap, cropBounds)
        };
      }

      return {
        name: file.name,
        mimeType: 'image/jpeg',
        bytes: await this.renderBitmapAreaAsJpeg(bitmap, cropBounds, undefined, 0.92)
      };
    } finally {
      bitmap.close();
    }
  }

  private async renderBitmapAreaAsPng(bitmap: ImageBitmap, bounds: CropBounds): Promise<ArrayBuffer> {
    const canvas = document.createElement('canvas');
    canvas.width = bounds.width;
    canvas.height = bounds.height;
    const context = canvas.getContext('2d');
    if (!context) {
      throw new Error(this.text('canvasCompressionError'));
    }

    context.drawImage(bitmap, bounds.x, bounds.y, bounds.width, bounds.height, 0, 0, bounds.width, bounds.height);
    const blob = await this.canvasToBlob(canvas, 'image/png');
    return blob.arrayBuffer();
  }

  private async renderBitmapAreaAsJpeg(
    bitmap: ImageBitmap,
    bounds: CropBounds,
    maxDimension?: number,
    quality = 0.92
  ): Promise<ArrayBuffer> {
    const outputSize = typeof maxDimension === 'number'
      ? this.getScaledDimensions(bounds.width, bounds.height, maxDimension)
      : { width: bounds.width, height: bounds.height };
    const canvas = document.createElement('canvas');
    canvas.width = outputSize.width;
    canvas.height = outputSize.height;

    const context = canvas.getContext('2d');
    if (!context) {
      throw new Error(this.text('canvasCompressionError'));
    }

    context.fillStyle = '#ffffff';
    context.fillRect(0, 0, outputSize.width, outputSize.height);
    context.drawImage(
      bitmap,
      bounds.x,
      bounds.y,
      bounds.width,
      bounds.height,
      0,
      0,
      outputSize.width,
      outputSize.height
    );
    const blob = await this.canvasToJpegBlob(canvas, quality);
    return blob.arrayBuffer();
  }

  private async canvasToBlob(canvas: HTMLCanvasElement, mimeType: 'image/png'): Promise<Blob> {
    const blob = await new Promise<Blob | null>(resolve => canvas.toBlob(resolve, mimeType));
    if (!blob) {
      throw new Error(this.text('imageCompressionError'));
    }
    return blob;
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
    this.isCropChoiceOpen = false;
    this.cleanupCropEditor();
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

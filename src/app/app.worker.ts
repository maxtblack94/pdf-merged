/// <reference lib="webworker" />

import { PDFDocument } from 'pdf-lib';

interface MergeWorkerFileInput {
  name: string;
  mimeType: string;
  bytes: ArrayBuffer;
}

interface MergeWorkerRequest {
  type: 'merge';
  files: MergeWorkerFileInput[];
  quality: 'high' | 'low';
  language: 'it' | 'en';
}

interface MergeWorkerSuccessResponse {
  type: 'success';
  mergedBytes: ArrayBuffer;
}

interface MergeWorkerErrorResponse {
  type: 'error';
  message: string;
}

const COPY_CHUNK_SIZE = 25;
const WORKER_TEXT = {
  it: {
    invalidRequest: 'Richiesta worker non valida.',
    invalidQuality: 'Qualità download non valida.',
    mergeError: 'Errore durante il merge.',
    unsupportedFormat: 'Formato non supportato per "{fileName}". Sono accettati PDF, PNG o JPEG.',
    readFileError: 'Impossibile leggere "{fileName}": {reason}',
    unknownError: 'errore sconosciuto'
  },
  en: {
    invalidRequest: 'Invalid worker request.',
    invalidQuality: 'Invalid download quality.',
    mergeError: 'Error during merge.',
    unsupportedFormat: 'Unsupported format for "{fileName}". Accepted formats: PDF, PNG or JPEG.',
    readFileError: 'Unable to read "{fileName}": {reason}',
    unknownError: 'unknown error'
  }
} as const;

type WorkerLanguage = keyof typeof WORKER_TEXT;

function withPlaceholders(template: string, placeholders: Record<string, string>): string {
  return Object.entries(placeholders).reduce(
    (value, [key, replacement]) => value.replace(`{${key}}`, replacement),
    template
  );
}

function readWorkerLanguage(value: unknown): WorkerLanguage {
  return value === 'en' ? 'en' : 'it';
}

function text(language: WorkerLanguage, key: keyof typeof WORKER_TEXT.it): string {
  return WORKER_TEXT[language][key];
}

addEventListener('message', async ({ data }: MessageEvent<MergeWorkerRequest>) => {
  const language = readWorkerLanguage(data?.language);
  if (!data || data.type !== 'merge') {
    postMessage({ type: 'error', message: text(language, 'invalidRequest') } satisfies MergeWorkerErrorResponse);
    return;
  }
  if (data.quality !== 'high' && data.quality !== 'low') {
    postMessage({ type: 'error', message: text(language, 'invalidQuality') } satisfies MergeWorkerErrorResponse);
    return;
  }

  try {
    const mergedBytes = await mergePdfBuffers(data.files, data.quality, language);
    const transfer = mergedBytes.buffer.slice(
      mergedBytes.byteOffset,
      mergedBytes.byteOffset + mergedBytes.byteLength
    ) as ArrayBuffer;
    postMessage({ type: 'success', mergedBytes: transfer } satisfies MergeWorkerSuccessResponse, [transfer]);
  } catch (error: unknown) {
    const message = error instanceof Error ? error.message : text(language, 'mergeError');
    postMessage({ type: 'error', message } satisfies MergeWorkerErrorResponse);
  }
});

async function mergePdfBuffers(
  files: MergeWorkerFileInput[],
  quality: 'high' | 'low',
  language: WorkerLanguage
): Promise<Uint8Array> {
  const merged = await PDFDocument.create();

  for (const file of files) {
    const mimeType = normalizeMimeType(file.mimeType, file.name);
    const bytes = new Uint8Array(file.bytes);
    if (mimeType === 'application/pdf') {
      const doc = await loadPdfForMerge(bytes, file.name, language);
      const pageIndices = doc.getPageIndices();

      for (let start = 0; start < pageIndices.length; start += COPY_CHUNK_SIZE) {
        const chunk = pageIndices.slice(start, start + COPY_CHUNK_SIZE);
        const pages = await merged.copyPages(doc, chunk);
        pages.forEach(page => merged.addPage(page));
      }
      continue;
    }

    if (mimeType === 'image/png' || mimeType === 'image/jpeg') {
      await addImageAsPage(merged, bytes, mimeType);
      continue;
    }

    throw new Error(withPlaceholders(text(language, 'unsupportedFormat'), { fileName: file.name }));
  }

  return merged.save({
    useObjectStreams: quality === 'low',
    addDefaultPage: false,
    updateFieldAppearances: false
  });
}

async function loadPdfForMerge(bytes: Uint8Array, fileName: string, language: WorkerLanguage): Promise<PDFDocument> {
  const strategies = [
    () => PDFDocument.load(bytes),
    () => PDFDocument.load(bytes, { ignoreEncryption: true })
  ];

  let lastError: unknown;
  for (const strategy of strategies) {
    try {
      return await strategy();
    } catch (error: unknown) {
      lastError = error;
    }
  }

  const reason = lastError instanceof Error ? lastError.message : text(language, 'unknownError');
  throw new Error(withPlaceholders(text(language, 'readFileError'), { fileName, reason }));
}

async function addImageAsPage(
  document: PDFDocument,
  bytes: Uint8Array,
  mimeType: 'image/png' | 'image/jpeg'
): Promise<void> {
  const image = mimeType === 'image/png'
    ? await document.embedPng(bytes)
    : await document.embedJpg(bytes);
  const page = document.addPage([image.width, image.height]);
  page.drawImage(image, {
    x: 0,
    y: 0,
    width: image.width,
    height: image.height
  });
}

function normalizeMimeType(rawMimeType: string, fileName: string): string {
  const mimeType = rawMimeType.toLowerCase();
  if (mimeType === 'image/jpg') {
    return 'image/jpeg';
  }
  if (mimeType === 'application/pdf' || mimeType === 'image/png' || mimeType === 'image/jpeg') {
    return mimeType;
  }

  const lowerFileName = fileName.toLowerCase();
  if (lowerFileName.endsWith('.pdf')) {
    return 'application/pdf';
  }
  if (lowerFileName.endsWith('.png')) {
    return 'image/png';
  }
  if (lowerFileName.endsWith('.jpg') || lowerFileName.endsWith('.jpeg')) {
    return 'image/jpeg';
  }

  return '';
}

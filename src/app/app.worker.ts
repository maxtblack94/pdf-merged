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

addEventListener('message', async ({ data }: MessageEvent<MergeWorkerRequest>) => {
  if (!data || data.type !== 'merge') {
    postMessage({ type: 'error', message: 'Richiesta worker non valida.' } satisfies MergeWorkerErrorResponse);
    return;
  }

  try {
    const mergedBytes = await mergePdfBuffers(data.files);
    const transfer = mergedBytes.buffer.slice(
      mergedBytes.byteOffset,
      mergedBytes.byteOffset + mergedBytes.byteLength
    ) as ArrayBuffer;
    postMessage({ type: 'success', mergedBytes: transfer } satisfies MergeWorkerSuccessResponse, [transfer]);
  } catch (error: unknown) {
    const message = error instanceof Error ? error.message : 'Errore durante il merge.';
    postMessage({ type: 'error', message } satisfies MergeWorkerErrorResponse);
  }
});

async function mergePdfBuffers(files: MergeWorkerFileInput[]): Promise<Uint8Array> {
  const merged = await PDFDocument.create();

  for (const file of files) {
    const mimeType = normalizeMimeType(file.mimeType, file.name);
    const bytes = new Uint8Array(file.bytes);
    if (mimeType === 'application/pdf') {
      const doc = await loadPdfForMerge(bytes, file.name);
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

    throw new Error(`Formato non supportato per "${file.name}". Sono accettati PDF, PNG o JPEG.`);
  }

  return merged.save({
    useObjectStreams: true,
    addDefaultPage: false,
    updateFieldAppearances: false
  });
}

async function loadPdfForMerge(bytes: Uint8Array, fileName: string): Promise<PDFDocument> {
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

  const reason = lastError instanceof Error ? lastError.message : 'errore sconosciuto';
  throw new Error(`Impossibile leggere "${fileName}": ${reason}`);
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

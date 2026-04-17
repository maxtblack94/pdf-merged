/// <reference lib="webworker" />

import { PDFDocument } from 'pdf-lib';

interface MergeWorkerFileInput {
  name: string;
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
    const bytes = new Uint8Array(file.bytes);
    const doc = await loadPdfForMerge(bytes, file.name);
    const pageIndices = doc.getPageIndices();

    for (let start = 0; start < pageIndices.length; start += COPY_CHUNK_SIZE) {
      const chunk = pageIndices.slice(start, start + COPY_CHUNK_SIZE);
      const pages = await merged.copyPages(doc, chunk);
      pages.forEach(page => merged.addPage(page));
    }
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

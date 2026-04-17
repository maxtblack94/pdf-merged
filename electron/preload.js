const { contextBridge, ipcRenderer } = require('electron');

const DOC_CONVERSION_CHANNEL = 'convert-doc-to-pdf';

function normalizeBytes(bytes) {
  if (bytes instanceof Uint8Array) {
    return bytes;
  }
  if (bytes instanceof ArrayBuffer) {
    return new Uint8Array(bytes);
  }
  throw new Error('Payload bytes non valido.');
}

function normalizeResultBytes(result) {
  if (result instanceof Uint8Array) {
    return result;
  }
  if (result instanceof ArrayBuffer) {
    return new Uint8Array(result);
  }
  if (Array.isArray(result)) {
    return new Uint8Array(result);
  }
  if (result && result.type === 'Buffer' && Array.isArray(result.data)) {
    return new Uint8Array(result.data);
  }
  throw new Error('Risposta non valida dal processo principale.');
}

contextBridge.exposeInMainWorld('electronApi', {
  async convertDocToPdf(request) {
    const fileName = typeof request?.fileName === 'string' ? request.fileName : 'document.doc';
    const bytes = normalizeBytes(request?.bytes);
    const result = await ipcRenderer.invoke(DOC_CONVERSION_CHANNEL, { fileName, bytes });
    return normalizeResultBytes(result);
  },
});

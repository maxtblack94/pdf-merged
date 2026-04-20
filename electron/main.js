const { app, BrowserWindow, ipcMain } = require('electron');
const { execFile } = require('child_process');
const fs = require('fs');
const os = require('os');
const path = require('path');
let win;
const DOC_CONVERSION_CHANNEL = 'convert-doc-to-pdf';

function resolveAppIconPath() {
  const candidates = app.isPackaged
    ? [
      path.join(__dirname, '../dist/pdf-merger/browser/assets/icon.ico'),
      path.join(__dirname, '../dist/pdf-merger/assets/icon.ico'),
      path.join(__dirname, '../dist/pdf-merger/browser/assets/icon.png'),
      path.join(__dirname, '../dist/pdf-merger/assets/icon.png'),
    ]
    : [
      path.join(__dirname, '../src/assets/icon.ico'),
      path.join(__dirname, '../src/assets/icon.png'),
    ];

  const found = candidates.find(iconPath => fs.existsSync(iconPath));
  return found || candidates[candidates.length - 1];
}

function resolvePreloadPath() {
  return path.join(__dirname, 'preload.js');
}

function resolveRendererIndexPath() {
  const candidates = [
    path.join(__dirname, '../dist/pdf-merger/browser/index.html'),
    path.join(__dirname, '../dist/pdf-merger/index.html'),
  ];
  const found = candidates.find(indexPath => fs.existsSync(indexPath));
  return found || candidates[0];
}

function createWindow() {
  win = new BrowserWindow({
    width: 900,
    height: 700,
    minWidth: 600,
    minHeight: 500,
    title: 'PDF Merger',
    icon: resolveAppIconPath(),
    webPreferences: {
      nodeIntegration: false,
      contextIsolation: true,
      preload: resolvePreloadPath(),
    },
    backgroundColor: '#1a1a2e',
  });

  win.loadFile(resolveRendererIndexPath());

  win.setMenuBarVisibility(false);
  win.on('closed', () => { win = null; });
}

function registerIpcHandlers() {
  ipcMain.handle(DOC_CONVERSION_CHANNEL, async (_event, payload) => {
    return convertDocToPdf(payload);
  });
}

async function convertDocToPdf(payload) {
  const fileName = typeof payload?.fileName === 'string' ? payload.fileName : 'document.doc';
  const inputBuffer = toBuffer(payload?.bytes);
  if (inputBuffer.length === 0) {
    throw new Error('Il file .doc è vuoto.');
  }

  const workingDir = await fs.promises.mkdtemp(path.join(os.tmpdir(), 'pdf-merged-doc-'));
  const safeBaseName = sanitizeBaseName(fileName);
  const inputPath = path.join(workingDir, `${safeBaseName}.doc`);
  const outputPath = path.join(workingDir, `${safeBaseName}.pdf`);

  try {
    await fs.promises.writeFile(inputPath, inputBuffer);
    const sofficePath = await resolveSofficeExecutable();
    await runExecFile(sofficePath, [
      '--headless',
      '--nologo',
      '--nolockcheck',
      '--nodefault',
      '--norestore',
      '--convert-to',
      'pdf:writer_pdf_Export',
      '--outdir',
      workingDir,
      inputPath,
    ], 180000);

    if (!fs.existsSync(outputPath)) {
      throw new Error('LibreOffice non ha prodotto il PDF di output.');
    }

    const pdfBuffer = await fs.promises.readFile(outputPath);
    return new Uint8Array(pdfBuffer);
  } finally {
    await fs.promises.rm(workingDir, { recursive: true, force: true });
  }
}

function sanitizeBaseName(fileName) {
  const parsed = path.parse(fileName);
  const rawName = parsed.name || 'document';
  return rawName.replace(/[^a-zA-Z0-9._-]/g, '_').slice(0, 80) || 'document';
}

function toBuffer(bytes) {
  if (Buffer.isBuffer(bytes)) {
    return bytes;
  }
  if (bytes instanceof Uint8Array) {
    return Buffer.from(bytes);
  }
  if (bytes instanceof ArrayBuffer) {
    return Buffer.from(new Uint8Array(bytes));
  }
  if (Array.isArray(bytes)) {
    return Buffer.from(bytes);
  }
  throw new Error('Payload .doc non valido.');
}

async function resolveSofficeExecutable() {
  const envPath = process.env.LIBREOFFICE_PATH;
  const candidates = [
    envPath,
    'C:\\Program Files\\LibreOffice\\program\\soffice.exe',
    'C:\\Program Files (x86)\\LibreOffice\\program\\soffice.exe',
  ].filter(Boolean);

  for (const candidate of candidates) {
    if (candidate && fs.existsSync(candidate)) {
      return candidate;
    }
  }

  try {
    const whereOutput = await runExecFile('where', ['soffice'], 15000);
    const match = whereOutput.stdout
      .split(/\r?\n/)
      .map(line => line.trim())
      .find(line => line.length > 0 && fs.existsSync(line));
    if (match) {
      return match;
    }
  } catch {
    // ignore and throw the user-friendly error below
  }

  throw new Error('LibreOffice non trovato. Installa LibreOffice oppure imposta LIBREOFFICE_PATH.');
}

function runExecFile(command, args, timeoutMs) {
  return new Promise((resolve, reject) => {
    execFile(command, args, { windowsHide: true, timeout: timeoutMs }, (error, stdout, stderr) => {
      if (error) {
        const stderrText = typeof stderr === 'string' ? stderr.trim() : '';
        const extra = stderrText ? ` Dettagli: ${stderrText}` : '';
        reject(new Error(`Errore durante la conversione .doc con LibreOffice.${extra}`));
        return;
      }
      resolve({
        stdout: typeof stdout === 'string' ? stdout : '',
        stderr: typeof stderr === 'string' ? stderr : '',
      });
    });
  });
}

app.on('ready', () => {
  registerIpcHandlers();
  createWindow();
});
app.on('window-all-closed', () => { if (process.platform !== 'darwin') app.quit(); });
app.on('activate', () => { if (win === null) createWindow(); });

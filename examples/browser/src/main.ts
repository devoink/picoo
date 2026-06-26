import { createImageProcessor } from 'picoo';
import type { Format, ImageInfo, ProcessOptions, ProcessResult, ResizeMode } from 'picoo';
import { toBlob, toBytes } from 'picoo/io';

const $ = <T extends HTMLElement>(id: string) => document.getElementById(id) as T;

const statusEl = $('status');
const dropzone = $('dropzone');
const fileInput = $('file') as HTMLInputElement;
const fileListEl = $('fileList');
const logEl = $('log');
const runBtn = $('run') as HTMLButtonElement;
const batchBtn = $('batch') as HTMLButtonElement;
const downloadBtn = $('download') as HTMLButtonElement;
const progressWrap = $('progressWrap');
const progressBar = $('progressBar');
const progressText = $('progressText');
const previewOriginal = $('previewOriginal') as HTMLImageElement;
const previewResult = $('previewResult') as HTMLImageElement;
const placeholderOriginal = $('placeholderOriginal');
const placeholderResult = $('placeholderResult');
const processingEl = $('processing');
const metaOriginal = $('metaOriginal');
const metaResult = $('metaResult');
const qualityRange = $('quality') as HTMLInputElement;
const qualityVal = $('qualityVal');
const qualityLabel = $('qualityLabel');
const formatSelect = $('format') as HTMLSelectElement;
const losslessField = $('losslessField');
const losslessCheckbox = $('lossless') as HTMLInputElement;

let processor: Awaited<ReturnType<typeof createImageProcessor>>;
let selectedFiles: File[] = [];
let lastResultBlob: Blob | null = null;
let lastOriginalUrl: string | null = null;
let lastResultUrl: string | null = null;
let busy = false;

function formatBytes(n: number): string {
  if (n < 1024) return `${n} B`;
  if (n < 1024 * 1024) return `${(n / 1024).toFixed(1)} KB`;
  return `${(n / (1024 * 1024)).toFixed(2)} MB`;
}

function setStatus(kind: 'loading' | 'ready' | 'error', text: string) {
  statusEl.className = `status status--${kind}`;
  statusEl.textContent = text;
}

function setBusy(value: boolean) {
  busy = value;
  runBtn.disabled = value || !selectedFiles.length;
  batchBtn.disabled = value || selectedFiles.length < 2;
  processingEl.classList.toggle('is-active', value);
}

function appendLog(line: string) {
  logEl.hidden = false;
  logEl.textContent += `${line}\n`;
}

function renderMeta(container: HTMLElement, info: ImageInfo, saved?: number) {
  const ratio =
    saved !== undefined && info.size > 0
      ? `<span class="highlight">-${((saved / info.size) * 100).toFixed(0)}%</span>`
      : '';
  container.innerHTML = `
    <dt>尺寸</dt><dd>${info.width} × ${info.height}</dd>
    <dt>格式</dt><dd>${info.format.toUpperCase()}</dd>
    <dt>体积</dt><dd>${formatBytes(info.size)} ${ratio}</dd>
    ${info.dpi ? `<dt>DPI</dt><dd>${info.dpi}</dd>` : ''}
  `;
}

function renderFileList(files: File[]) {
  if (!files.length) {
    fileListEl.hidden = true;
    runBtn.disabled = true;
    batchBtn.disabled = true;
    return;
  }
  fileListEl.hidden = false;
  fileListEl.innerHTML = files
    .map((f) => `<li><span>${f.name}</span><span>${formatBytes(f.size)}</span></li>`)
    .join('');
  runBtn.disabled = busy;
  batchBtn.disabled = busy || files.length < 2;
}

function revokeUrl(url: string | null) {
  if (url) URL.revokeObjectURL(url);
}

function showOriginal(file: File, meta: ImageInfo) {
  revokeUrl(lastOriginalUrl);
  lastOriginalUrl = URL.createObjectURL(file);
  previewOriginal.src = lastOriginalUrl;
  previewOriginal.hidden = false;
  placeholderOriginal.hidden = true;
  renderMeta(metaOriginal, meta);
}

function showResult(result: ProcessResult, originalSize: number) {
  revokeUrl(lastResultUrl);
  lastResultBlob = toBlob(result);
  lastResultUrl = URL.createObjectURL(lastResultBlob);
  previewResult.src = lastResultUrl;
  previewResult.hidden = false;
  placeholderResult.hidden = true;
  downloadBtn.hidden = false;

  const saved = Math.max(0, originalSize - result.size);
  renderMeta(
    metaResult,
    {
      width: result.width,
      height: result.height,
      format: result.format,
      mimeType: result.mimeType,
      size: result.size,
      hasAlpha: result.format === 'png' || result.format === 'webp',
    },
    saved,
  );
}

function readOptions(): ProcessOptions {
  const width = Number(($('width') as HTMLInputElement).value);
  const height = Number(($('height') as HTMLInputElement).value);
  const maxSizeKB = Number(($('maxSizeKB') as HTMLInputElement).value);
  const dpi = Number(($('dpi') as HTMLSelectElement).value);
  const format = formatSelect.value as Format;

  const options: ProcessOptions = {
    width: width > 0 ? width : undefined,
    height: height > 0 ? height : undefined,
    mode: ($('mode') as HTMLSelectElement).value as ResizeMode,
    format,
    maxSizeKB: maxSizeKB > 0 ? maxSizeKB : undefined,
    dpi: dpi > 0 ? dpi : undefined,
  };

  if (format === 'webp' && losslessCheckbox.checked) {
    options.lossless = true;
  }

  // maxSizeKB 优先于 quality（与 API 文档一致）
  if (!options.maxSizeKB && !(format === 'webp' && options.lossless)) {
    options.quality = Number(qualityRange.value);
  }

  return options;
}

function syncFormatControls() {
  const format = formatSelect.value;
  const isWebp = format === 'webp';
  const isPng = format === 'png';
  const maxSizeKB = Number(($('maxSizeKB') as HTMLInputElement).value);
  losslessField.hidden = !isWebp;
  qualityLabel.textContent = isPng ? 'PNG 量化强度' : isWebp ? 'WebP 有损质量' : 'JPEG 质量';
  const losslessOn = isWebp && losslessCheckbox.checked;
  qualityRange.disabled = maxSizeKB > 0 || losslessOn;
}

function setProgress(done: number, total: number) {
  progressWrap.hidden = false;
  const pct = total ? (done / total) * 100 : 0;
  progressBar.style.width = `${pct}%`;
  progressText.textContent = `${done} / ${total}`;
}

function resetProgress() {
  progressWrap.hidden = true;
  progressBar.style.width = '0%';
  progressText.textContent = '0 / 0';
}

async function handleFiles(fileList: FileList | File[]) {
  selectedFiles = [...fileList].filter((f) => f.type.startsWith('image/'));
  if (!selectedFiles.length) return;
  renderFileList(selectedFiles);

  const file = selectedFiles[0];
  const input = await toBytes(file);
  const meta = await processor.info(input);
  showOriginal(file, meta);
}

dropzone.addEventListener('click', () => fileInput.click());
dropzone.addEventListener('keydown', (e) => {
  if (e.key === 'Enter' || e.key === ' ') {
    e.preventDefault();
    fileInput.click();
  }
});

fileInput.addEventListener('change', () => {
  if (fileInput.files?.length) handleFiles(fileInput.files);
});

dropzone.addEventListener('dragover', (e) => {
  e.preventDefault();
  dropzone.classList.add('dropzone--active');
});

dropzone.addEventListener('dragleave', () => dropzone.classList.remove('dropzone--active'));

dropzone.addEventListener('drop', (e) => {
  e.preventDefault();
  dropzone.classList.remove('dropzone--active');
  if (e.dataTransfer?.files.length) {
    handleFiles(e.dataTransfer.files);
  }
});

qualityRange.addEventListener('input', () => {
  qualityVal.textContent = qualityRange.value;
});

formatSelect.addEventListener('change', syncFormatControls);
losslessCheckbox.addEventListener('change', syncFormatControls);
($('maxSizeKB') as HTMLInputElement).addEventListener('input', syncFormatControls);
syncFormatControls();

runBtn.addEventListener('click', async () => {
  const file = selectedFiles[0];
  if (!file || busy) return;

  logEl.textContent = '';
  logEl.hidden = true;
  setBusy(true);

  try {
    const input = await toBytes(file);
    const meta = await processor.info(input);
    appendLog(`info ${meta.width}×${meta.height} ${meta.format}`);

    const result = await processor.process(input, readOptions());
    appendLog(`done ${result.width}×${result.height} ${result.format} ${formatBytes(result.size)}`);
    showResult(result, meta.size);
  } catch (err) {
    appendLog(`error: ${err instanceof Error ? err.message : String(err)}`);
  } finally {
    setBusy(false);
  }
});

batchBtn.addEventListener('click', async () => {
  if (selectedFiles.length < 2 || busy) return;

  logEl.textContent = '';
  logEl.hidden = true;
  setBusy(true);
  resetProgress();

  try {
    const inputs = await Promise.all(selectedFiles.map((f) => toBytes(f)));
    const results = await processor.processBatch(inputs, {
      defaults: readOptions(),
      onProgress: (done, total) => {
        setProgress(done, total);
        appendLog(`progress ${done}/${total}`);
      },
    });

    appendLog(`batch done: ${results.length} images`);
    if (results[0]) {
      showResult(results[0], selectedFiles[0].size);
    }
  } catch (err) {
    appendLog(`error: ${err instanceof Error ? err.message : String(err)}`);
  } finally {
    setBusy(false);
  }
});

downloadBtn.addEventListener('click', () => {
  if (!lastResultBlob) return;
  const a = document.createElement('a');
  a.href = URL.createObjectURL(lastResultBlob);
  a.download = `picoo-${Date.now()}.${($('format') as HTMLSelectElement).value}`;
  a.click();
  URL.revokeObjectURL(a.href);
});

try {
  processor = await createImageProcessor();
  setStatus('ready', 'picoo ready');
} catch (err) {
  setStatus('error', '初始化失败');
  appendLog(String(err));
  runBtn.disabled = true;
  batchBtn.disabled = true;
}

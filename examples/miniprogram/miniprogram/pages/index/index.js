let createImageProcessor;
let toBytesFromPath;
let toTempPath;
let defaultWasmPath;
let loadError = '';

try {
  ({ createImageProcessor } = require('../../libs/picoo/index.js'));
  ({ toBytesFromPath, toTempPath } = require('../../libs/picoo/io.js'));
  defaultWasmPath = require('../../libs/picoo/wasm-path.js');
} catch (err) {
  const detail = err instanceof Error ? err.message : String(err);
  loadError =
    detail.includes('picoo') || detail.includes('module')
      ? `加载 picoo 失败：${detail}\n\n若缺少 libs/picoo，请在仓库根目录执行：\n./scripts/build.sh\nnpm run sync:mp`
      : detail;
}

const MAX_COUNT = 9;

function formatBytes(n) {
  if (n < 1024) return `${n} B`;
  if (n < 1024 * 1024) return `${(n / 1024).toFixed(1)} KB`;
  return `${(n / (1024 * 1024)).toFixed(2)} MB`;
}

function qualityLabelFor(format) {
  if (format === 'png') return 'PNG 量化强度';
  if (format === 'webp') return 'WebP 有损质量';
  return 'JPEG 质量';
}

function formatInfoMeta(info) {
  return `${info.width} × ${info.height} · ${info.format.toUpperCase()} · ${formatBytes(info.size)}`;
}

function formatResultMeta(result, originalSize) {
  let ratio = '';
  if (originalSize > 0) {
    const deltaPct = ((result.size - originalSize) / originalSize) * 100;
    const sign = deltaPct > 0 ? '+' : '';
    ratio = ` · ${sign}${deltaPct.toFixed(1)}%`;
  }
  return `${result.width} × ${result.height} · ${result.format.toUpperCase()} · ${formatBytes(result.size)}${ratio}`;
}

function authorizeAlbum() {
  return new Promise((resolve) => {
    wx.getSetting({
      success: (res) => {
        if (res.authSetting['scope.writePhotosAlbum']) {
          resolve(true);
          return;
        }
        wx.authorize({
          scope: 'scope.writePhotosAlbum',
          success: () => resolve(true),
          fail: () => {
            wx.showModal({
              title: '需要相册权限',
              content: '请在设置中允许保存到相册',
              confirmText: '去设置',
              success: (modalRes) => {
                if (modalRes.confirm) wx.openSetting({});
              },
            });
            resolve(false);
          },
        });
      },
      fail: () => resolve(false),
    });
  });
}

function saveOne(filePath) {
  return new Promise((resolve, reject) => {
    wx.saveImageToPhotosAlbum({
      filePath,
      success: () => resolve(),
      fail: (err) => reject(err),
    });
  });
}

Page({
  data: {
    ready: false,
    busy: false,
    statusKind: 'loading',
    statusText: '正在初始化 picoo…',
    maxCount: MAX_COUNT,
    items: [],
    selectedCount: 0,
    activeIndex: 0,
    activeMeta: '',
    results: [],
    resultCount: 0,
    resultActiveIndex: 0,
    activeResultPath: '',
    activeResultMeta: '',
    progressDone: 0,
    progressTotal: 0,
    progressPercent: 0,
    log: '',
    width: '1280',
    height: '',
    formats: ['jpeg', 'png', 'webp'],
    formatLabels: ['JPEG', 'PNG', 'WebP'],
    formatIndex: 0,
    quality: 80,
    lossless: false,
    maxSizeKB: '',
    qualityLabel: 'JPEG 质量',
    qualityDisabled: false,
  },

  processor: null,

  async onLoad() {
    if (loadError) {
      this.setData({
        ready: false,
        statusKind: 'error',
        statusText: '未同步 picoo 资源',
        log: loadError,
      });
      return;
    }

    try {
      this.processor = await createImageProcessor({
        runtime: 'mp-weixin',
        wasmPath: defaultWasmPath,
      });
      this.setData({
        ready: true,
        statusKind: 'ready',
        statusText: 'picoo ready · worker',
      });
    } catch (err) {
      const message = err instanceof Error ? err.message : String(err);
      this.setData({
        ready: false,
        statusKind: 'error',
        statusText: '初始化失败',
        log: message,
      });
    }
  },

  onUnload() {
    this.processor?.dispose?.();
    this.processor = null;
  },

  syncQualityState() {
    const format = this.data.formats[this.data.formatIndex];
    const maxSizeKB = Number(this.data.maxSizeKB);
    const losslessOn = format === 'webp' && this.data.lossless;
    this.setData({
      qualityLabel: qualityLabelFor(format),
      qualityDisabled: maxSizeKB > 0 || losslessOn,
    });
  },

  onFieldInput(e) {
    const key = e.currentTarget.dataset.key;
    this.setData({ [key]: e.detail.value }, () => this.syncQualityState());
  },

  onFormatChange(e) {
    this.setData({ formatIndex: Number(e.detail.value) }, () => this.syncQualityState());
  },

  onLosslessChange(e) {
    this.setData({ lossless: !!e.detail.value }, () => this.syncQualityState());
  },

  onQualityChanging(e) {
    if (this.data.qualityDisabled) return;
    this.setData({ quality: Number(e.detail.value) });
  },

  onQualityChange(e) {
    if (this.data.qualityDisabled) return;
    this.setData({ quality: Number(e.detail.value) });
  },

  appendLog(line) {
    const next = this.data.log ? `${this.data.log}\n${line}` : line;
    this.setData({ log: next });
  },

  readOptions() {
    const format = this.data.formats[this.data.formatIndex];
    const width = Number(this.data.width);
    const height = Number(this.data.height);
    const maxSizeKB = Number(this.data.maxSizeKB);

    const options = {
      width: width > 0 ? width : undefined,
      height: height > 0 ? height : undefined,
      mode: 'inside',
      format,
      maxSizeKB: maxSizeKB > 0 ? maxSizeKB : undefined,
    };

    if (format === 'webp' && this.data.lossless) {
      options.lossless = true;
    }

    if (!options.maxSizeKB && !(format === 'webp' && options.lossless)) {
      options.quality = this.data.quality;
    }

    return options;
  },

  setActiveItem(index) {
    const item = this.data.items[index];
    this.setData({
      activeIndex: index,
      activeMeta: item?.meta || '',
    });
  },

  setActiveResult(index) {
    const item = this.data.results[index];
    this.setData({
      resultActiveIndex: index,
      activeResultPath: item?.path || '',
      activeResultMeta: item?.meta || '',
    });
  },

  onSelectItem(e) {
    const index = Number(e.currentTarget.dataset.index);
    this.setActiveItem(index);
  },

  onSelectResult(e) {
    const index = Number(e.currentTarget.dataset.index);
    this.setActiveResult(index);
  },

  onClear() {
    if (this.data.busy) return;
    this.setData({
      items: [],
      selectedCount: 0,
      activeIndex: 0,
      activeMeta: '',
      results: [],
      resultCount: 0,
      resultActiveIndex: 0,
      activeResultPath: '',
      activeResultMeta: '',
      progressDone: 0,
      progressTotal: 0,
      progressPercent: 0,
      log: '',
    });
  },

  onChoose() {
    if (this.data.busy) return;

    wx.chooseMedia({
      count: MAX_COUNT,
      mediaType: ['image'],
      sourceType: ['album', 'camera'],
      success: async (res) => {
        const files = (res.tempFiles || []).filter((f) => f?.tempFilePath);
        if (!files.length) return;

        this.setData({
          log: '',
          results: [],
          resultCount: 0,
          resultActiveIndex: 0,
          activeResultPath: '',
          activeResultMeta: '',
          progressDone: 0,
          progressTotal: 0,
          progressPercent: 0,
        });

        wx.showLoading({ title: '读取信息', mask: true });
        try {
          const items = [];
          for (let i = 0; i < files.length; i++) {
            const file = files[i];
            const path = file.tempFilePath;
            let meta = formatBytes(file.size || 0);
            let size = file.size || 0;
            try {
              const input = await toBytesFromPath(path);
              const info = await this.processor.info(input);
              meta = formatInfoMeta(info);
              size = info.size;
            } catch (err) {
              this.appendLog(`info#${i + 1}: ${err instanceof Error ? err.message : String(err)}`);
            }
            items.push({ path, meta, size });
          }

          this.setData({
            items,
            selectedCount: items.length,
          });
          this.setActiveItem(0);
        } finally {
          wx.hideLoading();
        }
      },
    });
  },

  async onProcess() {
    if (!this.processor || !this.data.selectedCount || this.data.busy) return;

    const items = this.data.items;
    const options = this.readOptions();
    const total = items.length;

    this.setData({
      busy: true,
      log: '',
      results: [],
      resultCount: 0,
      resultActiveIndex: 0,
      activeResultPath: '',
      activeResultMeta: '',
      progressDone: 0,
      progressTotal: total,
      progressPercent: 0,
    });

    try {
      this.appendLog(`processBatch ×${total} ${JSON.stringify(options)}`);
      const inputs = [];
      for (const item of items) {
        inputs.push(await toBytesFromPath(item.path));
      }

      const processed = await this.processor.processBatch(inputs, {
        defaults: options,
        onError: 'stop',
        onProgress: (done, all) => {
          this.setData({
            progressDone: done,
            progressTotal: all,
            progressPercent: all ? Math.round((done / all) * 100) : 0,
          });
          this.appendLog(`progress ${done}/${all}`);
        },
      });

      const results = [];
      for (let i = 0; i < processed.length; i++) {
        const result = processed[i];
        const path = await toTempPath(result);
        results.push({
          path,
          meta: formatResultMeta(result, items[i]?.size),
          format: result.format,
        });
      }

      this.setData({
        results,
        resultCount: results.length,
        progressDone: total,
        progressPercent: 100,
      });
      this.setActiveResult(0);
      this.appendLog(`batch done: ${results.length}`);
      wx.showToast({
        title: total > 1 ? `完成 ${results.length} 张` : '完成',
        icon: 'success',
      });
    } catch (err) {
      this.appendLog(`error: ${err instanceof Error ? err.message : String(err)}`);
      wx.showToast({ title: '处理失败', icon: 'none' });
    } finally {
      this.setData({ busy: false });
    }
  },

  async onSave() {
    const results = this.data.results;
    if (!results.length || this.data.busy) return;

    const ok = await authorizeAlbum();
    if (!ok) return;

    if (results.length === 1) {
      try {
        await saveOne(results[0].path);
        wx.showToast({ title: '已保存', icon: 'success' });
      } catch {
        wx.showToast({ title: '保存失败', icon: 'none' });
      }
      return;
    }

    this.setData({ busy: true });
    wx.showLoading({ title: '保存中', mask: true });
    let saved = 0;
    try {
      for (const item of results) {
        await saveOne(item.path);
        saved += 1;
      }
      wx.showToast({ title: `已保存 ${saved} 张`, icon: 'success' });
    } catch {
      wx.showToast({
        title: saved ? `已保存 ${saved} 张，后续失败` : '保存失败',
        icon: 'none',
      });
    } finally {
      wx.hideLoading();
      this.setData({ busy: false });
    }
  },
});

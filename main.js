const { app, BrowserWindow, ipcMain, Tray, Menu, nativeImage, Notification, shell, safeStorage } = require('electron');
const path = require('path');
const fs = require('fs');
const https = require('https');
const { spawn } = require('child_process');

let mainWindow;
let tray;
let isQuitting = false;
let runOnStartup = false;
let allowBackground = true; // Default: allow running in background

// Config/cache paths for persistent settings and API debug cache
const appDataDir = app.getPath('userData');
const configDir = path.join(appDataDir, 'config');
const apiCacheDir = path.join(appDataDir, 'cache');
process.env.CRYPTOAI_CACHE_DIR = apiCacheDir;
const settingsPath = path.join(configDir, 'settings.json');
const secureCredentialsPath = path.join(configDir, 'secure-credentials.json');
const updatesDir = path.join(appDataDir, 'updates');
const repoOwner = 'Pedro21062014';
const repoName = 'CryptoAI-Investor';
let latestUpdateInfo = null;
let downloadedUpdatePath = null;

// Saves sanitized request/response JSON for all axios API calls in the local cache folder.
require('./src/js/api-cache').installAxiosCache();

function ensureConfigDir() {
  if (!fs.existsSync(configDir)) fs.mkdirSync(configDir, { recursive: true });
}

function encryptSecureJson(data) {
  const plain = Buffer.from(JSON.stringify(data || {}), 'utf8');
  if (safeStorage.isEncryptionAvailable()) {
    return {
      encrypted: true,
      payload: safeStorage.encryptString(plain.toString('utf8')).toString('base64')
    };
  }
  return {
    encrypted: false,
    payload: plain.toString('base64')
  };
}

function decryptSecureJson(fileData) {
  if (!fileData || !fileData.payload) return {};
  const buffer = Buffer.from(fileData.payload, 'base64');
  if (fileData.encrypted) {
    return JSON.parse(safeStorage.decryptString(buffer));
  }
  return JSON.parse(buffer.toString('utf8'));
}

function readSecureCredentials() {
  try {
    if (!fs.existsSync(secureCredentialsPath)) return { exchangeConfigs: {}, aiConfigs: {} };
    const fileData = JSON.parse(fs.readFileSync(secureCredentialsPath, 'utf8'));
    return decryptSecureJson(fileData);
  } catch (e) {
    return { exchangeConfigs: {}, aiConfigs: {}, error: e.message };
  }
}

function writeSecureCredentials(data) {
  ensureConfigDir();
  fs.writeFileSync(secureCredentialsPath, JSON.stringify(encryptSecureJson(data), null, 2), 'utf8');
  return { success: true, encrypted: safeStorage.isEncryptionAvailable(), path: secureCredentialsPath };
}

function compareVersions(a, b) {
  const pa = String(a || '0').replace(/^v/i, '').split('.').map(n => parseInt(n, 10) || 0);
  const pb = String(b || '0').replace(/^v/i, '').split('.').map(n => parseInt(n, 10) || 0);
  const len = Math.max(pa.length, pb.length);
  for (let i = 0; i < len; i++) {
    const diff = (pa[i] || 0) - (pb[i] || 0);
    if (diff > 0) return 1;
    if (diff < 0) return -1;
  }
  return 0;
}

function requestJson(url) {
  return new Promise((resolve, reject) => {
    const req = https.get(url, {
      headers: {
        'User-Agent': 'CryptoAI-Investor-Updater',
        'Accept': 'application/vnd.github+json, application/json'
      }
    }, res => {
      if (res.statusCode >= 300 && res.statusCode < 400 && res.headers.location) {
        res.resume();
        return resolve(requestJson(res.headers.location));
      }
      let body = '';
      res.setEncoding('utf8');
      res.on('data', chunk => { body += chunk; });
      res.on('end', () => {
        if (res.statusCode < 200 || res.statusCode >= 300) {
          return reject(new Error(`HTTP ${res.statusCode}: ${body.slice(0, 200)}`));
        }
        try { resolve(JSON.parse(body)); }
        catch (e) { reject(e); }
      });
    });
    req.on('error', reject);
    req.setTimeout(20000, () => req.destroy(new Error('Timeout ao verificar atualizacao')));
  });
}

function selectReleaseAsset(release) {
  const assets = release?.assets || [];
  if (process.platform === 'win32') {
    return assets.find(a => /Setup\.exe$/i.test(a.name)) || assets.find(a => /win\.zip$/i.test(a.name)) || assets.find(a => /\.exe$/i.test(a.name));
  }
  if (process.platform === 'linux') {
    return assets.find(a => /\.deb$/i.test(a.name)) || assets.find(a => /linux/i.test(a.name));
  }
  return assets[0];
}

async function checkForUpdates() {
  const currentVersion = app.getVersion();
  const packageUrl = `https://raw.githubusercontent.com/${repoOwner}/${repoName}/main/package.json?ts=${Date.now()}`;
  const remotePackage = await requestJson(packageUrl);
  const latestVersion = remotePackage.version;
  const hasUpdate = compareVersions(latestVersion, currentVersion) > 0;
  let release = null;
  let asset = null;
  if (hasUpdate) {
    release = await requestJson(`https://api.github.com/repos/${repoOwner}/${repoName}/releases/tags/v${latestVersion}`);
    asset = selectReleaseAsset(release);
  }
  latestUpdateInfo = {
    currentVersion,
    latestVersion,
    hasUpdate,
    releaseUrl: release?.html_url || `https://github.com/${repoOwner}/${repoName}/releases/tag/v${latestVersion}`,
    releaseName: release?.name || `v${latestVersion}`,
    releaseNotes: release?.body || '',
    asset: asset ? { name: asset.name, size: asset.size, downloadUrl: asset.browser_download_url } : null
  };
  return latestUpdateInfo;
}

function downloadFileWithProgress(url, destination, event) {
  return new Promise((resolve, reject) => {
    fs.mkdirSync(path.dirname(destination), { recursive: true });
    const file = fs.createWriteStream(destination);
    const startedAt = Date.now();
    let received = 0;
    let total = 0;
    const download = currentUrl => {
      const req = https.get(currentUrl, { headers: { 'User-Agent': 'CryptoAI-Investor-Updater' } }, res => {
        if (res.statusCode >= 300 && res.statusCode < 400 && res.headers.location) {
          res.resume();
          return download(res.headers.location);
        }
        if (res.statusCode < 200 || res.statusCode >= 300) {
          file.close();
          fs.rm(destination, { force: true }, () => {});
          return reject(new Error(`HTTP ${res.statusCode} ao baixar atualizacao`));
        }
        total = parseInt(res.headers['content-length'] || '0', 10) || 0;
        res.on('data', chunk => {
          received += chunk.length;
          const percent = total ? Math.round((received / total) * 100) : 0;
          const elapsed = Math.max(1, (Date.now() - startedAt) / 1000);
          event?.sender?.send('update:download-progress', { received, total, percent, speed: received / elapsed, filePath: destination });
        });
        res.pipe(file);
        file.on('finish', () => file.close(() => resolve(destination)));
      });
      req.on('error', err => {
        file.close();
        fs.rm(destination, { force: true }, () => {});
        reject(err);
      });
      req.setTimeout(120000, () => req.destroy(new Error('Timeout no download da atualizacao')));
    };
    download(url);
  });
}

async function downloadLatestUpdate(event) {
  if (!latestUpdateInfo || !latestUpdateInfo.hasUpdate) latestUpdateInfo = await checkForUpdates();
  if (!latestUpdateInfo.hasUpdate) return { success: false, error: 'Nenhuma atualizacao disponivel' };
  if (!latestUpdateInfo.asset?.downloadUrl) return { success: false, error: 'Release nao tem arquivo compativel para baixar' };
  const destination = path.join(updatesDir, latestUpdateInfo.asset.name);
  downloadedUpdatePath = await downloadFileWithProgress(latestUpdateInfo.asset.downloadUrl, destination, event);
  return { success: true, filePath: downloadedUpdatePath, asset: latestUpdateInfo.asset };
}

async function installDownloadedUpdate() {
  if (!downloadedUpdatePath || !fs.existsSync(downloadedUpdatePath)) return { success: false, error: 'Arquivo de atualizacao nao encontrado. Baixe novamente.' };
  if (process.platform === 'win32' && downloadedUpdatePath.toLowerCase().endsWith('.exe')) {
    spawn(downloadedUpdatePath, [], { detached: true, stdio: 'ignore' }).unref();
    isQuitting = true;
    setTimeout(() => app.quit(), 1000);
    return { success: true, quitting: true };
  }
  const result = await shell.openPath(downloadedUpdatePath);
  return { success: !result, error: result || null, filePath: downloadedUpdatePath };
}


function loadSettings() {
  try {
    if (fs.existsSync(settingsPath)) {
      const data = JSON.parse(fs.readFileSync(settingsPath, 'utf8'));
      runOnStartup = data.runOnStartup || false;
      allowBackground = data.allowBackground !== undefined ? data.allowBackground : true;
    }
  } catch (e) {
    // Ignore errors
  }
}

function saveSettings() {
  try {
    ensureConfigDir();
    fs.writeFileSync(settingsPath, JSON.stringify({
      runOnStartup,
      allowBackground
    }, null, 2));
  } catch (e) {
    // Ignore errors
  }
}

function createTray() {
  const iconPath = path.join(__dirname, 'build', 'icon.png');
  let trayIcon;
  try {
    trayIcon = nativeImage.createFromPath(iconPath);
    if (trayIcon.isEmpty()) trayIcon = nativeImage.createEmpty();
  } catch (e) {
    trayIcon = nativeImage.createEmpty();
  }

  tray = new Tray(trayIcon);
  const contextMenu = Menu.buildFromTemplate([
    { label: 'Mostrar CryptoAI Investor', click: () => showWindow() },
    { type: 'separator' },
    { label: 'Sair', click: () => { isQuitting = true; app.quit(); } }
  ]);
  tray.setToolTip('CryptoAI Investor');
  tray.setContextMenu(contextMenu);
  tray.on('double-click', () => showWindow());
}

function showWindow() {
  if (mainWindow) {
    mainWindow.show();
    mainWindow.focus();
    if (mainWindow.isMinimized()) mainWindow.restore();
  }
}

function createWindow() {
  loadSettings();

  mainWindow = new BrowserWindow({
    width: 1400,
    height: 900,
    minWidth: 900,
    minHeight: 700,
    frame: false,
    transparent: false,
    backgroundColor: '#0f1320',
    titleBarStyle: 'hidden',
    webPreferences: {
      preload: path.join(__dirname, 'preload.js'),
      contextIsolation: true,
      nodeIntegration: false,
      sandbox: false
    },
    icon: path.join(__dirname, 'build', 'icon.png'),
    show: false
  });

  mainWindow.loadFile(path.join(__dirname, 'src', 'index.html'));

  mainWindow.once('ready-to-show', () => {
    mainWindow.show();
  });

  // When user closes window: hide to tray if background mode is on, otherwise quit
  mainWindow.on('close', (e) => {
    if (!isQuitting && allowBackground) {
      e.preventDefault();
      mainWindow.hide();
      if (!tray) createTray();
    }
  });

  mainWindow.on('closed', () => {
    mainWindow = null;
  });

  // Create tray if background mode is enabled
  if (allowBackground) {
    createTray();
  }
}

app.whenReady().then(createWindow);

app.on('window-all-closed', () => {
  if (process.platform !== 'darwin' && !allowBackground) app.quit();
});

app.on('activate', () => {
  if (mainWindow === null) {
    createWindow();
  } else {
    showWindow();
  }
});

app.on('before-quit', () => {
  isQuitting = true;
});

// Set/Login Item for auto-start
function setAutoStart(enabled) {
  app.setLoginItemSettings({
    openAtLogin: enabled,
    path: app.getPath('exe')
  });
}

// IPC Handlers
ipcMain.handle('get-app-path', () => app.getAppPath());
ipcMain.handle('get-assets-path', () => path.join(app.getAppPath(), 'src', 'assets'));
ipcMain.handle('cache:get-path', () => apiCacheDir);
ipcMain.handle('cache:open-folder', async () => {
  if (!fs.existsSync(apiCacheDir)) fs.mkdirSync(apiCacheDir, { recursive: true });
  const result = await shell.openPath(apiCacheDir);
  return { success: !result, error: result || null, path: apiCacheDir };
});
ipcMain.handle('secure:get-credentials', () => readSecureCredentials());
ipcMain.handle('secure:set-credentials', (e, data) => writeSecureCredentials(data));
ipcMain.handle('secure:clear-credentials', () => {
  try {
    if (fs.existsSync(secureCredentialsPath)) fs.unlinkSync(secureCredentialsPath);
    return { success: true };
  } catch (e) {
    return { success: false, error: e.message };
  }
});
ipcMain.handle('secure:get-info', () => ({
  encryptionAvailable: safeStorage.isEncryptionAvailable(),
  path: secureCredentialsPath
}));
ipcMain.handle('updates:check', async () => checkForUpdates());
ipcMain.handle('updates:download', async (event) => downloadLatestUpdate(event));
ipcMain.handle('updates:install', async () => installDownloadedUpdate());
ipcMain.handle('updates:get-downloaded-path', () => ({ filePath: downloadedUpdatePath, exists: !!downloadedUpdatePath && fs.existsSync(downloadedUpdatePath) }));

// Exchange API handlers
const exchangeHandlers = require('./src/js/exchanges');
ipcMain.handle('exchange:test-connection', async (e, config) => exchangeHandlers.testConnection(config));
ipcMain.handle('exchange:get-balance', async (e, config) => exchangeHandlers.getBalance(config));
ipcMain.handle('exchange:get-markets', async (e, config) => exchangeHandlers.getMarkets(config));
ipcMain.handle('exchange:place-order', async (e, config, order) => exchangeHandlers.placeOrder(config, order));
ipcMain.handle('exchange:get-orderbook', async (e, config, symbol) => exchangeHandlers.getOrderBook(config, symbol));
ipcMain.handle('exchange:get-candlesticks', async (e, config, symbol, interval) => exchangeHandlers.getCandlesticks(config, symbol, interval));

// AI API handlers
const aiHandlers = require('./src/js/ai');
ipcMain.handle('ai:analyze', async (e, config, data) => aiHandlers.analyze(config, data));
ipcMain.handle('ai:test-connection', async (e, config) => aiHandlers.testConnection(config));
ipcMain.handle('ai:get-analysis', async (e, config, marketData, newsData) => aiHandlers.getAnalysis(config, marketData, newsData));

// News handlers
const newsHandlers = require('./src/js/news');
ipcMain.handle('news:get-crypto-news', async (e) => newsHandlers.getCryptoNews());
ipcMain.handle('news:get-market-sentiment', async (e) => newsHandlers.getMarketSentiment());

// Risk handlers
const riskHandlers = require('./src/js/risk');
ipcMain.handle('risk:calculate', async (e, config, portfolio, analysis) => riskHandlers.calculate(config, portfolio, analysis));
ipcMain.handle('risk:validate-trade', async (e, config, trade, portfolio) => riskHandlers.validateTrade(config, trade, portfolio));

// Bot handlers
const botHandlers = require('./src/js/bot');
ipcMain.handle('bot:get-info', async () => botHandlers.getBotInfo());
ipcMain.handle('bot:analyze', async (e, exchangeConfig, symbol, interval, context) => botHandlers.analyze(exchangeConfig, symbol, interval, context));
ipcMain.handle('bot:test-connection', async () => botHandlers.testConnection());

// Window controls
ipcMain.handle('window:minimize', () => mainWindow?.minimize());
ipcMain.handle('window:maximize', () => {
  if (mainWindow?.isMaximized()) mainWindow.unmaximize();
  else mainWindow?.maximize();
});
ipcMain.handle('window:close', () => {
  if (allowBackground) {
    mainWindow?.hide();
    if (!tray) createTray();
  } else {
    isQuitting = true;
    mainWindow?.close();
  }
});
ipcMain.handle('window:is-maximized', () => mainWindow?.isMaximized());

// Settings handlers
ipcMain.handle('settings:get', () => {
  loadSettings();
  return { runOnStartup, allowBackground };
});

ipcMain.handle('settings:set-run-on-startup', (e, enabled) => {
  runOnStartup = enabled;
  setAutoStart(enabled);
  saveSettings();
  return { success: true };
});

ipcMain.handle('settings:set-allow-background', (e, enabled) => {
  allowBackground = enabled;
  saveSettings();
  // Create or destroy tray based on setting
  if (enabled && !tray) {
    createTray();
  } else if (!enabled && tray) {
    tray.destroy();
    tray = null;
  }
  return { success: true };
});

ipcMain.handle('app:quit', () => {
  isQuitting = true;
  mainWindow?.close();
  app.quit();
});

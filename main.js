const { app, BrowserWindow, ipcMain, Tray, Menu, nativeImage, Notification } = require('electron');
const path = require('path');
const fs = require('fs');

let mainWindow;
let tray;
let isQuitting = false;
let runOnStartup = false;
let allowBackground = true; // Default: allow running in background

// Config file path for persistent settings
const configDir = path.join(app.getPath('userData'), 'config');
const settingsPath = path.join(configDir, 'settings.json');

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
    if (!fs.existsSync(configDir)) fs.mkdirSync(configDir, { recursive: true });
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
ipcMain.handle('bot:analyze', async (e, exchangeConfig, symbol, interval) => botHandlers.analyze(exchangeConfig, symbol, interval));
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

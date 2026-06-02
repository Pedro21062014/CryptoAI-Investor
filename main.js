const { app, BrowserWindow, ipcMain, Tray, Menu, nativeImage, Notification } = require('electron');
const path = require('path');
const fs = require('fs');

let mainWindow;
let tray;

function createWindow() {
  mainWindow = new BrowserWindow({
    width: 1400,
    height: 900,
    minWidth: 1100,
    minHeight: 700,
    frame: false,
    transparent: false,
    backgroundColor: '#0a0e1a',
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

  mainWindow.on('closed', () => {
    mainWindow = null;
  });
}

app.whenReady().then(createWindow);

app.on('window-all-closed', () => {
  if (process.platform !== 'darwin') app.quit();
});

app.on('activate', () => {
  if (mainWindow === null) createWindow();
});

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

// Window controls
ipcMain.handle('window:minimize', () => mainWindow?.minimize());
ipcMain.handle('window:maximize', () => {
  if (mainWindow?.isMaximized()) mainWindow.unmaximize();
  else mainWindow?.maximize();
});
ipcMain.handle('window:close', () => mainWindow?.close());
ipcMain.handle('window:is-maximized', () => mainWindow?.isMaximized());

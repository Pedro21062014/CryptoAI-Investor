const { contextBridge, ipcRenderer } = require('electron');

contextBridge.exposeInMainWorld('electronAPI', {
  // App
  getAppPath: () => ipcRenderer.invoke('get-app-path'),
  getAssetsPath: () => ipcRenderer.invoke('get-assets-path'),
  getCachePath: () => ipcRenderer.invoke('cache:get-path'),
  openCacheFolder: () => ipcRenderer.invoke('cache:open-folder'),
  getSecureCredentials: () => ipcRenderer.invoke('secure:get-credentials'),
  setSecureCredentials: (data) => ipcRenderer.invoke('secure:set-credentials', data),
  clearSecureCredentials: () => ipcRenderer.invoke('secure:clear-credentials'),
  getSecureInfo: () => ipcRenderer.invoke('secure:get-info'),
  checkForUpdates: () => ipcRenderer.invoke('updates:check'),
  downloadUpdate: () => ipcRenderer.invoke('updates:download'),
  installUpdate: () => ipcRenderer.invoke('updates:install'),
  getDownloadedUpdatePath: () => ipcRenderer.invoke('updates:get-downloaded-path'),
  sendGatewayMessage: (channelId, channelConfig, text) => ipcRenderer.invoke('gateway:send-message', channelId, channelConfig, text),
  onUpdateDownloadProgress: (callback) => ipcRenderer.on('update:download-progress', (e, data) => callback(data)),

  // Window controls
  minimize: () => ipcRenderer.invoke('window:minimize'),
  maximize: () => ipcRenderer.invoke('window:maximize'),
  close: () => ipcRenderer.invoke('window:close'),
  isMaximized: () => ipcRenderer.invoke('window:is-maximized'),

  // Settings
  getSettings: () => ipcRenderer.invoke('settings:get'),
  setRunOnStartup: (enabled) => ipcRenderer.invoke('settings:set-run-on-startup', enabled),
  setAllowBackground: (enabled) => ipcRenderer.invoke('settings:set-allow-background', enabled),
  quitApp: () => ipcRenderer.invoke('app:quit'),

  // Exchange APIs
  testConnection: (config) => ipcRenderer.invoke('exchange:test-connection', config),
  getBalance: (config) => ipcRenderer.invoke('exchange:get-balance', config),
  getMarkets: (config) => ipcRenderer.invoke('exchange:get-markets', config),
  getSymbolRules: (config, symbol) => ipcRenderer.invoke('exchange:get-symbol-rules', config, symbol),
  placeOrder: (config, order) => ipcRenderer.invoke('exchange:place-order', config, order),
  getOrderBook: (config, symbol) => ipcRenderer.invoke('exchange:get-orderbook', config, symbol),
  getCandlesticks: (config, symbol, interval) => ipcRenderer.invoke('exchange:get-candlesticks', config, symbol, interval),

  // AI APIs
  aiAnalyze: (config, data) => ipcRenderer.invoke('ai:analyze', config, data),
  aiTestConnection: (config) => ipcRenderer.invoke('ai:test-connection', config),
  aiGetAnalysis: (config, marketData, newsData) => ipcRenderer.invoke('ai:get-analysis', config, marketData, newsData),
  aiListModels: (config) => ipcRenderer.invoke('ai:list-models', config),
  aiChat: (config, messages, context) => ipcRenderer.invoke('ai:chat', config, messages, context),

  // News
  getCryptoNews: () => ipcRenderer.invoke('news:get-crypto-news'),
  getMarketSentiment: () => ipcRenderer.invoke('news:get-market-sentiment'),

  // Risk
  calculateRisk: (config, portfolio, analysis) => ipcRenderer.invoke('risk:calculate', config, portfolio, analysis),
  validateTrade: (config, trade, portfolio) => ipcRenderer.invoke('risk:validate-trade', config, trade, portfolio),

  // Bot
  botGetInfo: () => ipcRenderer.invoke('bot:get-info'),
  botAnalyze: (exchangeConfig, symbol, interval, context) => ipcRenderer.invoke('bot:analyze', exchangeConfig, symbol, interval, context),
  botAnalyzePositionExit: (exchangeConfig, position, interval, context) => ipcRenderer.invoke('bot:analyze-position-exit', exchangeConfig, position, interval, context),
  botTestConnection: () => ipcRenderer.invoke('bot:test-connection'),

  // Backup/Restore
  backupExport: (configData) => ipcRenderer.invoke('backup:export', configData),
  backupImport: (backupData) => ipcRenderer.invoke('backup:import', backupData),
  backupValidateFile: (backupData) => ipcRenderer.invoke('backup:validate-file', backupData),

  // Events
  onTradeExecuted: (callback) => ipcRenderer.on('trade-executed', (e, data) => callback(data)),
  onAnalysisComplete: (callback) => ipcRenderer.on('analysis-complete', (e, data) => callback(data)),
  onNotification: (callback) => ipcRenderer.on('notification', (e, data) => callback(data))
});

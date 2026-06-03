const { contextBridge, ipcRenderer } = require('electron');

contextBridge.exposeInMainWorld('electronAPI', {
  // App
  getAppPath: () => ipcRenderer.invoke('get-app-path'),
  getAssetsPath: () => ipcRenderer.invoke('get-assets-path'),

  // Window controls
  minimize: () => ipcRenderer.invoke('window:minimize'),
  maximize: () => ipcRenderer.invoke('window:maximize'),
  close: () => ipcRenderer.invoke('window:close'),
  isMaximized: () => ipcRenderer.invoke('window:is-maximized'),

  // Exchange APIs
  testConnection: (config) => ipcRenderer.invoke('exchange:test-connection', config),
  getBalance: (config) => ipcRenderer.invoke('exchange:get-balance', config),
  getMarkets: (config) => ipcRenderer.invoke('exchange:get-markets', config),
  placeOrder: (config, order) => ipcRenderer.invoke('exchange:place-order', config, order),
  getOrderBook: (config, symbol) => ipcRenderer.invoke('exchange:get-orderbook', config, symbol),
  getCandlesticks: (config, symbol, interval) => ipcRenderer.invoke('exchange:get-candlesticks', config, symbol, interval),

  // AI APIs
  aiAnalyze: (config, data) => ipcRenderer.invoke('ai:analyze', config, data),
  aiTestConnection: (config) => ipcRenderer.invoke('ai:test-connection', config),
  aiGetAnalysis: (config, marketData, newsData) => ipcRenderer.invoke('ai:get-analysis', config, marketData, newsData),

  // News
  getCryptoNews: () => ipcRenderer.invoke('news:get-crypto-news'),
  getMarketSentiment: () => ipcRenderer.invoke('news:get-market-sentiment'),

  // Risk
  calculateRisk: (config, portfolio, analysis) => ipcRenderer.invoke('risk:calculate', config, portfolio, analysis),
  validateTrade: (config, trade, portfolio) => ipcRenderer.invoke('risk:validate-trade', config, trade, portfolio),

  // Bot
  botGetInfo: () => ipcRenderer.invoke('bot:get-info'),
  botAnalyze: (exchangeConfig, symbol, interval) => ipcRenderer.invoke('bot:analyze', exchangeConfig, symbol, interval),
  botTestConnection: () => ipcRenderer.invoke('bot:test-connection'),

  // Events
  onTradeExecuted: (callback) => ipcRenderer.on('trade-executed', (e, data) => callback(data)),
  onAnalysisComplete: (callback) => ipcRenderer.on('analysis-complete', (e, data) => callback(data)),
  onNotification: (callback) => ipcRenderer.on('notification', (e, data) => callback(data))
});

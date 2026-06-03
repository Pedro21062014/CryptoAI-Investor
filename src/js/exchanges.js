const axios = require('axios');
const crypto = require('crypto');

// Exchange API implementations
const exchanges = {
  bybit: {
    baseUrl: 'https://api.bybit.com',
    testnetUrl: 'https://api-testnet.bybit.com',

    sign(secret, timestamp, apiKey, params) {
      const payload = timestamp + apiKey + '20000' + params;
      return crypto.createHmac('sha256', secret).update(payload).digest('hex');
    },

    getUrl(config) {
      return config.testnet ? this.testnetUrl : this.baseUrl;
    },

    async testConnection(config) {
      try {
        const url = this.getUrl(config);
        const timestamp = Date.now().toString();
        const params = `accountType=UNIFIED`;
        const sign = this.sign(config.apiSecret, timestamp, config.apiKey, params);
        const response = await axios.get(`${url}/v5/account/wallet-balance?${params}`, {
          headers: {
            'X-BAPI-API-KEY': config.apiKey,
            'X-BAPI-TIMESTAMP': timestamp,
            'X-BAPI-SIGN': sign,
            'X-BAPI-RECV-WINDOW': '20000'
          }
        });
        if (response.data.retCode === 0) {
          return { success: true, data: response.data };
        }
        return { success: false, error: response.data.retMsg || 'Erro desconhecido Bybit' };
      } catch (err) {
        const errMsg = err.response?.data?.retMsg || err.message;
        if (config.testnet) {
          return { success: false, error: `Bybit Testnet erro: ${errMsg}. Use API keys geradas em testnet.bybit.com` };
        }
        return { success: false, error: `Bybit: ${errMsg}` };
      }
    },

    async getBalance(config) {
      try {
        const url = this.getUrl(config);
        const timestamp = Date.now().toString();
        const params = `accountType=UNIFIED`;
        const sign = this.sign(config.apiSecret, timestamp, config.apiKey, params);
        const response = await axios.get(`${url}/v5/account/wallet-balance?${params}`, {
          headers: {
            'X-BAPI-API-KEY': config.apiKey,
            'X-BAPI-TIMESTAMP': timestamp,
            'X-BAPI-SIGN': sign,
            'X-BAPI-RECV-WINDOW': '20000'
          }
        });
        if (response.data.retCode === 0) {
          const account = response.data.result.list?.[0] || {};
          const coins = (account.coin || []).filter(c => parseFloat(c.walletBalance) > 0);
          const totalEquity = parseFloat(account.totalEquity || account.totalAvailableBalance || '0');
          const balanceItems = coins.map(c => ({
            coin: c.coin,
            walletBalance: parseFloat(c.walletBalance || '0'),
            usdValue: parseFloat(c.usdValue || c.walletBalance || '0'),
            free: parseFloat(c.free || c.availableToWithdraw || '0'),
            locked: parseFloat(c.locked || '0'),
            unrealisedPnl: parseFloat(c.unrealisedPnl || '0')
          }));
          return {
            success: true,
            balance: balanceItems,
            totalEquity: totalEquity,
            exchange: 'bybit'
          };
        }
        return { success: false, error: response.data.retMsg };
      } catch (err) {
        const errMsg = err.response?.data?.retMsg || err.message;
        if (config.testnet) {
          return { success: false, error: `Bybit Testnet: ${errMsg}. Use API keys de testnet.bybit.com` };
        }
        return { success: false, error: `Bybit: ${errMsg}` };
      }
    },

    async getMarkets(config) {
      try {
        const url = this.getUrl(config);
        const response = await axios.get(`${url}/v5/market/tickers?category=linear&symbol=BTCUSDT`);
        return { success: true, data: response.data };
      } catch (err) {
        return { success: false, error: err.message };
      }
    },

    async placeOrder(config, order) {
      try {
        const url = this.getUrl(config);
        const timestamp = Date.now().toString();
        const body = {
          category: 'linear',
          symbol: order.symbol,
          side: order.side,
          orderType: order.type || 'Market',
          qty: order.quantity.toString(),
          timeInForce: 'GTC'
        };
        if (order.price) body.price = order.price.toString();
        const payload = timestamp + config.apiKey + '20000' + JSON.stringify(body);
        const sign = crypto.createHmac('sha256', config.apiSecret).update(payload).digest('hex');
        const response = await axios.post(`${url}/v5/order/create`, body, {
          headers: {
            'X-BAPI-API-KEY': config.apiKey,
            'X-BAPI-TIMESTAMP': timestamp,
            'X-BAPI-SIGN': sign,
            'X-BAPI-RECV-WINDOW': '20000',
            'Content-Type': 'application/json'
          }
        });
        return { success: response.data.retCode === 0, data: response.data };
      } catch (err) {
        return { success: false, error: err.message };
      }
    },

    async getOrderBook(config, symbol) {
      try {
        const url = this.getUrl(config);
        const response = await axios.get(`${url}/v5/market/orderbook?category=linear&symbol=${symbol}`);
        return { success: true, data: response.data };
      } catch (err) {
        return { success: false, error: err.message };
      }
    },

    async getCandlesticks(config, symbol, interval = '60') {
      try {
        const url = this.getUrl(config);
        const response = await axios.get(`${url}/v5/market/kline?category=linear&symbol=${symbol}&interval=${interval}`);
        return { success: true, data: response.data };
      } catch (err) {
        return { success: false, error: err.message };
      }
    }
  },

  okx: {
    baseUrl: 'https://www.okx.com',
    // OKX doesn't have a separate testnet URL - it uses "Demo Trading" mode
    // activated by adding x-simulated-trading: 1 header to all requests

    sign(secret, timestamp, method, path, body = '') {
      const message = timestamp + method + path + body;
      return crypto.createHmac('sha256', secret).update(message).digest('base64');
    },

    getHeaders(config, timestamp, sign) {
      const headers = {
        'OK-ACCESS-KEY': config.apiKey,
        'OK-ACCESS-SIGN': sign,
        'OK-ACCESS-TIMESTAMP': timestamp,
        'OK-ACCESS-PASSPHRASE': config.passphrase || '',
        'Content-Type': 'application/json'
      };
      // OKX Demo Trading mode: add x-simulated-trading header instead of changing URL
      if (config.testnet) {
        headers['x-simulated-trading'] = '1';
      }
      return headers;
    },

    async testConnection(config) {
      try {
        const timestamp = new Date().toISOString();
        const path = '/api/v5/account/balance';
        const sign = this.sign(config.apiSecret, timestamp, 'GET', path);
        const headers = this.getHeaders(config, timestamp, sign);
        const response = await axios.get(`${this.baseUrl}${path}`, { headers });
        if (response.data.code === '0') {
          return { success: true, data: response.data };
        }
        const errMsg = response.data.msg || 'Erro desconhecido OKX';
        if (config.testnet) {
          return { success: false, error: `OKX Demo Trading erro: ${errMsg}. Ative Demo Trading em okx.com > Trade > Demo Trading` };
        }
        return { success: false, error: `OKX: ${errMsg}` };
      } catch (err) {
        const errMsg = err.response?.data?.msg || err.message;
        if (config.testnet) {
          return { success: false, error: `OKX Demo Trading erro: ${errMsg}. Ative Demo Trading e use API keys com flag demo` };
        }
        return { success: false, error: `OKX: ${errMsg}` };
      }
    },

    async getBalance(config) {
      try {
        const timestamp = new Date().toISOString();
        const path = '/api/v5/account/balance';
        const sign = this.sign(config.apiSecret, timestamp, 'GET', path);
        const headers = this.getHeaders(config, timestamp, sign);
        const response = await axios.get(`${this.baseUrl}${path}`, { headers });
        if (response.data.code === '0') {
          const account = response.data.data?.[0] || {};
          const details = account.details || [];
          const totalEq = parseFloat(account.totalEq || '0');
          const balanceItems = details.map(d => ({
            coin: d.ccy,
            walletBalance: parseFloat(d.eq || '0'),
            usdValue: parseFloat(d.eqUsd || d.eq || '0'),
            free: parseFloat(d.availBal || d.cashBal || '0'),
            locked: parseFloat(d.frozenBal || '0'),
            unrealisedPnl: parseFloat(d.upl || '0')
          })).filter(b => b.walletBalance > 0);
          return {
            success: true,
            balance: balanceItems,
            totalEquity: totalEq,
            exchange: 'okx'
          };
        }
        return { success: false, error: response.data.msg };
      } catch (err) {
        const errMsg = err.response?.data?.msg || err.message;
        if (config.testnet) {
          return { success: false, error: `OKX Demo Trading: ${errMsg}` };
        }
        return { success: false, error: `OKX: ${errMsg}` };
      }
    },

    async getMarkets(config) {
      try {
        const response = await axios.get(`${this.baseUrl}/api/v5/market/tickers?instType=SPOT`);
        return { success: true, data: response.data };
      } catch (err) {
        return { success: false, error: err.message };
      }
    },

    async placeOrder(config, order) {
      try {
        const timestamp = new Date().toISOString();
        const path = '/api/v5/trade/order';
        const body = JSON.stringify({
          instId: order.symbol,
          tdMode: 'cash',
          side: order.side.toLowerCase(),
          ordType: order.type === 'Market' ? 'market' : 'limit',
          sz: order.quantity.toString(),
          ...(order.price ? { px: order.price.toString() } : {})
        });
        const sign = this.sign(config.apiSecret, timestamp, 'POST', path, body);
        const headers = this.getHeaders(config, timestamp, sign);
        const response = await axios.post(`${this.baseUrl}${path}`, body, { headers });
        return { success: response.data.code === '0', data: response.data };
      } catch (err) {
        const errMsg = err.response?.data?.msg || err.message;
        return { success: false, error: errMsg };
      }
    },

    async getOrderBook(config, symbol) {
      try {
        const response = await axios.get(`${this.baseUrl}/api/v5/market/books?instId=${symbol}`);
        return { success: true, data: response.data };
      } catch (err) {
        return { success: false, error: err.message };
      }
    },

    async getCandlesticks(config, symbol, interval = '1H') {
      try {
        const response = await axios.get(`${this.baseUrl}/api/v5/market/candles?instId=${symbol}&bar=${interval}`);
        return { success: true, data: response.data };
      } catch (err) {
        return { success: false, error: err.message };
      }
    }
  },

  binance: {
    baseUrl: 'https://api.binance.com',
    testnetUrl: 'https://testnet.binance.vision',

    sign(secret, queryString) {
      return crypto.createHmac('sha256', secret).update(queryString).digest('hex');
    },

    buildQueryString(params) {
      const keys = Object.keys(params).sort();
      return keys.map(k => `${k}=${params[k]}`).join('&');
    },

    getUrl(config) {
      return config.testnet ? this.testnetUrl : this.baseUrl;
    },

    async testConnection(config) {
      try {
        const base = this.getUrl(config);
        const timestamp = Date.now();
        const params = {
          timestamp: timestamp,
          recvWindow: 60000
        };
        const queryString = this.buildQueryString(params);
        const signature = this.sign(config.apiSecret, queryString);
        const url = `${base}/api/v3/account?${queryString}&signature=${signature}`;
        const response = await axios.get(url, {
          headers: {
            'X-MBX-APIKEY': config.apiKey,
            'Content-Type': 'application/json'
          }
        });
        return { success: true, data: response.data };
      } catch (err) {
        const errMsg = err.response?.data?.msg || err.response?.data?.code || err.message;
        const httpStatus = err.response?.status;
        if (config.testnet) {
          if (httpStatus === 401 || httpStatus === 403) {
            return { success: false, error: `Binance Testnet: API key invalida. Gere keys em testnet.binance.vision (nao use keys de producao!)` };
          }
          return { success: false, error: `Binance Testnet erro (${httpStatus}): ${errMsg}` };
        }
        return { success: false, error: `Binance (${httpStatus}): ${errMsg}` };
      }
    },

    async getBalance(config) {
      try {
        const base = this.getUrl(config);
        const timestamp = Date.now();
        const params = {
          timestamp: timestamp,
          recvWindow: 60000
        };
        const queryString = this.buildQueryString(params);
        const signature = this.sign(config.apiSecret, queryString);
        const url = `${base}/api/v3/account?${queryString}&signature=${signature}`;
        const response = await axios.get(url, {
          headers: {
            'X-MBX-APIKEY': config.apiKey,
            'Content-Type': 'application/json'
          }
        });
        const rawBalances = response.data.balances?.filter(b => parseFloat(b.free) > 0 || parseFloat(b.locked) > 0) || [];
        
        // Try to get prices for USD conversion
        let priceMap = {};
        try {
          const priceRes = await axios.get(`${base}/api/v3/ticker/price`);
          if (Array.isArray(priceRes.data)) {
            priceRes.data.forEach(t => { priceMap[t.symbol] = parseFloat(t.price); });
          }
        } catch (e) { /* ignore price fetch errors */ }
        
        const balanceItems = rawBalances.map(b => {
          const asset = b.asset;
          const free = parseFloat(b.free || '0');
          const locked = parseFloat(b.locked || '0');
          const total = free + locked;
          let usdValue = 0;
          if (asset === 'USDT' || asset === 'BUSD' || asset === 'USDC' || asset === 'TUSD' || asset === 'DAI') {
            usdValue = total;
          } else if (priceMap[`${asset}USDT`]) {
            usdValue = total * priceMap[`${asset}USDT`];
          } else if (priceMap[`${asset}BUSD`]) {
            usdValue = total * priceMap[`${asset}BUSD`];
          } else if (priceMap[`${asset}USDC`]) {
            usdValue = total * priceMap[`${asset}USDC`];
          } else if (asset === 'BTC' && priceMap['BTCUSDT']) {
            usdValue = total * priceMap['BTCUSDT'];
          } else if (asset === 'ETH' && priceMap['ETHUSDT']) {
            usdValue = total * priceMap['ETHUSDT'];
          } else if (asset === 'BNB' && priceMap['BNBUSDT']) {
            usdValue = total * priceMap['BNBUSDT'];
          } else if (asset === 'SOL' && priceMap['SOLUSDT']) {
            usdValue = total * priceMap['SOLUSDT'];
          }
          return {
            coin: asset,
            walletBalance: total,
            usdValue: usdValue,
            free: free,
            locked: locked
          };
        });
        
        const totalEquity = balanceItems.reduce((sum, b) => sum + b.usdValue, 0);
        return {
          success: true,
          balance: balanceItems,
          totalEquity: totalEquity,
          exchange: 'binance'
        };
      } catch (err) {
        const errMsg = err.response?.data?.msg || err.response?.data?.code || err.message;
        const httpStatus = err.response?.status;
        if (config.testnet) {
          if (httpStatus === 401 || httpStatus === 403) {
            return { success: false, error: `Binance Testnet: API key invalida. Gere keys em testnet.binance.vision` };
          }
          return { success: false, error: `Binance Testnet: ${errMsg}` };
        }
        return { success: false, error: `Binance: ${errMsg}` };
      }
    },

    async getMarkets(config) {
      try {
        const base = this.getUrl(config);
        const response = await axios.get(`${base}/api/v3/ticker/24hr`);
        return { success: true, data: response.data };
      } catch (err) {
        return { success: false, error: err.message };
      }
    },

    async placeOrder(config, order) {
      try {
        const base = this.getUrl(config);
        const timestamp = Date.now();
        const params = {
          symbol: order.symbol,
          side: order.side,
          type: order.type || 'MARKET',
          quantity: order.quantity,
          timestamp: timestamp,
          recvWindow: 60000
        };
        if (order.price) {
          params.price = order.price;
          params.timeInForce = 'GTC';
        }
        const queryString = this.buildQueryString(params);
        const signature = this.sign(config.apiSecret, queryString);
        const url = `${base}/api/v3/order?${queryString}&signature=${signature}`;
        const response = await axios.post(url, {}, {
          headers: {
            'X-MBX-APIKEY': config.apiKey,
            'Content-Type': 'application/json'
          }
        });
        return { success: true, data: response.data };
      } catch (err) {
        const errMsg = err.response?.data?.msg || err.message;
        return { success: false, error: errMsg };
      }
    },

    async getOrderBook(config, symbol) {
      try {
        const base = this.getUrl(config);
        const response = await axios.get(`${base}/api/v3/depth?symbol=${symbol}&limit=20`);
        return { success: true, data: response.data };
      } catch (err) {
        return { success: false, error: err.message };
      }
    },

    async getCandlesticks(config, symbol, interval = '1h') {
      try {
        const base = this.getUrl(config);
        const response = await axios.get(`${base}/api/v3/klines?symbol=${symbol}&interval=${interval}&limit=100`);
        return { success: true, data: response.data };
      } catch (err) {
        return { success: false, error: err.message };
      }
    }
  },

  custom: {
    async testConnection(config) {
      try {
        const response = await axios.get(`${config.baseUrl}/api/v3/account`, {
          headers: config.headers || {},
          params: config.params || {}
        });
        return { success: true, data: response.data };
      } catch (err) {
        return { success: false, error: err.message };
      }
    },

    async getBalance(config) {
      try {
        const response = await axios.get(`${config.baseUrl}/api/v3/account`, {
          headers: config.headers || {}
        });
        return { success: true, balance: response.data.balances || [] };
      } catch (err) {
        return { success: false, error: err.message };
      }
    },

    async getMarkets(config) {
      try {
        const response = await axios.get(`${config.baseUrl}/api/v3/ticker/24hr`);
        return { success: true, data: response.data };
      } catch (err) {
        return { success: false, error: err.message };
      }
    },

    async placeOrder(config, order) {
      try {
        const response = await axios.post(`${config.baseUrl}/api/v3/order`, order, {
          headers: { ...config.headers, 'Content-Type': 'application/json' }
        });
        return { success: true, data: response.data };
      } catch (err) {
        return { success: false, error: err.message };
      }
    },

    async getOrderBook(config, symbol) {
      try {
        const response = await axios.get(`${config.baseUrl}/api/v3/depth?symbol=${symbol}`);
        return { success: true, data: response.data };
      } catch (err) {
        return { success: false, error: err.message };
      }
    },

    async getCandlesticks(config, symbol, interval) {
      try {
        const response = await axios.get(`${config.baseUrl}/api/v3/klines?symbol=${symbol}&interval=${interval}`);
        return { success: true, data: response.data };
      } catch (err) {
        return { success: false, error: err.message };
      }
    }
  }
};

module.exports = {
  testConnection(config) {
    const ex = exchanges[config.exchange];
    if (!ex) return Promise.resolve({ success: false, error: 'Exchange not supported' });
    return ex.testConnection(config);
  },

  getBalance(config) {
    const ex = exchanges[config.exchange];
    if (!ex) return Promise.resolve({ success: false, error: 'Exchange not supported' });
    return ex.getBalance(config);
  },

  getMarkets(config) {
    const ex = exchanges[config.exchange];
    if (!ex) return Promise.resolve({ success: false, error: 'Exchange not supported' });
    return ex.getMarkets(config);
  },

  placeOrder(config, order) {
    const ex = exchanges[config.exchange];
    if (!ex) return Promise.resolve({ success: false, error: 'Exchange not supported' });
    return ex.placeOrder(config, order);
  },

  getOrderBook(config, symbol) {
    const ex = exchanges[config.exchange];
    if (!ex) return Promise.resolve({ success: false, error: 'Exchange not supported' });
    return ex.getOrderBook(config, symbol);
  },

  getCandlesticks(config, symbol, interval) {
    const ex = exchanges[config.exchange];
    if (!ex) return Promise.resolve({ success: false, error: 'Exchange not supported' });
    return ex.getCandlesticks(config, symbol, interval);
  }
};

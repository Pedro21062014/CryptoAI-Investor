const axios = require('axios');
const crypto = require('crypto');

// Timeout maior para evitar falhas falsas em testnet/APIs lentas.
// Antes 20s podia estourar em Bybit Testnet, Binance ou OKX em horários lentos.
axios.defaults.timeout = 60000;

const STABLECOINS = new Set(['USDT', 'USDC', 'BUSD', 'TUSD', 'DAI', 'FDUSD', 'USD', 'USDP', 'PYUSD']);

function toNumber(value, fallback = 0) {
  if (value === null || value === undefined || value === '') return fallback;
  const n = Number(value);
  return Number.isFinite(n) ? n : fallback;
}

function normalizeAsset(asset = '') {
  return String(asset).trim().toUpperCase();
}

function stablecoinUsdValue(asset, amount) {
  return STABLECOINS.has(normalizeAsset(asset)) ? amount : 0;
}

function priceFromMap(asset, priceMap) {
  const coin = normalizeAsset(asset);
  if (!coin || STABLECOINS.has(coin)) return 1;
  return priceMap[`${coin}USDT`] || priceMap[`${coin}USDC`] || priceMap[`${coin}FDUSD`] || priceMap[`${coin}BUSD`] || 0;
}

function resolveUsdValue(asset, amount, explicitUsdValue, priceMap = {}) {
  const explicit = toNumber(explicitUsdValue, NaN);
  if (Number.isFinite(explicit) && explicit > 0) return explicit;
  const stable = stablecoinUsdValue(asset, amount);
  if (stable > 0) return stable;
  const price = priceFromMap(asset, priceMap);
  return price > 0 ? amount * price : 0;
}

function firstPositiveNumber(...values) {
  for (const value of values) {
    const n = toNumber(value, 0);
    if (n > 0) return n;
  }
  return 0;
}

const BYBIT_BALANCE_COINS = [
  'USDT', 'USDC', 'BTC', 'ETH', 'BNB', 'SOL', 'XRP', 'ADA', 'DOGE', 'DOT',
  'MATIC', 'POL', 'AVAX', 'SHIB', 'LTC', 'LINK', 'ATOM', 'UNI', 'NEAR', 'APE',
  'ARB', 'OP', 'FET', 'SUI', 'APT', 'SEI', 'TIA', 'JUP', 'WIF', 'PEPE', 'BONK',
  'FLOKI', 'RUNE'
];

// Exchange API implementations
const exchanges = {
  bybit: {
    baseUrl: 'https://api.bybit.com',
    testnetUrl: 'https://api-testnet.bybit.com',
    demoUrl: 'https://api-demo.bybit.com',

    sign(secret, timestamp, apiKey, params, recvWindow = '60000') {
      const payload = timestamp + apiKey + recvWindow + params;
      return crypto.createHmac('sha256', secret).update(payload).digest('hex');
    },

    getUrl(config) {
      if (config.demo) return this.demoUrl;
      return config.testnet ? this.testnetUrl : this.baseUrl;
    },

    getEnvironmentName(config) {
      if (config.demo) return 'Bybit Demo Trading';
      if (config.testnet) return 'Bybit Testnet';
      return 'Bybit';
    },

    formatAuthError(config, message) {
      const envName = this.getEnvironmentName(config);
      if (config.demo) {
        return `${envName}: ${message}. Use API keys criadas no Demo Trading da Bybit e deixe Testnet desmarcado.`;
      }
      if (config.testnet) {
        return `${envName}: ${message}. Use API keys criadas em testnet.bybit.com e nao keys de producao/Demo.`;
      }
      return `${envName}: ${message}`;
    },

    async testConnection(config) {
      const url = this.getUrl(config);
      const accountTypes = ['UNIFIED', 'SPOT', 'CONTRACT'];
      const errors = [];

      for (const accountType of accountTypes) {
        try {
          const timestamp = Date.now().toString();
          const params = `accountType=${accountType}`;
          const sign = this.sign(config.apiSecret, timestamp, config.apiKey, params);
          const response = await axios.get(`${url}/v5/account/wallet-balance?${params}`, {
            headers: {
              'X-BAPI-API-KEY': config.apiKey,
              'X-BAPI-TIMESTAMP': timestamp,
              'X-BAPI-SIGN': sign,
              'X-BAPI-RECV-WINDOW': '60000'
            }
          });
          if (response.data.retCode === 0) {
            return { success: true, data: response.data, accountType };
          }

          const retCode = response.data.retCode;
          const retMsg = response.data.retMsg || 'Erro desconhecido Bybit';
          errors.push(`${accountType}: ${retCode ? retCode + ' - ' : ''}${retMsg}`);

          // Erros de autenticação/ambiente não dependem do tipo de conta; para de tentar.
          if ([10003, 10004, 10005, 10007, 10010].includes(Number(retCode))) break;
        } catch (err) {
          const status = err.response?.status;
          const retCode = err.response?.data?.retCode;
          const retMsg = err.response?.data?.retMsg || err.response?.data?.msg || err.message;
          errors.push(`${accountType}: ${status ? `HTTP ${status} - ` : ''}${retCode ? retCode + ' - ' : ''}${retMsg}`);
          if (status === 401 || [10003, 10004, 10005, 10007, 10010].includes(Number(retCode))) break;
        }
      }

      const msg = errors.join(' | ') || 'Erro desconhecido Bybit';
      return { success: false, error: this.formatAuthError(config, msg) };
    },

    async getBalance(config) {
      const url = this.getUrl(config);
      const walletAccountTypes = ['UNIFIED', 'SPOT', 'CONTRACT'];
      const priceMap = {};

      try {
        const [spotTickers, linearTickers] = await Promise.allSettled([
          axios.get(`${url}/v5/market/tickers?category=spot`),
          axios.get(`${url}/v5/market/tickers?category=linear`)
        ]);
        [spotTickers, linearTickers].forEach(result => {
          const list = result.value?.data?.result?.list || [];
          list.forEach(t => {
            const price = toNumber(t.lastPrice || t.markPrice || t.indexPrice, 0);
            if (t.symbol && price > 0) priceMap[t.symbol] = price;
          });
        });
      } catch (e) { /* preços são apenas fallback */ }

      const merged = new Map();
      let totalEquity = 0;
      let hadSuccess = false;
      const errors = [];

      const mergeCoin = (coinData, accountType) => {
        const coin = normalizeAsset(coinData.coin || coinData.asset || coinData.ccy);
        if (!coin) return;

        // Alguns retornos da Bybit Testnet trazem walletBalance = "0" e o valor real em equity/transferBalance.
        // Por isso usamos o primeiro campo positivo em vez de `walletBalance || equity`.
        const walletBalance = firstPositiveNumber(
          coinData.walletBalance,
          coinData.equity,
          coinData.transferBalance,
          coinData.free,
          coinData.availableToWithdraw,
          coinData.availableToBorrow,
          coinData.bonus
        );
        const free = firstPositiveNumber(
          coinData.free,
          coinData.transferBalance,
          coinData.availableToWithdraw,
          coinData.availableToBorrow,
          coinData.walletBalance,
          coinData.equity
        );
        const locked = toNumber(coinData.locked, 0);
        const usdValue = resolveUsdValue(coin, walletBalance, coinData.usdValue || coinData.eqUsd, priceMap);
        if (walletBalance <= 0 && usdValue <= 0) return;

        const current = merged.get(coin) || {
          coin,
          walletBalance: 0,
          usdValue: 0,
          free: 0,
          locked: 0,
          unrealisedPnl: 0,
          accountTypes: []
        };
        current.walletBalance += walletBalance;
        current.usdValue += usdValue;
        current.free += free;
        current.locked += locked;
        current.unrealisedPnl += toNumber(coinData.unrealisedPnl, 0);
        if (!current.accountTypes.includes(accountType)) current.accountTypes.push(accountType);
        merged.set(coin, current);
      };

      const signedGet = async (path, params) => {
        const timestamp = Date.now().toString();
        const sign = this.sign(config.apiSecret, timestamp, config.apiKey, params);
        return axios.get(`${url}${path}?${params}`, {
          headers: {
            'X-BAPI-API-KEY': config.apiKey,
            'X-BAPI-TIMESTAMP': timestamp,
            'X-BAPI-SIGN': sign,
            'X-BAPI-RECV-WINDOW': '60000'
          }
        });
      };

      // Unified/Spot/Contract wallet balance endpoint.
      for (const accountType of walletAccountTypes) {
        try {
          const response = await signedGet('/v5/account/wallet-balance', `accountType=${accountType}`);

          if (response.data.retCode !== 0) {
            errors.push(`${accountType}: ${response.data.retCode || ''} ${response.data.retMsg || 'erro desconhecido'}`.trim());
            continue;
          }

          hadSuccess = true;
          const accounts = response.data.result.list || [];
          accounts.forEach(account => {
            totalEquity += firstPositiveNumber(account.totalEquity, account.totalWalletBalance, account.totalAvailableBalance, account.totalMarginBalance);
            (account.coin || []).forEach(c => mergeCoin(c, account.accountType || accountType));
          });
        } catch (err) {
          errors.push(`${accountType}: ${err.response?.data?.retMsg || err.response?.data?.msg || err.message}`);
        }
      }

      // Funding wallet endpoint. In Bybit Testnet, faucet funds may stay in FUND and wallet-balance returns 0.
      // Bybit docs also state funding wallet balance must be queried via the asset transfer endpoint.
      for (let i = 0; i < BYBIT_BALANCE_COINS.length; i += 10) {
        const coinChunk = BYBIT_BALANCE_COINS.slice(i, i + 10);
        try {
          const coinParam = coinChunk.join(',');
          const params = `accountType=FUND&coin=${coinParam}`;
          const response = await signedGet('/v5/asset/transfer/query-account-coins-balance', params);
          if (response.data.retCode === 0) {
            hadSuccess = true;
            const balances = response.data.result?.balance || [];
            balances.forEach(c => mergeCoin(c, 'FUND'));
          } else {
            errors.push(`FUND(${coinParam}): ${response.data.retCode || ''} ${response.data.retMsg || 'erro desconhecido'}`.trim());
          }
        } catch (err) {
          errors.push(`FUND(${coinChunk.join(',')}): ${err.response?.data?.retMsg || err.response?.data?.msg || err.message}`);
        }
      }

      if (!hadSuccess) {
        const msg = errors.filter(Boolean).join(' | ') || 'erro desconhecido';
        return { success: false, error: this.formatAuthError(config, msg) };
      }

      const balanceItems = Array.from(merged.values()).sort((a, b) => b.usdValue - a.usdValue);
      const summedUsd = balanceItems.reduce((sum, b) => sum + toNumber(b.usdValue, 0), 0);
      return {
        success: true,
        balance: balanceItems,
        totalEquity: totalEquity > 0 ? Math.max(totalEquity, summedUsd) : summedUsd,
        exchange: config.demo ? 'bybit-demo' : config.testnet ? 'bybit-testnet' : 'bybit',
        errors: errors.filter(Boolean)
      };
    },

    async getSymbolRules(config, symbol) {
      try {
        const url = this.getUrl(config);
        const response = await axios.get(`${url}/v5/market/instruments-info?category=linear&symbol=${String(symbol || '').toUpperCase()}`, { timeout: 30000 });
        const item = response.data?.result?.list?.[0];
        if (!item) return { success: false, error: `Bybit: par ${symbol} nao encontrado` };
        const lot = item.lotSizeFilter || {};
        const price = item.priceFilter || {};
        return {
          success: true,
          exchange: 'bybit',
          symbol: item.symbol,
          minQty: Number(lot.minOrderQty || 0),
          maxQty: Number(lot.maxOrderQty || 0),
          stepSize: lot.qtyStep || '1',
          tickSize: price.tickSize || '0.00000001',
          minNotional: Number(lot.minNotionalValue || 0),
          status: item.status || ''
        };
      } catch (err) {
        return { success: false, error: err.response?.data?.retMsg || err.message };
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
        const payload = timestamp + config.apiKey + '60000' + JSON.stringify(body);
        const sign = crypto.createHmac('sha256', config.apiSecret).update(payload).digest('hex');
        const response = await axios.post(`${url}/v5/order/create`, body, {
          headers: {
            'X-BAPI-API-KEY': config.apiKey,
            'X-BAPI-TIMESTAMP': timestamp,
            'X-BAPI-SIGN': sign,
            'X-BAPI-RECV-WINDOW': '60000',
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
          const totalEq = toNumber(account.totalEq, 0);
          const balanceItems = details.map(d => {
            const coin = normalizeAsset(d.ccy);
            const walletBalance = toNumber(d.eq || d.cashBal, 0);
            return {
              coin,
              walletBalance,
              usdValue: resolveUsdValue(coin, walletBalance, d.eqUsd),
              free: toNumber(d.availBal || d.availEq || d.cashBal, 0),
              locked: toNumber(d.frozenBal || d.ordFrozen, 0),
              unrealisedPnl: toNumber(d.upl, 0)
            };
          }).filter(b => b.walletBalance > 0 || b.usdValue > 0)
            .sort((a, b) => b.usdValue - a.usdValue);
          const summedUsd = balanceItems.reduce((sum, b) => sum + toNumber(b.usdValue, 0), 0);
          return {
            success: true,
            balance: balanceItems,
            totalEquity: totalEq > 0 ? totalEq : summedUsd,
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

    async getSymbolRules(config, symbol) {
      try {
        const instId = String(symbol || '').includes('-')
          ? String(symbol || '').toUpperCase()
          : String(symbol || '').toUpperCase().replace(/USDT$/, '-USDT');
        const response = await axios.get(`${this.baseUrl}/api/v5/public/instruments?instType=SPOT&instId=${instId}`, { timeout: 30000 });
        const item = response.data?.data?.[0];
        if (!item) return { success: false, error: `OKX: par ${symbol} nao encontrado` };
        return {
          success: true,
          exchange: 'okx',
          symbol: item.instId,
          minQty: Number(item.minSz || 0),
          maxQty: 0,
          stepSize: item.lotSz || '1',
          tickSize: item.tickSz || '0.00000001',
          minNotional: Number(item.minSz || 0),
          status: item.state || ''
        };
      } catch (err) {
        return { success: false, error: err.response?.data?.msg || err.message };
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
      return keys
        .filter(k => params[k] !== undefined && params[k] !== null && params[k] !== '')
        .map(k => `${encodeURIComponent(k)}=${encodeURIComponent(params[k])}`)
        .join('&');
    },

    getUrl(config) {
      return config.testnet ? this.testnetUrl : this.baseUrl;
    },
    _rulesCache: new Map(),

    decimalPlaces(step) {
      const text = String(step || '1');
      if (text.includes('e-')) return parseInt(text.split('e-')[1], 10) || 0;
      const decimals = text.split('.')[1] || '';
      return decimals.replace(/0+$/, '').length;
    },

    floorToStep(value, step) {
      const n = Number(value);
      const s = Number(step);
      if (!Number.isFinite(n) || !Number.isFinite(s) || s <= 0) return n;
      const precision = this.decimalPlaces(step);
      const floored = Math.floor((n + Number.EPSILON) / s) * s;
      return Number(floored.toFixed(Math.min(12, precision)));
    },

    ceilToStep(value, step) {
      const n = Number(value);
      const s = Number(step);
      if (!Number.isFinite(n) || !Number.isFinite(s) || s <= 0) return n;
      const precision = this.decimalPlaces(step);
      const ceiled = Math.ceil((n - Number.EPSILON) / s) * s;
      return Number(ceiled.toFixed(Math.min(12, precision)));
    },

    formatByStep(value, step) {
      const precision = this.decimalPlaces(step);
      return Number(value).toFixed(Math.min(12, precision)).replace(/\.?0+$/, '');
    },

    async getSymbolRules(config, symbol) {
      const base = this.getUrl(config);
      const cacheKey = `${base}:${symbol}`;
      const cached = this._rulesCache.get(cacheKey);
      if (cached && Date.now() - cached.ts < 10 * 60 * 1000) return cached.rules;

      const response = await axios.get(`${base}/api/v3/exchangeInfo?symbol=${symbol}`, { timeout: 30000 });
      const info = response.data?.symbols?.[0];
      if (!info) throw new Error(`Binance: par ${symbol} não encontrado`);
      if (info.status && info.status !== 'TRADING') throw new Error(`Binance: par ${symbol} não está ativo (${info.status})`);

      const filter = (type) => info.filters?.find(f => f.filterType === type) || null;
      const lot = filter('LOT_SIZE') || {};
      const marketLot = filter('MARKET_LOT_SIZE') || {};
      const price = filter('PRICE_FILTER') || {};
      const minNotional = filter('MIN_NOTIONAL') || filter('NOTIONAL') || {};
      const lotStep = Number(lot.stepSize) > 0 ? lot.stepSize : '1';
      const marketStep = Number(marketLot.stepSize) > 0 ? marketLot.stepSize : lotStep;
      const rules = {
        symbol,
        baseAsset: info.baseAsset,
        quoteAsset: info.quoteAsset,
        stepSize: lotStep,
        minQty: Number(lot.minQty || marketLot.minQty || 0),
        maxQty: Number(lot.maxQty || marketLot.maxQty || 0),
        marketStepSize: marketStep,
        marketMinQty: Number(marketLot.minQty || lot.minQty || 0),
        marketMaxQty: Number(marketLot.maxQty || lot.maxQty || 0),
        tickSize: Number(price.tickSize) > 0 ? price.tickSize : '0.00000001',
        minNotional: Number(minNotional.minNotional || minNotional.notional || 0)
      };
      this._rulesCache.set(cacheKey, { ts: Date.now(), rules });
      return rules;
    },

    async getTickerPrice(config, symbol) {
      const base = this.getUrl(config);
      const response = await axios.get(`${base}/api/v3/ticker/price?symbol=${symbol}`, { timeout: 20000 });
      return Number(response.data?.price || 0);
    },

    async normalizeOrderToRules(config, order) {
      const symbol = String(order.symbol || '').toUpperCase().replace(/[^A-Z0-9]/g, '');
      const orderType = String(order.type || 'MARKET').toUpperCase();
      const rules = await this.getSymbolRules(config, symbol);
      const step = orderType === 'MARKET' ? rules.marketStepSize : rules.stepSize;
      const minQty = orderType === 'MARKET' ? rules.marketMinQty : rules.minQty;
      const maxQty = orderType === 'MARKET' ? rules.marketMaxQty : rules.maxQty;
      let quantity = this.floorToStep(Number(order.quantity), step);

      if (!Number.isFinite(quantity) || quantity <= 0) {
        throw new Error(`Binance ${symbol}: quantidade inválida`);
      }
      if (minQty && quantity < minQty) {
        throw new Error(`Binance ${symbol}: quantidade ${quantity} abaixo do mínimo ${minQty} (LOT_SIZE)`);
      }
      if (maxQty && quantity > maxQty) quantity = this.floorToStep(maxQty, step);

      let price = Number(order.price || 0);
      if (orderType === 'LIMIT') {
        if (!Number.isFinite(price) || price <= 0) throw new Error(`Binance ${symbol}: ordem LIMIT precisa de preço válido`);
        price = this.floorToStep(price, rules.tickSize);
      } else {
        price = await this.getTickerPrice(config, symbol);
      }

      const notional = price * quantity;
      if (rules.minNotional && notional < rules.minNotional) {
        const neededQty = this.ceilToStep((rules.minNotional / price), step);
        throw new Error(`Binance ${symbol}: valor da ordem ${notional.toFixed(4)} USDT abaixo do mínimo ${rules.minNotional} USDT. Quantidade mínima aproximada: ${this.formatByStep(neededQty, step)} ${rules.baseAsset}`);
      }

      return {
        ...order,
        symbol,
        quantity: this.formatByStep(quantity, step),
        price: orderType === 'LIMIT' ? this.formatByStep(price, rules.tickSize) : undefined,
        rules,
        estimatedNotional: notional
      };
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
        const rawBalances = response.data.balances?.filter(b => toNumber(b.free, 0) > 0 || toNumber(b.locked, 0) > 0) || [];
        
        // Puxa preços públicos para converter todos os ativos suportados para USD/USDT.
        let priceMap = {};
        try {
          const priceRes = await axios.get(`${base}/api/v3/ticker/price`);
          if (Array.isArray(priceRes.data)) {
            priceRes.data.forEach(t => {
              const price = toNumber(t.price, 0);
              if (t.symbol && price > 0) priceMap[t.symbol] = price;
            });
          }
        } catch (e) { /* se falhar, stablecoins ainda serão calculadas corretamente */ }
        
        const balanceItems = rawBalances.map(b => {
          const asset = normalizeAsset(b.asset);
          const free = toNumber(b.free, 0);
          const locked = toNumber(b.locked, 0);
          const total = free + locked;
          return {
            coin: asset,
            walletBalance: total,
            usdValue: resolveUsdValue(asset, total, undefined, priceMap),
            free: free,
            locked: locked
          };
        }).sort((a, b) => b.usdValue - a.usdValue);
        
        const totalEquity = balanceItems.reduce((sum, b) => sum + toNumber(b.usdValue, 0), 0);
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
        const normalized = await this.normalizeOrderToRules(config, order);
        const orderType = String(normalized.type || 'MARKET').toUpperCase();
        const side = String(normalized.side || '').toUpperCase();

        if (!['BUY', 'SELL'].includes(side)) return { success: false, error: 'Binance: side invalido' };

        const params = {
          symbol: normalized.symbol,
          side,
          type: orderType,
          quantity: normalized.quantity,
          timestamp: timestamp.toString()
        };

        if (orderType === 'LIMIT') {
          params.price = normalized.price;
          params.timeInForce = normalized.timeInForce || 'GTC';
        } else if (orderType !== 'MARKET') {
          return { success: false, error: `Binance: tipo de ordem nao suportado no app (${orderType})` };
        }

        const queryString = this.buildQueryString(params);
        const signature = this.sign(config.apiSecret, queryString);
        const payload = `${queryString}&signature=${signature}`;
        const response = await axios.post(`${base}/api/v3/order`, payload, {
          headers: {
            'X-MBX-APIKEY': config.apiKey,
            'Content-Type': 'application/x-www-form-urlencoded'
          },
          transformRequest: [(data) => data]
        });
        return { success: true, data: response.data, normalizedOrder: normalized };
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

  async getSymbolRules(config, symbol) {
    const ex = exchanges[config.exchange];
    if (!ex || !ex.getSymbolRules) return { success: false, error: 'Symbol rules not supported for this exchange' };
    try {
      const rules = await ex.getSymbolRules(config, symbol);
      if (rules?.success !== undefined) return rules;
      return { success: true, exchange: config.exchange, ...rules };
    } catch (err) {
      return { success: false, error: err.message };
    }
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

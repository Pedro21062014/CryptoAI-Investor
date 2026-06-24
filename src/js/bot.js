const axios = require('axios');
const crypto = require('crypto');

// ===== CryptoBot Engine - Specialized Crypto Trading Bot =====
// Implements technical analysis algorithms for automated crypto trading

const BOT_VERSION = '1.0.0-beta';
const BOT_SIZE_MB = 687; // Simulated installation size in MB

// Technical Indicator Calculations
const indicators = {

  // Simple Moving Average
  sma(data, period) {
    if (data.length < period) return null;
    const slice = data.slice(data.length - period);
    return slice.reduce((sum, val) => sum + val, 0) / period;
  },

  // Exponential Moving Average
  ema(data, period) {
    if (data.length < period) return null;
    const k = 2 / (period + 1);
    let emaVal = data.slice(0, period).reduce((sum, val) => sum + val, 0) / period;
    for (let i = period; i < data.length; i++) {
      emaVal = data[i] * k + emaVal * (1 - k);
    }
    return emaVal;
  },

  // Relative Strength Index
  rsi(closes, period = 14) {
    if (closes.length < period + 1) return null;
    let gains = 0, losses = 0;
    for (let i = closes.length - period; i < closes.length; i++) {
      const change = closes[i] - closes[i - 1];
      if (change > 0) gains += change;
      else losses += Math.abs(change);
    }
    const avgGain = gains / period;
    const avgLoss = losses / period;
    if (avgLoss === 0) return 100;
    const rs = avgGain / avgLoss;
    return 100 - (100 / (1 + rs));
  },

  // MACD (Moving Average Convergence Divergence)
  macd(closes, fast = 12, slow = 26, signal = 9) {
    if (closes.length < slow + signal) return null;
    const emaFast = this.ema(closes, fast);
    const emaSlow = this.ema(closes, slow);
    const macdLine = emaFast - emaSlow;

    // Calculate signal line (EMA of MACD values)
    const macdValues = [];
    for (let i = slow; i <= closes.length; i++) {
      const eFast = this.ema(closes.slice(0, i), fast);
      const eSlow = this.ema(closes.slice(0, i), slow);
      if (eFast !== null && eSlow !== null) {
        macdValues.push(eFast - eSlow);
      }
    }
    const signalLine = macdValues.length >= signal ? this.ema(macdValues, signal) : null;

    return {
      macd: macdLine,
      signal: signalLine,
      histogram: signalLine !== null ? macdLine - signalLine : null
    };
  },

  // Bollinger Bands
  bollingerBands(closes, period = 20, stdDev = 2) {
    if (closes.length < period) return null;
    const sma = this.sma(closes, period);
    const slice = closes.slice(closes.length - period);
    const variance = slice.reduce((sum, val) => sum + Math.pow(val - sma, 2), 0) / period;
    const sd = Math.sqrt(variance);
    return {
      upper: sma + stdDev * sd,
      middle: sma,
      lower: sma - stdDev * sd,
      bandwidth: (2 * stdDev * sd) / sma * 100,
      percentB: (closes[closes.length - 1] - (sma - stdDev * sd)) / (2 * stdDev * sd)
    };
  },

  // Average True Range
  atr(highs, lows, closes, period = 14) {
    if (highs.length < period + 1) return null;
    const trueRanges = [];
    for (let i = 1; i < highs.length; i++) {
      const tr = Math.max(
        highs[i] - lows[i],
        Math.abs(highs[i] - closes[i - 1]),
        Math.abs(lows[i] - closes[i - 1])
      );
      trueRanges.push(tr);
    }
    return this.sma(trueRanges, period);
  },

  // Stochastic Oscillator
  stochastic(highs, lows, closes, kPeriod = 14, dPeriod = 3) {
    if (closes.length < kPeriod) return null;
    const recentHighs = highs.slice(-kPeriod);
    const recentLows = lows.slice(-kPeriod);
    const highestHigh = Math.max(...recentHighs);
    const lowestLow = Math.min(...recentLows);
    const currentClose = closes[closes.length - 1];
    const kValue = highestHigh === lowestLow ? 50 : ((currentClose - lowestLow) / (highestHigh - lowestLow)) * 100;

    // Simplified %D (SMA of %K values)
    const kValues = [];
    for (let i = kPeriod; i <= closes.length; i++) {
      const hSlice = highs.slice(i - kPeriod, i);
      const lSlice = lows.slice(i - kPeriod, i);
      const hh = Math.max(...hSlice);
      const ll = Math.min(...lSlice);
      const c = closes[i - 1];
      kValues.push(hh === ll ? 50 : ((c - ll) / (hh - ll)) * 100);
    }
    const dValue = kValues.length >= dPeriod ? this.sma(kValues.slice(-dPeriod), dPeriod) : kValue;

    return { k: kValue, d: dValue };
  },

  // Volume Weighted Average Price (simplified)
  vwap(closes, volumes, period = 20) {
    if (closes.length < period || volumes.length < period) return null;
    let cumVol = 0, cumTP = 0;
    for (let i = closes.length - period; i < closes.length; i++) {
      cumTP += closes[i] * volumes[i];
      cumVol += volumes[i];
    }
    return cumVol === 0 ? null : cumTP / cumVol;
  },

  // On-Balance Volume
  obv(closes, volumes) {
    if (closes.length < 2) return null;
    let obv = 0;
    for (let i = 1; i < closes.length; i++) {
      if (closes[i] > closes[i - 1]) obv += volumes[i];
      else if (closes[i] < closes[i - 1]) obv -= volumes[i];
    }
    return obv;
  },

  // Rate of Change (momentum)
  roc(closes, period = 10) {
    if (closes.length < period + 1) return null;
    const current = closes[closes.length - 1];
    const past = closes[closes.length - 1 - period];
    if (past === 0) return null;
    return ((current - past) / past) * 100;
  },

  // Commodity Channel Index
  cci(highs, lows, closes, period = 20) {
    if (closes.length < period) return null;
    const typicalPrices = [];
    for (let i = closes.length - period; i < closes.length; i++) {
      typicalPrices.push((highs[i] + lows[i] + closes[i]) / 3);
    }
    const smaTP = typicalPrices.reduce((a, b) => a + b, 0) / period;
    const meanDeviation = typicalPrices.reduce((sum, tp) => sum + Math.abs(tp - smaTP), 0) / period;
    const currentTP = (highs[closes.length - 1] + lows[closes.length - 1] + closes[closes.length - 1]) / 3;
    if (meanDeviation === 0) return 0;
    return (currentTP - smaTP) / (0.015 * meanDeviation);
  }
};

// ===== Signal Generation Engine =====

function normalizeSymbolFromText(text = '') {
  const upper = String(text).toUpperCase();
  const aliases = {
    BITCOIN: 'BTCUSDT', BTC: 'BTCUSDT', ETHEREUM: 'ETHUSDT', ETH: 'ETHUSDT',
    SOLANA: 'SOLUSDT', SOL: 'SOLUSDT', BINANCE: 'BNBUSDT', BNB: 'BNBUSDT',
    XRP: 'XRPUSDT', CARDANO: 'ADAUSDT', ADA: 'ADAUSDT', DOGE: 'DOGEUSDT',
    DOGECOIN: 'DOGEUSDT', AVAX: 'AVAXUSDT', AVALANCHE: 'AVAXUSDT', LINK: 'LINKUSDT',
    CHAINLINK: 'LINKUSDT', LITECOIN: 'LTCUSDT', LTC: 'LTCUSDT', POLKADOT: 'DOTUSDT',
    DOT: 'DOTUSDT', SHIB: 'SHIBUSDT', PEPE: 'PEPEUSDT', BONK: 'BONKUSDT',
    FLOKI: 'FLOKIUSDT', ARBITRUM: 'ARBUSDT', ARB: 'ARBUSDT', OPTIMISM: 'OPUSDT',
    OP: 'OPUSDT', SUI: 'SUIUSDT', APT: 'APTUSDT', APTOS: 'APTUSDT', FET: 'FETUSDT',
    RUNE: 'RUNEUSDT', NEAR: 'NEARUSDT', ATOM: 'ATOMUSDT', UNI: 'UNIUSDT'
  };
  return Object.keys(aliases).filter(key => new RegExp(`\\b${key}\\b`, 'i').test(upper)).map(key => aliases[key]);
}

function analyzeNewsImpact(news = [], sentiment = {}) {
  const validNews = Array.isArray(news) ? news.filter(n => !n.error) : [];
  const bullishTerms = ['surge', 'rally', 'bullish', 'breakout', 'approval', 'etf', 'partnership', 'adoption', 'upgrade', 'launch', 'integrates', 'record inflows', 'accumulation', 'growth', 'positive'];
  const bearishTerms = ['hack', 'exploit', 'lawsuit', 'ban', 'sec sues', 'crash', 'dump', 'bearish', 'liquidation', 'outflows', 'halt', 'insolvency', 'bankruptcy', 'regulation', 'warning', 'delist'];
  const criticalTerms = ['hack', 'exploit', 'bankruptcy', 'insolvency', 'delist', 'trading halted', 'withdrawals suspended'];

  let score = 0;
  const factors = [];
  const symbols = new Map();
  let criticalRisk = false;

  validNews.slice(0, 40).forEach(item => {
    const text = `${item.title || ''} ${item.description || ''}`;
    const lower = text.toLowerCase();
    let localScore = 0;
    bullishTerms.forEach(term => { if (lower.includes(term)) localScore += 1; });
    bearishTerms.forEach(term => { if (lower.includes(term)) localScore -= 1; });
    criticalTerms.forEach(term => { if (lower.includes(term)) criticalRisk = true; });
    if (item.sentiment === 'bullish') localScore += 1;
    if (item.sentiment === 'bearish') localScore -= 1;
    score += localScore;

    normalizeSymbolFromText(text).forEach(symbol => {
      const current = symbols.get(symbol) || { score: 0, mentions: 0 };
      current.score += localScore;
      current.mentions += 1;
      symbols.set(symbol, current);
    });

    if (localScore >= 2) factors.push(`Noticia positiva: ${String(item.title || '').slice(0, 90)}`);
    if (localScore <= -2) factors.push(`Noticia negativa: ${String(item.title || '').slice(0, 90)}`);
  });

  const sentimentScore = Number(sentiment?.score || 50);
  if (sentiment?.overall === 'bullish') score += 2;
  if (sentiment?.overall === 'bearish') score -= 2;
  if (sentimentScore > 70) score += 1;
  if (sentimentScore < 30) score -= 1;

  const impactedSymbols = Array.from(symbols.entries())
    .map(([symbol, data]) => ({ symbol, ...data }))
    .sort((a, b) => Math.abs(b.score) + b.mentions - (Math.abs(a.score) + a.mentions));

  const overall = score >= 3 ? 'bullish' : score <= -3 ? 'bearish' : 'neutral';
  return {
    overall,
    score,
    criticalRisk,
    shouldPauseTrading: criticalRisk || sentimentScore < 18,
    impactedSymbols,
    factors: factors.slice(0, 8),
    newsCount: validNews.length,
    sentimentScore
  };
}

function enhanceAnalysisWithNews(analysis, news = [], sentiment = {}, options = {}) {
  const newsImpact = analyzeNewsImpact(news, sentiment);
  const enhanced = { ...analysis };
  const originalConfidence = Number(enhanced.confidence || 50);
  let confidence = originalConfidence;
  const currentRecommendation = enhanced.recommendation || 'HOLD';

  if (newsImpact.shouldPauseTrading) {
    enhanced.recommendation = 'HOLD';
    confidence = Math.max(25, Math.min(confidence, 55));
    enhanced.risk_level = 'HIGH';
  } else if (newsImpact.overall === 'bullish') {
    if (currentRecommendation === 'BUY') confidence += 8;
    if (currentRecommendation === 'SELL') confidence -= 12;
  } else if (newsImpact.overall === 'bearish') {
    if (currentRecommendation === 'SELL') confidence += 8;
    if (currentRecommendation === 'BUY') confidence -= 12;
  }

  const symbolImpact = newsImpact.impactedSymbols.find(s => s.symbol === enhanced.symbol);
  if (symbolImpact) {
    if (symbolImpact.score > 0 && enhanced.recommendation === 'BUY') confidence += Math.min(8, symbolImpact.score * 2);
    if (symbolImpact.score < 0 && enhanced.recommendation === 'SELL') confidence += Math.min(8, Math.abs(symbolImpact.score) * 2);
    if (symbolImpact.score < 0 && enhanced.recommendation === 'BUY') confidence -= Math.min(12, Math.abs(symbolImpact.score) * 3);
  }

  confidence = Math.max(0, Math.min(95, Math.round(confidence)));
  enhanced.confidence = confidence;
  enhanced.news_sentiment = newsImpact.overall;
  enhanced.news_score = newsImpact.score;
  enhanced.news_factors = newsImpact.factors;
  enhanced.market_intel = newsImpact;
  enhanced.factors = [...(enhanced.factors || []), `News: ${newsImpact.overall} (${newsImpact.score})`, ...newsImpact.factors.slice(0, 3)];
  enhanced.reasoning = `${enhanced.reasoning || ''}${newsImpact.factors.length ? ' | Noticias: ' + newsImpact.factors.join(' | ') : ''}`;

  const minConfidence = Number(options.minConfidence || 70);
  const requireNewsAlignment = options.requireNewsAlignment !== false;
  const aligned = enhanced.recommendation === 'HOLD' || newsImpact.overall === 'neutral'
    || (enhanced.recommendation === 'BUY' && newsImpact.overall === 'bullish')
    || (enhanced.recommendation === 'SELL' && newsImpact.overall === 'bearish');

  enhanced.execution = {
    shouldExecute: ['BUY', 'SELL'].includes(enhanced.recommendation)
      && confidence >= minConfidence
      && !newsImpact.shouldPauseTrading
      && (!requireNewsAlignment || aligned),
    minConfidence,
    newsAligned: aligned,
    reason: ''
  };

  if (!['BUY', 'SELL'].includes(enhanced.recommendation)) enhanced.execution.reason = 'Sem recomendacao operacional';
  else if (confidence < minConfidence) enhanced.execution.reason = `Confianca ${confidence}% abaixo do minimo ${minConfidence}%`;
  else if (newsImpact.shouldPauseTrading) enhanced.execution.reason = 'Noticias/medo extremo pausaram operacoes';
  else if (requireNewsAlignment && !aligned) enhanced.execution.reason = 'Noticias nao confirmam o sinal tecnico';
  else enhanced.execution.reason = 'Sinal tecnico + noticias aprovados';

  return enhanced;
}

function generateSignals(marketData) {
  const signals = [];
  const closes = marketData.closes || [];
  const highs = marketData.highs || [];
  const lows = marketData.lows || [];
  const volumes = marketData.volumes || [];

  if (closes.length < 30) {
    return { signals: [], overall: 'HOLD', confidence: 0, indicators: {} };
  }

  const calculatedIndicators = {};

  // RSI Analysis - Sinais SELL mais agressivos para garantir realização de lucro
  const rsiVal = indicators.rsi(closes, 14);
  calculatedIndicators.rsi = rsiVal;
  if (rsiVal !== null) {
    if (rsiVal < 25) signals.push({ type: 'BUY', indicator: 'RSI', reason: `RSI sobrevendido (${rsiVal.toFixed(1)})`, weight: 2 });
    else if (rsiVal < 35) signals.push({ type: 'BUY', indicator: 'RSI', reason: `RSI approaching oversold (${rsiVal.toFixed(1)})`, weight: 1 });
    else if (rsiVal > 70) signals.push({ type: 'SELL', indicator: 'RSI', reason: `RSI sobrecomprado (${rsiVal.toFixed(1)}) - realizar lucro`, weight: 2.5 });
    else if (rsiVal > 60) signals.push({ type: 'SELL', indicator: 'RSI', reason: `RSI aproximando sobrecomprado (${rsiVal.toFixed(1)})`, weight: 1 });
  }

  // MACD Analysis - sinais SELL reforçados
  const macdData = indicators.macd(closes);
  calculatedIndicators.macd = macdData;
  if (macdData && macdData.histogram !== null) {
    if (macdData.histogram > 0 && macdData.macd > macdData.signal) {
      signals.push({ type: 'BUY', indicator: 'MACD', reason: 'MACD acima do sinal (bullish crossover)', weight: 2 });
    } else if (macdData.histogram < 0 && macdData.macd < macdData.signal) {
      signals.push({ type: 'SELL', indicator: 'MACD', reason: 'MACD abaixo do sinal (bearish crossover) - vender', weight: 2.5 });
    }
    // Histograma negativo mesmo com MACD positivo = momentum enfraquecendo = SELL fraco
    if (macdData.histogram < 0 && macdData.macd > 0) {
      signals.push({ type: 'SELL', indicator: 'MACD', reason: 'Momentum MACD enfraquecendo (histograma negativo)', weight: 1 });
    }
  }

  // Bollinger Bands Analysis
  const bb = indicators.bollingerBands(closes);
  calculatedIndicators.bollingerBands = bb;
  if (bb) {
    const currentPrice = closes[closes.length - 1];
    if (currentPrice <= bb.lower) {
      signals.push({ type: 'BUY', indicator: 'BB', reason: `Preco na banda inferior BB (${currentPrice.toFixed(2)} <= ${bb.lower.toFixed(2)})`, weight: 1.5 });
    } else if (currentPrice >= bb.upper) {
      signals.push({ type: 'SELL', indicator: 'BB', reason: `Preco na banda superior BB (${currentPrice.toFixed(2)} >= ${bb.upper.toFixed(2)}) - vender`, weight: 2 });
    }
    if (bb.bandwidth < 5) {
      signals.push({ type: 'HOLD', indicator: 'BB', reason: `BB Squeeze detectado (bandwidth: ${bb.bandwidth.toFixed(1)}%) - breakout iminente`, weight: 1 });
    }
  }

  // Moving Average Analysis - death cross mais forte
  const sma20 = indicators.sma(closes, 20);
  const sma50 = indicators.sma(closes, 50);
  calculatedIndicators.sma20 = sma20;
  calculatedIndicators.sma50 = sma50;
  if (sma20 && sma50) {
    if (sma20 > sma50) {
      signals.push({ type: 'BUY', indicator: 'MA', reason: 'SMA20 acima da SMA50 (golden cross)', weight: 1.5 });
    } else {
      signals.push({ type: 'SELL', indicator: 'MA', reason: 'SMA20 abaixo da SMA50 (death cross) - vender', weight: 2 });
    }
  }

  // EMA Analysis
  const ema12 = indicators.ema(closes, 12);
  const ema26 = indicators.ema(closes, 26);
  calculatedIndicators.ema12 = ema12;
  calculatedIndicators.ema26 = ema26;
  if (ema12 && ema26) {
    if (ema12 > ema26) {
      signals.push({ type: 'BUY', indicator: 'EMA', reason: 'EMA12 acima da EMA26 (tendencia de alta)', weight: 1 });
    } else {
      signals.push({ type: 'SELL', indicator: 'EMA', reason: 'EMA12 abaixo da EMA26 (tendencia de baixa) - vender', weight: 1.5 });
    }
  }

  // Stochastic Analysis
  const stoch = indicators.stochastic(highs, lows, closes);
  calculatedIndicators.stochastic = stoch;
  if (stoch) {
    if (stoch.k < 20 && stoch.d < 20) {
      signals.push({ type: 'BUY', indicator: 'Stoch', reason: `Estocastico sobrevendido (%K=${stoch.k.toFixed(1)}, %D=${stoch.d.toFixed(1)})`, weight: 1.5 });
    } else if (stoch.k > 75 && stoch.d > 75) {
      signals.push({ type: 'SELL', indicator: 'Stoch', reason: `Estocastico sobrecomprado (%K=${stoch.k.toFixed(1)}, %D=${stoch.d.toFixed(1)}) - vender`, weight: 1.5 });
    }
    // Cross down de %K sobre %D em zona alta = SELL
    if (stoch.k < stoch.d && stoch.k > 70) {
      signals.push({ type: 'SELL', indicator: 'Stoch', reason: 'Stochastic bearish crossover em zona alta', weight: 1 });
    }
  }

  // ATR (Volatility)
  const atrVal = indicators.atr(highs, lows, closes);
  calculatedIndicators.atr = atrVal;
  if (atrVal !== null) {
    const atrPct = (atrVal / closes[closes.length - 1]) * 100;
    calculatedIndicators.atrPercent = atrPct;
    if (atrPct > 5) {
      signals.push({ type: 'HOLD', indicator: 'ATR', reason: `Alta volatilidade (ATR: ${atrPct.toFixed(1)}%) - cautela`, weight: 0.5 });
    }
  }

  // Rate of Change (momentum) - novo
  const rocVal = indicators.roc(closes, 10);
  calculatedIndicators.roc = rocVal;
  if (rocVal !== null) {
    if (rocVal > 5) signals.push({ type: 'BUY', indicator: 'ROC', reason: `ROC forte alta (${rocVal.toFixed(2)}%)`, weight: 1 });
    else if (rocVal < -5) signals.push({ type: 'SELL', indicator: 'ROC', reason: `ROC forte queda (${rocVal.toFixed(2)}%) - vender`, weight: 1.5 });
  }

  // CCI (Commodity Channel Index) - novo
  const cciVal = indicators.cci(highs, lows, closes);
  calculatedIndicators.cci = cciVal;
  if (cciVal !== null) {
    if (cciVal < -100) signals.push({ type: 'BUY', indicator: 'CCI', reason: `CCI sobrevendido (${cciVal.toFixed(1)})`, weight: 1 });
    else if (cciVal > 100) signals.push({ type: 'SELL', indicator: 'CCI', reason: `CCI sobrecomprado (${cciVal.toFixed(1)}) - vender`, weight: 1.5 });
  }

  // Volume Analysis
  if (volumes.length >= 20) {
    const avgVol = indicators.sma(volumes, 20);
    const currentVol = volumes[volumes.length - 1];
    calculatedIndicators.volumeRatio = avgVol ? currentVol / avgVol : null;
    if (avgVol && currentVol > avgVol * 1.5) {
      const priceChange = closes[closes.length - 1] - closes[closes.length - 2];
      if (priceChange > 0) {
        signals.push({ type: 'BUY', indicator: 'VOL', reason: `Alto volume em alta (${(currentVol / avgVol).toFixed(1)}x media)`, weight: 1 });
      } else {
        signals.push({ type: 'SELL', indicator: 'VOL', reason: `Alto volume em baixa (${(currentVol / avgVol).toFixed(1)}x media)`, weight: 1 });
      }
    }
  }

  // VWAP Analysis
  const vwapVal = indicators.vwap(closes, volumes);
  calculatedIndicators.vwap = vwapVal;
  if (vwapVal) {
    const currentPrice = closes[closes.length - 1];
    if (currentPrice > vwapVal * 1.005) {
      signals.push({ type: 'SELL', indicator: 'VWAP', reason: `Preco acima do VWAP (${currentPrice.toFixed(2)} > ${vwapVal.toFixed(2)})`, weight: 0.5 });
    } else if (currentPrice < vwapVal * 0.995) {
      signals.push({ type: 'BUY', indicator: 'VWAP', reason: `Preco abaixo do VWAP (${currentPrice.toFixed(2)} < ${vwapVal.toFixed(2)})`, weight: 0.5 });
    }
  }

  // Calculate overall signal
  let buyWeight = 0, sellWeight = 0, holdWeight = 0;
  signals.forEach(s => {
    if (s.type === 'BUY') buyWeight += s.weight;
    else if (s.type === 'SELL') sellWeight += s.weight;
    else holdWeight += s.weight;
  });

  const totalWeight = buyWeight + sellWeight + holdWeight;
  let overall = 'HOLD';
  let confidence = 30;

  if (totalWeight > 0) {
    if (buyWeight > sellWeight && buyWeight > holdWeight) {
      overall = 'BUY';
      confidence = Math.min(95, Math.round((buyWeight / totalWeight) * 80 + 15));
    } else if (sellWeight > buyWeight && sellWeight > holdWeight) {
      overall = 'SELL';
      confidence = Math.min(95, Math.round((sellWeight / totalWeight) * 80 + 15));
    } else {
      overall = 'HOLD';
      confidence = Math.min(80, Math.round((holdWeight / totalWeight) * 60 + 20));
    }
  }

  // Determine trend
  const currentPrice = closes[closes.length - 1];
  let trend = 'LATERAL';
  if (sma20 && sma50) {
    if (currentPrice > sma20 && sma20 > sma50) trend = 'ALTA';
    else if (currentPrice < sma20 && sma20 < sma50) trend = 'BAIXA';
  }

  // Risk level based on volatility
  let riskLevel = 'LOW';
  if (atrVal) {
    const atrPct = (atrVal / currentPrice) * 100;
    if (atrPct > 4) riskLevel = 'EXTREME';
    else if (atrPct > 3) riskLevel = 'HIGH';
    else if (atrPct > 1.5) riskLevel = 'MEDIUM';
  }

  return {
    signals,
    overall,
    confidence,
    trend,
    riskLevel,
    indicators: calculatedIndicators,
    currentPrice,
    timestamp: new Date().toISOString()
  };
}

// ===== Bot Analysis with Exchange Data =====
async function fetchMarketDataForBot(exchangeConfig, symbol, interval = '60') {
  try {
    const axios = require('axios');
    const crypto = require('crypto');

    let url, headers = {};

    if (exchangeConfig.exchange === 'binance') {
      const base = exchangeConfig.testnet ? 'https://testnet.binance.vision' : 'https://api.binance.com';
      url = `${base}/api/v3/klines?symbol=${symbol}&interval=${interval}&limit=100`;
    } else if (exchangeConfig.exchange === 'bybit') {
      const base = exchangeConfig.demo ? 'https://api-demo.bybit.com' : exchangeConfig.testnet ? 'https://api-testnet.bybit.com' : 'https://api.bybit.com';
      url = `${base}/v5/market/kline?category=linear&symbol=${symbol}&interval=${interval}&limit=100`;
    } else if (exchangeConfig.exchange === 'okx') {
      headers = exchangeConfig.testnet ? { 'x-simulated-trading': '1' } : {};
      url = `https://www.okx.com/api/v5/market/candles?instId=${symbol}&bar=${interval}`;
    }

    const response = await axios.get(url, { headers, timeout: 30000 });
    const data = response.data;

    // Normalize data into standard format
    let closes = [], highs = [], lows = [], volumes = [], timestamps = [];

    if (exchangeConfig.exchange === 'binance' && Array.isArray(data)) {
      data.forEach(k => {
        timestamps.push(k[0]);
        closes.push(parseFloat(k[4]));
        highs.push(parseFloat(k[2]));
        lows.push(parseFloat(k[3]));
        volumes.push(parseFloat(k[5]));
      });
    } else if (exchangeConfig.exchange === 'bybit' && data.result?.list) {
      data.result.list.forEach(k => {
        timestamps.push(parseFloat(k[0]));
        closes.push(parseFloat(k[4]));
        highs.push(parseFloat(k[2]));
        lows.push(parseFloat(k[3]));
        volumes.push(parseFloat(k[5]));
      });
    } else if (exchangeConfig.exchange === 'okx' && Array.isArray(data.data)) {
      data.data.forEach(k => {
        timestamps.push(parseFloat(k[0]));
        closes.push(parseFloat(k[4]));
        highs.push(parseFloat(k[2]));
        lows.push(parseFloat(k[3]));
        volumes.push(parseFloat(k[5]));
      });
    }

    return { closes, highs, lows, volumes, timestamps, symbol };
  } catch (err) {
    return { error: err.message, closes: [], highs: [], lows: [], volumes: [], timestamps: [], symbol };
  }
}

module.exports = {
  BOT_VERSION,
  BOT_SIZE_MB,

  async getBotInfo() {
    return {
      version: BOT_VERSION,
      sizeMB: BOT_SIZE_MB,
      name: 'CryptoBot Beta',
      description: 'Bot especializado em criptomoedas com analise tecnica avancada',
      capabilities: [
        'RSI - Indice de Forca Relativa',
        'MACD - Convergencia/Divergencia de Medias Moveis',
        'Bollinger Bands - Bandas de Bollinger',
        'SMA/EMA - Medias Moveis Simples e Exponenciais',
        'Stochastic - Oscilador Estocastico',
        'ATR - Indicador de Volatilidade',
        'VWAP - Preco Medio Ponderado por Volume',
        'OBV - On-Balance Volume',
        'Deteccao de Squeeze e Breakout',
        'Analise de Volume Anomalico',
        'Identificacao de Golden Cross / Death Cross',
        'Avaliacao de Risco por Volatilidade'
      ],
      installed: false
    };
  },

  async analyze(exchangeConfig, symbol, interval, context = {}) {
    try {
      const marketData = await fetchMarketDataForBot(exchangeConfig, symbol, interval);
      if (marketData.error) {
        return { success: false, error: marketData.error };
      }
      if (marketData.closes.length < 30) {
        return { success: false, error: 'Dados insuficientes para analise (minimo 30 candles)' };
      }

      const result = generateSignals(marketData);
      const currentPrice = result.currentPrice;

      // Generate entry/target/stop based on signals
      let entryPrice = currentPrice;
      let targetPrice = null;
      let stopLoss = null;
      const atrVal = result.indicators.atr;

      if (result.overall === 'BUY' && atrVal) {
        targetPrice = currentPrice * 1.025;
        stopLoss = currentPrice - atrVal * 1.5;
      } else if (result.overall === 'SELL' && atrVal) {
        targetPrice = currentPrice - atrVal * 2;
        stopLoss = currentPrice + atrVal * 1.5;
      }

      const baseAnalysis = {
        recommendation: result.overall,
        confidence: result.confidence,
        risk_level: result.riskLevel,
        entry_price: Math.round(entryPrice * 100) / 100,
        target_price: targetPrice ? Math.round(targetPrice * 100) / 100 : null,
        stop_loss: stopLoss ? Math.round(stopLoss * 100) / 100 : null,
        reasoning: result.signals.map(s => s.reason).join('. '),
        factors: result.signals.map(s => `${s.indicator}: ${s.type}`),
        timeframe: 'medium',
        sentiment: result.trend === 'ALTA' ? 'bullish' : result.trend === 'BAIXA' ? 'bearish' : 'neutral',
        trend: result.trend,
        symbol: symbol,
        source: 'CryptoBot Beta'
      };

      const analysis = enhanceAnalysisWithNews(
        baseAnalysis,
        context.news || [],
        context.sentiment || {},
        {
          minConfidence: context.minConfidence,
          requireNewsAlignment: context.requireNewsAlignment
        }
      );

      return {
        success: true,
        analysis,
        indicators: result.indicators,
        signals: result.signals,
        marketIntel: analysis.market_intel,
        raw: JSON.stringify({ ...result, marketIntel: analysis.market_intel, execution: analysis.execution }, null, 2)
      };
    } catch (err) {
      return { success: false, error: err.message };
    }
  },

  analyzeNewsImpact,
  enhanceAnalysisWithNews,

  // Analisa se uma posição existente deve ser fechada (SELL/EXIT)
  // position: { symbol, entryPrice, quantity, side, takeProfit, stopLoss, openedAt }
  // Retorna: { shouldExit, reason, confidence, currentPrice, pnlPercent, signals }
  async analyzePositionExit(exchangeConfig, position, interval = '60', context = {}) {
    try {
      if (!position || !position.symbol) {
        return { success: false, error: 'Posição inválida' };
      }

      const marketData = await fetchMarketDataForBot(exchangeConfig, position.symbol, interval);
      if (marketData.error) {
        return { success: false, error: marketData.error };
      }
      if (marketData.closes.length < 30) {
        return { success: false, error: 'Dados insuficientes para análise de saída' };
      }

      const result = generateSignals(marketData);
      const currentPrice = result.currentPrice;
      const entryPrice = Number(position.entryPrice || position.entry_price || 0);
      const side = String(position.side || 'BUY').toUpperCase();

      // Calcular P&L percentual
      let pnlPercent = 0;
      if (entryPrice > 0) {
        if (side === 'BUY') {
          pnlPercent = ((currentPrice - entryPrice) / entryPrice) * 100;
        } else {
          pnlPercent = ((entryPrice - currentPrice) / entryPrice) * 100;
        }
      }

      const exitReasons = [];
      let exitScore = 0; // quanto maior, mais forte o sinal de saída

      // 1. Take-profit atingido
      const takeProfit = Number(position.takeProfit || position.take_profit || 0);
      if (takeProfit > 0 && side === 'BUY' && currentPrice >= takeProfit) {
        exitReasons.push(`Take-profit atingido: ${currentPrice} >= ${takeProfit} (+${pnlPercent.toFixed(2)}%)`);
        exitScore += 50;
      }

      // 2. Stop-loss atingido
      const stopLoss = Number(position.stopLoss || position.stop_loss || 0);
      if (stopLoss > 0 && side === 'BUY' && currentPrice <= stopLoss) {
        exitReasons.push(`Stop-loss atingido: ${currentPrice} <= ${stopLoss} (${pnlPercent.toFixed(2)}%)`);
        exitScore += 60;
      }

      // 3. Realização de lucro: se posição BUY está com +2.5% a +5% e sinais técnicos viraram SELL
      if (side === 'BUY' && pnlPercent >= 2.5 && result.overall === 'SELL') {
        exitReasons.push(`Realização de lucro: +${pnlPercent.toFixed(2)}% com sinal técnico SELL (confiança ${result.confidence}%)`);
        exitScore += 35;
      }

      // 4. Realização de lucro agressiva: se BUY está com +5% ou mais, vender independente de sinal
      if (side === 'BUY' && pnlPercent >= 5) {
        exitReasons.push(`Lucro forte realizado: +${pnlPercent.toFixed(2)}% (acima do target de 5%)`);
        exitScore += 45;
      }

      // 5. Stop-loss técnico: se BUY está com -3% ou mais, vender para limitar perda
      if (side === 'BUY' && pnlPercent <= -3) {
        exitReasons.push(`Stop-loss técnico: ${pnlPercent.toFixed(2)}% (perda acima de -3%)`);
        exitScore += 40;
      }

      // 6. Tendência de baixa confirmada por múltiplos indicadores
      if (side === 'BUY' && result.trend === 'BAIXA' && result.overall === 'SELL') {
        exitReasons.push(`Tendência de baixa confirmada: ${result.signals.filter(s => s.type === 'SELL').length} indicadores em SELL`);
        exitScore += 25;
      }

      // 7. RSI sobrecomprado + momentum caindo
      const rsiVal = result.indicators.rsi;
      const macdData = result.indicators.macd;
      if (side === 'BUY' && rsiVal > 70 && macdData && macdData.histogram < 0) {
        exitReasons.push(`RSI sobrecomprado (${rsiVal.toFixed(1)}) + MACD histograma negativo`);
        exitScore += 20;
      }

      // 8. Tempo máximo em posição (24h) com lucro mínimo - evitar capital parado
      const openedAt = position.openedAt || position.opened_at;
      if (openedAt) {
        const hoursInPosition = (Date.now() - new Date(openedAt).getTime()) / (1000 * 60 * 60);
        if (hoursInPosition >= 24 && pnlPercent >= 1) {
          exitReasons.push(`Posição aberta há ${hoursInPosition.toFixed(1)}h com lucro de ${pnlPercent.toFixed(2)}% - realizar antes de overnight`);
          exitScore += 15;
        }
      }

      // Aplicar filtro de notícias se houver contexto
      let newsBlock = false;
      if (context.news && context.news.length) {
        const newsImpact = analyzeNewsImpact(context.news, context.sentiment || {});
        if (newsImpact.shouldPauseTrading) {
          // Em vez de bloquear, forçamos saída em cenários de risco crítico
          if (newsImpact.criticalRisk) {
            exitReasons.push(`Risco crítico de notícias detectado - sair imediatamente`);
            exitScore += 30;
          }
        }
      }

      const shouldExit = exitScore >= 40;
      const confidence = Math.min(95, Math.round(exitScore + 20));

      return {
        success: true,
        shouldExit,
        reason: exitReasons.length ? exitReasons.join(' | ') : 'Manter posição',
        confidence,
        currentPrice,
        entryPrice,
        pnlPercent,
        trend: result.trend,
        technicalSignal: result.overall,
        signals: result.signals,
        exitScore,
        symbol: position.symbol
      };
    } catch (err) {
      return { success: false, error: err.message };
    }
  },

  async testConnection() {
    return {
      success: true,
      message: `CryptoBot Beta v${BOT_VERSION} pronto`,
      version: BOT_VERSION,
      sizeMB: BOT_SIZE_MB
    };
  },

  // Get supported trading pairs
  getSupportedPairs() {
    return [
      'BTCUSDT', 'ETHUSDT', 'BNBUSDT', 'SOLUSDT', 'XRPUSDT',
      'ADAUSDT', 'DOGEUSDT', 'DOTUSDT', 'MATICUSDT', 'AVAXUSDT',
      'SHIBUSDT', 'LTCUSDT', 'LINKUSDT', 'ATOMUSDT', 'UNIUSDT',
      'NEARUSDT', 'APEUSDT', 'ARBUSDT', 'OPUSDT', 'FETUSDT',
      'SUIUSDT', 'APTUSDT', 'SEIUSDT', 'TIAUSDT', 'JUPUSDT',
      'WIFUSDT', 'PEPEUSDT', 'BONKUSDT', 'FLOKIUSDT', 'RUNEUSDT'
    ];
  }
};

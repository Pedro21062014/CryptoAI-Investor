const axios = require('axios');

const newsSources = {
  coindesk: 'https://api.coindesk.com/v1',
  coingecko: 'https://api.coingecko.com/api/v3',
  cryptoCompare: 'https://min-api.cryptocompare.com/data',
  newsApi: 'https://newsapi.org/v2'
};

module.exports = {
  async getCryptoNews() {
    const allNews = [];

    // CoinGecko trending
    try {
      const response = await axios.get(`${newsSources.coingecko}/search/trending`, {
        timeout: 10000
      });
      if (response.data.coins) {
        response.data.coins.forEach(coin => {
          allNews.push({
            source: 'CoinGecko Trending',
            title: `${coin.item.name} (${coin.item.symbol}) - Trending`,
            description: `Market cap rank: ${coin.item.market_cap_rank}, Price BTC: ${coin.item.price_btc}`,
            sentiment: 'neutral',
            timestamp: new Date().toISOString(),
            url: `https://www.coingecko.com/en/coins/${coin.item.id}`
          });
        });
      }
    } catch (err) {
      allNews.push({ source: 'CoinGecko', error: err.message });
    }

    // CryptoCompare news
    try {
      const response = await axios.get(`${newsSources.cryptoCompare}/v2/news/?lang=EN&sortOrder=popular`, {
        timeout: 10000
      });
      if (response.data.Data) {
        response.data.Data.slice(0, 20).forEach(article => {
          allNews.push({
            source: article.source_info?.name || 'CryptoCompare',
            title: article.title,
            description: article.body?.substring(0, 200),
            sentiment: this.analyzeSentiment(article.title + ' ' + (article.body || '')),
            timestamp: article.published_on ? new Date(article.published_on * 1000).toISOString() : new Date().toISOString(),
            url: article.guid || article.url
          });
        });
      }
    } catch (err) {
      allNews.push({ source: 'CryptoCompare', error: err.message });
    }

    // CoinGecko market data
    try {
      const response = await axios.get(`${newsSources.coingecko}/coins/markets?vs_currency=usd&order=market_cap_desc&per_page=20&page=1&sparkline=true&price_change_percentage=1h,24h,7d`, {
        timeout: 10000
      });
      if (response.data) {
        response.data.forEach(coin => {
          const priceChange = coin.price_change_percentage_24h || 0;
          allNews.push({
            source: 'CoinGecko Market',
            title: `${coin.name} (${coin.symbol.toUpperCase()}) - $${coin.current_price?.toLocaleString()}`,
            description: `24h Change: ${priceChange.toFixed(2)}%, Market Cap: $${coin.market_cap?.toLocaleString()}, Volume: $${coin.total_volume?.toLocaleString()}`,
            sentiment: priceChange > 2 ? 'bullish' : priceChange < -2 ? 'bearish' : 'neutral',
            timestamp: new Date().toISOString(),
            url: `https://www.coingecko.com/en/coins/${coin.id}`,
            marketData: {
              price: coin.current_price,
              change24h: priceChange,
              marketCap: coin.market_cap,
              volume: coin.total_volume,
              high24h: coin.high_24h,
              low24h: coin.low_24h,
              sparkline: coin.sparkline_in_7d?.price || []
            }
          });
        });
      }
    } catch (err) {
      allNews.push({ source: 'CoinGecko Market', error: err.message });
    }

    // Fear & Greed Index
    try {
      const response = await axios.get(`${newsSources.cryptoCompare}/ FearAndGreedIndex/`, {
        timeout: 10000
      });
      if (response.data.Data) {
        const fgi = response.data.Data[0];
        allNews.push({
          source: 'Fear & Greed Index',
          title: `Crypto Fear & Greed Index: ${fgi.Value}`,
          description: `Current sentiment: ${fgi.Value > 60 ? 'Greed' : fgi.Value < 40 ? 'Fear' : 'Neutral'} (${fgi.Value}/100)`,
          sentiment: fgi.Value > 60 ? 'bullish' : fgi.Value < 40 ? 'bearish' : 'neutral',
          timestamp: new Date().toISOString(),
          fearGreedIndex: fgi.Value
        });
      }
    } catch (err) {
      // Fallback - try alternative API
      try {
        const response = await axios.get('https://api.alternative.me/fng/?limit=1', { timeout: 10000 });
        if (response.data.data) {
          const fgi = response.data.data[0];
          allNews.push({
            source: 'Fear & Greed Index',
            title: `Crypto Fear & Greed Index: ${fgi.value}`,
            description: `Current sentiment: ${fgi.value_classification}`,
            sentiment: parseInt(fgi.value) > 60 ? 'bullish' : parseInt(fgi.value) < 40 ? 'bearish' : 'neutral',
            timestamp: new Date(fgi.timestamp * 1000).toISOString(),
            fearGreedIndex: parseInt(fgi.value)
          });
        }
      } catch (err2) {
        allNews.push({ source: 'Fear & Greed Index', error: err2.message });
      }
    }

    return allNews;
  },

  async getMarketSentiment() {
    let sentiment = { overall: 'neutral', score: 50, sources: {} };

    try {
      const response = await axios.get(`${newsSources.coingecko}/global`, { timeout: 10000 });
      if (response.data.data) {
        const g = response.data.data;
        sentiment.sources.coingecko = {
          market_cap_change_24h: g.market_cap_change_percentage_24h_usd,
          total_market_cap: g.total_market_cap?.usd,
          total_volume: g.total_volume?.usd,
          btc_dominance: g.market_cap_percentage?.btc,
          eth_dominance: g.market_cap_percentage?.eth,
          active_cryptos: g.active_cryptocurrencies,
          markets: g.markets
        };
        const change = g.market_cap_change_percentage_24h_usd || 0;
        if (change > 3) sentiment.overall = 'bullish';
        else if (change < -3) sentiment.overall = 'bearish';
        sentiment.score = Math.max(0, Math.min(100, 50 + change * 5));
      }
    } catch (err) {
      sentiment.sources.coingecko = { error: err.message };
    }

    try {
      const response = await axios.get('https://api.alternative.me/fng/?limit=1', { timeout: 10000 });
      if (response.data.data) {
        const fgi = response.data.data[0];
        sentiment.sources.fearGreed = {
          value: parseInt(fgi.value),
          classification: fgi.value_classification
        };
        sentiment.score = (sentiment.score + parseInt(fgi.value)) / 2;
        if (parseInt(fgi.value) > 60) sentiment.overall = 'bullish';
        else if (parseInt(fgi.value) < 40) sentiment.overall = 'bearish';
      }
    } catch (err) {
      sentiment.sources.fearGreed = { error: err.message };
    }

    return sentiment;
  },

  analyzeSentiment(text) {
    const bullishWords = ['surge', 'rally', 'bullish', 'pump', 'moon', 'gain', 'rise', 'soar', 'breakout', 'adoption', 'upgrade', 'partnership', 'launch', 'growth', 'positive', 'accumulate', 'support', 'recover'];
    const bearishWords = ['crash', 'dump', 'bearish', 'decline', 'fall', 'drop', 'plunge', 'hack', 'ban', 'regulation', 'risk', 'loss', 'sell-off', 'negative', 'resistance', 'fear', 'uncertainty', 'warning'];

    const lower = text.toLowerCase();
    let score = 0;
    bullishWords.forEach(w => { if (lower.includes(w)) score++; });
    bearishWords.forEach(w => { if (lower.includes(w)) score--; });

    if (score > 1) return 'bullish';
    if (score < -1) return 'bearish';
    return 'neutral';
  }
};

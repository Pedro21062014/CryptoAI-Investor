const axios = require('axios');

const aiProviders = {
  deepseek: {
    baseUrl: 'https://api.deepseek.com/v1',
    async chat(config, messages) {
      const response = await axios.post(`${this.baseUrl}/chat/completions`, {
        model: config.model || 'deepseek-chat',
        messages,
        temperature: config.temperature || 0.3,
        max_tokens: config.maxTokens || 2000
      }, {
        headers: {
          'Authorization': `Bearer ${config.apiKey}`,
          'Content-Type': 'application/json'
        }
      });
      return response.data;
    }
  },

  openai: {
    baseUrl: 'https://api.openai.com/v1',
    async chat(config, messages) {
      const response = await axios.post(`${this.baseUrl}/chat/completions`, {
        model: config.model || 'gpt-4o',
        messages,
        temperature: config.temperature || 0.3,
        max_tokens: config.maxTokens || 2000
      }, {
        headers: {
          'Authorization': `Bearer ${config.apiKey}`,
          'Content-Type': 'application/json'
        }
      });
      return response.data;
    }
  },

  google: {
    baseUrl: 'https://generativelanguage.googleapis.com/v1beta',
    async chat(config, messages) {
      const model = config.model || 'gemini-pro';
      const contents = messages.map(m => ({
        role: m.role === 'assistant' ? 'model' : 'user',
        parts: [{ text: m.content }]
      }));
      const response = await axios.post(
        `${this.baseUrl}/models/${model}:generateContent?key=${config.apiKey}`,
        { contents, generationConfig: { temperature: config.temperature || 0.3 } }
      );
      return response.data;
    }
  },

  nvidia: {
    baseUrl: 'https://integrate.api.nvidia.com/v1',
    async chat(config, messages) {
      const response = await axios.post(`${this.baseUrl}/chat/completions`, {
        model: config.model || 'meta/llama-3.1-405b-instruct',
        messages,
        temperature: config.temperature || 0.3,
        max_tokens: config.maxTokens || 2000
      }, {
        headers: {
          'Authorization': `Bearer ${config.apiKey}`,
          'Content-Type': 'application/json'
        }
      });
      return response.data;
    }
  },

  claude: {
    baseUrl: 'https://api.anthropic.com/v1',
    async chat(config, messages) {
      const systemMsg = messages.find(m => m.role === 'system');
      const chatMsgs = messages.filter(m => m.role !== 'system');
      const response = await axios.post(`${this.baseUrl}/messages`, {
        model: config.model || 'claude-sonnet-4-20250514',
        max_tokens: config.maxTokens || 2000,
        system: systemMsg?.content || '',
        messages: chatMsgs
      }, {
        headers: {
          'x-api-key': config.apiKey,
          'anthropic-version': '2023-06-01',
          'Content-Type': 'application/json'
        }
      });
      return response.data;
    }
  },

  openrouter: {
    baseUrl: 'https://openrouter.ai/api/v1',
    async chat(config, messages) {
      const response = await axios.post(`${this.baseUrl}/chat/completions`, {
        model: config.model || 'openai/gpt-4o',
        messages,
        temperature: config.temperature || 0.3,
        max_tokens: config.maxTokens || 2000
      }, {
        headers: {
          'Authorization': `Bearer ${config.apiKey}`,
          'Content-Type': 'application/json',
          'HTTP-Referer': 'https://crypto-ai-investor.app',
          'X-Title': 'CryptoAI Investor'
        }
      });
      return response.data;
    }
  },

  custom: {
    async chat(config, messages) {
      const response = await axios.post(`${config.baseUrl}/chat/completions`, {
        model: config.model || 'default',
        messages,
        temperature: config.temperature || 0.3,
        max_tokens: config.maxTokens || 2000
      }, {
        headers: {
          'Authorization': `Bearer ${config.apiKey}`,
          'Content-Type': 'application/json',
          ...config.customHeaders
        }
      });
      return response.data;
    }
  }
};

function extractResponse(provider, data) {
  try {
    if (provider === 'google') {
      return data.candidates?.[0]?.content?.parts?.[0]?.text || 'No response';
    }
    if (provider === 'claude') {
      return data.content?.[0]?.text || 'No response';
    }
    return data.choices?.[0]?.message?.content || 'No response';
  } catch {
    return 'Error parsing AI response';
  }
}

const SYSTEM_PROMPT = `You are an expert cryptocurrency investment AI analyst. Your role is to:
1. Scan and analyze ALL available cryptocurrency markets - not just BTC or ETH
2. Look for the BEST trading opportunities across ALL coins available on the exchange
3. Identify coins with strong momentum, breakouts, or reversal patterns
4. Assess risk levels for potential trades
5. Provide clear BUY/SELL/HOLD recommendations with confidence scores
6. Always consider the user's risk tolerance and maximum loss limits
7. Consider market volatility, volume trends, and macro factors
8. Provide specific entry/exit price levels when possible

IMPORTANT: You can recommend ANY cryptocurrency that you believe will perform well - not just BTC or ETH. Look for opportunities in altcoins, memecoins, DeFi tokens, Layer 2 tokens, AI tokens, and any other crypto asset. If you see a strong signal on a smaller coin with high growth potential, recommend it! Be bold and look beyond the top 10.

You MUST respond in JSON format:
{
  "recommendation": "BUY|SELL|HOLD",
  "confidence": 0-100,
  "risk_level": "LOW|MEDIUM|HIGH|EXTREME",
  "symbol": "THE_SPECIFIC_COIN_PAIR (e.g. SOLUSDT, AVAXUSDT, DOGEUSDT, PEPEUSDT, FETUSDT, etc)",
  "entry_price": number or null,
  "target_price": number or null,
  "stop_loss": number or null,
  "reasoning": "detailed explanation of why THIS coin is the best opportunity right now",
  "factors": ["factor1", "factor2", ...],
  "timeframe": "short|medium|long",
  "sentiment": "bullish|bearish|neutral"
}`;

module.exports = {
  async analyze(config, data) {
    try {
      const provider = aiProviders[config.provider];
      if (!provider) return { success: false, error: 'AI provider not supported' };

      const messages = [
        { role: 'system', content: SYSTEM_PROMPT },
        { role: 'user', content: `Analyze this crypto market data:\n${JSON.stringify(data, null, 2)}` }
      ];

      const response = await provider.chat(config, messages);
      const text = extractResponse(config.provider, response);

      let parsed;
      try {
        const jsonMatch = text.match(/\{[\s\S]*\}/);
        parsed = jsonMatch ? JSON.parse(jsonMatch[0]) : { recommendation: 'HOLD', reasoning: text };
      } catch {
        parsed = { recommendation: 'HOLD', reasoning: text };
      }

      return { success: true, analysis: parsed, raw: text };
    } catch (err) {
      return { success: false, error: err.message };
    }
  },

  async testConnection(config) {
    try {
      const provider = aiProviders[config.provider];
      if (!provider) return { success: false, error: 'AI provider not supported' };

      const messages = [
        { role: 'system', content: 'You are a helpful assistant.' },
        { role: 'user', content: 'Say "Connection successful" in JSON format.' }
      ];

      const response = await provider.chat(config, messages);
      const text = extractResponse(config.provider, response);
      return { success: true, message: text };
    } catch (err) {
      return { success: false, error: err.message };
    }
  },

  async getAnalysis(config, marketData, newsData) {
    try {
      const provider = aiProviders[config.provider];
      if (!provider) return { success: false, error: 'AI provider not supported' };

      const prompt = `Perform a comprehensive crypto investment analysis.

IMPORTANT: You must scan ALL available cryptocurrency pairs and recommend the BEST opportunity - not just BTC/ETH. Look at altcoins, new tokens, AI tokens, DeFi tokens, Layer 2 tokens, and any coin with strong signals. If a smaller coin has a stronger signal than BTC, recommend that instead!

MARKET DATA:
${JSON.stringify(marketData, null, 2)}

NEWS & SENTIMENT:
${JSON.stringify(newsData, null, 2)}

RISK PARAMETERS:
- Max Risk Level: ${config.maxRiskLevel || 'MEDIUM'}
- Max Loss: ${config.maxLoss || '5'}%
- Investment Style: ${config.investmentStyle || 'moderate'}

You MUST include a "symbol" field in your response with the specific pair you recommend (e.g., "SOLUSDT", "AVAXUSDT", "DOGEUSDT", "PEPEUSDT", "FETUSDT"). If the market data contains multiple pairs, pick the one with the strongest signal. Be bold - recommend the coin with the best opportunity regardless of market cap.`;

      const messages = [
        { role: 'system', content: SYSTEM_PROMPT },
        { role: 'user', content: prompt }
      ];

      const response = await provider.chat(config, messages);
      const text = extractResponse(config.provider, response);

      let parsed;
      try {
        const jsonMatch = text.match(/\{[\s\S]*\}/);
        parsed = jsonMatch ? JSON.parse(jsonMatch[0]) : { recommendation: 'HOLD', reasoning: text };
      } catch {
        parsed = { recommendation: 'HOLD', reasoning: text };
      }

      return { success: true, analysis: parsed, raw: text };
    } catch (err) {
      return { success: false, error: err.message };
    }
  }
};

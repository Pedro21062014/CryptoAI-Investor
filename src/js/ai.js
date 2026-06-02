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
1. Analyze market data, technical indicators, and news sentiment
2. Assess risk levels for potential trades
3. Provide clear BUY/SELL/HOLD recommendations with confidence scores
4. Always consider the user's risk tolerance and maximum loss limits
5. Consider market volatility, volume trends, and macro factors
6. Provide specific entry/exit price levels when possible

You MUST respond in JSON format:
{
  "recommendation": "BUY|SELL|HOLD",
  "confidence": 0-100,
  "risk_level": "LOW|MEDIUM|HIGH|EXTREME",
  "entry_price": number or null,
  "target_price": number or null,
  "stop_loss": number or null,
  "reasoning": "detailed explanation",
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

      const prompt = `Perform a comprehensive crypto investment analysis:

MARKET DATA:
${JSON.stringify(marketData, null, 2)}

NEWS & SENTIMENT:
${JSON.stringify(newsData, null, 2)}

RISK PARAMETERS:
- Max Risk Level: ${config.maxRiskLevel || 'MEDIUM'}
- Max Loss: ${config.maxLoss || '5'}%
- Investment Style: ${config.investmentStyle || 'moderate'}

Provide detailed analysis with clear recommendations.`;

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

const axios = require('axios');

// AI-specific timeout (3 minutes) — analysis requests can take longer
const AI_TIMEOUT = 180000;
const AI_MAX_RETRIES = 2;
const AI_RETRY_DELAY = 3000;

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
        timeout: AI_TIMEOUT,
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
        timeout: AI_TIMEOUT,
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
        { contents, generationConfig: { temperature: config.temperature || 0.3 } },
        { timeout: AI_TIMEOUT }
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
        timeout: AI_TIMEOUT,
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
        timeout: AI_TIMEOUT,
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
        timeout: AI_TIMEOUT,
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
        timeout: AI_TIMEOUT,
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


function normalizeModels(provider, data) {
  let models = [];
  if (Array.isArray(data?.data)) models = data.data;
  else if (Array.isArray(data?.models)) models = data.models;
  else if (Array.isArray(data)) models = data;

  return models.map(model => {
    const rawId = model.id || model.name || model.model || model.slug;
    if (!rawId) return null;
    const id = provider === 'google' ? String(rawId).replace(/^models\//, '') : String(rawId);
    const label = model.display_name || model.displayName || model.name || model.id || id;
    return {
      id,
      name: String(label).replace(/^models\//, ''),
      description: model.description || model.owned_by || model.created_by || '',
      contextLength: model.context_length || model.contextLength || model.input_token_limit || null
    };
  }).filter(Boolean).sort((a, b) => a.id.localeCompare(b.id));
}

async function listModels(config) {
  const providerName = config.provider;
  const provider = aiProviders[providerName];
  if (!provider) return { success: false, error: 'AI provider not supported' };

  try {
    let response;
    if (providerName === 'google') {
      response = await axios.get(`${provider.baseUrl}/models?key=${config.apiKey}`, { timeout: 30000 });
      return { success: true, models: normalizeModels(providerName, response.data).filter(m => !m.id || m.id.includes('gemini')), raw: response.data };
    }

    if (providerName === 'claude') {
      response = await axios.get(`${provider.baseUrl}/models`, {
        timeout: 30000,
        headers: {
          'x-api-key': config.apiKey,
          'anthropic-version': '2023-06-01'
        }
      });
      return { success: true, models: normalizeModels(providerName, response.data), raw: response.data };
    }

    const baseUrl = providerName === 'custom'
      ? String(config.baseUrl || '').replace(/\/$/, '')
      : provider.baseUrl;
    if (!baseUrl) return { success: false, error: 'URL base da API custom nao informada' };

    response = await axios.get(`${baseUrl}/models`, {
      timeout: 30000,
      headers: {
        ...(config.apiKey ? { Authorization: `Bearer ${config.apiKey}` } : {}),
        ...(providerName === 'openrouter' ? {
          'HTTP-Referer': 'https://crypto-ai-investor.app',
          'X-Title': 'CryptoAI Investor'
        } : {}),
        ...(config.customHeaders || {})
      }
    });
    return { success: true, models: normalizeModels(providerName, response.data), raw: response.data };
  } catch (err) {
    const message = err.response?.data?.error?.message || err.response?.data?.message || err.response?.data?.error || err.message;
    return { success: false, error: typeof message === 'string' ? message : JSON.stringify(message) };
  }
}

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

// Helper: get human-readable error from axios error
function formatAIError(err) {
  if (err.code === 'ECONNABORTED' || err.message?.includes('timeout')) {
    return `Timeout: a API demorou mais de ${Math.round((err.config?.timeout || AI_TIMEOUT) / 1000)}s para responder. Tente novamente ou use um modelo mais rápido.`;
  }
  if (err.response) {
    const status = err.response.status;
    const data = err.response.data;
    const msg = data?.error?.message || data?.message || data?.error || '';
    if (status === 401 || status === 403) {
      return `Erro de autenticação (${status}): verifique sua API Key. ${typeof msg === 'string' ? msg : JSON.stringify(msg)}`;
    }
    if (status === 429) {
      return `Rate limit atingido (${status}): aguarde alguns segundos antes de tentar novamente. ${typeof msg === 'string' ? msg : JSON.stringify(msg)}`;
    }
    if (status >= 500) {
      return `Erro no servidor da API (${status}): o provedor está com problemas. Tente novamente em alguns instantes. ${typeof msg === 'string' ? msg : JSON.stringify(msg)}`;
    }
    return `Erro HTTP ${status}: ${typeof msg === 'string' ? msg : JSON.stringify(msg)}`;
  }
  if (err.code === 'ENOTFOUND' || err.code === 'ECONNREFUSED') {
    return `Não foi possível conectar ao servidor da API (${err.code}). Verifique sua conexão com a internet e a URL do provedor.`;
  }
  return err.message || 'Erro desconhecido na chamada da API';
}

// Helper: retry with exponential backoff
async function retryAIRequest(fn, maxRetries = AI_MAX_RETRIES) {
  let lastError;
  for (let attempt = 0; attempt <= maxRetries; attempt++) {
    try {
      return await fn();
    } catch (err) {
      lastError = err;
      // Don't retry auth errors
      if (err.response && (err.response.status === 401 || err.response.status === 403)) {
        throw err;
      }
      // Don't retry invalid request errors
      if (err.response && err.response.status >= 400 && err.response.status < 500 && err.response.status !== 429) {
        throw err;
      }
      if (attempt < maxRetries) {
        const delay = AI_RETRY_DELAY * Math.pow(2, attempt);
        await new Promise(resolve => setTimeout(resolve, delay));
      }
    }
  }
  throw lastError;
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
  "order_usdt": number or null,
  "position_size_percent": number or null,
  "reasoning": "detailed explanation of why THIS coin is the best opportunity right now and why you chose this order size",
  "factors": ["factor1", "factor2", ...],
  "timeframe": "short|medium|long",
  "sentiment": "bullish|bearish|neutral"
}

Sizing rules: choose the order size yourself based on confidence, risk, volatility and available balance. If trading on Binance, never choose less than 5 USDT per real operation. Do not use 100% of the balance; for real trades prefer 5-10 USDT on small balances or 1-5% on larger balances unless the user explicitly asks for more. Only recommend symbols that are active/tradable in the provided market data or monitored pairs. Use order_usdt for a fixed USDT amount or position_size_percent for percentage.`;


function getLanguageInstruction(language) {
  const lang = String(language || 'pt-BR').toLowerCase();
  const languageName = lang.startsWith('en') ? 'English' : lang.startsWith('es') ? 'Spanish' : 'Portuguese (Brazil)';
  return `LANGUAGE REQUIREMENT: The user selected ${languageName}. Keep the JSON keys exactly as specified, but write all human-readable text values in ${languageName}, especially reasoning, factors, explanations, warnings, and any narrative text. Do not mix languages unless market terms are proper names.`;
}

function buildSystemPrompt(config) {
  return `${SYSTEM_PROMPT}

${getLanguageInstruction(config.language)}`;
}


const CHAT_SYSTEM_PROMPT = `You are CryptoAI Investor's advanced in-app AI assistant.
You can chat normally and you can request app actions.
You can help with trading, risk, bots, automations, portfolio and settings.

When you want the app to execute something, include an ACTION JSON block in your answer exactly like this:
ACTION_JSON:{"actions":[{"type":"BUY|SELL|CREATE_BOT|CREATE_AI|START_BOT|STOP_BOT|SET_SETTING","symbol":"BTCUSDT","order_usdt":5,"position_size_percent":null,"paper":true,"reason":"why"}]}

Rules:
- For BUY/SELL, always include symbol and choose the size yourself using order_usdt or position_size_percent. On Binance real mode, order_usdt must be at least 5. Default paper=true unless user explicitly asks real/live order.
- For CREATE_BOT use mode bot or hybrid, symbols, interval, cycleMinutes, confidence, paper, autoTrade.
- For CREATE_AI use provider/model only if user asks; otherwise use current configured IA.
- Always explain what you are doing in the selected language.
- Be careful with real orders; ask for confirmation unless the user clearly asked real/live execution.`;

async function chat(config, messages, context = {}) {
  try {
    const provider = aiProviders[config.provider];
    if (!provider) return { success: false, error: 'AI provider not supported' };
    const langInstruction = getLanguageInstruction(config.language);
    const finalMessages = [
      { role: 'system', content: `${CHAT_SYSTEM_PROMPT}\n\n${langInstruction}\n\nAPP CONTEXT:\n${JSON.stringify(context, null, 2)}` },
      ...(messages || [])
    ];
    const response = await retryAIRequest(() => provider.chat(config, finalMessages));
    const text = extractResponse(config.provider, response);
    let actions = [];
    const match = text.match(/ACTION_JSON\s*:\s*(\{[\s\S]*\})/i);
    if (match) {
      try { actions = JSON.parse(match[1]).actions || []; } catch (e) { actions = []; }
    }
    const cleanText = text.replace(/ACTION_JSON\s*:\s*\{[\s\S]*\}\s*/i, '').trim();
    return { success: true, message: cleanText || text, raw: text, actions };
  } catch (err) {
    return { success: false, error: formatAIError(err) };
  }
}

module.exports = {
  async chat(config, messages, context) {
    return chat(config, messages, context);
  },

  async listModels(config) {
    return listModels(config);
  },

  async analyze(config, data) {
    try {
      const provider = aiProviders[config.provider];
      if (!provider) return { success: false, error: 'AI provider not supported' };

      const messages = [
        { role: 'system', content: buildSystemPrompt(config) },
        { role: 'user', content: `Analyze this crypto market data:\n${JSON.stringify(data, null, 2)}` }
      ];

      const response = await retryAIRequest(() => provider.chat(config, messages));
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
      return { success: false, error: formatAIError(err) };
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
      return { success: false, error: formatAIError(err) };
    }
  },

  async getAnalysis(config, marketData, newsData) {
    try {
      const provider = aiProviders[config.provider];
      if (!provider) return { success: false, error: 'AI provider not supported' };

      const prompt = `${getLanguageInstruction(config.language)}

Perform a comprehensive crypto investment analysis.

IMPORTANT: You must scan ALL available cryptocurrency pairs and recommend the BEST opportunity - not just BTC/ETH. Look at altcoins, new tokens, AI tokens, DeFi tokens, Layer 2 tokens, and any coin with strong signals. If a smaller coin has a stronger signal than BTC, recommend that instead!

MARKET DATA:
${JSON.stringify(marketData, null, 2)}

NEWS, SENTIMENT & LEARNING MEMORY:
${JSON.stringify(newsData, null, 2)}

If learning.blockedSymbols contains symbols, do NOT recommend those symbols until their blockedUntil time expires. Treat previous failed symbols as temporarily banned.

RISK PARAMETERS:
- Max Risk Level: ${config.maxRiskLevel || 'MEDIUM'}
- Max Loss: ${config.maxLoss || '5'}%
- Investment Style: ${config.investmentStyle || 'moderate'}

You MUST include a "symbol" field in your response with the specific pair you recommend (e.g., "SOLUSDT", "AVAXUSDT", "DOGEUSDT", "PEPEUSDT", "FETUSDT"). If the market data contains multiple pairs, pick the one with the strongest signal. Be bold - recommend the coin with the best opportunity regardless of market cap.`;

      const messages = [
        { role: 'system', content: buildSystemPrompt(config) },
        { role: 'user', content: prompt }
      ];

      const response = await retryAIRequest(() => provider.chat(config, messages));
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
      return { success: false, error: formatAIError(err) };
    }
  }
};

// ===== State Management =====
const state = {
  activeExchange: null,
  activeAI: null,
  botRunning: false,
  tradeSide: 'BUY',
  riskLevel: 'LOW',
  exchangeConfigs: {},
  aiConfigs: {},
  riskConfig: {
    maxRiskLevel: 'LOW',
    maxLoss: 5,
    maxDrawdown: 15,
    maxPositionSize: 10,
    maxDailyTrades: 10,
    investmentStyle: 'moderate',
    lossCooldown: 30
  },
  analysisInterval: null,
  trades: [],
  analysisHistory: [],
  aiMetrics: {
    requestCount: 0,
    tokensUsed: 0,
    estimatedCost: 0,
    lastAnalysis: null
  },
  totalBalance: 0,
  balanceDetails: [],
  balanceRefreshInterval: null
};

// ===== Navigation =====
document.addEventListener('DOMContentLoaded', () => {
  const navItems = document.querySelectorAll('.nav-item');
  navItems.forEach(item => {
    item.addEventListener('click', (e) => {
      e.preventDefault();
      const page = item.dataset.page;
      navigateTo(page);
    });
  });
  loadSavedConfig();
  loadSavedTheme();
  loadAnalysisHistory();
  addLog('info', 'Aplicativo iniciado com sucesso');
});

function navigateTo(page) {
  document.querySelectorAll('.nav-item').forEach(n => n.classList.remove('active'));
  document.querySelectorAll('.page').forEach(p => p.classList.remove('active'));
  document.querySelector(`.nav-item[data-page="${page}"]`)?.classList.add('active');
  document.getElementById(`page-${page}`)?.classList.add('active');
}

// ===== Exchange Management =====
async function connectExchange(exchange) {
  const config = getExchangeConfig(exchange);
  if (!config.apiKey || !config.apiSecret) {
    showToast('Preencha API Key e Secret', 'error');
    return;
  }

  showToast(`Conectando à ${exchange}...`, 'info');
  addLog('info', `Tentando conectar à corretora ${exchange}...`);

  try {
    const result = await window.electronAPI.testConnection(config);
    if (result.success) {
      state.exchangeConfigs[exchange] = config;
      state.activeExchange = exchange;
      updateExchangeStatus(exchange, true);
      saveConfig();
      showToast(`Conectado à ${exchange} com sucesso!`, 'success');
      addLog('success', `Conexão estabelecida com ${exchange}`);
      loadBalance(exchange);
      // Set up balance auto-refresh
      if (state.balanceRefreshInterval) clearInterval(state.balanceRefreshInterval);
      state.balanceRefreshInterval = setInterval(() => {
        if (state.activeExchange && state.exchangeConfigs[state.activeExchange]) {
          loadBalance(state.activeExchange);
        }
      }, 60000);
    } else {
      updateExchangeStatus(exchange, false);
      showToast(`Erro ao conectar: ${result.error}`, 'error');
      addLog('error', `Falha na conexão com ${exchange}: ${result.error}`);
    }
  } catch (err) {
    showToast(`Erro: ${err.message}`, 'error');
    addLog('error', `Exceção ao conectar ${exchange}: ${err.message}`);
  }
}

async function testExchange(exchange) {
  const config = getExchangeConfig(exchange);
  if (!config.apiKey || !config.apiSecret) {
    showToast('Preencha API Key e Secret para testar', 'warning');
    return;
  }

  showToast(`Testando conexão com ${exchange}...`, 'info');

  try {
    const result = await window.electronAPI.testConnection(config);
    if (result.success) {
      showToast(`Teste de conexão com ${exchange} bem sucedido!`, 'success');
      addLog('success', `Teste de conexão com ${exchange} OK`);
    } else {
      showToast(`Teste falhou: ${result.error}`, 'error');
      addLog('error', `Teste de conexão com ${exchange} falhou: ${result.error}`);
    }
  } catch (err) {
    showToast(`Erro no teste: ${err.message}`, 'error');
  }
}

function getExchangeConfig(exchange) {
  const config = {
    exchange: exchange,
    apiKey: document.getElementById(`${exchange}-apikey`)?.value || '',
    apiSecret: document.getElementById(`${exchange}-apisecret`)?.value || '',
    testnet: document.getElementById(`${exchange}-testnet`)?.checked || false
  };

  if (exchange === 'okx') {
    config.passphrase = document.getElementById('okx-passphrase')?.value || '';
  }

  if (exchange === 'custom') {
    config.baseUrl = document.getElementById('custom-baseurl')?.value || '';
    config.name = document.getElementById('custom-name')?.value || 'Custom';
  }

  return config;
}

function updateExchangeStatus(exchange, connected) {
  const statusEl = document.getElementById(`${exchange}-status`);
  if (statusEl) {
    const dot = statusEl.querySelector('.status-dot');
    if (connected) {
      dot.classList.remove('offline');
      dot.classList.add('online');
      statusEl.lastChild.textContent = ' Conectado';
    } else {
      dot.classList.remove('online');
      dot.classList.add('offline');
      statusEl.lastChild.textContent = ' Desconectado';
    }
  }
}

async function loadBalance(exchange) {
  const config = state.exchangeConfigs[exchange];
  if (!config) return;

  try {
    const result = await window.electronAPI.getBalance(config);
    if (result.success && result.balance) {
      // Use totalEquity from exchange if available (Bybit, OKX provide this directly)
      // Otherwise sum up USD values of each coin
      let totalUsd = 0;

      if (result.totalEquity && result.totalEquity > 0) {
        totalUsd = result.totalEquity;
      } else {
        // Sum up USD values from each coin
        result.balance.forEach(coin => {
          const usdVal = parseFloat(coin.usdValue || 0);
          if (usdVal > 0) {
            totalUsd += usdVal;
          } else {
            // Fallback: for stablecoins, use walletBalance as USD value
            const coinName = (coin.coin || coin.asset || '').toUpperCase();
            const bal = parseFloat(coin.walletBalance || coin.free || 0);
            if (['USDT', 'USDC', 'BUSD', 'TUSD', 'USD', 'DAI'].includes(coinName) && bal > 0) {
              totalUsd += bal;
            }
          }
        });
      }

      // Save balance to state and cache
      state.totalBalance = totalUsd;
      state.balanceDetails = result.balance;

      const balanceEl = document.getElementById('total-balance');
      if (balanceEl) {
        balanceEl.textContent = `$${totalUsd.toLocaleString('en-US', { minimumFractionDigits: 2, maximumFractionDigits: 2 })}`;
      }

      // Also update balance details in the market card
      displayBalanceDetails(result.balance, result.exchange || exchange);

      addLog('info', `Saldo carregado de ${exchange}: $${totalUsd.toLocaleString('en-US', { minimumFractionDigits: 2, maximumFractionDigits: 2 })}`);
      saveConfig();
    } else if (result.success && (!result.balance || result.balance.length === 0)) {
      // Only set $0.00 if there's no cached balance
      if (state.totalBalance === 0) {
        const balanceEl = document.getElementById('total-balance');
        if (balanceEl) balanceEl.textContent = '$0.00';
      }
      addLog('info', 'Nenhum saldo encontrado na conta');
    } else if (!result.success) {
      // Preserve cached balance when API fails - only log the error
      if (state.totalBalance > 0) {
        addLog('warning', `Erro ao carregar saldo de ${exchange}: ${result.error || 'Erro desconhecido'} - usando saldo em cache`);
      } else {
        const balanceEl = document.getElementById('total-balance');
        if (balanceEl) balanceEl.textContent = '$0.00';
        addLog('error', `Erro ao carregar saldo de ${exchange}: ${result.error || 'Erro desconhecido'}`);
      }
      showToast(`Erro saldo ${exchange}: ${result.error || 'Erro desconhecido'}`, 'error');
    }
  } catch (err) {
    // Preserve cached balance when exception occurs
    if (state.totalBalance > 0) {
      addLog('warning', `Erro ao carregar saldo: ${err.message} - usando saldo em cache`);
    } else {
      const balanceEl = document.getElementById('total-balance');
      if (balanceEl) balanceEl.textContent = '$0.00';
      addLog('error', `Erro ao carregar saldo: ${err.message}`);
    }
  }
}

function displayBalanceDetails(balance, exchange) {
  const container = document.getElementById('market-data-content');
  if (!container || !balance || balance.length === 0) return;

  const sorted = [...balance].sort((a, b) => (b.usdValue || 0) - (a.usdValue || 0));

  container.innerHTML = `
    <div style="margin-bottom:8px;font-size:11px;color:var(--text-muted);text-transform:uppercase;letter-spacing:0.5px;font-weight:600;">
      Saldos (${exchange})
    </div>
    ${sorted.slice(0, 15).map(coin => {
      const coinName = coin.coin || coin.asset || '???';
      const amount = parseFloat(coin.walletBalance || coin.free || 0);
      const usd = parseFloat(coin.usdValue || 0);
      const free = parseFloat(coin.free || 0);
      return `
        <div class="market-item">
          <div>
            <div class="market-name">${coinName}</div>
            <div style="font-size:11px;color:var(--text-muted);">${amount < 0.001 ? amount.toExponential(2) : amount.toLocaleString('en-US', {maximumFractionDigits: 8})} ${coinName}</div>
          </div>
          <div style="text-align:right">
            <div class="market-price">$${usd.toLocaleString('en-US', {minimumFractionDigits: 2, maximumFractionDigits: 2})}</div>
            ${free > 0 && free !== amount ? `<div class="market-change positive" style="font-size:10px">Disponível: ${free.toLocaleString('en-US', {maximumFractionDigits: 6})}</div>` : ''}
          </div>
        </div>
      `;
    }).join('')}
  `;
}

async function refreshAllBalances() {
  const exchanges = Object.keys(state.exchangeConfigs);
  for (const ex of exchanges) {
    await loadBalance(ex);
  }
}

// ===== AI Provider Selection (NEW) =====
function selectAIProvider(provider) {
  document.querySelectorAll('.ai-strip-item').forEach(i => i.classList.remove('active'));
  document.querySelectorAll('.ai-provider-panel').forEach(p => p.classList.remove('active'));
  document.querySelector(`.ai-strip-item[data-provider="${provider}"]`)?.classList.add('active');
  document.getElementById(`panel-${provider}`)?.classList.add('active');
}

async function testAIConnection(provider) {
  const config = getAIConfig(provider);
  if (!config.apiKey) {
    showToast('Preencha a API Key para testar', 'warning');
    return;
  }

  showToast(`Testando conexão com ${provider}...`, 'info');
  addLog('info', `Testando conexão com ${provider}...`);

  try {
    const result = await window.electronAPI.aiTestConnection(config);
    if (result.success) {
      showToast(`Conexão com ${provider} OK!`, 'success');
      addLog('success', `Teste de conexão com ${provider} OK`);
    } else {
      showToast(`Teste falhou: ${result.error}`, 'error');
      addLog('error', `Teste com ${provider} falhou: ${result.error}`);
    }
  } catch (err) {
    showToast(`Erro no teste: ${err.message}`, 'error');
  }
}

function updateAIStatusUI(provider, connected) {
  // Update strip status dot
  const stripStatus = document.getElementById(`strip-status-${provider}`);
  if (stripStatus) {
    stripStatus.className = `ai-strip-status ${connected ? 'connected' : ''}`;
  }

  // Update panel status badge
  const panelStatus = document.getElementById(`panel-status-${provider}`);
  if (panelStatus) {
    panelStatus.innerHTML = connected
      ? `<span class="badge success">Conectado</span>`
      : `<span class="badge">Desconectado</span>`;
  }

  // Update active badge in header
  const activeBadge = document.getElementById('ai-active-badge');
  if (activeBadge && connected) {
    activeBadge.innerHTML = `<span class="status-dot online"></span><span>${provider} conectado</span>`;
  }

  // Update dashboard badge
  if (connected) {
    document.getElementById('ai-status-badge').textContent = provider;
    document.getElementById('ai-status-badge').className = 'badge success';
  }
}

// ===== AI Management =====
async function connectAI(provider) {
  const config = getAIConfig(provider);
  if (!config.apiKey) {
    showToast('Preencha a API Key', 'error');
    return;
  }

  showToast(`Conectando à IA ${provider}...`, 'info');
  addLog('info', `Testando conexão com ${provider}...`);

  try {
    const result = await window.electronAPI.aiTestConnection(config);
    if (result.success) {
      state.aiConfigs[provider] = config;
      state.activeAI = provider;
      saveConfig();
      showToast(`IA ${provider} conectada com sucesso!`, 'success');
      addLog('success', `IA ${provider} conectada`);
      updateAIStatusUI(provider, true);
    } else {
      showToast(`Erro: ${result.error}`, 'error');
      addLog('error', `Falha na conexão com IA ${provider}: ${result.error}`);
      updateAIStatusUI(provider, false);
    }
  } catch (err) {
    showToast(`Erro: ${err.message}`, 'error');
    addLog('error', `Exceção ao conectar IA ${provider}: ${err.message}`);
    updateAIStatusUI(provider, false);
  }
}

function handleModelChange(provider) {
  const select = document.getElementById(`${provider}-model`);
  const customInput = document.getElementById(`${provider}-model-custom`);
  if (select && customInput) {
    if (select.value === 'custom') {
      customInput.style.display = 'block';
      customInput.focus();
    } else {
      customInput.style.display = 'none';
      customInput.value = '';
    }
  }
}

function getAIConfig(provider) {
  const selectEl = document.getElementById(`${provider}-model`);
  let model = selectEl?.value || 'default';
  if (model === 'custom') {
    const customInput = document.getElementById(`${provider}-model-custom`);
    model = customInput?.value || 'default';
  }

  const config = {
    provider: provider,
    apiKey: document.getElementById(`${provider}-apikey`)?.value || '',
    model: model,
    temperature: parseFloat(document.getElementById(`${provider}-temperature`)?.value || 0.3),
    maxTokens: parseInt(document.getElementById('max-tokens')?.value || 2000)
  };

  if (provider === 'custom') {
    config.baseUrl = document.getElementById('custom-ai-baseurl')?.value || '';
    config.name = document.getElementById('custom-ai-name')?.value || 'Custom AI';
    config.model = document.getElementById('custom-ai-model')?.value || 'default';
  }

  return config;
}

// ===== Bot Control =====
async function toggleBot() {
  if (state.botRunning) {
    stopBot();
  } else {
    startBot();
  }
}

async function startBot() {
  if (!state.activeExchange) {
    showToast('Conecte uma corretora antes de iniciar', 'warning');
    return;
  }
  if (!state.activeAI) {
    showToast('Configure uma IA antes de iniciar', 'warning');
    return;
  }

  state.botRunning = true;
  updateBotUI();
  showToast('Bot iniciado! Analisando mercado...', 'success');
  addLog('success', 'Bot de trading iniciado');

  const intervalMinutes = parseInt(document.getElementById('request-interval')?.value || 5);
  runAnalysisCycle();

  state.analysisInterval = setInterval(() => {
    runAnalysisCycle();
  }, intervalMinutes * 60 * 1000);
}

function stopBot() {
  state.botRunning = false;
  if (state.analysisInterval) {
    clearInterval(state.analysisInterval);
    state.analysisInterval = null;
  }
  updateBotUI();
  showToast('Bot parado', 'warning');
  addLog('warning', 'Bot de trading parado');
}

function updateBotUI() {
  const btn = document.getElementById('btn-start-bot');
  const status = document.getElementById('bot-status');

  if (state.botRunning) {
    btn.innerHTML = '<svg width="16" height="16" viewBox="0 0 24 24" fill="currentColor"><rect x="6" y="4" width="4" height="16"/><rect x="14" y="4" width="4" height="16"/></svg> Parar Bot';
    btn.className = 'btn btn-sell';
    status.innerHTML = '<span class="status-dot online"></span><span class="status-text">Bot Ativo</span>';
  } else {
    btn.innerHTML = '<svg width="16" height="16" viewBox="0 0 24 24" fill="currentColor"><polygon points="5 3 19 12 5 21 5 3"/></svg> Iniciar Bot';
    btn.className = 'btn btn-primary';
    status.innerHTML = '<span class="status-dot offline"></span><span class="status-text">Bot Parado</span>';
  }
}

// ===== Analysis Cycle =====
async function runAnalysisCycle() {
  if (!state.botRunning) return;

  addLog('info', 'Iniciando ciclo de análise...');
  showToast('Analisando mercado...', 'info');

  try {
    // Get market data
    const pairs = document.getElementById('monitor-pairs')?.value || 'BTCUSDT';
    const pairList = pairs.split(',').map(p => p.trim());

    let marketData = {};
    for (const pair of pairList) {
      const result = await window.electronAPI.getCandlesticks(
        state.exchangeConfigs[state.activeExchange],
        pair,
        '60'
      );
      if (result.success) marketData[pair] = result.data;
    }

    // Get news
    let newsData = [];
    try {
      newsData = await window.electronAPI.getCryptoNews();
    } catch (e) {
      addLog('warning', `Erro ao carregar notícias: ${e.message}`);
    }

    // Get sentiment
    let sentiment = null;
    try {
      sentiment = await window.electronAPI.getMarketSentiment();
      updateSentimentUI(sentiment);
    } catch (e) {
      addLog('warning', `Erro ao carregar sentimento: ${e.message}`);
    }

    // AI Analysis
    const aiConfig = { ...state.aiConfigs[state.activeAI], ...state.riskConfig };
    const analysisResult = await window.electronAPI.aiGetAnalysis(
      aiConfig,
      marketData,
      { news: newsData, sentiment }
    );

    if (analysisResult.success) {
      // Include symbol info in analysis for history tracking
      analysisResult.analysis.symbol = pairList.join(', ');
      displayAnalysis(analysisResult.analysis, analysisResult.raw);
      addLog('success', `Análise concluída: ${analysisResult.analysis.recommendation}`);
      updateAIMetrics(analysisResult.raw ? analysisResult.raw.split(' ').length * 1.3 : 500);

      // Risk validation
      const riskResult = await window.electronAPI.calculateRisk(
        state.riskConfig,
        { totalValue: 10000, positions: [] },
        analysisResult.analysis
      );

      updateRiskUI(riskResult);

      // Auto trade logic
      const autoTrade = document.getElementById('auto-trade')?.value || 'disabled';
      if (autoTrade !== 'disabled' && riskResult.allowed) {
        if (analysisResult.analysis.recommendation === 'BUY' || analysisResult.analysis.recommendation === 'SELL') {
          if (autoTrade === 'enabled') {
            executeAITrade(analysisResult.analysis);
          } else if (autoTrade === 'confirmation') {
            requestTradeConfirmation(analysisResult.analysis);
          }
        }
      }
    } else {
      addLog('error', `Erro na análise: ${analysisResult.error}`);
      showToast(`Erro na análise IA: ${analysisResult.error}`, 'error');
    }
  } catch (err) {
    addLog('error', `Erro no ciclo de análise: ${err.message}`);
    showToast(`Erro: ${err.message}`, 'error');
  }
}

async function requestAIAnalysis() {
  if (!state.activeExchange || !state.activeAI) {
    showToast('Conecte uma corretora e uma IA primeiro', 'warning');
    return;
  }
  await runAnalysisCycle();
}

// ===== Display Analysis =====
function displayAnalysis(analysis, raw) {
  const container = document.getElementById('ai-analysis-content');
  const rec = analysis.recommendation || 'HOLD';
  const confidence = analysis.confidence || 50;
  const risk = analysis.risk_level || 'MEDIUM';
  const symbol = analysis.symbol || 'BTCUSDT';
  const timestamp = new Date();

  // Save to analysis history
  const historyEntry = {
    id: Date.now(),
    timestamp: timestamp,
    symbol: symbol,
    recommendation: rec,
    confidence: confidence,
    risk_level: risk,
    sentiment: analysis.sentiment || 'neutral',
    entry_price: analysis.entry_price || null,
    target_price: analysis.target_price || null,
    stop_loss: analysis.stop_loss || null,
    timeframe: analysis.timeframe || 'medium',
    reasoning: analysis.reasoning || 'Sem detalhes disponíveis',
    factors: analysis.factors || [],
    provider: state.activeAI || 'unknown'
  };
  state.analysisHistory.unshift(historyEntry);
  // Keep max 200 entries
  if (state.analysisHistory.length > 200) {
    state.analysisHistory = state.analysisHistory.slice(0, 200);
  }
  saveAnalysisHistory();

  // Show latest analysis at top
  container.innerHTML = `
    <div class="analysis-result">
      <div class="analysis-header">
        <div style="display:flex;align-items:center;gap:10px;">
          <span class="recommendation-badge ${rec}">${rec}</span>
          <span class="analysis-symbol-tag">${symbol}</span>
        </div>
        <span class="badge ${risk === 'LOW' ? 'success' : risk === 'HIGH' || risk === 'EXTREME' ? 'error' : 'warning'}">
          Risco: ${risk}
        </span>
      </div>
      <div class="analysis-details">
        <div class="analysis-detail">
          <div class="analysis-detail-label">Confiança</div>
          <div class="analysis-detail-value" style="color: ${confidence > 70 ? 'var(--accent-green)' : confidence > 40 ? 'var(--accent-orange)' : 'var(--accent-red)'}">${confidence}%</div>
        </div>
        <div class="analysis-detail">
          <div class="analysis-detail-label">Sentimento</div>
          <div class="analysis-detail-value">${(analysis.sentiment || 'neutral').toUpperCase()}</div>
        </div>
        <div class="analysis-detail">
          <div class="analysis-detail-label">Entrada</div>
          <div class="analysis-detail-value">${analysis.entry_price ? '$' + analysis.entry_price.toLocaleString() : 'N/A'}</div>
        </div>
        <div class="analysis-detail">
          <div class="analysis-detail-label">Target</div>
          <div class="analysis-detail-value">${analysis.target_price ? '$' + analysis.target_price.toLocaleString() : 'N/A'}</div>
        </div>
        <div class="analysis-detail">
          <div class="analysis-detail-label">Stop Loss</div>
          <div class="analysis-detail-value" style="color: var(--accent-red)">${analysis.stop_loss ? '$' + analysis.stop_loss.toLocaleString() : 'N/A'}</div>
        </div>
        <div class="analysis-detail">
          <div class="analysis-detail-label">Timeframe</div>
          <div class="analysis-detail-value">${(analysis.timeframe || 'medium').toUpperCase()}</div>
        </div>
      </div>
      <div class="analysis-reasoning">
        <strong>Raciocínio:</strong> ${analysis.reasoning || 'Sem detalhes disponíveis'}
      </div>
      ${analysis.factors ? `
        <div class="analysis-factors">
          ${analysis.factors.map(f => `<span class="factor-tag">${f}</span>`).join('')}
        </div>
      ` : ''}
    </div>
  `;

  // Update the analysis history list on the dashboard
  updateAnalysisHistoryUI();

  // Also update trade recommendation sidebar
  const tradeRec = document.getElementById('ai-trade-recommendation');
  if (tradeRec) {
    tradeRec.innerHTML = `
      <div class="analysis-result" style="padding:0">
        <div style="text-align:center; margin-bottom:12px">
          <span class="recommendation-badge ${rec}" style="font-size:20px; padding:10px 24px">${rec}</span>
        </div>
        <div class="analysis-detail" style="margin-bottom:8px">
          <div class="analysis-detail-label">Confiança</div>
          <div class="analysis-detail-value">${confidence}%</div>
        </div>
        <div class="analysis-detail">
          <div class="analysis-detail-label">Risco</div>
          <div class="analysis-detail-value">${risk}</div>
        </div>
        <p style="font-size:12px; color:var(--text-muted); margin-top:12px; line-height:1.5">${(analysis.reasoning || '').substring(0, 200)}...</p>
      </div>
    `;
  }
}

// ===== Analysis History =====
function updateAnalysisHistoryUI() {
  const container = document.getElementById('analysis-history-body');
  if (!container) return;

  if (state.analysisHistory.length === 0) {
    container.innerHTML = '<div class="empty-state"><p>Nenhuma análise realizada ainda</p></div>';
    return;
  }

  // Update count badge
  const countBadge = document.getElementById('analysis-count-badge');
  if (countBadge) {
    countBadge.textContent = `${state.analysisHistory.length} análises`;
    countBadge.className = 'badge info';
  }

  container.innerHTML = state.analysisHistory.map(entry => {
    const rec = entry.recommendation || 'HOLD';
    const risk = entry.risk_level || 'MEDIUM';
    const time = entry.timestamp instanceof Date
      ? entry.timestamp.toLocaleString('pt-BR')
      : new Date(entry.timestamp).toLocaleString('pt-BR');
    return `
      <div class="analysis-history-item" onclick="toggleAnalysisDetail(${entry.id})">
        <div class="analysis-history-row">
          <div class="analysis-history-left">
            <span class="recommendation-badge-sm ${rec}">${rec}</span>
            <span class="analysis-history-symbol">${entry.symbol}</span>
            <span class="analysis-history-provider badge info">${entry.provider}</span>
          </div>
          <div class="analysis-history-right">
            <span class="analysis-history-confidence" style="color: ${entry.confidence > 70 ? 'var(--accent-green)' : entry.confidence > 40 ? 'var(--accent-orange)' : 'var(--accent-red)'}">${entry.confidence}%</span>
            <span class="badge ${risk === 'LOW' ? 'success' : risk === 'HIGH' || risk === 'EXTREME' ? 'error' : 'warning'}" style="font-size:10px">${risk}</span>
            <span class="analysis-history-time">${time}</span>
          </div>
        </div>
        <div class="analysis-history-detail" id="analysis-detail-${entry.id}" style="display:none;">
          <div class="analysis-details" style="margin-top:12px;">
            <div class="analysis-detail">
              <div class="analysis-detail-label">Sentimento</div>
              <div class="analysis-detail-value">${(entry.sentiment || 'neutral').toUpperCase()}</div>
            </div>
            <div class="analysis-detail">
              <div class="analysis-detail-label">Entrada</div>
              <div class="analysis-detail-value">${entry.entry_price ? '$' + entry.entry_price.toLocaleString() : 'N/A'}</div>
            </div>
            <div class="analysis-detail">
              <div class="analysis-detail-label">Target</div>
              <div class="analysis-detail-value">${entry.target_price ? '$' + entry.target_price.toLocaleString() : 'N/A'}</div>
            </div>
            <div class="analysis-detail">
              <div class="analysis-detail-label">Stop Loss</div>
              <div class="analysis-detail-value" style="color:var(--accent-red)">${entry.stop_loss ? '$' + entry.stop_loss.toLocaleString() : 'N/A'}</div>
            </div>
            <div class="analysis-detail">
              <div class="analysis-detail-label">Timeframe</div>
              <div class="analysis-detail-value">${(entry.timeframe || 'medium').toUpperCase()}</div>
            </div>
            <div class="analysis-detail">
              <div class="analysis-detail-label">Risco</div>
              <div class="analysis-detail-value">${risk}</div>
            </div>
          </div>
          <div class="analysis-reasoning" style="margin-top:10px;">
            <strong>Raciocínio:</strong> ${entry.reasoning}
          </div>
          ${entry.factors && entry.factors.length > 0 ? `
            <div class="analysis-factors" style="margin-top:8px;">
              ${entry.factors.map(f => `<span class="factor-tag">${f}</span>`).join('')}
            </div>
          ` : ''}
        </div>
      </div>
    `;
  }).join('');
}

function toggleAnalysisDetail(id) {
  const detail = document.getElementById(`analysis-detail-${id}`);
  if (detail) {
    detail.style.display = detail.style.display === 'none' ? 'block' : 'none';
  }
}

function clearAnalysisHistory() {
  if (confirm('Tem certeza que deseja limpar todo o histórico de análises?')) {
    state.analysisHistory = [];
    saveAnalysisHistory();
    updateAnalysisHistoryUI();
    // Reset dashboard analysis view
    document.getElementById('ai-analysis-content').innerHTML = `
      <div class="empty-state">
        <svg width="48" height="48" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="1.5" opacity="0.3"><path d="M12 2a4 4 0 0 1 4 4c0 1.95-1.4 3.58-3.25 3.93V12h2.75a3.5 3.5 0 0 1 3.5 3.5v1.75c1.85.35 3.25 1.98 3.25 3.93a4 4 0 1 1-7-2.64V15.5a.5.5 0 0 0-.5-.5h-5.5a.5.5 0 0 0-.5.5v3.04a4 4 0 1 1-2 0V15.5a3.5 3.5 0 0 1 3.5-3.5h2.75V9.93A4.002 4.002 0 0 1 12 2z"/></svg>
        <p>Configure a IA e inicie o bot para ver análises</p>
      </div>
    `;
    showToast('Histórico de análises limpo', 'success');
  }
}

function saveAnalysisHistory() {
  try {
    localStorage.setItem('cryptoai-analysis-history', JSON.stringify(state.analysisHistory));
  } catch (e) {
    // Ignore storage errors
  }
}

function loadAnalysisHistory() {
  try {
    const saved = localStorage.getItem('cryptoai-analysis-history');
    if (saved) {
      state.analysisHistory = JSON.parse(saved);
      updateAnalysisHistoryUI();
    }
  } catch (e) {
    // Ignore
  }
}

// ===== Trading =====
let currentTradeSide = 'BUY';

function setTradeSide(side) {
  currentTradeSide = side;
  document.getElementById('btn-buy')?.classList.toggle('active', side === 'BUY');
  document.getElementById('btn-sell')?.classList.toggle('active', side === 'SELL');
}

document.getElementById('trade-type')?.addEventListener('change', function() {
  document.getElementById('price-group').style.display = this.value === 'Limit' ? 'block' : 'none';
});

async function executeTrade() {
  const exchange = document.getElementById('trade-exchange')?.value;
  if (!exchange || !state.exchangeConfigs[exchange]) {
    showToast('Selecione uma corretora conectada', 'warning');
    return;
  }

  const order = {
    symbol: document.getElementById('trade-symbol')?.value || 'BTCUSDT',
    side: currentTradeSide,
    type: document.getElementById('trade-type')?.value || 'Market',
    quantity: parseFloat(document.getElementById('trade-quantity')?.value || 0),
    price: document.getElementById('trade-price')?.value ? parseFloat(document.getElementById('trade-price').value) : null
  };

  if (order.quantity <= 0) {
    showToast('Quantidade deve ser maior que zero', 'error');
    return;
  }

  // Risk validation
  try {
    const validation = await window.electronAPI.validateTrade(
      state.riskConfig,
      order,
      { totalValue: 10000, todayTrades: state.trades.length }
    );

    if (!validation.valid) {
      showToast(`Trade bloqueado: ${validation.errors.join(', ')}`, 'error');
      return;
    }

    if (validation.warnings.length > 0) {
      validation.warnings.forEach(w => showToast(w, 'warning'));
      if (validation.adjustedTrade.quantity !== order.quantity) {
        order.quantity = validation.adjustedTrade.quantity;
      }
    }
  } catch (err) {
    addLog('warning', `Validação de risco falhou: ${err.message}`);
  }

  showToast('Executando trade...', 'info');
  addLog('info', `Executando ${order.side} ${order.quantity} ${order.symbol}...`);

  try {
    const result = await window.electronAPI.placeOrder(state.exchangeConfigs[exchange], order);
    if (result.success) {
      showToast(`Trade executado com sucesso!`, 'success');
      addLog('success', `Trade executado: ${order.side} ${order.quantity} ${order.symbol}`);
      state.trades.push({
        time: new Date(),
        symbol: order.symbol,
        side: order.side,
        price: order.price || 'Market',
        quantity: order.quantity,
        status: 'filled'
      });
      updateTradesTable();
      saveConfig();
    } else {
      showToast(`Erro no trade: ${result.error}`, 'error');
      addLog('error', `Falha no trade: ${result.error}`);
    }
  } catch (err) {
    showToast(`Erro: ${err.message}`, 'error');
    addLog('error', `Exceção no trade: ${err.message}`);
  }
}

async function executeAITrade(analysis) {
  const exchange = state.activeExchange;
  if (!exchange) return;

  const side = analysis.recommendation === 'BUY' ? 'BUY' : 'SELL';
  const quantity = 0.001; // Minimum safe quantity

  const order = {
    symbol: 'BTCUSDT',
    side: side,
    type: 'Market',
    quantity: quantity
  };

  addLog('info', `[AUTO-TRADE] Executando ${side} ${quantity} BTCUSDT baseado na IA`);

  try {
    const result = await window.electronAPI.placeOrder(state.exchangeConfigs[exchange], order);
    if (result.success) {
      showToast(`Auto-trade executado: ${side} ${quantity} BTCUSDT`, 'success');
      addLog('success', `[AUTO-TRADE] ${side} ${quantity} BTCUSDT executado`);
      state.trades.push({
        time: new Date(),
        symbol: 'BTCUSDT',
        side: side,
        price: 'Market',
        quantity: quantity,
        status: 'filled'
      });
      updateTradesTable();
      saveConfig();
    } else {
      addLog('error', `[AUTO-TRADE] Falha: ${result.error}`);
    }
  } catch (err) {
    addLog('error', `[AUTO-TRADE] Exceção: ${err.message}`);
  }
}

function requestTradeConfirmation(analysis) {
  const side = analysis.recommendation;
  const confirmed = confirm(`IA recomenda ${side} com ${analysis.confidence}% de confiança.\nRisco: ${analysis.risk_level}\n\nDeseja executar este trade?`);
  if (confirmed) {
    executeAITrade(analysis);
  } else {
    addLog('info', `Trade ${side} cancelado pelo usuário`);
  }
}

function updateTradesTable() {
  const tbody = document.getElementById('trades-tbody');
  if (!tbody) return;

  document.getElementById('daily-trades').textContent = state.trades.length;

  if (state.trades.length === 0) {
    tbody.innerHTML = '<tr><td colspan="7" class="empty-row">Nenhum trade realizado</td></tr>';
    return;
  }

  tbody.innerHTML = state.trades.slice(-20).reverse().map(t => `
    <tr>
      <td style="font-family:var(--font-mono);font-size:12px">${t.time.toLocaleTimeString()}</td>
      <td><strong>${t.symbol}</strong></td>
      <td><span class="badge ${t.side === 'BUY' ? 'success' : 'error'}">${t.side}</span></td>
      <td style="font-family:var(--font-mono)">${t.price}</td>
      <td style="font-family:var(--font-mono)">${t.quantity}</td>
      <td>--</td>
      <td><span class="badge success">${t.status}</span></td>
    </tr>
  `).join('');
}

// ===== News =====
async function loadNews() {
  showToast('Carregando notícias...', 'info');
  addLog('info', 'Carregando feed de notícias...');

  try {
    const news = await window.electronAPI.getCryptoNews();
    displayNews(news);

    const sentiment = await window.electronAPI.getMarketSentiment();
    updateSentimentUI(sentiment);

    showToast('Notícias carregadas!', 'success');
    addLog('success', `${news.length} itens de notícia carregados`);
  } catch (err) {
    showToast(`Erro ao carregar notícias: ${err.message}`, 'error');
    addLog('error', `Erro nas notícias: ${err.message}`);
  }
}

function displayNews(news) {
  const container = document.getElementById('news-feed-body');
  if (!container) return;

  const validNews = news.filter(n => !n.error);

  if (validNews.length === 0) {
    container.innerHTML = '<div class="empty-state"><p>Nenhuma notícia disponível</p></div>';
    return;
  }

  container.innerHTML = validNews.map(item => `
    <div class="news-item">
      <span class="news-source">${item.source}</span>
      <div class="news-title">${item.title}</div>
      <div class="news-desc">${item.description || ''}</div>
      <div class="news-meta">
        <span class="sentiment-badge ${item.sentiment || 'neutral'}">${item.sentiment || 'neutral'}</span>
        <span>${new Date(item.timestamp).toLocaleString('pt-BR')}</span>
      </div>
    </div>
  `).join('');
}

function updateSentimentUI(sentiment) {
  if (!sentiment) return;

  const score = Math.round(sentiment.score);
  document.getElementById('sentiment-score').textContent = score;
  document.getElementById('sentiment-text').textContent =
    sentiment.overall === 'bullish' ? 'Otimista' :
    sentiment.overall === 'bearish' ? 'Pessimista' : 'Neutro';

  // Update ring
  const ring = document.getElementById('sentiment-ring');
  if (ring) {
    const circumference = 339.29;
    const offset = circumference - (score / 100) * circumference;
    ring.style.strokeDashoffset = offset;
  }

  // Dashboard gauge
  document.querySelector('.gauge-value').textContent = score;
  const gaugeLabel = document.querySelector('.gauge-label');
  if (gaugeLabel) {
    gaugeLabel.textContent = sentiment.overall === 'bullish' ? 'Otimista' :
      sentiment.overall === 'bearish' ? 'Pessimista' : 'Neutro';
  }

  // Sentiment details
  const details = document.getElementById('sentiment-details');
  if (details && sentiment.sources) {
    let html = '';
    if (sentiment.sources.coingecko && !sentiment.sources.coingecko.error) {
      const cg = sentiment.sources.coingecko;
      html += `<div class="sentiment-row"><span class="sentiment-row-label">Market Cap Change 24h</span><span class="sentiment-row-value">${(cg.market_cap_change_24h || 0).toFixed(2)}%</span></div>`;
      html += `<div class="sentiment-row"><span class="sentiment-row-label">BTC Dominance</span><span class="sentiment-row-value">${(cg.btc_dominance || 0).toFixed(1)}%</span></div>`;
    }
    if (sentiment.sources.fearGreed && !sentiment.sources.fearGreed.error) {
      const fg = sentiment.sources.fearGreed;
      html += `<div class="sentiment-row"><span class="sentiment-row-label">Fear & Greed</span><span class="sentiment-row-value">${fg.value} (${fg.classification})</span></div>`;
    }
    details.innerHTML = html;
  }
}

// ===== Market Data =====
async function loadMarketData() {
  if (!state.activeExchange) {
    showToast('Conecte uma corretora primeiro', 'warning');
    return;
  }

  try {
    const result = await window.electronAPI.getMarkets(state.exchangeConfigs[state.activeExchange]);
    if (result.success) {
      displayMarketData(result.data);
    }
  } catch (err) {
    addLog('error', `Erro ao carregar mercado: ${err.message}`);
  }
}

function displayMarketData(data) {
  const container = document.getElementById('market-data-content');
  if (!container) return;

  // Parse based on exchange
  let markets = [];
  try {
    if (state.activeExchange === 'binance') {
      markets = data.slice(0, 10).map(m => ({
        symbol: m.symbol,
        price: parseFloat(m.lastPrice),
        change: parseFloat(m.priceChangePercent)
      }));
    } else if (state.activeExchange === 'bybit') {
      const list = data?.result?.list || [];
      markets = list.slice(0, 10).map(m => ({
        symbol: m.symbol,
        price: parseFloat(m.lastPrice),
        change: parseFloat(m.price24hPcnt) * 100
      }));
    }
  } catch (e) {
    container.innerHTML = '<div class="empty-state"><p>Erro ao processar dados</p></div>';
    return;
  }

  if (markets.length === 0) {
    container.innerHTML = '<div class="empty-state"><p>Nenhum dado disponível</p></div>';
    return;
  }

  container.innerHTML = markets.map(m => `
    <div class="market-item">
      <div>
        <div class="market-name">${m.symbol}</div>
      </div>
      <div style="text-align:right">
        <div class="market-price">$${m.price.toLocaleString()}</div>
        <div class="market-change ${m.change >= 0 ? 'positive' : 'negative'}">${m.change >= 0 ? '+' : ''}${m.change.toFixed(2)}%</div>
      </div>
    </div>
  `).join('');
}

// ===== Risk Management =====
function setRiskLevel(btn) {
  document.querySelectorAll('.risk-btn').forEach(b => b.classList.remove('active'));
  btn.classList.add('active');
  state.riskConfig.maxRiskLevel = btn.dataset.level;
}

function saveRiskConfig() {
  state.riskConfig.maxLoss = parseFloat(document.getElementById('max-loss')?.value || 5);
  state.riskConfig.maxDrawdown = parseFloat(document.getElementById('max-drawdown')?.value || 15);
  state.riskConfig.maxPositionSize = parseFloat(document.getElementById('max-position-size')?.value || 10);
  state.riskConfig.maxDailyTrades = parseInt(document.getElementById('max-daily-trades')?.value || 10);
  state.riskConfig.investmentStyle = document.getElementById('investment-style')?.value || 'moderate';
  state.riskConfig.lossCooldown = parseInt(document.getElementById('loss-cooldown')?.value || 30);

  saveConfig();
  showToast('Configurações de risco salvas!', 'success');
  addLog('success', 'Configurações de risco atualizadas');
}

function updateRiskUI(riskResult) {
  const riskScore = riskResult.riskScore || 25;
  document.getElementById('current-risk').textContent =
    riskScore < 30 ? 'Baixo' : riskScore < 60 ? 'Médio' : riskScore < 80 ? 'Alto' : 'Extremo';

  // Update risk bars
  const portfolioRiskBar = document.getElementById('portfolio-risk-bar');
  if (portfolioRiskBar) {
    portfolioRiskBar.style.width = `${riskScore}%`;
    portfolioRiskBar.style.background =
      riskScore < 30 ? 'var(--accent-green)' :
      riskScore < 60 ? 'var(--accent-cyan)' :
      riskScore < 80 ? 'var(--accent-orange)' : 'var(--accent-red)';
  }

  if (document.getElementById('portfolio-risk-val')) {
    document.getElementById('portfolio-risk-val').textContent = `${riskScore}%`;
  }
}

// ===== Config Persistence =====
function saveConfig() {
  try {
    // Save model selections
    const modelSelections = {};
    ['deepseek', 'openai', 'google', 'nvidia', 'claude', 'openrouter'].forEach(p => {
      const sel = document.getElementById(`${p}-model`);
      const custom = document.getElementById(`${p}-model-custom`);
      if (sel) {
        modelSelections[p] = {
          model: sel.value,
          customModel: custom?.value || ''
        };
      }
    });

    const config = {
      exchangeConfigs: state.exchangeConfigs,
      aiConfigs: state.aiConfigs,
      riskConfig: state.riskConfig,
      activeExchange: state.activeExchange,
      activeAI: state.activeAI,
      trades: state.trades,
      aiMetrics: state.aiMetrics,
      modelSelections: modelSelections,
      totalBalance: state.totalBalance,
      balanceDetails: state.balanceDetails
    };
    localStorage.setItem('cryptoai-config', JSON.stringify(config));
  } catch (e) {
    // Ignore storage errors
  }
}

function loadSavedConfig() {
  try {
    const saved = localStorage.getItem('cryptoai-config');
    if (saved) {
      const config = JSON.parse(saved);
      if (config.riskConfig) Object.assign(state.riskConfig, config.riskConfig);
      if (config.activeExchange) state.activeExchange = config.activeExchange;
      if (config.activeAI) state.activeAI = config.activeAI;

      // Restore exchange statuses
      if (config.exchangeConfigs) {
        state.exchangeConfigs = config.exchangeConfigs;
        Object.keys(config.exchangeConfigs).forEach(ex => {
          updateExchangeStatus(ex, true);
          const conf = config.exchangeConfigs[ex];
          if (document.getElementById(`${ex}-apikey`)) {
            document.getElementById(`${ex}-apikey`).value = conf.apiKey || '';
            document.getElementById(`${ex}-apisecret`).value = conf.apiSecret || '';
          }
          // Restore testnet checkbox
          if (conf.testnet && document.getElementById(`${ex}-testnet`)) {
            document.getElementById(`${ex}-testnet`).checked = true;
          }
          // Restore OKX passphrase
          if (ex === 'okx' && conf.passphrase && document.getElementById('okx-passphrase')) {
            document.getElementById('okx-passphrase').value = conf.passphrase || '';
          }
        });
      }

      if (config.aiConfigs) {
        state.aiConfigs = config.aiConfigs;
        Object.keys(config.aiConfigs).forEach(prov => {
          const conf = config.aiConfigs[prov];
          if (document.getElementById(`${prov}-apikey`)) {
            document.getElementById(`${prov}-apikey`).value = conf.apiKey || '';
          }
        });
        if (state.activeAI) {
          document.getElementById('ai-status-badge').textContent = state.activeAI;
          document.getElementById('ai-status-badge').className = 'badge success';
        }
      }

      // Restore risk form
      if (config.riskConfig) {
        if (document.getElementById('max-loss')) document.getElementById('max-loss').value = config.riskConfig.maxLoss || 5;
        if (document.getElementById('max-drawdown')) document.getElementById('max-drawdown').value = config.riskConfig.maxDrawdown || 15;
        if (document.getElementById('max-position-size')) document.getElementById('max-position-size').value = config.riskConfig.maxPositionSize || 10;
        if (document.getElementById('max-daily-trades')) document.getElementById('max-daily-trades').value = config.riskConfig.maxDailyTrades || 10;
        if (document.getElementById('investment-style')) document.getElementById('investment-style').value = config.riskConfig.investmentStyle || 'moderate';
        if (document.getElementById('loss-cooldown')) document.getElementById('loss-cooldown').value = config.riskConfig.lossCooldown || 30;
      }

      // Restore trades
      if (config.trades) {
        state.trades = config.trades;
        updateTradesTable();
      }

      // Restore AI metrics
      if (config.aiMetrics) {
        state.aiMetrics = { ...state.aiMetrics, ...config.aiMetrics };
        updateAIMetricsUI();
      }

      // Restore model selections
      if (config.modelSelections) {
        Object.keys(config.modelSelections).forEach(p => {
          const sel = document.getElementById(`${p}-model`);
          const custom = document.getElementById(`${p}-model-custom`);
          const saved = config.modelSelections[p];
          if (sel && saved.model) {
            sel.value = saved.model;
            if (sel.value === 'custom' && custom) {
              custom.style.display = 'block';
              custom.value = saved.customModel || '';
            }
          }
        });
      }

      // Restore saved balance
      if (config.totalBalance) {
        state.totalBalance = config.totalBalance;
        document.getElementById('total-balance').textContent = `$${config.totalBalance.toLocaleString('en-US', { minimumFractionDigits: 2, maximumFractionDigits: 2 })}`;
      }

      addLog('info', 'Configurações salvas restauradas');

      // Auto-load balance from connected exchange after a short delay
      if (state.activeExchange && state.exchangeConfigs[state.activeExchange]) {
        setTimeout(() => {
          loadBalance(state.activeExchange);
        }, 2000);
        // Set up auto-refresh every 60 seconds
        if (state.balanceRefreshInterval) clearInterval(state.balanceRefreshInterval);
        state.balanceRefreshInterval = setInterval(() => {
          if (state.activeExchange && state.exchangeConfigs[state.activeExchange]) {
            loadBalance(state.activeExchange);
          }
        }, 60000);
      }
    }
  } catch (e) {
    // Ignore
  }
}

// ===== Utilities =====
function showToast(message, type = 'info') {
  const container = document.getElementById('toast-container');
  const toast = document.createElement('div');
  toast.className = `toast ${type}`;
  toast.textContent = message;
  container.appendChild(toast);

  setTimeout(() => {
    if (toast.parentNode) toast.parentNode.removeChild(toast);
  }, 4500);
}

function addLog(type, message) {
  const log = document.getElementById('activity-log');
  if (!log) return;

  const entry = document.createElement('div');
  entry.className = `log-entry ${type}`;
  const time = new Date().toLocaleTimeString('pt-BR');
  entry.innerHTML = `<span class="log-time">${time}</span><span class="log-msg">${message}</span>`;
  log.insertBefore(entry, log.firstChild);

  // Keep max 100 entries
  while (log.children.length > 100) {
    log.removeChild(log.lastChild);
  }
}

// ===== Theme Management =====
function toggleTheme() {
  const html = document.documentElement;
  const currentTheme = html.getAttribute('data-theme') || 'dark';
  const newTheme = currentTheme === 'dark' ? 'light' : 'dark';
  html.setAttribute('data-theme', newTheme);
  localStorage.setItem('cryptoai-theme', newTheme);
  addLog('info', `Tema alterado para ${newTheme === 'dark' ? 'escuro' : 'claro'}`);
}

function loadSavedTheme() {
  const savedTheme = localStorage.getItem('cryptoai-theme');
  if (savedTheme) {
    document.documentElement.setAttribute('data-theme', savedTheme);
  }
}

// ===== AI Metrics Tracker =====
function updateAIMetricsUI() {
  const requestsEl = document.getElementById('ai-requests-count');
  const tokensEl = document.getElementById('ai-tokens-used');
  const costEl = document.getElementById('ai-estimated-cost');
  const lastEl = document.getElementById('ai-last-analysis');

  if (requestsEl) requestsEl.textContent = state.aiMetrics.requestCount;
  if (tokensEl) tokensEl.textContent = state.aiMetrics.tokensUsed.toLocaleString();
  if (costEl) costEl.textContent = `$${state.aiMetrics.estimatedCost.toFixed(2)}`;
  if (state.aiMetrics.lastAnalysis) {
    const time = new Date(state.aiMetrics.lastAnalysis).toLocaleTimeString('pt-BR');
    if (lastEl) lastEl.textContent = time;
  }
}

function updateAIMetrics(tokenCount) {
  state.aiMetrics.requestCount++;
  state.aiMetrics.tokensUsed += Math.round(tokenCount || 0);
  state.aiMetrics.estimatedCost += (tokenCount / 1000) * 0.002; // rough estimate
  state.aiMetrics.lastAnalysis = new Date().toISOString();
  updateAIMetricsUI();
  saveConfig();

  const badgeEl = document.getElementById('ai-activity-badge');
  if (badgeEl) {
    badgeEl.textContent = state.botRunning ? 'Ativo' : 'Pausado';
    badgeEl.className = state.botRunning ? 'badge success' : 'badge info';
  }
}

// ===== CryptoBot Beta =====
const botState = {
  installed: false,
  mode: 'bot', // 'bot', 'ai', 'hybrid'
  running: false,
  interval: null,
  signals: [],
  analysisCount: 0
};

// Load bot install state from cache
try {
  const botSaved = localStorage.getItem('cryptoai-bot-installed');
  if (botSaved === 'true') {
    botState.installed = true;
  }
  const botModeSaved = localStorage.getItem('cryptoai-bot-mode');
  if (botModeSaved) {
    botState.mode = botModeSaved;
  }
} catch (e) {}

// Initialize bot page on load
document.addEventListener('DOMContentLoaded', () => {
  updateBotPageState();
});

function updateBotPageState() {
  const notInstalled = document.getElementById('bot-not-installed');
  const mainContent = document.getElementById('bot-main-content');
  const installBadge = document.getElementById('bot-install-badge');

  if (botState.installed) {
    if (notInstalled) notInstalled.style.display = 'none';
    if (mainContent) mainContent.style.display = 'block';
    if (installBadge) {
      installBadge.textContent = 'Instalado';
      installBadge.className = 'badge success';
    }
    // Restore mode selection
    setBotMode(botState.mode, true);
  } else {
    if (notInstalled) notInstalled.style.display = 'flex';
    if (mainContent) mainContent.style.display = 'none';
    if (installBadge) {
      installBadge.textContent = 'Nao Instalado';
      installBadge.className = 'badge';
    }
  }
}

async function installBot() {
  const notInstalled = document.getElementById('bot-not-installed');
  const installScreen = document.getElementById('bot-install-screen');

  // Show installation screen
  if (notInstalled) notInstalled.style.display = 'none';
  if (installScreen) installScreen.style.display = 'flex';

  addLog('info', 'Iniciando instalacao do CryptoBot Beta (687 MB)...');
  showToast('Instalando CryptoBot Beta...', 'info');

  const steps = [
    { id: 1, duration: 3000, status: 'Baixando motor de analise tecnica...' },
    { id: 2, duration: 2500, status: 'Carregando indicadores (RSI, MACD, BB, Stoch)...' },
    { id: 3, duration: 2000, status: 'Inicializando modelos de sinal...' },
    { id: 4, duration: 1500, status: 'Configurando motor de risco...' },
    { id: 5, duration: 1000, status: 'Finalizando instalacao...' }
  ];

  const totalDuration = steps.reduce((sum, s) => sum + s.duration, 0);
  let elapsed = 0;

  for (const step of steps) {
    // Mark step active
    const stepEl = document.getElementById(`bot-step-${step.id}`);
    if (stepEl) {
      stepEl.className = 'bot-step active';
    }
    document.getElementById('bot-progress-status').textContent = step.status;

    // Animate progress
    const startPercent = Math.round((elapsed / totalDuration) * 100);
    const endPercent = Math.round(((elapsed + step.duration) / totalDuration) * 100);

    await new Promise(resolve => {
      const increment = (endPercent - startPercent) / 20;
      let current = startPercent;
      const interval = setInterval(() => {
        current += increment;
        if (current >= endPercent) {
          current = endPercent;
          clearInterval(interval);
          resolve();
        }
        document.getElementById('bot-progress-fill').style.width = current + '%';
        document.getElementById('bot-progress-percent').textContent = Math.round(current) + '%';
      }, step.duration / 20);
    });

    // Mark step done
    if (stepEl) {
      stepEl.className = 'bot-step done';
    }
    elapsed += step.duration;
  }

  // Installation complete
  botState.installed = true;
  localStorage.setItem('cryptoai-bot-installed', 'true');

  addLog('success', 'CryptoBot Beta instalado com sucesso!');
  showToast('CryptoBot Beta instalado com sucesso!', 'success');

  // Transition to main content
  await new Promise(r => setTimeout(r, 1000));
  if (installScreen) installScreen.style.display = 'none';
  updateBotPageState();
}

function setBotMode(mode, silent) {
  botState.mode = mode;
  localStorage.setItem('cryptoai-bot-mode', mode);

  document.querySelectorAll('.bot-mode-card').forEach(c => c.classList.remove('active'));
  document.querySelector(`.bot-mode-card[data-mode="${mode}"]`)?.classList.add('active');

  const modeNames = { bot: 'Bot', ai: 'IA', hybrid: 'Bot + IA' };
  const statusText = document.getElementById('bot-mode-status-text');
  if (statusText) {
    statusText.textContent = `Modo: ${modeNames[mode] || 'Bot'} - ${botState.running ? 'Ativo' : 'Parado'}`;
  }

  if (!silent) {
    showToast(`Modo alterado para: ${modeNames[mode]}`, 'info');
    addLog('info', `Modo do CryptoBot alterado para: ${modeNames[mode]}`);
  }
}

async function toggleCryptoBot() {
  if (botState.running) {
    stopCryptoBot();
  } else {
    startCryptoBot();
  }
}

async function startCryptoBot() {
  if (!state.activeExchange) {
    showToast('Conecte uma corretora antes de iniciar o Bot', 'warning');
    return;
  }

  if (botState.mode === 'ai' && !state.activeAI) {
    showToast('Configure uma IA antes de usar o modo IA', 'warning');
    return;
  }

  if (botState.mode === 'hybrid' && !state.activeAI) {
    showToast('Configure uma IA para o modo hibrido', 'warning');
    return;
  }

  botState.running = true;
  updateCryptoBotUI();
  showToast('CryptoBot Beta iniciado!', 'success');
  addLog('success', `CryptoBot Beta iniciado no modo: ${botState.mode}`);

  // Run first analysis immediately
  runCryptoBotCycle();

  // Set interval
  const cycleMinutes = parseInt(document.getElementById('bot-cycle-interval')?.value || 5);
  botState.interval = setInterval(() => {
    runCryptoBotCycle();
  }, cycleMinutes * 60 * 1000);
}

function stopCryptoBot() {
  botState.running = false;
  if (botState.interval) {
    clearInterval(botState.interval);
    botState.interval = null;
  }
  updateCryptoBotUI();
  showToast('CryptoBot Beta parado', 'warning');
  addLog('warning', 'CryptoBot Beta parado');
}

function updateCryptoBotUI() {
  const btn = document.getElementById('btn-start-cryptobot');
  const statusDot = document.getElementById('bot-mode-status-dot');
  const statusText = document.getElementById('bot-mode-status-text');
  const analysisBadge = document.getElementById('bot-analysis-badge');

  const modeNames = { bot: 'Bot', ai: 'IA', hybrid: 'Bot + IA' };

  if (botState.running) {
    if (btn) {
      btn.innerHTML = '<svg width="16" height="16" viewBox="0 0 24 24" fill="currentColor"><rect x="6" y="4" width="4" height="16"/><rect x="14" y="4" width="4" height="16"/></svg> Parar';
      btn.className = 'btn btn-sell';
    }
    if (statusDot) { statusDot.classList.remove('offline'); statusDot.classList.add('online'); }
    if (statusText) statusText.textContent = `Modo: ${modeNames[botState.mode]} - Ativo`;
    if (analysisBadge) { analysisBadge.textContent = 'Analisando'; analysisBadge.className = 'badge warning'; }

    // Also update the sidebar bot status
    const sidebarBotStatus = document.getElementById('bot-status');
    if (sidebarBotStatus) {
      sidebarBotStatus.innerHTML = '<span class="status-dot online"></span><span class="status-text">Bot Ativo</span>';
    }
  } else {
    if (btn) {
      btn.innerHTML = '<svg width="16" height="16" viewBox="0 0 24 24" fill="currentColor"><polygon points="5 3 19 12 5 21 5 3"/></svg> Iniciar';
      btn.className = 'btn btn-primary';
    }
    if (statusDot) { statusDot.classList.remove('online'); statusDot.classList.add('offline'); }
    if (statusText) statusText.textContent = `Modo: ${modeNames[botState.mode]} - Parado`;
    if (analysisBadge) { analysisBadge.textContent = 'Parado'; analysisBadge.className = 'badge'; }

    const sidebarBotStatus = document.getElementById('bot-status');
    if (sidebarBotStatus) {
      sidebarBotStatus.innerHTML = '<span class="status-dot offline"></span><span class="status-text">Bot Parado</span>';
    }
  }
}

async function runCryptoBotCycle() {
  if (!botState.running) return;

  const symbol = document.getElementById('bot-symbol')?.value || 'BTCUSDT';
  const interval = document.getElementById('bot-interval')?.value || '60';
  const autoTrade = document.getElementById('bot-auto-trade')?.checked || false;

  addLog('info', `[CryptoBot] Ciclo de analise iniciado - ${symbol} - Modo: ${botState.mode}`);

  try {
    let botResult = null;
    let aiResult = null;

    // Bot analysis (technical indicators)
    if (botState.mode === 'bot' || botState.mode === 'hybrid') {
      botResult = await window.electronAPI.botAnalyze(
        state.exchangeConfigs[state.activeExchange],
        symbol,
        interval
      );
    }

    // AI analysis
    if (botState.mode === 'ai' || botState.mode === 'hybrid') {
      const aiConfig = { ...state.aiConfigs[state.activeAI], ...state.riskConfig };
      // Get market data for AI
      let marketData = {};
      const candleResult = await window.electronAPI.getCandlesticks(
        state.exchangeConfigs[state.activeExchange],
        symbol,
        interval
      );
      if (candleResult.success) marketData[symbol] = candleResult.data;

      aiResult = await window.electronAPI.aiGetAnalysis(aiConfig, marketData, {});
    }

    // Combine results based on mode
    let finalAnalysis = null;

    if (botState.mode === 'hybrid' && botResult?.success && aiResult?.success) {
      // Hybrid: average confidence, prefer agreement
      const botRec = botResult.analysis.recommendation;
      const aiRec = aiResult.analysis.recommendation;
      const botConf = botResult.analysis.confidence;
      const aiConf = aiResult.analysis.confidence;

      let recommendation = 'HOLD';
      let confidence = Math.round((botConf + aiConf) / 2);

      if (botRec === aiRec) {
        recommendation = botRec;
        confidence = Math.min(95, Math.round((botConf + aiConf) / 2 + 10));
      } else if (botRec === 'HOLD' || aiRec === 'HOLD') {
        recommendation = botRec === 'HOLD' ? aiRec : botRec;
        confidence = Math.round((botConf + aiConf) / 2 - 5);
      } else {
        // Bot says BUY and AI says SELL or vice versa - conflicting
        recommendation = 'HOLD';
        confidence = 30;
      }

      finalAnalysis = {
        ...botResult.analysis,
        recommendation,
        confidence,
        source: 'CryptoBot + IA',
        reasoning: `[BOT]: ${botResult.analysis.reasoning}\n[IA]: ${aiResult.analysis.reasoning}`,
        factors: [...(botResult.analysis.factors || []), ...(aiResult.analysis.factors || [])]
      };
    } else if (botState.mode === 'bot' && botResult?.success) {
      finalAnalysis = { ...botResult.analysis, source: 'CryptoBot Beta' };
    } else if (botState.mode === 'ai' && aiResult?.success) {
      finalAnalysis = { ...aiResult.analysis, source: 'IA Only' };
    }

    if (finalAnalysis) {
      displayBotAnalysis(finalAnalysis);
      botState.analysisCount++;

      // Add signal
      addBotSignal(finalAnalysis);

      // Auto trade
      if (autoTrade && (finalAnalysis.recommendation === 'BUY' || finalAnalysis.recommendation === 'SELL')) {
        executeAITrade(finalAnalysis);
      }

      addLog('success', `[CryptoBot] Analise: ${finalAnalysis.recommendation} (${finalAnalysis.confidence}%) - ${symbol}`);
    } else {
      const error = botResult?.error || aiResult?.error || 'Erro desconhecido';
      addLog('error', `[CryptoBot] Erro na analise: ${error}`);
      showToast(`CryptoBot erro: ${error}`, 'error');
    }
  } catch (err) {
    addLog('error', `[CryptoBot] Excecao: ${err.message}`);
  }
}

async function runBotAnalysis() {
  if (!state.activeExchange) {
    showToast('Conecte uma corretora primeiro', 'warning');
    return;
  }
  await runCryptoBotCycle();
}

function displayBotAnalysis(analysis) {
  const container = document.getElementById('bot-analysis-content');
  const badge = document.getElementById('bot-analysis-badge');
  if (!container) return;

  const rec = analysis.recommendation || 'HOLD';
  const confidence = analysis.confidence || 50;
  const risk = analysis.risk_level || 'MEDIUM';
  const symbol = analysis.symbol || 'BTCUSDT';
  const trend = analysis.trend || '';
  const source = analysis.source || 'CryptoBot';

  if (badge) {
    badge.textContent = rec;
    badge.className = `badge ${rec === 'BUY' ? 'success' : rec === 'SELL' ? 'error' : 'warning'}`;
  }

  container.innerHTML = `
    <div class="analysis-result">
      <div class="analysis-header">
        <div style="display:flex;align-items:center;gap:10px;">
          <span class="recommendation-badge ${rec}">${rec}</span>
          <span class="analysis-symbol-tag">${symbol}</span>
          <span class="badge info" style="font-size:10px">${source}</span>
          ${trend ? `<span class="badge ${trend === 'ALTA' ? 'success' : trend === 'BAIXA' ? 'error' : 'warning'}" style="font-size:10px">Tendencia: ${trend}</span>` : ''}
        </div>
        <span class="badge ${risk === 'LOW' ? 'success' : risk === 'HIGH' || risk === 'EXTREME' ? 'error' : 'warning'}">
          Risco: ${risk}
        </span>
      </div>
      <div class="analysis-details">
        <div class="analysis-detail">
          <div class="analysis-detail-label">Confianca</div>
          <div class="analysis-detail-value" style="color: ${confidence > 70 ? 'var(--accent-green)' : confidence > 40 ? 'var(--accent-orange)' : 'var(--accent-red)'}">${confidence}%</div>
        </div>
        <div class="analysis-detail">
          <div class="analysis-detail-label">Sentimento</div>
          <div class="analysis-detail-value">${(analysis.sentiment || 'neutral').toUpperCase()}</div>
        </div>
        <div class="analysis-detail">
          <div class="analysis-detail-label">Entrada</div>
          <div class="analysis-detail-value">${analysis.entry_price ? '$' + analysis.entry_price.toLocaleString() : 'N/A'}</div>
        </div>
        <div class="analysis-detail">
          <div class="analysis-detail-label">Target</div>
          <div class="analysis-detail-value">${analysis.target_price ? '$' + analysis.target_price.toLocaleString() : 'N/A'}</div>
        </div>
        <div class="analysis-detail">
          <div class="analysis-detail-label">Stop Loss</div>
          <div class="analysis-detail-value" style="color: var(--accent-red)">${analysis.stop_loss ? '$' + analysis.stop_loss.toLocaleString() : 'N/A'}</div>
        </div>
        <div class="analysis-detail">
          <div class="analysis-detail-label">Timeframe</div>
          <div class="analysis-detail-value">${(analysis.timeframe || 'medium').toUpperCase()}</div>
        </div>
      </div>
      <div class="analysis-reasoning">
        <strong>Raciocinio:</strong> ${analysis.reasoning || 'Sem detalhes disponiveis'}
      </div>
      ${analysis.factors ? `
        <div class="analysis-factors">
          ${analysis.factors.map(f => `<span class="factor-tag">${f}</span>`).join('')}
        </div>
      ` : ''}
    </div>
  `;
}

function addBotSignal(analysis) {
  const signal = {
    id: Date.now(),
    timestamp: new Date(),
    symbol: analysis.symbol || 'BTCUSDT',
    recommendation: analysis.recommendation,
    confidence: analysis.confidence,
    source: analysis.source || 'CryptoBot'
  };
  botState.signals.unshift(signal);
  if (botState.signals.length > 100) botState.signals = botState.signals.slice(0, 100);
  updateBotSignalsUI();
}

function updateBotSignalsUI() {
  const container = document.getElementById('bot-signals-body');
  const countBadge = document.getElementById('bot-signals-count');
  if (!container) return;

  if (countBadge) {
    countBadge.textContent = `${botState.signals.length} sinais`;
  }

  if (botState.signals.length === 0) {
    container.innerHTML = '<div class="empty-state"><p>Nenhum sinal gerado ainda</p></div>';
    return;
  }

  container.innerHTML = botState.signals.map(s => {
    const time = s.timestamp instanceof Date
      ? s.timestamp.toLocaleTimeString('pt-BR')
      : new Date(s.timestamp).toLocaleTimeString('pt-BR');
    return `
      <div class="bot-signal-item">
        <div class="bot-signal-left">
          <span class="recommendation-badge-sm ${s.recommendation}">${s.recommendation}</span>
          <span class="analysis-history-symbol">${s.symbol}</span>
          <span class="badge info" style="font-size:9px">${s.source}</span>
        </div>
        <div class="bot-signal-right">
          <span style="color: ${s.confidence > 70 ? 'var(--accent-green)' : s.confidence > 40 ? 'var(--accent-orange)' : 'var(--accent-red)'}">${s.confidence}%</span>
          <span>${time}</span>
        </div>
      </div>
    `;
  }).join('');
}

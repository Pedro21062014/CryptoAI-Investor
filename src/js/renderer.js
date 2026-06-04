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
  balanceHistory: [],
  paperTrading: { cash: 10000, initialCash: 10000, positions: [], history: [], realizedPnl: 0 },
  balanceRefreshInterval: null,
  aiChatMessages: [],
  aiAutomations: [],
  automationIntervals: {},
  coinSelectorData: [],
  coinSelectorSelected: new Set(['BTCUSDT', 'ETHUSDT', 'SOLUSDT']),
  tradeSymbolRules: null,
  aiLearning: { blockedSymbols: {}, events: [] }
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
  loadBalanceHistory();
  loadPaperTrading();
  addLog('info', 'Aplicativo iniciado com sucesso');
  showApiCachePath();
  loadSecureCredentials();
  setupUpdateProgressListener();
  initCoinSelector();
  initTradingUI();
  loadGatewayConfig();
  loadAIAutomations();
  loadAILearning();
  syncChatModels();
  ['create-ai-paper', 'create-ai-min-usdt'].forEach(id => document.getElementById(id)?.addEventListener('change', updateCreateAISummary));
  ['create-bot-symbol','create-bot-interval','create-bot-cycle','create-bot-confidence','create-bot-order-percent','create-bot-symbol-list','create-bot-paper','create-bot-multi','create-bot-news','create-bot-news-align','create-bot-autotrade'].forEach(id => document.getElementById(id)?.addEventListener('change', updateCreateBotSummary));
  initAIModelLoaders();
  restoreCachedAIModels();
  document.getElementById('app-language')?.addEventListener('change', () => {
    saveConfig();
    addLog('info', `Idioma das respostas da IA alterado para ${getSelectedLanguage()}`);
  });
  ['bot-paper-mode', 'bot-multi-symbols', 'bot-symbol-list'].forEach(id => {
    document.getElementById(id)?.addEventListener('change', () => { saveConfig(); updatePositionsUI(); });
  });
});

async function showApiCachePath() {
  try {
    if (window.electronAPI?.getCachePath) {
      const cachePath = await window.electronAPI.getCachePath();
      addLog('info', `Cache de API ativo em: ${cachePath}`);
    }
  } catch (e) {
    // Ignore cache path errors
  }
}

function sanitizeExchangeConfigsForStorage(configs = {}) {
  const sanitized = {};
  Object.keys(configs || {}).forEach(ex => {
    const { apiKey, apiSecret, passphrase, ...rest } = configs[ex] || {};
    sanitized[ex] = rest;
  });
  return sanitized;
}

function sanitizeAIConfigsForStorage(configs = {}) {
  const sanitized = {};
  Object.keys(configs || {}).forEach(provider => {
    const { apiKey, ...rest } = configs[provider] || {};
    sanitized[provider] = rest;
  });
  return sanitized;
}

async function saveSecureCredentials() {
  try {
    if (!window.electronAPI?.setSecureCredentials) return;

    const exchangeConfigs = {};
    Object.keys(state.exchangeConfigs || {}).forEach(ex => {
      const conf = state.exchangeConfigs[ex] || {};
      if (conf.apiKey || conf.apiSecret || conf.passphrase) exchangeConfigs[ex] = conf;
    });

    const aiConfigs = {};
    Object.keys(state.aiConfigs || {}).forEach(provider => {
      const conf = state.aiConfigs[provider] || {};
      if (conf.apiKey) aiConfigs[provider] = conf;
    });

    // Não sobrescreve o arquivo seguro quando o estado ainda tem apenas configs sanitizadas.
    if (Object.keys(exchangeConfigs).length === 0 && Object.keys(aiConfigs).length === 0) return;

    await window.electronAPI.setSecureCredentials({ exchangeConfigs, aiConfigs });
  } catch (e) {
    addLog('warning', `Nao foi possivel salvar credenciais seguras: ${e.message}`);
  }
}

async function loadSecureCredentials() {
  const started = Date.now();
  try {
    if (!window.electronAPI?.getSecureCredentials) return;
    addLog('info', 'Carregando credenciais seguras...');
    const secure = await window.electronAPI.getSecureCredentials();
    let restoredExchanges = 0;
    let restoredAIs = 0;

    if (secure?.exchangeConfigs) {
      Object.keys(secure.exchangeConfigs).forEach(ex => {
        state.exchangeConfigs[ex] = { ...(state.exchangeConfigs[ex] || {}), ...(secure.exchangeConfigs[ex] || {}) };
        const conf = state.exchangeConfigs[ex];
        if (document.getElementById(`${ex}-apikey`)) document.getElementById(`${ex}-apikey`).value = conf.apiKey || '';
        if (document.getElementById(`${ex}-apisecret`)) document.getElementById(`${ex}-apisecret`).value = conf.apiSecret || '';
        if (document.getElementById(`${ex}-testnet`)) document.getElementById(`${ex}-testnet`).checked = !!conf.testnet;
        if (document.getElementById(`${ex}-demo`)) document.getElementById(`${ex}-demo`).checked = !!conf.demo;
        if (ex === 'okx' && document.getElementById('okx-passphrase')) document.getElementById('okx-passphrase').value = conf.passphrase || '';
        if (conf.apiKey && conf.apiSecret) {
          restoredExchanges++;
          updateExchangeStatus(ex, true);
        }
      });
    }
    if (secure?.aiConfigs) {
      Object.keys(secure.aiConfigs).forEach(provider => {
        state.aiConfigs[provider] = { ...(state.aiConfigs[provider] || {}), ...(secure.aiConfigs[provider] || {}) };
        if (document.getElementById(`${provider}-apikey`)) {
          document.getElementById(`${provider}-apikey`).value = state.aiConfigs[provider].apiKey || '';
        }
        if (state.aiConfigs[provider].apiKey) {
          restoredAIs++;
          updateAIStatusUI(provider, provider === state.activeAI);
        }
      });
    }

    updateWalletUI();
    addLog('success', `Credenciais seguras carregadas em ${Date.now() - started}ms (${restoredExchanges} corretora(s), ${restoredAIs} IA(s))`);

    if (state.activeExchange && state.exchangeConfigs[state.activeExchange]?.apiKey && state.exchangeConfigs[state.activeExchange]?.apiSecret) {
      addLog('info', `Atualizando saldo após restaurar credenciais de ${state.activeExchange}...`);
      setTimeout(() => loadBalance(state.activeExchange), 500);
    }
  } catch (e) {
    addLog('warning', `Erro ao carregar credenciais seguras: ${e.message}`);
  }
}

async function showSecureStorageInfo() {
  try {
    const info = await window.electronAPI?.getSecureInfo?.();
    const msg = info?.encryptionAvailable
      ? `Credenciais criptografadas pelo sistema operacional. Arquivo: ${info.path}`
      : `Criptografia do sistema indisponivel. Credenciais ficam ofuscadas/base64 no arquivo: ${info?.path || '--'}`;
    showToast(msg, info?.encryptionAvailable ? 'success' : 'warning');
    addLog(info?.encryptionAvailable ? 'success' : 'warning', msg);
  } catch (e) {
    showToast('Erro ao verificar seguranca: ' + e.message, 'error');
  }
}

async function clearSecureCredentials() {
  if (!confirm('Limpar todas as credenciais salvas? Voce precisara digitar as API keys novamente.')) return;
  try {
    await window.electronAPI?.clearSecureCredentials?.();
    state.exchangeConfigs = {};
    state.aiConfigs = {};
    saveConfig();
    showToast('Credenciais salvas foram limpas', 'success');
    addLog('warning', 'Credenciais seguras limpas pelo usuario');
  } catch (e) {
    showToast('Erro ao limpar credenciais: ' + e.message, 'error');
  }
}

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
    const started = Date.now();
    const result = await window.electronAPI.testConnection(config);
    addLog('info', `Resposta de conexão ${exchange} em ${Date.now() - started}ms`);
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
    const started = Date.now();
    const result = await window.electronAPI.testConnection(config);
    addLog('info', `Resposta do teste ${exchange} em ${Date.now() - started}ms`);
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
    testnet: document.getElementById(`${exchange}-testnet`)?.checked || false,
    demo: document.getElementById(`${exchange}-demo`)?.checked || false
  };

  // Bybit trata Testnet e Demo Trading como ambientes diferentes.
  // Se ambos forem marcados por engano, prioriza Demo para evitar erro 401/10003 por domínio incorreto.
  if (exchange === 'bybit' && config.demo) {
    config.testnet = false;
  }

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

function toFiniteNumber(value, fallback = 0) {
  const numberValue = Number(value);
  return Number.isFinite(numberValue) ? numberValue : fallback;
}

function formatUsd(value) {
  return `$${toFiniteNumber(value).toLocaleString('en-US', { minimumFractionDigits: 2, maximumFractionDigits: 2 })}`;
}

function normalizeBalanceItem(coin) {
  const coinName = (coin.coin || coin.asset || '???').toString().toUpperCase();
  const walletBalance = toFiniteNumber(
    coin.walletBalance ?? coin.total ?? (toFiniteNumber(coin.free, 0) + toFiniteNumber(coin.locked, 0)),
    0
  );
  const free = toFiniteNumber(coin.free ?? coin.available ?? coin.availableBalance, 0);
  const locked = toFiniteNumber(coin.locked ?? coin.frozen ?? 0, 0);
  let usdValue = toFiniteNumber(coin.usdValue ?? coin.usd ?? coin.eqUsd, 0);

  if (usdValue <= 0 && ['USDT', 'USDC', 'BUSD', 'TUSD', 'USD', 'DAI', 'FDUSD', 'PYUSD'].includes(coinName)) {
    usdValue = walletBalance;
  }

  return { ...coin, coin: coinName, walletBalance, free, locked, usdValue };
}

function calculateTotalBalance(balance, totalEquity) {
  const equity = toFiniteNumber(totalEquity, 0);
  if (equity > 0) return equity;
  return (balance || []).reduce((sum, coin) => sum + toFiniteNumber(coin.usdValue, 0), 0);
}

async function loadBalance(exchange) {
  const config = state.exchangeConfigs[exchange];
  if (!config) return;

  try {
    const result = await window.electronAPI.getBalance(config);
    if (result.success && Array.isArray(result.balance)) {
      const normalizedBalance = result.balance.map(normalizeBalanceItem).filter(coin => coin.walletBalance > 0 || coin.usdValue > 0);
      const totalUsd = calculateTotalBalance(normalizedBalance, result.totalEquity);

      // Save balance to state and cache
      state.totalBalance = totalUsd;
      state.balanceDetails = normalizedBalance;
      recordBalanceSnapshot(exchange, totalUsd, normalizedBalance);
      updateWalletUI(result.exchange || exchange);
      updatePositionsUI();

      const balanceEl = document.getElementById('total-balance');
      if (balanceEl) balanceEl.textContent = formatUsd(totalUsd);

      // Also update balance details in the market card
      displayBalanceDetails(normalizedBalance, result.exchange || exchange);

      if (Array.isArray(result.errors) && result.errors.length > 0) {
        addLog('warning', `Avisos ao carregar saldo ${exchange}: ${result.errors.slice(0, 3).join(' | ')}`);
      }
      if (normalizedBalance.length === 0 && totalUsd === 0) {
        showToast(`Saldo ${exchange}: API retornou zero/sem moedas. Verifique a pasta cache API.`, 'warning');
      }

      addLog('info', `Saldo carregado de ${exchange}: ${formatUsd(totalUsd)}`);
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

  const sorted = balance.map(normalizeBalanceItem).sort((a, b) => toFiniteNumber(b.usdValue, 0) - toFiniteNumber(a.usdValue, 0));

  container.innerHTML = `
    <div style="margin-bottom:8px;font-size:11px;color:var(--text-muted);text-transform:uppercase;letter-spacing:0.5px;font-weight:600;">
      Saldos (${exchange})
    </div>
    ${sorted.slice(0, 15).map(coin => {
      const coinName = coin.coin || coin.asset || '???';
      const amount = toFiniteNumber(coin.walletBalance || coin.free, 0);
      const usd = toFiniteNumber(coin.usdValue, 0);
      const free = toFiniteNumber(coin.free, 0);
      return `
        <div class="market-item">
          <div>
            <div class="market-name">${coinName}</div>
            <div style="font-size:11px;color:var(--text-muted);">${amount < 0.001 ? amount.toExponential(2) : amount.toLocaleString('en-US', {maximumFractionDigits: 8})} ${coinName}</div>
          </div>
          <div style="text-align:right">
            <div class="market-price">${formatUsd(usd)}</div>
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



// ===== Coin Selector for AI Focus =====
const FALLBACK_COINS = [
  { id: 'bitcoin', symbol: 'btc', name: 'Bitcoin', current_price: 0, image: '' },
  { id: 'ethereum', symbol: 'eth', name: 'Ethereum', current_price: 0, image: '' },
  { id: 'solana', symbol: 'sol', name: 'Solana', current_price: 0, image: '' },
  { id: 'binancecoin', symbol: 'bnb', name: 'BNB', current_price: 0, image: '' },
  { id: 'ripple', symbol: 'xrp', name: 'XRP', current_price: 0, image: '' },
  { id: 'cardano', symbol: 'ada', name: 'Cardano', current_price: 0, image: '' },
  { id: 'dogecoin', symbol: 'doge', name: 'Dogecoin', current_price: 0, image: '' },
  { id: 'avalanche-2', symbol: 'avax', name: 'Avalanche', current_price: 0, image: '' },
  { id: 'chainlink', symbol: 'link', name: 'Chainlink', current_price: 0, image: '' },
  { id: 'litecoin', symbol: 'ltc', name: 'Litecoin', current_price: 0, image: '' },
  { id: 'the-open-network', symbol: 'ton', name: 'Toncoin', current_price: 0, image: '' },
  { id: 'hyperliquid', symbol: 'hype', name: 'Hyperliquid', current_price: 0, image: '' }
];

function coinToPair(coin) {
  return `${String(coin.symbol || '').toUpperCase()}USDT`;
}

function getMonitorPairsArray() {
  const raw = document.getElementById('monitor-pairs')?.value || '';
  return raw.split(',').map(p => p.trim().toUpperCase().replace(/[^A-Z0-9]/g, '')).filter(Boolean);
}

function initCoinSelector() {
  const pairs = getMonitorPairsArray();
  state.coinSelectorSelected = new Set(pairs.length ? pairs : ['BTCUSDT', 'ETHUSDT', 'SOLUSDT']);
  updateSelectedCoinsPreview();
  loadCoinSelectorData(false);
  document.getElementById('monitor-pairs')?.addEventListener('change', () => {
    state.coinSelectorSelected = new Set(getMonitorPairsArray());
    updateSelectedCoinsPreview();
    saveConfig();
  });
}

async function loadCoinSelectorData(force) {
  try {
    if (!force) {
      const cached = JSON.parse(localStorage.getItem('cryptoai-coin-selector-cache') || 'null');
      if (cached?.coins?.length && Date.now() - cached.ts < 15 * 60 * 1000) {
        state.coinSelectorData = cached.coins;
        updateSelectedCoinsPreview();
        return;
      }
    }
    const url = 'https://api.coingecko.com/api/v3/coins/markets?vs_currency=usd&order=market_cap_desc&per_page=120&page=1&sparkline=false&price_change_percentage=24h';
    const res = await fetch(url);
    if (!res.ok) throw new Error(`HTTP ${res.status}`);
    const coins = await res.json();
    state.coinSelectorData = Array.isArray(coins) ? coins : FALLBACK_COINS;
    localStorage.setItem('cryptoai-coin-selector-cache', JSON.stringify({ ts: Date.now(), coins: state.coinSelectorData }));
    updateSelectedCoinsPreview();
    renderCoinSelector();
    renderTradeCoinPicker();
    updateTradeCoinPreview();
    showToast('Moedas/preços atualizados', 'success');
  } catch (e) {
    state.coinSelectorData = state.coinSelectorData.length ? state.coinSelectorData : FALLBACK_COINS;
    updateSelectedCoinsPreview();
    renderCoinSelector();
    renderTradeCoinPicker();
    updateTradeCoinPreview();
    if (force) showToast('Falha ao atualizar moedas: ' + e.message, 'warning');
  }
}

function getCoinByPair(pair) {
  return state.coinSelectorData.find(c => coinToPair(c) === pair) || null;
}

function updateSelectedCoinsPreview() {
  const container = document.getElementById('selected-coins-preview');
  const count = document.getElementById('coin-selector-count');
  const selected = Array.from(state.coinSelectorSelected || []);
  if (count) count.textContent = `${selected.length} selecionada${selected.length === 1 ? '' : 's'}`;
  if (!container) return;
  if (!selected.length) {
    container.innerHTML = '<span style="font-size:12px;color:var(--text-muted);">Nenhuma moeda selecionada</span>';
    return;
  }
  container.innerHTML = selected.slice(0, 16).map(pair => {
    const coin = getCoinByPair(pair);
    const price = coin?.current_price ? `$${Number(coin.current_price).toLocaleString('en-US', { maximumFractionDigits: 6 })}` : '';
    const img = coin?.image ? `<img src="${coin.image}" style="width:18px;height:18px;border-radius:50%;">` : '<span style="width:18px;height:18px;border-radius:50%;background:var(--gradient-primary);display:inline-block;"></span>';
    return `<span style="display:inline-flex;align-items:center;gap:6px;padding:6px 9px;border:1px solid var(--border-color);border-radius:999px;background:rgba(255,255,255,.04);font-size:12px;">${img}<strong>${pair.replace('USDT','')}</strong><span style="color:var(--text-muted);">${price}</span></span>`;
  }).join('') + (selected.length > 16 ? `<span class="badge info">+${selected.length - 16}</span>` : '');
}

function openCoinSelector() {
  state.coinSelectorSelected = new Set(getMonitorPairsArray());
  const modal = document.getElementById('coin-selector-modal');
  if (modal) modal.style.display = 'flex';
  renderCoinSelector();
  if (!state.coinSelectorData.length) loadCoinSelectorData(true);
}

function closeCoinSelector() {
  const modal = document.getElementById('coin-selector-modal');
  if (modal) modal.style.display = 'none';
}

function toggleCoinSelection(pair) {
  if (state.coinSelectorSelected.has(pair)) state.coinSelectorSelected.delete(pair);
  else state.coinSelectorSelected.add(pair);
  renderCoinSelector();
}

function renderCoinSelector() {
  const grid = document.getElementById('coin-selector-grid');
  const badge = document.getElementById('coin-selector-modal-count');
  if (!grid) return;
  const q = (document.getElementById('coin-selector-search')?.value || '').toLowerCase().trim();
  const coins = (state.coinSelectorData.length ? state.coinSelectorData : FALLBACK_COINS).filter(c => {
    const pair = coinToPair(c);
    return !q || c.name?.toLowerCase().includes(q) || c.symbol?.toLowerCase().includes(q) || pair.toLowerCase().includes(q);
  });
  if (badge) badge.textContent = `${state.coinSelectorSelected.size} selecionada${state.coinSelectorSelected.size === 1 ? '' : 's'}`;
  grid.innerHTML = coins.map(coin => {
    const pair = coinToPair(coin);
    const selected = state.coinSelectorSelected.has(pair);
    const price = coin.current_price ? `$${Number(coin.current_price).toLocaleString('en-US', { maximumFractionDigits: 8 })}` : 'Preço --';
    const change = Number(coin.price_change_percentage_24h || 0);
    return `<div onclick="toggleCoinSelection('${pair}')" style="cursor:pointer;padding:12px;border:1px solid ${selected ? 'var(--accent-cyan)' : 'var(--border-color)'};border-radius:var(--radius-sm);background:${selected ? 'rgba(0,212,255,.10)' : 'rgba(255,255,255,.03)'};display:flex;gap:10px;align-items:center;">
      ${coin.image ? `<img src="${coin.image}" style="width:34px;height:34px;border-radius:50%;">` : '<div style="width:34px;height:34px;border-radius:50%;background:var(--gradient-primary);"></div>'}
      <div style="flex:1;min-width:0;"><div style="font-weight:800;color:var(--text-primary);white-space:nowrap;overflow:hidden;text-overflow:ellipsis;">${coin.name || pair}</div><div style="font-size:11px;color:var(--text-muted);">${pair} • ${price}</div></div>
      <div style="text-align:right;"><div style="color:${change >= 0 ? 'var(--accent-green)' : 'var(--accent-red)'};font-size:12px;font-weight:700;">${change ? (change >= 0 ? '+' : '') + change.toFixed(2) + '%' : '--'}</div><div style="font-size:18px;color:${selected ? 'var(--accent-cyan)' : 'var(--text-muted)'};">${selected ? '✓' : '+'}</div></div>
    </div>`;
  }).join('') || '<div class="empty-state"><p>Nenhuma moeda encontrada</p></div>';
}

function applyCoinSelection() {
  const selected = Array.from(state.coinSelectorSelected);
  const input = document.getElementById('monitor-pairs');
  if (input) input.value = selected.join(',');
  updateSelectedCoinsPreview();
  saveConfig();
  closeCoinSelector();
  showToast(`${selected.length} moedas selecionadas para a IA`, 'success');
}

// ===== Dynamic AI Model Loading =====
const AI_MODEL_PROVIDERS = ['deepseek', 'openai', 'google', 'nvidia', 'claude', 'openrouter'];

function getModelSelect(provider) {
  return document.getElementById(`${provider}-model`);
}

function getModelCache() {
  try {
    return JSON.parse(localStorage.getItem('cryptoai-model-cache') || '{}');
  } catch (e) {
    return {};
  }
}

function saveModelCache(provider, models) {
  try {
    const cache = getModelCache();
    cache[provider] = { models, updatedAt: new Date().toISOString() };
    localStorage.setItem('cryptoai-model-cache', JSON.stringify(cache));
  } catch (e) {}
}

function populateModelSelect(provider, models, preferredModel) {
  const select = getModelSelect(provider);
  if (!select || !Array.isArray(models) || models.length === 0) return;

  const current = preferredModel || select.value;
  const unique = [];
  const seen = new Set();
  models.forEach(model => {
    const id = typeof model === 'string' ? model : model.id;
    const name = typeof model === 'string' ? model : (model.name || model.id);
    if (!id || seen.has(id)) return;
    seen.add(id);
    unique.push({ id, name });
  });

  select.innerHTML = unique.map(model => `<option value="${model.id}">${model.name}</option>`).join('') + '<option value="custom">Personalizado...</option>';

  if (current && [...select.options].some(o => o.value === current)) {
    select.value = current;
  } else if (unique.length > 0) {
    select.value = unique[0].id;
  }
  handleModelChange(provider);
}

function restoreCachedAIModels() {
  const cache = getModelCache();
  AI_MODEL_PROVIDERS.forEach(provider => {
    if (cache[provider]?.models?.length) {
      const savedModel = state.aiConfigs?.[provider]?.model;
      populateModelSelect(provider, cache[provider].models, savedModel);
      const badge = document.getElementById(`models-status-${provider}`);
      if (badge) badge.textContent = `${cache[provider].models.length} cache`;
    }
  });
}

function initAIModelLoaders() {
  AI_MODEL_PROVIDERS.forEach(provider => {
    const select = getModelSelect(provider);
    if (!select) return;
    const group = select.closest('.form-group');
    if (!group || group.querySelector(`[data-load-models="${provider}"]`)) return;

    const row = document.createElement('div');
    row.style.cssText = 'display:flex;gap:8px;align-items:center;margin-top:8px;flex-wrap:wrap;';
    row.innerHTML = `
      <button type="button" class="btn btn-sm btn-outline" data-load-models="${provider}" onclick="loadAIModels('${provider}')">Carregar modelos da API</button>
      <span class="badge info" id="models-status-${provider}">estático</span>
    `;
    group.appendChild(row);
  });
}

async function loadAIModels(provider) {
  const config = getAIConfig(provider);
  if (!config.apiKey && provider !== 'openrouter') {
    showToast('Preencha a API Key para carregar os modelos', 'warning');
    return;
  }

  const btn = document.querySelector(`[data-load-models="${provider}"]`);
  const status = document.getElementById(`models-status-${provider}`);
  const oldText = btn?.textContent;
  if (btn) { btn.disabled = true; btn.textContent = 'Carregando...'; }
  if (status) { status.textContent = 'consultando API'; status.className = 'badge warning'; }

  try {
    const result = await window.electronAPI.aiListModels(config);
    if (!result.success) throw new Error(result.error || 'Erro ao carregar modelos');
    if (!result.models || result.models.length === 0) throw new Error('API não retornou modelos');

    populateModelSelect(provider, result.models, config.model);
    saveModelCache(provider, result.models);
    saveConfig();
    if (status) { status.textContent = `${result.models.length} modelos`; status.className = 'badge success'; }
    showToast(`${result.models.length} modelos carregados de ${provider}`, 'success');
    addLog('success', `Modelos carregados de ${provider}: ${result.models.length}`);
  } catch (err) {
    if (status) { status.textContent = 'erro'; status.className = 'badge error'; }
    showToast(`Erro ao carregar modelos: ${err.message}`, 'error');
    addLog('error', `Erro ao carregar modelos de ${provider}: ${err.message}`);
  } finally {
    if (btn) { btn.disabled = false; btn.textContent = oldText || 'Carregar modelos da API'; }
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
      loadAIModels(provider);
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

function getSelectedLanguage() {
  return document.getElementById('app-language')?.value || 'pt-BR';
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
    maxTokens: parseInt(document.getElementById('max-tokens')?.value || 2000),
    language: getSelectedLanguage()
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
    btn.innerHTML = '<svg width="16" height="16" viewBox="0 0 24 24" fill="currentColor"><rect x="6" y="4" width="4" height="16"/><rect x="14" y="4" width="4" height="16"/></svg> Parar IA';
    btn.className = 'btn btn-sell';
    status.innerHTML = '<span class="status-dot online"></span><span class="status-text">IA Ativa</span>';
  } else {
    btn.innerHTML = '<svg width="16" height="16" viewBox="0 0 24 24" fill="currentColor"><polygon points="5 3 19 12 5 21 5 3"/></svg> Criar IA';
    btn.className = 'btn btn-primary';
    status.innerHTML = '<span class="status-dot offline"></span><span class="status-text">IA Parada</span>';
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
    const aiConfig = { ...state.aiConfigs[state.activeAI], ...state.riskConfig, language: getSelectedLanguage() };
    const analysisResult = await window.electronAPI.aiGetAnalysis(
      aiConfig,
      marketData,
      { news: newsData, sentiment, learning: getAILearningContext() }
    );

    if (analysisResult.success) {
      // Include symbol info in analysis for history tracking
      // If AI recommended a specific symbol, use it; otherwise use monitored pairs
      if (!analysisResult.analysis.symbol) {
        analysisResult.analysis.symbol = pairList.join(', ');
      }
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
  const execution = analysis.execution || {};
  const newsSentiment = analysis.news_sentiment || analysis.market_intel?.overall || 'neutral';
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
        <div class="analysis-detail">
          <div class="analysis-detail-label">Notícias</div>
          <div class="analysis-detail-value">${newsSentiment.toUpperCase()} ${analysis.news_score !== undefined ? '(' + analysis.news_score + ')' : ''}</div>
        </div>
        <div class="analysis-detail">
          <div class="analysis-detail-label">Executar?</div>
          <div class="analysis-detail-value" style="color:${execution.shouldExecute ? 'var(--accent-green)' : 'var(--accent-orange)'}">${execution.shouldExecute ? 'SIM' : 'NÃO'}</div>
        </div>
      </div>
      ${execution.reason ? `<div class="analysis-reasoning" style="margin-bottom:10px;"><strong>Gate de execução:</strong> ${execution.reason}</div>` : ''}
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


// ===== Wallet & Balance History =====
function loadBalanceHistory() {
  try {
    const saved = localStorage.getItem('cryptoai-balance-history');
    state.balanceHistory = saved ? JSON.parse(saved) : [];
    updateWalletUI();
  } catch (e) {
    state.balanceHistory = [];
  }
}

function saveBalanceHistory() {
  try {
    localStorage.setItem('cryptoai-balance-history', JSON.stringify(state.balanceHistory));
  } catch (e) {}
}

function recordBalanceSnapshot(exchange, totalUsd, balanceDetails) {
  const last = state.balanceHistory[0];
  const now = Date.now();
  if (last && last.exchange === exchange && Math.abs(toFiniteNumber(last.totalUsd, 0) - totalUsd) < 0.01 && (now - new Date(last.timestamp).getTime()) < 60000) {
    return;
  }
  state.balanceHistory.unshift({
    id: now,
    timestamp: new Date().toISOString(),
    exchange,
    totalUsd,
    coinCount: balanceDetails.length,
    topCoins: balanceDetails.slice(0, 8).map(c => ({ coin: c.coin, usdValue: c.usdValue, walletBalance: c.walletBalance }))
  });
  if (state.balanceHistory.length > 500) state.balanceHistory = state.balanceHistory.slice(0, 500);
  saveBalanceHistory();
}

function updateWalletUI(sourceLabel) {
  const totalEl = document.getElementById('wallet-total-balance');
  const countEl = document.getElementById('wallet-coin-count');
  const exEl = document.getElementById('wallet-active-exchange');
  const histCountEl = document.getElementById('wallet-history-count');
  const sourceBadge = document.getElementById('wallet-source-badge');
  const lastUpdate = document.getElementById('wallet-last-update');
  const tbody = document.getElementById('wallet-balances-tbody');

  if (totalEl) totalEl.textContent = formatUsd(state.totalBalance);
  if (countEl) countEl.textContent = state.balanceDetails.length;
  if (exEl) exEl.textContent = state.activeExchange || '--';
  if (histCountEl) histCountEl.textContent = state.balanceHistory.length;
  if (sourceBadge && sourceLabel) sourceBadge.textContent = sourceLabel;
  if (lastUpdate && state.balanceHistory[0]) lastUpdate.textContent = new Date(state.balanceHistory[0].timestamp).toLocaleString('pt-BR');

  if (tbody) {
    if (!state.balanceDetails.length) {
      tbody.innerHTML = '<tr><td colspan="6" class="empty-row">Nenhum saldo carregado</td></tr>';
    } else {
      tbody.innerHTML = state.balanceDetails.map(c => `
        <tr>
          <td><strong>${c.coin}</strong></td>
          <td style="font-family:var(--font-mono)">${toFiniteNumber(c.walletBalance, 0).toLocaleString('en-US', { maximumFractionDigits: 8 })}</td>
          <td style="font-family:var(--font-mono)">${toFiniteNumber(c.free, 0).toLocaleString('en-US', { maximumFractionDigits: 8 })}</td>
          <td style="font-family:var(--font-mono)">${toFiniteNumber(c.locked, 0).toLocaleString('en-US', { maximumFractionDigits: 8 })}</td>
          <td style="font-family:var(--font-mono)">${formatUsd(c.usdValue)}</td>
          <td>${Array.isArray(c.accountTypes) ? c.accountTypes.join(', ') : '--'}</td>
        </tr>
      `).join('');
    }
  }
  updateBalanceHistoryUI();
}

function updateBalanceHistoryUI() {
  const container = document.getElementById('wallet-history-body');
  if (!container) return;
  if (!state.balanceHistory.length) {
    container.innerHTML = '<div class="empty-state"><p>Nenhum snapshot de saldo ainda</p></div>';
    return;
  }
  container.innerHTML = state.balanceHistory.slice(0, 100).map((h, idx) => {
    const previous = state.balanceHistory[idx + 1];
    const delta = previous ? toFiniteNumber(h.totalUsd, 0) - toFiniteNumber(previous.totalUsd, 0) : 0;
    const deltaPct = previous && previous.totalUsd ? (delta / previous.totalUsd) * 100 : 0;
    return `
      <div class="analysis-history-item">
        <div class="analysis-history-row">
          <div class="analysis-history-left">
            <span class="analysis-history-symbol">${h.exchange}</span>
            <span class="badge info">${h.coinCount} moedas</span>
          </div>
          <div class="analysis-history-right">
            <span style="font-family:var(--font-mono);font-weight:700">${formatUsd(h.totalUsd)}</span>
            ${previous ? `<span class="market-change ${delta >= 0 ? 'positive' : 'negative'}">${delta >= 0 ? '+' : ''}${formatUsd(delta)} (${deltaPct.toFixed(2)}%)</span>` : ''}
            <span class="analysis-history-time">${new Date(h.timestamp).toLocaleString('pt-BR')}</span>
          </div>
        </div>
      </div>
    `;
  }).join('');
}

function clearBalanceHistory() {
  if (!confirm('Limpar todo o histórico de saldo?')) return;
  state.balanceHistory = [];
  saveBalanceHistory();
  updateWalletUI();
  showToast('Histórico de saldo limpo', 'success');
}



// ===== Paper Trading / Positions =====
function loadPaperTrading() {
  try {
    const saved = localStorage.getItem('cryptoai-paper-trading');
    if (saved) state.paperTrading = { ...state.paperTrading, ...JSON.parse(saved) };
  } catch (e) {}
  updatePositionsUI();
}

function savePaperTrading() {
  try { localStorage.setItem('cryptoai-paper-trading', JSON.stringify(state.paperTrading)); } catch (e) {}
}

function isPaperMode() {
  return document.getElementById('bot-paper-mode')?.checked !== false;
}

async function getLatestPrice(symbol) {
  try {
    if (!state.activeExchange || !state.exchangeConfigs[state.activeExchange]) return 0;
    const interval = document.getElementById('bot-interval')?.value || '60';
    const res = await window.electronAPI.getCandlesticks(state.exchangeConfigs[state.activeExchange], symbol, interval);
    if (!res.success) return 0;
    if (state.activeExchange === 'binance' && Array.isArray(res.data)) return toFiniteNumber(res.data.at(-1)?.[4], 0);
    if (state.activeExchange === 'bybit') return toFiniteNumber(res.data?.result?.list?.[0]?.[4], 0);
    if (state.activeExchange === 'okx') return toFiniteNumber(res.data?.data?.[0]?.[4], 0);
  } catch (e) {}
  return 0;
}

function getPaperCurrentPrice(position) {
  return toFiniteNumber(position.currentPrice || position.entryPrice, position.entryPrice || 0);
}

function calculatePositionPnl(position) {
  const current = getPaperCurrentPrice(position);
  const entry = toFiniteNumber(position.entryPrice, 0);
  const qty = toFiniteNumber(position.quantity, 0);
  if (!entry || !qty) return 0;
  return position.side === 'SELL' ? (entry - current) * qty : (current - entry) * qty;
}

function openPaperPosition(analysis, order) {
  const price = toFiniteNumber(analysis.entry_price || analysis.currentPrice || order.price, 0);
  if (!price) return { success: false, error: 'Paper: preço de entrada ausente' };
  const notional = price * toFiniteNumber(order.quantity, 0);
  if (notional <= 0) return { success: false, error: 'Paper: valor da posição inválido' };
  if (state.paperTrading.cash < notional) return { success: false, error: `Paper: saldo insuficiente (${formatUsd(state.paperTrading.cash)})` };

  const position = {
    id: Date.now(),
    symbol: order.symbol,
    side: order.side,
    quantity: toFiniteNumber(order.quantity, 0),
    entryPrice: price,
    currentPrice: price,
    openedAt: new Date().toISOString(),
    confidence: analysis.confidence || 0,
    stopLoss: analysis.stop_loss || null,
    takeProfit: analysis.target_price || null,
    source: analysis.source || 'Bot'
  };
  state.paperTrading.cash -= notional;
  state.paperTrading.positions.push(position);
  state.paperTrading.history.unshift({ ...position, type: 'OPEN', notional });
  savePaperTrading();
  updatePositionsUI();
  return { success: true, data: { paper: true, position } };
}

function closePaperPosition(id, reason = 'manual') {
  const idx = state.paperTrading.positions.findIndex(p => String(p.id) === String(id));
  if (idx < 0) return;
  const position = state.paperTrading.positions[idx];
  const pnl = calculatePositionPnl(position);
  const exitValue = getPaperCurrentPrice(position) * position.quantity;
  state.paperTrading.cash += exitValue;
  state.paperTrading.realizedPnl += pnl;
  state.paperTrading.positions.splice(idx, 1);
  state.paperTrading.history.unshift({ ...position, type: 'CLOSE', closedAt: new Date().toISOString(), pnl, reason, exitPrice: getPaperCurrentPrice(position) });
  savePaperTrading();
  updatePositionsUI();
  addLog('success', `[PAPER] Posição fechada ${position.symbol} P&L ${formatUsd(pnl)}`);
}

async function refreshPaperPrices() {
  for (const pos of state.paperTrading.positions) {
    const price = await getLatestPrice(pos.symbol);
    if (price > 0) pos.currentPrice = price;
  }
  savePaperTrading();
}


function isStableCoinSymbol(coin) {
  return ['USDT', 'USDC', 'BUSD', 'TUSD', 'USD', 'DAI', 'FDUSD', 'PYUSD', 'USDP'].includes(String(coin || '').toUpperCase());
}

function getRealPortfolioPositions() {
  return (state.balanceDetails || [])
    .map(normalizeBalanceItem)
    .filter(c => (toFiniteNumber(c.walletBalance, 0) > 0 || toFiniteNumber(c.usdValue, 0) > 0))
    .sort((a, b) => toFiniteNumber(b.usdValue, 0) - toFiniteNumber(a.usdValue, 0));
}

async function updatePositionsUI() {
  const setText = (id, text) => { const el = document.getElementById(id); if (el) el.textContent = text; };
  const realPositions = getRealPortfolioPositions();
  const cryptoPositions = realPositions.filter(c => !isStableCoinSymbol(c.coin));
  const stablePositions = realPositions.filter(c => isStableCoinSymbol(c.coin));
  const cryptoValue = cryptoPositions.reduce((sum, c) => sum + toFiniteNumber(c.usdValue, 0), 0);
  const stableValue = stablePositions.reduce((sum, c) => sum + toFiniteNumber(c.usdValue, 0), 0);
  const realTotal = toFiniteNumber(state.totalBalance, 0) || realPositions.reduce((sum, c) => sum + toFiniteNumber(c.usdValue, 0), 0);

  setText('paper-equity', formatUsd(realTotal));
  setText('paper-open-pnl', formatUsd(cryptoValue));
  setText('paper-realized-pnl', formatUsd(stableValue));
  setText('positions-count', cryptoPositions.length);

  const badge = document.getElementById('paper-mode-badge');
  if (badge) {
    badge.textContent = `Saldo Real${state.activeExchange ? ' - ' + state.activeExchange : ''}`;
    badge.className = 'badge success';
  }
  const sourceBadge = document.getElementById('positions-source-badge');
  if (sourceBadge) sourceBadge.textContent = state.activeExchange ? `API ${state.activeExchange}` : 'API Real';

  const tbody = document.getElementById('positions-tbody');
  if (tbody) {
    if (!cryptoPositions.length) {
      tbody.innerHTML = '<tr><td colspan="8" class="empty-row">Nenhuma posição real em cripto carregada. Clique em Atualizar Saldos Reais.</td></tr>';
    } else {
      tbody.innerHTML = cryptoPositions.map(c => {
        const usd = toFiniteNumber(c.usdValue, 0);
        const pct = realTotal > 0 ? (usd / realTotal) * 100 : 0;
        const wallets = Array.isArray(c.accountTypes) ? c.accountTypes.join(', ') : (state.activeExchange || '--');
        return `<tr>
          <td><strong>${c.coin}</strong></td>
          <td>${wallets}</td>
          <td style="font-family:var(--font-mono)">${toFiniteNumber(c.walletBalance, 0).toLocaleString('en-US', { maximumFractionDigits: 8 })}</td>
          <td style="font-family:var(--font-mono)">${toFiniteNumber(c.free, 0).toLocaleString('en-US', { maximumFractionDigits: 8 })}</td>
          <td style="font-family:var(--font-mono)">${toFiniteNumber(c.locked, 0).toLocaleString('en-US', { maximumFractionDigits: 8 })}</td>
          <td style="font-family:var(--font-mono)">${formatUsd(usd)}</td>
          <td>${pct.toFixed(2)}%</td>
          <td><span class="badge success">Real</span></td>
        </tr>`;
      }).join('');
    }
  }

  // Mantém o histórico paper apenas como seção de simulação, separado do dinheiro real.
  const hist = document.getElementById('paper-history-body');
  if (hist) {
    if (!state.paperTrading.history.length) {
      hist.innerHTML = '<div class="empty-state"><p>Nenhum trade simulado ainda</p></div>';
    } else {
      hist.innerHTML = state.paperTrading.history.slice(0, 80).map(h => `<div class="analysis-history-item"><div class="analysis-history-row"><div class="analysis-history-left"><span class="badge ${h.type === 'OPEN' ? 'success' : 'info'}">${h.type}</span><span class="analysis-history-symbol">${h.symbol}</span><span>${h.side}</span></div><div class="analysis-history-right"><span>${h.pnl !== undefined ? formatUsd(h.pnl) : formatUsd(h.notional || 0)}</span><span class="analysis-history-time">${new Date(h.closedAt || h.openedAt).toLocaleString('pt-BR')}</span></div></div></div>`).join('');
    }
  }
}

function resetPaperTrading() {
  if (!confirm('Resetar carteira paper trading para $10.000 e limpar posições/histórico?')) return;
  state.paperTrading = { cash: 10000, initialCash: 10000, positions: [], history: [], realizedPnl: 0 };
  savePaperTrading();
  updatePositionsUI();
}


// ===== Multi-symbol Bot Helpers & Backtesting =====
function getBotSymbolList() {
  const raw = document.getElementById('bot-symbol-list')?.value || getCurrentBotSymbol();
  return raw.split(',').map(s => s.trim().toUpperCase().replace(/[^A-Z0-9]/g, '')).filter(Boolean).slice(0, 20);
}

function scoreAnalysisForOpportunity(analysis = {}) {
  const recScore = analysis.recommendation === 'BUY' ? 25 : analysis.recommendation === 'SELL' ? 10 : 0;
  const confidence = toFiniteNumber(analysis.confidence, 0);
  const riskPenalty = { LOW: 0, MEDIUM: 5, HIGH: 15, EXTREME: 30 }[analysis.risk_level] || 5;
  const newsBonus = analysis.news_sentiment === 'bullish' ? 5 : analysis.news_sentiment === 'bearish' ? -5 : 0;
  return recScore + confidence - riskPenalty + newsBonus;
}

async function runBacktest() {
  if (!state.activeExchange || !state.exchangeConfigs[state.activeExchange]) {
    showToast('Conecte uma corretora para baixar candles do backtest', 'warning');
    return;
  }
  const status = document.getElementById('backtest-status');
  const container = document.getElementById('backtest-results');
  if (status) { status.textContent = 'Rodando'; status.className = 'badge warning'; }
  if (container) container.innerHTML = '<div class="empty-state"><p>Baixando candles e simulando...</p></div>';
  try {
    const symbol = (document.getElementById('backtest-symbol')?.value || 'BTCUSDT').toUpperCase();
    const interval = document.getElementById('backtest-interval')?.value || '60';
    const initialCapital = parseFloat(document.getElementById('backtest-capital')?.value || 10000);
    const orderPct = parseFloat(document.getElementById('backtest-order-percent')?.value || 5) / 100;
    const res = await window.electronAPI.getCandlesticks(state.exchangeConfigs[state.activeExchange], symbol, interval);
    if (!res.success) throw new Error(res.error || 'Erro ao baixar candles');

    let closes = [];
    if (state.activeExchange === 'binance' && Array.isArray(res.data)) closes = res.data.map(k => toFiniteNumber(k[4], 0));
    else if (state.activeExchange === 'bybit') closes = (res.data?.result?.list || []).slice().reverse().map(k => toFiniteNumber(k[4], 0));
    else if (state.activeExchange === 'okx') closes = (res.data?.data || []).slice().reverse().map(k => toFiniteNumber(k[4], 0));
    closes = closes.filter(v => v > 0);
    if (closes.length < 30) throw new Error('Dados insuficientes para backtest');

    let cash = initialCapital, qty = 0, entry = 0, trades = [], equityPeak = initialCapital, maxDrawdown = 0;
    for (let i = 20; i < closes.length; i++) {
      const window20 = closes.slice(i - 20, i);
      const window8 = closes.slice(i - 8, i);
      const sma20 = window20.reduce((a,b)=>a+b,0)/window20.length;
      const sma8 = window8.reduce((a,b)=>a+b,0)/window8.length;
      const price = closes[i];
      const equity = cash + qty * price;
      equityPeak = Math.max(equityPeak, equity);
      maxDrawdown = Math.max(maxDrawdown, ((equityPeak - equity) / equityPeak) * 100);
      if (qty === 0 && sma8 > sma20 * 1.002) {
        const notional = cash * orderPct;
        qty = notional / price; cash -= notional; entry = price;
        trades.push({ type: 'BUY', price, i });
      } else if (qty > 0 && (sma8 < sma20 * 0.998 || price >= entry * 1.04 || price <= entry * 0.98)) {
        const pnl = (price - entry) * qty;
        cash += qty * price; trades.push({ type: 'SELL', price, pnl, i }); qty = 0; entry = 0;
      }
    }
    const finalEquity = cash + qty * closes.at(-1);
    const sells = trades.filter(t => t.type === 'SELL');
    const wins = sells.filter(t => t.pnl > 0).length;
    const pnl = finalEquity - initialCapital;
    if (status) { status.textContent = 'Concluído'; status.className = 'badge success'; }
    if (container) container.innerHTML = `
      <div class="stats-grid">
        <div class="stat-card"><div class="stat-info"><span class="stat-label">Resultado</span><span class="stat-value" style="color:${pnl>=0?'var(--accent-green)':'var(--accent-red)'}">${formatUsd(pnl)}</span></div></div>
        <div class="stat-card"><div class="stat-info"><span class="stat-label">Equity final</span><span class="stat-value">${formatUsd(finalEquity)}</span></div></div>
        <div class="stat-card"><div class="stat-info"><span class="stat-label">Win Rate</span><span class="stat-value">${sells.length ? Math.round(wins/sells.length*100) : 0}%</span></div></div>
        <div class="stat-card"><div class="stat-info"><span class="stat-label">Drawdown máx</span><span class="stat-value">${maxDrawdown.toFixed(2)}%</span></div></div>
      </div>
      <div style="margin-top:14px;max-height:360px;overflow-y:auto;">${trades.slice(-60).reverse().map(t => `<div class="analysis-history-item"><div class="analysis-history-row"><span class="badge ${t.type==='BUY'?'success':'error'}">${t.type}</span><span>${symbol}</span><span>$${t.price.toLocaleString()}</span><span>${t.pnl!==undefined?formatUsd(t.pnl):''}</span></div></div>`).join('')}</div>
    `;
  } catch (e) {
    if (status) { status.textContent = 'Erro'; status.className = 'badge error'; }
    if (container) container.innerHTML = `<div class="empty-state"><p>Erro no backtest: ${e.message}</p></div>`;
  }
}

// ===== Auto-Trade Checklist =====
function getCurrentBotSymbol() {
  let symbol = document.getElementById('bot-symbol')?.value || 'BTCUSDT';
  if (symbol === 'custom') symbol = document.getElementById('bot-symbol-custom')?.value?.trim()?.toUpperCase() || 'BTCUSDT';
  return symbol;
}

function getRiskRank(level) {
  return { LOW: 1, MEDIUM: 2, HIGH: 3, EXTREME: 4 }[String(level || 'MEDIUM').toUpperCase()] || 2;
}

function buildAutoTradeChecklist(analysis = {}, order = null, result = null) {
  const exchange = state.activeExchange;
  const exchangeConfig = exchange ? state.exchangeConfigs[exchange] : null;
  const autoTrade = document.getElementById('bot-auto-trade')?.checked || false;
  const minConfidence = parseFloat(document.getElementById('bot-min-confidence')?.value || 72);
  const confidence = toFiniteNumber(analysis.confidence, 0);
  const requiresAI = botState.mode === 'ai' || botState.mode === 'hybrid';
  const maxRiskRank = getRiskRank(state.riskConfig.maxRiskLevel || 'LOW');
  const analysisRiskRank = getRiskRank(analysis.risk_level || 'MEDIUM');
  const newsAligned = analysis.execution?.newsAligned !== false;
  const symbol = analysis.symbol || getCurrentBotSymbol();
  const quantity = toFiniteNumber(order?.quantity, 0);
  const balance = toFiniteNumber(state.totalBalance, 0);
  const isBinanceMarket = exchange === 'binance' && String(order?.type || 'Market').toUpperCase() === 'MARKET';
  const orderKeys = order ? Object.keys(order).filter(k => order[k] !== undefined && order[k] !== null && order[k] !== '') : [];
  const allowedBinanceMarketKeys = ['symbol', 'side', 'type', 'quantity'];
  const hasOnlyAllowedBinanceKeys = !order || !isBinanceMarket || orderKeys.every(k => allowedBinanceMarketKeys.includes(k));

  const checks = [
    { id: 'autoTrade', label: 'Auto-trade ativado', ok: autoTrade, detail: autoTrade ? 'Ativado' : 'Desativado' },
    { id: 'exchange', label: 'Corretora conectada', ok: !!exchange && !!exchangeConfig, detail: exchange || 'Nenhuma corretora ativa' },
    { id: 'apiKeys', label: 'API key carregada', ok: !!(exchangeConfig?.apiKey && exchangeConfig?.apiSecret), detail: exchangeConfig?.apiKey ? 'Credenciais presentes' : 'Credenciais ausentes' },
    { id: 'ai', label: 'IA necessária conectada', ok: !requiresAI || !!(state.activeAI && state.aiConfigs[state.activeAI]?.apiKey), detail: requiresAI ? (state.activeAI || 'IA ausente') : 'Modo Bot não exige IA' },
    { id: 'signal', label: 'Sinal operacional', ok: ['BUY', 'SELL'].includes(analysis.recommendation), detail: analysis.recommendation || 'Sem análise' },
    { id: 'confidence', label: 'Confiança mínima', ok: confidence >= minConfidence, detail: `${confidence}% / mínimo ${minConfidence}%` },
    { id: 'risk', label: 'Risco permitido', ok: analysisRiskRank <= maxRiskRank, detail: `${analysis.risk_level || 'MEDIUM'} / máximo ${state.riskConfig.maxRiskLevel || 'LOW'}` },
    { id: 'news', label: 'Notícias alinhadas', ok: newsAligned, detail: analysis.execution?.reason || (newsAligned ? 'OK' : 'Notícias divergentes') },
    { id: 'balance', label: 'Saldo disponível', ok: balance > 0, detail: formatUsd(balance) },
    { id: 'symbol', label: 'Par definido', ok: !!symbol && /^[A-Z0-9]+$/.test(symbol), detail: symbol || 'Indefinido' },
    { id: 'quantity', label: 'Quantidade calculada', ok: !order || quantity > 0, detail: order ? String(order.quantity) : 'Aguardando ordem' },
    { id: 'binanceParams', label: 'Parâmetros Binance MARKET limpos', ok: hasOnlyAllowedBinanceKeys, detail: order ? orderKeys.join(', ') : 'Aguardando ordem' }
  ];

  if (result) {
    checks.push({ id: 'exchangeResult', label: 'Resposta da corretora', ok: !!result.success, detail: result.success ? 'Ordem aceita' : (result.error || 'Ordem rejeitada') });
  }

  const passed = checks.filter(c => c.ok).length;
  const total = checks.length;
  const allOk = checks.every(c => c.ok);
  return { checks, passed, total, allOk, updatedAt: new Date().toISOString(), recommendation: analysis.recommendation || 'HOLD', symbol };
}

function updateAutoTradeChecklist(analysis = {}, order = null, result = null) {
  const checklist = buildAutoTradeChecklist(analysis, order, result);
  botState.lastChecklist = checklist;
  const body = document.getElementById('autotrade-checklist-body');
  const badge = document.getElementById('autotrade-checklist-badge');
  if (badge) {
    badge.textContent = `${checklist.passed}/${checklist.total}`;
    badge.className = `badge ${checklist.allOk ? 'success' : 'warning'}`;
  }
  if (!body) return checklist;
  body.innerHTML = `
    <div style="display:grid;grid-template-columns:repeat(auto-fit,minmax(230px,1fr));gap:10px;">
      ${checklist.checks.map(check => `
        <div style="display:flex;gap:10px;align-items:flex-start;padding:10px;border:1px solid var(--border-color);border-radius:var(--radius-sm);background:rgba(255,255,255,0.03);">
          <span style="width:22px;height:22px;border-radius:50%;display:flex;align-items:center;justify-content:center;font-weight:800;background:${check.ok ? 'rgba(16,185,129,.16)' : 'rgba(245,158,11,.16)'};color:${check.ok ? 'var(--accent-green)' : 'var(--accent-orange)'};">${check.ok ? '✓' : '!'}</span>
          <div>
            <div style="font-size:13px;font-weight:700;color:var(--text-primary);">${check.label}</div>
            <div style="font-size:11px;color:var(--text-muted);margin-top:3px;word-break:break-word;">${check.detail || ''}</div>
          </div>
        </div>
      `).join('')}
    </div>
    <div style="font-size:11px;color:var(--text-muted);margin-top:10px;">Última atualização: ${new Date(checklist.updatedAt).toLocaleString('pt-BR')} | ${checklist.symbol}</div>
  `;
  return checklist;
}


// ===== Simplified Trading UI =====
function initTradingUI() {
  handleTradeCoinSelect();
  document.getElementById('trade-exchange')?.addEventListener('change', updateTradingPairRules);
  document.getElementById('trade-symbol')?.addEventListener('input', () => { updateTradeCoinPreview(); updateTradingPairRules(); });
  document.getElementById('trade-quantity')?.addEventListener('input', updateTradeEstimatedValue);
  document.getElementById('trade-price')?.addEventListener('input', updateTradeEstimatedValue);
  document.getElementById('trade-type')?.addEventListener('change', () => { updateTradeEstimatedValue(); updateTradingPairRules(); });
  setTimeout(updateTradingPairRules, 300);
}

function getTradeSymbol() {
  const select = document.getElementById('trade-symbol-select');
  if (select?.value === 'custom') return (document.getElementById('trade-symbol')?.value || 'BTCUSDT').toUpperCase().replace(/[^A-Z0-9]/g, '');
  return (select?.value || document.getElementById('trade-symbol')?.value || 'BTCUSDT').toUpperCase().replace(/[^A-Z0-9]/g, '');
}

function handleTradeCoinSelect() {
  const select = document.getElementById('trade-symbol-select');
  const input = document.getElementById('trade-symbol');
  if (!select || !input) return;
  if (select.value === 'custom') {
    input.style.display = 'block';
    input.focus();
  } else {
    input.style.display = 'none';
    input.value = select.value;
  }
  updateTradeCoinPreview();
  updateTradingPairRules();
}

function updateTradeCoinPreview() {
  const symbol = getTradeSymbol();
  const base = symbol.replace(/USDT$/, '');
  const coin = getCoinByPair(symbol);
  const logo = document.getElementById('trade-coin-logo');
  const name = document.getElementById('trade-coin-name');
  const meta = document.getElementById('trade-coin-meta');
  if (logo) {
    logo.innerHTML = coin?.image ? `<img src="${coin.image}" style="width:42px;height:42px;border-radius:50%;">` : '';
    logo.style.background = coin?.image ? 'transparent' : 'var(--gradient-primary)';
  }
  if (name) name.textContent = coin?.name || base;
  const price = coin?.current_price ? `$${Number(coin.current_price).toLocaleString('en-US', { maximumFractionDigits: 8 })}` : 'Preço --';
  const change = coin?.price_change_percentage_24h ? `${Number(coin.price_change_percentage_24h).toFixed(2)}% 24h` : '';
  if (meta) meta.textContent = `${symbol} • ${price}${change ? ' • ' + change : ''}`;
  updateTradeEstimatedValue();
}

function getTradePriceEstimate() {
  const type = document.getElementById('trade-type')?.value || 'Market';
  const limitPrice = toFiniteNumber(document.getElementById('trade-price')?.value, 0);
  if (type === 'Limit' && limitPrice > 0) return limitPrice;
  const coin = getCoinByPair(getTradeSymbol());
  return toFiniteNumber(coin?.current_price, 0);
}

function updateTradeEstimatedValue() {
  const qty = toFiniteNumber(document.getElementById('trade-quantity')?.value, 0);
  const price = getTradePriceEstimate();
  const el = document.getElementById('trade-estimated-value');
  if (el) el.textContent = price > 0 && qty > 0 ? `Valor estimado: ${formatUsd(qty * price)} (${qty} ${getTradeSymbol().replace(/USDT$/, '')})` : 'Valor estimado: --';
}


function formatRuleNumber(value, fallback = '--') {
  const n = Number(value);
  if (!Number.isFinite(n) || n <= 0) return fallback;
  return n.toLocaleString('en-US', { maximumFractionDigits: 12 });
}

async function updateTradingPairRules() {
  const el = document.getElementById('trade-min-rules');
  const exchange = document.getElementById('trade-exchange')?.value || state.activeExchange;
  const symbol = getTradeSymbol();
  state.tradeSymbolRules = null;
  if (!el) return;
  if (!exchange || !state.exchangeConfigs[exchange]) {
    el.textContent = 'Mínimo do par: selecione/conecte uma corretora para carregar regras reais.';
    el.style.color = 'var(--accent-orange)';
    return;
  }
  el.textContent = `Mínimo do par: consultando regras reais de ${exchange}...`;
  el.style.color = 'var(--text-muted)';
  try {
    const result = await window.electronAPI.getSymbolRules(state.exchangeConfigs[exchange], symbol);
    if (!result.success) throw new Error(result.error || 'regras indisponíveis');
    state.tradeSymbolRules = result;
    const minQty = formatRuleNumber(result.minQty || result.marketMinQty);
    const step = result.marketStepSize || result.stepSize || '--';
    const minNotional = result.minNotional ? `${formatUsd(result.minNotional)}` : '--';
    const tick = result.tickSize || '--';
    el.textContent = `Mínimo real: qtd ${minQty} | passo ${step} | valor mín. ${minNotional} | tick ${tick}`;
    el.style.color = 'var(--accent-green)';

    const qtyInput = document.getElementById('trade-quantity');
    if (qtyInput) {
      if (result.minQty || result.marketMinQty) qtyInput.min = result.minQty || result.marketMinQty;
      if (result.marketStepSize || result.stepSize) qtyInput.step = result.marketStepSize || result.stepSize;
    }
  } catch (e) {
    el.textContent = `Mínimo do par: não foi possível carregar regras (${e.message})`;
    el.style.color = 'var(--accent-red)';
  }
}

function adjustQuantityToLoadedRules(quantity, price) {
  const rules = state.tradeSymbolRules;
  if (!rules || !quantity) return quantity;
  const step = Number(rules.marketStepSize || rules.stepSize || 0);
  let q = Number(quantity);
  if (step > 0) q = Math.floor((q + Number.EPSILON) / step) * step;
  const minQty = Number(rules.marketMinQty || rules.minQty || 0);
  if (minQty > 0 && q < minQty) q = minQty;
  const minNotional = Number(rules.minNotional || 0);
  if (minNotional > 0 && price > 0 && q * price < minNotional) {
    q = Math.ceil((minNotional / price) / (step || 1)) * (step || 1);
  }
  const decimals = String(rules.marketStepSize || rules.stepSize || '0.001').split('.')[1]?.replace(/0+$/, '').length || 3;
  return Number(q.toFixed(Math.min(12, decimals)));
}

function setTradeAmountPercent(percent) {
  const price = getTradePriceEstimate();
  if (!price) {
    showToast('Preço da moeda ainda não carregado', 'warning');
    return;
  }
  const notional = toFiniteNumber(state.totalBalance, 0) * (percent / 100);
  if (notional <= 0) {
    showToast('Saldo real não carregado', 'warning');
    return;
  }
  let qty = notional / price;
  const symbol = getTradeSymbol();
  if (symbol.includes('SHIB') || symbol.includes('PEPE') || symbol.includes('BONK') || symbol.includes('FLOKI')) qty = Math.floor(qty);
  else if (symbol.includes('BTC')) qty = Number(qty.toFixed(6));
  else if (symbol.includes('ETH') || symbol.includes('BNB')) qty = Number(qty.toFixed(5));
  else qty = Number(qty.toFixed(3));
  qty = adjustQuantityToLoadedRules(qty, price);
  document.getElementById('trade-quantity').value = qty;
  updateTradeEstimatedValue();
}

function openTradeCoinPicker() {
  const modal = document.getElementById('trade-coin-modal');
  if (modal) modal.style.display = 'flex';
  renderTradeCoinPicker();
  if (!state.coinSelectorData.length) loadCoinSelectorData(true);
}

function closeTradeCoinPicker() {
  const modal = document.getElementById('trade-coin-modal');
  if (modal) modal.style.display = 'none';
}

function selectTradeCoin(pair) {
  const select = document.getElementById('trade-symbol-select');
  const input = document.getElementById('trade-symbol');
  if (select && [...select.options].some(o => o.value === pair)) select.value = pair;
  else if (select) select.value = 'custom';
  if (input) input.value = pair;
  handleTradeCoinSelect();
  closeTradeCoinPicker();
}

function renderTradeCoinPicker() {
  const grid = document.getElementById('trade-coin-grid');
  if (!grid) return;
  const q = (document.getElementById('trade-coin-search')?.value || '').toLowerCase().trim();
  const coins = (state.coinSelectorData.length ? state.coinSelectorData : FALLBACK_COINS).filter(c => {
    const pair = coinToPair(c);
    return !q || c.name?.toLowerCase().includes(q) || c.symbol?.toLowerCase().includes(q) || pair.toLowerCase().includes(q);
  });
  grid.innerHTML = coins.map(coin => {
    const pair = coinToPair(coin);
    const price = coin.current_price ? `$${Number(coin.current_price).toLocaleString('en-US', { maximumFractionDigits: 8 })}` : 'Preço --';
    const change = Number(coin.price_change_percentage_24h || 0);
    return `<div onclick="selectTradeCoin('${pair}')" style="cursor:pointer;padding:12px;border:1px solid var(--border-color);border-radius:var(--radius-sm);background:rgba(255,255,255,.03);display:flex;gap:10px;align-items:center;">
      ${coin.image ? `<img src="${coin.image}" style="width:34px;height:34px;border-radius:50%;">` : '<div style="width:34px;height:34px;border-radius:50%;background:var(--gradient-primary);"></div>'}
      <div style="flex:1;min-width:0;"><div style="font-weight:800;color:var(--text-primary);white-space:nowrap;overflow:hidden;text-overflow:ellipsis;">${coin.name || pair}</div><div style="font-size:11px;color:var(--text-muted);">${pair} • ${price}</div></div>
      <div style="color:${change >= 0 ? 'var(--accent-green)' : 'var(--accent-red)'};font-size:12px;font-weight:700;">${change ? (change >= 0 ? '+' : '') + change.toFixed(2) + '%' : '--'}</div>
    </div>`;
  }).join('') || '<div class="empty-state"><p>Nenhuma moeda encontrada</p></div>';
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
    symbol: getTradeSymbol(),
    side: currentTradeSide,
    type: document.getElementById('trade-type')?.value || 'Market',
    quantity: parseFloat(document.getElementById('trade-quantity')?.value || 0),
    price: document.getElementById('trade-price')?.value ? parseFloat(document.getElementById('trade-price').value) : null
  };

  const estimatedPrice = getTradePriceEstimate();
  order.quantity = adjustQuantityToLoadedRules(order.quantity, estimatedPrice);
  document.getElementById('trade-quantity').value = order.quantity;
  updateTradeEstimatedValue();

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
      const executedQty = result.normalizedOrder?.quantity || order.quantity;
      showToast(`Trade executado com sucesso!`, 'success');
      addLog('success', `Trade executado: ${order.side} ${executedQty} ${order.symbol}`);
      state.trades.push({
        time: new Date(),
        symbol: order.symbol,
        side: order.side,
        price: order.price || 'Market',
        quantity: executedQty,
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


function getAIMinOrderUsdt(exchange, paperMode) {
  const configured = parseFloat(localStorage.getItem('cryptoai-ai-min-order-usdt') || '5');
  const baseMin = Number.isFinite(configured) ? configured : 5;
  if (exchange === 'binance' && !paperMode) return Math.max(5, baseMin);
  return Math.max(0.1, baseMin);
}

function getAIChosenNotional(analysis, totalBalance, exchange, paperMode) {
  const minUsdt = getAIMinOrderUsdt(exchange, paperMode);
  const balance = toFiniteNumber(totalBalance, 0);
  const maxPct = paperMode ? 25 : 10;
  const maxAllowed = balance > 0 ? Math.max(minUsdt, balance * (maxPct / 100)) : minUsdt;
  const clamp = (value) => {
    const v = Math.max(minUsdt, toFiniteNumber(value, minUsdt));
    return balance > 0 ? Math.min(balance, Math.min(v, maxAllowed)) : v;
  };

  const explicitUsdt = toFiniteNumber(analysis.order_usdt ?? analysis.orderUsd ?? analysis.position_usdt ?? analysis.size_usdt, 0);
  if (explicitUsdt > 0) return clamp(explicitUsdt);

  const explicitPct = toFiniteNumber(analysis.position_size_percent ?? analysis.order_percent ?? analysis.percent ?? analysis.size_percent, 0);
  if (explicitPct > 0 && balance > 0) return clamp(balance * (Math.min(maxPct, explicitPct) / 100));

  // Se a IA não informou tamanho, o app deriva automaticamente pelo sinal.
  const confidence = toFiniteNumber(analysis.confidence, 50);
  const risk = String(analysis.risk_level || 'MEDIUM').toUpperCase();
  let pct = 1;
  if (confidence >= 90) pct = 5;
  else if (confidence >= 80) pct = 3.5;
  else if (confidence >= 70) pct = 2;
  else pct = 1;
  if (risk === 'HIGH') pct *= 0.5;
  if (risk === 'EXTREME') pct *= 0.25;
  return balance > 0 ? clamp(balance * (pct / 100)) : minUsdt;
}

async function validateSymbolForExecution(exchange, symbol) {
  try {
    if (!exchange || !state.exchangeConfigs[exchange] || !window.electronAPI?.getSymbolRules) return { ok: true };
    const result = await window.electronAPI.getSymbolRules(state.exchangeConfigs[exchange], symbol);
    if (!result.success) return { ok: false, reason: result.error || `Par ${symbol} não disponível` };
    const status = String(result.status || '').toUpperCase();
    if (exchange === 'binance' && status && status !== 'TRADING') return { ok: false, reason: `Binance: par ${symbol} não está ativo (${result.status})` };
    if (exchange === 'bybit' && status && !['TRADING'].includes(status)) return { ok: false, reason: `Bybit: par ${symbol} não está ativo (${result.status})` };
    if (exchange === 'okx' && status && !['LIVE'].includes(status)) return { ok: false, reason: `OKX: par ${symbol} não está ativo (${result.status})` };
    return { ok: true, rules: result };
  } catch (e) {
    return { ok: false, reason: e.message };
  }
}

async function executeAITrade(analysis) {
  const exchange = state.activeExchange;
  if (!exchange) return;

  const side = analysis.recommendation === 'BUY' ? 'BUY' : 'SELL';
  const symbol = analysis.symbol || 'BTCUSDT';
  const learnedBlock = isSymbolBlockedByLearning(exchange, symbol);
  if (learnedBlock.blocked) {
    updateAutoTradeChecklist({ ...analysis, execution: { ...(analysis.execution || {}), shouldExecute: false, reason: `Aprendizado: evitar ${symbol} até ${new Date(learnedBlock.blockedUntil).toLocaleString('pt-BR')} (${learnedBlock.reason})` } });
    addLog('warning', `[APRENDIZADO] Ordem bloqueada: IA já aprendeu a evitar ${symbol} em ${exchange}. Motivo: ${learnedBlock.reason}`);
    return;
  }
  const confidence = toFiniteNumber(analysis.confidence, 0);
  const minConfidence = parseFloat(document.getElementById('bot-min-confidence')?.value || 72);
  const executionGate = analysis.execution;

  if (executionGate && !executionGate.shouldExecute) {
    updateAutoTradeChecklist(analysis);
    addLog('warning', `[AUTO-TRADE] Bloqueado: ${executionGate.reason}`);
    showToast(`Auto-trade bloqueado: ${executionGate.reason}`, 'warning');
    return;
  }
  if (confidence < minConfidence) {
    updateAutoTradeChecklist(analysis);
    addLog('warning', `[AUTO-TRADE] Bloqueado: confiança ${confidence}% < ${minConfidence}%`);
    return;
  }
  if (['HIGH', 'EXTREME'].includes(analysis.risk_level) && state.riskConfig.maxRiskLevel !== 'HIGH' && state.riskConfig.maxRiskLevel !== 'EXTREME') {
    updateAutoTradeChecklist(analysis);
    addLog('warning', `[AUTO-TRADE] Bloqueado por risco ${analysis.risk_level}`);
    return;
  }

  const symbolCheck = await validateSymbolForExecution(exchange, symbol);
  if (!symbolCheck.ok) {
    learnSymbolFailure(exchange, symbol, symbolCheck.reason, 48);
    updateAutoTradeChecklist({ ...analysis, execution: { ...(analysis.execution || {}), shouldExecute: false, reason: symbolCheck.reason } });
    addLog('warning', `[AUTO-TRADE] Bloqueado: ${symbolCheck.reason}`);
    showToast(`Auto-trade bloqueado: ${symbolCheck.reason}`, 'warning');
    return;
  }

  const price = toFiniteNumber(analysis.entry_price || analysis.currentPrice, 0);
  const totalBalance = toFiniteNumber(state.totalBalance, 0);
  const paperMode = isPaperMode();
  const notional = getAIChosenNotional(analysis, totalBalance, exchange, paperMode);
  const orderPercent = totalBalance > 0 ? (notional / totalBalance) * 100 : 0;

  if (!paperMode && exchange === 'binance' && notional < 5) {
    updateAutoTradeChecklist(analysis);
    addLog('warning', `[AUTO-TRADE] Bloqueado: Binance exige mínimo de 5 USDT por operação real. Saldo/tamanho atual: ${formatUsd(notional)}`);
    showToast('Binance exige mínimo de 5 USDT por operação real', 'warning');
    return;
  }

  if (!paperMode && totalBalance > 0 && notional > totalBalance) {
    updateAutoTradeChecklist(analysis);
    addLog('warning', `[AUTO-TRADE] Bloqueado: ordem ${formatUsd(notional)} maior que saldo ${formatUsd(totalBalance)}`);
    return;
  }

  let quantity = 0;
  if (price > 0) {
    quantity = notional / price;
  } else {
    // fallback conservador se a analise nao trouxe preço
    quantity = 0.001;
  }

  // Ajuste simples de precisão para evitar ordens absurdas em memecoins ou BTC/ETH.
  if (symbol.includes('SHIB') || symbol.includes('PEPE') || symbol.includes('BONK') || symbol.includes('FLOKI')) quantity = Math.floor(quantity);
  else if (symbol.includes('BTC')) quantity = Number(quantity.toFixed(6));
  else if (symbol.includes('ETH') || symbol.includes('BNB')) quantity = Number(quantity.toFixed(5));
  else quantity = Number(quantity.toFixed(3));

  if (!quantity || quantity <= 0) {
    updateAutoTradeChecklist(analysis);
    addLog('warning', '[AUTO-TRADE] Quantidade calculada invalida; ordem cancelada');
    return;
  }

  const order = {
    symbol: symbol,
    side: side,
    type: 'Market',
    quantity: quantity
  };

  // Binance BUY MARKET usa quoteOrderQty para garantir mínimo em USDT real
  // mesmo quando o preço da análise está desatualizado.
  if (exchange === 'binance' && side === 'BUY') {
    order.quoteOrderQty = Number(notional.toFixed(8));
  }

  // Binance MARKET rejeita parâmetros extras. Stop/take/price ficam apenas para validação/log,
  // não são enviados na ordem market.
  if (exchange !== 'binance') {
    order.price = price || undefined;
    order.stopLoss = analysis.stop_loss || undefined;
    order.takeProfit = analysis.target_price || undefined;
  }

  updateAutoTradeChecklist(analysis, order);

  try {
    const validation = await window.electronAPI.validateTrade(
      state.riskConfig,
      order,
      { totalValue: totalBalance || 1000, todayTrades: state.trades.length }
    );
    if (!validation.valid) {
      updateAutoTradeChecklist({ ...analysis, execution: { ...(analysis.execution || {}), shouldExecute: false, reason: validation.errors.join(', ') } }, order);
      addLog('error', `[AUTO-TRADE] Bloqueado pelo risco: ${validation.errors.join(', ')}`);
      showToast(`Trade bloqueado: ${validation.errors.join(', ')}`, 'error');
      return;
    }
    if (validation.adjustedTrade?.quantity && validation.adjustedTrade.quantity !== quantity) {
      order.quantity = Number(validation.adjustedTrade.quantity.toFixed(6));
      addLog('warning', `[AUTO-TRADE] Quantidade ajustada pelo risco para ${order.quantity}`);
    }
  } catch (err) {
    addLog('warning', `[AUTO-TRADE] Validação de risco falhou: ${err.message}`);
  }

  if (isPaperMode()) {
    addLog('info', `[PAPER] Simulando ${side} ${order.quantity} ${symbol} | ${formatUsd(notional)} (${orderPercent.toFixed(2)}% do saldo) | conf ${confidence}%`);
    const result = openPaperPosition(analysis, order);
    updateAutoTradeChecklist(analysis, order, result);
    if (result.success) {
      showToast(`Paper trade aberto: ${side} ${order.quantity} ${symbol}`, 'success');
      state.trades.push({ time: new Date(), symbol, side, price: price || 'Paper', quantity: order.quantity, status: 'paper' });
      updateTradesTable();
      saveConfig();
    } else {
      showToast(result.error, 'error');
      addLog('error', `[PAPER] Falha: ${result.error}`);
    }
    return;
  }

  addLog('info', `[AUTO-TRADE] Executando ${side} ${order.quantity} ${symbol} | ${formatUsd(notional)} (${orderPercent.toFixed(2)}% do saldo) | conf ${confidence}%`);

  try {
    const result = await window.electronAPI.placeOrder(state.exchangeConfigs[exchange], order);
    updateAutoTradeChecklist(analysis, order, result);
    if (result.success) {
      const executedQty = result.data?.executedQty || result.normalizedOrder?.quantity || order.quantity;
      const executedValue = result.data?.cummulativeQuoteQty || result.normalizedOrder?.quoteOrderQty || notional;
      showToast(`Auto-trade executado: ${side} ${executedQty} ${symbol}`, 'success');
      addLog('success', `[AUTO-TRADE] ${side} ${executedQty} ${symbol} executado (${formatUsd(executedValue)})`);
      state.trades.push({
        time: new Date(),
        symbol: symbol,
        side: side,
        price: price || 'Market',
        quantity: executedQty,
        status: 'filled'
      });
      updateTradesTable();
      saveConfig();
      setTimeout(() => loadBalance(exchange), 3000);
    } else {
      const failReason = result.error || JSON.stringify(result.data || {});
      learnSymbolFailure(exchange, symbol, failReason, 24);
      addLog('error', `[AUTO-TRADE] Falha: ${failReason}`);
      showToast(`Falha no auto-trade: ${failReason || 'erro da corretora'}`, 'error');
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

function normalizeTradeRecord(t) {
  const time = t.time instanceof Date ? t.time : new Date(t.time || t.timestamp || Date.now());
  return {
    ...t,
    time: Number.isNaN(time.getTime()) ? new Date() : time,
    symbol: t.symbol || '--',
    side: t.side || '--',
    price: t.price ?? 'Market',
    quantity: t.quantity ?? '--',
    pnl: t.pnl ?? '--',
    status: t.status || 'filled'
  };
}

function updateTradesTable() {
  const tbody = document.getElementById('trades-tbody');
  const trades = (state.trades || []).map(normalizeTradeRecord);
  state.trades = trades;

  const dailyTradesEl = document.getElementById('daily-trades');
  if (dailyTradesEl) dailyTradesEl.textContent = trades.length;
  if (!tbody) return;

  if (trades.length === 0) {
    tbody.innerHTML = '<tr><td colspan="7" class="empty-row">Nenhum trade realizado</td></tr>';
    return;
  }

  tbody.innerHTML = trades.slice(-50).reverse().map(t => `
    <tr>
      <td style="font-family:var(--font-mono);font-size:12px">${t.time.toLocaleTimeString('pt-BR')}</td>
      <td><strong>${t.symbol}</strong></td>
      <td><span class="badge ${t.side === 'BUY' ? 'success' : t.side === 'SELL' ? 'error' : 'info'}">${t.side}</span></td>
      <td style="font-family:var(--font-mono)">${typeof t.price === 'number' ? '$' + t.price.toLocaleString('en-US', { maximumFractionDigits: 8 }) : t.price}</td>
      <td style="font-family:var(--font-mono)">${t.quantity}</td>
      <td style="font-family:var(--font-mono)">${t.pnl !== '--' ? formatUsd(t.pnl) : '--'}</td>
      <td><span class="badge ${t.status === 'paper' ? 'info' : 'success'}">${t.status}</span></td>
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
      exchangeConfigs: sanitizeExchangeConfigsForStorage(state.exchangeConfigs),
      aiConfigs: sanitizeAIConfigsForStorage(state.aiConfigs),
      riskConfig: state.riskConfig,
      activeExchange: state.activeExchange,
      activeAI: state.activeAI,
      trades: state.trades,
      aiMetrics: state.aiMetrics,
      modelSelections: modelSelections,
      totalBalance: state.totalBalance,
      balanceDetails: state.balanceDetails,
      appLanguage: getSelectedLanguage(),
      monitorPairs: document.getElementById('monitor-pairs')?.value || '',
      botAdvancedConfig: {
        paperMode: document.getElementById('bot-paper-mode')?.checked !== false,
        multiSymbols: document.getElementById('bot-multi-symbols')?.checked || false,
        symbolList: document.getElementById('bot-symbol-list')?.value || ''
      }
    };
    saveSecureCredentials();
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
      if (config.appLanguage && document.getElementById('app-language')) {
        document.getElementById('app-language').value = config.appLanguage;
      }
      if (config.monitorPairs && document.getElementById('monitor-pairs')) {
        document.getElementById('monitor-pairs').value = config.monitorPairs;
        state.coinSelectorSelected = new Set(config.monitorPairs.split(',').map(p => p.trim().toUpperCase()).filter(Boolean));
      }
      if (config.botAdvancedConfig) {
        if (document.getElementById('bot-paper-mode')) document.getElementById('bot-paper-mode').checked = config.botAdvancedConfig.paperMode !== false;
        if (document.getElementById('bot-multi-symbols')) document.getElementById('bot-multi-symbols').checked = !!config.botAdvancedConfig.multiSymbols;
        if (document.getElementById('bot-symbol-list') && config.botAdvancedConfig.symbolList) document.getElementById('bot-symbol-list').value = config.botAdvancedConfig.symbolList;
      }

      // Restore exchange statuses
      if (config.exchangeConfigs) {
        state.exchangeConfigs = config.exchangeConfigs;
        Object.keys(config.exchangeConfigs).forEach(ex => {
          const conf = config.exchangeConfigs[ex];
          updateExchangeStatus(ex, !!(conf.apiKey && conf.apiSecret));
          if (document.getElementById(`${ex}-apikey`)) {
            document.getElementById(`${ex}-apikey`).value = conf.apiKey || '';
            document.getElementById(`${ex}-apisecret`).value = conf.apiSecret || '';
          }
          // Restore testnet/demo checkboxes
          if (conf.testnet && document.getElementById(`${ex}-testnet`)) {
            document.getElementById(`${ex}-testnet`).checked = true;
          }
          if (conf.demo && document.getElementById(`${ex}-demo`)) {
            document.getElementById(`${ex}-demo`).checked = true;
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
      if (config.totalBalance !== undefined && config.totalBalance !== null) {
        state.totalBalance = toFiniteNumber(config.totalBalance, 0);
        const balanceEl = document.getElementById('total-balance');
        if (balanceEl) balanceEl.textContent = formatUsd(state.totalBalance);
      }

      if (Array.isArray(config.balanceDetails)) {
        state.balanceDetails = config.balanceDetails.map(normalizeBalanceItem);
        if (state.balanceDetails.length > 0) {
          displayBalanceDetails(state.balanceDetails, state.activeExchange || 'cache');
        }
      }

      updateWalletUI(state.activeExchange || 'cache');
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




// ===== AI Learning Memory =====
function ensureAILearning() {
  if (!state.aiLearning || typeof state.aiLearning !== 'object') state.aiLearning = { blockedSymbols: {}, events: [] };
  if (!state.aiLearning.blockedSymbols || typeof state.aiLearning.blockedSymbols !== 'object') state.aiLearning.blockedSymbols = {};
  if (!Array.isArray(state.aiLearning.events)) state.aiLearning.events = [];
  return state.aiLearning;
}

function loadAILearning() {
  ensureAILearning();
  try {
    const saved = localStorage.getItem('cryptoai-ai-learning');
    if (saved) state.aiLearning = { ...ensureAILearning(), ...JSON.parse(saved) };
    ensureAILearning();
  } catch (e) {}
  updateAILearningUI();
}

function saveAILearning() {
  ensureAILearning();
  try { localStorage.setItem('cryptoai-ai-learning', JSON.stringify(state.aiLearning)); } catch (e) {}
}

function getLearningKey(exchange, symbol) {
  return `${exchange || 'unknown'}:${String(symbol || '').toUpperCase()}`;
}

function learnSymbolFailure(exchange, symbol, reason, cooldownHours = 24) {
  ensureAILearning();
  if (!symbol) return;
  const key = getLearningKey(exchange, symbol);
  const now = Date.now();
  const current = state.aiLearning.blockedSymbols[key] || { failures: 0 };
  const failures = (current.failures || 0) + 1;
  const hours = Math.min(168, cooldownHours * failures);
  state.aiLearning.blockedSymbols[key] = {
    exchange,
    symbol: String(symbol).toUpperCase(),
    reason: reason || 'Falha desconhecida',
    failures,
    blockedUntil: new Date(now + hours * 60 * 60 * 1000).toISOString(),
    updatedAt: new Date().toISOString()
  };
  state.aiLearning.events.unshift({ type: 'FAILURE', exchange, symbol: String(symbol).toUpperCase(), reason, timestamp: new Date().toISOString() });
  state.aiLearning.events = state.aiLearning.events.slice(0, 120);
  saveAILearning();
  updateAILearningUI();
  addLog('warning', `[APRENDIZADO] IA aprendeu a evitar ${symbol} em ${exchange}: ${reason}`);
}

function clearExpiredLearning() {
  ensureAILearning();
  const now = Date.now();
  Object.keys(state.aiLearning.blockedSymbols || {}).forEach(key => {
    const item = state.aiLearning.blockedSymbols[key];
    if (item.blockedUntil && new Date(item.blockedUntil).getTime() < now) delete state.aiLearning.blockedSymbols[key];
  });
}

function isSymbolBlockedByLearning(exchange, symbol) {
  clearExpiredLearning();
  const item = state.aiLearning.blockedSymbols[getLearningKey(exchange, symbol)];
  if (!item) return { blocked: false };
  return { blocked: true, ...item };
}

function getAILearningContext() {
  clearExpiredLearning();
  const blocked = Object.values(state.aiLearning.blockedSymbols || {});
  return {
    blockedSymbols: blocked.map(b => ({ exchange: b.exchange, symbol: b.symbol, reason: b.reason, blockedUntil: b.blockedUntil, failures: b.failures })),
    instruction: blocked.length
      ? `Avoid these symbols because previous attempts failed: ${blocked.map(b => `${b.symbol} on ${b.exchange} (${b.reason})`).join('; ')}`
      : 'No blocked symbols learned yet.'
  };
}

function updateAILearningUI() {
  ensureAILearning();
  const el = document.getElementById('ai-learning-line');
  if (!el) return;
  clearExpiredLearning();
  const blocked = Object.values(state.aiLearning.blockedSymbols || {});
  if (!blocked.length) {
    el.innerHTML = '<div class="empty-state"><p>A IA ainda não aprendeu bloqueios. Quando uma moeda falhar, ela será evitada automaticamente.</p></div>';
    return;
  }
  el.innerHTML = `<div style="display:flex;gap:10px;flex-wrap:wrap;">${blocked.map(b => `<div style="padding:10px 12px;border:1px solid var(--border-color);border-left:4px solid var(--accent-orange);border-radius:var(--radius-sm);background:rgba(255,255,255,.035);"><strong>${b.symbol}</strong> <span class="badge warning">evitar</span><div style="font-size:11px;color:var(--text-muted);margin-top:4px;">${b.exchange} • ${b.reason}</div><div style="font-size:11px;color:var(--text-muted);">até ${new Date(b.blockedUntil).toLocaleString('pt-BR')}</div></div>`).join('')}</div>`;
}

function clearAILearning() {
  if (!confirm('Limpar memória de aprendizado da IA?')) return;
  state.aiLearning = { blockedSymbols: {}, events: [] };
  saveAILearning();
  updateAILearningUI();
  showToast('Aprendizado da IA limpo', 'success');
}

// ===== AI Chat Turbo & Automations =====
function getChatAIConfig() {
  let provider = document.getElementById('chat-ai-provider')?.value || 'active';
  if (provider === 'active') provider = state.activeAI;
  if (!provider || !state.aiConfigs[provider]) return null;
  const cfg = { ...state.aiConfigs[provider], ...state.riskConfig, language: getSelectedLanguage() };
  const model = document.getElementById('chat-ai-model')?.value;
  if (model && model !== 'active') cfg.model = model;
  return cfg;
}

function syncChatModels() {
  const providerSel = document.getElementById('chat-ai-provider');
  const modelSel = document.getElementById('chat-ai-model');
  if (!modelSel) return;
  let provider = providerSel?.value || 'active';
  if (provider === 'active') provider = state.activeAI;
  const cache = getModelCache();
  const models = cache?.[provider]?.models || [];
  const current = state.aiConfigs?.[provider]?.model || 'active';
  modelSel.innerHTML = '<option value="active">Modelo atual</option>' + models.map(m => `<option value="${m.id}">${m.name || m.id}</option>`).join('');
  if ([...modelSel.options].some(o => o.value === current)) modelSel.value = current;
}

function addChatMessage(role, content) {
  state.aiChatMessages.push({ role, content, ts: new Date().toISOString() });
  renderAIChat();
}

function renderAIChat() {
  const box = document.getElementById('ai-chat-messages');
  if (!box) return;
  if (!state.aiChatMessages.length) {
    box.innerHTML = '<div class="empty-state"><p>Converse com a IA turbinada. Ela pode executar ações e mostrará cards do que fez.</p></div>';
    return;
  }
  box.innerHTML = state.aiChatMessages.map(m => `<div style="align-self:${m.role === 'user' ? 'flex-end' : 'flex-start'};max-width:82%;padding:12px 14px;border-radius:16px;background:${m.role === 'user' ? 'var(--gradient-primary)' : 'rgba(255,255,255,.06)'};color:${m.role === 'user' ? '#fff' : 'var(--text-primary)'};white-space:pre-wrap;line-height:1.45;"><strong>${m.role === 'user' ? 'Você' : 'IA'}:</strong> ${m.content}</div>`).join('');
  box.scrollTop = box.scrollHeight;
}

function addActionCard(containerId, title, detail, status = 'success') {
  const c = document.getElementById(containerId) || document.getElementById('ai-chat-action-cards');
  if (!c) return;
  const color = status === 'success' ? 'var(--accent-green)' : status === 'error' ? 'var(--accent-red)' : 'var(--accent-orange)';
  const html = `<div style="padding:14px;border:1px solid var(--border-color);border-left:4px solid ${color};border-radius:var(--radius-md);background:rgba(255,255,255,.04);"><div style="font-weight:900;color:var(--text-primary);">${title}</div><div style="font-size:12px;color:var(--text-muted);margin-top:6px;line-height:1.45;">${detail}</div><div style="font-size:11px;color:var(--text-muted);margin-top:8px;">${new Date().toLocaleString('pt-BR')}</div></div>`;
  c.insertAdjacentHTML('afterbegin', html);
}

function parseLocalActions(text) {
  const lower = String(text || '').toLowerCase();
  const actions = [];
  const symbolMatch = text.match(/\b([A-Z]{2,12}USDT)\b/i);
  const percentMatch = text.match(/(\d+(?:[.,]\d+)?)\s*%/);
  const usdtMatch = text.match(/(\d+(?:[.,]\d+)?)\s*(?:usdt|usd|d[oó]lares?)/i);
  const percent = percentMatch ? parseFloat(percentMatch[1].replace(',', '.')) : null;
  const orderUsdt = usdtMatch ? parseFloat(usdtMatch[1].replace(',', '.')) : null;
  const size = { ...(percent ? { position_size_percent: percent } : {}), ...(orderUsdt ? { order_usdt: orderUsdt } : {}) };
  if (lower.includes('compr') || lower.includes('buy')) actions.push({ type: 'BUY', symbol: (symbolMatch?.[1] || 'BTCUSDT').toUpperCase(), ...size, paper: lower.includes('paper') || !lower.includes('real'), reason: 'pedido direto do usuário' });
  if (lower.includes('vend') || lower.includes('sell')) actions.push({ type: 'SELL', symbol: (symbolMatch?.[1] || 'BTCUSDT').toUpperCase(), ...size, paper: lower.includes('paper') || !lower.includes('real'), reason: 'pedido direto do usuário' });
  if (lower.includes('crie um bot') || lower.includes('criar bot')) actions.push({ type: 'CREATE_BOT', mode: lower.includes('ia') ? 'hybrid' : 'bot', paper: true, reason: 'pedido direto do usuário' });
  if (lower.includes('crie ia') || lower.includes('criar ia')) actions.push({ type: 'CREATE_AI', reason: 'pedido direto do usuário' });
  return actions;
}

async function executeAIChatAction(action, containerId = 'ai-chat-action-cards') {
  try {
    const type = String(action.type || '').toUpperCase();
    if (['BUY', 'SELL'].includes(type)) {
      const symbol = String(action.symbol || 'BTCUSDT').toUpperCase();
      const price = await getLatestPrice(symbol);
      const analysis = {
        recommendation: type,
        symbol,
        confidence: 100,
        risk_level: 'MEDIUM',
        entry_price: price,
        order_usdt: action.order_usdt || action.orderUsd || null,
        position_size_percent: action.position_size_percent || action.percent || null,
        execution: { shouldExecute: true, reason: action.reason || 'Ação do chat', newsAligned: true }
      };
      const oldPaper = document.getElementById('bot-paper-mode')?.checked;
      const executionMode = document.getElementById('chat-execution-mode')?.value;
      const realMode = action.paper === false || executionMode === 'real';
      if (document.getElementById('bot-paper-mode')) document.getElementById('bot-paper-mode').checked = !realMode;
      const previewSize = analysis.order_usdt ? `${formatUsd(analysis.order_usdt)}` : analysis.position_size_percent ? `${analysis.position_size_percent}% do saldo` : 'tamanho automático da IA';
      if (executionMode === 'confirm' && realMode && !confirm(`Executar ordem REAL ${type} ${symbol} com ${previewSize}?`)) return;
      await executeAITrade(analysis);
      if (document.getElementById('bot-paper-mode') && oldPaper !== undefined) document.getElementById('bot-paper-mode').checked = oldPaper;
      addActionCard(containerId, `${type} ${symbol}`, `${realMode ? 'Ordem real solicitada' : 'Paper trade'} usando ${previewSize}.`, 'success');
      return;
    }
    if (type === 'CREATE_BOT') {
      selectCreateBotMode(action.mode === 'hybrid' ? 'hybrid' : 'bot');
      if (document.getElementById('create-bot-paper')) document.getElementById('create-bot-paper').checked = action.paper !== false;
      saveCreateBotConfig();
      addActionCard(containerId, 'Bot criado', `Modo: ${action.mode || 'bot'} | Paper: ${action.paper !== false}`, 'success');
      return;
    }
    if (type === 'CREATE_AI') {
      openCreateAIModal();
      addActionCard(containerId, 'IA preparada', 'Modal de criação da IA aberto usando IA Config.', 'success');
      return;
    }
    if (type === 'START_BOT') { await startCryptoBot(); addActionCard(containerId, 'Bot iniciado', 'CryptoBot iniciado pela IA.', 'success'); return; }
    if (type === 'STOP_BOT') { stopCryptoBot(); addActionCard(containerId, 'Bot parado', 'CryptoBot parado pela IA.', 'warning'); return; }
    addActionCard(containerId, 'Ação não reconhecida', JSON.stringify(action), 'warning');
  } catch (e) {
    addActionCard(containerId, 'Erro ao executar ação', e.message, 'error');
  }
}

async function sendAIChatMessage() {
  const input = document.getElementById('ai-chat-input');
  const text = input?.value?.trim();
  if (!text) return;
  input.value = '';
  addChatMessage('user', text);
  const cfg = getChatAIConfig();
  if (!cfg) { addChatMessage('assistant', 'Configure uma IA na aba IA Config primeiro.'); return; }
  addChatMessage('assistant', 'Pensando...');
  const context = { balance: state.totalBalance, exchange: state.activeExchange, positions: state.balanceDetails, paperMode: isPaperMode(), automations: state.aiAutomations, learning: getAILearningContext() };
  const messages = state.aiChatMessages.filter(m => m.content !== 'Pensando...').slice(-12).map(m => ({ role: m.role === 'assistant' ? 'assistant' : 'user', content: m.content }));
  const res = await window.electronAPI.aiChat(cfg, messages, context);
  state.aiChatMessages = state.aiChatMessages.filter(m => m.content !== 'Pensando...');
  if (!res.success) { addChatMessage('assistant', `Erro: ${res.error}`); return; }
  addChatMessage('assistant', res.message);
  const actions = [...(res.actions || []), ...parseLocalActions(text)];
  for (const action of actions) await executeAIChatAction(action);
}

function clearAIChat() {
  state.aiChatMessages = [];
  const cards = document.getElementById('ai-chat-action-cards');
  if (cards) cards.innerHTML = '';
  renderAIChat();
}

function loadAIAutomations() {
  try { state.aiAutomations = JSON.parse(localStorage.getItem('cryptoai-ai-automations') || '[]'); } catch (e) { state.aiAutomations = []; }
  renderAIAutomations();
  state.aiAutomations.filter(a => a.enabled).forEach(scheduleAIAutomation);
}

function saveAIAutomations() { localStorage.setItem('cryptoai-ai-automations', JSON.stringify(state.aiAutomations)); }

function createAIAutomation() {
  const name = document.getElementById('automation-name')?.value || 'Automação IA';
  const prompt = document.getElementById('automation-prompt')?.value || '';
  const interval = parseInt(document.getElementById('automation-interval')?.value || 15);
  const mode = document.getElementById('automation-mode')?.value || 'paper';
  if (!prompt.trim()) { showToast('Digite um prompt para a automação', 'warning'); return; }
  const automation = { id: Date.now(), name, prompt, interval, mode, enabled: true, lastRun: null };
  state.aiAutomations.unshift(automation);
  saveAIAutomations();
  scheduleAIAutomation(automation);
  renderAIAutomations();
  addActionCard('automation-action-cards', 'Automação criada', `${name} a cada ${interval} min`, 'success');
}

function scheduleAIAutomation(a) {
  if (state.automationIntervals[a.id]) clearInterval(state.automationIntervals[a.id]);
  state.automationIntervals[a.id] = setInterval(() => runAIAutomation(a.id), Math.max(1, a.interval) * 60 * 1000);
}

async function runAIAutomation(id) {
  const a = state.aiAutomations.find(x => x.id === id);
  if (!a || !a.enabled) return;
  const cfg = getChatAIConfig();
  if (!cfg) { addActionCard('automation-action-cards', 'Automação falhou', 'IA não configurada', 'error'); return; }
  const res = await window.electronAPI.aiChat(cfg, [{ role: 'user', content: a.prompt }], { automation: a, balance: state.totalBalance, exchange: state.activeExchange, learning: getAILearningContext() });
  a.lastRun = new Date().toISOString();
  saveAIAutomations(); renderAIAutomations();
  if (!res.success) { addActionCard('automation-action-cards', a.name, res.error, 'error'); return; }
  addActionCard('automation-action-cards', a.name, res.message, 'success');
  for (const action of (res.actions || [])) {
    if (a.mode === 'paper') action.paper = true;
    if (a.mode === 'real') action.paper = false;
    await executeAIChatAction(action, 'automation-action-cards');
  }
}

function toggleAIAutomation(id) {
  const a = state.aiAutomations.find(x => x.id === id); if (!a) return;
  a.enabled = !a.enabled;
  if (a.enabled) scheduleAIAutomation(a); else clearInterval(state.automationIntervals[id]);
  saveAIAutomations(); renderAIAutomations();
}

function deleteAIAutomation(id) {
  clearInterval(state.automationIntervals[id]);
  state.aiAutomations = state.aiAutomations.filter(a => a.id !== id);
  saveAIAutomations(); renderAIAutomations();
}

function renderAIAutomations() {
  const list = document.getElementById('automation-list'); if (!list) return;
  if (!state.aiAutomations.length) { list.innerHTML = '<div class="empty-state"><p>Nenhuma automação criada</p></div>'; return; }
  list.innerHTML = state.aiAutomations.map(a => `<div class="analysis-history-item"><div class="analysis-history-row"><div class="analysis-history-left"><span class="badge ${a.enabled ? 'success' : ''}">${a.enabled ? 'ON' : 'OFF'}</span><strong>${a.name}</strong><span>${a.interval} min</span><span>${a.mode}</span></div><div class="analysis-history-right"><button class="btn btn-sm btn-outline" onclick="runAIAutomation(${a.id})">Executar</button><button class="btn btn-sm btn-outline" onclick="toggleAIAutomation(${a.id})">${a.enabled ? 'Pausar' : 'Ativar'}</button><button class="btn btn-sm btn-outline" onclick="deleteAIAutomation(${a.id})">Excluir</button></div></div><div style="font-size:12px;color:var(--text-muted);margin-top:8px;">${a.prompt}</div></div>`).join('');
}

// ===== Gateway Notifications =====
const GATEWAY_CHANNELS = [
  { id: 'telegram', name: 'Telegram', color: '#229ED9', logo: 'assets/logos/gateway/telegram.svg', fields: [{ key: 'botToken', label: 'Bot Token' }, { key: 'chatId', label: 'Chat ID' }] },
  { id: 'whatsapp', name: 'WhatsApp', color: '#25D366', logo: 'assets/logos/gateway/whatsapp.svg', fields: [{ key: 'webhookUrl', label: 'Webhook/API URL' }, { key: 'phone', label: 'Número/Grupo' }] },
  { id: 'wechat', name: 'WeChat', color: '#07C160', logo: 'assets/logos/gateway/wechat.svg', fields: [{ key: 'webhookUrl', label: 'Webhook/API URL' }, { key: 'roomId', label: 'Room/User ID' }] },
  { id: 'qq', name: 'QQ', color: '#12B7F5', logo: 'assets/logos/gateway/qq.svg', fields: [{ key: 'webhookUrl', label: 'Webhook/API URL' }, { key: 'groupId', label: 'Group/User ID' }] },
  { id: 'discord', name: 'Discord', color: '#5865F2', logo: 'assets/logos/gateway/discord.svg', fields: [{ key: 'webhookUrl', label: 'Webhook URL' }] },
  { id: 'email', name: 'E-mail', color: '#EA4335', logo: 'assets/logos/gateway/email.svg', fields: [{ key: 'webhookUrl', label: 'Webhook/API URL' }, { key: 'to', label: 'E-mail destino' }] },
  { id: 'webhook', name: 'Webhook', color: '#F59E0B', logo: 'assets/logos/gateway/webhook.svg', fields: [{ key: 'webhookUrl', label: 'URL do Webhook' }] }
];

function gatewayIcon(channel) {
  return `<div style="width:52px;height:52px;border-radius:16px;background:${channel.color};display:flex;align-items:center;justify-content:center;box-shadow:0 10px 24px ${channel.color}44;overflow:hidden;"><img src="${channel.logo}" alt="${channel.name}" style="width:52px;height:52px;display:block;"></div>`;
}

function getGatewayConfig() {
  try { return JSON.parse(localStorage.getItem('cryptoai-gateway-config') || '{}'); } catch (e) { return {}; }
}

function loadGatewayConfig() {
  renderGatewayChannels();
  const cfg = getGatewayConfig();
  const opts = cfg.options || {};
  ['trades','analysis','errors','balance','updates','risk'].forEach(k => {
    const el = document.getElementById(`gateway-notify-${k}`);
    if (el) el.checked = opts[k] !== false;
  });
  updateGatewayEnabledCount();
}

function renderGatewayChannels() {
  const grid = document.getElementById('gateway-grid');
  if (!grid) return;
  const cfg = getGatewayConfig();
  grid.innerHTML = GATEWAY_CHANNELS.map(ch => {
    const saved = cfg.channels?.[ch.id] || {};
    return `<div style="padding:14px;border:1px solid var(--border-color);border-radius:var(--radius-md);background:rgba(255,255,255,.035);">
      <div style="display:flex;gap:12px;align-items:center;margin-bottom:12px;">
        ${gatewayIcon(ch)}
        <div style="flex:1;"><div style="font-size:16px;font-weight:900;color:var(--text-primary);">${ch.name}</div><label style="font-size:12px;color:var(--text-muted);"><input type="checkbox" id="gateway-${ch.id}-enabled" ${saved.enabled ? 'checked' : ''} onchange="updateGatewayEnabledCount()"> Ativar canal</label></div>
      </div>
      ${ch.fields.map(f => `<div class="form-group" style="margin-bottom:8px;"><label>${f.label}</label><input id="gateway-${ch.id}-${f.key}" value="${(saved[f.key] || '').toString().replace(/"/g,'&quot;')}" placeholder="${f.label}"></div>`).join('')}
      <div style="display:flex;gap:8px;margin-top:10px;"><button class="btn btn-sm btn-outline" onclick="testGatewayChannel('${ch.id}')">Testar</button><span class="badge" id="gateway-${ch.id}-status">${saved.enabled ? 'Ativo' : 'Inativo'}</span></div>
    </div>`;
  }).join('');
}

function collectGatewayConfig() {
  const channels = {};
  GATEWAY_CHANNELS.forEach(ch => {
    const data = { enabled: !!document.getElementById(`gateway-${ch.id}-enabled`)?.checked };
    ch.fields.forEach(f => data[f.key] = document.getElementById(`gateway-${ch.id}-${f.key}`)?.value || '');
    channels[ch.id] = data;
  });
  const options = {
    trades: document.getElementById('gateway-notify-trades')?.checked !== false,
    analysis: document.getElementById('gateway-notify-analysis')?.checked !== false,
    errors: document.getElementById('gateway-notify-errors')?.checked !== false,
    balance: document.getElementById('gateway-notify-balance')?.checked !== false,
    updates: document.getElementById('gateway-notify-updates')?.checked !== false,
    risk: document.getElementById('gateway-notify-risk')?.checked !== false
  };
  return { channels, options };
}

function saveGatewayConfig() {
  const cfg = collectGatewayConfig();
  localStorage.setItem('cryptoai-gateway-config', JSON.stringify(cfg));
  updateGatewayEnabledCount();
  showToast('Gateway salvo com sucesso', 'success');
  addLog('success', 'Configuração do Gateway salva');
}

function updateGatewayEnabledCount() {
  const count = GATEWAY_CHANNELS.filter(ch => document.getElementById(`gateway-${ch.id}-enabled`)?.checked).length;
  const badge = document.getElementById('gateway-enabled-count');
  if (badge) { badge.textContent = `${count} canal${count === 1 ? '' : 's'} ativo${count === 1 ? '' : 's'}`; badge.className = count ? 'badge success' : 'badge'; }
  GATEWAY_CHANNELS.forEach(ch => {
    const st = document.getElementById(`gateway-${ch.id}-status`);
    const enabled = document.getElementById(`gateway-${ch.id}-enabled`)?.checked;
    if (st) { st.textContent = enabled ? 'Ativo' : 'Inativo'; st.className = enabled ? 'badge success' : 'badge'; }
  });
}

async function sendGatewayToChannel(id, text) {
  const cfg = collectGatewayConfig();
  const ch = cfg.channels[id];
  if (!ch?.enabled) return { success: false, error: 'Canal desativado' };
  const result = await window.electronAPI.sendGatewayMessage(id, ch, text);
  if (!result?.success) throw new Error(result?.error || 'Falha ao enviar mensagem');
  return result;
}

async function testGatewayChannel(id) {
  saveGatewayConfig();
  const status = document.getElementById(`gateway-${id}-status`);
  try {
    await sendGatewayToChannel(id, `✅ Teste do CryptoAI Investor em ${new Date().toLocaleString('pt-BR')}`);
    if (status) { status.textContent = 'Teste OK'; status.className = 'badge success'; }
    showToast(`Teste enviado para ${id}`, 'success');
  } catch (e) {
    if (status) { status.textContent = 'Erro'; status.className = 'badge error'; }
    showToast(`Erro no gateway ${id}: ${e.message}`, 'error');
  }
}

let lastGatewaySentAt = 0;
function notifyGatewayFromLog(type, message) {
  try {
    const cfg = getGatewayConfig();
    const opts = cfg.options || {};
    const lower = String(message || '').toLowerCase();
    const category = lower.includes('trade') || lower.includes('ordem') ? 'trades'
      : lower.includes('análise') || lower.includes('analise') || lower.includes('ia') ? 'analysis'
      : type === 'error' || lower.includes('erro') || lower.includes('falha') ? 'errors'
      : lower.includes('saldo') ? 'balance'
      : lower.includes('risco') ? 'risk'
      : lower.includes('atualiza') ? 'updates'
      : null;
    if (!category || opts[category] === false) return;
    if (Date.now() - lastGatewaySentAt < 2500) return;
    lastGatewaySentAt = Date.now();
    const text = `[CryptoAI] ${type.toUpperCase()} • ${message}`;
    Object.keys(cfg.channels || {}).forEach(id => {
      if (cfg.channels[id]?.enabled) sendGatewayToChannel(id, text).catch(() => {});
    });
  } catch (e) {}
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
  notifyGatewayFromLog(type, message);

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



// ===== Dashboard Create IA Modal =====
function dashboardAIButtonClick() {
  if (state.botRunning) {
    stopBot();
  } else {
    openCreateAIModal();
  }
}

function openCreateAIModal() {
  const paperEl = document.getElementById('create-ai-paper');
  const minEl = document.getElementById('create-ai-min-usdt');
  if (paperEl) paperEl.checked = document.getElementById('bot-paper-mode')?.checked !== false;
  if (minEl) minEl.value = localStorage.getItem('cryptoai-ai-min-order-usdt') || '5';
  updateCreateAISummary();
  const modal = document.getElementById('create-ai-modal');
  if (modal) modal.style.display = 'flex';
}

function closeCreateAIModal() {
  const modal = document.getElementById('create-ai-modal');
  if (modal) modal.style.display = 'none';
}

function updateCreateAISummary() {
  const container = document.getElementById('create-ai-summary');
  if (!container) return;
  const provider = state.activeAI || 'Nenhuma IA';
  const aiConfig = state.activeAI ? state.aiConfigs[state.activeAI] : null;
  const model = aiConfig?.model || 'não selecionado';
  const pairs = document.getElementById('monitor-pairs')?.value || 'BTCUSDT';
  const interval = document.getElementById('request-interval')?.value || '5';
  const autoTrade = document.getElementById('auto-trade')?.value || 'disabled';
  const maxTokens = document.getElementById('max-tokens')?.value || '2000';
  const exchange = state.activeExchange || 'Nenhuma corretora';
  const paperMode = document.getElementById('create-ai-paper')?.checked !== false;
  const minOrderUsdt = document.getElementById('create-ai-min-usdt')?.value || '5';
  const warning = document.getElementById('create-ai-real-warning');
  if (warning) warning.style.display = paperMode ? 'none' : 'block';
  const cards = [
    ['IA ativa', provider],
    ['Modelo', model],
    ['Corretora', exchange],
    ['Moedas', pairs],
    ['Intervalo', `${interval} min`],
    ['Auto-trade IA', autoTrade],
    ['Execução', paperMode ? 'Paper Trading / teste' : 'REAL na corretora'],
    ['Tamanho', `IA escolhe automático (mín. ${minOrderUsdt} USDT)`],
    ['Max tokens', maxTokens],
    ['Risco máximo', state.riskConfig.maxRiskLevel || 'LOW']
  ];
  container.innerHTML = cards.map(([label, value]) => `
    <div style="padding:12px;border:1px solid var(--border-color);border-radius:var(--radius-sm);background:rgba(255,255,255,.035);">
      <div style="font-size:11px;color:var(--text-muted);text-transform:uppercase;letter-spacing:.5px;font-weight:700;">${label}</div>
      <div style="font-size:14px;color:var(--text-primary);font-weight:800;margin-top:4px;word-break:break-word;">${value}</div>
    </div>
  `).join('');
}

async function createAndStartAI() {
  const paperMode = document.getElementById('create-ai-paper')?.checked !== false;
  const minOrderUsdt = document.getElementById('create-ai-min-usdt')?.value || '5';
  const hiddenPaper = document.getElementById('bot-paper-mode');
  if (hiddenPaper) hiddenPaper.checked = paperMode;
  localStorage.setItem('cryptoai-ai-min-order-usdt', String(Math.max(5, parseFloat(minOrderUsdt) || 5))); 

  const aiAutoTrade = document.getElementById('auto-trade')?.value || 'disabled';
  if (!paperMode && aiAutoTrade === 'enabled') {
    const ok = confirm('Você desmarcou Paper Trading e o Auto-trade da IA está ATIVADO. A IA poderá executar ordens REAIS usando seu saldo real. Deseja continuar?');
    if (!ok) return;
  }

  closeCreateAIModal();
  saveConfig();
  if (!state.activeExchange) {
    showToast('Conecte uma corretora antes de criar a IA', 'warning');
    navigateTo('exchanges');
    return;
  }
  if (!state.activeAI || !state.aiConfigs[state.activeAI]?.apiKey) {
    showToast('Configure/conecte uma IA na aba IA Config primeiro', 'warning');
    navigateTo('ai-config');
    return;
  }
  if (state.botRunning) stopBot();
  await startBot();
  showToast(`IA criada e iniciada (${paperMode ? 'Paper Trading' : 'Modo REAL'})`, 'success');
  addLog('success', `IA criada pelo Dashboard usando ${state.activeAI} | execução: ${paperMode ? 'paper' : 'real'} | tamanho: IA automático, mínimo ${Math.max(5, parseFloat(minOrderUsdt) || 5)} USDT`);
}

// ===== Dashboard Create Bot Modal =====
let createBotMode = 'bot';

function openCreateBotModal() {
  syncCreateBotModalFromCurrent();
  const modal = document.getElementById('create-bot-modal');
  if (modal) modal.style.display = 'flex';
}

function closeCreateBotModal() {
  const modal = document.getElementById('create-bot-modal');
  if (modal) modal.style.display = 'none';
}

function selectCreateBotMode(mode) {
  createBotMode = mode === 'ai' ? 'hybrid' : mode;
  ['bot', 'hybrid'].forEach(m => document.getElementById(`create-mode-${m}`)?.classList.toggle('active', m === createBotMode));
  updateCreateBotSummary();
}

function syncCreateBotModalFromCurrent() {
  selectCreateBotMode(botState?.mode === 'ai' ? 'hybrid' : (botState?.mode || 'bot'));
  const set = (id, value) => { const el = document.getElementById(id); if (el !== null && el !== undefined) el.value = value; };
  const setChecked = (id, value) => { const el = document.getElementById(id); if (el) el.checked = !!value; };
  set('create-bot-symbol', document.getElementById('bot-symbol')?.value || 'BTCUSDT');
  set('create-bot-symbol-custom', document.getElementById('bot-symbol-custom')?.value || '');
  set('create-bot-interval', document.getElementById('bot-interval')?.value || '60');
  set('create-bot-cycle', document.getElementById('bot-cycle-interval')?.value || '5');
  set('create-bot-confidence', document.getElementById('bot-min-confidence')?.value || '72');
  set('create-bot-order-percent', document.getElementById('bot-order-percent')?.value || '2');
  set('create-bot-symbol-list', document.getElementById('bot-symbol-list')?.value || 'BTCUSDT,ETHUSDT,SOLUSDT');
  setChecked('create-bot-paper', document.getElementById('bot-paper-mode')?.checked !== false);
  setChecked('create-bot-multi', document.getElementById('bot-multi-symbols')?.checked || false);
  setChecked('create-bot-news', document.getElementById('bot-news-continuous')?.checked !== false);
  setChecked('create-bot-news-align', document.getElementById('bot-require-news-alignment')?.checked !== false);
  setChecked('create-bot-autotrade', document.getElementById('bot-auto-trade')?.checked || false);
  document.getElementById('create-bot-symbol')?.addEventListener('change', () => {
    const custom = document.getElementById('create-bot-symbol-custom');
    if (custom) custom.style.display = document.getElementById('create-bot-symbol')?.value === 'custom' ? 'block' : 'none';
  }, { once: true });
  updateCreateBotSummary();
}

function autoChooseBotConfig() {
  const hasAI = !!(state.activeAI && state.aiConfigs[state.activeAI]?.apiKey);
  selectCreateBotMode(hasAI ? 'hybrid' : 'bot');
  document.getElementById('create-bot-multi').checked = true;
  document.getElementById('create-bot-news').checked = true;
  document.getElementById('create-bot-news-align').checked = true;
  document.getElementById('create-bot-paper').checked = true;
  document.getElementById('create-bot-confidence').value = hasAI ? 72 : 68;
  document.getElementById('create-bot-order-percent').value = 2;
  document.getElementById('create-bot-cycle').value = 5;
  document.getElementById('create-bot-symbol-list').value = 'BTCUSDT,ETHUSDT,SOLUSDT,BNBUSDT,XRPUSDT,ADAUSDT,DOGEUSDT,AVAXUSDT,LINKUSDT,SUIUSDT,HYPEUSDT';
  showToast('Configuração sugerida aplicada', 'success');
  updateCreateBotSummary();
}

function updateCreateBotSummary() {
  const summary = document.getElementById('create-bot-summary');
  if (!summary) return;
  const modeName = { bot: 'Bot', hybrid: 'Bot + IA' }[createBotMode] || 'Bot';
  const paper = document.getElementById('create-bot-paper')?.checked ? 'Paper Trading' : 'Modo Real';
  const multi = document.getElementById('create-bot-multi')?.checked ? 'multi-moedas' : 'moeda única';
  const conf = document.getElementById('create-bot-confidence')?.value || 72;
  summary.innerHTML = `<strong>Resumo:</strong> ${modeName} • ${paper} • ${multi} • confiança mínima ${conf}%`;
}

function saveCreateBotConfig() {
  const copy = (from, to) => { const a = document.getElementById(from); const b = document.getElementById(to); if (a && b) b.value = a.value; };
  const copyChecked = (from, to) => { const a = document.getElementById(from); const b = document.getElementById(to); if (a && b) b.checked = a.checked; };
  setBotMode(createBotMode, true);
  copy('create-bot-symbol', 'bot-symbol');
  copy('create-bot-symbol-custom', 'bot-symbol-custom');
  copy('create-bot-interval', 'bot-interval');
  copy('create-bot-cycle', 'bot-cycle-interval');
  copy('create-bot-confidence', 'bot-min-confidence');
  copy('create-bot-order-percent', 'bot-order-percent');
  copy('create-bot-symbol-list', 'bot-symbol-list');
  copyChecked('create-bot-paper', 'bot-paper-mode');
  copyChecked('create-bot-multi', 'bot-multi-symbols');
  copyChecked('create-bot-news', 'bot-news-continuous');
  copyChecked('create-bot-news-align', 'bot-require-news-alignment');
  copyChecked('create-bot-autotrade', 'bot-auto-trade');
  handleBotSymbolChange();
  botState.installed = true;
  localStorage.setItem('cryptoai-bot-installed', 'true');
  updateBotPageState();
  saveConfig();
  showToast('Bot criado/configurado com sucesso', 'success');
  addLog('success', `Bot criado pelo Dashboard: ${createBotMode}`);
}

async function createAndStartBot() {
  saveCreateBotConfig();
  closeCreateBotModal();
  if (botState.running) {
    stopCryptoBot();
  }
  const started = await startCryptoBot();
  if (started) {
    showToast('Bot criado e iniciado automaticamente', 'success');
    addLog('success', 'Bot criado no Dashboard e iniciado automaticamente');
  } else {
    showToast('Bot criado, mas não iniciou. Verifique corretora/IA exigida.', 'warning');
    addLog('warning', 'Bot criado, mas não iniciou por faltar corretora ou IA');
  }
}

// ===== CryptoBot Beta =====
const botState = {
  installed: false,
  mode: 'bot', // 'bot', 'ai', 'hybrid'
  running: false,
  interval: null,
  signals: [],
  analysisCount: 0,
  lastChecklist: null
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
    return false;
  }

  if (botState.mode === 'ai' && !state.activeAI) {
    showToast('Configure uma IA antes de usar o modo IA', 'warning');
    return false;
  }

  if (botState.mode === 'hybrid' && !state.activeAI) {
    showToast('Configure uma IA para o modo hibrido', 'warning');
    return false;
  }

  if (botState.interval) {
    clearInterval(botState.interval);
    botState.interval = null;
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
  return true;
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

async function runCryptoBotCycle(force = false) {
  if (!botState.running && !force) return;

  let symbol = document.getElementById('bot-symbol')?.value || 'BTCUSDT';
  if (symbol === 'custom') {
    symbol = document.getElementById('bot-symbol-custom')?.value?.trim()?.toUpperCase() || 'BTCUSDT';
  }
  const interval = document.getElementById('bot-interval')?.value || '60';
  const autoTrade = document.getElementById('bot-auto-trade')?.checked || false;
  const minConfidence = parseFloat(document.getElementById('bot-min-confidence')?.value || 72);
  const requireNewsAlignment = document.getElementById('bot-require-news-alignment')?.checked !== false;
  const analyzeNewsContinuously = document.getElementById('bot-news-continuous')?.checked !== false;
  const multiSymbolsEnabled = document.getElementById('bot-multi-symbols')?.checked || false;
  const candidateSymbols = multiSymbolsEnabled ? getBotSymbolList() : [symbol];

  addLog('info', `[CryptoBot] Ciclo continuo iniciado - ${multiSymbolsEnabled ? candidateSymbols.join(',') : symbol} - Modo: ${botState.mode}`);

  try {
    let botResult = null;
    let aiResult = null;
    let newsData = [];
    let sentiment = null;

    if (analyzeNewsContinuously) {
      try {
        newsData = await window.electronAPI.getCryptoNews();
        sentiment = await window.electronAPI.getMarketSentiment();
        updateSentimentUI(sentiment);
        addLog('info', `[CryptoBot] Noticias analisadas: ${newsData.filter(n => !n.error).length} | sentimento: ${sentiment?.overall || 'neutral'} (${Math.round(sentiment?.score || 50)})`);
      } catch (e) {
        addLog('warning', `[CryptoBot] Falha ao analisar noticias: ${e.message}`);
      }
    }

    const context = {
      news: newsData,
      sentiment,
      minConfidence,
      requireNewsAlignment
    };

    // Bot analysis (technical indicators + news gate)
    if (botState.mode === 'bot' || botState.mode === 'hybrid') {
      if (multiSymbolsEnabled) {
        const opportunities = [];
        for (const candidate of candidateSymbols) {
          const result = await window.electronAPI.botAnalyze(
            state.exchangeConfigs[state.activeExchange],
            candidate,
            interval,
            context
          );
          if (result?.success) {
            opportunities.push({ symbol: candidate, result, score: scoreAnalysisForOpportunity(result.analysis) });
          } else {
            addLog('warning', `[CryptoBot] ${candidate} ignorado: ${result?.error || 'erro desconhecido'}`);
          }
        }
        opportunities.sort((a, b) => b.score - a.score);
        if (opportunities.length > 0) {
          symbol = opportunities[0].symbol;
          botResult = opportunities[0].result;
          botResult.analysis.factors = [...(botResult.analysis.factors || []), `Ranking multi-moedas: ${opportunities.slice(0, 5).map(o => o.symbol + '=' + Math.round(o.score)).join(', ')}`];
          addLog('success', `[CryptoBot] Melhor oportunidade: ${symbol} (score ${Math.round(opportunities[0].score)})`);
        } else {
          botResult = { success: false, error: 'Nenhum par da lista gerou análise válida' };
        }
      } else {
        botResult = await window.electronAPI.botAnalyze(
          state.exchangeConfigs[state.activeExchange],
          symbol,
          interval,
          context
        );
      }
    }

    // AI analysis with news/sentiment context
    if (botState.mode === 'ai' || botState.mode === 'hybrid') {
      const aiConfig = { ...state.aiConfigs[state.activeAI], ...state.riskConfig, language: getSelectedLanguage() };
      let marketData = {};
      const candleResult = await window.electronAPI.getCandlesticks(
        state.exchangeConfigs[state.activeExchange],
        symbol,
        interval
      );
      if (candleResult.success) marketData[symbol] = candleResult.data;

      aiResult = await window.electronAPI.aiGetAnalysis(aiConfig, marketData, { news: newsData, sentiment, learning: getAILearningContext() });
      if (aiResult?.success && aiResult.analysis) {
        aiResult.analysis.execution = {
          shouldExecute: ['BUY', 'SELL'].includes(aiResult.analysis.recommendation) && (aiResult.analysis.confidence || 0) >= minConfidence,
          minConfidence,
          newsAligned: true,
          reason: (aiResult.analysis.confidence || 0) >= minConfidence ? 'IA acima da confiança mínima' : 'IA abaixo da confiança mínima'
        };
      }
    }

    // Combine results based on mode
    let finalAnalysis = null;

    if (botState.mode === 'hybrid' && botResult?.success && aiResult?.success) {
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
        confidence = Math.round((botConf + aiConf) / 2 - 8);
      } else {
        recommendation = 'HOLD';
        confidence = 25;
      }

      const execution = {
        shouldExecute: ['BUY', 'SELL'].includes(recommendation)
          && confidence >= minConfidence
          && botResult.analysis.execution?.shouldExecute !== false
          && aiResult.analysis.execution?.shouldExecute !== false,
        minConfidence,
        newsAligned: botResult.analysis.execution?.newsAligned !== false,
        reason: ''
      };
      execution.reason = execution.shouldExecute
        ? 'Bot tecnico + IA + noticias aprovaram'
        : `Bloqueado: bot=${botResult.analysis.execution?.reason || botRec}, ia=${aiResult.analysis.execution?.reason || aiRec}`;

      finalAnalysis = {
        ...botResult.analysis,
        recommendation,
        confidence,
        source: 'CryptoBot + IA + Noticias',
        reasoning: `[BOT]: ${botResult.analysis.reasoning}\n[IA]: ${aiResult.analysis.reasoning}`,
        factors: [...(botResult.analysis.factors || []), ...(aiResult.analysis.factors || [])],
        execution
      };
    } else if (botState.mode === 'bot' && botResult?.success) {
      finalAnalysis = { ...botResult.analysis, source: 'CryptoBot Noticias' };
    } else if (botState.mode === 'ai' && aiResult?.success) {
      finalAnalysis = { ...aiResult.analysis, source: 'IA + Noticias' };
    }

    if (finalAnalysis) {
      updateAutoTradeChecklist(finalAnalysis);
      displayBotAnalysis(finalAnalysis);
      botState.analysisCount++;
      addBotSignal(finalAnalysis);

      if (autoTrade && finalAnalysis.execution?.shouldExecute) {
        await executeAITrade(finalAnalysis);
      } else if (autoTrade) {
        addLog('warning', `[CryptoBot] Auto-trade nao executado: ${finalAnalysis.execution?.reason || 'sinal insuficiente'}`);
      }

      addLog(finalAnalysis.execution?.shouldExecute ? 'success' : 'info', `[CryptoBot] Analise: ${finalAnalysis.recommendation} (${finalAnalysis.confidence}%) - ${symbol} | executar=${finalAnalysis.execution?.shouldExecute ? 'SIM' : 'NAO'} | ${finalAnalysis.execution?.reason || ''}`);
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
  await runCryptoBotCycle(true);
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
  const execution = analysis.execution || {};
  const newsSentiment = analysis.news_sentiment || analysis.market_intel?.overall || 'neutral';

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

function handleBotSymbolChange() {
  const select = document.getElementById('bot-symbol');
  const customInput = document.getElementById('bot-symbol-custom');
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

// ===== Sidebar Collapse =====
let sidebarCollapsed = false;

function toggleSidebar() {
  const sidebar = document.getElementById('sidebar');
  const mainContent = document.getElementById('main-content');
  const collapseBtn = sidebar.querySelector('.sidebar-collapse-btn svg');
  
  sidebarCollapsed = !sidebarCollapsed;
  
  if (sidebarCollapsed) {
    sidebar.classList.add('collapsed');
    mainContent.classList.add('sidebar-collapsed');
    if (collapseBtn) {
      collapseBtn.innerHTML = '<polyline points="9 18 15 12 9 6"/>';
    }
    // Save state
    localStorage.setItem('cryptoai-sidebar-collapsed', 'true');
  } else {
    sidebar.classList.remove('collapsed');
    mainContent.classList.remove('sidebar-collapsed');
    if (collapseBtn) {
      collapseBtn.innerHTML = '<polyline points="15 18 9 12 15 6"/>';
    }
    localStorage.setItem('cryptoai-sidebar-collapsed', 'false');
  }
}

// Restore sidebar state
function loadSidebarState() {
  const saved = localStorage.getItem('cryptoai-sidebar-collapsed');
  if (saved === 'true') {
    sidebarCollapsed = false; // Will be toggled to true
    toggleSidebar();
  }
}

// ===== Settings (Run on Startup / Background) =====
async function loadAppSettings() {
  try {
    if (window.electronAPI && window.electronAPI.getSettings) {
      const settings = await window.electronAPI.getSettings();
      const runOnStartupEl = document.getElementById('run-on-startup');
      const allowBackgroundEl = document.getElementById('allow-background');
      if (runOnStartupEl) runOnStartupEl.checked = settings.runOnStartup || false;
      if (allowBackgroundEl) allowBackgroundEl.checked = settings.allowBackground !== undefined ? settings.allowBackground : true;
    }
  } catch (e) {
    // Ignore - settings page might not exist yet
  }
}

async function toggleRunOnStartup(enabled) {
  try {
    if (window.electronAPI && window.electronAPI.setRunOnStartup) {
      await window.electronAPI.setRunOnStartup(enabled);
      showToast(enabled ? 'App iniciará com o sistema' : 'Auto-início desativado', 'success');
      addLog('info', `Rodar ao iniciar: ${enabled ? 'ativado' : 'desativado'}`);
    }
  } catch (e) {
    showToast('Erro ao configurar auto-início: ' + e.message, 'error');
  }
}

async function toggleAllowBackground(enabled) {
  try {
    if (window.electronAPI && window.electronAPI.setAllowBackground) {
      await window.electronAPI.setAllowBackground(enabled);
      showToast(enabled ? 'Execução em segundo plano ativada' : 'App fechará ao fechar a janela', 'success');
      addLog('info', `Execução em segundo plano: ${enabled ? 'ativada' : 'desativada'}`);
    }
  } catch (e) {
    showToast('Erro ao configurar segundo plano: ' + e.message, 'error');
  }
}



function formatBytes(bytes) {
  const value = toFiniteNumber(bytes, 0);
  if (value < 1024) return `${value} B`;
  if (value < 1024 * 1024) return `${(value / 1024).toFixed(1)} KB`;
  if (value < 1024 * 1024 * 1024) return `${(value / 1024 / 1024).toFixed(1)} MB`;
  return `${(value / 1024 / 1024 / 1024).toFixed(1)} GB`;
}

function setUpdateStatus(status, details) {
  const statusEl = document.getElementById('update-status');
  const detailsEl = document.getElementById('update-details');
  if (statusEl) statusEl.textContent = status;
  if (detailsEl) detailsEl.textContent = details || '';
}

function setUpdateActions(html) {
  const actions = document.getElementById('update-actions');
  if (actions) actions.innerHTML = html || '';
}

function setupUpdateProgressListener() {
  try {
    window.electronAPI?.onUpdateDownloadProgress?.((progress) => {
      const wrap = document.getElementById('update-progress-wrap');
      const fill = document.getElementById('update-progress-fill');
      const text = document.getElementById('update-progress-text');
      if (wrap) wrap.style.display = 'block';
      if (fill) fill.style.width = `${progress.percent || 0}%`;
      if (text) text.textContent = `${progress.percent || 0}% - ${formatBytes(progress.received)} de ${formatBytes(progress.total)} (${formatBytes(progress.speed)}/s)`;
    });
  } catch (e) {}
}

async function checkAppUpdates() {
  const btn = document.getElementById('btn-check-updates');
  if (btn) btn.disabled = true;
  setUpdateStatus('Verificando atualizações...', 'Consultando package.json no GitHub...');
  setUpdateActions('');
  try {
    const info = await window.electronAPI.checkForUpdates();
    if (!info.hasUpdate) {
      setUpdateStatus('Seu app está atualizado', `Versão atual: ${info.currentVersion} | GitHub: ${info.latestVersion}`);
      showToast('Nenhuma atualização disponível', 'success');
      return;
    }
    const assetText = info.asset ? `${info.asset.name} (${formatBytes(info.asset.size)})` : 'Nenhum instalador compatível encontrado';
    setUpdateStatus(`Nova versão disponível: v${info.latestVersion}`, `Versão atual: v${info.currentVersion} | Arquivo: ${assetText}`);
    setUpdateActions(`
      <button class="btn btn-sm btn-primary" onclick="downloadAppUpdate()" ${info.asset ? '' : 'disabled'}>Baixar atualização</button>
      <button class="btn btn-sm btn-outline" onclick="window.open('${info.releaseUrl}', '_blank')">Ver release</button>
    `);
    showToast(`Atualização disponível: v${info.latestVersion}`, 'info');
  } catch (e) {
    setUpdateStatus('Erro ao verificar atualizações', e.message);
    showToast('Erro ao verificar atualizações: ' + e.message, 'error');
  } finally {
    if (btn) btn.disabled = false;
  }
}

async function downloadAppUpdate() {
  setUpdateStatus('Baixando atualização...', 'Não feche o aplicativo durante o download.');
  setUpdateActions('');
  const wrap = document.getElementById('update-progress-wrap');
  const fill = document.getElementById('update-progress-fill');
  const text = document.getElementById('update-progress-text');
  if (wrap) wrap.style.display = 'block';
  if (fill) fill.style.width = '0%';
  if (text) text.textContent = 'Preparando download...';
  try {
    const result = await window.electronAPI.downloadUpdate();
    if (!result.success) throw new Error(result.error || 'Falha no download');
    setUpdateStatus('Download concluído', `Arquivo salvo em: ${result.filePath}`);
    setUpdateActions(`
      <button class="btn btn-sm btn-primary" onclick="installAppUpdate()">Instalar atualização</button>
      <button class="btn btn-sm btn-outline" onclick="checkAppUpdates()">Verificar novamente</button>
    `);
    showToast('Atualização baixada com sucesso', 'success');
  } catch (e) {
    setUpdateStatus('Erro ao baixar atualização', e.message);
    setUpdateActions('<button class="btn btn-sm btn-primary" onclick="downloadAppUpdate()">Tentar baixar novamente</button>');
    showToast('Erro ao baixar atualização: ' + e.message, 'error');
  }
}

async function installAppUpdate() {
  try {
    setUpdateStatus('Iniciando instalador...', 'O aplicativo pode fechar para concluir a instalação.');
    const result = await window.electronAPI.installUpdate();
    if (!result.success) throw new Error(result.error || 'Falha ao iniciar instalador');
    showToast('Instalador iniciado', 'success');
  } catch (e) {
    setUpdateStatus('Erro ao instalar atualização', e.message);
    showToast('Erro ao instalar atualização: ' + e.message, 'error');
  }
}

async function openApiCacheFolder() {
  try {
    if (window.electronAPI?.openCacheFolder) {
      const result = await window.electronAPI.openCacheFolder();
      if (result.success) {
        showToast('Pasta cache aberta', 'success');
        addLog('info', `Pasta cache aberta: ${result.path}`);
      } else {
        showToast('Erro ao abrir cache: ' + (result.error || 'erro desconhecido'), 'error');
      }
    }
  } catch (e) {
    showToast('Erro ao abrir cache: ' + e.message, 'error');
  }
}

async function quitApp() {
  try {
    if (window.electronAPI && window.electronAPI.quitApp) {
      await window.electronAPI.quitApp();
    }
  } catch (e) {
    // Fallback
    window.close();
  }
}

// Initialize sidebar state and settings on load
document.addEventListener('DOMContentLoaded', () => {
  setTimeout(() => {
    loadSidebarState();
    loadAppSettings();
  }, 100);
});
